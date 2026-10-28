import { fetchJson } from "@/lib/http";
import { env } from "@/lib/env";
import type { Adapter, AdapterContext, RawJob } from "@/pipeline/types";
import type { Source } from "@/db/schema";
import { pickArray, pickDate, pickString } from "./helpers";
import { parseSalaryText, stripHtml } from "@/pipeline/normalize";

interface JoobleConfig {
  keywords?: string;
  location?: string;
  market?: string;
  page?: number;
}

/** Jooble authenticates by putting the key in the path, and takes a POST body. */
export const joobleAdapter: Adapter = {
  provider: "jooble",
  tier: 1,

  isConfigured() {
    return Boolean(env.joobleKey());
  },

  async fetchJobs(source: Source, ctx: AdapterContext): Promise<RawJob[]> {
    const config = source.config as JoobleConfig;
    const key = env.joobleKey()!;
    const market = (config.market ?? source.market ?? "GB").toUpperCase();

    const payload = await fetchJson(`https://jooble.org/api/${key}`, {
      method: "POST",
      body: {
        keywords: config.keywords ?? "",
        location: config.location ?? "",
        page: String(config.page ?? 1),
      },
    });

    const results = pickArray(payload, ["jobs"]);
    ctx.log(`jooble ${market}: ${results.length} results`);

    const jobs: RawJob[] = [];
    for (const item of results) {
      const applyUrl = pickString(item, ["link", "url"]);
      const title = pickString(item, ["title"]);
      if (!applyUrl || !title) continue;

      const salaryText = pickString(item, ["salary"]);
      const salary = salaryText ? parseSalaryText(salaryText) : {};

      jobs.push({
        providerJobId: pickString(item, ["id"]),
        url: applyUrl,
        title,
        companyName: pickString(item, ["company"]),
        locationRaw: pickString(item, ["location"]),
        country: market,
        employmentType: pickString(item, ["type"]),
        salaryMin: salary.min,
        salaryMax: salary.max,
        salaryCurrency: salary.currency,
        salaryPeriod: salary.period,
        description: stripHtml(pickString(item, ["snippet", "description"])),
        postedAt: pickDate(item, ["updated"]),
        raw: item,
      });
    }

    return jobs;
  },
};
