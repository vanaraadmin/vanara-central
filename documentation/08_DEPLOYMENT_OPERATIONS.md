# Vanara Central Backend

## 08 - Deployment & Operations

### Architecture Freeze v1.0

**Status:** FROZEN

------------------------------------------------------------------------

# Purpose

This document defines how the Vanara Central backend is deployed,
updated and operated in production.

The goal is to ensure safe, repeatable deployments with minimal
operational risk.

------------------------------------------------------------------------

# Production Platform

-   Cloudflare Workers
-   Cloudflare D1
-   Cloudflare Cron Triggers
-   Wrangler CLI

Production infrastructure is intentionally serverless.

------------------------------------------------------------------------

# Deployment Principles

Deployments must be:

-   repeatable
-   reversible whenever possible
-   incremental
-   low risk
-   documented

------------------------------------------------------------------------

# Source Control

The Git repository is the single source of truth for backend code.

Generated files, secrets and temporary artifacts must never be
committed.

------------------------------------------------------------------------

# Secrets

Secrets are managed through Cloudflare Workers Secrets.

Examples include:

-   Beds24 Long Life Token
-   API keys
-   Future AI credentials

Secrets must never appear in source code.

------------------------------------------------------------------------

# Database Migrations

Schema changes should be introduced through versioned migrations.

Rules:

-   never edit production tables manually
-   migrations must be repeatable
-   preserve existing data whenever possible

------------------------------------------------------------------------

# Deployment Flow

``` text
Developer
    │
Local Validation
    │
Wrangler Deploy
    │
Cloudflare Workers
    │
Production
```

Every deployment should complete without manual intervention.

------------------------------------------------------------------------

# Post-Deployment Checklist

Verify:

-   Worker deployment
-   D1 connectivity
-   Cron triggers
-   Sync status endpoint
-   Recent logs
-   Successful synchronization

A deployment is complete only after validation.

------------------------------------------------------------------------

# Rollback Strategy

When possible:

1.  identify the issue;
2.  restore the previous release;
3.  investigate offline;
4.  redeploy a corrected version.

Avoid emergency changes directly in production.

------------------------------------------------------------------------

# Monitoring

Monitor:

-   synchronization success
-   Worker errors
-   D1 availability
-   cron executions
-   unexpected API failures

Monitoring should detect failures before users do.

------------------------------------------------------------------------

# Operational Philosophy

Production systems should favour:

-   reliability
-   observability
-   simplicity
-   predictable behaviour

------------------------------------------------------------------------

# Frozen Decisions

-   Production runs on Cloudflare.
-   Secrets remain outside source code.
-   Deployments are validated after release.
-   Migrations are versioned.
-   Production changes are reproducible.
-   Operational simplicity has priority.

# Status

**FROZEN**
