import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, enrichments, jobs, jobTags } from "@/db/schema";
import {
  activeModelId,
  assessJob,
  classifyJob,
  contentHash,
  describeProviders,
  isEnrichmentConfigured,
  parseJobPage,
} from "@/lib/llm";
import { assessVisa, type ThresholdRow } from "./visa";
import { inferCountry, normaliseCity } from "./normalize";
import { resolveCompany } from "./ingest";

const DEFAULT_PROFILE = `
Early-career engineer with an electrical engineering background, targeting both
electrical/hardware and AI roles, with particular interest in where they overlap
(AI accelerators, edge ML, ML compilers, silicon for AI).

Markets: Canada (no sponsorship needed), Singapore and the UK (both need
sponsorship).

Judge on capability, not years of experience.
`.trim();

let cachedProfile: string | undefined;

/**
 * The candidate profile drives fit scoring. Kept as an editable file rather
 * than a constant so it can be tuned without a redeploy.
 */
export async function loadProfile(): Promise<string> {
  if (cachedProfile) return cachedProfile;
  try {
    const file = path.join(process.cwd(), "config", "profile.md");
    cachedProfile = (await readFile(file, "utf8")).trim() || DEFAULT_PROFILE;
  } catch {
    cachedProfile = DEFAULT_PROFILE;
  }
  return cachedProfile;
}

export interface EnrichStats {
  considered: number;
  enriched: number;
  skipped: number;
  failed: number;
}

/**
 * Enriches jobs that have never been assessed, or whose content changed since
 * they were. Keyed by content hash, so re-crawling an unchanged posting costs
 * nothing: which matters more with a local model, where the cost is minutes
 * rather than cents.
 *
 * Runs as two calls per job: `classify` (discipline, seniority, tags,
 * description) and `assess` (sponsorship, fit). Under LLM_PROVIDER=hybrid those
 * go to different models: see src/lib/llm/index.ts.
 */
