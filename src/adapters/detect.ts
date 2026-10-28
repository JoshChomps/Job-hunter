import { fetchWithRetry } from "@/lib/http";
import { pickArray } from "./helpers";
import { slugify } from "@/pipeline/normalize";

/**
 * Rather than hand-maintaining a mapping of company → ATS, probe the five
 * public board endpoints and record which one answers. Adding a target company
 * becomes: paste the name or careers URL, get its board.
 */

export type DetectedAts =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workable"
  | "workday"
  | "none";

export interface AtsDetection {
  ats: DetectedAts;
  token?: string;
  tenant?: string;
  dc?: string;
  site?: string;
  jobCount?: number;
}

/** Reads the ATS straight off a careers URL when the URL gives it away. */
export function detectAtsFromUrl(rawUrl: string): AtsDetection | undefined {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return undefined;
  }

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);

  if (host.includes("greenhouse.io")) {
    // boards.greenhouse.io/{token} or job-boards.greenhouse.io/{token}
    return { ats: "greenhouse", token: segments[0] };
  }
  if (host.includes("lever.co")) {
    return { ats: "lever", token: segments[0] };
  }
  if (host.includes("ashbyhq.com")) {
    return { ats: "ashby", token: segments[0] };
  }
  if (host.includes("workable.com")) {
    // apply.workable.com/{account}/ or {account}.workable.com
    const subdomain = host.split(".")[0];
    return {
      ats: "workable",
      token: subdomain === "apply" ? segments[0] : subdomain,
    };
  }
  if (host.includes("myworkdayjobs.com")) {
    // {tenant}.{dc}.myworkdayjobs.com/{locale}/{site}
    const [tenant, dc] = host.split(".");
    const site = segments.find((s) => !/^[a-z]{2}([-_][A-Za-z]{2})?$/.test(s));
    return { ats: "workday", tenant, dc, site };
  }

  return undefined;
}

async function probe(url: string): Promise<unknown | undefined> {
  try {
    const response = await fetchWithRetry(url, { retries: 0, timeoutMs: 15_000 });
    return await response.json();
  } catch {
    return undefined;
  }
}

/**
 * Tries each board endpoint for a candidate slug. Only counts as a hit when the
 * endpoint returns actual postings: several of these return 200 with an empty
 * body for an unknown token, which would otherwise read as a false positive.
 */
export async function probeAts(companyName: string): Promise<AtsDetection> {
  const slug = slugify(companyName);
  const compact = slug.replace(/-/g, "");
  const candidates = Array.from(new Set([slug, compact]));

  for (const token of candidates) {
    const greenhouse = await probe(
      `https://boards-api.greenhouse.io/v1/boards/${token}/jobs`,
    );
    if (greenhouse && pickArray(greenhouse, ["jobs"]).length > 0) {
      return {
        ats: "greenhouse",
        token,
        jobCount: pickArray(greenhouse, ["jobs"]).length,
      };
    }

    const lever = await probe(`https://api.lever.co/v0/postings/${token}?mode=json`);
    if (lever && pickArray(lever).length > 0) {
      return { ats: "lever", token, jobCount: pickArray(lever).length };
    }

    const ashby = await probe(
      `https://api.ashbyhq.com/posting-api/job-board/${token}`,
    );
    if (ashby && pickArray(ashby, ["jobs"]).length > 0) {
      return { ats: "ashby", token, jobCount: pickArray(ashby, ["jobs"]).length };
    }

    const workable = await probe(
      `https://apply.workable.com/api/v1/widget/accounts/${token}?details=true`,
    );
    if (workable && pickArray(workable, ["jobs"]).length > 0) {
      return {
        ats: "workable",
        token,
        jobCount: pickArray(workable, ["jobs"]).length,
      };
    }
  }

  // Workday can't be probed from a name alone, its tenant, data centre and
  // site name are all customer-specific and must come from a careers URL.
  return { ats: "none" };
}
