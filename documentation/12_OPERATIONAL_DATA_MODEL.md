# Vanara Central

## 12 - Operational Data Model

### Status: FROZEN

# Purpose

Defines the operational entities owned by Vanara Central.

Beds24 owns only: - bookings - availability - prices - room assignments

Everything below is owned by D1.

# Operational Entities

## room_operational_status

Four independent dimensions:

### Occupancy

-   Vacant
-   Occupied
-   Arrival Today
-   Departure Today

### Operational Availability

-   OPERATING
-   NOT_OPERATING

This is a local internal Vanara indicator. Beds24 remains the booking
availability source of truth.

### Housekeeping

-   READY
-   NOT_READY

Physical Housekeeping state is stored independently from Housekeeping tasks.
A room can be NOT_READY without active queue work.
`room_housekeeping_state` is the single authoritative source for READY /
NOT_READY. Read models must not infer physical room condition from active,
historical, completed, cancelled, or generated Housekeeping tasks.

### Maintenance

-   CLEAR
-   BLOCKED / OUT_OF_SERVICE

These dimensions must never be merged into a single status field.

## housekeeping_tasks

Operational work only. A task exists only after a real trigger:
Reception turnover release flow, due occupied-room cleaning, on-demand cleaning,
manual Owner/Manager cleaning request, linen override, or water refill.
Tasks are transient operational work. They are not the physical state of a
room.

-   room
-   priority
-   assigned_to
-   status
-   checklist_progress

## room_housekeeping_state

-   unit_id
-   ready_state
-   reason
-   source
-   updated_by
-   updated_at

This table owns the physical READY / NOT_READY snapshot. It must not create
Housekeeping queue work by itself.
This table is persistent operational reality. Housekeeping task lifecycle
events may update this table, but consumers must read READY / NOT_READY from
this table only.

## maintenance_incidents

-   category
-   urgency
-   room/location
-   assigned_to
-   escalation_level
-   photo
-   resolution

## operational_notes

Notes attached to room, booking, day or task.

## passport_status

Minimum: - checked yes/no - photo optional - verified_by - verified_at

## deposit_status

-   required
-   received
-   returned
-   notes

## damage_reports

Operational evidence with optional photos.

## notifications

-   unread
-   acknowledged
-   resolved

## audit_log

Minimal accountability only.

# Frozen Decisions

-   Operational data belongs to D1.
-   Beds24 never owns operational workflow.
-   Room state is multidimensional.
-   Minimal history only.
