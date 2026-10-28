import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { env } from "@/lib/env";
import { runCrawl } from "@/pipeline/crawl";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * On-demand crawl trigger for the UI, and a bearer-token entry point for
 * anything external.
 *
 * The scheduled crawl deliberately does NOT run here, Vercel's Hobby plan caps
 * cron at one run per day and functions well below what a multi-source crawl
 * needs. GitHub Actions owns the schedule; this is for "go and look now".
 */
export async function POST(request: Request) {
  const session = await auth();
  const secret = env.crawlSecret();
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  const authorised = Boolean(session?.user) || (secret && bearer === secret);
  if (!authorised) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    provider?: string;
    sourceId?: string;
    tier?: number;
    force?: boolean;
  };

  // Tier 4 is excluded on purpose: this runs on Vercel's datacentre IPs, which
  // LinkedIn, Indeed and Glassdoor block. Those run from the local runner.
  if (body.tier === 4) {
    return NextResponse.json(
      {
        error:
          "Tier 4 cannot run in the cloud, datacentre IPs are blocked. Run `pnpm crawl --tier=4` locally.",
      },
      { status: 400 },
    );
  }

  const logs: string[] = [];
  const results = await runCrawl({
    provider: body.provider,
    sourceId: body.sourceId,
    tier: body.tier,
    force: body.force,
    log: (message) => logs.push(message),
  });

  return NextResponse.json({
    results: results.map((r) => ({
      label: r.label,
      status: r.status,
      created: r.created,
      updated: r.updated,
      filtered: r.filtered,
      error: r.error,
    })),
    logs,
  });
}
