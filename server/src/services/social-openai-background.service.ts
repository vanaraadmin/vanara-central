type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

type JsonRecord = Record<string, unknown>;

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const SUBMISSION_TIMEOUT_MS = 15_000;
const POLL_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_POLL_INTERVAL_MS = 750;

export type SocialOpenAiBackgroundErrorCode =
  | "ambiguous_submission"
  | "invalid_response"
  | "request_failed"
  | "timeout";

export class SocialOpenAiBackgroundError extends Error {
  constructor(
    message: string,
    public readonly code: SocialOpenAiBackgroundErrorCode,
    public readonly responseId: string | null = null,
  ) {
    super(message);
    this.name = "SocialOpenAiBackgroundError";
  }
}

export interface SocialOpenAiBackgroundCheckpoint {
  responseId: string;
  status: string | null;
  httpStatus: number;
  providerRequestId: string | null;
  submitted: boolean;
}

export interface SocialOpenAiBackgroundResult {
  payload: unknown;
  responseId: string;
  status: "completed";
  providerRequestId: string | null;
  clientRequestId: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function responseIdFrom(payload: unknown): string | null {
  return isRecord(payload) && typeof payload.id === "string" && payload.id.trim() ? payload.id.trim() : null;
}

function responseStatusFrom(payload: unknown): string | null {
  return isRecord(payload) && typeof payload.status === "string" && payload.status.trim()
    ? payload.status.trim().toLowerCase()
    : null;
}

function providerErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  if (isRecord(payload.error) && typeof payload.error.message === "string") return payload.error.message;
  if (isRecord(payload.incomplete_details) && typeof payload.incomplete_details.reason === "string") {
    return `OpenAI response incomplete: ${payload.incomplete_details.reason}.`;
  }
  return null;
}

function remainingMs(deadline: number): number {
  return Math.max(0, deadline - Date.now());
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchWithTimeout(
  fetcher: Fetcher,
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  try {
    return await fetcher(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function runSocialOpenAiBackgroundResponse({
  apiKey,
  body,
  clientRequestId,
  fetcher = fetch,
  onCheckpoint,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  responseId: resumeResponseId = null,
  timeoutMs,
}: {
  apiKey: string;
  body: Record<string, unknown> | null;
  clientRequestId: string;
  fetcher?: Fetcher;
  onCheckpoint: (checkpoint: SocialOpenAiBackgroundCheckpoint) => Promise<void>;
  pollIntervalMs?: number;
  responseId?: string | null;
  timeoutMs: number;
}): Promise<SocialOpenAiBackgroundResult> {
  const deadline = Date.now() + timeoutMs;
  let responseId = resumeResponseId;
  let status: string | null = responseId ? "in_progress" : null;
  let payload: unknown = null;
  let providerRequestId: string | null = null;

  if (!responseId) {
    if (!body) {
      throw new SocialOpenAiBackgroundError("OpenAI submission body is missing.", "invalid_response");
    }
    let response: Response;
    try {
      response = await fetchWithTimeout(fetcher, OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          "x-client-request-id": clientRequestId,
        },
        body: JSON.stringify({ ...body, background: true }),
      }, Math.min(SUBMISSION_TIMEOUT_MS, remainingMs(deadline)));
    } catch {
      throw new SocialOpenAiBackgroundError(
        "OpenAI background submission outcome is unknown.",
        "ambiguous_submission",
      );
    }

    providerRequestId = response.headers.get("x-request-id") ?? response.headers.get("openai-request-id");
    payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new SocialOpenAiBackgroundError(
        providerErrorMessage(payload) ?? "OpenAI background submission failed.",
        "request_failed",
        responseIdFrom(payload),
      );
    }

    responseId = responseIdFrom(payload);
    status = responseStatusFrom(payload);
    if (!responseId) {
      throw new SocialOpenAiBackgroundError(
        "OpenAI accepted the request without a recoverable response id.",
        "ambiguous_submission",
      );
    }
    await onCheckpoint({
      responseId,
      status,
      httpStatus: response.status,
      providerRequestId,
      submitted: true,
    });
  }

  while (status === "queued" || status === "in_progress") {
    const remaining = remainingMs(deadline);
    if (remaining <= 0) {
      throw new SocialOpenAiBackgroundError(
        "OpenAI background response is still processing.",
        "timeout",
        responseId,
      );
    }
    await delay(Math.min(pollIntervalMs, remaining));

    let response: Response;
    try {
      response = await fetchWithTimeout(fetcher, `${OPENAI_RESPONSES_URL}/${encodeURIComponent(responseId)}`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          "x-client-request-id": clientRequestId,
        },
      }, Math.min(POLL_REQUEST_TIMEOUT_MS, remainingMs(deadline)));
    } catch {
      if (remainingMs(deadline) > 0) continue;
      throw new SocialOpenAiBackgroundError(
        "OpenAI background polling was interrupted.",
        "timeout",
        responseId,
      );
    }

    providerRequestId = response.headers.get("x-request-id")
      ?? response.headers.get("openai-request-id")
      ?? providerRequestId;
    payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new SocialOpenAiBackgroundError(
        providerErrorMessage(payload) ?? "OpenAI background response retrieval failed.",
        "request_failed",
        responseId,
      );
    }

    responseId = responseIdFrom(payload) ?? responseId;
    status = responseStatusFrom(payload);
    await onCheckpoint({
      responseId,
      status,
      httpStatus: response.status,
      providerRequestId,
      submitted: false,
    });
  }

  if (status !== "completed") {
    throw new SocialOpenAiBackgroundError(
      providerErrorMessage(payload) ?? `OpenAI response ended with status ${status ?? "unknown"}.`,
      "request_failed",
      responseId,
    );
  }

  return {
    payload,
    responseId,
    status: "completed",
    providerRequestId,
    clientRequestId,
  };
}
