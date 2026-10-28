const USER_AGENT =
  "job-hunter/0.1 (personal job search aggregator; contact via repo owner)";

export interface FetchOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
  /** Politeness delay applied before the request. */
  delayMs?: number;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
    public bodySnippet: string,
  ) {
    super(`HTTP ${status} for ${url}: ${bodySnippet.slice(0, 200)}`);
    this.name = "HttpError";
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries on 429, 5xx and network errors with exponential backoff. Does not
 * retry 4xx, which are almost always a bad key or a changed contract, worth
 * failing loudly rather than hammering.
 */
export async function fetchWithRetry(
  url: string,
  options: FetchOptions = {},
): Promise<Response> {
  const {
    method = "GET",
    headers = {},
    body,
    timeoutMs = 30_000,
    retries = 3,
    delayMs = 0,
  } = options;

  if (delayMs) await sleep(delayMs);

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(Math.min(2 ** attempt * 1000, 16_000));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (response.ok) return response;

      const snippet = await response.text().catch(() => "");
      const retryable = response.status === 429 || response.status >= 500;
      lastError = new HttpError(response.status, url, snippet);
      if (!retryable) throw lastError;
    } catch (error) {
      if (error instanceof HttpError && error.status < 500 && error.status !== 429) {
        throw error;
      }
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Request failed after ${retries + 1} attempts: ${url}`);
}

export async function fetchJson<T = unknown>(
  url: string,
  options: FetchOptions = {},
): Promise<T> {
  const response = await fetchWithRetry(url, options);
  return (await response.json()) as T;
}

export async function fetchText(
  url: string,
  options: FetchOptions = {},
): Promise<string> {
  const response = await fetchWithRetry(url, options);
  return await response.text();
}
