import { fetchJson } from "./http";
import { env } from "./env";

/**
 * Firecrawl is used surgically, for exactly three things:
 *   1. Parsing pasted job links into clean markdown for Claude (the friend flow)
 *   2. Tier 3 company career pages that aren't on a major ATS
 *   3. Akamai-protected boards: Workday above all, which is where the
 *      semiconductor and defence employers live
 *
 * It is deliberately NOT used for anything with a free JSON endpoint
 * (Greenhouse, Lever, Ashby, ai-jobs.net, MyCareersFuture, Adzuna, Reed).
 * Routing those through Firecrawl would burn credits for strictly worse data,
 * so the choice is per-source config rather than a judgement call at runtime.
 */

const BASE_URL = process.env.FIRECRAWL_BASE_URL ?? "https://api.firecrawl.dev/v2";

/** Published credit costs, tracked per crawl run so overruns are visible. */
export const CREDIT_COST = {
  scrape: 1,
  scrapeStealth: 5,
  map: 1,
} as const;

export class FirecrawlNotConfigured extends Error {
  constructor() {
    super("FIRECRAWL_API_KEY is not set");
    this.name = "FirecrawlNotConfigured";
  }
}

export interface ScrapeResult {
  markdown: string;
  title?: string;
  sourceUrl?: string;
  creditsUsed: number;
}

function authHeaders(): Record<string, string> {
  const key = env.firecrawlKey();
  if (!key) throw new FirecrawlNotConfigured();
  return { Authorization: `Bearer ${key}` };
}

export function isFirecrawlConfigured(): boolean {
  return Boolean(env.firecrawlKey());
}

/**
 * Returns page content as markdown. Stealth mode costs 5 credits instead of 1
 * and is only worth spending on sites that actually block plain fetches.
 */
export async function scrape(
  url: string,
  options: { stealth?: boolean; timeoutMs?: number; onlyMainContent?: boolean } = {},
): Promise<ScrapeResult> {
  const stealth = options.stealth ?? false;

  const payload = await fetchJson<{
    success?: boolean;
    data?: {
      markdown?: string;
      metadata?: { title?: string; sourceURL?: string; statusCode?: number };
    };
    error?: string;
  }>(`${BASE_URL}/scrape`, {
    method: "POST",
    headers: authHeaders(),
    body: {
      url,
      formats: ["markdown"],
      onlyMainContent: options.onlyMainContent ?? true,
      proxy: stealth ? "stealth" : "auto",
    },
    timeoutMs: options.timeoutMs ?? 90_000,
    retries: 2,
  });

  const markdown = payload.data?.markdown;
  if (!markdown) {
    throw new Error(
      `Firecrawl returned no markdown for ${url}${payload.error ? `: ${payload.error}` : ""}`,
    );
  }

  return {
    markdown,
    title: payload.data?.metadata?.title,
    sourceUrl: payload.data?.metadata?.sourceURL ?? url,
    creditsUsed: stealth ? CREDIT_COST.scrapeStealth : CREDIT_COST.scrape,
  };
}

/** Discovers URLs across a site, used to find job links on a careers page. */
export async function map(
  url: string,
  options: { search?: string; limit?: number } = {},
): Promise<{ links: string[]; creditsUsed: number }> {
  const payload = await fetchJson<{
    success?: boolean;
    links?: Array<string | { url?: string }>;
  }>(`${BASE_URL}/map`, {
    method: "POST",
    headers: authHeaders(),
    body: {
      url,
      search: options.search,
      limit: options.limit ?? 100,
    },
    timeoutMs: 90_000,
    retries: 2,
  });

  const links = (payload.links ?? [])
    .map((entry) => (typeof entry === "string" ? entry : entry.url))
    .filter((entry): entry is string => Boolean(entry));

  return { links, creditsUsed: CREDIT_COST.map };
}
