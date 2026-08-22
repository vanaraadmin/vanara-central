# Vanara Central

PWA operativa di Vanara Retreat per Owner e Staff. Il repository contiene client React/Vite, API Cloudflare Worker, schema D1, storage R2, Durable Objects della chat, test e procedure di produzione.

Produzione: [central.vanararetreat.com](https://central.vanararetreat.com)

## Stato pubblico

```text
GET https://central.vanararetreat.com/health
{"ok":true,"worker":"ok","api":"ok","d1":"ok"}
```

La health è intenzionalmente minima. Non espone identità D1, binding o stato dei segreti. La provenance del client è disponibile in `GET /app-version.json` con build ID, commit e hash degli entry asset.

## Route principali

- `/staff` — home canonica Owner/Staff;
- `/reception` — arrivi, partenze, check-in e ospiti;
- `/rooms` — stato e dettaglio camera;
- `/housekeeping-v2` — coda housekeeping;
- `/maintenance` — issue operative;
- `/dashboard` — Financial Dashboard Owner;
- `/accounting` e `/payroll` — moduli finanziari Owner.

`/chat` è un intent che apre la chat team su `/staff`; `/movements` è legacy.

## Sviluppo locale

Prerequisiti: Node.js e accesso alle dipendenze del progetto.

```powershell
npm ci
npm run dev
```

Controlli prima di proporre una release:

```powershell
npm run release:guard
npm run test:run
npm run typecheck
npm run lint
npm run build
```

Non eseguire comandi D1 remoti, chiamate OpenAI/Meta, sync forzati o deploy senza autorizzazione esplicita.

## Produzione

La configurazione eseguibile è in `wrangler.jsonc`: `workers_dev` è disabilitato e il dominio personalizzato è l'unico endpoint di produzione. Le release devono partire dal repository canonico completo e usare gli script di preflight/deploy; non copiare vecchie worktree e non distribuire da branch storici incompleti.

Vedere:

- [Indice tecnico](documentation/README.md)
- [Architettura](documentation/ARCHITECTURE.md)
- [Stato live e provenance](documentation/PRODUCTION_STATUS.md)
- [Runbook di deploy](documentation/operations/DEPLOYMENT_RUNBOOK.md)
- [Aree congelate](documentation/operations/FROZEN_AREAS.md)

## Confini documentali

`docs/staff-contracts/` contiene artefatti legali e regole payroll separate. Il sito pubblico e Beds24 booking page vivono nel repository `Vanara_production_site`. Output temporanei, `.worktrees/` e vecchi handoff non sono fonti di verità.
