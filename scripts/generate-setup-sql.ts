import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_NEGATIVE_KEYWORDS } from "@/pipeline/filter";
import { slugify } from "@/pipeline/normalize";
import {
  buildSeedSources,
  TARGET_COMPANIES,
  THRESHOLDS,
} from "@/lib/seed-data";

/**
 * Produces `setup.sql`: the whole schema plus all seed data in one file, so
 * the database can be set up by pasting into Neon's browser SQL Editor with no
 * terminal involved.
 *
 * Regenerate after any schema or seed change:
 *   pnpm tsx scripts/generate-setup-sql.ts
 */

/** Single-quote escaping for SQL literals. */
function lit(value: string | null | undefined): string {
  if (value == null) return "NULL";
  return `'${value.replace(/'/g, "''")}'`;
}

function jsonLit(value: unknown): string {
  return `${lit(JSON.stringify(value))}::jsonb`;
}

function textArray(values: string[]): string {
  return `ARRAY[${values.map(lit).join(", ")}]::text[]`;
}

const ownerEmail = process.argv
  .find((a) => a.startsWith("--owner="))
  ?.split("=")[1];

const migrationsDir = path.join(process.cwd(), "drizzle");
const files = (await readdir(migrationsDir))
  .filter((f) => f.endsWith(".sql"))
  .sort();

const parts: string[] = [];

parts.push(`-- Job Hunter: complete database setup
--
-- Paste this whole file into the Neon SQL Editor and run it once. It creates
-- every table and loads the seed data, replacing "pnpm db:migrate && pnpm seed"
-- for anyone setting up without a terminal.
--
-- Safe to re-run: every statement is guarded or conflict-tolerant.
--
-- GENERATED FILE: do not edit by hand.
-- Regenerate with: pnpm tsx scripts/generate-setup-sql.ts
`);

/* ------------------------------------------------------------------ schema */

parts.push(`
-- ============================================================
--  1. Schema
-- ============================================================
`);

for (const file of files) {
  const sql = await readFile(path.join(migrationsDir, file), "utf8");
  parts.push(makeIdempotent(sql));
}

/**
 * Drizzle's migrations assume they run exactly once, tracked by its journal.
 * Pasting into a SQL editor has no such tracking, and a half-finished paste or
 * a lost connection is a realistic way to end up re-running this. So every
 * statement is rewritten to tolerate already existing.
 */
function makeIdempotent(sql: string): string {
  return (
    sql
      // Drizzle's statement separator; plain SQL clients don't understand it.
      .replace(/-->\s*statement-breakpoint/g, "")
      .replace(/\bCREATE TABLE\b(?! IF NOT EXISTS)/g, "CREATE TABLE IF NOT EXISTS")
      .replace(
        /\bCREATE (UNIQUE )?INDEX\b(?! IF NOT EXISTS)/g,
        (_, unique) => `CREATE ${unique ?? ""}INDEX IF NOT EXISTS`,
      )
      // Postgres has no CREATE TYPE IF NOT EXISTS, so swallow the duplicate.
      .replace(
        /CREATE TYPE ([\s\S]*?);(?=\s*(?:CREATE|ALTER|$))/g,
        (_match, body: string) =>
          `DO $$ BEGIN\n  CREATE TYPE ${body.trim()};\nEXCEPTION WHEN duplicate_object THEN NULL;\nEND $$;`,
      )
      // Same for foreign keys, which have no IF NOT EXISTS either.
      .replace(
        /ALTER TABLE ([\s\S]*?);(?=\s*(?:CREATE|ALTER|$))/g,
        (_match, body: string) =>
          `DO $$ BEGIN\n  ALTER TABLE ${body.trim()};\nEXCEPTION WHEN duplicate_object THEN NULL;\nEND $$;`,
      )
  );
}

/* -------------------------------------------------------------- seed data */

parts.push(`
-- ============================================================
--  2. Visa thresholds
--     Date-aware because Singapore's EP floor rises on 1 Jan 2027.
-- ============================================================
`);

for (const t of THRESHOLDS) {
  parts.push(
    `INSERT INTO visa_thresholds (market, variant, effective_from, min_salary, currency, period, notes)
SELECT ${lit(t.market)}, ${lit(t.variant)}, ${lit(t.effectiveFrom)}::timestamp, ${t.minSalary}, ${lit(t.currency)}, ${lit(t.period)}, ${lit(t.notes)}
WHERE NOT EXISTS (
  SELECT 1 FROM visa_thresholds
  WHERE market = ${lit(t.market)} AND variant = ${lit(t.variant)}
    AND effective_from = ${lit(t.effectiveFrom)}::timestamp
);`,
  );
}

