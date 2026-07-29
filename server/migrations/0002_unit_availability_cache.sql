-- Availability cache projected from Beds24 room calendar data.
-- Beds24 remains the source of truth; this table is read cache for Vanara APIs.

CREATE TABLE unit_availability_cache (
    unit_availability_cache_id INTEGER PRIMARY KEY,
    property_id INTEGER NOT NULL,
    room_type_id INTEGER NOT NULL,
    unit_id INTEGER NOT NULL,
    stay_date TEXT NOT NULL,
    availability INTEGER CHECK (availability IS NULL OR availability IN (0, 1)),
    closed INTEGER NOT NULL DEFAULT 0 CHECK (closed IN (0, 1)),
    minimum_stay INTEGER CHECK (minimum_stay IS NULL OR minimum_stay >= 0),
    maximum_stay INTEGER CHECK (maximum_stay IS NULL OR maximum_stay >= 0),
    restrictions TEXT,
    raw_json TEXT NOT NULL,
    synced_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    UNIQUE (unit_id, stay_date),

    FOREIGN KEY (property_id)
        REFERENCES properties(property_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    FOREIGN KEY (room_type_id)
        REFERENCES room_types(room_type_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    FOREIGN KEY (unit_id)
        REFERENCES units(unit_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE INDEX idx_unit_availability_cache_date
    ON unit_availability_cache(stay_date);

CREATE INDEX idx_unit_availability_cache_property_date
    ON unit_availability_cache(property_id, stay_date);

CREATE INDEX idx_unit_availability_cache_room_date
    ON unit_availability_cache(room_type_id, stay_date);
