export interface Beds24Bindings {
  BEDS24_BASE_URL?: string;
  BEDS24_LONG_LIFE_TOKEN: string;
}

export interface Beds24RequestOptions {
  fetcher?: typeof fetch;
  maxRetries?: number;
  pauseAfterMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

const DEFAULT_BEDS24_BASE_URL = "https://api.beds24.com/v2";
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_PAUSE_AFTER_MS = 150;
const MAX_RETRY_DELAY_MS = 5_000;
const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export class Beds24ApiError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;

  constructor(status: number, retryAfterMs: number | null) {
    super(`Beds24 API request failed with HTTP ${status}`);
    this.name = "Beds24ApiError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }

  get transient(): boolean {
    return TRANSIENT_STATUSES.has(this.status);
  }
}

function getLongLifeToken(env: Beds24Bindings): string {
  const token = env.BEDS24_LONG_LIFE_TOKEN?.trim();
  if (!token) {
    throw new Error("BEDS24_LONG_LIFE_TOKEN is missing from Cloudflare bindings.");
  }
  return token;
}

function getBaseUrl(env: Beds24Bindings): string {
  return (env.BEDS24_BASE_URL?.trim() || DEFAULT_BEDS24_BASE_URL).replace(/\/$/, "");
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(MAX_RETRY_DELAY_MS, Math.trunc(seconds * 1_000));
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, timestamp - Date.now()));
}

function retryDelay(attempt: number, retryAfterMs: number | null): number {
  if (retryAfterMs !== null) {
    return retryAfterMs;
  }

  return Math.min(MAX_RETRY_DELAY_MS, 250 * 2 ** attempt);
}

function isTransientNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}

async function requestJson<T>(
  env: Beds24Bindings,
  url: URL,
  options: Beds24RequestOptions = {},
): Promise<T> {
  const fetcher = options.fetcher ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const pauseAfterMs = options.pauseAfterMs ?? DEFAULT_PAUSE_AFTER_MS;
  let attempt = 0;

  while (true) {
    try {
      const response = await fetcher(url, {
        method: "GET",
        headers: { accept: "application/json", token: getLongLifeToken(env) },
      });

      const body = await response.text();

      if (!response.ok) {
        throw new Beds24ApiError(
          response.status,
          parseRetryAfter(response.headers.get("Retry-After")),
        );
      }

      try {
        return JSON.parse(body) as T;
      } catch {
        throw new Error(`Beds24 returned invalid JSON from ${url.pathname}.`);
      } finally {
        if (pauseAfterMs > 0) {
          await sleep(pauseAfterMs);
        }
      }
    } catch (error) {
      const isApiError = error instanceof Beds24ApiError;
      const canRetry = isApiError
        ? error.transient
        : isTransientNetworkError(error);

      if (!canRetry || attempt >= maxRetries) {
        throw error;
      }

      const waitMs = isApiError
        ? retryDelay(attempt, error.retryAfterMs)
        : retryDelay(attempt, null);

      await sleep(waitMs);
      attempt += 1;
    }
  }
}

export async function beds24Get<T>(
  env: Beds24Bindings,
  endpoint: string,
  queryParams?: Record<string, string | number | boolean>,
  options?: Beds24RequestOptions,
): Promise<T> {
  const normalized = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = new URL(`${getBaseUrl(env)}${normalized}`);
  for (const [key, value] of Object.entries(queryParams ?? {})) {
    url.searchParams.set(key, String(value));
  }
  return requestJson<T>(env, url, options);
}

export async function beds24GetAbsolute<T>(
  env: Beds24Bindings,
  absoluteUrl: string,
  options?: Beds24RequestOptions,
): Promise<T> {
  const url = new URL(absoluteUrl);
  const allowedHost = new URL(getBaseUrl(env)).host;
  if (url.host !== allowedHost) {
    throw new Error(`Rejected Beds24 pagination host: ${url.host}`);
  }
  return requestJson<T>(env, url, options);
}
