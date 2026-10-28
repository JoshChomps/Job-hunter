import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  companies,
  filterKeywords,
  jobs,
  jobSightings,
  ukSponsors,
  visaThresholds,
  type Source,
} from "@/db/schema";
import type { RawJob } from "./types";
import {
  buildDedupeKey,
  canonicaliseUrl,
  capDescription,
  hashUrl,
  inferCountry,
  inferRemoteType,
  normaliseCity,
  normaliseCompany,
  slugify,
} from "./normalize";
import {
  applyNegativeKeywords,
  classifyDiscipline,
  DEFAULT_NEGATIVE_KEYWORDS,
  inferSeniority,
} from "./filter";
import { assessVisa, matchSponsor, type ThresholdRow } from "./visa";

export interface IngestStats {
  found: number;
  filtered: number;
  created: number;
  updated: number;
}

export interface IngestContext {
  negativeKeywords: string[];
  thresholds: ThresholdRow[];
  log: (message: string) => void;
}

/** Loaded once per run rather than per job, both tables are tiny and static. */
export async function buildIngestContext(
  log: (message: string) => void = () => {},
): Promise<IngestContext> {
  const [keywordRows, thresholdRows] = await Promise.all([
    db
      .select()
      .from(filterKeywords)
      .where(and(eq(filterKeywords.enabled, true), eq(filterKeywords.kind, "negative"))),
    db.select().from(visaThresholds),
  ]);

  return {
    negativeKeywords: keywordRows.length
      ? keywordRows.map((row) => row.keyword)
      : DEFAULT_NEGATIVE_KEYWORDS,
    thresholds: thresholdRows.map((row) => ({
      market: row.market,
      variant: row.variant,
      effectiveFrom: row.effectiveFrom,
      minSalary: row.minSalary,
      currency: row.currency,
      period: row.period,
    })),
    log,
  };
}

/**
 * Resolves a company by slug, creating it if new, and attaches its UK sponsor
 * licence status from the imported register.
 */
export async function resolveCompany(
  name: string | undefined,
  website?: string,
): Promise<string | undefined> {
  if (!name?.trim()) return undefined;

  const slug = slugify(name);
  if (!slug) return undefined;

  const existing = await db
    .select()
    .from(companies)
    .where(eq(companies.slug, slug))
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  const sponsor = await lookupSponsor(name);

  const inserted = await db
    .insert(companies)
    .values({
      name: name.trim(),
      slug,
      website,
      ukSponsorLicence: sponsor ? true : undefined,
      ukSponsorRating: sponsor?.rating ?? undefined,
      ukSponsorRoutes: sponsor?.routes ?? undefined,
      ukSponsorMatchedName: sponsor?.name ?? undefined,
    })
    .onConflictDoNothing({ target: companies.slug })
    .returning({ id: companies.id });

  if (inserted.length > 0) return inserted[0].id;

  const raced = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.slug, slug))
    .limit(1);
  return raced[0]?.id;
}

/**
 * Candidate-narrowed lookup against the sponsor register. Matching a brand to a
 * legal entity is fuzzy, so an ambiguous result deliberately yields no match
 * leaving the job `unknown` rather than wrongly cleared or wrongly hidden.
 */
async function lookupSponsor(companyName: string) {
  const normalised = normaliseCompany(companyName);
  if (!normalised) return undefined;

  const candidates = await db
    .select()
    .from(ukSponsors)
    .where(eq(ukSponsors.normalisedName, normalised))
    .limit(5);

  const match = matchSponsor(
    companyName,
    candidates.map((row) => ({
      name: row.name,
      normalisedName: row.normalisedName,
      rating: row.rating,
      routes: row.routes,
    })),
  );
  return match;
}

interface CompanyVisaFacts {
  ukSponsorLicence: boolean | null;
}

