# DEPLOYMENT_RUNBOOK

## Purpose

This runbook defines the single supported production deployment path for Vanara Central.

Every new Codex session must use this document and the repository-owned scripts. Do not rediscover Cloudflare authentication, bindings, commands, smoke URLs, or migration order at the end of each sprint.

## Production Configuration

Wrangler config:

- File: `wrangler.jsonc`
- Worker name: `vanara-central`
- Main entry: `server/src/index.ts`
- Production URL: `https://vanara-central.administrator-5b7.workers.dev`
- Compatibility date: `2026-07-28`
- Compatibility flags: `nodejs_compat`
- Static assets: `./dist/client`
- Worker-first routes: `/api/*`, `/health`

D1 binding:

- Binding: `DB`
- Database name: `vanara-central`
- Database id: `1f0c6fce-8a47-442a-8158-97708aefe6b1`
- Migrations directory: `server/migrations`
- Remote: `true`

R2 binding:

- Binding: `R2_STORAGE`
- Bucket: `vanara-central-documents`

Configured environment variable names:

- `BEDS24_BASE_URL`
- `PASSPORT_RETENTION_DAYS`
- `VANARA_DATABASE_ENVIRONMENT`
- `VANARA_DATABASE_NAME`
- `VANARA_DATABASE_ID`

Required secret names:

- `BEDS24_LONG_LIFE_TOKEN`
- `BEDS24_WEBHOOK_SECRET`
- `OPENAI_API_KEY`

## Authentication

The approved Cloudflare authentication method is the local Wrangler OAuth profile.

Wrangler stores this credential outside the repository in the user profile. On this machine the profile is under:

`C:\Users\stefa\AppData\Roaming\xdg.config\.wrangler\config\default.toml`

Rules:

- Never store Cloudflare API tokens in source.
- Never add secrets to `wrangler.toml`, `wrangler.json`, or `wrangler.jsonc`.
- Never print token values.
- Never commit credentials.
- Do not override `XDG_CONFIG_HOME` for deployment commands; doing so can hide the approved Wrangler OAuth profile.
- Never print Vanara smoke session tokens or cookies.

If authentication is missing, run exactly this setup action once:

```powershell
.\node_modules\.bin\wrangler.cmd login
```

Approve Cloudflare OAuth in the browser, then rerun:

```powershell
npm run deploy:preflight
```

### Vanara Smoke Authentication

Production smoke supports two explicit authentication modes.

Recommended autonomous mode:

```powershell
npm run deploy:production -- --temporary-smoke-session
```

or for standalone smoke:

```powershell
npm run deploy:smoke -- --temporary-smoke-session
```

This mode creates one temporary production session for an existing active Owner account with Housekeeping read access. The script:

- does not modify passwords, roles, permissions, or product data;
- caps the session TTL at 5 minutes;
- uses the session only for the approved read-only smoke `GET` requests;
- never prints the raw token, cookie, or token hash;
- revokes the session in a cleanup block even when smoke fails;
- verifies the session row no longer exists after cleanup.

Manual cookie mode remains supported:

```powershell
$env:VANARA_SMOKE_COOKIE = "vanara_session=<cookie-value>"
npm run deploy:smoke
Remove-Item Env:\VANARA_SMOKE_COOKIE
```

Use manual cookie mode only when temporary session creation is not explicitly approved for the deployment.

## Prerequisites

From repository root:

```powershell
npm install
```

Cloudflare access must allow:

- account read;
- Worker read/write;
- D1 write;
- R2 access through configured bindings;
- secret list access.

For authenticated read-only production smoke, use the explicit temporary smoke session flag:

```powershell
npm run deploy:smoke -- --temporary-smoke-session
```

If the temporary-session option is not approved, the current shell must have a temporary Vanara production session cookie:

```powershell
$env:VANARA_SMOKE_COOKIE = "vanara_session=<cookie-value>"
```

Do not print this value. Clear it after smoke with `Remove-Item Env:\VANARA_SMOKE_COOKIE`.

Optional smoke overrides:

```powershell
$env:VANARA_PRODUCTION_URL = "https://vanara-central.administrator-5b7.workers.dev"
$env:VANARA_SMOKE_ROOM_ID = "1"
```

## One Supported Path

Use these commands only:

```powershell
npm run deploy:preflight
npm run deploy:production -- --temporary-smoke-session
npm run deploy:smoke -- --temporary-smoke-session
```

Do not run ad hoc Wrangler deployment commands unless debugging this deployment foundation itself.

## Preflight Sequence

Command:

```powershell
npm run deploy:preflight
```

The preflight verifies:

- Wrangler availability and version;
- local Wrangler OAuth authentication;
- Cloudflare account access;
- Worker access;
- D1 migration state;
- R2 binding presence;
- required environment variable names;
- required secret names;
- production URL health;
- current git status;
- build readiness.

If Cloudflare authentication is missing, preflight stops with one setup action:

```powershell
.\node_modules\.bin\wrangler.cmd login
```

## Validation Sequence

The production deployment script runs validation in this fixed order:

1. Preflight.
2. Server tests.
3. Housekeeping frontend/source tests.
4. Typecheck.
5. Lint.
6. Build.
7. Server build.
8. Approved D1 migrations.
9. Production deploy.
10. Read-only production smoke.

