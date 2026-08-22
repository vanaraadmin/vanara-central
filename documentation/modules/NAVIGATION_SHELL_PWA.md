# Navigazione, shell e PWA

## Route canoniche

- `/staff`: home canonica per Owner e Staff; il contenuto dipende da `isOwnerHome`.
- `/dashboard`: Financial Dashboard Owner, non home generale.
- `/accounting`, `/payroll`: moduli finanziari Owner.
- `/reception`, `/rooms`, `/housekeeping-v2`, `/maintenance`: workspace operativi.
- `/chat`: solo intent; inoltra a `/staff` con `openTeamChat=true`, consumato una volta dal chat floating.
- `/movements`: compatibilità legacy, non destinazione canonica.

Profile è un pannello/modalità UI; non va trattato come route operativa stabile. Le route effettive sono definite in `src/router/AppRouter.tsx`.

## Shell

`OperationsShell` è l'unica autorità per `background_room.png` e il veil globale. I workspace non devono montare sfondi o overlay globali concorrenti. `WorkspaceShell` gestisce struttura del contenuto, non il background della pagina.

## Landing delle notifiche

Le destinazioni devono normalizzarsi sulle route canoniche:

- check-in/check-out → `/reception`;
- maintenance → `/maintenance` o dettaglio valido;
- booking → `/staff` e Booking Pulse;
- chat interna → intent `/chat`, poi `/staff`.

La normalizzazione della route non autorizza modifiche a trasporto, payload, suono, badge o service worker.

## Coerenza PWA

Vite genera build ID e hash entry in `app-version.json`; `sw.js` usa lo stesso build. Il client controlla aggiornamenti al boot, `pageshow` e resume. Le cache sono per build, le vecchie vengono ripulite, la navigazione HTML è network-first e le API network-only. Il reload è singolo e protetto contro loop.

`sw.js` e `app-version.json` devono essere `no-store`; la registrazione usa `updateViaCache: none`. Una subscription push valida non viene cancellata durante l'aggiornamento.

## Vincoli

Chat/push/PWA sono aree congelate dal manifest di release. Verifiche principali: test PWA versioning, user-area, workspace background, UI system e release guard.
