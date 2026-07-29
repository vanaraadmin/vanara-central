# Vanara Central Backend

## 04 - API Conventions

### Architecture Freeze v1.0

**Status:** FROZEN

------------------------------------------------------------------------

# Purpose

This document defines the standards that every backend API must follow.

The objective is to guarantee consistency, simplicity and long-term
maintainability across every Vanara Central module.

------------------------------------------------------------------------

# General Principles

All APIs:

-   read from Cloudflare D1
-   never access Beds24 directly
-   expose Vanara business concepts
-   remain deterministic
-   remain stateless whenever possible

------------------------------------------------------------------------

# API Architecture

``` text
Client
   │
REST API
   │
Cloudflare D1

Beds24 is NEVER accessed here.
```

Beds24 communication belongs exclusively to the Synchronization Engine.

------------------------------------------------------------------------

# Endpoint Naming

Use nouns instead of verbs.

Examples

    GET /today
    GET /bookings
    GET /units
    GET /offers

    POST /maintenance
    POST /housekeeping

Avoid

    /getBookings
    /loadRooms
    /doSync

------------------------------------------------------------------------

# Versioning

Current version:

    v1

Future breaking changes require:

    /api/v2/

Minor additions must not break existing clients.

------------------------------------------------------------------------

# JSON Rules

Responses must be clean.

Good

``` json
{
  "guest": "John Smith",
  "unit": "Bungalow 5",
  "arrival": "2026-12-20"
}
```

Avoid provider terminology.

Bad

``` json
{
  "beds24_unit_id": 5,
  "roomTypeId": 689560
}
```

------------------------------------------------------------------------

# Business Language

Backend APIs expose Vanara language.

Examples

Good

-   Villa 10
-   Bungalow 7
-   Yurt 3

Never

-   Unit 4
-   RoomType 689560
-   Beds24 identifiers

------------------------------------------------------------------------

# Error Responses

Standard format

``` json
{
  "success": false,
  "error": "Booking not found"
}
```

Successful responses

``` json
{
  "success": true,
  "data": { }
}
```

------------------------------------------------------------------------

# HTTP Status Codes

Use standard HTTP semantics.

200 OK

201 Created

400 Bad Request

401 Unauthorized

403 Forbidden

404 Not Found

409 Conflict

500 Internal Server Error

------------------------------------------------------------------------

# Date Format

Always ISO-8601.

    YYYY-MM-DD

Example

    2026-12-20

Time values

    2026-12-20T15:30:00Z

when required.

------------------------------------------------------------------------

# Identifiers

Provider identifiers remain internal.

Clients should receive stable business identifiers whenever possible.

If an internal numeric ID is required, it belongs to Vanara, not Beds24.

------------------------------------------------------------------------

# Pagination

Collection endpoints should support pagination.

Recommended parameters

    ?page=
    &pageSize=

Future filtering should follow:

    ?status=confirmed
    ?arrival=2026-12-20

------------------------------------------------------------------------

# Filtering

Filtering belongs to backend.

Frontend should never download everything and filter locally.

------------------------------------------------------------------------

# Sorting

Sorting is performed by the backend whenever practical.

Default ordering should be deterministic.

------------------------------------------------------------------------

# Validation

Every endpoint validates:

-   required fields
-   data types
-   business rules

Validation errors must be explicit.

------------------------------------------------------------------------

# Security

API responses expose only data required by the client.

Never expose:

-   provider credentials
-   synchronization details
-   provider internal identifiers
-   implementation details

------------------------------------------------------------------------

# Future Compatibility

New endpoints must follow these conventions.

Existing endpoints should remain backward compatible whenever possible.

------------------------------------------------------------------------

# Frozen Decisions

-   APIs read only D1.
-   APIs never communicate with Beds24.
-   APIs expose Vanara terminology.
-   REST conventions are preferred.
-   JSON responses remain simple.
-   Business language has priority over provider language.
-   Filtering belongs to backend.
-   Validation belongs to backend.

# Status

**FROZEN**
