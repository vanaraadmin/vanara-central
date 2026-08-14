-- Reconcile active Housekeeping tasks against canonical booking/unit truth.
-- Bangkok operational dates are used because Housekeeping works on resort-local days.

INSERT OR IGNORE INTO housekeeping_task_events (
  task_id, event_type, actor_user_id, actor_name, previous_status, new_status,
  reason, metadata_json, idempotency_key, created_at
)
SELECT
  ht.task_id, 'cancel', NULL, 'System reconciliation', ht.status, 'CANCELLED',
  'Task no longer matches the canonical booking and room assignment.',
  json_object('source', 'migration_0050', 'reason', 'stale_booking_identity'),
  'migration:0050:stale-booking:' || ht.task_id,
  datetime('now')
FROM housekeeping_tasks ht
WHERE ht.status NOT IN ('COMPLETED', 'SKIPPED', 'CANCELLED')
  AND ht.source IN ('system', 'reception_release')
  AND ht.task_type IN ('TURNOVER', 'STANDARD_CLEANING', 'LINEN_CHANGE', 'WATER_REFILL')
  AND (
    NOT EXISTS (
      SELECT 1
      FROM bookings b
      LEFT JOIN reception_stays rs ON rs.beds24_booking_id = b.beds24_booking_id
      WHERE b.unit_id = ht.unit_id
        AND lower(trim(b.status)) IN ('confirmed', 'new')
        AND (ht.booking_id = b.booking_id OR (ht.booking_id IS NULL AND ht.stay_id = b.beds24_booking_id))
        AND (
          (ht.task_type = 'TURNOVER' AND b.departure_date = ht.operational_date)
          OR (ht.task_type IN ('STANDARD_CLEANING', 'LINEN_CHANGE')
            AND b.arrival_date <= ht.operational_date
            AND b.departure_date > ht.operational_date
            AND COALESCE(rs.guest_arrived, 0) = 1)
          OR (ht.task_type = 'WATER_REFILL'
            AND b.arrival_date < ht.operational_date
            AND b.departure_date > ht.operational_date
            AND COALESCE(rs.guest_arrived, 0) = 1)
        )
    )
    OR EXISTS (
      SELECT 1 FROM bookings newer
      WHERE ht.task_type IN ('TURNOVER', 'STANDARD_CLEANING', 'LINEN_CHANGE')
        AND newer.unit_id = ht.unit_id
        AND newer.arrival_date > ht.operational_date
        AND newer.arrival_date <= date('now', '+7 hours')
        AND lower(trim(newer.status)) IN ('confirmed', 'new')
    )
  );

UPDATE housekeeping_tasks
SET status = 'CANCELLED',
    cancelled_at = datetime('now'),
    cancellation_reason = 'Task no longer matches the canonical booking and room assignment.',
    version = version + 1,
    updated_at = datetime('now'),
    updated_by_name = 'System reconciliation'
WHERE status NOT IN ('COMPLETED', 'SKIPPED', 'CANCELLED')
  AND source IN ('system', 'reception_release')
  AND task_type IN ('TURNOVER', 'STANDARD_CLEANING', 'LINEN_CHANGE', 'WATER_REFILL')
  AND (
    NOT EXISTS (
      SELECT 1
      FROM bookings b
      LEFT JOIN reception_stays rs ON rs.beds24_booking_id = b.beds24_booking_id
      WHERE b.unit_id = housekeeping_tasks.unit_id
        AND lower(trim(b.status)) IN ('confirmed', 'new')
        AND (housekeeping_tasks.booking_id = b.booking_id OR (housekeeping_tasks.booking_id IS NULL AND housekeeping_tasks.stay_id = b.beds24_booking_id))
        AND (
          (housekeeping_tasks.task_type = 'TURNOVER' AND b.departure_date = housekeeping_tasks.operational_date)
          OR (housekeeping_tasks.task_type IN ('STANDARD_CLEANING', 'LINEN_CHANGE')
            AND b.arrival_date <= housekeeping_tasks.operational_date
            AND b.departure_date > housekeeping_tasks.operational_date
            AND COALESCE(rs.guest_arrived, 0) = 1)
          OR (housekeeping_tasks.task_type = 'WATER_REFILL'
            AND b.arrival_date < housekeeping_tasks.operational_date
            AND b.departure_date > housekeeping_tasks.operational_date
            AND COALESCE(rs.guest_arrived, 0) = 1)
        )
    )
    OR EXISTS (
      SELECT 1 FROM bookings newer
      WHERE housekeeping_tasks.task_type IN ('TURNOVER', 'STANDARD_CLEANING', 'LINEN_CHANGE')
        AND newer.unit_id = housekeeping_tasks.unit_id
        AND newer.arrival_date > housekeeping_tasks.operational_date
        AND newer.arrival_date <= date('now', '+7 hours')
        AND lower(trim(newer.status)) IN ('confirmed', 'new')
    )
  );

