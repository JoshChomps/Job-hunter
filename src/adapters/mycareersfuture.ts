import { fetchJson } from "@/lib/http";
import type { Adapter, AdapterContext, RawJob } from "@/pipeline/types";
import type { Source } from "@/db/schema";
import { pickArray, pickDate, pickNumber, pickString } from "./helpers";
import { stripHtml } from "@/pipeline/normalize";

interface McfConfig {
  search?: string;
  limit?: number;
  pages?: number;
  /** Endpoint is undocumented, so it stays overridable without a redeploy. */
  baseUrl?: string;
}

const DEFAULT_BASE = "https://api.mycareersfuture.gov.sg/v2/search";

/**
 * The single most important source in the system for Singapore.
 *
 * Under the Fair Consideration Framework, employers must advertise a role here
 * for 14 consecutive days before filing an Employment Pass application. That
 * makes MyCareersFuture structurally the most complete list of *sponsorable*
 * Singapore roles that exists: not merely a good source.
 *
 * It also carries mandatory salary ranges, which turns the EP salary threshold
 * from a guess into an exact numeric filter.
 *
 * The endpoint is public but undocumented, so this adapter reads defensively
 * and the base URL is configurable.
 */
export const myCareersFutureAdapter: Adapter = {
  provider: "mycareersfuture",
  tier: 2,

  isConfigured() {
    return true;
  },

  async fetchJobs(source: Source, ctx: AdapterContext): Promise<RawJob[]> {
    const config = source.config as McfConfig;
    const base = config.baseUrl ?? DEFAULT_BASE;
    const limit = Math.min(config.limit ?? 100, 100);
    const pages = Math.min(config.pages ?? 2, 10);

    const jobs: RawJob[] = [];

    for (let page = 0; page < pages; page++) {
      const url = `${base}?limit=${limit}&page=${page}`;
      const payload = await fetchJson(url, {
        method: "POST",
        body: {
          search: config.search ?? "",
          sessionId: "",
          sortBy: ["new_posting_date"],
        },
        delayMs: page > 0 ? 800 : 0,
      });

      const results = pickArray(payload, ["results", "jobs"]);
      ctx.log(`mycareersfuture page ${page}: ${results.length} results`);
      if (results.length === 0) break;

      for (const item of results) {
        const title = pickString(item, ["title", "positionTitle"]);
        const uuid = pickString(item, ["uuid", "id"]);
        const applyUrl =
          pickString(item, ["metadata.jobDetailsUrl", "jobDetailsUrl", "url"]) ??
          (uuid ? `https://www.mycareersfuture.gov.sg/job/${uuid}` : undefined);
        if (!title || !applyUrl) continue;

        // Salary is mandatory here, which is exactly what makes the EP gate
        // computable rather than inferred.
        const salaryMin = pickNumber(item, [
          "salary.minimum",
          "salary.min",
          "minimumSalary",
        ]);
        const salaryMax = pickNumber(item, [
          "salary.maximum",
          "salary.max",
          "maximumSalary",
        ]);

        jobs.push({
          providerJobId: uuid,
          url: applyUrl,
          title,
          companyName: pickString(item, [
            "postedCompany.name",
            "company.name",
            "hiringCompany.name",
          ]),
          locationRaw:
            pickString(item, ["address.district.district", "address.building"]) ??
            "Singapore",
          country: "SG",
          employmentType: pickString(item, [
            "employmentTypes.0.employmentType",
            "employmentType",
          ]),
          salaryMin,
          salaryMax,
          salaryCurrency: "SGD",
          // MyCareersFuture quotes monthly salary, which is also the unit the
          // Employment Pass threshold is expressed in.
          salaryPeriod: "month",
          description: stripHtml(pickString(item, ["description"])),
          postedAt: pickDate(item, ["metadata.newPostingDate", "postedDate"]),
          closesAt: pickDate(item, ["metadata.expiryDate", "expiryDate"]),
          raw: item,
        });
      }

      if (results.length < limit) break;
    }

    return jobs;
  },
};
