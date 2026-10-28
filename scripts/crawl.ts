import "./bootstrap";
import { runCrawl, selectDueSources } from "@/pipeline/crawl";
import { enrichPendingJobs } from "@/pipeline/enrich";
import { buildIngestContext } from "@/pipeline/ingest";
import { getAdapter } from "@/adapters";

/**
 * The crawler CLI. The same binary runs in GitHub Actions for Tiers 1-3 and on
 * a local machine for Tier 4, where a residential IP is the whole point.
 *
 *   pnpm crawl                      run every source that is due
 *   pnpm crawl --force              ignore cadence
 *   pnpm crawl --tier=4             the local LinkedIn/Indeed runner
 *   pnpm crawl --provider=reed      one provider
 *   pnpm crawl --enrich=50          run Claude enrichment afterwards
 *   pnpm crawl --probe=adzuna       verify an adapter without writing anything
 */

function arg(name: string): string | undefined {
  const match = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (match) return match.split("=").slice(1).join("=");
  return process.argv.includes(`--${name}`) ? "" : undefined;
}

const probeProvider = arg("probe");
const force = arg("force") !== undefined;
const tier = arg("tier") ? Number(arg("tier")) : undefined;
const provider = arg("provider") || undefined;
const sourceId = arg("source") || undefined;
const enrichArg = arg("enrich");

/**
 * Several of these providers publish no versioned contract, the ATS board
 * endpoints and MyCareersFuture are public but undocumented. Probe fetches one
 * page, prints the raw payload next to the mapped result, and writes nothing,
 * so a changed field shows up immediately instead of silently producing empty
 * rows.
 */
async function probe(providerName: string): Promise<void> {
  const sources = await selectDueSources({ provider: providerName, force: true });
  if (sources.length === 0) {
    console.error(`No sources configured for provider "${providerName}".`);
    process.exit(1);
  }

  const source = sources[0];
  const adapter = getAdapter(providerName);

  console.log(`Probing ${providerName} via source "${source.label}"`);
  console.log(`Config: ${JSON.stringify(source.config)}\n`);

  if (!adapter.isConfigured()) {
    console.error(`${providerName} is missing credentials.`);
    process.exit(1);
  }

  let credits = 0;
  const jobs = await adapter.fetchJobs(source, {
    recordCredits: (n) => {
      credits += n;
    },
    log: (m) => console.log(`  ${m}`),
  });

  console.log(`\nReturned ${jobs.length} jobs${credits ? ` (${credits} credits)` : ""}.`);
  if (jobs.length === 0) {
    console.log("\nNo jobs came back. Either the query matched nothing or the response shape has changed.");
    return;
  }

  const [first] = jobs;
  console.log("\n--- Mapped RawJob (first result) ---");
  console.log(JSON.stringify({ ...first, raw: undefined }, null, 2));
  console.log("\n--- Provider payload for the same result ---");
  console.log(JSON.stringify(first.raw, null, 2).slice(0, 3000));
  console.log(
    "\nCheck that title, url, companyName, locationRaw and salary are populated. Empty fields mean the aliases in the adapter need updating.",
  );
}

if (probeProvider) {
  await probe(probeProvider);
  process.exit(0);
}

await runCrawl({ tier, provider, sourceId, force });

if (enrichArg !== undefined) {
  const limit = enrichArg ? Number(enrichArg) : 50;
  console.log(`\nEnriching up to ${limit} jobs...`);
  const ctx = await buildIngestContext(console.log);
  const stats = await enrichPendingJobs({
    limit,
    thresholds: ctx.thresholds,
    log: console.log,
  });
  console.log(
    `Enrichment: ${stats.enriched} enriched, ${stats.skipped} already current, ${stats.failed} failed.`,
  );
}

process.exit(0);
