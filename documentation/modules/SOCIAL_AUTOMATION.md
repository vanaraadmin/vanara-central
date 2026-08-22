# Social Automation

## Pipeline giornaliera

La pipeline ha tre finestre cron indipendenti e processa al massimo un job al giorno:

1. **IMAGE — finestra 04:00–04:59 Bangkok, tick ogni 10 minuti**: da QUEUED avvia una sola generazione background, persiste `response_id`, poi usa solo GET fino a completamento; salva processed asset in R2 e chiude in IMAGE_READY.
2. **CAPTION — finestra 05:00–05:59, tick ogni 10 minuti**: prende solo IMAGE_READY, avvia una sola generazione background, poi usa GET; produce EN+TH e precisamente 7 hashtag per canale, quindi READY_TO_POST.
3. **PUBLISH — finestra 06:00–06:59, tick ogni 10 minuti**: prende solo READY_TO_POST e non chiama OpenAI; crea URL pubblico temporaneo, container Instagram una volta, attende FINISHED, pubblica IG e poi Facebook con checkpoint separati.

I tick successivi nella stessa finestra servono a riprendere lo stage corrispondente. Non eseguono in cascata lo stage successivo.

## Affidabilità

Ogni job ha lease, concorrenza e idempotenza. Il massimo è due POST OpenAI complessivi per job: uno image e uno caption. Un crash provatamente prima della chiamata può diventare RETRY_SAFE; un esito ambiguo dopo richiesta esterna diventa MANUAL_REVIEW. Nessun retry cieco.

DB, original, processed e esposizione pubblica vengono rimossi soltanto dopo conferma di successo sia Instagram sia Facebook. Un failure conserva gli asset per recovery.

## Configurazione corrente

Gli stage IMAGE/CAPTION usano come default `gpt-5.6-terra`; l'immagine ha fallback configurato `gpt-5.6`. I valori eseguibili risiedono nei servizi server, non in questo documento. I trigger sono `*/10 21`, `*/10 22` e `*/10 23` UTC.

## Gate

Social è stabile e ad alto rischio. Non eseguire POST/GET Meta, retry, publish o chiamate AI durante audit documentali. Migrazioni rilevanti: `0048`, `0049_social_image_background_response.sql`, `0052`, `0053`. I test `social-automation*` e `social-reliability*` proteggono state machine e recovery.
