# Operational data model — invariant source contract

Questo file è mantenuto perché il source guard `server/tests/operational-baseline-source.test.ts` verifica invarianti testuali. Il modello corrente completo è in [DATA_MODEL.md](DATA_MODEL.md).

The single authoritative source for READY / NOT_READY is `room_housekeeping_state`.

Tasks are transient operational work; they are not the physical condition of a room.

La disponibilità operativa è indipendente da booking e reception. Le baseline descrivono camere reali senza fabbricare ospiti o lavoro Housekeeping.
