import "./bootstrap";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, sources } from "@/db/schema";
import { detectAtsFromUrl, probeAts } from "@/adapters/detect";

/**
 * Resolves which ATS each target company uses and creates the matching source.
 *
 * This is the alternative to hand-maintaining a company → ATS mapping: probe
 * the five public board endpoints and record whichever answers with real
 * postings.
 *
 *   pnpm tsx scripts/detect-ats.ts
 *   pnpm tsx scripts/detect-ats.ts --url=https://boards.greenhouse.io/acme --name="Acme"
 */

function arg(name: string): string | undefined {
  const match = process.argv.find((a) => a.startsWith(`--${name}=`));
  return match ? match.split("=").slice(1).join("=") : undefined;
}

const singleUrl = arg("url");
const singleName = arg("name");

async function createSource(
  companyId: string,
  companyName: string,
  detection: Awaited<ReturnType<typeof probeAts>>,
): Promise<boolean> {
  if (detection.ats === "none") return false;

  const label = `${companyName} (${detection.ats})`;
  const existing = await db
    .select({ id: sources.id })
    .from(sources)
    .where(eq(sources.label, label))
    .limit(1);
  if (existing.length > 0) return false;

  await db.insert(sources).values({
    kind: "company",
    // Workday needs stealth from CI; the rest are plain JSON endpoints.
    tier: detection.ats === "workday" ? 3 : 2,
    provider: detection.ats,
    label,
    companyId,
    cadenceDays: 7,
    fetchVia: detection.ats === "workday" ? "firecrawl_stealth" : "http",
    config:
      detection.ats === "workday"
        ? {
            tenant: detection.tenant,
            dc: detection.dc,
            site: detection.site,
            companyName,
          }
        : { token: detection.token, companyName },
  });

  await db
    .update(companies)
    .set({
      atsType: detection.ats,
      atsTenant: detection.tenant,
      atsSite: detection.site ?? detection.token,
      atsCheckedAt: new Date(),
    })
    .where(eq(companies.id, companyId));

  return true;
}

if (singleUrl) {
  const detection = detectAtsFromUrl(singleUrl);
  if (!detection) {
    console.error(`Could not recognise an ATS in ${singleUrl}`);
    process.exit(1);
  }

  const name = singleName ?? detection.token ?? detection.tenant ?? "Unknown";
  const [company] = await db
    .insert(companies)
    .values({
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      isTarget: true,
    })
    .onConflictDoNothing()
    .returning({ id: companies.id });

  const companyId =
    company?.id ??
    (
      await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.name, name))
        .limit(1)
    )[0]?.id;

  if (!companyId) {
    console.error("Could not resolve the company row.");
    process.exit(1);
  }

  const created = await createSource(companyId, name, detection);
  console.log(
    created
      ? `Added ${name} as a ${detection.ats} source.`
      : `${name} already has a ${detection.ats} source.`,
  );
  process.exit(0);
}

const targets = await db.select().from(companies).where(eq(companies.isTarget, true));
console.log(`Probing ${targets.length} target companies...\n`);

let found = 0;
for (const company of targets) {
  if (company.atsType !== "unknown" && company.atsCheckedAt) {
    console.log(`  ${company.name}: already resolved (${company.atsType})`);
    continue;
  }

  const detection = await probeAts(company.name);
  if (detection.ats === "none") {
    await db
      .update(companies)
      .set({ atsType: "none", atsCheckedAt: new Date() })
      .where(eq(companies.id, company.id));
    console.log(`  ${company.name}: no public board found`);
    continue;
  }

  const created = await createSource(company.id, company.name, detection);
  found++;
  console.log(
    `  ${company.name}: ${detection.ats} (${detection.jobCount ?? "?"} jobs)${
      created ? ": source added" : ""
    }`,
  );
}

console.log(`\nResolved ${found}/${targets.length} companies to a public job board.`);
console.log(
  "Workday employers can't be probed from a name alone, add them with:\n" +
    '  pnpm tsx scripts/detect-ats.ts --url="https://TENANT.wd5.myworkdayjobs.com/en-US/SITE" --name="Company"',
);

process.exit(0);
