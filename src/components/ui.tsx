import type { ReactNode } from "react";

export const STAGES = [
  "inbox",
  "shortlist",
  "applied",
  "interview",
  "offer",
  "rejected",
  "archived",
] as const;

export type Stage = (typeof STAGES)[number];

const STAGE_VAR: Record<string, string> = {
  inbox: "var(--stage-inbox)",
  shortlist: "var(--stage-shortlist)",
  applied: "var(--stage-applied)",
  interview: "var(--stage-interview)",
  offer: "var(--stage-offer)",
  rejected: "var(--stage-rejected)",
  archived: "var(--stage-archived)",
};

export function StageBadge({ stage }: { stage: string }) {
  const color = STAGE_VAR[stage] ?? "var(--stage-archived)";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium capitalize"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {stage}
    </span>
  );
}

/**
 * Visa status is a small badge rather than a stage colour: it qualifies a job,
 * it isn't a step in the pipeline. "yes" shows nothing at all, a clean row is
 * the signal that there's nothing to worry about.
 */
export function VisaBadge({
  uk,
  sg,
  reason,
}: {
  uk: string;
  sg: string;
  reason?: string | null;
}) {
  const status = uk !== "unknown" ? uk : sg;
  const market = uk !== "unknown" ? "UK" : "SG";

  if (status === "yes" || status === "unknown") return null;

  const config = {
    no: { label: `No ${market} sponsorship`, color: "var(--danger)" },
    threshold_risk: { label: `${market} 2027 threshold`, color: "var(--warning)" },
  }[status as "no" | "threshold_risk"];

  if (!config) return null;

  return (
    <span
      title={reason ?? undefined}
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium"
      style={{
        color: config.color,
        backgroundColor: `color-mix(in srgb, ${config.color} 12%, transparent)`,
      }}
    >
      {config.label}
    </span>
  );
}

export function Pill({
  children,
  tone = "muted",
  title,
}: {
  children: ReactNode;
  tone?: "muted" | "primary" | "success";
  title?: string;
}) {
  const styles = {
    muted:
      "bg-surface-2 text-muted border-border",
    primary:
      "bg-primary-soft text-primary-hi border-transparent",
    success: "border-transparent",
  }[tone];

  return (
    <span
      title={title}
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] ${styles}`}
      style={tone === "success" ? { color: "var(--success)" } : undefined}
    >
      {children}
    </span>
  );
}

export function FitScore({ score }: { score?: number | null }) {
  if (score == null) return null;

  const color =
    score >= 75 ? "var(--success)" : score >= 50 ? "var(--warning)" : "var(--text-muted)";

  return (
    <span
      className="inline-flex min-w-9 items-center justify-center rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums"
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
      title="Claude fit score against your profile"
    >
      {score}
    </span>
  );
}

export function formatSalary(job: {
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: string | null;
}): string | undefined {
  const { salaryMin, salaryMax, salaryCurrency, salaryPeriod } = job;
  if (salaryMin == null && salaryMax == null) return undefined;

  const symbol =
    { GBP: "£", SGD: "S$", CAD: "C$", USD: "$", EUR: "€" }[salaryCurrency ?? ""] ??
    (salaryCurrency ? `${salaryCurrency} ` : "");

  const format = (value: number) =>
    value >= 10_000 ? `${symbol}${Math.round(value / 1000)}k` : `${symbol}${value.toLocaleString()}`;

  const range =
    salaryMin != null && salaryMax != null && salaryMin !== salaryMax
      ? `${format(salaryMin)}: ${format(salaryMax)}`
      : format((salaryMax ?? salaryMin)!);

  const period = salaryPeriod === "month" ? "/mo" : salaryPeriod === "hour" ? "/hr" : "";
  return `${range}${period}`;
}

export function relativeTime(date?: Date | string | null): string {
  if (!date) return "";
  const value = typeof date === "string" ? new Date(date) : date;
  const days = Math.floor((Date.now() - value.getTime()) / 86_400_000);

  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children && (
        <div className="mx-auto mt-2 max-w-md text-sm text-muted">
          {children}
        </div>
      )}
    </div>
  );
}
