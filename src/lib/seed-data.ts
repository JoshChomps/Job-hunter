/**
 * Seed data shared by `scripts/seed.ts` (terminal) and
 * `scripts/generate-setup-sql.ts` (which produces a single paste-into-Neon
 * file for setting up without a terminal). Defined once so the two paths
 * cannot drift.
 */

export const THRESHOLDS = [
  {
    market: "GB",
    variant: "new_entrant",
    effectiveFrom: "2025-04-09",
    minSalary: 33_400,
    currency: "GBP",
    period: "year",
    notes: "Skilled Worker new entrant floor, or 70% of the going rate if higher",
  },
  {
    market: "GB",
    variant: "standard",
    effectiveFrom: "2025-04-09",
    minSalary: 41_700,
    currency: "GBP",
    period: "year",
    notes: "Skilled Worker standard floor",
  },
  {
    market: "SG",
    variant: "ep_standard",
    effectiveFrom: "2025-01-01",
    minSalary: 5_600,
    currency: "SGD",
    period: "month",
    notes: "EP minimum qualifying salary, youngest bracket, non-financial",
  },
  {
    market: "SG",
    variant: "ep_standard",
    effectiveFrom: "2027-01-01",
    minSalary: 6_000,
    currency: "SGD",
    period: "month",
    notes: "Increase applying to new EP applications from 1 Jan 2027",
  },
  {
    market: "SG",
    variant: "ep_financial",
    effectiveFrom: "2025-01-01",
    minSalary: 6_200,
    currency: "SGD",
    period: "month",
    notes: "EP minimum for financial services",
  },
  {
    market: "SG",
    variant: "ep_financial",
    effectiveFrom: "2027-01-01",
    minSalary: 6_600,
    currency: "SGD",
    period: "month",
    notes: "Financial services increase from 1 Jan 2027",
  },
] as const;

/** Split evenly between the two disciplines, per the agreed crawl budget. */
export const ELECTRICAL_QUERIES = [
  "electrical engineer",
  "electronics engineer",
  "hardware engineer",
  "FPGA engineer",
  "ASIC design engineer",
  "RTL design",
  "embedded software engineer",
  "power electronics engineer",
  "semiconductor process engineer",
];

export const AI_QUERIES = [
  "machine learning engineer",
  "AI engineer",
  "computer vision engineer",
  "deep learning engineer",
  "MLOps engineer",
  "machine learning research engineer",
  "data scientist",
  "AI accelerator engineer",
  "ML compiler engineer",
];

export const ALL_QUERIES = [...ELECTRICAL_QUERIES, ...AI_QUERIES];

export const MARKETS = [
  { code: "GB", where: "London", label: "UK" },
  { code: "CA", where: "Canada", label: "Canada" },
  { code: "SG", where: "Singapore", label: "Singapore" },
];

/**
 * Seed list for the electrical × AI overlap across the three target markets.
 * ATS type is left unresolved, `scripts/detect-ats.ts` probes the public board
 * endpoints and creates the matching sources.
 */
export const TARGET_COMPANIES: Array<{ name: string; hqCountry: string }> = [
  // Canada: Toronto/Waterloo/Ottawa AI-silicon cluster
  { name: "Tenstorrent", hqCountry: "CA" },
  { name: "Untether AI", hqCountry: "CA" },
  { name: "Blumind", hqCountry: "CA" },
  { name: "Cohere", hqCountry: "CA" },
  { name: "Waabi", hqCountry: "CA" },
  { name: "Ciena", hqCountry: "CA" },
  { name: "Ranovus", hqCountry: "CA" },
  { name: "BlackBerry QNX", hqCountry: "CA" },
  { name: "Telesat", hqCountry: "CA" },
  { name: "MDA Space", hqCountry: "CA" },

  // Singapore: semiconductor cluster plus regional AI
  { name: "GlobalFoundries", hqCountry: "SG" },
  { name: "Micron", hqCountry: "SG" },
  { name: "Infineon Technologies", hqCountry: "SG" },
  { name: "STMicroelectronics", hqCountry: "SG" },
  { name: "Marvell", hqCountry: "SG" },
  { name: "Applied Materials", hqCountry: "SG" },
  { name: "Lam Research", hqCountry: "SG" },
  { name: "ASM International", hqCountry: "SG" },
  { name: "Grab", hqCountry: "SG" },
  { name: "Sea", hqCountry: "SG" },

  // UK: Arm/Graphcore silicon plus London AI
  { name: "Arm", hqCountry: "GB" },
  { name: "Graphcore", hqCountry: "GB" },
  { name: "Imagination Technologies", hqCountry: "GB" },
  { name: "Alphawave Semi", hqCountry: "GB" },
  { name: "Wayve", hqCountry: "GB" },
  { name: "Synthesia", hqCountry: "GB" },
  { name: "ElevenLabs", hqCountry: "GB" },
  { name: "Quantinuum", hqCountry: "GB" },
  { name: "Oxford Instruments", hqCountry: "GB" },
  { name: "Cambridge Consultants", hqCountry: "GB" },
  { name: "Nordic Semiconductor", hqCountry: "GB" },
  { name: "XMOS", hqCountry: "GB" },
];

export interface SeedSource {
  kind: "search" | "company" | "job";
  tier: number;
  provider: string;
  label: string;
  market?: string;
  cadenceDays: number;
  config: Record<string, unknown>;
}

/** The default saved searches, built once and reused by both seed paths. */
export function buildSeedSources(): SeedSource[] {
  const sources: SeedSource[] = [];

  for (const market of MARKETS) {
    for (const query of ALL_QUERIES) {
      sources.push({
        kind: "search",
        tier: 1,
        provider: "adzuna",
        label: `Adzuna ${market.label}: ${query}`,
        market: market.code,
        cadenceDays: 7,
        config: {
          what: query,
          where: market.where,
          market: market.code,
          maxDaysOld: 14,
        },
      });
    }
  }

  // Reed is UK-only but has the deepest UK inventory, so it gets its own pass.
  for (const query of ALL_QUERIES) {
    sources.push({
      kind: "search",
      tier: 1,
      provider: "reed",
      label: `Reed UK: ${query}`,
      market: "GB",
      cadenceDays: 7,
      config: { keywords: query, locationName: "London", distanceFromLocation: 30 },
    });
  }

  // Free, no key, refreshed every couple of hours, cheap enough to run daily.
  sources.push({
    kind: "search",
    tier: 1,
    provider: "ai-jobs",
    label: "ai-jobs.net (CA/SG/UK)",
    cadenceDays: 1,
    config: { markets: ["CA", "SG", "GB"] },
  });

  // The most important Singapore source: the Fair Consideration Framework makes
  // it the most complete list of sponsorable SG roles, and its mandatory salary
  // data drives the Employment Pass gate.
  for (const query of ["engineer", "machine learning", "semiconductor"]) {
    sources.push({
      kind: "search",
      tier: 2,
      provider: "mycareersfuture",
      label: `MyCareersFuture: ${query}`,
      market: "SG",
      cadenceDays: 7,
      config: { search: query, limit: 100, pages: 2 },
    });
  }

  return sources;
}
