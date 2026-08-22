# Principi tecnici di Vanara Central

## Fonti e ownership

1. Beds24 è la fonte esterna dei booking e della disponibilità commerciale.
2. D1 è la fonte operativa di Central; Beds24 non è nel percorso runtime delle letture UI.
3. `units.unit_id` e `units.unit_name` sono l'identità canonica interna delle camere.
4. La produzione osservabile, `HEAD`, config, codice, test e migrazioni precedono la documentazione.

## Responsabilità

- il backend possiede regole, autorizzazioni e integrazioni;
- il client presenta stato e intent senza duplicare business logic;
- sync importa e riconcilia senza sovrascrivere identità canoniche;
- AI assiste flussi definiti, non decide autorizzazioni o verità operative;
- ogni dominio conserva audit e idempotenza proporzionati al rischio.

## Sicurezza e affidabilità

- nessuna fiducia nella sola visibilità del client;
- dati privati e file passano da endpoint autenticati;
- nessun segreto o dato personale in Git, log o documentazione;
- mutazioni esterne ambigue richiedono recovery tramite ID persistito, non retry cieco;
- migrazioni D1 sono append-only e una release parte dal repository canonico completo.

## Evoluzione

Le aree congelate sono definite in modo eseguibile da `scripts/release-frozen-baseline.json` e dai source guard. Questo documento esprime principi, ma non può autorizzare eccezioni a test, guard o gate di produzione.

Una modifica deve essere minima, verificabile e accompagnata dall'aggiornamento della scheda modulo interessata. Worktree storiche, output temporanei e handoff non sono fonti di implementazione.
