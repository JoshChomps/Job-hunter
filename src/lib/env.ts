/**
 * Env access that fails loudly at the point of use rather than silently
 * producing an adapter that returns nothing.
 */

export function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export function has(name: string): boolean {
  return Boolean(process.env[name]);
}

export const env = {
  databaseUrl: () => required("DATABASE_URL"),

  anthropicKey: () => optional("ANTHROPIC_API_KEY"),
  firecrawlKey: () => optional("FIRECRAWL_API_KEY"),

  adzunaAppId: () => optional("ADZUNA_APP_ID"),
  adzunaAppKey: () => optional("ADZUNA_APP_KEY"),
  reedKey: () => optional("REED_API_KEY"),
  joobleKey: () => optional("JOOBLE_API_KEY"),
  careerjetAffid: () => optional("CAREERJET_AFFID"),

  submitToken: () => optional("SUBMIT_TOKEN"),
  crawlSecret: () => optional("CRAWL_SECRET"),

  appUrl: () => process.env.APP_URL ?? "http://localhost:3000",
};

/** Model used for every enrichment call. */
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-5";
