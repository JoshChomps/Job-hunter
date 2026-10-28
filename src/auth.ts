import NextAuth, { type Session } from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, allowlist, sessions, users, verificationTokens } from "@/db/schema";

/**
 * Private by design: Google sign-in gated on an allowlist table, so an invite
 * works before the person has ever visited. Anyone not on the list is refused
 * at sign-in rather than being created as a dormant user.
 *
 * Friends who won't sign up at all use the tokenised /submit page instead,
 * which needs no account and can only add links.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [Google],
  session: { strategy: "database" },
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;

      // Bootstrap owners are let in regardless, and their row is created so
      // they appear in the people list like everyone else.
      if (isBootstrapOwner(email)) {
        await db
          .insert(allowlist)
          .values({ email, role: "owner", label: "Owner" })
          .onConflictDoUpdate({ target: allowlist.email, set: { role: "owner" } });
        return true;
      }

      const rows = await lookupAllowlist(email);

      if (rows.length === 0) {
        // Surfaced in the Vercel function logs. Without it, a rejected sign-in
        // gives no way to tell whether the address is genuinely absent or the
        // account used simply wasn't the one expected.
        console.warn(`[auth] sign-in refused, not on allowlist: ${email}`);
      }

      return rows.length > 0;
    },

    /**
     * Re-checked on every request, not just at sign-in. Sessions live in the
     * database and survive for days, so without this an uninvited person keeps
     * full write access until their session happens to expire, removing them
     * from the allowlist would do nothing.
     */
    async session({ session, user }) {
      const email = (user.email ?? "").toLowerCase();

      if (isBootstrapOwner(email)) {
        if (session.user) {
          session.user.id = user.id;
          (session.user as { role?: string }).role = "owner";
        }
        return session;
      }

      const rows = await lookupAllowlist(email);

      if (rows.length === 0) {
        // Access was revoked. Drop the stored sessions so every later request
        // is unauthenticated too, and hand back a session with no user so this
        // one is refused as well.
        await db.delete(sessions).where(eq(sessions.userId, user.id));
        console.warn(`[auth] session revoked, no longer on allowlist: ${user.email}`);
        return { ...session, user: undefined } as unknown as Session;
      }

      if (session.user) {
        session.user.id = user.id;
        (session.user as { role?: string }).role = rows[0].role;
      }
      return session;
    },
  },
});

/**
 * Addresses in OWNER_EMAIL are always allowed, whether or not a database row
 * exists.
 *
 * Without this, the only way into a fresh deployment is inserting a row by
 * hand: which needs either a terminal or the SQL console, and locks you out of
 * your own app if neither is to hand. An env var can be set from the Vercel
 * dashboard on a phone. Comma-separated for more than one.
 */
function ownerEmails(): string[] {
  return (process.env.OWNER_EMAIL ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isBootstrapOwner(email: string | null | undefined): boolean {
  if (!email) return false;
  return ownerEmails().includes(email.toLowerCase());
}

/**
 * Compared case-insensitively on both sides. Allowlist rows get added by hand
 * when inviting someone, and "Sam@Gmail.com" silently never matching is a trap
 * not worth leaving lying around.
 */
async function lookupAllowlist(email: string) {
  return db
    .select({ role: allowlist.role })
    .from(allowlist)
    .where(sql`lower(${allowlist.email}) = ${email.toLowerCase()}`)
    .limit(1);
}

export async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorised");
  return session.user;
}

export async function isOwner(): Promise<boolean> {
  const session = await auth();
  return (session?.user as { role?: string } | undefined)?.role === "owner";
}
