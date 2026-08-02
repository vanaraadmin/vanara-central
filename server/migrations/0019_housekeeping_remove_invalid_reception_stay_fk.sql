PRAGMA foreign_keys = OFF;

CREATE TABLE housekeeping_tasks_next (
  task_id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_type TEXT NOT NULL CHECK (task_type IN (
    'TURNOVER',
    'STANDARD_CLEANING',
    'LINEN_CHANGE',
    'WATER_REFILL',
    'ON_DEMAND_CLEANING'
  )),
  unit_id INTEGER NOT NULL,
  booking_id INTEGER,
  stay_id INTEGER,
  operational_date TEXT NOT NULL,
  due_cycle_date TEXT,
  status TEXT NOT NULL CHECK (status IN (
    'WAITING_FOR_RECEPTION',
    'AVAILABLE_FOR_CLAIM',
    'CLAIMED',
    'IN_PROGRESS',
    'CHECKLIST_COMPLETE',
    'READY_FOR_INSPECTION',
    'READY',
    'COMPLETED',
    'BLOCKED',
    'SKIPPED',
    'CANCELLED'
  )),
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  blocking_reason TEXT,
  assigned_user_id TEXT,
  assigned_user_name TEXT,
  claimed_at TEXT,
  started_at TEXT,
  checklist_completed_at TEXT,
  ready_at TEXT,
  completed_at TEXT,
  skipped_at TEXT,
  cancelled_at TEXT,
  cancellation_reason TEXT,
  source TEXT NOT NULL DEFAULT 'system' CHECK (source IN (
    'system',
    'reception_release',
    'manual',
    'physical_sign',
    'guest_request',
    'maintenance',
    'migration'
  )),
  on_demand_source TEXT,
  idempotency_key TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_by_name TEXT,
  updated_by TEXT,
  updated_by_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE CASCADE,
  FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE SET NULL
);

INSERT INTO housekeeping_tasks_next (
  task_id, task_type, unit_id, booking_id, stay_id, operational_date, due_cycle_date,
  status, priority, blocking_reason, assigned_user_id, assigned_user_name,
  claimed_at, started_at, checklist_completed_at, ready_at, completed_at,
  skipped_at, cancelled_at, cancellation_reason, source, on_demand_source,
  idempotency_key, version, created_by, created_by_name, updated_by,
  updated_by_name, created_at, updated_at
)
SELECT
  task_id, task_type, unit_id, booking_id, stay_id, operational_date, due_cycle_date,
  status, priority, blocking_reason, assigned_user_id, assigned_user_name,
  claimed_at, started_at, checklist_completed_at, ready_at, completed_at,
  skipped_at, cancelled_at, cancellation_reason, source, on_demand_source,
  idempotency_key, version, created_by, created_by_name, updated_by,
  updated_by_name, created_at, updated_at
FROM housekeeping_tasks;

DROP TABLE housekeeping_tasks;
ALTER TABLE housekeeping_tasks_next RENAME TO housekeeping_tasks;

