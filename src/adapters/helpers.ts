/**
 * Field access that tolerates shape drift.
 *
 * Several of these providers have no published, versioned contract, the ATS
 * board endpoints and MyCareersFuture in particular are public but
 * undocumented. Reading through aliases means a renamed field degrades one
 * value to `undefined` instead of throwing and taking the whole run down.
 */

type Any = Record<string, unknown>;

export function get(obj: unknown, path: string): unknown {
  if (obj == null) return undefined;
  let current: unknown = obj;
  for (const segment of path.split(".")) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Any)[segment];
  }
  return current;
}

/** First path that yields a non-null, non-empty value. */
export function pick(obj: unknown, paths: string[]): unknown {
  for (const path of paths) {
    const value = get(obj, path);
    if (value != null && value !== "") return value;
  }
  return undefined;
}

export function pickString(obj: unknown, paths: string[]): string | undefined {
  const value = pick(obj, paths);
  if (value == null) return undefined;
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

export function pickNumber(obj: unknown, paths: string[]): number | undefined {
  const value = pick(obj, paths);
  if (value == null) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(parsed) && parsed !== 0) return parsed;
  }
  return undefined;
}

export function pickDate(obj: unknown, paths: string[]): Date | undefined {
  const value = pick(obj, paths);
  if (value == null) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    // Heuristic: seconds vs milliseconds since epoch.
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  return undefined;
}

/**
 * Providers wrap their arrays differently, and sometimes return a bare array.
 * Checking the common envelope keys avoids a per-provider special case.
 */
export function pickArray(payload: unknown, paths: string[] = []): unknown[] {
  if (Array.isArray(payload)) return payload;
  const candidates = [
    ...paths,
    "results",
    "jobs",
    "data",
    "items",
    "postings",
    "content",
    "hits",
    "elements",
  ];
  for (const path of candidates) {
    const value = get(payload, path);
    if (Array.isArray(value)) return value;
  }
  return [];
}

export function asBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (/^(true|yes|1)$/i.test(value)) return true;
    if (/^(false|no|0)$/i.test(value)) return false;
  }
  return undefined;
}
