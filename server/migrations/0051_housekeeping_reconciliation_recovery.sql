-- Repair only active work that migration 0050 cancelled before its room cycle had actually been superseded.
-- The resort operational day is Asia/Bangkok (UTC+7, no DST).

INSERT OR IGNORE INTO housekeeping_task_events (
  task_id, event_type, actor_user_id, actor_name, previous_status, new_status,
  reason, metadata_json, idempotency_key, created_at
)
SELECT
  ht.task_id,
  'reconciliation_restore',
  NULL,
  'System reconciliation',
  'CANCELLED',
  CASE
    WHEN ht.task_type = 'TURNOVER' AND COALESCE(rs.room_released, 0) = 0 THEN 'WAITING_FOR_RECEPTION'
    ELSE 'AVAILABLE_FOR_CLAIM'
  END,
  'Migration 0050 cancelled a task before its canonical room cycle was superseded.',
  json_object('source', 'migration_0051', 'reason', 'premature_superseding_room_cycle'),
  'migration:0051:restore:' || ht.task_id,
  datetime('now')
FROM housekeeping_tasks ht
JOIN bookings b
  ON b.unit_id = ht.unit_id
 AND (ht.booking_id = b.booking_id OR (ht.booking_id IS NULL AND ht.stay_id = b.beds24_booking_id))
JOIN units u ON u.unit_id = ht.unit_id AND u.active = 1
LEFT JOIN reception_stays rs ON rs.beds24_booking_id = b.beds24_booking_id
WHERE ht.status = 'CANCELLED'
  AND ht.source IN ('system', 'reception_release')
  AND lower(trim(b.status)) IN ('confirmed', 'new')
  AND EXISTS (
    SELECT 1 FROM housekeeping_task_events bad
    WHERE bad.task_id = ht.task_id
      AND bad.idempotency_key = 'migration:0050:stale-booking:' || ht.task_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM housekeeping_tasks active
    WHERE active.task_id <> ht.task_id
      AND active.task_type = ht.task_type
      AND active.unit_id = ht.unit_id
      AND active.operational_date = ht.operational_date
      AND active.status NOT IN ('COMPLETED', 'SKIPPED', 'CANCELLED')
  )
  AND (
    (
      ht.task_type = 'TURNOVER'
      AND b.departure_date = ht.operational_date
      AND NOT EXISTS (
        SELECT 1 FROM bookings newer
        WHERE newer.unit_id = ht.unit_id
          AND newer.arrival_date > ht.operational_date
          AND newer.arrival_date <= date('now', '+7 hours')
          AND lower(trim(newer.status)) IN ('confirmed', 'new')
      )
    )
    OR (
      ht.task_type = 'WATER_REFILL'
      AND b.arrival_date < ht.operational_date
      AND b.departure_date > date('now', '+7 hours')
      AND COALESCE(rs.guest_arrived, 0) = 1
      AND COALESCE(rs.guest_left, 0) = 0
    )
  );

UPDATE housekeeping_tasks
SET status = CASE
      WHEN task_type = 'TURNOVER' AND EXISTS (
        SELECT 1
        FROM bookings b
        LEFT JOIN reception_stays rs ON rs.beds24_booking_id = b.beds24_booking_id
        WHERE b.unit_id = housekeeping_tasks.unit_id
          AND (housekeeping_tasks.booking_id = b.booking_id OR (housekeeping_tasks.booking_id IS NULL AND housekeeping_tasks.stay_id = b.beds24_booking_id))
          AND COALESCE(rs.room_released, 0) = 0
      ) THEN 'WAITING_FOR_RECEPTION'
      ELSE 'AVAILABLE_FOR_CLAIM'
    END,
    priority = CASE WHEN task_type = 'TURNOVER' AND EXISTS (
      SELECT 1 FROM bookings incoming
      WHERE incoming.unit_id = housekeeping_tasks.unit_id
        AND incoming.arrival_date = housekeeping_tasks.operational_date
        AND lower(trim(incoming.status)) IN ('confirmed', 'new')
        AND incoming.booking_id <> COALESCE(housekeeping_tasks.booking_id, -1)
    ) THEN 'HIGH' ELSE 'NORMAL' END,
    cancelled_at = NULL,
    cancellation_reason = NULL,
    version = version + 1,
    updated_at = datetime('now'),
    updated_by = NULL,
    updated_by_name = 'System reconciliation'
WHERE status = 'CANCELLED'
  AND EXISTS (
    SELECT 1 FROM housekeeping_task_events restored
    WHERE restored.task_id = housekeeping_tasks.task_id
      AND restored.idempotency_key = 'migration:0051:restore:' || housekeeping_tasks.task_id
  );
