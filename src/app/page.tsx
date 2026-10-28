import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { dashboardStats, listJobs } from "@/lib/queries";
import { JobRow } from "@/components/job-row";
import { Filters } from "@/components/filters";
import { AddLink } from "@/components/add-link";
import { EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function InboxPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const params = await searchParams;

  const { jobs } = await listJobs({
    q: one(params.q),
    country: one(params.country),
    discipline: one(params.discipline),
    hardwareAi: one(params.hardwareAi) === "true",
    showInfeasible: one(params.showInfeasible) === "true",
    sort: (one(params.sort) as "newest" | "fit" | "salary" | "title") ?? "newest",
    stage: one(params.stage),
  });

  const stats = await dashboardStats();
  const hiddenCount = stats.hiddenUk + stats.hiddenSg;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Inbox</h1>
        <p className="text-xs text-muted">
          {stats.total} tracked · {stats.starred} starred
          {hiddenCount > 0 && ` · ${hiddenCount} hidden as unsponsorable`}
          {stats.atRisk > 0 && ` · ${stats.atRisk} at 2027 threshold risk`}
        </p>
      </div>

      <AddLink />
      <Filters hiddenCount={hiddenCount} />

      {jobs.length === 0 ? (
        <EmptyState title="Nothing here yet">
          Paste a link above, or run a crawl with{" "}
          <code className="rounded bg-surface-2 px-1">pnpm crawl --force</code>{" "}
          once your API keys are set.
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}
