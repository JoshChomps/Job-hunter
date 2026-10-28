import type { Source } from "@/db/schema";

export type Market = "CA" | "SG" | "GB";

export type SalaryPeriod = "year" | "month" | "week" | "day" | "hour";

/** What every adapter returns. Deliberately loose, normalisation comes later. */
export interface RawJob {
  providerJobId?: string;
  url: string;
  title: string;
  companyName?: string;
  companyWebsite?: string;
  locationRaw?: string;
  city?: string;
  country?: string;
  remote?: boolean;
  hybrid?: boolean;
  employmentType?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: SalaryPeriod;
  description?: string;
  postedAt?: Date;
  closesAt?: Date;
  raw?: unknown;
}

export interface AdapterContext {
  /** Adapters call this so credit spend is attributed to the right run. */
  recordCredits(n: number): void;
  log(message: string): void;
}

export interface Adapter {
  provider: string;
  tier: number;
  /** Whether the required credentials are present. */
  isConfigured(): boolean;
  fetchJobs(source: Source, ctx: AdapterContext): Promise<RawJob[]>;
}

export class AdapterError extends Error {
  constructor(
    public provider: string,
    message: string,
    public cause?: unknown,
  ) {
    super(`[${provider}] ${message}`);
    this.name = "AdapterError";
  }
}
