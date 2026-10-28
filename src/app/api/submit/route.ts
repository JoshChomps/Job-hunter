import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { submitLink } from "@/lib/submit";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  token: z.string(),
  url: z.string().url(),
  note: z.string().max(500).optional().nullable(),
  name: z.string().max(80).optional().nullable(),
});

/**
 * Write-only endpoint for the tokenised submit page. It never returns tracker
 * data, so a leaked token can add noise but cannot read anything.
 */
export async function POST(request: Request) {
  const expected = env.submitToken();
  if (!expected) {
    return NextResponse.json(
      { status: "failed", message: "Submissions are disabled." },
      { status: 503 },
    );
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { status: "failed", message: "That doesn't look like a valid job URL." },
      { status: 400 },
    );
  }

  if (parsed.data.token !== expected) {
    return NextResponse.json(
      { status: "failed", message: "Invalid submit link." },
      { status: 403 },
    );
  }

  const result = await submitLink({
    url: parsed.data.url,
    note: parsed.data.note ?? undefined,
    submitterLabel: parsed.data.name ?? undefined,
  });

  return NextResponse.json(result, {
    status: result.status === "failed" ? 422 : 200,
  });
}
