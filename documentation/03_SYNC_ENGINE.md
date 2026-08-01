# Vanara Central Backend

## 03 - Synchronization Engine

### Architecture Freeze v1.0

**Status:** FROZEN

------------------------------------------------------------------------

# Purpose

The Synchronization Engine is responsible for keeping the Vanara Central
operational database synchronized with Beds24.

It is the **only component** allowed to communicate with the Beds24 API.

Every other module must read data exclusively from Cloudflare D1.

------------------------------------------------------------------------

# Synchronization Philosophy

Synchronization must be:

-   deterministic
-   repeatable
-   idempotent
-   provider-safe
-   failure tolerant

A synchronization can be executed multiple times without corrupting the
database.

------------------------------------------------------------------------

# Synchronization Pipeline

``` text
Beds24 API
      │
      ▼
Synchronization Worker
      │
      ▼
Normalize Data
      │
      ▼
Cloudflare D1
```

------------------------------------------------------------------------

# Bootstrap Synchronization

Bootstrap initializes an empty database.

Execution order is mandatory.

``` text
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
```

Each step depends on the previous one.

Bootstrap is safe to execute multiple times.

------------------------------------------------------------------------

# Incremental Synchronization

After bootstrap, synchronization becomes incremental.

Only modified data is requested from Beds24.

Benefits

-   lower API usage
-   faster execution
-   reduced bandwidth
-   scalable architecture

------------------------------------------------------------------------

# Booking Synchronization

Bookings use incremental synchronization based on the provider
modification timestamp.

The backend stores a synchronization cursor.

Every execution requests only bookings modified after the stored cursor.

After a successful synchronization, the cursor is updated.

------------------------------------------------------------------------

# Offer Synchronization

Offers are synchronized every 15 minutes.

Scope

Only the next 30 days.

Older availability is intentionally ignored because it has no
operational value.

------------------------------------------------------------------------

# Property Synchronization

Property metadata changes very rarely.

Synchronization frequency:

Once per day.

------------------------------------------------------------------------

# Synchronization Strategy

Every synchronization follows the same workflow.

``` text
Read provider
      │
Normalize
      │
Validate
      │
Upsert
      │
Update cursor
      │
Log result
```

------------------------------------------------------------------------

# Database Writes

Synchronization never assumes the database is empty.

Operations use UPSERT semantics whenever possible.

Duplicate records must not be created.

------------------------------------------------------------------------

# Idempotency

Every synchronization must produce the same database state when executed
repeatedly against unchanged provider data.

Idempotency is a mandatory architectural requirement.

------------------------------------------------------------------------

# Error Handling

Errors must remain isolated.

A failed synchronization:

-   must not corrupt existing data
-   must not remove valid records
-   must not invalidate synchronization cursors

Errors are logged for diagnostics.

------------------------------------------------------------------------

# Logging

Every synchronization stores:

-   execution time
-   success/failure
-   duration
-   cursor
-   statistics
-   error message (if any)

Logging exists to support diagnostics rather than auditing.

------------------------------------------------------------------------

# Synchronization Rules

Allowed

-   insert new records
-   update modified records
-   preserve identifiers
-   preserve raw payload

Not Allowed

-   frontend synchronization
-   direct Beds24 access outside the Sync Engine
-   business logic inside synchronization

------------------------------------------------------------------------

# Responsibilities

Synchronization is responsible for:

-   reading Beds24
-   normalization
-   mapping provider identifiers
-   updating D1
-   cursor management
-   synchronization logging

Synchronization is NOT responsible for:

-   UI
-   dashboards
-   business workflows
-   analytics
-   presentation

------------------------------------------------------------------------

# Design Principles

The Synchronization Engine must always remain:

-   simple
-   predictable
-   restartable
-   deterministic
-   provider independent

------------------------------------------------------------------------

# Frozen Decisions

-   Bootstrap is repeatable.
-   Incremental synchronization is the default mode.
-   Bookings use modification cursors.
-   Offers synchronize only the next 30 days.
-   Property metadata synchronizes daily.
-   Synchronization owns provider communication.
-   Applications never synchronize directly.

# Status

**FROZEN**
