# Waraporn Message Module Foundation

Status: Frozen product architecture.  
Date: 2026-08-04 Asia/Bangkok.  
Scope: Documentation only. No production behaviour changes.

This document is the implementation contract for the native Vanara `Messages` module.
Every future Messages sprint must reference it before implementation.

Source documents:

- `docs/messaging/WARAPORN_MAKE_MIGRATION_AUDIT.md`
- `Vanara Concierge - V4 Pre-Prod.blueprint.json`
- `Integration Webhooks.blueprint.json`
- current Vanara Central repository

## Product Vision

The module is called `Messages`.

It is not `Chat`.
It is not `Conversation`.
It is not `Messenger`.
It is not an internal communication system.
It is not a live chat product.
It is not a WhatsApp clone.

`Messages` is the OTA guest messaging workspace for Vanara Central.

Allowed message sources:

- Beds24 guest messages
- Booking.com guest messages through Beds24
- Airbnb guest messages through Beds24 when supported
- future OTA providers when explicitly integrated

Internal team communication remains a separate product area.

## Product Purpose

The product workflow is:

Guest sends message

Waraporn prepares draft

Management reviews

Send

Everything else is implementation.

## Frozen Rules

1. The complete General Requests Waraporn prompt is frozen.

   It must remain byte-identical.
   It must not be rewritten, optimized, simplified, merged, modernized or paraphrased.
   It must be stored as a prompt asset before AI drafting is implemented.
   The checksum is the production guardrail.

2. The current light prompts are not migrated as final composers.

   Availability, extension, accommodation and similar prompt branches become structured intent extraction, verified backend queries and context injection.
   There is one final composer: the frozen full Waraporn prompt.

3. The OpenAI Vector Store remains attached at API level.

   The Responses API call must include the configured Vector Store, matching the current Make behaviour.
   Prompt instructions alone are not enough.
   Future code must fail validation if the configured Vector Store is absent from the draft-generation request.

4. The module is `Messages`, not `Chat`.

   Only OTA guest messages belong here.
   Internal staff chat remains outside this module.

5. Human review is mandatory.

   The review workflow is:

   Guest Message

   Waraporn Draft

   Reject

   Edit

   Send

6. Reject does not delete.

   Reject changes workflow state and preserves history.
   Manual reply remains possible after reject.

7. Edit edits the draft.

   The original guest message is immutable.

8. Beds24 remains the transport layer.

   Vanara becomes the orchestration layer.

9. SQL becomes conversation memory.

   The Make datastore does not survive the native implementation.

10. Messages never bypass management.

   Every outbound AI reply requires explicit approval before provider delivery.

## Frozen Waraporn Requirements

The frozen full prompt is extracted from:

`Vanara Concierge - V4 Pre-Prod.blueprint.json -> module 25 -> mapper.jsonStringBodyContent.instructions`

Current checksum:

`1534c2d9654b2ccca292784110d31b7a6aa739fb498709913bd3278ca5e6848e`

Current audit reference:

`docs/messaging/WARAPORN_MAKE_MIGRATION_AUDIT.md`

The future `Prompt Asset Freeze` sprint must:

- store the prompt as a repository or database-backed prompt asset;
- calculate the checksum from the exact stored bytes;
- add a regression test that fails if the prompt changes;
- store model and vector-store configuration separately from prompt text;
- ensure no application code embeds an edited copy of the prompt.

## Native Pipeline

The native architecture is:

Beds24 Sync

Message Normalization

Booking Association

Verified Data Builder

Context Builder

Frozen Waraporn Prompt

Draft

Messages Workspace

Reject / Edit / Send

Beds24

The pipeline is deterministic until the final Waraporn composition step.
The AI composer receives verified context; it does not discover operational truth by guessing.

## Verified Data Builder

The Verified Data Builder is mandatory.

Its responsibility is to query authoritative Vanara data before AI composition.
Only verified data enters Waraporn.

Always considered:

- incoming guest message
- provider message id
- booking association status
- guest name when available
- booking arrival and departure dates when linked
- message source/channel
- recent messages in the same provider conversation
- current intent and extracted structured facts
- detected language or language hint

Conditional context:

- booking details from `bookings`
- guest details from `booking_guests`
- room and accommodation data from `units` and `room_types`
- stay phase from booking dates and Reception operational state
- commercial availability from `unit_availability_cache`
- pricing from `offer_prices`
- group booking facts from `booking_group_members`
- cancellation or provider-deleted state from local booking status
- conversation summary when the message history is long
- Knowledge Base retrieval through the configured OpenAI Vector Store
- operational policies that are approved for guest-facing answers

Restricted context:

- Housekeeping state is included only when the guest question explicitly requires it and Product has approved guest-facing use.
- Maintenance state is included only when the guest question explicitly requires it and Product has approved guest-facing use.
- Passport, deposit, payment and identity data are sensitive and must be included only when directly relevant, permission-safe and product-approved.
- Internal task ids, staff notes, audit records, operational debug data and private system metadata never enter Waraporn.

Verified Data Builder output must be a typed context envelope.
It must include source, timestamp or freshness, and whether a fact is verified, missing or unavailable.

