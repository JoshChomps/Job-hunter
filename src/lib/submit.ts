import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs, submissions } from "@/db/schema";
import { canonicaliseUrl, capDescription, hashUrl } from "@/pipeline/normalize";
import { buildIngestContext, ingestOne } from "@/pipeline/ingest";
import { isFirecrawlConfigured, scrape } from "./firecrawl";
import { isEnrichmentConfigured, parseJobPage } from "./llm";
import type { RawJob } from "@/pipeline/types";

export interface SubmitResult {
  status: "created" | "duplicate" | "filtered" | "failed";
  jobId?: string;
  message: string;
}

/**
 * The paste-a-link path, shared by the signed-in UI and the tokenised submit
 * page. Firecrawl turns an arbitrary page into clean markdown and Claude turns
 * that into fields: which is what lets a friend paste a link instead of
 * filling in a form.
 *
 * Everything lands in the same ingest path as a crawled job, so a pasted link
 * gets the same filtering, dedupe and visa gate.
 */
export async function submitLink(input: {
  url: string;
  note?: string;
  submittedByEmail?: string;
  submitterLabel?: string;
}): Promise<SubmitResult> {
  const url = input.url.trim();

  if (!/^https?:\/\//i.test(url)) {
    return { status: "failed", message: "That doesn't look like a URL." };
  }

  const [submission] = await db
    .insert(submissions)
    .values({
      rawUrl: url,
      note: input.note,
      submittedByEmail: input.submittedByEmail,
      submitterLabel: input.submitterLabel,
    })
    .returning({ id: submissions.id });

  async function finish(result: SubmitResult): Promise<SubmitResult> {
    await db
      .update(submissions)
      .set({
        status:
          result.status === "created"
            ? "parsed"
            : result.status === "duplicate"
              ? "duplicate"
              : "failed",
        jobId: result.jobId,
        error: result.status === "failed" ? result.message : null,
      })
      .where(eq(submissions.id, submission.id));
    return result;
  }

  try {
    const canonical = canonicaliseUrl(url);
    const existing = await db
      .select({ id: jobs.id, title: jobs.title })
      .from(jobs)
      .where(eq(jobs.urlHash, hashUrl(canonical)))
      .limit(1);

    if (existing.length > 0) {
      return finish({
        status: "duplicate",
        jobId: existing[0].id,
        message: `Already tracked: ${existing[0].title}`,
      });
    }

    const raw = await buildRawJob(url, input.note);
    const ctx = await buildIngestContext(() => {});
    const outcome = await ingestOne(raw, undefined, ctx);

    if (outcome === "filtered") {
      return finish({
        status: "filtered",
        message:
          "Added but filtered out by the negative-keyword rules, check Sources if that looks wrong.",
      });
    }

    const [created] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.urlHash, hashUrl(canonical)))
      .limit(1);

    return finish({
      status: "created",
      jobId: created?.id,
      message: `Added "${raw.title}"${raw.companyName ? ` at ${raw.companyName}` : ""}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return finish({ status: "failed", message });
  }
}

/**
 * Degrades in stages: Firecrawl + Claude gives full fields, Firecrawl alone
 * gives the page text, and neither still records the link. A missing API key
 * should never mean a lost job.
 */
async function buildRawJob(url: string, note?: string): Promise<RawJob> {
  if (!isFirecrawlConfigured()) {
    return { url, title: titleFromUrl(url), description: note };
  }

  const page = await scrape(url, { stealth: false });

  if (!isEnrichmentConfigured()) {
    return {
      url,
      title: page.title ?? titleFromUrl(url),
      description: capDescription(page.markdown),
    };
  }

  const parsed = await parseJobPage(page.markdown, url);

  if (!parsed.isJobPosting) {
    throw new Error(
      "That page doesn't look like a single job posting, it may be a search results page or expired.",
    );
  }

  return {
    url,
    title: parsed.title ?? page.title ?? titleFromUrl(url),
    companyName: parsed.companyName,
    locationRaw: parsed.locationRaw,
    country: parsed.country,
    remote: parsed.remoteType === "remote",
    hybrid: parsed.remoteType === "hybrid",
    employmentType: parsed.employmentType,
    salaryMin: parsed.salaryMin,
    salaryMax: parsed.salaryMax,
    salaryCurrency: parsed.salaryCurrency,
    salaryPeriod: parsed.salaryPeriod,
    description: capDescription(
      note ? `${parsed.description ?? ""}\n\n---\nSubmitter note: ${note}` : parsed.description,
    ),
    raw: { via: "submit", parsed },
  };
}

function titleFromUrl(url: string): string {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1] ?? "";
    return (
      last
        .replace(/\.(html?|php|aspx)$/i, "")
        .replace(/[-_]+/g, " ")
        .replace(/\b[0-9a-f]{8,}\b/gi, "")
        .replace(/\s+/g, " ")
        .trim() || "Untitled role"
    );
  } catch {
    return "Untitled role";
  }
}
