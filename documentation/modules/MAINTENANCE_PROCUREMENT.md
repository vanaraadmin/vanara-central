# Maintenance e Procurement

## Maintenance

Route operative: `/maintenance`, `/maintenance/new`, `/maintenance/:issueId`. Un issue ha target ROOM o OTHER, priorità Low/Normal/High e stato Open, In Progress, Waiting Parts o Completed.

L'identità ROOM usa sempre la camera canonica. Il lavoro può essere assegnato internamente o a un tecnico esterno secondo permessi e approvazioni operative. Le foto ammesse sono JPG, PNG e WebP fino a 10 MB; accesso e download restano autenticati.

Le notifiche maintenance devono atterrare sulla route canonica senza cambiare il trasporto condiviso. I test `maintenance-workspace-source` proteggono struttura e contratti principali.

## Procurement

`/procurement` gestisce richieste e approvvigionamenti operativi secondo i permessi correnti. Non va confuso con Accounting: Procurement descrive la necessità operativa; Accounting registra l'evento finanziario e i suoi allegati.

Qualsiasi automazione fra i due domini deve mantenere ownership, audit e autorizzazioni separate. Non creare spese di test in produzione e non usare una richiesta procurement come prova automatica di pagamento.

## Confini

- Maintenance non modifica direttamente mapping camera o booking.
- Procurement non sostituisce Payroll o Accounting.
- Allegati e note possono contenere dati operativi: non renderli pubblici e non copiarli nella documentazione.
