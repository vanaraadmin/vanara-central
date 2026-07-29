# Vanara Central Backend

## 05 - Cron Jobs Strategy

### Architecture Freeze v1.0

**Status:** FROZEN

------------------------------------------------------------------------

# Purpose

This document defines the scheduling strategy for every automated
background job executed by Vanara Central.

Cron jobs exist exclusively to keep the operational database
synchronized and healthy.

Business applications must never depend on scheduled jobs executing
immediately.

------------------------------------------------------------------------

# Design Philosophy

Cron jobs must be:

-   deterministic
-   idempotent
-   restartable
-   independent
-   lightweight

Every execution must be safe to repeat.

------------------------------------------------------------------------

# Current Schedule

## Property Synchronization

Frequency

Once per day

Purpose

Synchronize property metadata that rarely changes.

Examples

-   Property information
-   Room configuration
-   Static metadata

------------------------------------------------------------------------

## Offer Synchronization

Frequency

Every 15 minutes

Purpose

Refresh availability and prices.

Scope

Only the next 30 operational days.

Reason

Older prices have no operational value and increase API traffic.

------------------------------------------------------------------------

## Booking Synchronization

Frequency

Every 15 minutes

Purpose

Import new bookings and booking modifications.

Method

Incremental synchronization using the provider modification cursor.

------------------------------------------------------------------------

# Execution Order

Jobs are logically independent.

However, bootstrap establishes the initial dependency chain:

Properties

↓

Room Types

↓

Units

↓

Offers

↓

Offer Prices

↓

Bookings

After bootstrap, normal cron jobs may execute independently.

------------------------------------------------------------------------

# Idempotency

Every cron execution must produce the same database state when repeated
against unchanged provider data.

Duplicate records must never be created.

------------------------------------------------------------------------

# Failure Strategy

If one cron job fails:

-   existing data remains valid
-   other cron jobs continue normally
-   synchronization cursor is preserved
-   failure is logged

Failures must remain isolated.

------------------------------------------------------------------------

# Concurrency

Cron jobs should avoid overlapping executions whenever practical.

Synchronization should complete before the next scheduled execution
begins.

Future implementations may introduce execution locks if required.

------------------------------------------------------------------------

# Logging

Every execution should record:

-   start time
-   finish time
-   duration
-   success/failure
-   processed records
-   error message (if any)

Logs are intended for diagnostics and monitoring.

------------------------------------------------------------------------

# Performance Principles

Cron jobs should:

-   minimize API requests
-   minimize database writes
-   process only changed data
-   avoid unnecessary synchronization

Efficiency is preferred over frequency.

------------------------------------------------------------------------

# Future Scheduled Jobs

Possible future background jobs include:

-   analytics aggregation
-   AI cache refresh
-   reporting
-   housekeeping reminders
-   maintenance reminders
-   operational statistics

These jobs must remain independent from the Beds24 synchronization
engine whenever possible.

------------------------------------------------------------------------

# Frozen Decisions

-   Property synchronization executes daily.
-   Offers synchronize every 15 minutes.
-   Bookings synchronize every 15 minutes.
-   Offer synchronization covers only the next 30 days.
-   Synchronization is incremental whenever possible.
-   Cron jobs are idempotent.
-   Cron failures remain isolated.
-   Background jobs never expose provider logic to applications.

# Status

**FROZEN**
