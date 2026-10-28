"use client";

import { useState } from "react";

export function SubmitForm({ token }: { token: string }) {
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    setStatus("sending");
    setMessage("");

    try {
      const response = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          url: data.get("url"),
          note: data.get("note"),
          name: data.get("name"),
        }),
      });

      const result = (await response.json()) as { message?: string; status?: string };

      if (!response.ok || result.status === "failed") {
        setStatus("error");
        setMessage(result.message ?? "Something went wrong.");
        return;
      }

      setStatus("done");
      setMessage(result.message ?? "Added.");
      form.reset();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Network error.");
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-lg border border-border bg-surface p-4"
    >
      <input
        name="url"
        type="url"
        required
        placeholder="https://…"
        className="w-full rounded-md border border-border bg-bg px-2.5 py-2 text-sm"
      />
      <input
        name="note"
        type="text"
        placeholder="Why it caught your eye (optional)"
        className="w-full rounded-md border border-border bg-bg px-2.5 py-2 text-sm"
      />
      <input
        name="name"
        type="text"
        placeholder="Your name (optional)"
        className="w-full rounded-md border border-border bg-bg px-2.5 py-2 text-sm"
      />

      <button
        type="submit"
        disabled={status === "sending"}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg disabled:opacity-60"
      >
        {status === "sending" ? "Reading the page…" : "Send it over"}
      </button>

      {message && (
        <p
          className="text-xs"
          style={{
            color: status === "error" ? "var(--danger)" : "var(--success)",
          }}
        >
          {message}
        </p>
      )}
    </form>
  );
}
