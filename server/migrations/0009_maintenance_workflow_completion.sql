-- Maintenance workflow completion.
-- Evolves the existing maintenance foundation without touching Beds24 or remote D1.

PRAGMA foreign_keys = OFF;

CREATE TABLE maintenance_tickets_next (
    ticket_id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN (
        'Electrical',
        'Air Conditioning',
        'Water',
        'Furniture',
        'Bathroom',
        'Garden',
        'Cleaning Equipment',
        'Internet / Network',
        'Appliance',
        'Other'
    )),
    priority TEXT NOT NULL CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
    status TEXT NOT NULL CHECK (status IN ('Open', 'Assigned', 'In Progress', 'Waiting Parts', 'Resolved', 'Closed')),
    room_id INTEGER,
    accommodation_id INTEGER,
    location_area TEXT,
    assignment_type TEXT CHECK (assignment_type IN ('INTERNAL', 'EXTERNAL')),
    assigned_user_id TEXT,
    assigned_user_name TEXT,
    external_assignee_label TEXT,
    external_assignee_note TEXT,
    reported_by TEXT NOT NULL,
    reported_by_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    assigned_at TEXT,
    started_at TEXT,
    resolved_at TEXT,
    closed_at TEXT,
    resolved_by TEXT,
    resolved_by_name TEXT,
    closed_by TEXT,
    closed_by_name TEXT,
    out_of_service INTEGER NOT NULL DEFAULT 0 CHECK (out_of_service IN (0, 1)),
    waiting_reason TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',

    CHECK (
      (assignment_type IS NULL AND assigned_user_id IS NULL AND external_assignee_label IS NULL)
      OR (assignment_type = 'INTERNAL' AND assigned_user_id IS NOT NULL AND external_assignee_label IS NULL)
      OR (assignment_type = 'EXTERNAL' AND assigned_user_id IS NULL AND external_assignee_label IS NOT NULL)
    ),

    FOREIGN KEY (room_id)
        REFERENCES units(unit_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    FOREIGN KEY (accommodation_id)
        REFERENCES room_types(room_type_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

INSERT INTO maintenance_tickets_next (
    ticket_id,
    title,
    description,
    category,
    priority,
    status,
    room_id,
    accommodation_id,
    location_area,
    assignment_type,
    assigned_user_id,
    assigned_user_name,
    reported_by,
    reported_by_name,
    created_at,
    updated_at,
    assigned_at,
    resolved_at,
    metadata_json
)
SELECT
    ticket_id,
    title,
    description,
    CASE category
      WHEN 'Plumbing' THEN 'Water'
      WHEN 'Cleaning' THEN 'Cleaning Equipment'
      WHEN 'IT' THEN 'Internet / Network'
      WHEN 'Pool' THEN 'Other'
      WHEN 'Restaurant' THEN 'Other'
      ELSE category
    END,
    priority,
    status,
    room_id,
    accommodation_id,
    CASE WHEN room_id IS NULL THEN 'General Resort Area' ELSE NULL END,
    CASE WHEN assigned_user_id IS NOT NULL THEN 'INTERNAL' ELSE NULL END,
    assigned_user_id,
    assigned_user_name,
    reported_by,
    reported_by_name,
    created_at,
    updated_at,
    CASE WHEN assigned_user_id IS NOT NULL THEN updated_at ELSE NULL END,
    resolved_at,
    metadata_json
FROM maintenance_tickets;

DROP TABLE maintenance_tickets;
ALTER TABLE maintenance_tickets_next RENAME TO maintenance_tickets;

CREATE INDEX idx_maintenance_tickets_status
    ON maintenance_tickets(status);

CREATE INDEX idx_maintenance_tickets_priority
    ON maintenance_tickets(priority);

CREATE INDEX idx_maintenance_tickets_room
    ON maintenance_tickets(room_id);

CREATE INDEX idx_maintenance_tickets_updated
    ON maintenance_tickets(updated_at);

CREATE INDEX idx_maintenance_tickets_assigned_user
    ON maintenance_tickets(assigned_user_id, status);

CREATE INDEX idx_maintenance_tickets_location_area
    ON maintenance_tickets(location_area);

CREATE INDEX idx_maintenance_tickets_out_of_service
    ON maintenance_tickets(out_of_service, room_id);

PRAGMA foreign_keys = ON;
