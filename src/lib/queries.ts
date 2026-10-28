import { and, asc, desc, eq, gte, ilike, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { companies, enrichments, jobs, jobSightings, crawlRuns, sources } from "@/db/schema";

export interface JobFilters {
  stage?: string;
  starred?: boolean;
  country?: string;
  discipline?: string;
  hardwareAi?: boolean;
  gradScheme?: boolean;
  q?: string;
  /** Infeasible roles are hidden by default but never deleted. */
  showInfeasible?: boolean;
  minFit?: number;
  sort?: "newest" | "fit" | "salary" | "title";
  limit?: number;
  offset?: number;
}

export type JobListItem = Awaited<ReturnType<typeof listJobs>>["jobs"][number];

function buildWhere(filters: JobFilters): SQL | undefined {
  const clauses: SQL[] = [];

  // Duplicates collapse into their primary row, so the inbox shows one card per
  // role rather than the same job from four boards.
  clauses.push(isNull(jobs.duplicateOf));

  if (filters.stage) {
    clauses.push(eq(jobs.stage, filters.stage as never));
  } else {
    clauses.push(ne(jobs.stage, "archived"));
  }

  if (filters.starred) clauses.push(eq(jobs.isStarred, true));
  if (filters.country) clauses.push(eq(jobs.country, filters.country));
  if (filters.discipline) clauses.push(eq(jobs.discipline, filters.discipline as never));
  if (filters.hardwareAi) clauses.push(eq(jobs.isHardwareAi, true));
  if (filters.gradScheme) clauses.push(eq(jobs.isGradScheme, true));

  if (filters.q) {
    const pattern = `%${filters.q}%`;
    const search = or(
      ilike(jobs.title, pattern),
      ilike(jobs.companyNameRaw, pattern),
      ilike(jobs.locationRaw, pattern),
    );
    if (search) clauses.push(search);
  }

  if (filters.minFit != null) {
    clauses.push(gte(enrichments.fitScore, filters.minFit));
  }

  // A job that cannot be sponsored is hidden, not deleted, one click reveals
  // it, so a bad sponsor-name match costs a click rather than an opportunity.
  if (!filters.showInfeasible) {
    const feasible = and(
      ne(jobs.visaFeasibleUk, "no"),
      ne(jobs.visaFeasibleSg, "no"),
    );
    if (feasible) clauses.push(feasible);
  }

  return clauses.length > 0 ? and(...clauses) : undefined;
}

export async function listJobs(filters: JobFilters = {}) {
  const limit = Math.min(filters.limit ?? 100, 300);

  const orderBy = (() => {
    switch (filters.sort) {
      case "fit":
        return [desc(sql`coalesce(${enrichments.fitScore}, -1)`), desc(jobs.firstSeenAt)];
      case "salary":
        return [desc(sql`coalesce(${jobs.salaryMax}, ${jobs.salaryMin}, 0)`)];
      case "title":
        return [asc(jobs.title)];
      default:
        return [desc(jobs.firstSeenAt)];
    }
  })();

  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      url: jobs.url,
      companyName: sql<string | null>`coalesce(${companies.name}, ${jobs.companyNameRaw})`,
      companyId: jobs.companyId,
      locationRaw: jobs.locationRaw,
      country: jobs.country,
      remoteType: jobs.remoteType,
      seniority: jobs.seniority,
      isGradScheme: jobs.isGradScheme,
      discipline: jobs.discipline,
      subDiscipline: jobs.subDiscipline,
      isHardwareAi: jobs.isHardwareAi,
      salaryMin: jobs.salaryMin,
      salaryMax: jobs.salaryMax,
      salaryCurrency: jobs.salaryCurrency,
      salaryPeriod: jobs.salaryPeriod,
      visaFeasibleUk: jobs.visaFeasibleUk,
      visaFeasibleSg: jobs.visaFeasibleSg,
      visaReason: jobs.visaReason,
      summary: jobs.descriptionSummary,
      postedAt: jobs.postedAt,
      firstSeenAt: jobs.firstSeenAt,
      stage: jobs.stage,
      isStarred: jobs.isStarred,
      fitScore: enrichments.fitScore,
      reasons: enrichments.reasons,
      ukSponsorLicence: companies.ukSponsorLicence,
      sightings: sql<number>`(
        select count(*) from ${jobSightings} where ${jobSightings.jobId} = ${jobs.id}
      )`,
    })
    .from(jobs)
    .leftJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(enrichments, eq(enrichments.jobId, jobs.id))
    .where(buildWhere(filters))
    .orderBy(...orderBy)
    .limit(limit)
    .offset(filters.offset ?? 0);

  return { jobs: rows };
}

