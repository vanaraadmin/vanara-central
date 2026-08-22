# Vanara Central — indice tecnico

Stato verificato: 21 agosto 2026. Riferimento locale: commit `5b220e7f44294c8c4e8cc605ba61f7c92254107c`.

Questa cartella è l'indice autorevole della documentazione tecnica di Vanara Central. L'ordine delle fonti è:

1. produzione pubblicamente osservabile;
2. `HEAD`, configurazione, codice, test e migrazioni del repository canonico;
3. questa documentazione;
4. cronologia Git, solo come contesto.

Worktree storiche, output temporanei, vecchi handoff e documenti sostituiti non sono fonti di verità.

## Sistema

- [Architettura](ARCHITECTURE.md)
- [Stato produzione e provenance](PRODUCTION_STATUS.md)
- [Sviluppo e contratti API](DEVELOPMENT.md)
- [Modello dati](DATA_MODEL.md)
- [Principi di prodotto](00_PROJECT_PRINCIPLES.md)

## Operazioni

- [Release e deploy](operations/DEPLOYMENT_RUNBOOK.md)
- [Aree congelate](operations/FROZEN_AREAS.md)
- [Dati e migrazioni](operations/DATA_MIGRATIONS.md)
- [Sicurezza e privacy](operations/SECURITY_PRIVACY.md)

## Moduli

- [Navigazione, shell e PWA](modules/NAVIGATION_SHELL_PWA.md)
- [Reception e Rooms](modules/RECEPTION_ROOMS.md)
- [Housekeeping](modules/HOUSEKEEPING.md)
- [Maintenance e Procurement](modules/MAINTENANCE_PROCUREMENT.md)
- [Chat interna e notifiche](modules/CHAT_NOTIFICATIONS.md)
- [Guest Messages e Waraporn](modules/GUEST_MESSAGES_WARAPORN.md)
- [Social Automation](modules/SOCIAL_AUTOMATION.md)
- [Financial Dashboard, Accounting e Payroll](modules/FINANCE_PAYROLL.md)
- [Beds24 sync, availability e prices](modules/BEDS24_SYNC_AVAILABILITY.md)

## Confini

- `docs/staff-contracts/` contiene documenti legali e regole payroll: non è parte di questo riordino tecnico.
- Il sito pubblico e la configurazione Beds24 appartengono al repository dedicato.
- Segreti, identificativi personali, ricevute e contenuti privati non devono essere copiati nei documenti tecnici.

Quando codice e documento divergono, fermare l'operazione rischiosa, verificare la produzione e aggiornare il documento nello stesso cambiamento che ristabilisce l'allineamento.
