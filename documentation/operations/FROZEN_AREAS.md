# Aree congelate e guard di release

## Autorità

`scripts/release-frozen-baseline.json` è l'elenco eseguibile dei file protetti e del commit antenato richiesto. `scripts/verify-frozen-release-scope.mjs` controlla lineage, hash, sezioni sensibili e pattern di migrazione distruttivi. La baseline corrente richiede come antenato canonico `b98ce98076106ad449c81343bba7f381f32ce672`.

La release esegue il guard prima della build e del deploy. Un documento non può autorizzare un'eccezione al guard.

## Comportamenti protetti

- trasporto chat realtime, Durable Objects, unread e mark-read;
- push, badge, subscription e click delle notifiche;
- service worker, handshake build, cache e aggiornamento PWA;
- parti condivise del backend e migrazioni incluse nel manifest;
- configurazione Worker e binding inclusi nella baseline.

Il service worker contiene inoltre sezioni congelate esplicite per `push` e `notificationclick`; la gestione della subscription PWA ha vincoli sorgente dedicati.

## Moduli stabili ad alto rischio

Reception/OCR, Housekeeping/Water, Guest Messages/Waraporn, Social Automation e Accounting multi-allegato hanno forti test di contratto. Non tutti sono necessariamente protetti file-per-file dalla baseline hash: la distinzione conta. Un test verde non sostituisce il gate di prodotto per una modifica a un flusso stabile.

## Procedura per una modifica autorizzata

1. Riprodurre il bug e documentare l'impatto.
2. Ottenere un gate esplicito per l'area interessata.
3. Limitare la modifica al contratto necessario.
4. Aggiornare test e documentazione nello stesso cambiamento.
5. Eseguire `npm run release:guard` e i test mirati.
6. Se deve cambiare una baseline, aggiornare hash e lineage in modo intenzionale e revisionabile; mai aggirare il controllo.
7. Seguire il runbook di produzione completo.

## Verifiche

```powershell
npm run release:guard
npm run test:run
npm run typecheck
```

Non sostituire i file protetti con copie da branch o worktree storiche e non copiare directory intere per preparare una release.
