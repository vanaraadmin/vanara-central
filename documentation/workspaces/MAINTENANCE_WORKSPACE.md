# MAINTENANCE_WORKSPACE

## Purpose

This document defines the implemented Maintenance Workspace for Vanara Central.

It is the constitutional document for Maintenance V1. The rules in this document describe the current production workspace. Future changes require explicit Product Owner approval.

## Philosophy

Maintenance is an operational issue queue for physical resort problems.

It answers:

- what needs technical attention;
- where the issue is;
- whether the room is blocked;
- who owns the issue;
- what the current operational state is.

Maintenance is not a room browser and is not a training checklist. Room identity and full room context belong to the Room Workspace. Maintenance owns only the issue and its operational lifecycle.

## Architecture

The workspace has four connected surfaces:

- Maintenance Workspace at `/maintenance`.
- Maintenance Detail at `/maintenance/:issueId`.
- Report Issue flow at `/maintenance/new`.
- Room Workspace integration at `/rooms/:roomId`.

Server services own permissions, persistence, status transitions, room blocking, photo records, and audit events. The frontend renders the server read model and exposes only the approved actions.

## Product Rules

Maintenance issue cards show only:

- title;
- target room or resort area;
- priority;
- status;
- assigned to;
- blocking badge;
- creation date.

Card interaction:

- tap a row to expand details inside the Maintenance Workspace;
- tap outside to collapse;
- tap another row to switch expansion;
- no close button is rendered in the expanded card.

Expanded card content is intentionally small:

- description;
- link to open the issue detail.

The detail page keeps only the approved intervention details:

- description;
- status;
- priority;
- assigned to;
- blocking;
- photos;
- timeline.

Detailed operational checklists are not part of Maintenance V1.

Every Maintenance issue must have one explicit target:

- Room;
- Other.

For target `Room`, the room is mandatory. The selected room is the authoritative source for Maintenance alerts in Room Workspace, Reception, Housekeeping, Staff Home, and Dashboard.

For target `Other`, the resort area is mandatory. Supported areas are Restaurant, Garden, Pool, Reception, Storage, Utilities, and Other. These tickets remain Maintenance-only and never create room alerts, Housekeeping blocks, Reception room blocks, or Room Workspace room alerts.

## Statuses

The public Maintenance statuses are:

- Open;
- In Progress;
- Waiting Parts;
- Completed.

The allowed transitions are:

- Open -> In Progress.
- In Progress -> Waiting Parts.
- In Progress -> Completed.
- Waiting Parts -> In Progress.
- Waiting Parts -> Completed.

Completed issues are closed for operational purposes and no longer count as active Maintenance work.

## Priorities

The public Maintenance priorities are:

- Low;
- Normal;
- High.

Legacy stored values are mapped into this product vocabulary before reaching the UI.

## Blocking Rule

Blocking is the most important Maintenance signal.

When an active room-target Maintenance issue is marked blocking:

- the room is treated as Out Of Service;
- Reception cards show `Maintenance Out Of Service`;
- Room Workspace shows the Maintenance blocking state;
- Housekeeping room detail shows the blocking Maintenance ticket;
- Staff Home and Dashboard Maintenance metrics include the blocked room;
- Housekeeping task execution is blocked for that room.

Closing the issue removes the active blocking state from all read models. The issue history remains in the Maintenance timeline.

When an `Other` target issue is marked blocking, the blocking flag stays inside Maintenance only. It does not place any room Out Of Service and does not affect Reception, Room Workspace, Housekeeping, or room-blocking counters.

## Duplicate Rule

The system must not create duplicate active blocking issues for the same room and same issue content.

If a blocking issue already exists for the same room, title, and description, creation returns the existing active issue instead of inserting a duplicate or creating a second audit event.

Different real issues may still be represented separately.

## Room Workspace Ownership

Room Workspace is the operational center for a room.

In Room Workspace:

