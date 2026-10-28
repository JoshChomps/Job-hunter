import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { auth, isBootstrapOwner, isOwner } from "@/auth";
import { db } from "@/db";
import { allowlist } from "@/db/schema";
import { PeopleManager } from "@/components/people-manager";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Who can sign in. Owner-only, and the reason it exists is that managing this
 * by hand-written SQL means being locked out of your own app whenever a
 * terminal isn't available.
 */
export default async function PeoplePage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  if (!(await isOwner())) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-lg font-semibold">Owners only</h1>
        <p className="mt-2 text-sm text-muted">
          Ask the owner if you need someone added.
        </p>
      </div>
    );
  }

  const people = await db.select().from(allowlist).orderBy(asc(allowlist.email));

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-lg font-semibold">People</h1>
        <p className="mt-1 text-sm text-muted">
          Only these addresses can sign in. Removing someone revokes their
          access immediately, including any session they already have open.
        </p>
      </div>

      <PeopleManager
        people={people.map((person) => ({
          email: person.email,
          role: person.role,
          label: person.label,
          isBootstrap: isBootstrapOwner(person.email),
        }))}
        currentEmail={session.user.email ?? ""}
      />

      <section className="rounded-lg border border-border bg-surface p-4 text-sm text-muted">
        <h2 className="text-sm font-semibold text-text">Sharing without an account</h2>
        <p className="mt-1">
          Friends who won&apos;t sign in can still send links through the submit
          page: it needs no account and can only add, never read.
        </p>
        {env.submitToken() ? (
          <code className="mt-2 block overflow-x-auto rounded bg-surface-2 p-2 text-xs">
            {env.appUrl()}/submit?token={env.submitToken()}
          </code>
        ) : (
          <p className="mt-2 text-xs">
            Set <code>SUBMIT_TOKEN</code> in your environment variables to enable it.
          </p>
        )}
      </section>
    </div>
  );
}
