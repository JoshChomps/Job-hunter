/**
 * Work-authorisation feasibility for the UK and Singapore.
 *
 * This is a gate, not a label. Most of it is computable from published data
 * the Home Office register of licensed sponsors and the published salary floors
 * , rather than inferred, so it is deterministic wherever the inputs exist.
 *
 * Two safety rules run through everything here:
 *   1. Missing data yields `unknown`, never `no`. Absent salary must not
 *      silently bury a good role.
 *   2. `no` hides a job in the UI but never deletes it, so a bad sponsor-name
 *      match costs a click rather than an opportunity.
 */

import { normaliseCompany, toAnnual, toMonthly } from "./normalize";
import type { SalaryPeriod } from "./types";

export type Feasibility = "yes" | "no" | "unknown" | "threshold_risk";

/** Fallbacks used when the `visa_thresholds` table has not been seeded. */
export const DEFAULT_THRESHOLDS = {
  /** Skilled Worker new-entrant floor: the higher of this or 70% of going rate. */
  ukNewEntrantFloor: 33_400,
  ukStandardFloor: 41_700,
  ukGoingRateFraction: 0.7,
  /** EP minimum qualifying salary, youngest bracket, non-financial. */
  sgEpMonthly: 5_600,
  sgEpMonthlyFinancial: 6_200,
  /** Rises for new applications from 1 January 2027. */
  sgEpMonthlyFrom2027: 6_000,
  sgEpMonthlyFinancialFrom2027: 6_600,
} as const;

export const SG_2027_EFFECTIVE = new Date("2027-01-01T00:00:00Z");

export interface ThresholdRow {
  market: string;
  variant: string;
  effectiveFrom: Date;
  minSalary: number;
  currency: string;
  period: string;
}

export interface SalaryInput {
  min?: number | null;
  max?: number | null;
  currency?: string | null;
  period?: SalaryPeriod | string | null;
}

export interface VisaInput {
  country?: string | null;
  salary: SalaryInput;
  /** From the sponsor register. `null` means we never resolved the company. */
  ukSponsorLicence?: boolean | null;
  /** Explicit statement found in the posting text by Claude. */
  sponsorshipSignal?: "yes" | "no" | "unknown";
  /** Optional SOC going rate for the "70% of going rate" comparison. */
  ukGoingRate?: number | null;
  /** Financial-services roles carry a higher Singapore floor. */
  isFinancialServices?: boolean;
  now?: Date;
}

export interface VisaAssessment {
  uk: Feasibility;
  sg: Feasibility;
  reason?: string;
}

/**
 * Picks the best salary figure to test. Uses the *maximum* of the advertised
 * band: a role advertised at "£30k, £38k" can be offered at £38k and therefore
 * can clear the floor, so rejecting on the bottom of the band would hide
 * genuinely viable jobs.
 */
function bandTop(salary: SalaryInput): number | undefined {
  return salary.max ?? salary.min ?? undefined;
}

function resolveThreshold(
  rows: ThresholdRow[] | undefined,
  market: string,
  variant: string,
  at: Date,
): number | undefined {
  if (!rows?.length) return undefined;
  const applicable = rows
    .filter(
      (r) =>
        r.market === market &&
        r.variant === variant &&
        r.effectiveFrom.getTime() <= at.getTime(),
    )
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());
  return applicable[0]?.minSalary;
}

function nextThreshold(
  rows: ThresholdRow[] | undefined,
  market: string,
  variant: string,
  at: Date,
): number | undefined {
  if (!rows?.length) return undefined;
  const upcoming = rows
    .filter(
      (r) =>
        r.market === market &&
        r.variant === variant &&
        r.effectiveFrom.getTime() > at.getTime(),
    )
    .sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());
  return upcoming[0]?.minSalary;
}

export function assessUk(
  input: VisaInput,
  thresholds?: ThresholdRow[],
): { feasibility: Feasibility; reason?: string } {
  const now = input.now ?? new Date();

  if (input.sponsorshipSignal === "no") {
    return {
      feasibility: "no",
      reason: "Posting states sponsorship is not available",
    };
  }

  // Gate 1: the employer must hold a licence. Nothing else can rescue this.
  if (input.ukSponsorLicence === false) {
    return {
      feasibility: "no",
      reason: "Employer is not on the Home Office register of licensed sponsors",
    };
  }

  // Gate 2: salary must clear the new-entrant floor.
  const currency = input.salary.currency?.toUpperCase();
  if (currency && currency !== "GBP") {
    return {
      feasibility: "unknown",
      reason: `Salary quoted in ${currency}, cannot compare to the GBP threshold`,
    };
  }

  const top = bandTop(input.salary);
  const annual = toAnnual(top, (input.salary.period as SalaryPeriod) ?? "year");
  if (annual == null) {
    return {
      feasibility: input.ukSponsorLicence === true ? "yes" : "unknown",
      reason:
        input.ukSponsorLicence === true
          ? "Licensed sponsor; salary not published so the threshold is unverified"
          : "Salary not published and sponsor licence unresolved",
    };
  }

  const base =
    resolveThreshold(thresholds, "GB", "new_entrant", now) ??
    DEFAULT_THRESHOLDS.ukNewEntrantFloor;
  const goingRateFloor = input.ukGoingRate
    ? Math.round(input.ukGoingRate * DEFAULT_THRESHOLDS.ukGoingRateFraction)
    : 0;
  const floor = Math.max(base, goingRateFloor);

  if (annual < floor) {
    return {
      feasibility: "no",
      reason: `£${annual.toLocaleString()} is below the £${floor.toLocaleString()} new-entrant threshold`,
    };
  }

  if (input.ukSponsorLicence === true) {
    return {
      feasibility: "yes",
      reason: `Licensed sponsor and £${annual.toLocaleString()} clears the £${floor.toLocaleString()} floor`,
    };
  }

  return {
    feasibility: "unknown",
    reason: `Salary clears £${floor.toLocaleString()} but the sponsor licence is unresolved`,
  };
}

