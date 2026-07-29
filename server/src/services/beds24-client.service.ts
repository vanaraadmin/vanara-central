export interface Beds24Bindings {
  BEDS24_BASE_URL?: string;
  BEDS24_LONG_LIFE_TOKEN: string;
}

const DEFAULT_BEDS24_BASE_URL = "https://api.beds24.com/v2";

function getLongLifeToken(env: Beds24Bindings): string {
  const token = env.BEDS24_LONG_LIFE_TOKEN?.trim();
  if (!token) throw new Error("BEDS24_LONG_LIFE_TOKEN is missing from Cloudflare bindings.");
  return token;
}

function getBaseUrl(env: Beds24Bindings): string {
  return (env.BEDS24_BASE_URL?.trim() || DEFAULT_BEDS24_BASE_URL).replace(/\/$/, "");
}

async function requestJson<T>(env: Beds24Bindings, url: URL): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json", token: getLongLifeToken(env) },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Beds24 API error ${response.status}: ${body}`);
  try { return JSON.parse(body) as T; }
  catch { throw new Error(`Beds24 returned invalid JSON: ${body}`); }
}

export async function beds24Get<T>(
  env: Beds24Bindings,
  endpoint: string,
  queryParams?: Record<string, string | number | boolean>,
): Promise<T> {
  const normalized = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = new URL(`${getBaseUrl(env)}${normalized}`);
  for (const [key, value] of Object.entries(queryParams ?? {})) url.searchParams.set(key, String(value));
  return requestJson<T>(env, url);
}

export async function beds24GetAbsolute<T>(env: Beds24Bindings, absoluteUrl: string): Promise<T> {
  const url = new URL(absoluteUrl);
  const allowedHost = new URL(getBaseUrl(env)).host;
  if (url.host !== allowedHost) throw new Error(`Rejected Beds24 pagination host: ${url.host}`);
  return requestJson<T>(env, url);
}
