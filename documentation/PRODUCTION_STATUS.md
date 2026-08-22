# Produzione e provenance

Ultima verifica pubblica: 21 agosto 2026.

## Stato osservato

| Controllo | Risultato |
| --- | --- |
| `https://central.vanararetreat.com/health` | HTTP 200, Worker/API/D1 operativi |
| `https://central.vanararetreat.com/app-version.json` | HTTP 200 |
| Commit live dichiarato | `5b220e7f4429` |
| Commit locale completo | `5b220e7f44294c8c4e8cc605ba61f7c92254107c` |
| Build live | `5b220e7f4429-20260818010033335` |
| Confronto | live allineato a `HEAD` al momento della verifica |

Il payload pubblico di health è intenzionalmente minimo: `{"ok":true,"worker":"ok","api":"ok","d1":"ok"}`. Non deve esporre binding, nomi database, segreti o identità interne.

## Come funziona la provenance

La build genera `app-version.json` con build ID, commit e hash degli entry asset. Il service worker usa lo stesso build ID per versionare le cache. Gli script di release catturano il commit locale, il manifest compilato e il Version ID Cloudflare, poi confrontano la risposta pubblica.

`app-version.json`, `sw.js` e le risposte di versione devono essere serviti senza cache che impedisca il controllo. Gli output locali di provenance sono prove transitorie di una release, non una fonte da riutilizzare per una release successiva.

## Verifica sicura

Una verifica pubblica può leggere soltanto:

```powershell
Invoke-RestMethod https://central.vanararetreat.com/health
Invoke-RestMethod https://central.vanararetreat.com/app-version.json
git rev-parse HEAD
```

Questi controlli provano raggiungibilità, health minima e identità del build. Non provano da soli che ogni cron, integrazione esterna, subscription push o record operativo sia corretto.

Per stato D1, sincronizzazioni o moduli Owner serve una sessione autorizzata e una procedura read-only mirata. Non creare sessioni, forzare sync o invocare servizi a pagamento durante un audit.

## Aggiornamento di questo documento

Aggiornare data e valori soltanto dopo una nuova osservazione. Se `HEAD`, build pubblico e Version ID non coincidono, classificare lo stato come non allineato e non distribuire altro codice finché la provenienza non è spiegata.
