type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

type JsonRecord = Record<string, unknown>;

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_POLL_INTERVAL_MS = 750;
const SUBMISSION_TIMEOUT_MS = 15_000;

export type PassportOpenAiBackgroundErrorCode = "ambiguous_submission" | "invalid_response" | "request_failed" | "timeout";

export class PassportOpenAiBackgroundError extends Error {
  constructor(
    message: string,
    public readonly code: PassportOpenAiBackgroundErrorCode,
    public readonly responseId: string | null = null,
  ) {
    super(message);
  }
}

export interface PassportOpenAiBackgroundResult {
  payload: unknown;
  httpStatus: number;
  openAiRequestId: string | null;
  responseId: string | null;
  clientRequestId: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function responseIdFrom(payload: unknown): string | null {
  return isRecord(payload) && typeof payload.id === "string" && payload.id.trim() ? payload.id : null;
}

function responseStatusFrom(payload: unknown): string | null {
  return isRecord(payload) && typeof payload.status === "string" ? payload.status : null;
}

function providerErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  if (isRecord(payload.error) && typeof payload.error.message === "string") return payload.error.message;
  if (isRecord(payload.incomplete_details) && typeof payload.incomplete_details.reason === "string") {
    return `OpenAI response incomplete: ${payload.incomplete_details.reason}.`;
  }
  return null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function remainingMs(deadline: number): number {
  return Math.max(0, deadline - Date.now());
}

async function delay(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function fetchWithDeadline(
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

export async function createAndPollPassportOpenAiResponse({
  apiKey,
  body,
  clientRequestId = crypto.randomUUID(),
  fetcher = fetch,
  onCheckpoint,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  responseId: resumeResponseId = null,
  timeoutMs,
}: {
  apiKey: string;
  body: Record<string, unknown>;
  clientRequestId?: string;
  fetcher?: Fetcher;
  onCheckpoint?: (checkpoint: {
    responseId: string;
    status: string | null;
    httpStatus: number;
    openAiRequestId: string | null;
  }) => Promise<void>;
  pollIntervalMs?: number;
  responseId?: string | null;
  timeoutMs: number;
}): Promise<PassportOpenAiBackgroundResult> {
  const deadline = Date.now() + timeoutMs;
  let response: Response;
  let payload: unknown = null;
  let httpStatus: number | null = null;
  let openAiRequestId: string | null = null;
  let responseId = resumeResponseId;
  let status: string | null = responseId ? "in_progress" : null;

  if (!responseId) {
    try {
      response = await fetchWithDeadline(fetcher, OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          "x-client-request-id": clientRequestId,
        },
        body: JSON.stringify({ ...body, background: true }),
      }, Math.min(SUBMISSION_TIMEOUT_MS, remainingMs(deadline)));
    } catch {
      throw new PassportOpenAiBackgroundError("OpenAI background response submission outcome is unknown.", "ambiguous_submission");
    }

    openAiRequestId = response.headers.get("x-request-id") ?? response.headers.get("openai-request-id");
    payload = await response.json().catch(() => null);
    httpStatus = response.status;
    if (!response.ok) {
      throw new PassportOpenAiBackgroundError(providerErrorMessage(payload) ?? "OpenAI request failed.", "request_failed", responseIdFrom(payload));
    }

    responseId = responseIdFrom(payload);
    status = responseStatusFrom(payload);
    if (responseId && onCheckpoint) {
      await onCheckpoint({ responseId, status, httpStatus: response.status, openAiRequestId });
    }
  }

  while (status === "queued" || status === "in_progress") {
    if (!responseId) {
      throw new PassportOpenAiBackgroundError("OpenAI background response did not include an id.", "invalid_response");
    }
    const remaining = remainingMs(deadline);
    if (remaining <= 0) {
      throw new PassportOpenAiBackgroundError("OpenAI background response is still processing.", "timeout", responseId);
    }
    await delay(Math.min(pollIntervalMs, remaining));
    try {
      response = await fetchWithDeadline(fetcher, `${OPENAI_RESPONSES_URL}/${encodeURIComponent(responseId)}`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          "x-client-request-id": clientRequestId,
        },
      }, Math.min(10_000, remainingMs(deadline)));
    } catch (error) {
      if (remainingMs(deadline) > 0) continue;
      throw new PassportOpenAiBackgroundError(
        isAbortError(error) ? "OpenAI background response polling timed out." : "OpenAI background response polling was interrupted.",
        "timeout",
        responseId,
      );
    }
    payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new PassportOpenAiBackgroundError(providerErrorMessage(payload) ?? "OpenAI response retrieval failed.", "request_failed", responseId);
    }
    responseId = responseIdFrom(payload) ?? responseId;
    status = responseStatusFrom(payload);
    if (responseId && onCheckpoint) {
      await onCheckpoint({ responseId, status, httpStatus: response.status, openAiRequestId });
    }
  }

  if (status && status !== "completed") {
    throw new PassportOpenAiBackgroundError(providerErrorMessage(payload) ?? `OpenAI response ended with status ${status}.`, "request_failed", responseId);
  }

  return {
    payload,
    httpStatus: httpStatus ?? 200,
    openAiRequestId,
    responseId,
    clientRequestId,
  };
}
