# Housekeeping — invariant source contract

Questo file è mantenuto perché il source guard `server/tests/operational-baseline-source.test.ts` verifica due invarianti testuali. La documentazione operativa completa è in [modules/HOUSEKEEPING.md](modules/HOUSEKEEPING.md).

The single authoritative source for physical Housekeeping Status is `room_housekeeping_state`.

READY / NOT_READY must never be inferred from open, completed or missing Housekeeping tasks.

I task rappresentano lavoro operativo transitorio; lo stato fisico camera è persistito separatamente. Le baseline non devono creare booking, ospiti, passaporti o task sintetici per simulare la realtà.
