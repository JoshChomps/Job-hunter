import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getJob } from "@/lib/queries";
import { JobActions } from "@/components/job-actions";
import {
  FitScore,
  Pill,
  StageBadge,
  VisaBadge,
  formatSalary,
  relativeTime,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const { id } = await params;
  const record = await getJob(id);
  if (!record) notFound();

  const { job, company, enrichment, sightings, duplicates } = record;
  const salary = formatSalary(job);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/" className="text-xs !text-muted hover:underline">
        ← Back to inbox
      </Link>

      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{job.title}</h1>
            <p className="mt-1 text-sm text-muted">
              {company?.name ?? job.companyNameRaw ?? "Unknown company"}
              {job.locationRaw ? ` · ${job.locationRaw}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <FitScore score={enrichment?.fitScore} />
            <StageBadge stage={job.stage} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {salary && <Pill tone="success">{salary}</Pill>}
          {job.remoteType !== "unknown" && <Pill>{job.remoteType}</Pill>}
          {job.employmentType && <Pill>{job.employmentType}</Pill>}
          {job.seniority !== "unknown" && <Pill>{job.seniority.replace("_", " ")}</Pill>}
          {job.subDiscipline && <Pill>{job.subDiscipline}</Pill>}
          {job.isHardwareAi && <Pill tone="primary">hardware×AI</Pill>}
          {job.isGradScheme && <Pill tone="primary">grad scheme</Pill>}
          <VisaBadge
            uk={job.visaFeasibleUk}
            sg={job.visaFeasibleSg}
            reason={job.visaReason}
          />
        </div>

        <JobActions
          jobId={job.id}
          stage={job.stage}
          isStarred={job.isStarred}
          applyUrl={job.url}
        />
      </header>

      {/* Work authorisation is the gate that decides whether this is even
          possible, so it sits above the description rather than in a footer. */}
      {(job.visaFeasibleUk !== "unknown" || job.visaFeasibleSg !== "unknown") && (
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">Work authorisation</h2>
          <p className="mt-1 text-sm text-muted">
            {job.visaReason ?? "No assessment recorded."}
          </p>
          {company && job.country === "GB" && (
            <p className="mt-2 text-xs text-muted">
              Sponsor register:{" "}
              {company.ukSponsorLicence
                ? `matched "${company.ukSponsorMatchedName}"${
                    company.ukSponsorRating ? ` (${company.ukSponsorRating})` : ""
                  }`
                : "no match found, the employer may be listed under a different legal name"}
            </p>
          )}
          {enrichment?.sponsorshipStatement && (
            <p className="mt-2 border-l-2 border-border pl-3 text-xs italic text-muted">
              “{enrichment.sponsorshipStatement}”
            </p>
          )}
        </section>
      )}

      {enrichment?.reasons && enrichment.reasons.length > 0 && (
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">Fit assessment</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {enrichment.reasons.map((reason, index) => (
              <li key={index} className="flex gap-2">
                <span aria-hidden>·</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
          {enrichment.techStack && enrichment.techStack.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {enrichment.techStack.map((tech) => (
                <Pill key={tech}>{tech}</Pill>
              ))}
            </div>
          )}
        </section>
      )}

      {sightings.length > 1 && (
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">
            Also listed on {sightings.length} boards
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {sightings.map((sighting) => (
              <li key={sighting.id}>
                <a href={sighting.url} target="_blank" rel="noreferrer noopener">
                  {sighting.provider} ↗
                </a>
              </li>
            ))}
            {duplicates.map((duplicate) => (
              <li key={duplicate.id}>
                <a href={duplicate.url} target="_blank" rel="noreferrer noopener">
                  {duplicate.title} ↗
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Description</h2>
        {job.descriptionSummary && (
          <p className="mt-2 text-sm">{job.descriptionSummary}</p>
        )}
        <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-muted">
          {job.descriptionRaw ?? "No description captured."}
        </pre>
      </section>

      <footer className="text-xs text-muted">
        First seen {relativeTime(job.firstSeenAt)}
        {job.postedAt && ` · posted ${relativeTime(job.postedAt)}`}
        {job.closesAt && ` · closes ${job.closesAt.toDateString()}`}
      </footer>
    </div>
  );
}
