# External Laundry Service — Functional Brief

**Status:** approved functional brief; implementation intentionally deferred after the completed-housekeeping release.

## Purpose

Vanara needs a reliable chain of custody for linen sent to an external laundry. Every outbound load must be recorded, and every returned load must be checked against exactly what was sent. The goal is to prevent lost pieces, unexplained weight differences and unverified returns.

The module lives **inside the existing Housekeeping workspace**, below the normal Housekeeping operations. It is not a separate workspace and must follow Central's existing responsive, mobile-first visual system.

## Access and visibility

- Every Central user who can access Housekeeping can see the Laundry Service block and its history.
- Any authorised Housekeeping user or Owner may create an outbound laundry load.
- The user who receives/checks a load does **not** need to be the user who created it.
- Nun currently coordinates the process, but the workflow must never depend on Nun alone.
- Owners see English; staff see simple, clear Thai. The same data and actions are available to both.

## Placement and navigation

Home → **Housekeeping** → normal Housekeeping operations → **External Laundry Service**.

The Laundry block should be expandable, consistent with Central's existing workspace building blocks. It should show:

1. **Open laundry loads** — sent, awaiting return/check.
2. **Laundry inventory** — live stock currently in storage versus total purchased.
3. **Recent completed loads** — completed checks, including any discrepancies.
4. A clear action: **Send load to laundry** / Thai equivalent.

Do not invent a mobile bottom navigation or a separate web-style dashboard.

## Laundry article catalogue

Outbound and return forms start with every quantity at zero.

| English label | Thai label to provide in UI |
| --- | --- |
| King-size duvet cover | ผ้าคลุมผ้านวมคิงไซซ์ |
| Single-bed duvet cover | ผ้าคลุมผ้านวมเตียงเดี่ยว |
| King-size fitted sheet / mattress protector | ผ้ารัดมุมคิงไซซ์ |
| Single fitted sheet / mattress protector | ผ้ารัดมุมเตียงเดี่ยว |
| Pillowcase | ปลอกหมอน |
| Duvet | ผ้านวม |
| Large towel | ผ้าเช็ดตัวผืนใหญ่ |
| Small towel | ผ้าเช็ดตัวผืนเล็ก |

The final Thai words should use the familiar terminology already used by Vanara staff.

## Outbound workflow: Send load to laundry

1. User selects **Send load to laundry**.
2. Form shows:
   - automatically generated load code, e.g. `L-20261108-001`;
   - total kilograms sent;
   - one quantity input per article type (all default `0`);
   - optional operational note;
   - the current in-storage quantity beside each article, so the sender can see what is available.
3. On confirmation, Central saves:
   - status: **Sent — awaiting return**;
   - sent date and Bangkok time;
   - sender user ID/name;
   - sent kilograms and sent item quantities;
   - optional note;
   - immutable audit event.
4. The recorded sent quantities immediately reduce the **currently in storage** inventory. They do not change the total purchased quantity.
5. Create a phone notification for the operational team/owners containing the code and summary.
6. The new load appears at the top of **Open laundry loads**.

Suggested confirmation copy:

> Send this load to the external laundry? The quantities and weight will be recorded as `L-…`.

## Return workflow: Receive & check load

1. Any Housekeeping user opens an outstanding load and presses **Receive & check load**.
2. The screen displays the original sent record read-only: code, sender, timestamp, kilograms, sent quantity per item and note.
3. Beside each sent quantity, enter **quantity received**. Enter received kilograms as well.
4. The system calculates each difference and total weight difference live.
5. The receiver may add a check note.
6. On confirmation, the load closes even if there is a difference:
   - status: **Received & checked** if every count and weight matches;
   - status: **Received with discrepancy** if any count or recorded kilograms differs.
7. Returned quantities are added back to current in-storage inventory. The audit record preserves both the sent and received numbers.
8. When there is any difference, the completed operation has a clear red alert/badge and the phone notification explicitly says **Discrepancy** with the load code and differences.
9. Always send a phone notification when a return check is closed, whether matched or discrepant.

No sent load should silently disappear or be overwritten. Corrections after sending/receiving must create an audit trail, not change history invisibly.

## Open-load card contents

Each open card should show, at minimum:

- `L-…` code;
- status: Sent — awaiting return;
- sent date/time and sender avatar/name;
- kilograms sent;
- compact item-count summary;
- **Receive & check load** action.

## Completed-load record contents

Each completed record should show:

- `L-…` code;
- sent and received date/time;
- sender and receiver avatars/names;
- sent vs received kilograms;
- sent vs received quantities per article;
- status and red discrepancy indicator if applicable;
- any operational/check notes.

## Inventory view

The Laundry Service block includes a read-only live inventory table that staff can consult during checks.

For every article, display:

- **Purchased total** — the total number bought by Vanara;
- **In storage now** — purchased total minus currently out at laundry, adjusted by received quantities;
- **Out at laundry** — derived from all currently open loads.

### Initial figures supplied

These are storage/purchased totals provided so far and need to be seeded after the article names are confirmed:

| Current wording supplied | Total |
| --- | ---: |
| Fitted king | 36 |
| King duvet covers (“Copri king”) | 36 |
| Fitted singles | 10 |
| Single duvet covers (“Copri singoli”) | 10 |
| King duvets | 25 |
| Single duvets | 8 |
| Pillowcases | 82 |

Totals for large towels and small towels were not supplied yet. The original catalogue has one generic **Duvet** line while the available stock figures distinguish king and single duvets; retain that distinction in the data model so no stock is lost, then present staff-friendly labels in the UI.

## Laundry contact actions

Inside External Laundry Service provide a tap-to-call action:

- **Call laundry:** `+66 (0) 97 049 4830`

Use a `tel:` link so it works directly on staff phones.

## Future automation: LINE collection request

After the core manual workflow is stable, add an optional action on a sent load:

**Send laundry pickup request** → confirmation → trigger the existing Make webhook → LINE Business message to the laundry.

The automated message should include:

- Vanara Bungalows, Bailan Bay;
- load code;
- total kilograms;
- itemised quantities;
- request for pickup;
- sender/date/time.

The system must not send this message until the user confirms. Implementation will need the existing Make webhook endpoint/authentication and the destination LINE Business configuration; do not hard-code secrets in Central.

## Notifications

Required operational notifications:

1. Load sent to laundry — code, sender, kilograms, compact item summary.
2. Load received and checked — code, receiver, result.
3. Discrepancy — prominent alert with code and quantities/weight that differ.

## Non-negotiable UX rules

- Mobile-first, visually consistent with Central's existing Housekeeping workspace.
- Clear English for owners and clear Thai for staff.
- Quantity inputs begin at zero.
- A return check always displays the original outbound record alongside received inputs.
- Anyone authorised may send; anyone authorised may receive/check.
- Water-refill or room-cleaning activity must not be mixed into Laundry history.
- Laundry is operationally visible to all relevant staff; no private Nun-only workflow.
