# Sicurezza e privacy

## Controlli di accesso

Ogni endpoint non pubblico deve verificare la sessione sul server. La visibilità del client non è un controllo di sicurezza. Ruoli e permessi sono definiti dal servizio current-user e applicati dalle API; le funzioni finanziarie e gli export sensibili sono Owner-only.

Sono pubblici soltanto gli endpoint necessari, tra cui health minima e asset applicativi. Il test `server/tests/security-hardening-source.test.ts` impedisce di arricchire health con dettagli interni. Non esiste registrazione pubblica; il bootstrap Owner resta disabilitato nel normale esercizio.

## Segreti

Segreti Cloudflare, token Beds24/Meta/OpenAI, chiavi VAPID e credenziali non devono comparire in Git, log, screenshot, documentazione o output di audit. Il preflight verifica la presenza dei binding senza stamparne i valori.

## Dati sensibili

- passaporti, OCR e dati TM30: accesso limitato e retention programmata;
- allegati Accounting e ricevute: privati, senza URL pubblico e con autorizzazione Owner;
- allegati chat: accesso autenticato e retention dedicata;
- contatti ospiti e Guest Messages: separati dalla chat interna;
- contratti staff e documenti ID: dominio legale separato, escluso dalla documentazione tecnica.

Non copiare nei documenti identificativi personali, contenuti di ricevute o payload reali. Usare esempi sintetici anonimi.

## Integrazioni AI ed esterne

Una verifica documentale non autorizza chiamate OpenAI/Meta, pubblicazioni, sync forzati o altre operazioni a costo o effetto esterno. I flussi OCR, Waraporn e Social devono mantenere idempotenza e audit. Dopo una richiesta esterna con esito ambiguo, recuperare mediante l'identificativo persistito; non ripetere alla cieca.

L'analisi di commenti, luoghi o contenuti personali per inferire attività o relazioni richiede fonte lecita, autorizzazione o consenso e perimetro esplicito. Central non deve essere usata per sorveglianza privata.

## Verifiche sorgente

I test in `server/tests/` proteggono sessioni, ruoli, health, route, storage privato e contratti dei moduli. Prima di una release eseguire guard, suite, typecheck e lint tramite il runbook. Una violazione di privacy o un accesso anomalo blocca la release e richiede analisi mirata, non una correzione direttamente sui dati live.
