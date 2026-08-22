# Reception e Rooms

## Ownership delle superfici

`/reception` governa arrivi, partenze, check-in/check-out, dati ospite, passaporto/TM30 e depositi. `/rooms` governa la camera e il suo stato operativo. Le vecchie pagine housekeeping di dettaglio reindirizzano a Rooms.

Details e Contacts/Address Book usano sheet mobile opache a `100dvh`, con lock del body/root, scroll interno, safe area e chiusura stabile. Le card future check-in espongono Details e Address Book; non contengono Report Issue.

## Identità camera

La UI e le API usano `units.unit_id` e `units.unit_name`. Codici Beds24, `external_unit_id` o valori grezzi non devono fuoriuscire. Se il mapping manca, mostrare “Room not assigned” e registrare diagnostica; non indovinare.

## Booking e deposito

Nel booking il label visibile può essere “Country”, mentre il mapping Beds24 resta invariato. Passport/TM30 mantiene “Nationality”. Il deposito ha una sola fonte persistita condivisa fra details e checklist.

## OCR passaporto

Ogni acquisizione crea un attempt D1 con `client_request_id` stabile prima del POST e persiste `response_id`. Dopo restart il client riprende con GET; non invia un secondo POST. Un POST ambiguo va in revisione manuale.

MRZ completa e valida è primaria e autoverificata. Un visual chiaro con MRZ incompleta può essere confermato manualmente; il blocco resta solo per veri campi TM30 mancanti. “Add another” resetta l'acquisizione senza perdere il primo documento. Lo schema nasce dalla migrazione `0049_passport_scan_attempts.sql`.

## Sicurezza e test

Passaporti e dati TM30 sono sensibili e soggetti a retention. Non eseguire OCR reale durante audit o documentazione. I contratti UI/API sono coperti dai test Reception/OCR, source guard e security hardening.
