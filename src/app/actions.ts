"use server";

import { revalidatePath } from "next/cache";
import { eq, not, sql } from "drizzle-orm";
import { db } from "@/db";
import { allowlist, jobEvents, jobs, sessions, sources, users } from "@/db/schema";
import { auth, isBootstrapOwner, isOwner, requireUser } from "@/auth";
import { submitLink } from "@/lib/submit";

export async function toggleStar(jobId: string): Promise<void> {
  await requireUser();

  await db
    .update(jobs)
    .set({ isStarred: not(jobs.isStarred) })
    .where(eq(jobs.id, jobId));

  revalidatePath("/");
  revalidatePath("/starred");
  revalidatePath(`/jobs/${jobId}`);
}

export async function setStage(jobId: string, stage: string): Promise<void> {
  const user = await requireUser();

  await db
    .update(jobs)
    .set({ stage: stage as never })
    .where(eq(jobs.id, jobId));

  // Stage history is kept so the pipeline can be reviewed later, and because
  // "when did I apply" is the question you always want after the fact.
  await db.insert(jobEvents).values({
    jobId,
    type: `stage:${stage}`,
    actorEmail: user.email ?? undefined,
  });

  revalidatePath("/");
  revalidatePath("/board");
  revalidatePath(`/jobs/${jobId}`);
}

export async function addNote(jobId: string, note: string): Promise<void> {
  const user = await requireUser();
  if (!note.trim()) return;

  await db.insert(jobEvents).values({
    jobId,
    type: "note",
    note: note.trim(),
    actorEmail: user.email ?? undefined,
  });

  revalidatePath(`/jobs/${jobId}`);
}

export interface AddLinkState {
  message?: string;
  status?: "created" | "duplicate" | "filtered" | "failed";
}

export async function addLinkAction(
  _prev: AddLinkState,
  formData: FormData,
): Promise<AddLinkState> {
  const session = await auth();
  if (!session?.user) return { status: "failed", message: "Not signed in." };

  const url = String(formData.get("url") ?? "");
  const note = String(formData.get("note") ?? "");

  const result = await submitLink({
    url,
    note: note || undefined,
    submittedByEmail: session.user.email ?? undefined,
    submitterLabel: session.user.name ?? undefined,
  });

  revalidatePath("/");
  return { status: result.status, message: result.message };
}

export async function toggleSource(sourceId: string): Promise<void> {
  await requireUser();

  await db
    .update(sources)
    .set({ enabled: not(sources.enabled) })
    .where(eq(sources.id, sourceId));

  revalidatePath("/sources");
}

export async function setSourceCadence(
  sourceId: string,
  cadenceDays: number,
): Promise<void> {
  await requireUser();

  await db
    .update(sources)
    .set({ cadenceDays: Math.max(1, Math.min(cadenceDays, 30)) })
    .where(eq(sources.id, sourceId));

  revalidatePath("/sources");
}

/* ----------------------------------------------------------------- people */

export interface PeopleState {
  message?: string;
  ok?: boolean;
}

export async function addPersonAction(
  _prev: PeopleState,
  formData: FormData,
): Promise<PeopleState> {
  if (!(await isOwner())) return { ok: false, message: "Owners only." };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "contributor") === "owner"
    ? "owner"
    : "contributor";

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, message: "That doesn't look like an email address." };
  }

  // Case variants are cleared first: the primary key is exact-match, so
  // "Sam@Gmail.com" would otherwise survive alongside "sam@gmail.com" and the
  // role that applies at sign-in becomes whichever row comes back first.
  await db.delete(allowlist).where(sql`lower(${allowlist.email}) = ${email}`);
  await db.insert(allowlist).values({ email, role });

  revalidatePath("/people");
  return { ok: true, message: `${email} can now sign in as ${role}.` };
}

export async function removePerson(email: string): Promise<void> {
  if (!(await isOwner())) throw new Error("Owners only");

  const session = await auth();
  const target = email.trim().toLowerCase();

  // Removing yourself, or an address held open by OWNER_EMAIL, would either
  // lock you out or silently fail on the next sign-in.
  if (target === (session?.user?.email ?? "").toLowerCase()) return;
  if (isBootstrapOwner(target)) return;

  await db.delete(allowlist).where(sql`lower(${allowlist.email}) = ${target}`);

  // Kill any live session immediately rather than waiting for the next request
  // to notice the row is gone.
  const matched = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${target}`);
  for (const user of matched) {
    await db.delete(sessions).where(eq(sessions.userId, user.id));
  }

  revalidatePath("/people");
}
