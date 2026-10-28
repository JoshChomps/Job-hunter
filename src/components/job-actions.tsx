"use client";

import { useState, useTransition } from "react";
import { addNote, setStage, toggleStar } from "@/app/actions";
import { STAGES } from "./ui";

export function JobActions({
  jobId,
  stage,
  isStarred,
  applyUrl,
}: {
  jobId: string;
  stage: string;
  isStarred: boolean;
  applyUrl: string;
}) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={applyUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium !text-primary-fg hover:opacity-90"
      >
        Open application ↗
      </a>

      <button
        type="button"
        onClick={() => startTransition(() => void toggleStar(jobId))}
        disabled={pending}
        className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
        style={{ color: isStarred ? "var(--primary-hi)" : undefined }}
      >
        {isStarred ? "★ Starred" : "☆ Star"}
      </button>

      <select
        aria-label="Stage"
        value={stage}
        disabled={pending}
        onChange={(event) =>
          startTransition(() => void setStage(jobId, event.target.value))
        }
        className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
      >
        {STAGES.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      <form
        className="flex flex-1 gap-2"
        action={() => {
          const value = note;
          setNote("");
          startTransition(() => void addNote(jobId, value));
        }}
      >
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Add a note"
          className="min-w-40 flex-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm"
        />
        {note && (
          <button
            type="submit"
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
          >
            Save
          </button>
        )}
      </form>
    </div>
  );
}
