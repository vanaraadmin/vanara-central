# Vanara Central Backend

## 06 - Architecture Decisions (ADR)

### Architecture Freeze v1.0

**Status:** FROZEN

------------------------------------------------------------------------

# Purpose

This document records the architectural decisions that define Vanara
Central.

Unlike the other technical documents, this file explains **why**
specific decisions were made.

Every future architectural change should be evaluated against these
decisions before implementation.

------------------------------------------------------------------------

# ADR-001

## Beds24 is the Single Source of Truth

### Decision

Beds24 owns reservations, availability, prices, units and property data.

### Reason

Duplicating business ownership across multiple systems inevitably
creates inconsistencies.

### Consequences

-   one authoritative source
-   easier recovery
-   simpler synchronization
-   lower maintenance

**Status:** FROZEN

------------------------------------------------------------------------

# ADR-002

## D1 is the Operational Database

### Decision

Applications never work directly against Beds24.

Cloudflare D1 is the operational database.

### Reason

Operations require:

-   fast reads
-   predictable latency
-   provider independence
-   internal workflows

Beds24 should not become part of the runtime execution path.

**Status:** FROZEN

------------------------------------------------------------------------

# ADR-003

## Synchronization Owns Provider Communication

### Decision

Only the Synchronization Engine communicates with Beds24.

### Reason

Keeping provider communication in a single component dramatically
reduces complexity.

Every other module remains provider independent.

**Status:** FROZEN

------------------------------------------------------------------------

# ADR-004

## Backend Owns Business Mapping

### Decision

Provider identifiers are translated inside the backend.

### Example

Beds24

↓

Unit 5

↓

Backend

↓

Bungalow 5

### Reason

Business language belongs in backend APIs, not in frontend applications.

**Status:** FROZEN

------------------------------------------------------------------------

# ADR-005

## Frontend Never Knows Beds24

### Decision

Frontend applications never receive Beds24 identifiers.

### Reason

Frontend should remain independent of provider implementation.

Replacing Beds24 in the future should not require frontend changes.

**Status:** FROZEN

------------------------------------------------------------------------

# ADR-006

## Preserve Provider Payload

### Decision

The original Beds24 payload is stored as raw_json.

### Reason

Benefits include:

-   debugging
-   compatibility
-   reprocessing
-   future migrations
-   audit support

Business applications never consume raw_json directly.

**Status:** FROZEN

------------------------------------------------------------------------

# ADR-007

## Incremental Synchronization

### Decision

Synchronization is incremental whenever possible.

### Reason

Benefits

-   fewer API calls
-   faster execution
-   reduced costs
-   scalability

Bootstrap is reserved for initial database population.

**Status:** FROZEN

------------------------------------------------------------------------

# ADR-008

## Idempotent Synchronization

### Decision

Synchronization must be safe to execute repeatedly.

### Reason

Cloud environments are inherently retry-oriented.

Idempotent execution guarantees stable database state.

**Status:** FROZEN

------------------------------------------------------------------------

# ADR-009

## Business Language Has Priority

### Decision

Backend APIs expose Vanara terminology.

Examples

-   Villa 10
-   Bungalow 7
-   Yurt 3

Provider terminology remains internal.

### Reason

Staff should work with the same names used inside the resort.

**Status:** FROZEN

------------------------------------------------------------------------

# ADR-010

## Backend Owns Business Logic

### Decision

Business rules belong to the backend.

Frontend is responsible only for presentation.

### Reason

Avoid duplicated logic across multiple clients.

Guarantee consistent behaviour.

**Status:** FROZEN

------------------------------------------------------------------------

# ADR-011

## Deterministic APIs

### Decision

Given the same database state, APIs must always produce the same
response.

### Reason

Predictability simplifies debugging, testing and long-term maintenance.

**Status:** FROZEN

------------------------------------------------------------------------

# ADR-012

## Simplicity Over Cleverness

### Decision

Prefer straightforward architecture over sophisticated solutions.

### Reason

The platform will evolve for years.

Simple systems are easier to understand, maintain and extend.

**Status:** FROZEN

------------------------------------------------------------------------

# Future ADR Process

Any future architectural change should:

1.  document the decision;
2.  explain the motivation;
3.  evaluate the consequences;
4.  explicitly mark whether the previous decision is superseded or
    remains valid.

This document is intended to become the historical memory of the project
architecture.

------------------------------------------------------------------------

# Status

**FROZEN**
