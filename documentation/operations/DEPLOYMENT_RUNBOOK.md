# Runbook di release e deploy

## Scopo

Procedura canonica per distribuire Vanara Central sul dominio `central.vanararetreat.com`. Il Worker ha `workers_dev: false`: non usare URL `workers.dev` per preflight, smoke test o provenance.

Il deploy può mutare schema D1 e produzione. Richiede sempre gate esplicito, repository canonico pulito rispetto allo scope e accesso Cloudflare corretto.

## Prima del gate

Sono consentiti controlli locali e pubblici read-only:

```powershell
git status --short --branch
git rev-parse HEAD
npm run release:guard
npm run test:run
npm run typecheck
npm run lint
npm run build
Invoke-RestMethod https://central.vanararetreat.com/health
Invoke-RestMethod https://central.vanararetreat.com/app-version.json
```

Preservare ogni modifica o file non versionato non appartenente alla release. Non copiare worktree storiche, non fare merge/cherry-pick automatici e non distribuire da un branch che omette moduli Owner o migrazioni correnti.

## Preflight autorizzato

Eseguire lo script repository:

```powershell
npm run deploy:preflight
```

Il preflight verifica guard frozen/canonical lineage, build, autenticazione Cloudflare, binding, segreti richiesti, stato delle migrazioni remote, health e provenance. Deve controllare presenza dei segreti senza stamparne i valori.

Prima di continuare, annotare:

- commit completo candidato;
- build ID generato;
- migrazioni D1 pendenti e loro contenuto;
- esito test/typecheck/lint/build;
- eventuali differenze non appartenenti allo scope.

Un failure blocca la release; non disabilitare il controllo.

## Deploy di produzione

Con gate esplicito:

```powershell
npm run deploy:production
```

`scripts/deploy-production.ps1` esegue nuovamente guard, controlli qualità e build; cattura la provenance; applica le migrazioni D1 remote approvate; distribuisce il Worker; registra il Cloudflare Version ID; verifica health e versione pubblica. Non sostituire questa sequenza con comandi Wrangler manuali.

Se una migrazione prevista non è stata revisionata o il target Cloudflare non è quello atteso, interrompere prima della mutazione.

## Verifica post-deploy

Controlli pubblici obbligatori:

```powershell
Invoke-RestMethod https://central.vanararetreat.com/health
Invoke-RestMethod https://central.vanararetreat.com/app-version.json
```

Devono risultare:

- HTTP 200;
- health minima con Worker/API/D1 `ok`;
- commit live uguale al candidato;
- build ID e hash entry coerenti con il manifest compilato;
- un solo aggiornamento PWA senza loop.

Se disponibile una sessione Owner già autorizzata, lo smoke autenticato deve restare read-only e può verificare `/api/current-user`, `/api/staff/home`, `/sync/status` e le letture modulo previste dallo script. Non creare una nuova sessione o usare nuovi segreti per uno smoke documentale.

## Smoke funzionale proporzionato

Verificare soltanto i moduli interessati e i contratti condivisi a rischio:

- home Owner/Staff e route canoniche;
- Reception/Rooms e mapping camere;
- Housekeeping summary/task se la release li tocca;
- Accounting/Payroll solo con accesso Owner e senza creare righe;
- chat/push/PWA soltanto con test non mutanti, salvo gate specifico;
- Guest Messages, OCR, Social e Waraporn senza chiamate esterne a pagamento.

Non forzare Beds24 sync, non pubblicare sui social e non eseguire OCR/OpenAI come smoke ordinario.

## Failure e recovery

1. Fermare nuove distribuzioni.
2. Conservare commit, build ID, Version ID, output preflight e lista migrazioni.
3. Stabilire se il failure è client, Worker, schema, binding o integrazione esterna.
4. Non fare rollback del database alla cieca: le migrazioni sono append-only.
5. Preparare un fix forward minimo dal repository canonico completo.
6. Ripetere l'intero preflight e ottenere il gate per un nuovo deploy.

Un rollback/cherry-pick da branch vecchio può rimuovere moduli già live e non è una procedura accettabile.

## Evidenze da registrare

- commit candidato e live;
- build ID e hash entry;
- Cloudflare Version ID;
- migrazioni applicate;
- esiti preflight, deploy e smoke;
- data/ora Bangkok e operatore;
- anomalie e decisione di recovery.

Non inserire token, password, dati personali, ricevute o contenuti ospite nelle evidenze.
