# Guest Messages Workspace

Guest Messages is the operational inbox for reviewing and sending AI-drafted replies to OTA guests.

It is not a chat product, CRM, analytics surface, or AI debugging console. It exists for one daily workflow:

Guest message -> Waraporn draft -> Human review -> Approve, edit, or reject -> Beds24 delivery.

## Product Philosophy

Guest Messages keeps humans in control of guest-facing communication.

Waraporn may prepare a draft, but the application does not treat a draft as a sent message. A draft becomes guest-facing only after an authorized human approves it.

The workspace shows only operational conversation content:

- guest messages;
- Waraporn drafts;
- human review events;
- sent replies.

It never shows OpenAI reasoning, tool calls, token usage, internal sync logs, provider payloads, or backend diagnostics in the staff interface.

## Architecture

Guest Messages is built on the native Vanara messages domain.

Primary server services:

- `messages-sync.service.ts`: imports OTA guest messages from Beds24.
- `message-association.service.ts`: associates imported messages to local bookings and conversations.
- `message-context-builder.service.ts`: builds verified runtime context for Waraporn.
- `waraporn-draft.service.ts`: generates and stores Waraporn drafts.
- `guest-messages-workspace.service.ts`: builds the read-only inbox and conversation read model.
- `message-review.service.ts`: owns human review, edit, approve, reject, idempotency, and state transitions.
- `message-delivery.service.ts`: sends approved replies through Beds24.

Primary UI files:

- `src/pages/MessagesPage.tsx`
- `src/services/messages.service.ts`
- `src/styles/messages.css`

## Data Model

The workspace uses the native D1 message tables:

- `messages`
- `message_conversations`
- `message_drafts`
- `sync_runs`
- `sync_cursors`
- `sync_record_issues`

Imported guest messages, generated drafts, and outbound sent replies remain traceable. Local history is preserved.

## States

Message states include:

- `RECEIVED`
- `ASSOCIATED`
- `UNLINKED`
- `DRAFT_PENDING`
- `GENERATING`
- `DRAFT_READY`
- `REVIEW_PENDING`
- `SENT`
- `FAILED`
- `FAILED_MANUAL_RETRY`

Draft states include:

- `READY`
- `APPROVED`
- `REJECTED`
- `SENT`
- terminal failure states used by the Waraporn generation pipeline.

`APPROVED` means a human approved the draft and delivery may be in progress or retryable after a provider failure. A failed Beds24 delivery remains recoverable and is surfaced in the workspace as a failed delivery draft with retry action.

Conversation states include:

- `OPEN`
- `DRAFT_READY`
- `SENT`
- `ARCHIVED`

## Workflow

1. Beds24 guest message is imported.
2. Message is deduplicated by provider message id.
3. Message is linked to a local booking when possible.
4. Conversation is created or reused.
5. Waraporn generates one stored draft.
6. Draft appears in Guest Messages.
7. Authorized reviewer chooses:
   - Approve;
   - Edit;
   - Reject.
8. Approve sends the current stored draft through Beds24.
9. Sent reply is stored as an outbound message.
10. Conversation moves to waiting guest state.

Rejected drafts are never sent. Edited drafts never call OpenAI again. Approve never regenerates text.

## APIs

Read endpoints:

- `GET /api/messages/conversations`
- `GET /api/messages/conversations/:conversationId`

Review endpoints:

- `PATCH /api/messages/drafts/:draftId`
- `POST /api/messages/drafts/:draftId/approve`
- `POST /api/messages/drafts/:draftId/reject`

Operational sync endpoints:

- `POST /sync/messages`

Diagnostic owner endpoint:

- `GET /api/messages`

## Permissions

Can read Guest Messages:

- Staff view users with Messages module access.
- Owner view users.

Can approve, edit, or reject:

- Owner.
- Manager.
- Reception users with Messages edit permission.

Read-only:

- Housekeeping.
- Maintenance.
- Users without Messages edit permission.

Unauthorized users must not see review actions. Backend authorization enforces the same rule as the UI.

## Delivery And Idempotency

Beds24 delivery is performed only after human approval.

The idempotency key is:

`BEDS24:outbound:draft:{draftId}`

Duplicate approve calls must never send two provider messages. If a draft is already `SENT`, approve replays the sent state without another Beds24 call.

If Beds24 delivery fails after approval, the draft remains traceable and retryable. The retry uses the same idempotency key and must not create duplicate outbound rows.

## Error Handling

Expected operational errors:

- missing or deleted draft;
- draft no longer ready;
- duplicate approve;
- provider delivery failure;
- missing booking association;
- permission denied;
- network failure.

Errors are returned as safe product messages. Secrets, provider tokens, raw provider payloads, OpenAI internals, and stack traces must not be exposed to the UI.

## UI Contract

The workspace has three regions on desktop:

- Inbox.
- Conversation timeline.
- Booking context.

On smaller screens the conversation comes first, followed by inbox and context.

The UI must remain calm, premium, and operational. It must avoid tables, developer language, logs, metrics, token counts, and AI implementation details.

Loading uses skeleton states, not full-page spinners. Empty states are specific to the operational situation.

## Security

The workspace must never print or expose:

- Beds24 tokens;
- OpenAI keys;
- raw session cookies;
- provider payloads in staff UI;
- hidden AI reasoning.

Delivery endpoints require authenticated, authorized users. Sync endpoints remain Owner-only.

## Production Release Checks

Before release:

- server tests pass;
- frontend/source tests pass;
- typecheck passes;
- lint passes;
- build passes;
- production deploy succeeds;
- authenticated smoke succeeds;
- one real Booking.com conversation completes guest -> draft -> approve -> Beds24 -> reply.

## Known Limitations

- Guest Messages currently supports Beds24-backed OTA messaging.
- Human review is required for sending through the workspace.
- The workspace does not yet include dedicated filters beyond search.
- The workspace does not expose staff assignment, SLA, or conversation ownership.

## Future Extensions

Future releases may add:

- WhatsApp;
- website inbox;
- LINE replacement cutover;
- staff assignment;
- conversation labels;
- richer message search;
- audit views for owners;
- performance and cost dashboards outside the staff conversation UI.
