import { fetchJson } from "@/lib/http";
import {
  ASSESS_JSON_SCHEMA,
  ASSESS_SYSTEM,
  CLASSIFY_JSON_SCHEMA,
  CLASSIFY_SYSTEM,
  PARSE_JSON_SCHEMA,
  PARSE_SYSTEM,
  assessSchema,
  classifySchema,
  parsedJobSchema,
  renderJob,
  type AssessResult,
  type ClassifyResult,
  type JobInput,
  type LlmProvider,
  type ParsedJob,
} from "./types";

/**
 * Local model via Ollama.
 *
 * Ollama's `format` parameter takes a JSON schema and constrains generation to
 * it, which is the same mechanism Claude's tool-use gives us, so both
 * providers share the exact schemas in ./types.ts.
 *
 * Two things this has to defend against that a frontier model doesn't need:
 *   - Small models satisfy the schema but still invent enum values, so every
 *     response is validated with Zod and coerced to a safe default rather than
 *     trusted.
 *   - Local inference is slow, so the timeout is generous and callers should
 *     expect seconds per job, not milliseconds.
 */

const DEFAULT_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const DEFAULT_MODEL = process.env.OLLAMA_MODEL ?? "qwen3:8b";
const TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 180_000);

interface ChatResponse {
  message?: { content?: string };
  error?: string;
}

async function chat(
  system: string,
  user: string,
  schema: unknown,
): Promise<unknown> {
  const payload = await fetchJson<ChatResponse>(`${DEFAULT_BASE_URL}/api/chat`, {
    method: "POST",
    body: {
      model: DEFAULT_MODEL,
      stream: false,
      format: schema,
      // Deterministic output is worth more than variety for extraction, and
      // low temperature markedly improves schema adherence on small models.
      options: { temperature: 0 },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    },
    timeoutMs: TIMEOUT_MS,
    retries: 1,
  });

  const content = payload.message?.content;
  if (!content) {
    throw new Error(
      `Ollama returned no content${payload.error ? `: ${payload.error}` : ""}`,
    );
  }

  try {
    return JSON.parse(content);
  } catch {
    // Some models wrap JSON in prose or a code fence despite the constraint.
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Ollama returned unparseable output: ${content.slice(0, 200)}`);
    return JSON.parse(match[0]);
  }
}

export const ollamaProvider: LlmProvider = {
  name: "ollama",
  modelId: `ollama:${DEFAULT_MODEL}`,

  isConfigured() {
    // Ollama needs no key; reachability is checked by `pnpm llm:check`.
    return Boolean(process.env.OLLAMA_BASE_URL || process.env.OLLAMA_MODEL);
  },

  async parse(markdown: string, sourceUrl: string): Promise<ParsedJob> {
    const raw = await chat(
      PARSE_SYSTEM,
      `Source URL: ${sourceUrl}\n\n---\n\n${markdown.slice(0, 30_000)}`,
      PARSE_JSON_SCHEMA,
    );

    const result = parsedJobSchema.safeParse(raw);
    if (result.success) return result.data;

    // A local model that produced *something* is still better than nothing, so
    // fall back to the minimum viable shape rather than failing the ingest.
    const loose = raw as Record<string, unknown>;
    return {
      isJobPosting: loose.isJobPosting !== false,
      title: typeof loose.title === "string" ? loose.title : undefined,
      companyName: typeof loose.companyName === "string" ? loose.companyName : undefined,
      locationRaw: typeof loose.locationRaw === "string" ? loose.locationRaw : undefined,
      description: typeof loose.description === "string" ? loose.description : undefined,
    };
  },

  async classify(job: JobInput): Promise<ClassifyResult> {
    const raw = await chat(CLASSIFY_SYSTEM, renderJob(job), CLASSIFY_JSON_SCHEMA);
    const result = classifySchema.safeParse(raw);
    if (result.success) return result.data;

    const loose = (raw ?? {}) as Record<string, unknown>;
    return {
      discipline: coerceEnum(loose.discipline, ["electrical", "ai", "other", "unknown"], "unknown"),
      subDiscipline: typeof loose.subDiscipline === "string" ? loose.subDiscipline : undefined,
      isHardwareAi: loose.isHardwareAi === true,
      seniority: coerceEnum(
        loose.seniority,
        ["intern", "new_grad", "early", "mid", "senior", "staff", "unknown"],
        "unknown",
      ),
      isGradScheme: loose.isGradScheme === true,
      techStack: Array.isArray(loose.techStack)
        ? loose.techStack.filter((t): t is string => typeof t === "string")
        : [],
      summary: typeof loose.summary === "string" ? loose.summary : "",
    };
  },

  async assess(job: JobInput, profile: string): Promise<AssessResult> {
    const raw = await chat(ASSESS_SYSTEM, renderJob(job, profile), ASSESS_JSON_SCHEMA);
    const result = assessSchema.safeParse(raw);
    if (result.success) return result.data;

    const loose = (raw ?? {}) as Record<string, unknown>;
    const score = Number(loose.fitScore);
    return {
      // Sponsorship defaults to `unknown`, never `no`, the same rule the visa
      // gate follows, so a confused local model cannot hide a viable job.
      sponsorshipSignal: coerceEnum(loose.sponsorshipSignal, ["yes", "no", "unknown"], "unknown"),
      sponsorshipStatement:
        typeof loose.sponsorshipStatement === "string" ? loose.sponsorshipStatement : undefined,
      fitScore: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 50,
      reasons: Array.isArray(loose.reasons)
        ? loose.reasons.filter((r): r is string => typeof r === "string")
        : [],
    };
  },
};

function coerceEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  if (typeof value === "string") {
    const normalised = value.toLowerCase().replace(/[\s-]/g, "_");
    const match = allowed.find((a) => a === normalised);
    if (match) return match;
  }
  return fallback;
}

/** Reachability + schema-adherence check, used by `pnpm llm:check`. */
export async function checkOllama(): Promise<{
  reachable: boolean;
  models: string[];
  modelPresent: boolean;
  schemaOk: boolean;
  error?: string;
}> {
  try {
    const tags = await fetchJson<{ models?: Array<{ name?: string }> }>(
      `${DEFAULT_BASE_URL}/api/tags`,
      { timeoutMs: 10_000, retries: 0 },
    );
    const models = (tags.models ?? [])
      .map((m) => m.name)
      .filter((n): n is string => Boolean(n));

    const modelPresent = models.some(
      (m) => m === DEFAULT_MODEL || m.startsWith(`${DEFAULT_MODEL.split(":")[0]}:`),
    );

    if (!modelPresent) {
      return { reachable: true, models, modelPresent: false, schemaOk: false };
    }

    const result = await ollamaProvider.classify({
      title: "Senior RTL Design Engineer",
      companyName: "Test Semiconductor",
      locationRaw: "Bristol, UK",
      description:
        "Design and verify RTL in SystemVerilog for a machine learning inference accelerator. FPGA prototyping, synthesis and timing closure.",
    });

    return {
      reachable: true,
      models,
      modelPresent: true,
      schemaOk: result.discipline === "electrical" && result.summary.length > 0,
    };
  } catch (error) {
    return {
      reachable: false,
      models: [],
      modelPresent: false,
      schemaOk: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export const ollamaConfig = {
  baseUrl: DEFAULT_BASE_URL,
  model: DEFAULT_MODEL,
};
