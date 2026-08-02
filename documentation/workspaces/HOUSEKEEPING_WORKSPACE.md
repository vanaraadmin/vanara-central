# HOUSEKEEPING_WORKSPACE

## Purpose

This document defines the implemented Housekeeping Workspace for Vanara Central.

It is the constitutional document for Housekeeping V1. The Product Rules in this document are binding for the current workspace. Future changes require explicit Product Owner approval.

## Philosophy

Housekeeping is an operational to-do list.

Housekeeping is not a room browser. It does not show every room. It shows only active work that exists now.

The Room Workspace owns the room. Housekeeping owns the task.

Housekeeping answers:

- where work is needed;
- when work is due;
- which intervention level is required;
- who owns the active task;
- what the next allowed action is.

Housekeeping does not teach staff how to clean. The system trusts trained operators. When an operator presses Complete, Vanara assumes the work has been done correctly.

## Architecture

The workspace has three operational surfaces:

- Housekeeping Workspace: compact task queue at `/housekeeping-v2`.
- Room Workspace: room operational center at `/rooms/:roomId`.
- Housekeeping V2 API: server-derived task generation, task state, counters, permissions, and room task context.

All Housekeeping operational decisions are made on the server. The frontend renders the server read model and shows only server-authorized actions.

The legacy Housekeeping API is preserved for compatibility, but it is not the implemented Housekeeping V1 workspace.

## Product Rules

Housekeeping Workspace rules:

- Initial view shows only Priority, Normal, and Water counters.
- Counters display room-count wording: 0 Rooms, 1 Room, 2 Rooms, and so on.
- Tapping a counter expands only that section.
- A room with no active Housekeeping work must not appear.
- A task appears in exactly one visible queue.
- Room names link to the Room Workspace.
- On-Demand Cleaning cannot be created from Housekeeping.
- Staff-facing copy must avoid technical state, SQL, idempotency, version, and conflict-code wording.
- Staff-facing task execution does not expose an explicit Claim step.

Room Workspace rules:

- Every room can be browsed only from the Room Workspace.
- Full room information belongs to the Room Workspace.
- On-Demand Cleaning is created only from the Room Workspace.
- Room Workspace displays current room, stay, reception, housekeeping, maintenance, procurement, notes, and recent history context.

Trust model:

- No bathroom, floor, towels, shampoo, toilet paper, amenities, or similar checkbox completion is required.
- Cleaning and Full Cleaning may show informational help only.
- Informational help is not tracked and does not block completion.

Water rule:

- Water quantity depends only on accommodation type.
- Bungalow: 2 bottles.
- Yurt: 2 bottles.
- Tent: 2 bottles.
- Villa: 4 bottles.
- Guest count is informational only and must not feed Water Refill, Cleaning, Full Cleaning, Linen, Priority, task generation, Procurement, or Housekeeping logic.

## Intervention Types

Cleaning:

- General room cleaning.
- Amenities check.
- Does not reset linen counters unless the operator explicitly completes the task as Full Cleaning.

Full Cleaning:

- General room cleaning.
- Linen change.
- Amenities check.
- Resets both cleaning and linen counters.

Water:

- Daily room-type bottle refill for eligible occupied in-house rooms.
- Uses a simplified one-tap workflow: Available to Completed.
- Water never escalates into Priority.

Turnover:

- Checkout-day room preparation after Reception release.
- Reception owns the room release gate.

## Workflows

### Turnover

1. Guest checks out.
2. Reception completes the checkout-release workflow.
3. Turnover appears in Priority.
4. Operator starts the task.
5. Vanara assigns it to the operator and marks it In Progress.
6. Operator finishes the task.
7. Room disappears from Housekeeping.
8. Room Workspace reflects the latest ready/housekeeping state.

If the turnover task exists before Reception release, it remains Waiting Reception and cannot start. When `room_released = 1`, the task is synchronized to Available from the Housekeeping read path.

### Standard Cleaning

1. Occupied in-house room reaches the cleaning cadence.
2. Cleaning appears in Normal.
3. Operator starts the task.
4. Vanara assigns it to the operator and marks it In Progress.
5. Operator finishes Cleaning.
6. Cleaning counter updates.
7. Task leaves the queue.

Standard Cleaning is due every 3 occupied days by default.

### Full Cleaning

1. A Cleaning or On-Demand Cleaning task is in progress.
2. Operator selects Finish Full Cleaning.
3. Cleaning counter updates.
4. Linen counter updates.
5. Task leaves the queue.

