import { fetchJson } from "@/lib/http";
import { scrape } from "@/lib/firecrawl";
import type { Adapter, AdapterContext, RawJob } from "@/pipeline/types";
import type { Source } from "@/db/schema";
import { pickArray, pickString } from "./helpers";
import { stripHtml } from "@/pipeline/normalize";

interface WorkdayConfig {
  /** e.g. "nvidia" in nvidia.wd5.myworkdayjobs.com */
  tenant?: string;
  /** Workday's data centre varies per customer: wd1, wd3, wd5… */
  dc?: string;
  /** The career site name in the path, e.g. "NVIDIAExternalCareerSite" */
  site?: string;
  searchText?: string;
  locale?: string;
  companyName?: string;
  /** Workday hard-caps page size at 20. */
  pages?: number;
  fetchDetails?: boolean;
}

/**
 * Workday matters disproportionately for this search: chip companies, the
 * Singapore fabs, and UK aerospace and defence all sit on it, and those are
 * exactly the employers large enough to clear the visa salary thresholds.
 *
 * Two constraints shape this adapter:
 *   1. Pagination hard-caps at 20 per request, so page count is explicit.
 *   2. It sits behind Akamai bot management, which blocks datacentre IPs within
 *      minutes. So the direct JSON path only works from the local runner on a
 *      residential IP; from CI, the source should be configured with
 *      fetch_via = firecrawl_stealth, which renders the career site instead.
 */
export const workdayAdapter: Adapter = {
  provider: "workday",
  tier: 3,
  isConfigured: () => true,

  async fetchJobs(source: Source, ctx: AdapterContext): Promise<RawJob[]> {
    const config = source.config as WorkdayConfig;
    const { tenant, site } = config;
    if (!tenant || !site) {
      throw new Error(
        `Workday source "${source.label}" needs config.tenant and config.site`,
      );
    }

    const dc = config.dc ?? "wd1";
    const host = `https://${tenant}.${dc}.myworkdayjobs.com`;
    const locale = config.locale ?? "en-US";

    if (source.fetchVia === "firecrawl_stealth" || source.fetchVia === "firecrawl") {
      return scrapeViaFirecrawl(host, site, locale, config, source, ctx);
    }

    return fetchViaCxs(host, tenant, site, locale, config, ctx);
  },
};

async function fetchViaCxs(
  host: string,
  tenant: string,
  site: string,
  locale: string,
  config: WorkdayConfig,
  ctx: AdapterContext,
): Promise<RawJob[]> {
  const endpoint = `${host}/wday/cxs/${tenant}/${site}/jobs`;
  const pages = Math.min(config.pages ?? 2, 25);
  const limit = 20; // Workday's hard cap.
  const jobs: RawJob[] = [];

  for (let page = 0; page < pages; page++) {
    const payload = await fetchJson(endpoint, {
      method: "POST",
      body: {
        appliedFacets: {},
        limit,
        offset: page * limit,
        searchText: config.searchText ?? "",
      },
      delayMs: page > 0 ? 1_200 : 0,
      retries: 2,
    });

    const postings = pickArray(payload, ["jobPostings"]);
    ctx.log(`workday ${tenant} page ${page}: ${postings.length} postings`);
    if (postings.length === 0) break;

    for (const item of postings) {
      const title = pickString(item, ["title"]);
      const externalPath = pickString(item, ["externalPath"]);
      if (!title || !externalPath) continue;

      jobs.push({
        providerJobId: pickString(item, ["bulletFields.0"]) ?? externalPath,
        url: `${host}/${locale}/${site}${externalPath}`,
        title,
        companyName: config.companyName ?? tenant,
        locationRaw: pickString(item, ["locationsText"]),
        postedAt: parseWorkdayPostedOn(pickString(item, ["postedOn"])),
        raw: item,
      });
    }

    if (postings.length < limit) break;
  }

  if (config.fetchDetails) {
    for (const job of jobs) {
      try {
        const path = new URL(job.url).pathname.replace(`/${locale}/${site}`, "");
        const detail = await fetchJson(
          `${host}/wday/cxs/${tenant}/${site}/job${path}`,
          { delayMs: 800, retries: 1 },
        );
        job.description = stripHtml(
          pickString(detail, ["jobPostingInfo.jobDescription"]),
        );
      } catch (error) {
        ctx.log(`workday detail failed for ${job.url}: ${String(error)}`);
      }
    }
  }

  return jobs;
}

/**
 * Fallback for CI, where the datacentre IP would be blocked. Renders the career
 * site through Firecrawl's stealth proxy and harvests job links from the
 * markdown. Coarser than the JSON path, titles and URLs only, so the direct
 * path is preferred wherever the runner has a residential IP.
 */
async function scrapeViaFirecrawl(
  host: string,
  site: string,
  locale: string,
  config: WorkdayConfig,
  source: Source,
  ctx: AdapterContext,
): Promise<RawJob[]> {
  const listUrl = `${host}/${locale}/${site}`;
  const result = await scrape(listUrl, {
    stealth: source.fetchVia === "firecrawl_stealth",
  });
  ctx.recordCredits(result.creditsUsed);

  // Workday posting links always contain /job/ in the path.
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^)]*\/job\/[^)]+)\)/g;
  const seen = new Set<string>();
  const jobs: RawJob[] = [];

  for (const match of result.markdown.matchAll(linkPattern)) {
    const title = match[1].trim();
    const url = match[2].trim();
    if (!title || seen.has(url)) continue;
    seen.add(url);

    jobs.push({
      url,
      title,
      companyName: config.companyName,
      raw: { via: "firecrawl", listUrl },
    });
  }

  ctx.log(`workday ${site} via firecrawl: ${jobs.length} links`);
  return jobs;
}

/** Workday reports "Posted 3 Days Ago" rather than a timestamp. */
function parseWorkdayPostedOn(value?: string): Date | undefined {
  if (!value) return undefined;
  const text = value.toLowerCase();
  const now = new Date();

  if (text.includes("today")) return now;
  if (text.includes("yesterday")) return new Date(now.getTime() - 86_400_000);

  const days = text.match(/(\d+)\+?\s*day/);
  if (days) return new Date(now.getTime() - Number(days[1]) * 86_400_000);

  const months = text.match(/(\d+)\+?\s*month/);
  if (months) return new Date(now.getTime() - Number(months[1]) * 30 * 86_400_000);

  return undefined;
}
