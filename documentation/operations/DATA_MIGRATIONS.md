# Dati, storage e migrazioni

## D1

Lo schema di produzione evolve esclusivamente tramite file SQL in `server/migrations/`. La sequenza attuale arriva a `0055_housekeeping_single_water_obligation.sql`.

Esistono prefissi numerici duplicati (`0043` e `0049`). Sono nomi già parte della storia applicata: non rinominarli, riordinarli o modificarli retroattivamente. Wrangler usa il nome completo del file per tracciare le migrazioni.

## Regole

- una nuova modifica schema crea una nuova migrazione append-only;
- ogni backfill deve essere idempotente o avere una precondizione verificabile;
- nessun comando remoto D1 durante diagnosi o audit senza gate esplicito;
- nessuna riscrittura massiva senza mapping e rollback documentati;
- prima del deploy confrontare migrazioni locali e remote;
- dopo l'applicazione eseguire smoke test read-only e controllare la provenance.

Il runbook di deploy applica le migrazioni remote approvate come parte della release. Il preflight può elencarle senza mutare dati.

## Aree schema recenti

- `0048`–`0053`: orchestrazione/recovery Social, OCR e housekeeping reconciliation;
- `0054`: allegati multipli Accounting e backfill legacy;
- `0055`: un solo obbligo water refill attivo per camera canonica.

Per il significato operativo usare le schede modulo e leggere sempre l'intestazione della migrazione prima di pianificare una modifica.

## R2

I bucket contengono allegati e asset con politiche diverse. Gli oggetti privati devono essere letti tramite endpoint autorizzati; non creare URL pubblici permanenti. Accounting conserva tutti gli allegati senza TTL automatico. OCR/passaporti e allegati chat seguono la retention gestita dal cron. Social rende pubblico un asset solo temporaneamente e lo elimina soltanto dopo conferma di pubblicazione su entrambe le piattaforme.

## Durable Objects

`CHAT_CONVERSATION_ROOM` e `CHAT_USER_INBOX_ROOM` mantengono coordinamento realtime della chat. Non sono un'alternativa allo schema D1 e non devono essere resettati durante una release ordinaria.

## Comandi operativi

I comandi Wrangler devono essere eseguiti soltanto tramite gli script del repository e con account/ambiente verificati. Non usare `wrangler d1 execute --remote` manualmente come scorciatoia. Vedere [Deployment runbook](DEPLOYMENT_RUNBOOK.md).