Full Cleaning is an intervention choice, not a separate checklist.

### Linen Override

1. Authorized operator marks linen required from Room Workspace.
2. A Full Cleaning task is created in Normal.
3. Completing it updates linen counters and clears the override.
4. Cancelling the task clears the override with an audit event.

### On-Demand Cleaning

1. Guest requests cleaning.
2. Operator opens Room Workspace.
3. Operator creates On-Demand Cleaning with optional note.
4. Task appears immediately in Housekeeping Normal.
5. Operator starts the task.
6. Vanara assigns it to the operator and marks it In Progress.
7. Operator finishes either Cleaning or Full Cleaning.
8. Correct counters update.
9. Task leaves the queue.

On-Demand Cleaning requires an occupied in-house room.

### Water Refill

1. Eligible occupied in-house room appears in Water.
2. Card displays fixed room-type quantity.
3. Operator taps Complete.
4. Vanara assigns the task to the operator, records completion, and writes the completion audit event.
5. Task leaves the Water queue.

Water is excluded for vacant rooms, checkout-day rooms, and rooms blocked by checkout-release workflow state.

### Priority Escalation

1. Same-day Cleaning or On-Demand Cleaning appears in Normal.
2. If still active on the next resort-local operational day, the same task appears in Priority.
3. Assignment, history, task id, operational date, and due cycle remain unchanged.
4. No duplicate task is created.
5. No repeated audit event is created by read-only overview requests.

Water does not escalate into Priority.

## APIs

Implemented Housekeeping V1 read endpoints:

- `GET /api/housekeeping/v2/summary`
- `GET /api/housekeeping/v2/tasks`
- `GET /api/housekeeping/v2/rooms/:unitId`

Implemented task action endpoints:

- `POST /api/housekeeping/v2/tasks/:taskId/claim`
- `POST /api/housekeeping/v2/tasks/:taskId/release-claim`
- `POST /api/housekeeping/v2/tasks/:taskId/start`
- `POST /api/housekeeping/v2/tasks/:taskId/complete`
- `POST /api/housekeeping/v2/tasks/:taskId/skip`
- `POST /api/housekeeping/v2/tasks/:taskId/cancel`
- `POST /api/housekeeping/v2/tasks/:taskId/reopen`
- `POST /api/housekeeping/v2/tasks/:taskId/force-release`

Implemented room-origin action endpoints:

- `POST /api/rooms/:id/on-demand-cleaning`
- `POST /api/housekeeping/v2/rooms/:unitId/on-demand-cleaning`
- `POST /api/housekeeping/v2/rooms/:unitId/linen-required`

The V2 checklist endpoint is not part of the implemented workspace.

## State Machines

Task statuses:

- `WAITING_FOR_RECEPTION`
- `AVAILABLE_FOR_CLAIM`
- `CLAIMED`
- `IN_PROGRESS`
- `CHECKLIST_COMPLETE`
- `READY_FOR_INSPECTION`
- `READY`
- `COMPLETED`
- `BLOCKED`
- `SKIPPED`
- `CANCELLED`

Primary transitions:

- Reception release: `WAITING_FOR_RECEPTION` to `AVAILABLE_FOR_CLAIM`.
- Claim: retained as a compatibility/domain ownership transition, not exposed in the operator UX.
- Release claim: `CLAIMED` to `AVAILABLE_FOR_CLAIM`.
- Start Cleaning, Full Cleaning, On-Demand Cleaning, or Turnover: `AVAILABLE_FOR_CLAIM` or `CLAIMED` to `IN_PROGRESS`; if unassigned, the same transition assigns the current operator.
- Complete Water: `AVAILABLE_FOR_CLAIM`, `CLAIMED`, or `IN_PROGRESS` to `COMPLETED`; if unassigned, the same transition assigns the current operator.
- Complete non-turnover: allowed from the task's completable active state to `COMPLETED`.
- Complete turnover: the server advances through internal ready states and completes the task as one operator action.
- Skip: allowed for skippable active tasks.
- Cancel: manager or owner action with reason.
- Reopen: manager or owner action with reason for terminal tasks.

Optimistic locking uses task version. Replayed transitions use idempotency keys where retry safety is required.

## Permissions

Read:

- Housekeeping module access is required for Housekeeping V2 reads.
- Room module access is required for Room Workspace reads.

