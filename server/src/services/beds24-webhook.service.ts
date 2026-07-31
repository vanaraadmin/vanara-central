export interface Beds24WebhookBindings {
  DB: D1Database;
  BEDS24_WEBHOOK_SECRET?: string;
}

export type Beds24WebhookEvent = "booking_created" | "booking_updated" | "booking_cancelled";
export type Beds24WebhookStatus = "accepted" | "duplicate";

export interface Beds24WebhookInput {
  event: Beds24WebhookEvent;
  bookingId: string;
}

export interface Beds24WebhookRecord {
  event: Beds24WebhookEvent;
  bookingId: string;
  receivedAt: string;
  requestId: string;
  processingStatus: Beds24WebhookStatus;
}

export class Beds24WebhookError extends Error {
  constructor(
    public readonly code: "webhook_secret_missing" | "webhook_secret_invalid" | "webhook_content_type_invalid" | "webhook_json_invalid" | "webhook_payload_invalid" | "webhook_method_invalid",
    message: string,
    public readonly status: 400 | 401 | 405,
  ) {
    super(message);
  }
}

const SUPPORTED_EVENTS = new Set<Beds24WebhookEvent>(["booking_created", "booking_updated", "booking_cancelled"]);
const JSON_CONTENT_TYPES = new Set(["application/json", "application/ld+json"]);
const WEBHOOK_SECRET_HEADER = "X-Vanara-Webhook-Secret";

function logInfo(event: string, payload: object): void {
  console.log(JSON.stringify({ event, ...payload }));
}

function logWarning(event: string, payload: object): void {
  console.warn(JSON.stringify({ event, level: "warning", ...payload }));
}

function logError(event: string, payload: object): void {
  console.error(JSON.stringify({ event, level: "error", ...payload }));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function contentTypeHeader(value: string | null): string {
  return value?.split(";")[0]?.trim().toLowerCase() ?? "";
}

function isSupportedEvent(value: unknown): value is Beds24WebhookEvent {
  return typeof value === "string" && SUPPORTED_EVENTS.has(value as Beds24WebhookEvent);
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function secretsMatch(provided: string, expected: string): Promise<boolean> {
  return await sha256(provided) === await sha256(expected);
}

async function createIdempotencyKey(input: Beds24WebhookInput): Promise<string> {
  return sha256(`${input.event}:${input.bookingId}`);
}

function normalizeWebhookPayload(payload: unknown): Beds24WebhookInput {
  if (!payload || typeof payload !== "object") {
    throw new Beds24WebhookError("webhook_payload_invalid", "Webhook payload must be a JSON object.", 400);
  }

  const record = payload as Record<string, unknown>;
  if (!isSupportedEvent(record.event)) {
    throw new Beds24WebhookError("webhook_payload_invalid", "Webhook event is not supported.", 400);
  }

  if (typeof record.bookingId !== "string" || record.bookingId.trim().length === 0) {
    throw new Beds24WebhookError("webhook_payload_invalid", "Webhook bookingId is required.", 400);
  }

  return {
    event: record.event,
    bookingId: record.bookingId.trim(),
  };
}

export function validateBeds24WebhookMethod(method: string): void {
  if (method.toUpperCase() !== "POST") {
    throw new Beds24WebhookError("webhook_method_invalid", "Webhook endpoint accepts POST only.", 405);
  }
}

export async function authenticateBeds24Webhook(env: Beds24WebhookBindings, headerValue: string | null): Promise<void> {
  if (!headerValue || headerValue.length === 0) {
    logWarning("beds24_webhook_auth_rejected", { reason: "missing_secret" });
    throw new Beds24WebhookError("webhook_secret_missing", "Webhook secret is required.", 401);
  }

  const expected = env.BEDS24_WEBHOOK_SECRET;
  if (!expected || !(await secretsMatch(headerValue, expected))) {
    logWarning("beds24_webhook_auth_rejected", { reason: "invalid_secret" });
    throw new Beds24WebhookError("webhook_secret_invalid", "Webhook secret is invalid.", 401);
  }
}

export async function parseBeds24WebhookRequest(request: Request): Promise<Beds24WebhookInput> {
  if (!JSON_CONTENT_TYPES.has(contentTypeHeader(request.headers.get("content-type")))) {
    logWarning("beds24_webhook_invalid_payload", { reason: "invalid_content_type" });
    throw new Beds24WebhookError("webhook_content_type_invalid", "Webhook content type must be application/json.", 400);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    logWarning("beds24_webhook_invalid_payload", { reason: "invalid_json" });
    throw new Beds24WebhookError("webhook_json_invalid", "Webhook body must be valid JSON.", 400);
  }

  try {
    return normalizeWebhookPayload(payload);
  } catch (error) {
    logWarning("beds24_webhook_invalid_payload", {
      reason: error instanceof Beds24WebhookError ? error.code : "invalid_payload",
    });
    throw error;
  }
}

export async function recordBeds24Webhook(env: Beds24WebhookBindings, input: Beds24WebhookInput, requestId = crypto.randomUUID(), receivedAt = new Date().toISOString()): Promise<Beds24WebhookRecord> {
  const idempotencyKey = await createIdempotencyKey(input);
  const result = await env.DB.prepare(`
    INSERT OR IGNORE INTO beds24_webhook_events (
      idempotency_key,
      event,
      booking_id,
      request_id,
      received_at,
      processing_status
    ) VALUES (?, ?, ?, ?, ?, 'accepted')
  `).bind(
    idempotencyKey,
    input.event,
    input.bookingId,
    requestId,
    receivedAt,
  ).run();

  if ((result.meta.changes ?? 0) === 0) {
    logInfo("beds24_webhook_duplicate", {
      webhookEvent: input.event,
      bookingId: input.bookingId,
      requestId,
    });
    return {
      event: input.event,
      bookingId: input.bookingId,
      receivedAt,
      requestId,
      processingStatus: "duplicate",
    };
  }

  logInfo("beds24_webhook_accepted", {
    webhookEvent: input.event,
    bookingId: input.bookingId,
    requestId,
  });

  return {
    event: input.event,
    bookingId: input.bookingId,
    receivedAt,
    requestId,
    processingStatus: "accepted",
  };
}

export function logBeds24WebhookFailure(error: unknown): void {
  logError("beds24_webhook_internal_failure", { error: errorMessage(error) });
}

export { WEBHOOK_SECRET_HEADER };
