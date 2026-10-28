"use client";

import Link from "next/link";
import { useTransition } from "react";
import { setStage, toggleStar } from "@/app/actions";
import {
  FitScore,
  Pill,
  StageBadge,
  STAGES,
  VisaBadge,
  formatSalary,
  relativeTime,
} from "./ui";

export interface JobRowData {
  id: string;
  title: string;
  url: string;
  companyName: string | null;
  locationRaw: string | null;
  country: string | null;
  remoteType: string;
  seniority: string;
  isGradScheme: boolean;
  discipline: string;
  subDiscipline: string | null;
  isHardwareAi: boolean;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  visaFeasibleUk: string;
  visaFeasibleSg: string;
  visaReason: string | null;
  summary: string | null;
  postedAt: Date | null;
  firstSeenAt: Date;
  stage: string;
  isStarred: boolean;
  fitScore: number | null;
  sightings: number;
}

export function JobRow({ job }: { job: JobRowData }) {
  const [pending, startTransition] = useTransition();
  const salary = formatSalary(job);

  return (
    <article
      className={`group rounded-lg border border-border bg-surface p-3 transition-opacity ${
        pending ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          aria-label={job.isStarred ? "Remove star" : "Star this job"}
          aria-pressed={job.isStarred}
          onClick={() => startTransition(() => void toggleStar(job.id))}
          className="mt-0.5 shrink-0 text-lg leading-none transition-transform hover:scale-110"
          style={{ color: job.isStarred ? "var(--primary-hi)" : "var(--text-muted)" }}
        >
          {job.isStarred ? "★" : "☆"}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <Link
              href={`/jobs/${job.id}`}
              className="text-sm font-medium !text-text hover:!text-primary-hi"
            >
              {job.title}
            </Link>
            {job.companyName && (
              <span className="text-sm text-muted">{job.companyName}</span>
            )}
            <FitScore score={job.fitScore} />
          </div>

          {job.summary && (
            <p className="mt-1 line-clamp-2 text-xs text-muted">
              {job.summary}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {job.locationRaw && <Pill>{job.locationRaw}</Pill>}
            {job.remoteType !== "unknown" && job.remoteType !== "onsite" && (
              <Pill>{job.remoteType}</Pill>
            )}
            {salary && <Pill tone="success">{salary}</Pill>}
            {job.isHardwareAi && (
              <Pill tone="primary" title="Sits in the hardware × AI overlap">
                hardware×AI
              </Pill>
            )}
            {job.subDiscipline && <Pill>{job.subDiscipline}</Pill>}
            {job.isGradScheme && <Pill tone="primary">grad scheme</Pill>}
            {job.sightings > 1 && (
              <Pill title="Seen on more than one board">
                {job.sightings} boards
              </Pill>
            )}
            <VisaBadge
              uk={job.visaFeasibleUk}
              sg={job.visaFeasibleSg}
              reason={job.visaReason}
            />
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="text-[11px] text-muted">
            {relativeTime(job.postedAt ?? job.firstSeenAt)}
          </span>

          <div className="flex items-center gap-2">
            <StageBadge stage={job.stage} />
            <select
              aria-label="Change stage"
              value={job.stage}
              disabled={pending}
              onChange={(event) =>
                startTransition(() => void setStage(job.id, event.target.value))
              }
              className="rounded border border-border bg-surface-2 px-1.5 py-1 text-xs text-text"
            >
              {STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </div>

          <a
            href={job.url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-xs !text-primary-hi hover:underline"
          >
            Apply ↗
          </a>
        </div>
      </div>
    </article>
  );
}