parts.push(`
-- ============================================================
--  3. Negative keywords
--     "electrical" and "AI" are extremely noisy queries; without these the
--     inbox fills with electricians and data-annotation gigs.
-- ============================================================
`);

const keywordValues = DEFAULT_NEGATIVE_KEYWORDS.map(
  (k) => `(${lit(k)}, 'negative', 'title')`,
).join(",\n  ");

parts.push(
  `INSERT INTO filter_keywords (keyword, kind, field) VALUES
  ${keywordValues}
ON CONFLICT (keyword, field) DO NOTHING;`,
);

parts.push(`
-- ============================================================
--  4. Allowlist
--     Only these email addresses can sign in. Add friends with:
--       INSERT INTO allowlist (email, role, label)
--       VALUES ('friend@example.com', 'contributor', 'Sam')
--       ON CONFLICT DO NOTHING;
-- ============================================================
`);

if (ownerEmail) {
  parts.push(
    `INSERT INTO allowlist (email, role, label)
VALUES (${lit(ownerEmail.toLowerCase())}, 'owner', 'Owner')
ON CONFLICT (email) DO NOTHING;`,
  );
} else {
  parts.push(
    `-- !! Replace the address below with your Google account before running,
-- !! otherwise nobody will be able to sign in.
INSERT INTO allowlist (email, role, label)
VALUES ('you@example.com', 'owner', 'Owner')
ON CONFLICT (email) DO NOTHING;`,
  );
}

parts.push(`
-- ============================================================
--  5. Target companies
--     Seeded for the electrical x AI overlap in the three markets. Their job
--     boards get resolved later by scripts/detect-ats.ts.
-- ============================================================
`);

const companyValues = TARGET_COMPANIES.map(
  (c) => `(${lit(c.name)}, ${lit(slugify(c.name))}, ${lit(c.hqCountry)}, true)`,
).join(",\n  ");

parts.push(
  `INSERT INTO companies (name, slug, hq_country, is_target) VALUES
  ${companyValues}
ON CONFLICT (slug) DO NOTHING;`,
);

const seedSources = buildSeedSources();

parts.push(`
-- ============================================================
--  6. Saved searches (${seedSources.length} sources)
--     Split evenly between electrical and AI across all three markets.
-- ============================================================
`);

const sourceValues = seedSources
  .map(
    (s) =>
      `(${lit(s.kind)}, ${s.tier}, ${lit(s.provider)}, ${lit(s.label)}, ${
        s.market ? lit(s.market) : "NULL"
      }, ${s.cadenceDays}, ${jsonLit(s.config)})`,
  )
  .join(",\n  ");

// Two things this INSERT has to get right:
//   - `kind` is an enum, and Postgres has no implicit text -> enum cast once a
//     VALUES literal has been resolved to text inside a subquery, so it is cast
//     explicitly.
//   - `sources.label` has no unique constraint, so absence is checked with NOT
//     EXISTS rather than ON CONFLICT, keeping the file safe to run twice.
parts.push(
  `INSERT INTO sources (kind, tier, provider, label, market, cadence_days, config)
SELECT v.kind::source_kind, v.tier, v.provider, v.label, v.market, v.cadence_days, v.config
FROM (VALUES
  ${sourceValues}
) AS v(kind, tier, provider, label, market, cadence_days, config)
WHERE NOT EXISTS (SELECT 1 FROM sources s WHERE s.label = v.label);`,
);

parts.push(`
-- ============================================================
--  Done.
-- ============================================================
--
-- Check it worked:
--   SELECT count(*) FROM sources;          -- expect ${seedSources.length}
--   SELECT count(*) FROM companies;        -- expect ${TARGET_COMPANIES.length}
--   SELECT count(*) FROM filter_keywords;  -- expect ${DEFAULT_NEGATIVE_KEYWORDS.length}
--   SELECT email, role FROM allowlist;     -- your address, as owner
`);

const output = parts.join("\n");

const target = path.join(process.cwd(), "setup.sql");
await writeFile(target, `${output}\n`, "utf8");

console.log(`Wrote ${target}`);
console.log(
  `  ${files.length} migration file(s), ${THRESHOLDS.length} thresholds, ` +
    `${DEFAULT_NEGATIVE_KEYWORDS.length} keywords, ${TARGET_COMPANIES.length} companies, ` +
    `${seedSources.length} sources`,
);

process.exit(0);
