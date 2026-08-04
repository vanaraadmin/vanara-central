import { Beds24ApiError } from "./beds24-client.service.js";
import { deliverMessageToBeds24, type MessageDeliveryBindings, type MessageDeliveryOptions } from "./message-delivery.service.js";
import { hasModulePermission, isOwner, type CurrentUser } from "./current-user.service.js";
import type { Draft } from "../types/messages.js";

export interface MessageReviewBindings extends MessageDeliveryBindings {
  DB: D1Database;
}

export interface MessageReviewOptions extends MessageDeliveryOptions {
  now?: string;
}

interface DraftReviewRow {
  message_draft_id: number;
  message_id: number;
  message_conversation_id: number;
  booking_id: number | null;
  beds24_booking_id: number | null;
  provider: "BEDS24";
  channel: string;
  prompt_key: Draft["promptKey"];
  prompt_version: string;
  prompt_checksum: string;
  draft_text: string;
  status: Draft["state"];
  model: string;
  vector_store_id: string;
  openai_response_id: string | null;
  context_hash: string;
  retrieval_filenames: string | null;
  retrieval_result_count: number | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  beds24_message_id: string | null;
  provider_response_id: string | null;
  delivery_idempotency_key: string | null;
  failure_code: string | null;
  failure_message: string | null;
}

export class MessageReviewError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "draft_not_found"
      | "draft_not_ready"
      | "draft_already_sent"
      | "draft_delivery_in_progress"
      | "draft_body_invalid"
      | "booking_not_linked"
      | "beds24_delivery_failed",
    public readonly status: 400 | 404 | 409 | 502 = 400,
  ) {
    super(message);
    this.name = "MessageReviewError";
  }
}