- if no active Maintenance issue exists, the operator can report an issue;
- if an active Maintenance issue exists, the operator opens the existing issue;
- no duplicate active issue form is shown for that room.

Room Workspace owns full room state. Maintenance only contributes active issue state, blocking status, photos, assignment, priority, status, and timeline.

## Entry Points

Maintenance issues may be reported from:

- Maintenance Workspace;
- Room Workspace;
- Housekeeping;
- Reception.

Housekeeping and Reception entry points return the operator to their originating workspace after issue creation.

## Photos

Maintenance V1 supports zero or more photo records per issue.

Photos are shown as a compact gallery. Tapping a photo opens a fullscreen preview. A local reference may be stored when upload storage is deferred.

## APIs

Implemented API surface:

- `GET /api/maintenance/rooms`
- `GET /api/maintenance/tickets`
- `GET /api/maintenance/tickets/:id`
- `POST /api/maintenance/tickets`
- `PATCH /api/maintenance/tickets/:id`
- `PATCH /api/maintenance/tickets/:id/assignment`
- `PATCH /api/maintenance/tickets/:id/status`
- `PATCH /api/maintenance/tickets/:id/out-of-service`
- `POST /api/maintenance/tickets/:id/notes`
- `POST /api/maintenance/tickets/:id/photos`
- `GET /api/maintenance/assignable-users`
- `POST /api/rooms/:id/maintenance/tickets`

The notes endpoint remains a backend capability for compatibility. The implemented V1 UI does not expose a detailed notes panel in the Maintenance detail page.

## Permissions

Issue creation is allowed for users who can access at least one operational origin:

- Maintenance;
- Rooms;
- Housekeeping;
- Reception.

Issue editing, assignment, status transition, and blocking changes require:

- role: Owner, Manager, or Maintenance;
- Maintenance edit permission.

Issue photo contribution is allowed to operational issue creators.

## Database

Maintenance V1 persists:

- `maintenance_tickets`
- `maintenance_ticket_notes`
- `maintenance_ticket_photos`
- `maintenance_ticket_events`

Important fields:

- `status` stores the lifecycle state.
- `priority` stores the operational priority.
- `room_id` links room-target issues and is required for room-target tickets.
- `location_area` stores the mandatory area for Other-target tickets.
- `out_of_service` marks active blocking issues. It affects room operations only when `room_id` is present.
- `assignment_type`, `assigned_user_id`, and related fields store ownership.
- event rows store creation, assignment, status, waiting reason, and blocking changes.

Completed and closed stored states are not active operational work.

## Integrations

Reception:

- cards expose active Maintenance and Out Of Service state;
- blocking label is `Maintenance Out Of Service`;
- only room-target blocking tickets affect Reception rooms;
- closing the Maintenance issue removes the active Reception badge.

Housekeeping:

- room-target out-of-service Maintenance blocks execution for the room;
- Other-target Maintenance never blocks Housekeeping room work;
- Housekeeping room detail exposes the blocking ticket;
- Housekeeping queues remain task-owned and do not become Maintenance lists.

Room Workspace:

- shows active Maintenance issues;
- shows blocking state;
- opens existing issue when one is active;
- creates a new issue only when no active issue exists.
- ignores Other-target Maintenance tickets because they do not belong to a room.

Staff Home and Dashboard:

- Maintenance metrics expose active issues and blocking count;
- blocked rooms are surfaced without requiring the operator to open a ticket first;
- room-blocking counters count only room-target blocking tickets.

## Known Limitations

Maintenance V1 stores photo references but does not implement full binary image upload management.

The public UI hides the detailed notes panel. Historical note storage remains available at API level for compatibility.

There is no external contractor workflow beyond the deferred backend assignment shape.

## Future Release 2 Items

Future work may include:

- real image upload to durable object storage;
- contractor/vendor workflow;
- richer filtering and search;
- maintenance cost tracking;
- recurring maintenance schedules;
- deeper procurement linkage for parts;
- notifications for Waiting Parts and blocking issues.
