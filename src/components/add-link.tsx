"use client";

import { useActionState } from "react";
import { addLinkAction, type AddLinkState } from "@/app/actions";

/**
 * The paste box. Deliberately one field plus an optional note, the whole point
 * is that a friend pastes a link and the system does the rest.
 */
export function AddLink() {
  const [state, formAction, pending] = useActionState<AddLinkState, FormData>(
    addLinkAction,
    {},
  );

  const tone =
    state.status === "created"
      ? "var(--success)"
      : state.status === "failed"
        ? "var(--danger)"
        : "var(--warning)";

  return (
    <form
      action={formAction}
      className="rounded-lg border border-border bg-surface p-3"
    >
      <div className="flex flex-wrap gap-2">
        <input
          name="url"
          type="url"
          required
          placeholder="Paste a job link, LinkedIn, Indeed, a careers page, anything"
          className="min-w-64 flex-1 rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm"
        />
        <input
          name="note"
          type="text"
          placeholder="Note (optional)"
          className="min-w-40 flex-1 rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg disabled:opacity-60"
        >
          {pending ? "Reading page…" : "Add"}
        </button>
      </div>

      {state.message && (
        <p className="mt-2 text-xs" style={{ color: tone }}>
          {state.message}
        </p>
      )}
    </form>
  );
}
