# Vanara Central Backend

## 02 - Database Schema

### Architecture Freeze v1.0

**Status:** FROZEN

------------------------------------------------------------------------

# Purpose

This document defines the logical structure of the Cloudflare D1
database used by Vanara Central.

The schema is designed to represent Vanara business concepts while
remaining synchronized with Beds24.

------------------------------------------------------------------------

# Database Principles

-   D1 is the operational database.
-   Beds24 remains the Source of Truth.
-   Tables are normalized.
-   External provider identifiers are stored but never exposed to
    clients.
-   Business APIs expose Vanara concepts only.

------------------------------------------------------------------------

# Entity Overview

``` text
properties
    │
    ├── room_types
    │       │
    │       ├── units
    │       ├── offers
    │       │      │
    │       │      └── offer_prices
    │       │
    │       └── bookings
    │
    └── sync_status
```

------------------------------------------------------------------------

# properties

Purpose

Stores each property synchronized from Beds24.

Responsibilities

-   property metadata
-   provider identifiers
-   raw Beds24 payload

Primary Key

-   property_id

Referenced by

-   room_types
-   bookings

------------------------------------------------------------------------

# room_types

Purpose

Logical accommodation categories.

Examples

-   Garden Villa
-   Bungalow
-   Yurt

Primary Key

-   room_type_id

References

-   property_id

Referenced by

-   units
-   offers
-   bookings

------------------------------------------------------------------------

# units

Purpose

Stores every physical accommodation unit.

Examples

-   Villa 10
-   Villa 13
-   Bungalow 1
-   Bungalow 12
-   Yurt 1

Important Fields

-   room_type_id
-   beds24_unit_id
-   unit_name
-   active

Design Rule

Applications must display **unit_name**.

Beds24 identifiers are internal only.

------------------------------------------------------------------------

# offers

Purpose

Stores availability/rate offers synchronized from Beds24.

References

-   room_type_id

Referenced by

-   offer_prices

Synchronization

Only next 30 days are synchronized.

------------------------------------------------------------------------

# offer_prices

Purpose

Stores daily prices for every synchronized offer.

Contains

-   offer reference
-   date
-   price
-   currency

Used by

-   pricing
-   availability
-   AI Concierge

------------------------------------------------------------------------

# bookings

Purpose

Stores every reservation imported from Beds24.

Contains

-   guest
-   arrival
-   departure
-   status
-   provider references
-   financial information
-   raw JSON

Important Rule

Bookings keep provider identifiers internally.

Applications receive business data only.

------------------------------------------------------------------------

# sync_status

Purpose

Tracks synchronization state.

Contains

-   last execution
-   success/failure
-   cursor
-   timestamps

Used by

-   cron jobs
-   diagnostics
-   monitoring

------------------------------------------------------------------------

# Relationships

``` text
Property
   │
Room Type
   │
 ├── Units
 ├── Offers
 │      │
 │      └── Offer Prices
 │
 └── Bookings
```

------------------------------------------------------------------------

# Provider Mapping

Internal identifiers are preserved for synchronization.

Business APIs translate them into Vanara language before returning data.

Example

Beds24 IDs

↓

Backend

↓

"Bungalow 5"

------------------------------------------------------------------------

# Raw JSON

Several tables preserve the original Beds24 payload.

Purpose

-   debugging
-   future compatibility
-   audit
-   safe reprocessing

Applications must never consume raw JSON directly.

------------------------------------------------------------------------

# Schema Stability

This schema is considered stable.

Future extensions should introduce new tables rather than modifying
existing structures whenever possible.

------------------------------------------------------------------------

# Frozen Decisions

-   Database is normalized.
-   Raw provider payload is preserved.
-   Provider IDs remain internal.
-   Business names are exposed.
-   D1 is optimized for reads.
-   Schema changes require architectural review.

# Status

**FROZEN**
