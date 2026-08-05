ALTER TABLE payroll_worker_settings
ADD COLUMN meal_allowance_applicable INTEGER NOT NULL DEFAULT 1 CHECK (meal_allowance_applicable IN (0, 1));

ALTER TABLE payroll_records
ADD COLUMN meal_allowance_applicable INTEGER NOT NULL DEFAULT 1 CHECK (meal_allowance_applicable IN (0, 1));
