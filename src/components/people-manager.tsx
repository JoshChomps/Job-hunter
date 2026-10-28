"use client";

import { useActionState, useTransition } from "react";
import { addPersonAction, removePerson, type PeopleState } from "@/app/actions";

export interface Person {
  email: string;
  role: string;
  label: string | null;
  /** Set via OWNER_EMAIL, so it can't be removed from here. */
  isBootstrap: boolean;
}

export function PeopleManager({
  people,
  currentEmail,
}: {
  people: Person[];
  currentEmail: string;
}) {
  const [state, formAction, pending] = useActionState<PeopleState, FormData>(
    addPersonAction,
    {},
  );
  const [removing, startRemove] = useTransition();

  return (
    <div className="space-y-4">
      <form
        action={formAction}
        className="flex flex-wrap gap-2 rounded-lg border border-border bg-surface p-3"
      >
        <input
          name="email"
          type="email"
          required
          placeholder="friend@example.com"
          className="min-w-56 flex-1 rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm"
        />
        <select
          name="role"
          defaultValue="contributor"
          className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm"
        >
          <option value="contributor">Contributor</option>
          <option value="owner">Owner</option>
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg disabled:opacity-60"
        >
          {pending ? "Adding…" : "Invite"}
        </button>

        {state.message && (
          <p
            className="w-full text-xs"
            style={{ color: state.ok ? "var(--success)" : "var(--danger)" }}
          >
            {state.message}
          </p>
        )}
      </form>

      <div className="overflow-hidden rounded-lg border border-border">
        {people.map((person) => {
          const isSelf = person.email.toLowerCase() === currentEmail.toLowerCase();

          return (
            <div
              key={person.email}
              className="flex items-center gap-3 border-b border-border bg-surface px-3 py-2 last:border-b-0"
            >
              <span className="min-w-0 flex-1 truncate text-sm">
                {person.email}
                {isSelf && <span className="ml-2 text-xs text-muted">(you)</span>}
              </span>

              <span
                className="text-xs capitalize"
                style={{
                  color:
                    person.role === "owner" ? "var(--primary-hi)" : "var(--text-muted)",
                }}
              >
                {person.role}
              </span>

              {person.isBootstrap ? (
                <span
                  className="text-xs text-muted"
                  title="Set through the OWNER_EMAIL environment variable, change it there"
                >
                  env
                </span>
              ) : (
                <button
                  type="button"
                  disabled={removing || isSelf}
                  title={isSelf ? "You can't remove yourself" : "Revoke access"}
                  onClick={() => {
                    if (!confirm(`Revoke access for ${person.email}?`)) return;
                    startRemove(() => void removePerson(person.email));
                  }}
                  className="rounded border border-border px-2 py-1 text-xs disabled:opacity-40"
                  style={{ color: isSelf ? undefined : "var(--danger)" }}
                >
                  Remove
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