CREATE UNIQUE INDEX IF NOT EXISTS idx_housekeeping_tasks_idempotency_key
  ON housekeeping_tasks(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_housekeeping_tasks_active_turnover
  ON housekeeping_tasks(unit_id, booking_id, operational_date)
  WHERE task_type = 'TURNOVER'
    AND status NOT IN ('COMPLETED', 'SKIPPED', 'CANCELLED');

CREATE UNIQUE INDEX IF NOT EXISTS idx_housekeeping_tasks_active_standard_cleaning
  ON housekeeping_tasks(unit_id, stay_id, due_cycle_date)
  WHERE task_type = 'STANDARD_CLEANING'
    AND status NOT IN ('COMPLETED', 'SKIPPED', 'CANCELLED');

CREATE UNIQUE INDEX IF NOT EXISTS idx_housekeeping_tasks_active_linen_change
  ON housekeeping_tasks(unit_id, stay_id, due_cycle_date)
  WHERE task_type = 'LINEN_CHANGE'
    AND status NOT IN ('COMPLETED', 'SKIPPED', 'CANCELLED');

CREATE UNIQUE INDEX IF NOT EXISTS idx_housekeeping_tasks_water_refill_cycle
  ON housekeeping_tasks(unit_id, operational_date)
  WHERE task_type = 'WATER_REFILL';

CREATE UNIQUE INDEX IF NOT EXISTS idx_housekeeping_tasks_active_on_demand
  ON housekeeping_tasks(unit_id, on_demand_source, operational_date)
  WHERE task_type = 'ON_DEMAND_CLEANING'
    AND on_demand_source IS NOT NULL
    AND status NOT IN ('COMPLETED', 'SKIPPED', 'CANCELLED');

CREATE INDEX IF NOT EXISTS idx_housekeeping_tasks_work_date_status
  ON housekeeping_tasks(operational_date, status);

CREATE INDEX IF NOT EXISTS idx_housekeeping_tasks_unit_work_date
  ON housekeeping_tasks(unit_id, operational_date);

CREATE INDEX IF NOT EXISTS idx_housekeeping_tasks_booking
  ON housekeeping_tasks(booking_id);

CREATE INDEX IF NOT EXISTS idx_housekeeping_tasks_assignee_status
  ON housekeeping_tasks(assigned_user_id, status);

CREATE INDEX IF NOT EXISTS idx_housekeeping_tasks_type_date_status
  ON housekeeping_tasks(task_type, operational_date, status);

CREATE TABLE housekeeping_room_counters_next (
  counter_id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id INTEGER NOT NULL,
  active_booking_id INTEGER,
  active_stay_id INTEGER,
  last_standard_cleaning_at TEXT,
  last_standard_cleaning_task_id INTEGER,
  next_standard_cleaning_due_date TEXT,
  standard_cleaning_interval_days INTEGER NOT NULL DEFAULT 3,
  last_linen_change_at TEXT,
  last_linen_change_task_id INTEGER,
  next_linen_change_due_date TEXT,
  linen_interval_days INTEGER NOT NULL DEFAULT 3,
  linen_required_override INTEGER NOT NULL DEFAULT 0 CHECK (linen_required_override IN (0, 1)),
  linen_override_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE CASCADE,
  FOREIGN KEY (active_booking_id) REFERENCES bookings(booking_id) ON DELETE SET NULL,
  FOREIGN KEY (last_standard_cleaning_task_id) REFERENCES housekeeping_tasks(task_id) ON DELETE SET NULL,
  FOREIGN KEY (last_linen_change_task_id) REFERENCES housekeeping_tasks(task_id) ON DELETE SET NULL
);

INSERT INTO housekeeping_room_counters_next (
  counter_id, unit_id, active_booking_id, active_stay_id, last_standard_cleaning_at,
  last_standard_cleaning_task_id, next_standard_cleaning_due_date,
  standard_cleaning_interval_days, last_linen_change_at, last_linen_change_task_id,
  next_linen_change_due_date, linen_interval_days, linen_required_override,
  linen_override_reason, created_at, updated_at
)
SELECT
  counter_id, unit_id, active_booking_id, active_stay_id, last_standard_cleaning_at,
  last_standard_cleaning_task_id, next_standard_cleaning_due_date,
  standard_cleaning_interval_days, last_linen_change_at, last_linen_change_task_id,
  next_linen_change_due_date, linen_interval_days, linen_required_override,
  linen_override_reason, created_at, updated_at
FROM housekeeping_room_counters;

DROP TABLE housekeeping_room_counters;
ALTER TABLE housekeeping_room_counters_next RENAME TO housekeeping_room_counters;

CREATE UNIQUE INDEX IF NOT EXISTS idx_housekeeping_room_counters_unit
  ON housekeeping_room_counters(unit_id);

CREATE INDEX IF NOT EXISTS idx_housekeeping_room_counters_standard_due
  ON housekeeping_room_counters(next_standard_cleaning_due_date);

CREATE INDEX IF NOT EXISTS idx_housekeeping_room_counters_linen_due
  ON housekeeping_room_counters(next_linen_change_due_date);

PRAGMA foreign_keys = ON;
