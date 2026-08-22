# Financial Dashboard, Accounting e Payroll

## Route e accesso

`/staff` è la home Owner completa; `/dashboard` è il Financial Dashboard. `/accounting` e `/payroll` sono moduli Owner e non devono apparire allo Staff non autorizzato.

Owner transfer è escluso dalle metriche operative. OTA compensation è income normalizzato. Payroll, contributi e allowances devono derivare dalle registrazioni payroll, non da categorie contabili ricostruite alla cieca.

## Accounting

Accounting supporta manual entries, dashboard ed export accountant con categorie inglesi. La categoria visibile “Garden & Pool” è normalizzata a “Garden” senza riscrivere indiscriminatamente lo storico.

Ogni manual entry può avere più allegati JPG, PNG, WebP o PDF. Su mobile si possono aggiungere file e rimuoverli singolarmente prima del salvataggio. Una spesa richiede ricevuta salvo indisponibilità dichiarata esplicitamente; il contratto income resta invariato.

List, read e download sono Owner-authenticated; non esistono URL pubblici. L'export include tutti gli allegati. Non c'è TTL o cleanup automatico. La migrazione `0054_accounting_entry_attachments.sql` ha introdotto il modello one-to-many e il backfill legacy.

## Payroll

Payroll deve mostrare formule e importi THB chiari per base, ore/giorni extra, assenze, allowances, quota SSO dipendente e paid leave. L'integrazione futura con contratti staff dovrà consentire view/download mantenendo documenti legali e versioni sotto controllo separato.

Lo stato attuale del modulo non autorizza a importare automaticamente i file non versionati in `docs/staff-contracts/`, né a creare eventi payroll dai contratti senza una specifica funzionale e un gate dati.

## Vincoli

Non creare spese o ricevute di prova, non cancellare allegati e non modificare owner/attribuzione durante un audit. I test Accounting attachments, owner accounting e permissions sono il contratto eseguibile.
