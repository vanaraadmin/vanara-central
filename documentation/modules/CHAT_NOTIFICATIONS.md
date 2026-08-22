# Chat interna e notifiche

## Chat interna

La chat team è separata da Guest Messages. Usa D1 per persistenza e Durable Objects `CHAT_CONVERSATION_ROOM` e `CHAT_USER_INBOX_ROOM` per delivery realtime, unread e inbox. WebSocket, reconnect/polling, mark-read, storico e composer formano un unico contratto.

`/chat` è un intent verso il pannello chat della home `/staff`; `/chat/:conversationId` resta disponibile per il dettaglio previsto dal router. Sticker e messaggi storici conservano `stickerId`; il catalogo delle collezioni è caricato lazy.

Gli stati anti-limbo usano timeout e “Try Again”. Lo storico più recente e la paginazione incrementale non devono essere sostituiti da fetch globali.

## Push e notifiche

Subscription VAPID, badge, payload, suono, service worker e `notificationclick` sono congelati. Un aggiornamento PWA non elimina una subscription valida. La route di landing può essere normalizzata, ma il trasporto non va modificato per esigenze di un singolo modulo.

Le notifiche Guest Messages usano un percorso dedicato e non devono essere innestate nel servizio della chat interna.

## Gate

File e sezioni critiche sono protetti da `scripts/release-frozen-baseline.json` e source guard. Modificare soltanto con bug riprodotto, gate esplicito, test mirati e release guard verde. Non resettare Durable Objects, subscription o unread per “riparare” un problema di UI.