export function assessSg(
  input: VisaInput,
  thresholds?: ThresholdRow[],
): { feasibility: Feasibility; reason?: string } {
  const now = input.now ?? new Date();

  if (input.sponsorshipSignal === "no") {
    return {
      feasibility: "no",
      reason: "Posting states sponsorship is not available",
    };
  }

  const currency = input.salary.currency?.toUpperCase();
  if (currency && currency !== "SGD") {
    return {
      feasibility: "unknown",
      reason: `Salary quoted in ${currency}, cannot compare to the SGD threshold`,
    };
  }

  const top = bandTop(input.salary);
  const monthly = toMonthly(top, (input.salary.period as SalaryPeriod) ?? "month");
  if (monthly == null) {
    return { feasibility: "unknown", reason: "Salary not published" };
  }

  const variant = input.isFinancialServices ? "ep_financial" : "ep_standard";
  const current =
    resolveThreshold(thresholds, "SG", variant, now) ??
    (input.isFinancialServices
      ? DEFAULT_THRESHOLDS.sgEpMonthlyFinancial
      : DEFAULT_THRESHOLDS.sgEpMonthly);
  const upcoming =
    nextThreshold(thresholds, "SG", variant, now) ??
    (now < SG_2027_EFFECTIVE
      ? input.isFinancialServices
        ? DEFAULT_THRESHOLDS.sgEpMonthlyFinancialFrom2027
        : DEFAULT_THRESHOLDS.sgEpMonthlyFrom2027
      : undefined);

  if (monthly < current) {
    return {
      feasibility: "no",
      reason: `S$${monthly.toLocaleString()}/month is below the S$${current.toLocaleString()} EP minimum`,
    };
  }

  if (upcoming != null && monthly < upcoming) {
    return {
      feasibility: "threshold_risk",
      reason: `Clears today's S$${current.toLocaleString()} floor but not the S$${upcoming.toLocaleString()} one from 1 Jan 2027`,
    };
  }

  return {
    feasibility: "yes",
    reason: `S$${monthly.toLocaleString()}/month clears the S$${current.toLocaleString()} EP minimum`,
  };
}

/**
 * Canada needs no sponsorship for this search, so it is never gated. Only the
 * market a job is actually in gets assessed, a Toronto role is not "infeasible
 * for the UK", it is simply not a UK role.
 */
export function assessVisa(
  input: VisaInput,
  thresholds?: ThresholdRow[],
): VisaAssessment {
  const country = input.country?.toUpperCase();

  if (country === "GB" || country === "UK") {
    const { feasibility, reason } = assessUk(input, thresholds);
    return { uk: feasibility, sg: "unknown", reason };
  }
  if (country === "SG") {
    const { feasibility, reason } = assessSg(input, thresholds);
    return { uk: "unknown", sg: feasibility, reason };
  }
  return { uk: "unknown", sg: "unknown" };
}

/* ------------------------------------------------- sponsor name matching */

export interface SponsorRow {
  name: string;
  normalisedName: string;
  rating?: string | null;
  routes?: string[] | null;
}

/**
 * Matching a brand to a legal entity is genuinely fuzzy, "DeepMind" appears on
 * the register under a different name than the one on the job ad. Exact match
 * on the normalised form first, then a conservative containment check with a
 * length guard so short names like "Arm" cannot match half the register.
 */
export function matchSponsor(
  companyName: string,
  sponsors: SponsorRow[],
): SponsorRow | undefined {
  const target = normaliseCompany(companyName);
  if (!target) return undefined;

  const exact = sponsors.find((s) => s.normalisedName === target);
  if (exact) return exact;

  if (target.length < 5) return undefined;

  const prefixed = sponsors.filter(
    (s) =>
      s.normalisedName.startsWith(`${target} `) ||
      target.startsWith(`${s.normalisedName} `),
  );
  // Ambiguous matches are treated as no match, so the job stays `unknown`
  // rather than being wrongly cleared or wrongly hidden.
  return prefixed.length === 1 ? prefixed[0] : undefined;
}
