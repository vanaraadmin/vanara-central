# Vanara Central Backend

## 00 - Project Principles

### Architecture Freeze v1.0

**Status:** FROZEN

------------------------------------------------------------------------

# Purpose

This document defines the immutable principles that guide every
architectural and development decision within the Vanara Central
backend.

Whenever a new feature, module or architectural proposal is introduced,
it should be evaluated against these principles first.

If a proposal violates one or more principles, it should be reconsidered
before implementation.

------------------------------------------------------------------------

# Principle 1

## Beds24 is the Source of Truth

Beds24 owns operational hospitality data.

Vanara Central synchronizes that information but never replaces Beds24
as the master system.

------------------------------------------------------------------------

# Principle 2

## D1 is the Operational Database

All applications work against Cloudflare D1.

Beds24 is not part of the runtime execution path.

------------------------------------------------------------------------

# Principle 3

## One Responsibility per Component

Each component has one clear responsibility.

Examples

-   Synchronization → imports data
-   Backend APIs → expose business data
-   Frontend → presentation
-   AI → decision support

Responsibilities must not overlap.

------------------------------------------------------------------------

# Principle 4

## Backend Owns Business Logic

Business rules belong in the backend.

Never duplicate business logic inside frontend applications.

------------------------------------------------------------------------

# Principle 5

## Speak Vanara

Applications expose Vanara terminology.

Examples

-   Villa 10
-   Bungalow 5
-   Yurt 3

Provider terminology remains internal.

------------------------------------------------------------------------

# Principle 6

## Hide Provider Details

External provider concepts are implementation details.

Applications should never depend on:

-   Beds24 identifiers
-   Beds24 terminology
-   Beds24 workflows

------------------------------------------------------------------------

# Principle 7

## Simplicity First

Prefer simple, understandable solutions over complex ones.

Complexity must always justify itself.

------------------------------------------------------------------------

# Principle 8

## Stability Before Features

Reliability is more important than feature count.

Avoid introducing unnecessary architectural changes.

------------------------------------------------------------------------

# Principle 9

## Idempotent Operations

Background operations should be safe to execute repeatedly.

Retrying must never corrupt the system.

------------------------------------------------------------------------

# Principle 10

## Deterministic Behaviour

Given the same input and database state, the system should always
produce the same result.

Predictability simplifies maintenance and testing.

------------------------------------------------------------------------

# Principle 11

## Normalize External Systems

Every external provider is translated into Vanara business concepts.

Internal modules communicate using Vanara language only.

------------------------------------------------------------------------

# Principle 12

## Future Independence

Architecture should allow replacing external providers with minimal
impact.

Dependencies should remain isolated behind synchronization and backend
APIs.

------------------------------------------------------------------------

# Principle 13

## Document Important Decisions

Architectural decisions are part of the project.

Every significant decision should be documented before it becomes
permanent.

------------------------------------------------------------------------

# Principle 14

## Evolution Without Regression

New functionality should extend the architecture without breaking
existing behaviour.

Backward compatibility is preferred whenever practical.

------------------------------------------------------------------------

# Principle 15

## Architecture is a Product

The architecture itself is considered a deliverable.

Code may evolve.

Principles remain stable.

------------------------------------------------------------------------

# Final Statement

Vanara Central is designed to be:

-   simple
-   maintainable
-   predictable
-   provider-independent
-   business-oriented
-   operationally reliable

Every future contribution should reinforce these characteristics.

------------------------------------------------------------------------

# Status

**FROZEN**
