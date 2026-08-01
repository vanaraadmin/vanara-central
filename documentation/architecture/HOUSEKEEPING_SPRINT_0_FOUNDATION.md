# Vanara Central — Housekeeping Sprint 0 Foundation

Status: foundation document created during Sprint 1 because the file was not present in the repository at Sprint 1 start.

## Source Of Truth

This foundation follows:

- `documentation/architecture/HOUSEKEEPING_ARCHITECTURE.md`
- the current repository implementation;
- existing Reception, Maintenance, Procurement, permissions, and D1 patterns.

No Passport Engine behavior is changed by Housekeeping.

## Foundation Decision

The Housekeeping task domain must be introduced additively beside the legacy `housekeeping` table.

The legacy table remains the source for the current Housekeeping page until later sprints deliberately move the UI to the new task model.

Do not:

- remove the legacy `housekeeping` table;
- rename legacy statuses;
- change current Housekeeping endpoints;
- migrate legacy operational rows into invented task history;
- make new task tables mandatory for the old UI.

## Sprint 1 Implementation Status

Sprint 1 introduces the backend domain foundation for task-oriented Housekeeping.

Completed:

- additive D1 migration for task-domain tables;
- task types for Turnover, Standard Cleaning, Linen Change, Water Refill, and On-Demand Cleaning;
- task statuses covering waiting, claimable, claimed, in progress, checklist complete, ready, completed, blocked, skipped, and cancelled;
- task-level audit events;
- task-level checklist item foundation;
- independent room counters for standard cleaning and linen;
- water quantity configuration for Bungalow, Villa, Yurt, and Tent;
- optimistic version contract;
- idempotency support for task creation and transition replay;
- Reception release gate foundation through `reception_stays.room_released`;
- backend domain service for valid state transitions;
- shared future UI TypeScript contracts;
- server tests for schema, transitions, idempotency, concurrency, audit, counters, and release gating.

## Actual Schema Created

Migration:

- `server/migrations/0018_housekeeping_task_domain.sql`

Tables:

- `housekeeping_tasks`
- `housekeeping_task_events`
- `housekeeping_task_checklist_items`
- `housekeeping_room_counters`
- `housekeeping_water_quantity_config`

## Deviations From Proposed Architecture

The Sprint 0 file did not exist before Sprint 1.

Because of that, Sprint 1 used the approved Housekeeping Architecture plus the Sprint 1 prompt's explicit database direction:

- additive migration;
- legacy compatibility;
- no UI change;
- no automatic scheduled task generation yet;
- no Owner Force Room Released yet;
- no final Room Detail implementation yet.

`READY_FOR_INSPECTION` remains supported in the schema for future compatibility, but it is not mandatory for MVP.

## Deferred Work

Deferred to later sprints:

- new Housekeeping summary endpoint;
- operational task lists;
- Room Detail workspace;
- user-facing claim APIs;
- Reception release UI;
- Owner Force Room Released;
- scheduled task generation;
- final checklists by room/task type;
- Maintenance issue creation from Housekeeping UI;
- Procurement widget integration;
- translation key rollout;
- production UI migration from legacy Housekeeping.

## Compatibility Requirement

The current legacy Housekeeping page and API must continue functioning until Sprint 2 or later explicitly replaces the data contract.

Sprint 1 task tables are allowed to remain unused by the current UI.

