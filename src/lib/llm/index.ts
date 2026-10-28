import { createHash } from "node:crypto";
import { anthropicProvider } from "./anthropic";
import { ollamaProvider } from "./ollama";
import type {
  AssessResult,
  ClassifyResult,
  JobInput,
  LlmProvider,
  ParsedJob,
} from "./types";

export * from "./types";
export { checkOllama, ollamaConfig } from "./ollama";

/** Bump when a prompt changes materially, so cached results are recomputed. */
export const PROMPT_VERSION = "2";

export type ProviderMode = "anthropic" | "ollama" | "hybrid" | "none";

/**
 * Resolves which provider handles what.
 *
 *   anthropic: Claude does everything (default when a key is present)
 *   ollama: a local model does everything, no API cost, no data leaves
 *   hybrid: local model does parse + classify, Claude does assess
 *
 * `hybrid` is the interesting one. Parsing and classification are the
 * high-volume mechanical jobs and a small local model handles them fine. The
 * assessment, reading sponsorship statements and scoring fit, is the
 * judgment call that decides whether you spend a week chasing an impossible
 * role, so it stays with the stronger model and only runs on the far smaller
 * set of jobs that survive the filters.
 */
export function providerMode(): ProviderMode {
  const configured = (process.env.LLM_PROVIDER ?? "").toLowerCase();

  if (configured === "ollama") return "ollama";
  if (configured === "hybrid") {
    return anthropicProvider.isConfigured() ? "hybrid" : "ollama";
  }
  if (configured === "anthropic") {
    return anthropicProvider.isConfigured() ? "anthropic" : "none";
  }

  // Unset: use whatever is actually available.
  if (anthropicProvider.isConfigured()) return "anthropic";
  if (ollamaProvider.isConfigured()) return "ollama";
  return "none";
}

function providersFor(mode: ProviderMode): {
  mechanical: LlmProvider;
  judgment: LlmProvider;
} | null {
  switch (mode) {
    case "anthropic":
      return { mechanical: anthropicProvider, judgment: anthropicProvider };
    case "ollama":
      return { mechanical: ollamaProvider, judgment: ollamaProvider };
    case "hybrid":
      return { mechanical: ollamaProvider, judgment: anthropicProvider };
    default:
      return null;
  }
}

export function isEnrichmentConfigured(): boolean {
  return providerMode() !== "none";
}

export function describeProviders(): string {
  const mode = providerMode();
  const p = providersFor(mode);
  if (!p) return "none (no ANTHROPIC_API_KEY and no LLM_PROVIDER=ollama)";
  if (mode === "hybrid") {
    return `hybrid: ${p.mechanical.modelId} for parse/classify, ${p.judgment.modelId} for fit scoring`;
  }
  return p.mechanical.modelId;
}

/** Recorded on each enrichment row so it's clear what produced a result. */
export function activeModelId(): string {
  const p = providersFor(providerMode());
  if (!p) return "none";
  return p.mechanical.modelId === p.judgment.modelId
    ? p.mechanical.modelId
    : `${p.mechanical.modelId}+${p.judgment.modelId}`;
}

export function contentHash(...parts: Array<string | undefined | null>): string {
  return createHash("sha256")
    .update([PROMPT_VERSION, activeModelId(), ...parts.map((p) => p ?? "")].join(" "))
    .digest("hex")
    .slice(0, 32);
}

function require(mode: ProviderMode) {
  const p = providersFor(mode);
  if (!p) {
    throw new Error(
      "No LLM configured. Set ANTHROPIC_API_KEY, or LLM_PROVIDER=ollama with Ollama running.",
    );
  }
  return p;
}

/** A scraped page becomes structured fields. Used by the paste-a-link flow. */
export async function parseJobPage(
  markdown: string,
  sourceUrl: string,
): Promise<ParsedJob> {
  return require(providerMode()).mechanical.parse(markdown, sourceUrl);
}

/** Discipline, seniority, tags and the plain-language description. */
export async function classifyJob(job: JobInput): Promise<ClassifyResult> {
  return require(providerMode()).mechanical.classify(job);
}

/** Sponsorship reading and fit scoring, the judgment half. */
export async function assessJob(
  job: JobInput,
  profile: string,
): Promise<AssessResult> {
  return require(providerMode()).judgment.assess(job, profile);
}