Write:

- Housekeeping edit permission is required for Housekeeping task actions.
- On-Demand Cleaning from Room Workspace requires room access and Housekeeping edit permission.
- Start is available when the task is unassigned, or when it is assigned to the current operator, or to Owner.
- Complete is available to the assignee or Owner.
- Water Complete is available when the Water task is unassigned, assigned to the current operator, or to Owner.
- Explicit Claim and Release Claim are not shown in the operator UX.
- Skip is available to assignee, Manager, or Owner when the task type allows skip.
- Cancel and Reopen are Manager or Owner actions and require a reason.
- Force Room Released is Owner only and requires a reason.

The frontend must hide actions that the server does not authorize.

## Database

Housekeeping V1 uses these task-domain tables:

- `housekeeping_tasks`
- `housekeeping_task_events`
- `housekeeping_room_counters`
- `housekeeping_water_quantity_config`

The legacy `housekeeping_task_checklist_items` table may exist for compatibility, but detailed checklist completion is not part of the V1 product flow.

Important constraints:

- Active turnover uniqueness per unit, booking, and operational date.
- Active Standard Cleaning uniqueness per unit, stay, and due cycle.
- Active linen-change uniqueness per unit, stay, and due cycle.
- Water refill uniqueness per unit and operational date.
- Active On-Demand uniqueness per unit and stay.
- Non-null idempotency keys are unique.

Read integration sources:

- `bookings`
- `units`
- `room_types`
- `reception_stays`
- `reception_room_alerts`
- `maintenance_tickets`
- `procurement_requests`
- `room_notes`
- `reception_events`

## Task Generation

Task generation runs during Housekeeping V2 overview reads.

Generated tasks:

- Turnover for checkout-day stays.
- Standard Cleaning for occupied, arrived, in-house stays when the 3-day cadence is due.
- Linen Change when a linen override is active.
- Water Refill for eligible occupied, arrived, in-house stays.

Generation invariants:

- Uses internal booking ids for task records.
- Uses Beds24 booking ids as stay ids where the stay identity is needed.
- Uses deterministic idempotency keys.
- Replays existing tasks when the same idempotency key already exists.
- Does not create duplicate active tasks.
- Does not use guest count for operational decisions.

Water generation:

- Requires occupied in-house state.
- Requires guest arrived.
- Excludes checkout day.
- Excludes vacant rooms.
- Excludes rooms blocked by the checkout-release workflow.
- Quantity comes only from room type configuration and hardcoded room-type fallback.

## Escalation

Escalation is display-level queue placement for active work.

Cleaning and On-Demand Cleaning move from Normal to Priority when their original `operational_date` is earlier than the current resort-local operational date.

Escalation does not:

- create a new task;
- change the task id;
- change assignment;
- rewrite dates;
- create repeated audit events;
- affect Water Refill.

## Room Integration

Every room-level navigation uses the Room Workspace at `/rooms/:roomId`.

Housekeeping task cards link room identity to Room Workspace. Legacy Housekeeping room and checklist routes redirect to Room Workspace.

Room Workspace displays:

- room identity;
- guest and stay;
- arrivals and departures;
- passport status;
- deposit status;
- housekeeping status;
- maintenance status;
- procurement alerts;
- active housekeeping task;
- recent task history;
- operational notes.

On-Demand Cleaning starts in Room Workspace and appears automatically in Housekeeping Normal after creation.

## Known Limitations

- Detailed operational checklists are intentionally not implemented in V1.
- Room Workspace does not replace Reception; passport and deposit alerts are displayed as context and resolved by Reception.
- Maintenance blocks Housekeeping action availability, but Maintenance remains the owner of repairs.
- Procurement attention is summarized; purchasing workflow remains owned by Procurement.
- Legacy Housekeeping compatibility endpoints still exist outside the V1 workspace.
- Water quantities are fixed for MVP room types and are not user-configurable from the UI.

## Future Release 2 Items

Release 2 candidates must not change V1 invariants without Product Owner approval.

Possible Release 2 items:

- Configurable water quantity management with Product-approved rules.
- Richer Room Workspace history filtering.
- Manager analytics for task durations and workload.
- Offline-friendly mobile task execution.
- Push or in-app notifications for newly escalated work.
- Explicit retirement plan for legacy Housekeeping compatibility APIs.
- More granular permission policy for linen override and On-Demand creation if operations require it.
- Additional procurement integration from room context.
