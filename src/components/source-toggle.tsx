"use client";

import { useTransition } from "react";
import { toggleSource } from "@/app/actions";

export function SourceToggle({
  sourceId,
  enabled,
}: {
  sourceId: string;
  enabled: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={enabled}
      onClick={() => startTransition(() => void toggleSource(sourceId))}
      className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-2 disabled:opacity-50"
      style={{ color: enabled ? "var(--success)" : "var(--text-muted)" }}
    >
      {enabled ? "Enabled" : "Disabled"}
    </button>
  );
}
