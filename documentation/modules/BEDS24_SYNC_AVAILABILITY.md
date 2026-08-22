# Beds24 sync, Availability e Prices

## Ownership

Beds24 è la fonte esterna di booking e disponibilità; Central traduce i dati nel proprio modello operativo. La sincronizzazione non è proprietaria dei nomi camere: `units.unit_id` e `units.unit_name` restano canonici.

Route client:

- `/availability-prices`: superficie canonica Availability & Prices;
- `/availability`: redirect di compatibilità;
- `/reception` e `/rooms`: consumatori operativi dei booking sincronizzati.

## Sincronizzazioni

Il cron ogni cinque minuti esegue il booking sync nel flusso che precede Guest Messages e draft Waraporn. Il property sync è mensile, giorno 1 alle 10:15 Bangkok. Stato e ultimo run possono essere letti dall'endpoint Owner `/sync/status`; i POST di sync sono mutanti e richiedono gate.

Move, swap e cancellazione devono essere trattati come eventi strutturali. La riconciliazione aggiorna Housekeeping e gli altri derivati senza duplicare task o indovinare la camera. Un mapping mancante produce diagnostica e “Room not assigned”.

## Prezzi e cache

Le cache commerciali vengono aggiornate ogni ora. Availability/Prices mantiene separati dati Beds24, override Central e presentazione. Le vecchie specifiche progettuali non sostituiscono servizi, endpoint e test correnti.

## Confini

Non forzare booking/property sync durante audit, non modificare direttamente l'account Beds24 e non cambiare nomi canonici per far combaciare codici esterni. Il sito pubblico e gli snippet della booking page sono documentati nel repository del sito, non qui.
