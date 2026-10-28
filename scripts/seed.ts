import "./bootstrap";
import { db } from "@/db";
import {
  allowlist,
  companies,
  filterKeywords,
  sources,
  visaThresholds,
} from "@/db/schema";
import { DEFAULT_NEGATIVE_KEYWORDS } from "@/pipeline/filter";
import { slugify } from "@/pipeline/normalize";
import { buildSeedSources, TARGET_COMPANIES, THRESHOLDS } from "@/lib/seed-data";

/**
 * Seeds reference data and a starting set of sources. Safe to re-run.
 *
 * The data itself lives in `src/lib/seed-data.ts`, shared with
 * `scripts/generate-setup-sql.ts`, so the terminal path and the
 * paste-into-Neon path can't drift apart.
 */

console.log("Seeding visa thresholds...");
for (const threshold of THRESHOLDS) {
  await db
    .insert(visaThresholds)
    .values({
      market: threshold.market,
      variant: threshold.variant,
      effectiveFrom: new Date(`${threshold.effectiveFrom}T00:00:00Z`),
      minSalary: threshold.minSalary,
      currency: threshold.currency,
      period: threshold.period,
      notes: threshold.notes,
    })
    .onConflictDoNothing();
}

console.log("Seeding negative keywords...");
await db
  .insert(filterKeywords)
  .values(
    DEFAULT_NEGATIVE_KEYWORDS.map((keyword) => ({
      keyword,
      kind: "negative",
      field: "title",
    })),
  )
  .onConflictDoNothing();

const ownerEmail = process.env.OWNER_EMAIL;
if (ownerEmail) {
  console.log(`Allowlisting owner ${ownerEmail}...`);
  await db
    .insert(allowlist)
    .values({ email: ownerEmail.toLowerCase(), role: "owner", label: "Owner" })
    .onConflictDoNothing();
} else {
  console.log("OWNER_EMAIL not set, skipping allowlist seed (nobody can sign in yet).");
}

console.log("Seeding target companies...");
for (const company of TARGET_COMPANIES) {
  await db
    .insert(companies)
    .values({
      name: company.name,
      slug: slugify(company.name),
      hqCountry: company.hqCountry,
      isTarget: true,
    })
    .onConflictDoNothing({ target: companies.slug });
}

console.log("Seeding saved searches...");
const existing = await db.select({ label: sources.label }).from(sources);
const existingLabels = new Set(existing.map((s) => s.label));

const newSources = buildSeedSources().filter((s) => !existingLabels.has(s.label));

if (newSources.length > 0) {
  await db.insert(sources).values(
    newSources.map((s) => ({
      kind: s.kind,
      tier: s.tier,
      provider: s.provider,
      label: s.label,
      market: s.market,
      cadenceDays: s.cadenceDays,
      config: s.config,
    })),
  );
}
console.log(`Added ${newSources.length} sources.`);

console.log("\nSeed complete.");
console.log("Next: pnpm tsx scripts/detect-ats.ts   (resolve target company job boards)");
console.log("      pnpm sponsors:import -- --url=... (UK sponsor register)");
console.log("      pnpm crawl --force                 (first crawl)");

process.exit(0);
