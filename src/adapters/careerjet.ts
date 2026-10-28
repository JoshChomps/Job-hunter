import { fetchJson } from "@/lib/http";
import { env } from "@/lib/env";
import type { Adapter, AdapterContext, RawJob } from "@/pipeline/types";
import type { Source } from "@/db/schema";
import { pickArray, pickDate, pickString } from "./helpers";
import { parseSalaryText, stripHtml } from "@/pipeline/normalize";

interface CareerjetConfig {
  keywords?: string;
  location?: string;
  market?: string;
  locale?: string;
  pagesize?: number;
}

const LOCALES: Record<string, string> = {
  GB: "en_GB",
  CA: "en_CA",
  SG: "en_SG",
};

/**
 * Careerjet requires the caller to forward an end-user IP and user agent. This
 * runs server-side on a schedule rather than per-visitor, so it sends the
 * crawler's own identity rather than inventing a fake one.
 */
export const careerjetAdapter: Adapter = {
  provider: "careerjet",
  tier: 1,

  isConfigured() {
    return Boolean(env.careerjetAffid());
  },

  async fetchJobs(source: Source, ctx: AdapterContext): Promise<RawJob[]> {
    const config = source.config as CareerjetConfig;
    const market = (config.market ?? source.market ?? "GB").toUpperCase();

    const params = new URLSearchParams({
      affid: env.careerjetAffid()!,
      locale_code: config.locale ?? LOCALES[market] ?? "en_GB",
      pagesize: String(Math.min(config.pagesize ?? 50, 99)),
      user_ip: "127.0.0.1",
      user_agent: "job-hunter/0.1",
      url: env.appUrl(),
      contenttype: "application/json",
    });
    if (config.keywords) params.set("keywords", config.keywords);
    if (config.location) params.set("location", config.location);

    const payload = await fetchJson(
      `https://public.api.careerjet.net/search?${params}`,
    );

    const results = pickArray(payload, ["jobs"]);
    ctx.log(`careerjet ${market}: ${results.length} results`);

    const jobs: RawJob[] = [];
    for (const item of results) {
      const applyUrl = pickString(item, ["url"]);
      const title = pickString(item, ["title"]);
      if (!applyUrl || !title) continue;

      const salaryText = pickString(item, ["salary"]);
      const salary = salaryText ? parseSalaryText(salaryText) : {};

      jobs.push({
        url: applyUrl,
        title,
        companyName: pickString(item, ["company"]),
        locationRaw: pickString(item, ["locations", "location"]),
        country: market,
        salaryMin: salary.min,
        salaryMax: salary.max,
        salaryCurrency: salary.currency,
        salaryPeriod: salary.period,
        description: stripHtml(pickString(item, ["description"])),
        postedAt: pickDate(item, ["date"]),
        raw: item,
      });
    }

    return jobs;
  },
};
