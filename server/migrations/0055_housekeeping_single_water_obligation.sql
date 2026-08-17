INSERT OR IGNORE INTO housekeeping_task_events (
  task_id,
  event_type,
  actor_user_id,
  actor_name,
  previous_status,
  new_status,
  reason,
  metadata_json,
  idempotency_key,
  created_at
)
WITH ranked AS (
  SELECT
    task_id,
    status,
    FIRST_VALUE(task_id) OVER (
      PARTITION BY unit_id
      ORDER BY operational_date, task_id
    ) AS canonical_task_id,
    ROW_NUMBER() OVER (
      PARTITION BY unit_id
      ORDER BY operational_date, task_id
    ) AS obligation_rank
  FROM housekeeping_tasks
  WHERE task_type = 'WATER_REFILL'
    AND status NOT IN ('COMPLETED', 'SKIPPED', 'CANCELLED')
)
SELECT
  task_id,
  'water_refill_superseded',
  'migration:0055',
  'System migration',
  status,
  'CANCELLED',
  'Duplicate active water refill superseded by the oldest room obligation.',
  json_object('source', 'water_obligation_reconciliation', 'canonicalTaskId', canonical_task_id),
  'migration:0055:water-obligation:' || task_id,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM ranked
WHERE obligation_rank > 1;

WITH ranked AS (
  SELECT
    task_id,
    ROW_NUMBER() OVER (
      PARTITION BY unit_id
      ORDER BY operational_date, task_id
    ) AS obligation_rank
  FROM housekeeping_tasks
  WHERE task_type = 'WATER_REFILL'
    AND status NOT IN ('COMPLETED', 'SKIPPED', 'CANCELLED')
)
UPDATE housekeeping_tasks
SET status = 'CANCELLED',
    cancelled_at = COALESCE(cancelled_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    cancellation_reason = 'Duplicate active water refill superseded by the oldest room obligation.',
    version = version + 1,
    updated_by = 'migration:0055',
    updated_by_name = 'System migration',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE task_id IN (SELECT task_id FROM ranked WHERE obligation_rank > 1);

CREATE UNIQUE INDEX IF NOT EXISTS idx_housekeeping_tasks_active_water_refill_unit
  ON housekeeping_tasks(unit_id)
  WHERE task_type = 'WATER_REFILL'
    AND status NOT IN ('COMPLETED', 'SKIPPED', 'CANCELLED');
