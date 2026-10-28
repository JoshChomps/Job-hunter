import { createHash } from "node:crypto";
import type { RawJob, SalaryPeriod } from "./types";

/**
 * Query params that identify a *referrer*, not a job. Everything else is kept,
 * because plenty of boards put the job id in the query string (`?gh_jid=`,
 * `?jk=`) and stripping those would collapse unrelated postings together.
 */
const TRACKING_PARAMS = [
  /^utm_/i,
  /^gclid$/i,
  /^fbclid$/i,
  /^msclkid$/i,
  /^mc_(cid|eid)$/i,
  /^_ga$/i,
  /^ref$/i,
  /^referer$/i,
  /^referrer$/i,
  /^source$/i,
  /^src$/i,
  /^trk$/i,
  /^trackingid$/i,
  /^li_fat_id$/i,
  /^gh_src$/i,
  /^campaign$/i,
  /^medium$/i,
  /^jsessionid$/i,
  /^sessionid$/i,
];

export function canonicaliseUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return input.trim();
  }

  url.protocol = url.protocol === "http:" ? "https:" : url.protocol;
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  url.hash = "";

  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.some((re) => re.test(key))) url.searchParams.delete(key);
  }
  url.searchParams.sort();

  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
}

export function hashUrl(canonical: string): string {
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

const TITLE_NOISE = [
  /\(.*?\)/g, // "(Remote)", "(m/f/d)"
  /\[.*?\]/g,
  /\b(m\/f\/d|m\/w\/d|f\/m\/x|all genders?)\b/gi,
  /\b(full[- ]?time|part[- ]?time|permanent|contract|temporary)\b/gi,
  /\b(remote|hybrid|onsite|on[- ]site)\b/gi,
  /\b(urgent|hiring|now hiring|apply now|immediate start)\b/gi,
  /[–—-]\s*[a-z\s]*$/i, // trailing " - London" style suffixes
];

export function normaliseTitle(title: string): string {
  let out = title.toLowerCase();
  for (const re of TITLE_NOISE) out = out.replace(re, " ");
  return out
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const COMPANY_SUFFIXES =
  /\b(inc|incorporated|llc|ltd|limited|plc|gmbh|bv|nv|ag|sa|pte|pvt|private|corp|corporation|co|company|holdings|group|technologies|technology|labs|laboratories)\b/g;

export function normaliseCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(COMPANY_SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normaliseCity(location?: string | null): string {
  if (!location) return "";
  return location
    .toLowerCase()
    .split(/[,|/]/)[0]
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Fuzzy identity for a posting. Deliberately ignores the source, so the same
 * role on Reed, Adzuna and LinkedIn collapses to one card.
 */
export function buildDedupeKey(
  company: string | undefined,
  title: string,
  city: string | undefined,
): string {
  const parts = [
    normaliseCompany(company ?? ""),
    normaliseTitle(title),
    normaliseCity(city),
  ].join("|");
  return createHash("sha256").update(parts).digest("hex").slice(0, 32);
}

/* ------------------------------------------------------------- locations */

const COUNTRY_HINTS: Array<[RegExp, string]> = [
  [/\b(singapore|sg)\b/i, "SG"],
  [
    /\b(united kingdom|uk|england|scotland|wales|london|cambridge|bristol|manchester|edinburgh|birmingham|oxford|reading|glasgow|leeds|sheffield)\b/i,
    "GB",
  ],
  [
    /\b(canada|ca|ontario|quebec|québec|british columbia|alberta|toronto|vancouver|montreal|montréal|ottawa|waterloo|calgary|markham|mississauga)\b/i,
    "CA",
  ],
];

export function inferCountry(
  locationRaw?: string | null,
  fallback?: string | null,
): string | undefined {
  if (fallback && /^[A-Z]{2}$/.test(fallback)) return fallback;
  if (!locationRaw) return fallback ?? undefined;
  for (const [re, code] of COUNTRY_HINTS) {
    if (re.test(locationRaw)) return code;
  }
  return fallback ?? undefined;
}

export function inferRemoteType(
  job: RawJob,
): "onsite" | "hybrid" | "remote" | "unknown" {
  if (job.remote === true) return "remote";
  if (job.hybrid === true) return "hybrid";

  const haystack = `${job.title} ${job.locationRaw ?? ""} ${
    job.description?.slice(0, 1500) ?? ""
  }`.toLowerCase();

  if (/\bhybrid\b/.test(haystack)) return "hybrid";
  if (/\b(fully remote|100% remote|remote[- ]first|work from home)\b/.test(haystack))
    return "remote";
  if (/\bremote\b/.test(haystack)) return "remote";
  if (/\b(on[- ]?site|in[- ]?office|onsite)\b/.test(haystack)) return "onsite";
  return "unknown";
}

/* --------------------------------------------------------------- salary */

const PERIOD_FACTORS_TO_YEAR: Record<SalaryPeriod, number> = {
  year: 1,
  month: 12,
  week: 52,
  day: 260,
  hour: 2080,
};

export function toAnnual(
  amount: number | null | undefined,
  period: SalaryPeriod | null | undefined,
): number | undefined {
  if (amount == null) return undefined;
  const factor = PERIOD_FACTORS_TO_YEAR[period ?? "year"] ?? 1;
  return Math.round(amount * factor);
}

export function toMonthly(
  amount: number | null | undefined,
  period: SalaryPeriod | null | undefined,
): number | undefined {
  const annual = toAnnual(amount, period);
  return annual == null ? undefined : Math.round(annual / 12);
}

/**
 * Salary text is wildly inconsistent across boards, so this is deliberately
 * conservative: anything ambiguous returns undefined rather than a guess that
 * would feed the visa gate bad numbers.
 */
export function parseSalaryText(text: string): {
  min?: number;
  max?: number;
  currency?: string;
  period?: SalaryPeriod;
} {
  const cleaned = text.replace(/,/g, "").toLowerCase();

  let currency: string | undefined;
  if (/£|\bgbp\b/.test(cleaned)) currency = "GBP";
  else if (/\b(sgd|s\$)\b/.test(cleaned)) currency = "SGD";
  else if (/\b(cad|c\$)\b/.test(cleaned)) currency = "CAD";
  else if (/\busd\b/.test(cleaned)) currency = "USD";
  else if (/\$/.test(cleaned)) currency = undefined; // too ambiguous to claim

  let period: SalaryPeriod | undefined;
  if (/\b(per hour|hourly|\/\s*h(r|our)?|an hour)\b/.test(cleaned)) period = "hour";
  else if (/\b(per day|daily|\/\s*day|a day)\b/.test(cleaned)) period = "day";
  else if (/\b(per week|weekly|\/\s*w(k|eek)?)\b/.test(cleaned)) period = "week";
  else if (/\b(per month|monthly|\/\s*m(o|onth)?|a month|pcm)\b/.test(cleaned))
    period = "month";
  else if (/\b(per annum|annually|yearly|\/\s*y(r|ear)?|pa|p\.a\.)\b/.test(cleaned))
    period = "year";

  const numbers = [...cleaned.matchAll(/(\d+(?:\.\d+)?)\s*(k\b)?/g)]
    .map((m) => {
      const value = Number(m[1]);
      return m[2] ? value * 1000 : value;
    })
    .filter((n) => n >= 1000 || (period === "hour" && n >= 5));

  if (numbers.length === 0) return { currency, period };
  if (numbers.length === 1) return { min: numbers[0], currency, period };

  const sorted = [...numbers].sort((a, b) => a - b);
  return { min: sorted[0], max: sorted[sorted.length - 1], currency, period };
}

/** Trim descriptions before storage, the Neon free tier is 0.5 GB. */
export const MAX_DESCRIPTION_BYTES = 8_000;

export function capDescription(text?: string | null): string | undefined {
  if (!text) return undefined;
  const trimmed = text.trim();
  if (trimmed.length <= MAX_DESCRIPTION_BYTES) return trimmed;
  return `${trimmed.slice(0, MAX_DESCRIPTION_BYTES)}\n\n[truncated]`;
}

export function stripHtml(html?: string | null): string | undefined {
  if (!html) return undefined;
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
