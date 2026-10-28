import { z } from "zod";

/**
 * Shared contracts for every LLM provider.
 *
 * The work is split into three operations by *stakes*, not convenience:
 *
 *   parse: a scraped page becomes fields. Mechanical.
 *   classify: discipline, seniority, tags, description. Mechanical.
 *   assess: sponsorship reading and fit scoring. Judgment.
 *
 * That split is what makes a local model useful here: it can own the two
 * mechanical jobs, which are the high-volume ones, while the judgment calls
 * that decide whether you waste a week on an impossible role can stay with a
 * frontier model. See `hybrid` in ./index.ts.
 */

/* ------------------------------------------------------------------ parse */

export const parsedJobSchema = z.object({
  isJobPosting: z.boolean(),
  title: z.string().optional(),
  companyName: z.string().optional(),
  locationRaw: z.string().optional(),
  country: z.string().optional(),
  remoteType: z.enum(["onsite", "hybrid", "remote", "unknown"]).optional(),
  employmentType: z.string().optional(),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  salaryCurrency: z.string().optional(),
  salaryPeriod: z.enum(["year", "month", "week", "day", "hour"]).optional(),
  description: z.string().optional(),
});

export type ParsedJob = z.infer<typeof parsedJobSchema>;

export const PARSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    isJobPosting: {
      type: "boolean",
      description:
        "False if the page is a search results page, a 404, or otherwise not a single job posting.",
    },
    title: { type: "string" },
    companyName: { type: "string" },
    locationRaw: { type: "string" },
    country: {
      type: "string",
      description: "ISO 3166-1 alpha-2 code, e.g. GB, SG, CA. Omit if unclear.",
    },
    remoteType: { type: "string", enum: ["onsite", "hybrid", "remote", "unknown"] },
    employmentType: { type: "string" },
    salaryMin: { type: "number" },
    salaryMax: { type: "number" },
    salaryCurrency: { type: "string", description: "ISO code, e.g. GBP, SGD, CAD." },
    salaryPeriod: {
      type: "string",
      enum: ["year", "month", "week", "day", "hour"],
    },
    description: {
      type: "string",
      description: "The role description as plain text, up to about 4000 characters.",
    },
  },
  required: ["isJobPosting"],
} as const;

export const PARSE_SYSTEM = [
  "You extract structured data from job postings.",
  "Only report values actually present on the page. Never infer a salary that is not stated, and never guess a country from a company's headquarters, use the location of the role itself.",
  "If the page is not a single job posting, set isJobPosting to false and leave the other fields empty.",
].join(" ");

/* --------------------------------------------------------------- classify */

export const classifySchema = z.object({
  discipline: z.enum(["electrical", "ai", "other", "unknown"]),
  subDiscipline: z.string().optional(),
  isHardwareAi: z.boolean(),
  seniority: z.enum([
    "intern",
    "new_grad",
    "early",
    "mid",
    "senior",
    "staff",
    "unknown",
  ]),
  isGradScheme: z.boolean(),
  techStack: z.array(z.string()).default([]),
  summary: z.string(),
});

export type ClassifyResult = z.infer<typeof classifySchema>;

export const CLASSIFY_JSON_SCHEMA = {
  type: "object",
  properties: {
    discipline: {
      type: "string",
      enum: ["electrical", "ai", "other", "unknown"],
      description:
        "'electrical' for electrical/electronic/hardware/semiconductor roles, 'ai' for ML/AI/data science roles, 'other' if it is neither.",
    },
    subDiscipline: {
      type: "string",
      description:
        "Specific area, e.g. 'analog & mixed-signal', 'RTL design', 'power electronics', 'computer vision', 'ML infrastructure'.",
    },
    isHardwareAi: {
      type: "boolean",
      description:
        "True when the role sits in the overlap of hardware and AI: AI accelerators, edge/TinyML, ML compilers, silicon for AI, neuromorphic, hardware-aware model design.",
    },
    seniority: {
      type: "string",
      enum: ["intern", "new_grad", "early", "mid", "senior", "staff", "unknown"],
    },
    isGradScheme: {
      type: "boolean",
      description:
        "True for graduate schemes, new-grad programmes and campus hiring pipelines.",
    },
    techStack: {
      type: "array",
      items: { type: "string" },
      description:
        "Concrete tools, languages and technologies named, e.g. Verilog, PyTorch, Cadence, CUDA.",
    },
    summary: {
      type: "string",
      description:
        "One or two sentences on what the role actually involves day to day. Plain and concrete. No marketing language, no company boilerplate.",
    },
  },
  required: [
    "discipline",
    "isHardwareAi",
    "seniority",
    "isGradScheme",
    "techStack",
    "summary",
  ],
} as const;

