-- Separate physical Housekeeping room state from active Housekeeping work.
-- Corrects the production baseline where initial NOT_READY snapshot rows were
-- accidentally represented as STANDARD_CLEANING tasks.

CREATE TABLE IF NOT EXISTS room_housekeeping_state (
  unit_id INTEGER PRIMARY KEY,
  ready_state TEXT NOT NULL DEFAULT 'READY' CHECK (ready_state IN ('READY', 'NOT_READY')),
  reason TEXT,
  source TEXT NOT NULL DEFAULT 'system',
  updated_by TEXT,
  updated_by_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS room_housekeeping_state_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  actor_user_id TEXT,
  actor_name TEXT,
  previous_ready_state TEXT,
  new_ready_state TEXT,
  previous_reason TEXT,
  new_reason TEXT,
  source TEXT,
  idempotency_key TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_room_housekeeping_state_events_idempotency
  ON room_housekeeping_state_events(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_room_housekeeping_state_ready_state
  ON room_housekeeping_state(ready_state);

CREATE INDEX IF NOT EXISTS idx_room_housekeeping_state_events_unit
  ON room_housekeeping_state_events(unit_id, created_at);

INSERT OR IGNORE INTO room_housekeeping_state (
  unit_id, ready_state, reason, source, updated_by, updated_by_name, created_at, updated_at
)
SELECT
  unit_id,
  'READY',
  NULL,
  'real_resort_room_baseline',
  'system-baseline',
  'Product Owner Baseline',
  datetime('now'),
  datetime('now')
FROM units
WHERE active = 1;

INSERT OR IGNORE INTO room_housekeeping_state_events (
  unit_id, event_type, actor_user_id, actor_name,
  previous_ready_state, new_ready_state, previous_reason, new_reason,
  source, idempotency_key, created_at
)
SELECT
  u.unit_id,
  'baseline_applied',
  'system-baseline',
  'Product Owner Baseline',
  COALESCE(rhs.ready_state, 'READY'),
  CASE
    WHEN u.unit_name IN (
      'Bungalow 1', 'Bungalow 7', 'Bungalow 8', 'Bungalow 9', 'Bungalow 11', 'Bungalow 12',
      'Villa 10', 'Villa 13',
      'Tent 1', 'Tent 2', 'Tent 3', 'Tent 4', 'Tent 5', 'Tent 6',
      'Yurt 1', 'Yurt 2', 'Yurt 3', 'Yurt 4', 'Yurt 5', 'Yurt 6'
    ) THEN 'NOT_READY'
    ELSE 'READY'
  END,
  rhs.reason,
  CASE
    WHEN u.unit_name = 'Bungalow 7' THEN 'Maintenance blocked.'
    WHEN u.unit_name IN (
      'Bungalow 1', 'Bungalow 8', 'Bungalow 9', 'Bungalow 11', 'Bungalow 12',
      'Villa 10', 'Villa 13',
      'Tent 1', 'Tent 2', 'Tent 3', 'Tent 4', 'Tent 5', 'Tent 6',
      'Yurt 1', 'Yurt 2', 'Yurt 3', 'Yurt 4', 'Yurt 5', 'Yurt 6'
    ) THEN 'Product Owner physical baseline.'
    ELSE NULL
  END,
  'real_resort_room_baseline',
  'baseline:room-housekeeping-state:' || u.unit_id,
  datetime('now')
FROM units u
LEFT JOIN room_housekeeping_state rhs ON rhs.unit_id = u.unit_id
WHERE u.active = 1;

UPDATE room_housekeeping_state
SET ready_state = CASE
      WHEN unit_id IN (
        SELECT unit_id
        FROM units
        WHERE unit_name IN (
          'Bungalow 1', 'Bungalow 7', 'Bungalow 8', 'Bungalow 9', 'Bungalow 11', 'Bungalow 12',
          'Villa 10', 'Villa 13',
          'Tent 1', 'Tent 2', 'Tent 3', 'Tent 4', 'Tent 5', 'Tent 6',
          'Yurt 1', 'Yurt 2', 'Yurt 3', 'Yurt 4', 'Yurt 5', 'Yurt 6'
        )
      ) THEN 'NOT_READY'
      ELSE 'READY'
    END,
    reason = CASE
      WHEN unit_id IN (SELECT unit_id FROM units WHERE unit_name = 'Bungalow 7') THEN 'Maintenance blocked.'
      WHEN unit_id IN (
        SELECT unit_id
        FROM units
        WHERE unit_name IN (
          'Bungalow 1', 'Bungalow 8', 'Bungalow 9', 'Bungalow 11', 'Bungalow 12',
          'Villa 10', 'Villa 13',
          'Tent 1', 'Tent 2', 'Tent 3', 'Tent 4', 'Tent 5', 'Tent 6',
          'Yurt 1', 'Yurt 2', 'Yurt 3', 'Yurt 4', 'Yurt 5', 'Yurt 6'
        )
      ) THEN 'Product Owner physical baseline.'
      ELSE NULL
    END,
    source = 'real_resort_room_baseline',
    updated_by = 'system-baseline',
    updated_by_name = 'Product Owner Baseline',
    updated_at = datetime('now')
WHERE unit_id IN (SELECT unit_id FROM units WHERE active = 1);

INSERT OR IGNORE INTO housekeeping_task_events (
  task_id, event_type, actor_user_id, actor_name, previous_status, new_status,
  reason, metadata_json, idempotency_key, created_at
)
SELECT
  ht.task_id,
  'cancelled',
  'system-baseline',
  'Product Owner Baseline',
  ht.status,
  'CANCELLED',
  'Baseline physical room state is not Housekeeping work.',
  '{"source":"housekeeping_room_state_cleanup","reasonCode":"baseline_state_not_task"}',
  'baseline:cancel-room-state-task:' || ht.task_id,
  datetime('now')
FROM housekeeping_tasks ht
WHERE ht.task_type = 'STANDARD_CLEANING'
  AND ht.source = 'manual'
  AND ht.on_demand_source = 'ROOM_READY_OVERRIDE'
  AND ht.created_by = 'system-baseline'
  AND ht.idempotency_key LIKE 'room-ready-baseline:not-ready:%'
  AND ht.status NOT IN ('COMPLETED', 'SKIPPED', 'CANCELLED');

UPDATE housekeeping_tasks
SET status = 'CANCELLED',
    cancelled_at = datetime('now'),
    cancellation_reason = 'Baseline physical room state is not Housekeeping work.',
    updated_by = 'system-baseline',
    updated_by_name = 'Product Owner Baseline',
    updated_at = datetime('now'),
    version = version + 1
WHERE task_type = 'STANDARD_CLEANING'
  AND source = 'manual'
  AND on_demand_source = 'ROOM_READY_OVERRIDE'
  AND created_by = 'system-baseline'
  AND idempotency_key LIKE 'room-ready-baseline:not-ready:%'
  AND status NOT IN ('COMPLETED', 'SKIPPED', 'CANCELLED');
