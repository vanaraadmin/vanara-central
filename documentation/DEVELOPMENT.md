# Sviluppo e contratti API

## Struttura

- `src/`: client React, router, pagine, componenti e servizi browser;
- `server/src/`: Worker, API, servizi, integrazioni e cron;
- `server/migrations/`: evoluzione append-only dello schema D1;
- `server/tests/`: test di comportamento e source guard;
- `scripts/`: release guard, provenance, preflight e deploy;
- `public/`: service worker e asset pubblici;
- `wrangler.jsonc`: binding, route e scheduler eseguibili.

## Ciclo locale

```powershell
npm ci
npm run dev
```

Prima di consegnare una modifica:

```powershell
npm run release:guard
npm run test:run
npm run typecheck
npm run lint
npm run build
```

Usare test mirati durante lo sviluppo, ma la suite richiesta dal runbook resta il controllo finale. Non aggiornare snapshot o guard solo per far passare una modifica non compresa.

## Convenzioni API

- route pubbliche minime e dichiarate esplicitamente;
- tutte le altre route verificano sessione, ruolo e capacità server-side;
- errori JSON hanno stato HTTP coerente e messaggio sicuro per il client;
- input esterni vengono validati prima di D1/R2/DO;
- mutation idempotenti quando possono essere ripetute da rete, cron o recovery;
- paginazione per storici e collezioni potenzialmente grandi;
- nessun URL R2 pubblico permanente per dati privati;
- log e audit non includono segreti o documenti personali.

Le route effettive sono in `server/src/index.ts`; non mantenere a mano un catalogo completo che diventerebbe subito obsoleto. Le schede modulo documentano soltanto i contratti operativi stabili.

## Cambiamenti schema e integrazioni

Ogni modifica D1 richiede una nuova migrazione in `server/migrations/` e test del backfill/recovery. Le API esterne devono persistere l'identificativo della richiesta prima di tentare recovery; un esito ambiguo non consente un nuovo POST alla cieca.

Chiamate OpenAI/Meta, sync Beds24 forzati e comandi D1 remote non sono parte del ciclo locale ordinario e richiedono gate esplicito.

## Documentazione

Aggiornare la scheda modulo quando cambia un contratto visibile o operativo. Aggiornare architettura/runbook quando cambiano binding, scheduler, provenance o procedura di release. Non duplicare dettagli già eseguibili in config o codice: collegare la fonte.
