import { fetchJson } from "@/lib/http";
import { env } from "@/lib/env";
import type { Adapter, AdapterContext, RawJob } from "@/pipeline/types";
import type { Source } from "@/db/schema";
import { pickArray, pickDate, pickNumber, pickString } from "./helpers";
import { stripHtml } from "@/pipeline/normalize";

const COUNTRY_PATHS: Record<string, string> = { GB: "gb", CA: "ca", SG: "sg" };

interface AdzunaConfig {
  what?: string;
  where?: string;
  market?: string;
  maxDaysOld?: number;
  resultsPerPage?: number;
  pages?: number;
}

/**
 * The only Tier 1 provider covering all three target markets. Free tier is
 * ~1,000 calls/month, so one call per saved search per cycle, pagination is
 * capped deliberately rather than walked to exhaustion.
 */
export const adzunaAdapter: Adapter = {
  provider: "adzuna",
  tier: 1,

  isConfigured() {
    return Boolean(env.adzunaAppId() && env.adzunaAppKey());
  },

  async fetchJobs(source: Source, ctx: AdapterContext): Promise<RawJob[]> {
    const config = source.config as AdzunaConfig;
    const market = (config.market ?? source.market ?? "GB").toUpperCase();
    const countryPath = COUNTRY_PATHS[market];
    if (!countryPath) throw new Error(`Adzuna does not cover market ${market}`);

    const appId = env.adzunaAppId()!;
    const appKey = env.adzunaAppKey()!;
    const perPage = Math.min(config.resultsPerPage ?? 50, 50);
    const pages = Math.min(config.pages ?? 1, 5);

    const jobs: RawJob[] = [];

    for (let page = 1; page <= pages; page++) {
      const params = new URLSearchParams({
        app_id: appId,
        app_key: appKey,
        results_per_page: String(perPage),
        "content-type": "application/json",
      });
      if (config.what) params.set("what", config.what);
      if (config.where) params.set("where", config.where);
      params.set("max_days_old", String(config.maxDaysOld ?? 30));

      const url = `https://api.adzuna.com/v1/api/jobs/${countryPath}/search/${page}?${params}`;
      const payload = await fetchJson(url, { delayMs: page > 1 ? 500 : 0 });
      const results = pickArray(payload, ["results"]);

      ctx.log(`adzuna ${market} page ${page}: ${results.length} results`);
      if (results.length === 0) break;

      for (const item of results) {
        const applyUrl = pickString(item, ["redirect_url", "url"]);
        const title = pickString(item, ["title"]);
        if (!applyUrl || !title) continue;

        jobs.push({
          providerJobId: pickString(item, ["id"]),
          url: applyUrl,
          title: stripHtml(title) ?? title,
          companyName: pickString(item, ["company.display_name", "company"]),
          locationRaw: pickString(item, ["location.display_name", "location"]),
          country: market,
          employmentType: pickString(item, ["contract_time", "contract_type"]),
          salaryMin: pickNumber(item, ["salary_min"]),
          salaryMax: pickNumber(item, ["salary_max"]),
          salaryCurrency: market === "GB" ? "GBP" : market === "CA" ? "CAD" : "SGD",
          salaryPeriod: "year",
          description: stripHtml(pickString(item, ["description"])),
          postedAt: pickDate(item, ["created"]),
          raw: item,
        });
      }

      if (results.length < perPage) break;
    }

    return jobs;
  },
};
