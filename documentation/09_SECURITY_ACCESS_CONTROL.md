# Vanara Central Backend

## 09 - Security & Access Control

### Architecture Freeze v1.0

**Status:** FROZEN

------------------------------------------------------------------------

# Purpose

This document defines the security principles governing the Vanara
Central backend.

Security must be built into the architecture rather than added later.

------------------------------------------------------------------------

# Core Principles

-   Least privilege
-   Default deny
-   Secure by design
-   Defense in depth
-   Auditability

------------------------------------------------------------------------

# Authentication

All protected endpoints require authenticated requests.

Authentication mechanisms may evolve without changing business APIs.

------------------------------------------------------------------------

# Authorization

Permissions are role-based.

Typical roles include:

-   Owner
-   Manager
-   Reception
-   Housekeeping
-   Maintenance
-   AI Services

Every request should execute with the minimum permissions required.

------------------------------------------------------------------------

# Secrets

Secrets must:

-   remain outside source code
-   never be logged
-   never be committed to Git
-   rotate when necessary

Cloudflare Secrets are the preferred mechanism.

------------------------------------------------------------------------

# API Security

APIs should:

-   validate all input
-   reject malformed requests
-   use HTTPS only
-   return generic error messages
-   avoid leaking internal details

------------------------------------------------------------------------

# Database Security

Applications access D1 only through backend services.

Direct client access to D1 is not permitted.

------------------------------------------------------------------------

# External Providers

Communication with external providers is centralized.

Only the Synchronization Engine communicates with Beds24.

Future providers should follow the same pattern.

------------------------------------------------------------------------

# Logging & Audit

Security-relevant events should be logged, including:

-   authentication failures
-   authorization failures
-   synchronization failures
-   unexpected errors

Sensitive information must be excluded from logs.

------------------------------------------------------------------------

# Future Evolution

Future enhancements may include:

-   JWT authentication
-   API keys
-   service accounts
-   multi-factor authentication
-   fine-grained permissions

These additions should preserve the existing architecture.

------------------------------------------------------------------------

# Frozen Decisions

-   Security is enforced in the backend.
-   Clients never access providers directly.
-   Clients never access D1 directly.
-   Secrets remain external to the codebase.
-   Role-based authorization is the preferred model.

------------------------------------------------------------------------

# Status

**FROZEN**
