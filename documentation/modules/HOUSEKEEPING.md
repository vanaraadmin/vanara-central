# Housekeeping

## Superficie canonica

`/housekeeping-v2` mostra la coda operativa; `/rooms` resta proprietario del dettaglio camera. Staff Home e Housekeeping devono leggere lo stesso modello di riepilogo e usare lo stesso `VanaraSummaryGrid` responsive 2×2.

## Identità e riconciliazione

Ogni task si lega alla camera canonica tramite `units.unit_id`. Booking move, swap o cancellazione sono eventi strutturali: la riconciliazione deve rimuovere o demuovere task stale in modo idempotente. La property sync non sovrascrive `units.unit_name`.

## Cleaning

- checkout senza incoming operativo nella stessa camera e nello stesso giorno: cleaning normale post-checkout;
- incoming operativo same-day: Priority Turnover;
- prima del rilascio camera, il task può restare `WAITING_FOR_RECEPTION`;
- move/cancel/swap deve ricalcolare la priorità senza duplicare obblighi.

Il copy visibile è “Check-out cleaning”; Thai: `ทำความสะอาดหลังเช็กเอาต์`. Non chiamare “Turnover” un checkout-only.

## Water refill

Può esistere al massimo un `WATER_REFILL` attivo per camera canonica. Alla scadenza lo stesso task diventa overdue: non nasce una catena giornaliera. “Mark delivered” completa l'obbligo, rimuove coda e contatore; il prossimo task nasce solo alla successiva vera scadenza. La cronologia completata resta conservata.

Copy Thai corrente: `เติมน้ำเลยวันแล้ว`, `ส่งแล้ว`, `เติมน้ำแล้ว`; data opzionale `เลยกำหนดตั้งแต่ {{date}}`.

## Fonti e vincoli

Le migrazioni recenti sono `0050`, `0051` e `0055`. I test di reconciliation policy, room source, checkout cleaning e singolo obbligo water sono il contratto eseguibile. Non cambiare la semantica per correggere un singolo booking anomalo: correggere prima il dato o mapping dimostrato errato.