export function canReviewGuestMessages(user: CurrentUser): boolean {
  if (isOwner(user)) return true;
  if (user.role === "Manager") return true;
  return user.role === "Reception" && hasModulePermission(user, "messages", "edit");
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeBody(value: unknown): string {
  if (typeof value !== "string") {
    throw new MessageReviewError("Draft text is required.", "draft_body_invalid", 400);
  }
  const body = value.replace(/\r\n/g, "\n").trim();
  if (!body) throw new MessageReviewError("Draft text is required.", "draft_body_invalid", 400);
  if (body.length > 8_000) throw new MessageReviewError("Draft text is too long.", "draft_body_invalid", 400);
  return body;
}

function reviewerName(user: CurrentUser): string {
  return clean(user.displayName) ?? clean(user.fullName) ?? clean(user.username) ?? user.id;
}

function parseFilenames(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function toDraft(row: DraftReviewRow): Draft {
  return {
    draftId: String(row.message_draft_id),
    messageId: String(row.message_id),
    conversationId: String(row.message_conversation_id),
    promptKey: row.prompt_key,
    promptVersion: row.prompt_version,
    promptChecksum: row.prompt_checksum,
    state: row.status,
    body: row.draft_text,
    retrievalFilenames: parseFilenames(row.retrieval_filenames),
    retrievalResultCount: row.retrieval_result_count ?? parseFilenames(row.retrieval_filenames).length,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadDraftRow(env: MessageReviewBindings, draftId: number): Promise<DraftReviewRow | null> {
  return env.DB.prepare(`
    SELECT
      d.message_draft_id,
      d.message_id,
      d.message_conversation_id,
      d.booking_id,
      m.beds24_booking_id,
      m.provider,
      m.channel,
      d.prompt_key,
      d.prompt_version,
      d.prompt_checksum,
      d.draft_text,
      d.status,
      d.model,
      d.vector_store_id,
      d.openai_response_id,
      d.context_hash,
      d.retrieval_filenames,
      d.retrieval_result_count,
      d.created_at,
      d.updated_at,
      d.sent_at,
      d.beds24_message_id,
      d.provider_response_id,
      d.delivery_idempotency_key,
      d.failure_code,
      d.failure_message
    FROM message_drafts d
    INNER JOIN messages m
      ON m.message_id = d.message_id
    WHERE d.message_draft_id = ?
  `).bind(draftId).first<DraftReviewRow>();
}

function assertReadyForReview(row: DraftReviewRow): void {
  if (row.status === "SENT") throw new MessageReviewError("Draft has already been sent.", "draft_already_sent", 409);
  if (row.status === "APPROVED") throw new MessageReviewError("Draft delivery is already in progress.", "draft_delivery_in_progress", 409);
  if (row.status !== "READY") throw new MessageReviewError("Draft is not ready for review.", "draft_not_ready", 400);
}

export async function editMessageDraft(
  env: MessageReviewBindings,
  draftId: number,
  user: CurrentUser,
  bodyInput: unknown,
  options: MessageReviewOptions = {},
): Promise<Draft> {
  const row = await loadDraftRow(env, draftId);
  if (!row) throw new MessageReviewError("Draft not found.", "draft_not_found", 404);
  assertReadyForReview(row);

  const body = normalizeBody(bodyInput);
  const now = options.now ?? new Date().toISOString();
  const result = await env.DB.prepare(`
    UPDATE message_drafts
    SET original_draft_text = COALESCE(original_draft_text, draft_text),
        edited_draft_text = ?,
        draft_text = ?,
        edited_by = ?,
        edited_by_name = ?,
        edited_at = ?,
        updated_at = ?
    WHERE message_draft_id = ?
      AND status = 'READY'
  `).bind(body, body, user.id, reviewerName(user), now, now, draftId).run();

  if ((result.meta?.changes ?? 0) === 0) {
    const replay = await loadDraftRow(env, draftId);
    if (replay?.status === "SENT") throw new MessageReviewError("Draft has already been sent.", "draft_already_sent", 409);
    throw new MessageReviewError("Draft is no longer ready for review.", "draft_not_ready", 409);
  }

  const updated = await loadDraftRow(env, draftId);
  if (!updated) throw new MessageReviewError("Draft not found.", "draft_not_found", 404);
  return toDraft(updated);
}

export async function rejectMessageDraft(
  env: MessageReviewBindings,
  draftId: number,
  user: CurrentUser,
  reasonInput: unknown,
  options: MessageReviewOptions = {},
): Promise<Draft> {
  const row = await loadDraftRow(env, draftId);
  if (!row) throw new MessageReviewError("Draft not found.", "draft_not_found", 404);
  if (row.status === "REJECTED") return toDraft(row);
  assertReadyForReview(row);

  const now = options.now ?? new Date().toISOString();
  const reason = typeof reasonInput === "string" ? clean(reasonInput) : null;
  const result = await env.DB.prepare(`
    UPDATE message_drafts
    SET status = 'REJECTED',
        rejected_by = ?,
        rejected_by_name = ?,
        rejected_at = ?,
        rejection_reason = ?,
        updated_at = ?
    WHERE message_draft_id = ?
      AND status = 'READY'
  `).bind(user.id, reviewerName(user), now, reason, now, draftId).run();

  if ((result.meta?.changes ?? 0) === 0) {
    const replay = await loadDraftRow(env, draftId);
    if (replay?.status === "REJECTED") return toDraft(replay);
    if (replay?.status === "SENT") throw new MessageReviewError("Draft has already been sent.", "draft_already_sent", 409);
    throw new MessageReviewError("Draft is no longer ready for review.", "draft_not_ready", 409);
  }

  await env.DB.batch([
    env.DB.prepare("UPDATE messages SET state = 'REVIEW_PENDING', updated_at = ? WHERE message_id = ?").bind(now, row.message_id),
    env.DB.prepare("UPDATE message_conversations SET state = 'OPEN', updated_at = ? WHERE message_conversation_id = ?").bind(now, row.message_conversation_id),
  ]);

  const updated = await loadDraftRow(env, draftId);
  if (!updated) throw new MessageReviewError("Draft not found.", "draft_not_found", 404);
  return toDraft(updated);
}

export async function approveMessageDraft(
  env: MessageReviewBindings,
  draftId: number,
  user: CurrentUser,
  options: MessageReviewOptions = {},
): Promise<Draft> {
  const row = await loadDraftRow(env, draftId);
  if (!row) throw new MessageReviewError("Draft not found.", "draft_not_found", 404);
  if (row.status === "SENT") return toDraft(row);
  const canRetryFailedDelivery = row.status === "APPROVED"
    && row.failure_code === "beds24_delivery_failed"
    && row.sent_at === null
    && row.beds24_message_id === null;
  if (!canRetryFailedDelivery) {
    assertReadyForReview(row);
  }
  if (row.beds24_booking_id === null) {
    throw new MessageReviewError("Draft is not linked to a Beds24 booking.", "booking_not_linked", 400);
  }

  const now = options.now ?? new Date().toISOString();
  const deliveryKey = row.delivery_idempotency_key ?? `BEDS24:outbound:draft:${draftId}`;
  if (!canRetryFailedDelivery) {
    const approved = await env.DB.prepare(`
      UPDATE message_drafts
      SET status = 'APPROVED',
          approved_by = ?,
          approved_by_name = ?,
          approved_at = ?,
          delivery_idempotency_key = ?,
          updated_at = ?
      WHERE message_draft_id = ?
        AND status = 'READY'
    `).bind(user.id, reviewerName(user), now, deliveryKey, now, draftId).run();

    if ((approved.meta?.changes ?? 0) === 0) {
      const replay = await loadDraftRow(env, draftId);
      if (replay?.status === "SENT") return toDraft(replay);
      throw new MessageReviewError("Draft is no longer ready for review.", "draft_not_ready", 409);
    }
  }

  let delivery: Awaited<ReturnType<typeof deliverMessageToBeds24>>;
  try {
    delivery = await deliverMessageToBeds24(env, {
      draft: toDraft(row),
      beds24BookingId: row.beds24_booking_id,
      approvedBody: row.draft_text,
      idempotencyKey: deliveryKey,
    }, options);
  } catch (error) {
    const message = error instanceof Beds24ApiError ? error.message : "Beds24 outbound delivery failed.";
    await env.DB.prepare(`
      UPDATE message_drafts
      SET failure_code = 'beds24_delivery_failed',
          failure_message = ?,
          updated_at = ?
      WHERE message_draft_id = ?
        AND status = 'APPROVED'
    `).bind(message.slice(0, 1000), new Date().toISOString(), draftId).run();
    throw new MessageReviewError(message, "beds24_delivery_failed", 502);
  }

  const providerMessageId = delivery.beds24MessageId ?? `vanara-outbound-draft:${draftId}`;
  const rawProviderPayload = JSON.stringify({
    source: "vanara-human-review",
    draftId,
    response: delivery.rawProviderResponse,
  });

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO messages (
        message_conversation_id,
        provider,
        provider_message_id,
        provider_booking_id,
        booking_id,
        beds24_booking_id,
        direction,
        author,
        received_at,
        guest_message,
        language,
        channel,
        state,
        association_state,
        raw_provider_payload,
        idempotency_key,
        created_at,
        updated_at
      )
      VALUES (?, 'BEDS24', ?, ?, ?, ?, 'OUTBOUND', 'WARAPORN', ?, ?, NULL, ?, 'SENT', 'LINKED', ?, ?, ?, ?)
      ON CONFLICT(idempotency_key) DO NOTHING
    `).bind(
      row.message_conversation_id,
      providerMessageId,
      row.beds24_booking_id,
      row.booking_id,
      row.beds24_booking_id,
      now,
      row.draft_text,
      row.channel,
      rawProviderPayload,
      deliveryKey,
      now,
      now,
    ),
    env.DB.prepare(`
      UPDATE message_drafts
      SET status = 'SENT',
          sent_at = ?,
          beds24_message_id = ?,
          provider_response_id = ?,
          failure_code = NULL,
          failure_message = NULL,
          updated_at = ?
      WHERE message_draft_id = ?
        AND status = 'APPROVED'
    `).bind(now, delivery.beds24MessageId, delivery.providerResponseId, now, draftId),
    env.DB.prepare("UPDATE messages SET state = 'SENT', updated_at = ? WHERE message_id = ?").bind(now, row.message_id),
    env.DB.prepare(`
      UPDATE message_conversations
      SET state = 'SENT',
          last_message_at = ?,
          updated_at = ?
      WHERE message_conversation_id = ?
    `).bind(now, now, row.message_conversation_id),
  ]);

  const updated = await loadDraftRow(env, draftId);
  if (!updated) throw new MessageReviewError("Draft not found.", "draft_not_found", 404);
  return toDraft(updated);
}
