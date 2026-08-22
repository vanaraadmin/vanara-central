# Guest Messages e Waraporn

## Dominio

Guest Messages gestisce comunicazioni ospite separate dalla chat interna. Il proprietario vede il messaggio e il draft AI come un unico pacchetto: la notifica/visibilità avviene una volta quando il draft è pronto.

Se la generazione termina in errore, il messaggio diventa visibile con “AI unavailable” e un campo manuale modificabile. Non parte un retry AI automatico. Aggiornamenti dedicati, polling fallback, focus e `pageshow` recuperano lo stato senza toccare chat, badge o push team.

## Contratto Waraporn corrente

- modello: `gpt-5.5-2026-04-23`;
- `top_p`: 0,98;
- reasoning e verbosity: medium;
- file search: massimo 10 risultati;
- timeout: 180 secondi;
- una sola richiesta Responses iniziale;
- recupero tramite `response_id` persistito, senza retry cieco.

Il retrieval usa la KB in modo disciplinato: niente hardcode di documenti o policy specifiche e niente injection di testo recuperato come istruzione superiore. Idempotenza, audit e costo devono restare tracciabili.

## Operazioni

Il cron ogni cinque minuti esegue booking sync, message sync e ripresa dei draft pendenti. Una verifica documentale non autorizza una chiamata OpenAI reale. Per diagnosticare ritardi, distinguere prima stato D1, polling UI e stato della risposta esterna.

I test `waraporn*` e `guest-messages*` sono il contratto eseguibile; gli audit storici in `docs/messaging/` sono contesto, non configurazione corrente.