If any step fails, the script stops immediately and prints the failed step.

## Migration Sequence

Preflight reads remote migration state:

```powershell
.\node_modules\.bin\wrangler.cmd d1 migrations list vanara-central --remote --config wrangler.jsonc
```

Production deployment applies approved repository migrations before deploy:

```powershell
.\node_modules\.bin\wrangler.cmd d1 migrations apply vanara-central --remote --config wrangler.jsonc
```

Wrangler captures a remote backup during migration apply. If a migration fails, Wrangler rolls back that migration and leaves previous successful migrations applied.

## Build Sequence

The production deployment script runs:

```powershell
npm.cmd --prefix server test
node --import tsx --test tests/housekeeping-v2-source.test.ts tests/housekeeping-v2-room-source.test.ts
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd --prefix server run build:server
```

The source-test command is run from the `server` directory because `tsx` is a server dev dependency.

## Deploy Sequence

Command:

```powershell
npm run deploy:production -- --temporary-smoke-session
```

The script:

- verifies smoke authentication before build;
- creates and later revokes a temporary Owner smoke session only when the explicit flag is present;
- runs validation;
- applies approved D1 migrations;
- deploys with `wrangler deploy --config wrangler.jsonc`;
- captures `Current Version ID`;
- runs read-only smoke;
- returns `DEPLOYMENT GREEN` or fails with the exact failed step.

The production command does not commit code.

## Smoke Sequence

Command:

```powershell
npm run deploy:smoke -- --temporary-smoke-session
```

Smoke is read-only.

It verifies:

- `GET /`
- `GET /api/current-user`
- `GET /api/housekeeping/v2/summary`
- `GET /api/housekeeping/v2/tasks`
- Priority section presence;
- Normal section presence;
- Water section presence;
- task uniqueness across visible queues;
- Water quantity values when Water tasks are present;
- carried-over Priority read model when such tasks are present;
- `GET /api/housekeeping/v2/rooms/1` unless `-RoomId` or `VANARA_SMOKE_ROOM_ID` overrides it;
- Room Workspace read model.

The smoke does not create, claim, start, complete, skip, cancel, or reopen tasks. Operational write-flow smoke must be explicitly approved for a release and must use a short-lived session.

## Rollback Procedure

List recent Worker versions:

```powershell
.\node_modules\.bin\wrangler.cmd versions list --config wrangler.jsonc
```

Rollback to a known good version:

```powershell
.\node_modules\.bin\wrangler.cmd rollback <VERSION_ID> --config wrangler.jsonc
```

After rollback:

```powershell
npm run deploy:smoke -- --temporary-smoke-session
```

Record the rolled-back Version ID and smoke result in the release notes.

## Common Errors And Fixes

Error: `In a non-interactive environment, it's necessary to set a CLOUDFLARE_API_TOKEN`

Cause: Wrangler is not seeing the approved local OAuth profile, often because `XDG_CONFIG_HOME` was changed or the local session is missing.

Fix:

```powershell
.\node_modules\.bin\wrangler.cmd login
npm run deploy:preflight
```

Error: `Cannot read directory "../.."` or Wrangler log `EPERM`

Cause: the sandbox blocked Wrangler from reading deployment inputs or writing its normal user-profile logs.

Fix: run deployment scripts with approval to access the local Wrangler OAuth profile and Cloudflare network. Do not change `XDG_CONFIG_HOME` to a temporary repository folder.

Error: smoke authentication missing

Fix:

```powershell
npm run deploy:smoke -- --temporary-smoke-session
```

If temporary session creation is not approved for the deployment, use manual cookie mode:

```powershell
$env:VANARA_SMOKE_COOKIE = "vanara_session=<cookie-value>"
npm run deploy:smoke
Remove-Item Env:\VANARA_SMOKE_COOKIE
```

Error: temporary smoke session cannot be created

Cause: no existing active Owner account with Housekeeping read access is available, or D1 session insertion failed.

Fix: stop and report the exact failed check. Do not change passwords, roles, or permissions from the deployment scripts.

Error: missing D1 binding, R2 binding, environment variable, or secret name

Fix: correct Cloudflare/Wrangler configuration outside source secrets, then rerun:

```powershell
npm run deploy:preflight
```

Error: pending or failed migration

Fix: inspect the migration output, repair the migration if needed, rerun:

```powershell
npm run deploy:production -- --temporary-smoke-session
```

## Rules For New Codex Sessions

1. Read this runbook first.
2. Run:

```powershell
npm run deploy:preflight
```

3. If authentication is missing, stop and return the exact setup action. Do not investigate unrelated code.
4. If bindings or secrets are missing, stop and return the exact failed check.
5. Do not print tokens or session cookies.
6. Do not write credentials into source files.
7. Do not override `XDG_CONFIG_HOME` for deployment.
8. Run production deployment only with:

```powershell
npm run deploy:production -- --temporary-smoke-session
```

9. Run standalone read-only smoke only with:

```powershell
npm run deploy:smoke -- --temporary-smoke-session
```

10. Return Version ID and final status from the script output.
