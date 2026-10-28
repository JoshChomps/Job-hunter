"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const COUNTRIES = [
  { value: "", label: "All markets" },
  { value: "CA", label: "Canada" },
  { value: "SG", label: "Singapore" },
  { value: "GB", label: "UK" },
];

const DISCIPLINES = [
  { value: "", label: "All disciplines" },
  { value: "electrical", label: "Electrical" },
  { value: "ai", label: "AI" },
  { value: "other", label: "Other" },
  { value: "unknown", label: "Unclassified" },
];

const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "fit", label: "Best fit" },
  { value: "salary", label: "Salary" },
  { value: "title", label: "Title" },
];

export function Filters({ hiddenCount }: { hiddenCount: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const update = useCallback(
    (key: string, value: string | boolean) => {
      const next = new URLSearchParams(params.toString());
      if (!value || value === "false") next.delete(key);
      else next.set(key, String(value));
      router.push(`${pathname}?${next.toString()}`);
    },
    [params, pathname, router],
  );

  const showInfeasible = params.get("showInfeasible") === "true";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        defaultValue={params.get("q") ?? ""}
        placeholder="Search title, company, location"
        onKeyDown={(event) => {
          if (event.key === "Enter") update("q", event.currentTarget.value);
        }}
        className="min-w-52 flex-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm"
      />

      <select
        aria-label="Market"
        value={params.get("country") ?? ""}
        onChange={(e) => update("country", e.target.value)}
        className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
      >
        {COUNTRIES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>

      <select
        aria-label="Discipline"
        value={params.get("discipline") ?? ""}
        onChange={(e) => update("discipline", e.target.value)}
        className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
      >
        {DISCIPLINES.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
      </select>

      <select
        aria-label="Sort"
        value={params.get("sort") ?? "newest"}
        onChange={(e) => update("sort", e.target.value)}
        className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
      >
        {SORTS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      <label className="flex items-center gap-1.5 text-sm text-muted">
        <input
          type="checkbox"
          checked={params.get("hardwareAi") === "true"}
          onChange={(e) => update("hardwareAi", e.target.checked)}
        />
        hardware×AI
      </label>

      {/*
        Infeasible jobs are hidden, never deleted. A wrong sponsor-name match
        should cost a click, so the count is always visible.
      */}
      {(hiddenCount > 0 || showInfeasible) && (
        <button
          type="button"
          onClick={() => update("showInfeasible", !showInfeasible)}
          className="rounded-md border border-border px-2 py-1.5 text-xs text-muted hover:bg-surface-2"
        >
          {showInfeasible
            ? "Hide unsponsorable"
            : `Show ${hiddenCount} unsponsorable`}
        </button>
      )}
    </div>
  );
}
