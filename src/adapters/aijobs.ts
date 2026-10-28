import { fetchJson } from "@/lib/http";
import type { Adapter, AdapterContext, RawJob } from "@/pipeline/types";
import type { Source } from "@/db/schema";
import { pickArray, pickDate, pickNumber, pickString } from "./helpers";
import { stripHtml } from "@/pipeline/normalize";

interface AiJobsConfig {
  /** Optional client-side filter, since the endpoint takes no query params. */
  markets?: string[];
  titleMatch?: string;
}

/**
 * ai-jobs.net publishes a free JSON API of the 200 most recent AI/ML postings,
 * refreshed roughly every two hours, and explicitly permits republishing. No
 * key, no quota: the cheapest AI coverage available, so it can run daily while
 * slower sources stay weekly.
 */
export const aiJobsAdapter: Adapter = {
  provider: "ai-jobs",
  tier: 1,

  isConfigured() {
    return true;
  },

  async fetchJobs(source: Source, ctx: AdapterContext): Promise<RawJob[]> {
    const config = source.config as AiJobsConfig;
    const payload = await fetchJson("https://ai-jobs.net/api/list-jobs/");
    const results = pickArray(payload, ["jobs", "results"]);
    ctx.log(`ai-jobs: ${results.length} results`);

    const titleFilter = config.titleMatch
      ? new RegExp(config.titleMatch, "i")
      : undefined;

    const jobs: RawJob[] = [];
    for (const item of results) {
      const title = pickString(item, ["title", "job_title", "position"]);
      const applyUrl = pickString(item, [
        "url",
        "apply_url",
        "applyUrl",
        "link",
        "job_url",
      ]);
      if (!title || !applyUrl) continue;
      if (titleFilter && !titleFilter.test(title)) continue;

      const locationRaw = pickString(item, [
        "location",
        "job_location",
        "city",
        "region",
      ]);

      // The feed is global; the markets filter keeps it aligned with the rest
      // of the system rather than flooding the inbox with US roles.
      if (config.markets?.length) {
        const haystack = `${locationRaw ?? ""}`.toLowerCase();
        const matches = config.markets.some((m) => {
          const market = m.toUpperCase();
          if (market === "GB")
            return /united kingdom|uk|england|london|cambridge|bristol/.test(haystack);
          if (market === "SG") return /singapore/.test(haystack);
          if (market === "CA")
            return /canada|toronto|vancouver|montr|ottawa|waterloo/.test(haystack);
          return false;
        });
        if (!matches) continue;
      }

      jobs.push({
        providerJobId: pickString(item, ["id", "slug", "uuid"]),
        url: applyUrl,
        title,
        companyName: pickString(item, ["company", "company_name", "employer"]),
        locationRaw,
        remote: /remote/i.test(`${locationRaw ?? ""} ${title}`),
        employmentType: pickString(item, ["type", "job_type", "employment_type"]),
        salaryMin: pickNumber(item, ["salary_min", "salaryMin", "min_salary"]),
        salaryMax: pickNumber(item, ["salary_max", "salaryMax", "max_salary"]),
        salaryCurrency: pickString(item, ["salary_currency", "currency"]),
        salaryPeriod: "year",
        description: stripHtml(
          pickString(item, ["description", "job_description", "summary"]),
        ),
        postedAt: pickDate(item, ["published", "published_at", "date", "created_at"]),
        raw: item,
      });
    }

    return jobs;
  },
};
