# Vanara Central

Vanara Central is a Cloudflare Workers + Vite application for Vanara Operations.

This repository is configured to run locally with the same authoritative Wrangler configuration used by the Worker: `wrangler.jsonc` at the project root.

## Requirements

- Node.js compatible with the versions in `package-lock.json`
- npm
- Wrangler, installed through the project dependencies

Do not store real secrets in Git. Local secrets belong in a root `.dev.vars` file, which is ignored by Git.

## First install

From the project root:

```bash
npm install
```

## Start local development

```bash
npm run dev
```

Before Vite starts, the `predev` script runs `npm run dev:prepare`. That local preparation step:

- applies D1 migrations locally only;
- uses Wrangler local persistence at `server/.wrangler/state`;
- applies the fake local seed from `server/seed/local.sql`;
- does not modify remote D1;
- does not call Beds24.

Default local URL:

```text
http://localhost:5173
```

Useful local routes:

```text
/health
/api/health
/api/dashboard
/api/availability
/api/availability/unit/:id
/api/availability/date/:yyyy-mm-dd
/dashboard
```

## Prepare local D1 manually

If you need to initialize or refresh the local D1 bootstrap without starting the dev server:

```bash
npm run dev:prepare
```

The seed is intentionally tiny and fake:

- one property;
- one room type;
- one unit;
- one offer;
- one booking.

It is idempotent, so it is safe to run more than once against the local Wrangler store.

## Local Beds24 sync testing

Beds24 sync endpoints require `BEDS24_LONG_LIFE_TOKEN`.

For local manual sync tests only, copy `.dev.vars.example` to `.dev.vars` and set the token there. Keep requests minimal and never run repeated real syncs just to verify local startup.

The normal local startup path does not require the token and does not call Beds24.

## Health check

Use:

```text
GET /health
```

The health response confirms:

- Worker/API process is alive;
- D1 binding can execute a simple query;
- Beds24 base URL configuration is valid;
- whether the Beds24 token is present for optional local sync testing.

A missing Beds24 token is reported as `missing-local-only` and does not make health fail, because sync is not required for normal local startup.

## Verification commands

Root application:

```bash
npm run typecheck
npm run lint
npm run build
```

Server package:

```bash
cd server
npm run build
npm run test
```

## Production safety

These local-development commands do not deploy and do not modify remote D1.

Use deployment commands only when explicitly authorized:

```bash
npm run deploy
```