async function loadCompanyFacts(
  companyId: string | undefined,
): Promise<CompanyVisaFacts> {
  if (!companyId) return { ukSponsorLicence: null };
  const rows = await db
    .select({
      licence: companies.ukSponsorLicence,
      override: companies.ukSponsorOverride,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  const row = rows[0];
  if (!row) return { ukSponsorLicence: null };
  // A manual override always wins over the register match.
  if (row.override != null) return { ukSponsorLicence: row.override };
  return { ukSponsorLicence: row.licence ?? null };
}

/**
 * The single write path for jobs, used by both the crawler and the submit form
 * so a hand-pasted link goes through exactly the same filtering, dedupe and
 * visa gate as a crawled one.
 */
export async function ingestJobs(
  rawJobs: RawJob[],
  source: Source | undefined,
  ctx: IngestContext,
): Promise<IngestStats> {
  const stats: IngestStats = {
    found: rawJobs.length,
    filtered: 0,
    created: 0,
    updated: 0,
  };

  for (const raw of rawJobs) {
    try {
      const result = await ingestOne(raw, source, ctx);
      if (result === "filtered") stats.filtered++;
      else if (result === "created") stats.created++;
      else stats.updated++;
    } catch (error) {
      ctx.log(`ingest failed for ${raw.url}: ${String(error)}`);
    }
  }

  return stats;
}

export type IngestOutcome = "created" | "updated" | "filtered";

export async function ingestOne(
  raw: RawJob,
  source: Source | undefined,
  ctx: IngestContext,
): Promise<IngestOutcome> {
  // Filter before anything is stored or any credit is spent on a detail page.
  const decision = applyNegativeKeywords(raw.title, ctx.negativeKeywords);
  if (decision.rejected) {
    ctx.log(`filtered "${raw.title}", ${decision.reason}`);
    return "filtered";
  }

  const canonicalUrl = canonicaliseUrl(raw.url);
  const urlHash = hashUrl(canonicalUrl);

  const existingByUrl = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.urlHash, urlHash))
    .limit(1);

  if (existingByUrl.length > 0) {
    await db
      .update(jobs)
      .set({ lastSeenAt: new Date(), isOpen: true })
      .where(eq(jobs.id, existingByUrl[0].id));
    await recordSighting(existingByUrl[0].id, source, raw.url);
    return "updated";
  }

  const companyId = await resolveCompany(raw.companyName, raw.companyWebsite);
  const description = capDescription(raw.description);
  const country = inferCountry(raw.locationRaw, raw.country);
  const city = normaliseCity(raw.locationRaw) || undefined;

  const { discipline, subDiscipline, isHardwareAi } = classifyDiscipline(
    raw.title,
    description,
  );
  const { seniority, isGradScheme } = inferSeniority(raw.title, description);

  const facts = await loadCompanyFacts(companyId);
  const visa = assessVisa(
    {
      country,
      salary: {
        min: raw.salaryMin,
        max: raw.salaryMax,
        currency: raw.salaryCurrency,
        period: raw.salaryPeriod,
      },
      ukSponsorLicence: facts.ukSponsorLicence,
    },
    ctx.thresholds,
  );

  const dedupeKey = buildDedupeKey(raw.companyName, raw.title, raw.locationRaw);

  // The same role legitimately appears on several boards. Link rather than
  // insert a second card, so the inbox shows one job with many apply links.
  const existingByFingerprint = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.dedupeKey, dedupeKey))
    .limit(1);

  const inserted = await db
    .insert(jobs)
    .values({
      sourceId: source?.id,
      providerJobId: raw.providerJobId,
      url: raw.url,
      canonicalUrl,
      urlHash,
      title: raw.title.trim(),
      companyId,
      companyNameRaw: raw.companyName,
      locationRaw: raw.locationRaw,
      city,
      country,
      remoteType: inferRemoteType(raw),
      employmentType: raw.employmentType,
      seniority,
      isGradScheme,
      discipline,
      subDiscipline,
      isHardwareAi,
      salaryMin: raw.salaryMin,
      salaryMax: raw.salaryMax,
      salaryCurrency: raw.salaryCurrency,
      salaryPeriod: raw.salaryPeriod,
      visaFeasibleUk: visa.uk,
      visaFeasibleSg: visa.sg,
      visaReason: visa.reason,
      descriptionRaw: description,
      postedAt: raw.postedAt,
      closesAt: raw.closesAt,
      dedupeKey,
      duplicateOf: existingByFingerprint[0]?.id,
      raw: raw.raw as never,
    })
    .onConflictDoNothing({ target: jobs.urlHash })
    .returning({ id: jobs.id });

  if (inserted.length === 0) return "updated";

  await recordSighting(inserted[0].id, source, raw.url);
  return "created";
}

async function recordSighting(
  jobId: string,
  source: Source | undefined,
  url: string,
): Promise<void> {
  await db
    .insert(jobSightings)
    .values({
      jobId,
      sourceId: source?.id,
      provider: source?.provider ?? "manual",
      url,
    })
    .onConflictDoNothing();
}

/**
 * Re-resolves sponsor licences for every company after a register import.
 * Runs as a batch because the register replaces wholesale each month.
 */
export async function refreshSponsorMatches(
  log: (message: string) => void = () => {},
): Promise<{ matched: number; total: number }> {
  const allCompanies = await db.select().from(companies);
  let matched = 0;

  for (const company of allCompanies) {
    if (company.ukSponsorOverride != null) continue;

    const sponsor = await lookupSponsor(company.name);
    await db
      .update(companies)
      .set({
        ukSponsorLicence: Boolean(sponsor),
        ukSponsorRating: sponsor?.rating ?? null,
        ukSponsorRoutes: sponsor?.routes ?? null,
        ukSponsorMatchedName: sponsor?.name ?? null,
      })
      .where(eq(companies.id, company.id));

    if (sponsor) matched++;
  }

  log(`sponsor matching: ${matched}/${allCompanies.length} companies matched`);
  return { matched, total: allCompanies.length };
}

/**
 * Recomputes the visa gate for UK jobs after a sponsor import, so a newly
 * licensed employer stops being hidden without waiting for a re-crawl.
 */
export async function recomputeUkVisaGate(
  ctx: IngestContext,
): Promise<number> {
  const ukJobs = await db
    .select()
    .from(jobs)
    .where(inArray(jobs.country, ["GB", "UK"]));

  let changed = 0;
  for (const job of ukJobs) {
    const facts = await loadCompanyFacts(job.companyId ?? undefined);
    const visa = assessVisa(
      {
        country: job.country,
        salary: {
          min: job.salaryMin,
          max: job.salaryMax,
          currency: job.salaryCurrency,
          period: job.salaryPeriod,
        },
        ukSponsorLicence: facts.ukSponsorLicence,
      },
      ctx.thresholds,
    );

    if (visa.uk !== job.visaFeasibleUk) {
      await db
        .update(jobs)
        .set({ visaFeasibleUk: visa.uk, visaReason: visa.reason })
        .where(eq(jobs.id, job.id));
      changed++;
    }
  }

  ctx.log(`visa gate recomputed: ${changed} UK jobs changed`);
  return changed;
}
