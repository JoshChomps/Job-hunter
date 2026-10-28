import { map, scrape } from "@/lib/firecrawl";
import type { Adapter, AdapterContext, RawJob } from "@/pipeline/types";
import type { Source } from "@/db/schema";

interface CareerPageConfig {
  url?: string;
  companyName?: string;
  /** Restricts discovered links, e.g. "careers" or "job". */
  search?: string;
  linkPattern?: string;
  maxLinks?: number;
  stealth?: boolean;
}

const DEFAULT_LINK_PATTERN = "/(job|jobs|career|careers|vacancy|vacancies|opening)/";

/**
 * Tier 3: companies not on any major ATS.
 *
 * Uses Firecrawl `map` to discover job URLs and `scrape` to read the listing
 * page, rather than hand-written CSS selectors per company. Structuring is left
 * to Claude downstream, which avoids Firecrawl's pricier extract endpoint and
 * reuses enrichment we already pay for.
 */
export const careerPageAdapter: Adapter = {
  provider: "careerpage",
  tier: 3,
  isConfigured: () => true,

  async fetchJobs(source: Source, ctx: AdapterContext): Promise<RawJob[]> {
    const config = source.config as CareerPageConfig;
    const url = config.url;
    if (!url) {
      throw new Error(`Career page source "${source.label}" needs config.url`);
    }

    const stealth =
      config.stealth ?? source.fetchVia === "firecrawl_stealth";

    const discovered = await map(url, {
      search: config.search ?? "job",
      limit: config.maxLinks ?? 60,
    });
    ctx.recordCredits(discovered.creditsUsed);

    const pattern = new RegExp(config.linkPattern ?? DEFAULT_LINK_PATTERN, "i");
    const jobLinks = discovered.links
      .filter((link) => pattern.test(link))
      .slice(0, config.maxLinks ?? 60);

    ctx.log(
      `careerpage ${config.companyName ?? url}: ${jobLinks.length} candidate links`,
    );

    if (jobLinks.length > 0) {
      // Titles come from the link text on the listing page, which is enough to
      // pass the negative-keyword filter. Full descriptions are fetched later,
      // and only for jobs that survive it, spending a credit reading a job
      // about panel wiring is exactly what the filter exists to prevent.
      return jobLinks.map((link) => ({
        url: link,
        title: titleFromUrl(link),
        companyName: config.companyName,
        raw: { via: "firecrawl-map", listUrl: url },
      }));
    }

    // Nothing matched the link pattern, fall back to reading the page itself.
    const page = await scrape(url, { stealth });
    ctx.recordCredits(page.creditsUsed);

    const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
    const jobs: RawJob[] = [];
    const seen = new Set<string>();

    for (const match of page.markdown.matchAll(linkPattern)) {
      const title = match[1].trim();
      const link = match[2].trim();
      if (!pattern.test(link) || seen.has(link) || title.length < 4) continue;
      seen.add(link);
      jobs.push({
        url: link,
        title,
        companyName: config.companyName,
        raw: { via: "firecrawl-scrape", listUrl: url },
      });
    }

    return jobs;
  },
};

/** Last-resort title when only a URL is known; Claude replaces it on enrichment. */
function titleFromUrl(url: string): string {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1] ?? "";
    return (
      last
        .replace(/[-_]+/g, " ")
        .replace(/\b\d{4,}\b/g, "")
        .replace(/\s+/g, " ")
        .trim() || "Untitled role"
    );
  } catch {
    return "Untitled role";
  }
}
