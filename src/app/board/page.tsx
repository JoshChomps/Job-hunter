import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listJobs } from "@/lib/queries";
import { FitScore, STAGES, formatSalary, relativeTime } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Stages worth a column, archived is deliberately excluded from the board. */
const COLUMNS = STAGES.filter((stage) => stage !== "archived");

const COLUMN_COLOUR: Record<string, string> = {
  inbox: "var(--stage-inbox)",
  shortlist: "var(--stage-shortlist)",
  applied: "var(--stage-applied)",
  interview: "var(--stage-interview)",
  offer: "var(--stage-offer)",
  rejected: "var(--stage-rejected)",
};

export default async function BoardPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const { jobs } = await listJobs({ limit: 300, showInfeasible: false, sort: "fit" });

  const byStage = new Map<string, typeof jobs>();
  for (const stage of COLUMNS) byStage.set(stage, []);
  for (const job of jobs) byStage.get(job.stage)?.push(job);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Pipeline</h1>

      <div className="scroll-x -mx-4 px-4 pb-2">
        <div className="flex min-w-max gap-3">
          {COLUMNS.map((stage) => {
            const columnJobs = byStage.get(stage) ?? [];
            const colour = COLUMN_COLOUR[stage];

            return (
              <section key={stage} className="w-72 shrink-0">
                <header className="mb-2 flex items-center justify-between">
                  <span
                    className="text-xs font-semibold uppercase tracking-wide"
                    style={{ color: colour }}
                  >
                    {stage}
                  </span>
                  <span className="text-xs text-muted">
                    {columnJobs.length}
                  </span>
                </header>

                <div
                  className="space-y-2 rounded-lg border border-border p-2"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${colour} 4%, var(--surface))`,
                    minHeight: "6rem",
                  }}
                >
                  {columnJobs.length === 0 && (
                    <p className="px-1 py-3 text-xs text-muted">Empty</p>
                  )}

                  {columnJobs.map((job) => {
                    const salary = formatSalary(job);
                    return (
                      <Link
                        key={job.id}
                        href={`/jobs/${job.id}`}
                        className="block rounded-md border border-border bg-surface p-2 !text-text transition-colors hover:bg-surface-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-medium leading-snug">
                            {job.isStarred && (
                              <span style={{ color: "var(--primary-hi)" }}>★ </span>
                            )}
                            {job.title}
                          </span>
                          <FitScore score={job.fitScore} />
                        </div>

                        <p className="mt-1 truncate text-[11px] text-muted">
                          {job.companyName ?? "Unknown company"}
                          {job.locationRaw ? ` · ${job.locationRaw}` : ""}
                        </p>

                        <p className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                          {salary && <span>{salary}</span>}
                          <span className="ml-auto">
                            {relativeTime(job.postedAt ?? job.firstSeenAt)}
                          </span>
                        </p>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-muted">
        Change a job&apos;s stage from the inbox or its detail page.
      </p>
    </div>
  );
}
