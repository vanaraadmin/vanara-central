# Modello dati operativo

## Principi

D1 è la fonte persistente centrale. Lo schema autorevole è la sequenza in `server/migrations/`; questo documento descrive domini e ownership, non sostituisce colonne, indici o vincoli SQL.

- `units.unit_id` è l'identità canonica della camera;
- booking esterni conservano identificativi Beds24 senza sostituire l'identità interna;
- eventi e audit append-only spiegano transizioni importanti;
- file binari stanno in R2, mentre D1 conserva metadati e ownership;
- Durable Objects coordinano il realtime chat, ma la persistenza applicativa resta esplicita.

## Domini principali

| Dominio | Tabelle rappresentative | Ownership |
| --- | --- | --- |
| Property e inventario | `properties`, `room_types`, `units`, `offers`, `offer_prices` | identità resort e nomi canonici |
| Availability e booking | `room_calendar`, `bookings`, `booking_*`, `unit_availability_cache` | Beds24 sync e stato commerciale |
| Reception | `reception_stays`, `reception_events`, `booking_passports`, `passport_ocr_attempts` | check-in/out, ospiti e TM30 |
| Housekeeping | `housekeeping_tasks`, eventi/checklist/counter, `room_housekeeping_state` | obblighi e stato camera derivato |
| Maintenance | `maintenance_tickets`, note, foto ed eventi | issue operative |
| Procurement | supplier, item, request e request item | richieste approvvigionamento |
| Guest Messages | `message_conversations`, `messages`, `message_drafts`, Waraporn jobs | messaggi ospite e draft AI |
| Chat interna | conversation, participant, message, mention, reaction | comunicazione team |
| Notifiche | `push_subscriptions`, `notification_events`, `notification_deliveries` | delivery e audit push |
| Social | `social_post_queue`, eventi, commenti e run | generazione e pubblicazione |
| Finanza | `ota_financial_records`, `manual_accounting_entries`, attachments | dashboard e Accounting Owner |
| Payroll | worker settings, events e records | calcolo e audit payroll |
| Sicurezza | users, views, module/action permissions, sessions, rate limits | autenticazione e autorizzazione |
| Sync | run, cursor, issue e webhook event | osservabilità e recovery integrazioni |

## Relazioni critiche

Booking e reception referenziano unità canoniche. Housekeeping deriva obblighi da booking/reception ma conserva la propria state machine e audit. Accounting attachments sono one-to-many e privati. Guest Messages e chat interna non condividono conversazioni o unread. Payroll non deriva automaticamente dai contratti legali.

## Evoluzione

Non modificare una migrazione applicata. Per una nuova relazione o correzione usare migrazione append-only, backfill verificabile, test e procedura in [Dati e migrazioni](operations/DATA_MIGRATIONS.md).