## Messages Workspace

The future UI is an operational review workspace.

It is not a messenger timeline.
It is not chat bubbles.
It is not WhatsApp.

Compact state:

Messages

New Messages

Guest Message

Expanded review state:

Guest Message

Waraporn Draft

Reject

Edit

Send

Minimum Sprint 01 UI:

Messages

New Messages

Guest Message

No AI draft.
No review controls.
No send.

## Native Review Semantics

`Reject`

- changes draft state to rejected;
- preserves original guest message;
- preserves rejected draft text;
- allows future manual reply;
- does not send anything to Beds24.

`Edit`

- edits only the draft;
- increments draft version;
- never mutates the guest message;
- requires optimistic locking to avoid overwriting another manager's edit.

`Send`

- requires explicit approval;
- sends the final approved text to Beds24;
- writes a delivery attempt;
- writes an audit event;
- must be idempotent;
- must prevent double send.

`Manual Reply`

- creates a human-authored draft or final reply inside the same Messages workflow;
- never bypasses audit;
- must follow the same send authority as approved AI drafts.

## Native Data Ownership

Beds24 owns provider transport.

Vanara owns:

- local message persistence;
- conversation memory;
- booking association;
- verified context;
- Waraporn draft orchestration;
- human review state;
- delivery attempts;
- audit history.

Make datastore is replaced by D1.

The implementation may store all guest messages, drafts and delivery attempts in SQL.
It must not duplicate authoritative booking, guest, unit or stay data already present in Vanara.

## Permissions

Messages is a Staff/Owner workspace, but send authority is not generic staff access.

Minimum capability model:

- view Messages;
- view guest message detail;
- edit draft;
- reject draft;
- approve and send;
- create manual reply;
- retry failed send.

Owner receives administrative capability.
Product must explicitly decide which non-Owner roles can approve and send OTA guest replies.

## Out Of Scope For This Sprint

No D1 schema.
No migrations.
No API endpoints.
No UI implementation.
No scheduler.
No Beds24 polling implementation.
No OpenAI implementation.
No prompt asset storage.
No draft generation.
No deploy.

## Sprint Roadmap

### Sprint 0.5 - Prompt Asset Freeze

Objective:

Freeze the Waraporn prompt as a protected asset before any AI implementation.

Tangible result:

The prompt is stored, hashed and guarded by tests.

Scope:

- store the exact full prompt;
- calculate checksum;
- add checksum test;
- add vector-store configuration requirement;
- no AI drafting;
- no UI;
- no sync.

Acceptance:

- checksum equals `1534c2d9654b2ccca292784110d31b7a6aa739fb498709913bd3278ca5e6848e`;
- changing one byte fails tests;
- prompt text is not duplicated in application code.

### Sprint 01 - Messages Foundation

Objective:

Create the `Messages` module infrastructure.

Tangible result:

Messages

New Messages

Guest Message

Scope:

- D1 schema;
- sync messages;
- Beds24 polling;
- deduplication;
- booking association;
- message inbox;
- Staff Home widget.

Out of scope:

- AI;
- draft;
- review;
- send.

### Sprint 02 - Waraporn Draft Engine

Objective:

Generate AI drafts from new guest messages.

Tangible result:

Every imported guest message generates a Waraporn draft.
Nothing is sent.

Pipeline:

Message

Intent

Verified Data Builder

Context Builder

Frozen Waraporn Prompt

Draft

Out of scope:

- review UI;
- edit;
- reject;
- send.

### Sprint 03 - Messages Review Workspace

Objective:

Build the human review workspace.

Tangible result:

Management can read the guest message, review Waraporn draft, reject, edit and choose send.

Scope:

- UI only where possible;
- guest message display;
- draft display;
- reject action;
- edit action;
- send action surface.

Out of scope:

- native Beds24 delivery if not yet implemented;
- LINE cutover.

### Sprint 04 - Native Beds24 Delivery

Objective:

Send approved replies from Vanara to Beds24.

Tangible result:

Approve

Beds24

Sent

Audit

Done

Scope:

- Beds24 outbound message send;
- idempotency;
- delivery attempts;
- retry;
- audit;
- history.

Acceptance:

- double send is impossible;
- failed send is retryable;
- sent reply is visible in history;
- Make/LINE is no longer needed for successful native send in controlled validation.

### Sprint 05 - Production Cutover

Objective:

Safely replace Make and LINE.

Tangible result:

Vanara becomes authoritative.
LINE off.
Make off.

Scope:

- shadow mode;
- Make/Vanara comparison;
- production smoke;
- switch authority;
- disable LINE review;
- disable Make scenarios.

Acceptance:

- no duplicate sends;
- no valid incoming message lost;
- sync health green;
- unresolved message processing issues visible;
- rollback path documented.

## Final Product Principle

Vanara is not building a generic message module.

Vanara is building the resort AI orchestration layer.

Future guest questions such as:

`Can we stay one more night?`

must not route through separate final personalities.

They must flow through:

Message

Verified Resort Context

Waraporn

That is the permanent product architecture.
