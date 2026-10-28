import "./bootstrap";
import { readFile } from "node:fs/promises";
import { db } from "@/db";
import { ukSponsors } from "@/db/schema";
import { normaliseCompany } from "@/pipeline/normalize";
import { buildIngestContext, recomputeUkVisaGate, refreshSponsorMatches } from "@/pipeline/ingest";
import { fetchText } from "@/lib/http";

/**
 * Imports the Home Office "Register of Worker and Temporary Worker licensed
 * sponsors" CSV.
 *
 * This is gate one of UK feasibility: an employer not on this list cannot
 * sponsor, full stop. The Home Office republishes it at least monthly at a
 * dated URL, so the URL is passed in rather than hardcoded:
 *
 *   pnpm sponsors:import -- --url=https://www.gov.uk/csv-preview/.../SP_...csv
 *   pnpm sponsors:import -- --file=./data/uk-sponsors.csv
 *
 * Find the current link on:
 * https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers
 */

function arg(name: string): string | undefined {
  const match = process.argv.find((a) => a.startsWith(`--${name}=`));
  return match ? match.split("=").slice(1).join("=") : undefined;
}

/** Minimal RFC 4180 parser, the register contains quoted commas in org names. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') inQuotes = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function columnIndex(header: string[], candidates: string[]): number {
  const normalised = header.map((h) => h.toLowerCase().replace(/[^a-z]/g, ""));
  for (const candidate of candidates) {
    const target = candidate.toLowerCase().replace(/[^a-z]/g, "");
    const index = normalised.findIndex((h) => h.includes(target));
    if (index !== -1) return index;
  }
  return -1;
}

const url = arg("url");
const file = arg("file");

if (!url && !file) {
  console.error(
    "Pass --url= (from gov.uk) or --file= (a local copy of the register CSV).",
  );
  process.exit(1);
}

console.log(file ? `Reading ${file}` : `Downloading ${url}`);
const csv = file
  ? await readFile(file, "utf8")
  : await fetchText(url!, { timeoutMs: 120_000, headers: { Accept: "text/csv" } });

const rows = parseCsv(csv);
if (rows.length < 2) {
  console.error("CSV looks empty or malformed.");
  process.exit(1);
}

const header = rows[0];
const nameIdx = columnIndex(header, ["organisationname", "organisation", "name"]);
const townIdx = columnIndex(header, ["towncity", "town", "city"]);
const countyIdx = columnIndex(header, ["county"]);
const ratingIdx = columnIndex(header, ["typerating", "rating", "type"]);
const routeIdx = columnIndex(header, ["route"]);

if (nameIdx === -1) {
  console.error(`Could not find an organisation name column. Header: ${header.join(" | ")}`);
  process.exit(1);
}

// The register lists one row per route, so an employer licensed for several
// routes appears several times. Collapse to one row per organisation.
const byOrg = new Map<
  string,
  { name: string; town?: string; county?: string; rating?: string; routes: Set<string> }
>();

for (const row of rows.slice(1)) {
  const name = row[nameIdx]?.trim();
  if (!name) continue;

  const key = `${name.toLowerCase()}|${row[townIdx]?.trim().toLowerCase() ?? ""}`;
  const existing = byOrg.get(key);
  const route = routeIdx === -1 ? undefined : row[routeIdx]?.trim();

  if (existing) {
    if (route) existing.routes.add(route);
  } else {
    byOrg.set(key, {
      name,
      town: townIdx === -1 ? undefined : row[townIdx]?.trim(),
      county: countyIdx === -1 ? undefined : row[countyIdx]?.trim(),
      rating: ratingIdx === -1 ? undefined : row[ratingIdx]?.trim(),
      routes: new Set(route ? [route] : []),
    });
  }
}

const records = [...byOrg.values()].map((org) => ({
  name: org.name,
  normalisedName: normaliseCompany(org.name),
  town: org.town || null,
  county: org.county || null,
  rating: org.rating || null,
  routes: org.routes.size ? [...org.routes] : null,
}));

console.log(`Parsed ${records.length} organisations from ${rows.length - 1} rows.`);

// Replaced wholesale: a revoked licence must disappear, not linger.
await db.delete(ukSponsors);

const BATCH = 1000;
for (let i = 0; i < records.length; i += BATCH) {
  await db.insert(ukSponsors).values(records.slice(i, i + BATCH));
  process.stdout.write(`\rInserted ${Math.min(i + BATCH, records.length)}/${records.length}`);
}
console.log("\nRegister imported.");

const ctx = await buildIngestContext(console.log);
await refreshSponsorMatches(console.log);
await recomputeUkVisaGate(ctx);

process.exit(0);
