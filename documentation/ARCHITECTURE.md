# Architettura di Vanara Central

## Perimetro

Vanara Central è una PWA operativa servita da un unico Cloudflare Worker sul dominio `central.vanararetreat.com`. Il client React/Vite e le API condividono la stessa origine. Il Worker usa D1 per dati e sessioni, R2 per file privati, Durable Objects per la chat realtime, cron Worker per sync/automazioni e Cloudflare Assets per il client.

La configurazione eseguibile è `wrangler.jsonc`; l'entry server è `server/src/index.ts`. `workers_dev` è disabilitato: il dominio personalizzato è l'endpoint di produzione.

## Flusso applicativo

1. Il browser carica la PWA e verifica `app-version.json` e `sw.js` senza cache persistente.
2. Il router monta le pagine autorizzate e `OperationsShell` controlla lo sfondo globale.
3. Le richieste `/api/*` e operative passano prima dal Worker; la navigazione HTML usa gli asset compilati.
4. Le API verificano sessione, ruolo e permessi prima di leggere o mutare D1/R2/DO.
5. Le integrazioni esterne sono isolate in servizi server con idempotenza, audit e recovery specifici.

## Identità e autorizzazione

Le sessioni applicative sono persistite in D1 e trasmesse con cookie sicuro. I ruoli supportati sono Owner, Manager, Reception, Housekeeping, Maintenance e Operations. Le capacità effettive derivano dal servizio permessi, non dalla sola visibilità del menu.

Owner e Staff condividono `/staff`, con contenuto diverso. Le funzioni finanziarie sono Owner-only. Non esiste registrazione pubblica e il bootstrap Owner è disabilitato per impostazione normale.

## Confini dei dati

- `units.unit_id` è l'identità canonica delle camere; codici esterni Beds24 non devono apparire come nomi operativi.
- Chat interna e Guest Messages sono domini distinti.
- Allegati Accounting, passaporti/OCR e file chat sono privati e accessibili solo da endpoint autorizzati.
- I nomi canonici delle unità non devono essere sovrascritti dalla sincronizzazione della proprietà.
- Le mutazioni esterne devono avere chiavi idempotenti e stati di recovery; un esito ambiguo non autorizza un retry cieco.

## Scheduler di produzione

Gli orari autorevoli sono in `wrangler.jsonc` e il dispatch in `server/src/index.ts`:

| UTC | Bangkok | Operazione |
| --- | --- | --- |
| `2 * * * *` | ogni ora +7 | cache commerciali |
| `*/5 * * * *` | ogni 5 minuti | booking sync, guest messages, draft Waraporn pendenti |
| `*/10 21 * * *` | finestra 04:00–04:59 | stage Social IMAGE e recovery dello stesso stage |
| `*/10 22 * * *` | finestra 05:00–05:59 | stage Social CAPTION e recovery dello stesso stage |
| `*/10 23 * * *` | finestra 06:00–06:59 | stage Social PUBLISH e recovery dello stesso stage |
| `17 * * * *` | ogni ora +7 | commenti social |
| `17 20 * * *` | 03:17 | retention OCR/passaporti/allegati chat |
| `15 3 1 * *` | giorno 1, 10:15 | property sync mensile |

Le tre finestre Social restano indipendenti: ogni tick riprende soltanto lo stage eleggibile e non fonde IMAGE, CAPTION e PUBLISH in una singola esecuzione.

## Fonti eseguibili

- route client: `src/router/AppRouter.tsx`;
- navigazione e permessi: `src/config/navigation.tsx`, `src/services/auth.service.ts`;
- API e cron: `server/src/index.ts`;
- binding e trigger: `wrangler.jsonc`;
- schema: `server/migrations/`;
- vincoli regressivi: `server/tests/` e `scripts/`;
- aree hash-protette: `scripts/release-frozen-baseline.json`.

Le schede in `modules/` traducono queste fonti in contratti operativi leggibili.
