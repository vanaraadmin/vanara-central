# Vanara Central

Vanara Central is a Cloudflare Workers + Vite application for Vanara Operations.

The runtime application uses one authoritative data source: the production Cloudflare D1 database configured in `wrangler.jsonc`.

## Requirements

- Node.js compatible with the versions in `package-lock.json`
- npm
- Wrangler through the project dependencies
- Cloudflare credentials available to Wrangler for local development, because D1 is configured as a remote production binding

Do not store real secrets in Git. Local secrets belong in a root `.dev.vars` file, which is ignored by Git.

## First install

```bash
npm install
```

## Start local development

```bash
npm run dev
```

Default local URL:

```text
http://localhost:5173
```

Local development does not create or seed a local D1 database. If Cloudflare credentials are unavailable, the application must fail with a clear connection/configuration error instead of showing fake operational data.

## Runtime database

The authoritative runtime database is configured in `wrangler.jsonc`:

```text
binding: DB
type: Cloudflare D1
database_name: vanara-central
database_id: 1f0c6fce-8a47-442a-8158-97708aefe6b1
environment: production
```

The D1 binding is marked `remote: true` so the running app does not silently use a local D1 simulator for operational data.

## Useful routes

```text
/health
/api/health
/api/current-user
/api/reception
/api/reception?date=YYYY-MM-DD
/staff
/reception
```

## Health check

Use:

```text
GET /health
```

The health response confirms:

- Worker/API process is alive;
- D1 binding can execute a simple query;
- the configured database identity;
- Beds24 base URL configuration;
- whether the Beds24 token is present for sync operations.

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

Do not run deployment or remote migration commands unless explicitly authorized.

```bash
npm run deploy
```
