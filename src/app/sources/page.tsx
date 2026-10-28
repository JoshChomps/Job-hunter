import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listSources, recentCrawlRuns } from "@/lib/queries";
import { SourceToggle } from "@/components/source-toggle";
import { relativeTime } from "@/components/ui";

export const dynamic = "force-dynamic";

const TIER_LABEL: Record<number, string> = {
  1: "Tier 1: official APIs",
  2: "Tier 2: open endpoints & ATS boards",
  3: "Tier 3: Firecrawl / Akamai-protected",
  4: "Tier 4: local runner only",
};

const STATUS_COLOUR: Record<string, string> = {
  ok: "var(--success)",
  partial: "var(--warning)",
  failed: "var(--danger)",
  running: "var(--text-muted)",
};

export default async function SourcesPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const [sources, runs] = await Promise.all([listSources(), recentCrawlRuns(25)]);

  const byTier = new Map<number, typeof sources>();
  for (const source of sources) {
    if (!byTier.has(source.tier)) byTier.set(source.tier, []);
    byTier.get(source.tier)!.push(source);
  }

  const totalCredits = runs.reduce((sum, run) => sum + run.creditsUsed, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Sources</h1>
        <p className="text-xs text-muted">
          {sources.filter((s) => s.enabled).length}/{sources.length} enabled
          {totalCredits > 0 && ` · ${totalCredits} Firecrawl credits in recent runs`}
        </p>
      </div>

      {[...byTier.keys()]
        .sort((a, b) => a - b)
        .map((tier) => (
          <section key={tier} className="space-y-2">
            <h2 className="text-sm font-semibold text-muted">
              {TIER_LABEL[tier] ?? `Tier ${tier}`}
            </h2>

            <div className="scroll-x rounded-lg border border-border">
              <table className="w-full min-w-2xl text-sm">
                <thead className="bg-surface-2 text-left text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Source</th>
                    <th className="px-3 py-2 font-medium">Provider</th>
                    <th className="px-3 py-2 font-medium">Market</th>
                    <th className="px-3 py-2 font-medium">Every</th>
                    <th className="px-3 py-2 font-medium">Last run</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {byTier.get(tier)!.map((source) => (
                    <tr
                      key={source.id}
                      className="border-t border-border bg-surface"
                    >
                      <td className="px-3 py-2">
                        <span className={source.enabled ? "" : "opacity-50"}>
                          {source.label}
                        </span>
                        {source.fetchVia !== "http" && (
                          <span className="ml-2 text-[11px] text-muted">
                            via {source.fetchVia.replace("_", " ")}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted">
                        {source.provider}
                      </td>
                      <td className="px-3 py-2 text-muted">
                        {source.market ?? ": "}
                      </td>
                      <td className="px-3 py-2 text-muted">
                        {source.cadenceDays}d
                      </td>
                      <td className="px-3 py-2 text-muted">
                        {source.lastRunAt ? relativeTime(source.lastRunAt) : "never"}
                      </td>
                      <td className="px-3 py-2">
                        {source.lastStatus ? (
                          <span
                            title={source.lastError ?? undefined}
                            style={{ color: STATUS_COLOUR[source.lastStatus] }}
                          >
                            {source.lastStatus}
                          </span>
                        ) : (
                          <span className="text-muted">: </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <SourceToggle
                          sourceId={source.id}
                          enabled={source.enabled}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}

      {/* A silently-broken source is the failure mode that matters most here
          coverage quietly drops and nothing looks wrong. */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted">Recent runs</h2>

        {runs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
            No crawls yet. Run <code>pnpm crawl --force</code> or trigger the
            GitHub Actions workflow.
          </p>
        ) : (
          <div className="scroll-x rounded-lg border border-border">
            <table className="w-full min-w-2xl text-sm">
              <thead className="bg-surface-2 text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Found</th>
                  <th className="px-3 py-2 font-medium">Filtered</th>
                  <th className="px-3 py-2 font-medium">New</th>
                  <th className="px-3 py-2 font-medium">Credits</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    className="border-t border-border bg-surface"
                  >
                    <td className="px-3 py-2 text-muted">
                      {relativeTime(run.startedAt)}
                    </td>
                    <td className="px-3 py-2">{run.label ?? run.provider}</td>
                    <td className="px-3 py-2 tabular-nums">{run.found}</td>
                    <td className="px-3 py-2 tabular-nums text-muted">
                      {run.filtered}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{run.created}</td>
                    <td className="px-3 py-2 tabular-nums text-muted">
                      {run.creditsUsed || ": "}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        title={run.errors?.join("\n") ?? undefined}
                        style={{ color: STATUS_COLOUR[run.status] }}
                      >
                        {run.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
