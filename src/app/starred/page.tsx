import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listJobs } from "@/lib/queries";
import { JobRow } from "@/components/job-row";
import { EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * The starred folder. Deliberately unfiltered by stage and by visa status, if
 * you starred it, you want to see it, whatever the gate thinks.
 */
export default async function StarredPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const { jobs } = await listJobs({
    starred: true,
    showInfeasible: true,
    sort: "newest",
    limit: 300,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Starred</h1>
        <p className="text-xs text-muted">{jobs.length} saved</p>
      </div>

      {jobs.length === 0 ? (
        <EmptyState title="No starred jobs">
          Star anything worth a second look with the ☆ on a job row. Starred jobs
          stay visible even if the visa gate would otherwise hide them.
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
