import "./bootstrap";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { allowlist } from "@/db/schema";

/**
 * Manage who can sign in, without hand-writing SQL.
 *
 *   pnpm allowlist                                 list everyone
 *   pnpm allowlist -- add you@example.com owner
 *   pnpm allowlist -- add friend@example.com       (defaults to contributor)
 *   pnpm allowlist -- remove friend@example.com
 */

const [command, rawEmail, rawRole] = process.argv.slice(2);
const email = rawEmail?.trim().toLowerCase();

if (!command || command === "list") {
  const rows = await db.select().from(allowlist);
  if (rows.length === 0) {
    console.log("Allowlist is empty, nobody can sign in.");
    console.log("Add yourself:  pnpm allowlist -- add you@example.com owner");
  } else {
    console.log(`${rows.length} allowed:\n`);
    for (const row of rows) {
      console.log(`  ${row.email.padEnd(34)} ${row.role}${row.label ? `  (${row.label})` : ""}`);
    }
  }
  process.exit(0);
}

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error(`Not a valid email: ${rawEmail ?? "(missing)"}`);
  process.exit(1);
}

if (command === "add") {
  const role = rawRole === "owner" ? "owner" : "contributor";

  // Case variants are removed first rather than upserted onto. The primary key
  // is exact-match, so a hand-inserted "Sam@Gmail.com" would not conflict with
  // "sam@gmail.com" and both rows would survive, after which the role that
  // wins at sign-in is whichever the database happens to return first.
  await db.delete(allowlist).where(sql`lower(${allowlist.email}) = ${email}`);
  await db
    .insert(allowlist)
    .values({ email, role, label: rawRole === "owner" ? "Owner" : undefined });

  console.log(`Added ${email} as ${role}.`);
  process.exit(0);
}

if (command === "remove") {
  // Reporting the deleted rows rather than assuming: a mistyped address would
  // otherwise print "Removed" while the real entry kept its access.
  const removed = await db
    .delete(allowlist)
    .where(sql`lower(${allowlist.email}) = ${email}`)
    .returning({ email: allowlist.email });

  if (removed.length === 0) {
    console.error(`No allowlist entry for ${email}, nothing removed.`);
    process.exit(1);
  }

  console.log(`Removed ${removed.map((r) => r.email).join(", ")}.`);
  console.log("Their existing sessions are revoked on their next request.");
  process.exit(0);
}

console.error(`Unknown command "${command}". Use list, add or remove.`);
process.exit(1);
