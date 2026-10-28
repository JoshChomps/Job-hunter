import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { crawlRuns, sources, type Source } from "@/db/schema";
import { getAdapter } from "@/adapters";
import type { AdapterContext } from "./types";
import { buildIngestContext, ingestJobs, type IngestContext } from "./ingest";

export interface RunOptions {
  tier?: number;
  provider?: string;
  sourceId?: string;
  /** Ignore cadence and run everything selected. */
  force?: boolean;
  log?: (message: string) => void;
}

export interface RunResult {
  sourceId: string;
  label: string;
  provider: string;
  status: "ok" | "partial" | "failed";
  found: number;
  filtered: number;
  created: number;
  updated: number;
  creditsUsed: number;
  error?: string;
}

/**
 * Selects sources that are enabled and actually due, so a weekly source doesn't
 * re-run just because a daily one triggered the job.
 */
export async function selectDueSources(options: RunOptions): Promise<Source[]> {
  const filters = [eq(sources.enabled, true)];

  if (options.sourceId) filters.push(eq(sources.id, options.sourceId));
  if (options.provider) filters.push(eq(sources.provider, options.provider));
  if (options.tier != null) filters.push(eq(sources.tier, options.tier));

  const rows = await db
    .select()
    .from(sources)
    .where(
      options.force
        ? and(...filters)
        : and(
            ...filters,
            or(
              isNull(sources.lastRunAt),
              lte(
                sources.lastRunAt,
                sql`now() - (${sources.cadenceDays} || ' days')::interval`,
              ),
            ),
          ),
    );

  return rows;
}

export async function runSource(
  source: Source,
  ingestCtx: IngestContext,
  log: (message: string) => void = () => {},
): Promise<RunResult> {
  const [run] = await db
    .insert(crawlRuns)
    .values({ sourceId: source.id, provider: source.provider, status: "running" })
    .returning({ id: crawlRuns.id });

  let creditsUsed = 0;
  const errors: string[] = [];

  const adapterCtx: AdapterContext = {
    recordCredits: (n) => {
      creditsUsed += n;
    },
    log: (message) => log(`  ${message}`),
  };

  try {
    const adapter = getAdapter(source.provider);

    if (!adapter.isConfigured()) {
      throw new Error(
        `${source.provider} is missing credentials, set its API key or disable the source`,
      );
    }

    const rawJobs = await adapter.fetchJobs(source, adapterCtx);
    const stats = await ingestJobs(rawJobs, source, ingestCtx);

    const status = errors.length > 0 ? "partial" : "ok";

    await db
      .update(crawlRuns)
      .set({
        finishedAt: new Date(),
        status,
        found: stats.found,
        filtered: stats.filtered,
        created: stats.created,
        updated: stats.updated,
        creditsUsed,
        errors: errors.length ? errors : null,
      })
      .where(eq(crawlRuns.id, run.id));

    await db
      .update(sources)
      .set({ lastRunAt: new Date(), lastStatus: status, lastError: null })
      .where(eq(sources.id, source.id));

    log(
      `${source.label}: ${stats.created} new, ${stats.updated} seen again, ${stats.filtered} filtered${
        creditsUsed ? `, ${creditsUsed} credits` : ""
      }`,
    );

    return {
      sourceId: source.id,
      label: source.label,
      provider: source.provider,
      status,
      ...stats,
      creditsUsed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await db
      .update(crawlRuns)
      .set({
        finishedAt: new Date(),
        status: "failed",
        creditsUsed,
        errors: [message],
      })
      .where(eq(crawlRuns.id, run.id));

    await db
      .update(sources)
      .set({ lastRunAt: new Date(), lastStatus: "failed", lastError: message })
      .where(eq(sources.id, source.id));

    log(`${source.label}: FAILED: ${message}`);

    return {
      sourceId: source.id,
      label: source.label,
      provider: source.provider,
      status: "failed",
      found: 0,
      filtered: 0,
      created: 0,
      updated: 0,
      creditsUsed,
      error: message,
    };
  }
}

/**
 * A broken source degrades to a warning rather than failing the whole run
 * Tier 3 and 4 scrapers break by nature, and one dead selector must not stop
 * the Tier 1 and 2 sources that carry most of the coverage.
 */
export async function runCrawl(options: RunOptions = {}): Promise<RunResult[]> {
  const log = options.log ?? console.log;
  const dueSources = await selectDueSources(options);

  if (dueSources.length === 0) {
    log("No sources due.");
    return [];
  }

  log(`Running ${dueSources.length} source(s)...`);
  const ingestCtx = await buildIngestContext(log);
  const results: RunResult[] = [];

  for (const source of dueSources) {
    results.push(await runSource(source, ingestCtx, log));
  }

  const totals = results.reduce(
    (acc, r) => ({
      created: acc.created + r.created,
      updated: acc.updated + r.updated,
      filtered: acc.filtered + r.filtered,
      credits: acc.credits + r.creditsUsed,
      failed: acc.failed + (r.status === "failed" ? 1 : 0),
    }),
    { created: 0, updated: 0, filtered: 0, credits: 0, failed: 0 },
  );

  log(
    `\nDone. ${totals.created} new jobs, ${totals.updated} seen again, ` +
      `${totals.filtered} filtered, ${totals.credits} Firecrawl credits, ` +
      `${totals.failed} source(s) failed.`,
  );

  return results;
}