export async function getJob(id: string) {
  const rows = await db
    .select({
      job: jobs,
      company: companies,
      enrichment: enrichments,
    })
    .from(jobs)
    .leftJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(enrichments, eq(enrichments.jobId, jobs.id))
    .where(eq(jobs.id, id))
    .limit(1);

  if (rows.length === 0) return undefined;

  const sightings = await db
    .select()
    .from(jobSightings)
    .where(eq(jobSightings.jobId, id));

  // Other boards carrying the same role, collapsed at ingest time.
  const duplicates = await db
    .select({ id: jobs.id, url: jobs.url, title: jobs.title })
    .from(jobs)
    .where(eq(jobs.duplicateOf, id));

  return { ...rows[0], sightings, duplicates };
}

export async function boardCounts() {
  const rows = await db
    .select({ stage: jobs.stage, count: sql<number>`count(*)::int` })
    .from(jobs)
    .where(isNull(jobs.duplicateOf))
    .groupBy(jobs.stage);

  return Object.fromEntries(rows.map((r) => [r.stage, r.count])) as Record<
    string,
    number
  >;
}

export async function dashboardStats() {
  const [totals] = await db
    .select({
      total: sql<number>`count(*)::int`,
      starred: sql<number>`count(*) filter (where ${jobs.isStarred})::int`,
      hiddenUk: sql<number>`count(*) filter (where ${jobs.visaFeasibleUk} = 'no')::int`,
      hiddenSg: sql<number>`count(*) filter (where ${jobs.visaFeasibleSg} = 'no')::int`,
      atRisk: sql<number>`count(*) filter (where ${jobs.visaFeasibleSg} = 'threshold_risk')::int`,
    })
    .from(jobs)
    .where(isNull(jobs.duplicateOf));

  return totals;
}

export async function listSources() {
  return db
    .select({
      id: sources.id,
      label: sources.label,
      provider: sources.provider,
      tier: sources.tier,
      kind: sources.kind,
      market: sources.market,
      enabled: sources.enabled,
      cadenceDays: sources.cadenceDays,
      fetchVia: sources.fetchVia,
      lastRunAt: sources.lastRunAt,
      lastStatus: sources.lastStatus,
      lastError: sources.lastError,
    })
    .from(sources)
    .orderBy(asc(sources.tier), asc(sources.provider), asc(sources.label));
}

export async function recentCrawlRuns(limit = 30) {
  return db
    .select({
      id: crawlRuns.id,
      provider: crawlRuns.provider,
      startedAt: crawlRuns.startedAt,
      finishedAt: crawlRuns.finishedAt,
      status: crawlRuns.status,
      found: crawlRuns.found,
      filtered: crawlRuns.filtered,
      created: crawlRuns.created,
      updated: crawlRuns.updated,
      creditsUsed: crawlRuns.creditsUsed,
      errors: crawlRuns.errors,
      label: sources.label,
    })
    .from(crawlRuns)
    .leftJoin(sources, eq(sources.id, crawlRuns.sourceId))
    .orderBy(desc(crawlRuns.startedAt))
    .limit(limit);
}
