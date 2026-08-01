# Vanara Central Backend

## Architecture Freeze v1.0

**Status:** FROZEN\
**Version:** 1.0\
**Last Updated:** July 2026

------------------------------------------------------------------------

# 1. Purpose

This document defines the frozen backend architecture of **Vanara
Central**.

It describes the architectural principles, technology stack,
responsibilities and data flow that every future module must follow.

This document is considered the architectural reference for the backend.

------------------------------------------------------------------------

# 2. Core Philosophy

The backend exists to isolate Vanara from external providers.

Beds24 is treated as an external system and **must never be accessed
directly by frontend applications**.

Every client communicates only with the backend APIs.

The backend converts provider-specific concepts into Vanara business
concepts.

------------------------------------------------------------------------

# 3. Technology Stack

-   Cloudflare Workers
-   Hono
-   Cloudflare D1
-   Cloudflare Cron Triggers
-   Beds24 REST API

------------------------------------------------------------------------

# 4. High Level Architecture

``` text
              Beds24
                 │
                 ▼
          Synchronization
             (Workers)
                 │
                 ▼
             Cloudflare D1
                 │
        ┌────────┼────────┐
        ▼        ▼        ▼
   Operations   AI     Future Apps
      UI     Concierge
```

------------------------------------------------------------------------

# 5. Source of Truth

## Beds24

Beds24 is the **only** source of truth for:

-   Properties
-   Room Types
-   Units
-   Availability
-   Offers
-   Prices
-   Bookings

No manual editing is performed directly inside D1 for synchronized
entities.

------------------------------------------------------------------------

# 6. Operational Database

Cloudflare D1 is the operational database.

Its responsibilities are:

-   provide fast reads
-   isolate frontend from Beds24
-   store normalized data
-   support dashboards
-   support operational workflows
-   continue operating independently of Beds24 during normal usage

------------------------------------------------------------------------

# 7. Data Flow

``` text
Beds24
   │
   ▼
Synchronization Jobs
   │
   ▼
Cloudflare D1
   │
   ▼
REST API
   │
   ▼
Applications
```

Reads always happen from D1.

Synchronization is the only component allowed to communicate with
Beds24.

------------------------------------------------------------------------

# 8. Backend Responsibilities

The backend is responsible for:

-   synchronization
-   normalization
-   mapping provider identifiers
-   exposing business APIs
-   protecting provider details
-   logging synchronization state
-   maintaining synchronization cursors

The backend is **not** responsible for presentation.

------------------------------------------------------------------------

# 9. Mapping Layer

External identifiers are never exposed directly.

The backend translates Beds24 concepts into Vanara concepts.

Example:

``` text
Beds24 Unit ID
        │
        ▼
Backend Mapping
        │
        ▼
"Bungalow 5"
```

Applications consume only Vanara terminology.

------------------------------------------------------------------------

# 10. Frontend Rule

Frontend applications:

-   never call Beds24
-   never perform Beds24 mappings
-   never know provider identifiers
-   only consume backend APIs

------------------------------------------------------------------------

# 11. Architectural Principles

-   Backend owns business logic.
-   Frontend owns presentation.
-   Normalize provider data.
-   Prefer deterministic APIs.
-   Prefer idempotent synchronization.
-   Hide provider implementation details.
-   Keep external dependencies isolated.

------------------------------------------------------------------------

# 12. Frozen Decisions

The following architectural decisions are frozen:

-   Beds24 is the single Source of Truth.
-   Cloudflare D1 is the operational database.
-   Backend owns synchronization.
-   Backend owns provider mappings.
-   Frontend never communicates with Beds24.
-   Frontend never maps provider identifiers.
-   Business language is exposed instead of provider language.
-   Synchronization is the only component allowed to access Beds24.

------------------------------------------------------------------------

# Architecture Status

**FROZEN**

Future backend development must remain compatible with the principles
described in this document.
