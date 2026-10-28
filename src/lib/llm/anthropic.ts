import Anthropic from "@anthropic-ai/sdk";
import { env, CLAUDE_MODEL } from "@/lib/env";
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

let client: Anthropic | undefined;

function getClient(): Anthropic {
  const apiKey = env.anthropicKey();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  client ??= new Anthropic({ apiKey });
  return client;
}

/**
 * Structured output via a forced tool call, more reliable than asking for JSON
 * in prose, which occasionally arrives wrapped in commentary or a code fence.
 * The schemas are the same objects Ollama receives, so the two providers are
 * directly comparable.
 */
async function callStructured<T>(
  system: string,
  userContent: string,
  toolName: string,
  schema: Record<string, unknown>,
  maxTokens = 1500,
): Promise<T> {
  const response = await getClient().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    system,
    tools: [
      {
        name: toolName,
        description: `Return the extracted result as ${toolName}.`,
        input_schema: schema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: toolName },
    messages: [{ role: "user", content: userContent }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUse) throw new Error(`Claude returned no ${toolName} tool call`);
  return toolUse.input as T;
}

export const anthropicProvider: LlmProvider = {
  name: "anthropic",
  modelId: CLAUDE_MODEL,

  isConfigured() {
    return Boolean(env.anthropicKey());
  },

  async parse(markdown: string, sourceUrl: string): Promise<ParsedJob> {
    const raw = await callStructured<unknown>(
      PARSE_SYSTEM,
      `Source URL: ${sourceUrl}\n\n---\n\n${markdown.slice(0, 60_000)}`,
      "extracted_job",
      PARSE_JSON_SCHEMA as unknown as Record<string, unknown>,
      2500,
    );
    return parsedJobSchema.parse(raw);
  },

  async classify(job: JobInput): Promise<ClassifyResult> {
    const raw = await callStructured<unknown>(
      CLASSIFY_SYSTEM,
      renderJob(job),
      "job_classification",
      CLASSIFY_JSON_SCHEMA as unknown as Record<string, unknown>,
    );
    return classifySchema.parse(raw);
  },

  async assess(job: JobInput, profile: string): Promise<AssessResult> {
    const raw = await callStructured<unknown>(
      ASSESS_SYSTEM,
      renderJob(job, profile),
      "job_assessment",
      ASSESS_JSON_SCHEMA as unknown as Record<string, unknown>,
    );
    return assessSchema.parse(raw);
  },
};
