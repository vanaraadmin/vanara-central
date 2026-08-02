-- Real resort operational baseline.
-- Establishes independent Operational Availability without touching Beds24 booking data.

CREATE TABLE IF NOT EXISTS room_operational_availability (
  unit_id INTEGER PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'OPERATING' CHECK (status IN ('OPERATING', 'NOT_OPERATING')),
  reason TEXT,
  seasonal_start TEXT,
  seasonal_end TEXT,
  updated_by TEXT,
  updated_by_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS room_operational_availability_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  actor_user_id TEXT,
  actor_name TEXT,
  previous_status TEXT,
  new_status TEXT,
  previous_reason TEXT,
  new_reason TEXT,
  previous_seasonal_start TEXT,
  new_seasonal_start TEXT,
  previous_seasonal_end TEXT,
  new_seasonal_end TEXT,
  idempotency_key TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_room_operational_availability_events_idempotency
  ON room_operational_availability_events(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_room_operational_availability_status
  ON room_operational_availability(status);

CREATE INDEX IF NOT EXISTS idx_room_operational_availability_events_unit
  ON room_operational_availability_events(unit_id, created_at);

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

DELETE FROM housekeeping;

INSERT OR IGNORE INTO room_operational_availability (
  unit_id, status, reason, seasonal_start, seasonal_end,
  updated_by, updated_by_name, created_at, updated_at
)
SELECT
  unit_id,
  'OPERATING',
  NULL,
  NULL,
  NULL,
  'system-baseline',
  'Product Owner Baseline',
  datetime('now'),
  datetime('now')
FROM units
WHERE active = 1;

INSERT OR IGNORE INTO room_operational_availability_events (
  unit_id, event_type, actor_user_id, actor_name,
  previous_status, new_status, previous_reason, new_reason,
  previous_seasonal_start, new_seasonal_start, previous_seasonal_end, new_seasonal_end,
  idempotency_key, created_at
)
SELECT
  u.unit_id,
  'baseline_applied',
  'system-baseline',
  'Product Owner Baseline',
  COALESCE(roa.status, 'OPERATING'),
  'OPERATING',
  roa.reason,
  NULL,
  roa.seasonal_start,
  NULL,
  roa.seasonal_end,
  NULL,
  'baseline:operating:' || u.unit_id,
  datetime('now')
FROM units u
LEFT JOIN room_operational_availability roa ON roa.unit_id = u.unit_id
WHERE u.unit_name IN (
  'Bungalow 1', 'Bungalow 2', 'Bungalow 3', 'Bungalow 4', 'Bungalow 5', 'Bungalow 6',
  'Bungalow 7', 'Bungalow 8', 'Bungalow 9', 'Bungalow 11', 'Bungalow 12',
  'Villa 10'
);

UPDATE room_operational_availability
SET status = 'OPERATING',
    reason = NULL,
    seasonal_start = NULL,
    seasonal_end = NULL,
    updated_by = 'system-baseline',
    updated_by_name = 'Product Owner Baseline',
    updated_at = datetime('now')
WHERE unit_id IN (
  SELECT unit_id
  FROM units
  WHERE unit_name IN (
    'Bungalow 1', 'Bungalow 2', 'Bungalow 3', 'Bungalow 4', 'Bungalow 5', 'Bungalow 6',
    'Bungalow 7', 'Bungalow 8', 'Bungalow 9', 'Bungalow 11', 'Bungalow 12',
    'Villa 10'
  )
);

INSERT OR IGNORE INTO room_operational_availability_events (
  unit_id, event_type, actor_user_id, actor_name,
  previous_status, new_status, previous_reason, new_reason,
  previous_seasonal_start, new_seasonal_start, previous_seasonal_end, new_seasonal_end,
  idempotency_key, created_at
)
SELECT
  u.unit_id,
  'baseline_applied',
  'system-baseline',
  'Product Owner Baseline',
  COALESCE(roa.status, 'OPERATING'),
  'NOT_OPERATING',
  roa.reason,
  'Seasonal Storage',
  roa.seasonal_start,
  '06-01',
  roa.seasonal_end,
  '11-20',
  'baseline:not-operating:villa13:' || u.unit_id,
  datetime('now')
FROM units u
LEFT JOIN room_operational_availability roa ON roa.unit_id = u.unit_id
WHERE u.unit_name = 'Villa 13';

UPDATE room_operational_availability
SET status = 'NOT_OPERATING',
    reason = 'Seasonal Storage',
    seasonal_start = '06-01',
    seasonal_end = '11-20',
    updated_by = 'system-baseline',
    updated_by_name = 'Product Owner Baseline',
    updated_at = datetime('now')
WHERE unit_id IN (
  SELECT unit_id
  FROM units
  WHERE unit_name = 'Villa 13'
);

INSERT OR IGNORE INTO room_operational_availability_events (
  unit_id, event_type, actor_user_id, actor_name,
  previous_status, new_status, previous_reason, new_reason,
  previous_seasonal_start, new_seasonal_start, previous_seasonal_end, new_seasonal_end,
  idempotency_key, created_at
)
SELECT
  u.unit_id,
  'baseline_applied',
  'system-baseline',
  'Product Owner Baseline',
  COALESCE(roa.status, 'OPERATING'),
  'NOT_OPERATING',
  roa.reason,
  'Season Closed',
  roa.seasonal_start,
  '06-01',
  roa.seasonal_end,
  '11-20',
  'baseline:not-operating:tent-season:' || u.unit_id,
  datetime('now')
FROM units u
LEFT JOIN room_operational_availability roa ON roa.unit_id = u.unit_id
WHERE u.unit_name IN (
  'Tent 1', 'Tent 2', 'Tent 3', 'Tent 4', 'Tent 5', 'Tent 6',
  'Yurt 1', 'Yurt 2', 'Yurt 3', 'Yurt 4', 'Yurt 5', 'Yurt 6'
);

UPDATE room_operational_availability
SET status = 'NOT_OPERATING',
    reason = 'Season Closed',
    seasonal_start = '06-01',
    seasonal_end = '11-20',
    updated_by = 'system-baseline',
    updated_by_name = 'Product Owner Baseline',
    updated_at = datetime('now')
WHERE unit_id IN (
  SELECT unit_id
  FROM units
  WHERE unit_name IN (
    'Tent 1', 'Tent 2', 'Tent 3', 'Tent 4', 'Tent 5', 'Tent 6',
    'Yurt 1', 'Yurt 2', 'Yurt 3', 'Yurt 4', 'Yurt 5', 'Yurt 6'
  )
);

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
  'Unit is not operating in the Product Owner baseline.',
  '{"source":"real_resort_room_baseline","reasonCode":"not_operating"}',
  'baseline:cancel-non-operating:' || ht.task_id,
  datetime('now')
FROM housekeeping_tasks ht
JOIN room_operational_availability roa ON roa.unit_id = ht.unit_id
WHERE roa.status = 'NOT_OPERATING'
  AND ht.status NOT IN ('COMPLETED', 'SKIPPED', 'CANCELLED')
  AND (ht.source IN ('system', 'reception_release') OR ht.task_type = 'WATER_REFILL');

UPDATE housekeeping_tasks
SET status = 'CANCELLED',
    cancelled_at = datetime('now'),
    cancellation_reason = 'Unit is not operating in the Product Owner baseline.',
    updated_by = 'system-baseline',
    updated_by_name = 'Product Owner Baseline',
    updated_at = datetime('now'),
    version = version + 1
WHERE unit_id IN (
    SELECT unit_id
    FROM room_operational_availability
    WHERE status = 'NOT_OPERATING'
  )
  AND status NOT IN ('COMPLETED', 'SKIPPED', 'CANCELLED')
  AND (source IN ('system', 'reception_release') OR task_type = 'WATER_REFILL');

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
  'Room is Ready in the Product Owner baseline.',
  '{"source":"real_resort_room_baseline","reasonCode":"baseline_ready"}',
  'baseline:cancel-ready-manual:' || ht.task_id,
  datetime('now')
FROM housekeeping_tasks ht
JOIN units u ON u.unit_id = ht.unit_id
WHERE u.unit_name IN ('Bungalow 2', 'Bungalow 3', 'Bungalow 4', 'Bungalow 5', 'Bungalow 6')
  AND ht.task_type = 'STANDARD_CLEANING'
  AND ht.source = 'manual'
  AND ht.on_demand_source = 'ROOM_READY_OVERRIDE'
  AND ht.status NOT IN ('COMPLETED', 'SKIPPED', 'CANCELLED');

UPDATE housekeeping_tasks
SET status = 'CANCELLED',
    cancelled_at = datetime('now'),
    cancellation_reason = 'Room is Ready in the Product Owner baseline.',
    updated_by = 'system-baseline',
    updated_by_name = 'Product Owner Baseline',
    updated_at = datetime('now'),
    version = version + 1
WHERE unit_id IN (
    SELECT unit_id
    FROM units
    WHERE unit_name IN ('Bungalow 2', 'Bungalow 3', 'Bungalow 4', 'Bungalow 5', 'Bungalow 6')
  )
  AND task_type = 'STANDARD_CLEANING'
  AND source = 'manual'
  AND on_demand_source = 'ROOM_READY_OVERRIDE'
  AND status NOT IN ('COMPLETED', 'SKIPPED', 'CANCELLED');

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

INSERT INTO maintenance_tickets (
  title, description, category, priority, status, room_id, accommodation_id, location_area,
  assignment_type, assigned_user_id, assigned_user_name, external_assignee_label, external_assignee_note,
  reported_by, reported_by_name, created_at, updated_at, assigned_at, out_of_service, metadata_json
)
SELECT
  'Replace Air Conditioning',
  'Air conditioner not working. Air-conditioning unit requires replacement.',
  'Air Conditioning',
  'High',
  'Open',
  u.unit_id,
  u.room_type_id,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  'system-baseline',
  'Product Owner Baseline',
  datetime('now'),
  datetime('now'),
  NULL,
  1,
  '{"source":"real_resort_room_baseline","outOfService":true}'
FROM units u
WHERE u.unit_name = 'Bungalow 7'
  AND NOT EXISTS (
    SELECT 1
    FROM maintenance_tickets mt
    WHERE mt.room_id = u.unit_id
      AND mt.title = 'Replace Air Conditioning'
      AND mt.status NOT IN ('Resolved', 'Closed')
  );

INSERT INTO maintenance_ticket_events (
  ticket_id, event_type, from_value, to_value, actor_id, actor_name, created_at
)
SELECT
  mt.ticket_id,
  'created',
  NULL,
  mt.status,
  'system-baseline',
  'Product Owner Baseline',
  mt.created_at
FROM maintenance_tickets mt
JOIN units u ON u.unit_id = mt.room_id
WHERE u.unit_name = 'Bungalow 7'
  AND mt.title = 'Replace Air Conditioning'
  AND mt.status NOT IN ('Resolved', 'Closed')
  AND NOT EXISTS (
    SELECT 1
    FROM maintenance_ticket_events e
    WHERE e.ticket_id = mt.ticket_id
      AND e.event_type = 'created'
  );

INSERT INTO maintenance_ticket_events (
  ticket_id, event_type, from_value, to_value, actor_id, actor_name, created_at
)
SELECT
  mt.ticket_id,
  'out_of_service_changed',
  'false',
  'true',
  'system-baseline',
  'Product Owner Baseline',
  mt.created_at
FROM maintenance_tickets mt
JOIN units u ON u.unit_id = mt.room_id
WHERE u.unit_name = 'Bungalow 7'
  AND mt.title = 'Replace Air Conditioning'
  AND mt.status NOT IN ('Resolved', 'Closed')
  AND mt.out_of_service = 1
  AND NOT EXISTS (
    SELECT 1
    FROM maintenance_ticket_events e
    WHERE e.ticket_id = mt.ticket_id
      AND e.event_type = 'out_of_service_changed'
  );