export const CLASSIFY_SYSTEM = [
  "You categorise engineering job postings and write a short factual description of each.",
  "Classify on what the role actually involves, not on the job title alone, a 'Systems Engineer' doing RTL design is electrical, and an 'AI Engineer' administering a CRM is neither.",
  "The summary must describe the actual work. Strip marketing language, mission statements and benefits.",
].join(" ");

/* ----------------------------------------------------------------- assess */

export const assessSchema = z.object({
  sponsorshipSignal: z.enum(["yes", "no", "unknown"]),
  sponsorshipStatement: z.string().optional(),
  fitScore: z.number().min(0).max(100),
  reasons: z.array(z.string()).default([]),
});

export type AssessResult = z.infer<typeof assessSchema>;

export const ASSESS_JSON_SCHEMA = {
  type: "object",
  properties: {
    sponsorshipSignal: {
      type: "string",
      enum: ["yes", "no", "unknown"],
      description:
        "'yes' only if the posting explicitly offers visa sponsorship. 'no' only if it explicitly rules it out or demands existing right to work. 'unknown' when the posting is silent, which is the common case.",
    },
    sponsorshipStatement: {
      type: "string",
      description: "The exact sentence about work authorisation, if there is one.",
    },
    fitScore: {
      type: "number",
      description: "0-100 fit against the candidate profile.",
    },
    reasons: {
      type: "array",
      items: { type: "string" },
      description:
        "Two to four short, specific reasons for the score. Name the actual requirement that matched or didn't.",
    },
  },
  required: ["sponsorshipSignal", "fitScore", "reasons"],
} as const;

export const ASSESS_SYSTEM = [
  "You triage job postings for one specific candidate.",
  "Score fit on demonstrated capability against what the role actually requires, not on the years-of-experience number in the ad. A posting asking for five years that a strong early-career engineer could do should not be penalised heavily for the number alone, judge the substance of the requirements.",
  "Be blunt in the reasons. Vague praise is useless; name the specific requirement that matched or didn't.",
  "Only report a sponsorship signal when the posting actually says something about work authorisation. Silence means 'unknown'.",
].join(" ");

/* --------------------------------------------------------------- provider */

export interface JobInput {
  title: string;
  companyName?: string | null;
  locationRaw?: string | null;
  description?: string | null;
}

export interface LlmProvider {
  name: string;
  /** Identifier recorded on each enrichment row, for auditing what produced it. */
  modelId: string;
  isConfigured(): boolean;
  parse(markdown: string, sourceUrl: string): Promise<ParsedJob>;
  classify(job: JobInput): Promise<ClassifyResult>;
  assess(job: JobInput, profile: string): Promise<AssessResult>;
}

/** Prompt text sent for classify/assess. Shared so providers stay comparable. */
export function renderJob(job: JobInput, profile?: string): string {
  return [
    profile ? "## Candidate profile" : "",
    profile ?? "",
    profile ? "" : "",
    "## Job posting",
    `Title: ${job.title}`,
    job.companyName ? `Company: ${job.companyName}` : "",
    job.locationRaw ? `Location: ${job.locationRaw}` : "",
    "",
    job.description?.slice(0, 20_000) ?? "(no description available)",
  ]
    .filter((line) => line !== "")
    .join("\n");
}
