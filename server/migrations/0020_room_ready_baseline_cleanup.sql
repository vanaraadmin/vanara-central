-- Room readiness now comes from active V2 operational tasks.
-- Historical legacy housekeeping workflow rows were development/test state and
-- must not mark rooms Dirty/Cleaning in the production baseline.
DELETE FROM housekeeping;