-- Keep one active turnover per canonical room/day after stale assignments are removed.
INSERT OR IGNORE INTO housekeeping_task_events (
  task_id, event_type, actor_user_id, actor_name, previous_status, new_status,
  reason, metadata_json, idempotency_key, created_at
)
SELECT
  task_id, 'cancel', NULL, 'System reconciliation', status, 'CANCELLED',
  'Duplicate active turnover for the same canonical room and operational day.',
  json_object('source', 'migration_0050', 'reason', 'duplicate_room_cycle'),
  'migration:0050:duplicate:' || task_id,
  datetime('now')
FROM (
  SELECT ht.*, ROW_NUMBER() OVER (PARTITION BY unit_id, operational_date ORDER BY task_id) AS task_rank
  FROM housekeeping_tasks ht
  WHERE task_type = 'TURNOVER'
    AND status NOT IN ('COMPLETED', 'SKIPPED', 'CANCELLED')
)
WHERE task_rank > 1;

UPDATE housekeeping_tasks
SET status = 'CANCELLED',
    cancelled_at = datetime('now'),
    cancellation_reason = 'Duplicate active turnover for the same canonical room and operational day.',
    version = version + 1,
    updated_at = datetime('now'),
    updated_by_name = 'System reconciliation'
WHERE task_id IN (
  SELECT task_id
  FROM (
    SELECT task_id, ROW_NUMBER() OVER (PARTITION BY unit_id, operational_date ORDER BY task_id) AS task_rank
    FROM housekeeping_tasks
    WHERE task_type = 'TURNOVER'
      AND status NOT IN ('COMPLETED', 'SKIPPED', 'CANCELLED')
  )
  WHERE task_rank > 1
);

-- Priority is derived only from a qualifying same-day incoming stay on the same canonical room.
INSERT OR IGNORE INTO housekeeping_task_events (
  task_id, event_type, actor_user_id, actor_name, previous_status, new_status,
  reason, metadata_json, idempotency_key, created_at
)
SELECT
  ht.task_id, 'priority_reconciled', NULL, 'System reconciliation', ht.status, ht.status,
  'Turnover priority reconciled against same-day incoming booking truth.',
  json_object(
    'source', 'migration_0050',
    'previousPriority', ht.priority,
    'priority', CASE WHEN EXISTS (
      SELECT 1 FROM bookings incoming
      WHERE incoming.unit_id = ht.unit_id
        AND incoming.arrival_date = ht.operational_date
        AND lower(trim(incoming.status)) IN ('confirmed', 'new')
        AND incoming.booking_id <> COALESCE(ht.booking_id, -1)
    ) THEN 'HIGH' ELSE 'NORMAL' END
  ),
  'migration:0050:priority:' || ht.task_id,
  datetime('now')
FROM housekeeping_tasks ht
WHERE ht.task_type = 'TURNOVER'
  AND ht.status NOT IN ('COMPLETED', 'SKIPPED', 'CANCELLED')
  AND ht.priority <> CASE WHEN EXISTS (
      SELECT 1 FROM bookings incoming
      WHERE incoming.unit_id = ht.unit_id
        AND incoming.arrival_date = ht.operational_date
        AND lower(trim(incoming.status)) IN ('confirmed', 'new')
        AND incoming.booking_id <> COALESCE(ht.booking_id, -1)
    ) THEN 'HIGH' ELSE 'NORMAL' END;

UPDATE housekeeping_tasks
SET priority = CASE WHEN EXISTS (
      SELECT 1
      FROM bookings incoming
      WHERE incoming.unit_id = housekeeping_tasks.unit_id
        AND incoming.arrival_date = housekeeping_tasks.operational_date
        AND lower(trim(incoming.status)) IN ('confirmed', 'new')
        AND incoming.booking_id <> COALESCE(housekeeping_tasks.booking_id, -1)
    ) THEN 'HIGH' ELSE 'NORMAL' END,
    version = version + 1,
    updated_at = datetime('now'),
    updated_by_name = 'System reconciliation'
WHERE task_type = 'TURNOVER'
  AND status NOT IN ('COMPLETED', 'SKIPPED', 'CANCELLED')
  AND priority <> CASE WHEN EXISTS (
      SELECT 1
      FROM bookings incoming
      WHERE incoming.unit_id = housekeeping_tasks.unit_id
        AND incoming.arrival_date = housekeeping_tasks.operational_date
        AND lower(trim(incoming.status)) IN ('confirmed', 'new')
        AND incoming.booking_id <> COALESCE(housekeeping_tasks.booking_id, -1)
    ) THEN 'HIGH' ELSE 'NORMAL' END;

DROP INDEX IF EXISTS idx_housekeeping_tasks_active_turnover;
CREATE UNIQUE INDEX idx_housekeeping_tasks_active_turnover
  ON housekeeping_tasks(unit_id, operational_date)
  WHERE task_type = 'TURNOVER'
    AND status NOT IN ('COMPLETED', 'SKIPPED', 'CANCELLED');