export async function enrichPendingJobs(options: {
  limit?: number;
  thresholds?: ThresholdRow[];
  log?: (message: string) => void;
}): Promise<EnrichStats> {
  const log = options.log ?? (() => {});
  const stats: EnrichStats = { considered: 0, enriched: 0, skipped: 0, failed: 0 };

  if (!isEnrichmentConfigured()) {
    log("No LLM configured: skipping enrichment.");
    log("  Set ANTHROPIC_API_KEY, or LLM_PROVIDER=ollama with Ollama running.");
    return stats;
  }

  log(`Enrichment provider: ${describeProviders()}`);

  const profile = await loadProfile();
  const limit = options.limit ?? 50;

  const pending = await db
    .select({
      id: jobs.id,
      url: jobs.url,
      title: jobs.title,
      companyName: jobs.companyNameRaw,
      companyId: jobs.companyId,
      locationRaw: jobs.locationRaw,
      description: jobs.descriptionRaw,
      country: jobs.country,
      salaryMin: jobs.salaryMin,
      salaryMax: jobs.salaryMax,
      salaryCurrency: jobs.salaryCurrency,
      salaryPeriod: jobs.salaryPeriod,
      existingHash: enrichments.contentHash,
    })
    .from(jobs)
    .leftJoin(enrichments, eq(enrichments.jobId, jobs.id))
    .where(and(eq(jobs.isOpen, true), isNull(jobs.duplicateOf)))
    .orderBy(sql`${jobs.firstSeenAt} desc`)
    .limit(limit * 2);

  for (const job of pending) {
    if (stats.enriched >= limit) break;
    stats.considered++;

    const hash = contentHash(job.title, job.companyName, job.description);
    if (job.existingHash === hash) {
      stats.skipped++;
      continue;
    }

    // Mutable so a backfill below can correct them before they're used.
    let title = job.title;
    let companyName = job.companyName;
    let companyId = job.companyId;
    let locationRaw = job.locationRaw;
    let country = job.country;
    let salaryMin = job.salaryMin;
    let salaryMax = job.salaryMax;
    let salaryCurrency = job.salaryCurrency;
    let salaryPeriod = job.salaryPeriod;

    try {
      /*
       * Backfill for links captured while no LLM was reachable, the common
       * case when the app is deployed without an API key and enrichment runs
       * later on a local model. Those rows hold the page text but have a title
       * guessed from the URL and no company, so re-read the stored text and
       * correct them before classifying.
       */
      if (!companyName && job.description && job.description.length > 200) {
        try {
          const parsed = await parseJobPage(job.description, job.url);
          if (parsed.isJobPosting) {
            title = parsed.title?.trim() || title;
            companyName = parsed.companyName?.trim() || companyName;
            locationRaw = parsed.locationRaw?.trim() || locationRaw;
            country = inferCountry(locationRaw, parsed.country ?? country) ?? country;
            salaryMin = parsed.salaryMin ?? salaryMin;
            salaryMax = parsed.salaryMax ?? salaryMax;
            salaryCurrency = parsed.salaryCurrency ?? salaryCurrency;
            salaryPeriod = parsed.salaryPeriod ?? salaryPeriod;

            if (companyName && !companyId) {
              companyId = (await resolveCompany(companyName)) ?? null;
            }

            await db
              .update(jobs)
              .set({
                title,
                companyNameRaw: companyName,
                companyId,
                locationRaw,
                city: normaliseCity(locationRaw) || null,
                country,
                salaryMin,
                salaryMax,
                salaryCurrency,
                salaryPeriod,
              })
              .where(eq(jobs.id, job.id));

            log(`backfilled "${title}"${companyName ? ` at ${companyName}` : ""}`);
          }
        } catch (error) {
          // A failed backfill must not stop the job being classified.
          log(`backfill failed for ${job.url}: ${String(error)}`);
        }
      }

      const input = {
        title,
        companyName,
        locationRaw,
        description: job.description,
      };

      // Sequential rather than parallel: with a local model these share one
      // GPU, and overlapping requests just thrash memory.
      const classification = await classifyJob(input);
      const assessment = await assessJob(input, profile);

      await db
        .insert(enrichments)
        .values({
          jobId: job.id,
          model: activeModelId(),
          contentHash: hash,
          fitScore: Math.round(assessment.fitScore),
          reasons: assessment.reasons,
          sponsorshipSignal: assessment.sponsorshipSignal,
          sponsorshipStatement: assessment.sponsorshipStatement,
          techStack: classification.techStack,
        })
        .onConflictDoUpdate({
          target: enrichments.jobId,
          set: {
            model: activeModelId(),
            contentHash: hash,
            fitScore: Math.round(assessment.fitScore),
            reasons: assessment.reasons,
            sponsorshipSignal: assessment.sponsorshipSignal,
            sponsorshipStatement: assessment.sponsorshipStatement,
            techStack: classification.techStack,
            createdAt: new Date(),
          },
        });

      // The model's read of the posting beats the keyword heuristics, so its
      // classification overwrites the cheap pass done at ingest time.
      const licence = companyId
        ? (
            await db
              .select({
                licence: companies.ukSponsorLicence,
                override: companies.ukSponsorOverride,
              })
              .from(companies)
              .where(eq(companies.id, companyId))
              .limit(1)
          )[0]
        : undefined;

      // Uses the backfilled salary and country, so a link captured without a
      // salary gets gated correctly once the figures are recovered.
      const visa = assessVisa(
        {
          country,
          salary: {
            min: salaryMin,
            max: salaryMax,
            currency: salaryCurrency,
            period: salaryPeriod,
          },
          ukSponsorLicence: licence?.override ?? licence?.licence ?? null,
          sponsorshipSignal: assessment.sponsorshipSignal,
        },
        options.thresholds,
      );

      await db
        .update(jobs)
        .set({
          discipline: classification.discipline,
          subDiscipline: classification.subDiscipline,
          isHardwareAi: classification.isHardwareAi,
          seniority: classification.seniority,
          isGradScheme: classification.isGradScheme,
          descriptionSummary: classification.summary || null,
          visaFeasibleUk: visa.uk,
          visaFeasibleSg: visa.sg,
          visaReason: visa.reason,
        })
        .where(eq(jobs.id, job.id));

      if (classification.techStack.length > 0) {
        await db
          .insert(jobTags)
          .values(
            classification.techStack.slice(0, 20).map((tag) => ({
              jobId: job.id,
              tag: tag.toLowerCase().slice(0, 40),
            })),
          )
          .onConflictDoNothing();
      }

      stats.enriched++;
      log(
        `enriched "${title}": ${classification.discipline}` +
          `${classification.isHardwareAi ? "/hardware×AI" : ""}, fit ${Math.round(assessment.fitScore)}`,
      );
    } catch (error) {
      stats.failed++;
      log(`enrichment failed for "${title}": ${String(error)}`);
    }
  }

  return stats;
}
