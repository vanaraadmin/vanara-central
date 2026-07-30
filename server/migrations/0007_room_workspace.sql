-- Room Workspace: persistent operational notes owned by the Room entity.
-- Timeline events are composed from existing operational records; this table
-- stores only real notes that do not belong to another module.

CREATE TABLE room_notes (
    note_id INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_id INTEGER NOT NULL,
    author_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    author_role TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (unit_id)
        REFERENCES units(unit_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE INDEX idx_room_notes_unit_created
    ON room_notes(unit_id, created_at);

CREATE INDEX idx_room_notes_author
    ON room_notes(author_id);
