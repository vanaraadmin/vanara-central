-- Water Refill belongs only to full occupied stay days.
-- Cancel active Water tasks generated before the arrival-day guard existed.

INSERT OR IGNORE INTO housekeeping_task_events (
  task_id, event_type, actor_user_id, actor_name, previous_status, new_status,
  reason, metadata_json, idempotency_key, created_at
)
SELECT
  ht.task_id,
  'cancel',
  'system-water-rule',
  'Water Refill Rule',
  ht.status,
  'CANCELLED',
  'Water Refill is generated only after arrival day and before departure day.',
  '{"source":"water_refill_full_stay_days","reasonCode":"not_full_occupied_stay_day"}',
  'water-refill-full-stay-day:cancel:' || ht.task_id,
  datetime('now')
FROM housekeeping_tasks ht
LEFT JOIN bookings b ON b.booking_id = ht.booking_id
LEFT JOIN reception_stays rs ON rs.beds24_booking_id = b.beds24_booking_id
WHERE ht.task_type = 'WATER_REFILL'
  AND ht.status NOT IN ('COMPLETED', 'SKIPPED', 'CANCELLED')
  AND (
    b.booking_id IS NULL
    OR COALESCE(rs.guest_arrived, 0) <> 1
    OR ht.operational_date <= b.arrival_date
    OR ht.operational_date >= b.departure_date
  );

UPDATE housekeeping_tasks
SET status = 'CANCELLED',
    cancelled_at = datetime('now'),
    cancellation_reason = 'Water Refill is generated only after arrival day and before departure day.',
    updated_by = 'system-water-rule',
    updated_by_name = 'Water Refill Rule',
    updated_at = datetime('now'),
    version = version + 1
WHERE task_id IN (
  SELECT ht.task_id
  FROM housekeeping_tasks ht
  LEFT JOIN bookings b ON b.booking_id = ht.booking_id
  LEFT JOIN reception_stays rs ON rs.beds24_booking_id = b.beds24_booking_id
  WHERE ht.task_type = 'WATER_REFILL'
    AND ht.status NOT IN ('COMPLETED', 'SKIPPED', 'CANCELLED')
    AND (
      b.booking_id IS NULL
      OR COALESCE(rs.guest_arrived, 0) <> 1
      OR ht.operational_date <= b.arrival_date
      OR ht.operational_date >= b.departure_date
    )
);
