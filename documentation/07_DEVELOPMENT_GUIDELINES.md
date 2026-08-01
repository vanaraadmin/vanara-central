# Vanara Central Backend

## 07 - Development Guidelines

### Architecture Freeze v1.0

**Status:** FROZEN

------------------------------------------------------------------------

# Purpose

This document defines the development rules for every contributor
working on the Vanara Central backend.

Its goal is to preserve architectural consistency as the project
evolves.

When in doubt, architectural consistency has priority over
implementation speed.

------------------------------------------------------------------------

# General Rule

Every change should make the project:

-   simpler
-   safer
-   more maintainable
-   easier to understand

Never introduce complexity without measurable benefit.

------------------------------------------------------------------------

# Before Writing Code

Always ask:

1.  Does this feature belong in the backend?
2.  Does it violate an existing architectural decision?
3.  Can it reuse an existing component?
4.  Is there a simpler solution?

------------------------------------------------------------------------

# Code Style

Prefer:

-   small functions
-   descriptive names
-   explicit logic
-   early returns
-   readable code

Avoid:

-   deeply nested conditions
-   duplicated logic
-   hidden side effects
-   unnecessary abstractions

Code is written for humans first.

------------------------------------------------------------------------

# Business Logic

Business rules belong exclusively in the backend.

Never duplicate the same rule:

-   in the frontend
-   inside Make
-   inside AI prompts

One implementation.

One source of business logic.

------------------------------------------------------------------------

# API Development

Every new endpoint should:

-   read from D1
-   expose business concepts
-   validate input
-   return deterministic responses

Endpoints must never access Beds24 directly.

------------------------------------------------------------------------

# Database Changes

Before modifying the schema ask:

Can this be solved without changing the schema?

If schema evolution is required:

-   preserve backward compatibility
-   avoid breaking existing tables
-   prefer new tables over incompatible modifications

------------------------------------------------------------------------

# Synchronization

Never bypass the Synchronization Engine.

All provider communication belongs there.

Business modules should never import provider SDKs directly.

------------------------------------------------------------------------

# Error Handling

Errors should:

-   be explicit
-   be logged
-   never silently fail
-   preserve database consistency

Recover whenever possible.

------------------------------------------------------------------------

# Logging

Log:

-   unexpected situations
-   synchronization failures
-   validation errors
-   important state changes

Avoid excessive logging.

Logs should remain useful.

------------------------------------------------------------------------

# Performance

Optimize only after measuring.

Prefer:

-   fewer API calls
-   fewer database writes
-   predictable execution

Avoid premature optimization.

------------------------------------------------------------------------

# Dependencies

Every dependency increases maintenance cost.

Before adding one ask:

-   Is it really necessary?
-   Can the standard platform solve the problem?
-   Does it increase long-term complexity?

Choose the smallest solution.

------------------------------------------------------------------------

# Refactoring

Refactor when it improves:

-   readability
-   maintainability
-   architecture
-   testability

Do not refactor for personal preference.

------------------------------------------------------------------------

# Documentation

Architectural changes require documentation updates.

If architecture changes but documentation does not, the work is
incomplete.

Documentation is part of the deliverable.

------------------------------------------------------------------------

# Code Reviews

Review for:

-   simplicity
-   consistency
-   correctness
-   maintainability

Not for personal coding style.

------------------------------------------------------------------------

# Future Modules

Every future module should integrate with the existing architecture
instead of creating parallel solutions.

Examples:

-   Operations
-   Housekeeping
-   Maintenance
-   AI Concierge
-   Analytics
-   Reporting

All should follow the same architectural principles.

------------------------------------------------------------------------

# Things We Intentionally Avoid

-   direct Beds24 access
-   duplicated business logic
-   frontend business rules
-   provider-specific APIs
-   unnecessary abstractions
-   unnecessary dependencies
-   hidden behaviour

------------------------------------------------------------------------

# Development Philosophy

Prefer:

Simple \> Clever

Readable \> Short

Stable \> New

Consistent \> Fast

Maintainable \> Complex

Architecture \> Convenience

------------------------------------------------------------------------

# Final Rule

Every contribution should leave the project in a better state than it
was found.

Small, consistent improvements are preferred over large disruptive
changes.

------------------------------------------------------------------------

# Status

**FROZEN**
