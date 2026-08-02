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

### Maintenance

-   CLEAR
-   BLOCKED / OUT_OF_SERVICE

These dimensions must never be merged into a single status field.

## housekeeping_tasks

-   room
-   priority
-   assigned_to
-   status
-   checklist_progress

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
