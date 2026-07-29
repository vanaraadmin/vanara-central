# Vanara Central Backend

## 10 - AI Integration

### Architecture Freeze v1.0

**Status:** FROZEN

------------------------------------------------------------------------

# Purpose

This document defines how Artificial Intelligence services integrate
with the Vanara Central backend.

AI is a consumer of backend services, not an owner of business data.

------------------------------------------------------------------------

# Design Philosophy

AI should be:

-   provider independent
-   stateless whenever possible
-   cost-aware
-   deterministic when business rules apply
-   isolated from operational systems

------------------------------------------------------------------------

# Single Source of Truth

AI never owns operational data.

Operational information comes from:

Cloudflare D1

↓

Backend APIs

↓

AI Services

Beds24 is never accessed directly by AI components.

------------------------------------------------------------------------

# AI Responsibilities

AI may:

-   answer guest questions
-   assist staff
-   summarize information
-   generate text
-   classify requests
-   support operational decisions

AI does not replace backend business logic.

------------------------------------------------------------------------

# Backend Responsibilities

The backend remains responsible for:

-   validation
-   permissions
-   calculations
-   business rules
-   synchronization
-   persistence

AI must not implement critical business workflows.

------------------------------------------------------------------------

# Communication Model

Applications

↓

Backend APIs

↓

AI Services (when required)

↓

Response

AI interactions should always pass through backend services.

------------------------------------------------------------------------

# Context

AI should receive only the information required for the current task.

Avoid sending unnecessary:

-   personal data
-   historical data
-   internal implementation details

Least-context is preferred.

------------------------------------------------------------------------

# Cost Awareness

AI should be used selectively.

Prefer deterministic backend logic whenever possible.

Use AI only where it adds measurable value.

------------------------------------------------------------------------

# Error Handling

If AI is unavailable:

-   backend continues operating
-   operational features remain functional
-   graceful fallbacks are preferred

AI failures must never block core operations.

------------------------------------------------------------------------

# Future AI Services

Potential integrations include:

-   Concierge
-   Operations Assistant
-   Maintenance Assistant
-   Knowledge Search
-   Reporting Assistant
-   Internal Copilot

All should use the same backend architecture.

------------------------------------------------------------------------

# Frozen Decisions

-   AI never accesses Beds24 directly.
-   AI consumes backend APIs.
-   Business logic remains in the backend.
-   AI is optional for core operations.
-   AI usage should remain cost-aware.

------------------------------------------------------------------------

# Status

**FROZEN**
