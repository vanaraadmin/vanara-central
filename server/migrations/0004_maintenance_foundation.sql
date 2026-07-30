-- Maintenance foundation: production-oriented ticket lifecycle.
-- Keeps the legacy maintenance table intact and introduces extensible operational tickets.

CREATE TABLE maintenance_tickets (
    ticket_id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN (
        'Electrical',
        'Plumbing',
        'Cleaning',
        'Furniture',
        'Air Conditioning',
        'Garden',
        'Pool',
        'Restaurant',
        'IT',
        'Other'
    )),
    priority TEXT NOT NULL CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
    status TEXT NOT NULL CHECK (status IN ('Open', 'Assigned', 'In Progress', 'Waiting Parts', 'Resolved', 'Closed')),
    room_id INTEGER,
    accommodation_id INTEGER,
    assigned_user_id TEXT,
    assigned_user_name TEXT,
    reported_by TEXT NOT NULL,
    reported_by_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    resolved_at TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',

    FOREIGN KEY (room_id)
        REFERENCES units(unit_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    FOREIGN KEY (accommodation_id)
        REFERENCES room_types(room_type_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

CREATE TABLE maintenance_ticket_notes (
    note_id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    author_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    author_role TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,

    FOREIGN KEY (ticket_id)
        REFERENCES maintenance_tickets(ticket_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE TABLE maintenance_ticket_photos (
    photo_id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    storage_status TEXT NOT NULL DEFAULT 'local-reference' CHECK (storage_status IN ('local-reference', 'uploaded')),
    local_reference TEXT,
    url TEXT,
    caption TEXT,
    added_by TEXT NOT NULL,
    added_by_name TEXT NOT NULL,
    created_at TEXT NOT NULL,

    FOREIGN KEY (ticket_id)
        REFERENCES maintenance_tickets(ticket_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE TABLE maintenance_ticket_events (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    from_value TEXT,
    to_value TEXT,
    actor_id TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    created_at TEXT NOT NULL,

    FOREIGN KEY (ticket_id)
        REFERENCES maintenance_tickets(ticket_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE INDEX idx_maintenance_tickets_status
    ON maintenance_tickets(status);

CREATE INDEX idx_maintenance_tickets_priority
    ON maintenance_tickets(priority);

CREATE INDEX idx_maintenance_tickets_room
    ON maintenance_tickets(room_id);

CREATE INDEX idx_maintenance_tickets_updated
    ON maintenance_tickets(updated_at);

CREATE INDEX idx_maintenance_ticket_notes_ticket
    ON maintenance_ticket_notes(ticket_id, created_at);

CREATE INDEX idx_maintenance_ticket_photos_ticket
    ON maintenance_ticket_photos(ticket_id, created_at);

CREATE INDEX idx_maintenance_ticket_events_ticket
    ON maintenance_ticket_events(ticket_id, created_at);
