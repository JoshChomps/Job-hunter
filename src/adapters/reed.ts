import { fetchJson } from "@/lib/http";
import { env } from "@/lib/env";
import type { Adapter, AdapterContext, RawJob } from "@/pipeline/types";
import type { Source } from "@/db/schema";
import { pickArray, pickDate, pickNumber, pickString } from "./helpers";
import { stripHtml } from "@/pipeline/normalize";

interface ReedConfig {
  keywords?: string;
  locationName?: string;
  distanceFromLocation?: number;
  minimumSalary?: number;
  resultsToTake?: number;
  postedByDirectEmployer?: boolean;
}

/**
 * The UK's largest board and the strongest single UK source. Auth is HTTP Basic
 * with the API key as the username and an empty password.
 */
export const reedAdapter: Adapter = {
  provider: "reed",
  tier: 1,

  isConfigured() {
    return Boolean(env.reedKey());
  },

  async fetchJobs(source: Source, ctx: AdapterContext): Promise<RawJob[]> {
    const config = source.config as ReedConfig;
    const key = env.reedKey()!;
    const auth = Buffer.from(`${key}:`).toString("base64");

    const params = new URLSearchParams({
      resultsToTake: String(Math.min(config.resultsToTake ?? 100, 100)),
    });
    if (config.keywords) params.set("keywords", config.keywords);
    if (config.locationName) params.set("locationName", config.locationName);
    if (config.distanceFromLocation)
      params.set("distanceFromLocation", String(config.distanceFromLocation));
    if (config.minimumSalary)
      params.set("minimumSalary", String(config.minimumSalary));

    const url = `https://www.reed.co.uk/api/1.0/search?${params}`;
    const payload = await fetchJson(url, {
      headers: { Authorization: `Basic ${auth}` },
    });

    const results = pickArray(payload, ["results"]);
    ctx.log(`reed: ${results.length} results`);

    const jobs: RawJob[] = [];
    for (const item of results) {
      const applyUrl = pickString(item, ["jobUrl", "url"]);
      const title = pickString(item, ["jobTitle", "title"]);
      if (!applyUrl || !title) continue;

      jobs.push({
        providerJobId: pickString(item, ["jobId", "id"]),
        url: applyUrl,
        title,
        companyName: pickString(item, ["employerName", "employer"]),
        locationRaw: pickString(item, ["locationName", "location"]),
        country: "GB",
        salaryMin: pickNumber(item, ["minimumSalary"]),
        salaryMax: pickNumber(item, ["maximumSalary"]),
        salaryCurrency: pickString(item, ["currency"]) ?? "GBP",
        salaryPeriod: "year",
        employmentType: pickString(item, ["contractType"]),
        description: stripHtml(pickString(item, ["jobDescription", "description"])),
        postedAt: pickDate(item, ["date", "datePosted"]),
        closesAt: pickDate(item, ["expirationDate"]),
        raw: item,
      });
    }

    return jobs;
  },
};
