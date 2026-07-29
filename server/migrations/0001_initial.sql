PRAGMA foreign_keys = ON;

-- Vanara Central
-- Canonical initial schema aligned to the real Beds24 API payloads.
-- Beds24 remains the source of truth for property, inventory, pricing and bookings.

-- =========================================================
-- BEDS24 MASTER DATA
-- =========================================================

CREATE TABLE properties (
    property_id INTEGER PRIMARY KEY,
    beds24_property_id INTEGER NOT NULL UNIQUE,
    property_name TEXT NOT NULL,
    timezone TEXT,
    currency TEXT,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    raw_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE room_types (
    room_type_id INTEGER PRIMARY KEY,
    property_id INTEGER NOT NULL,
    beds24_room_id INTEGER NOT NULL UNIQUE,
    room_name TEXT NOT NULL,
    room_type_code TEXT,
    room_type_name TEXT,
    max_people INTEGER CHECK (max_people IS NULL OR max_people >= 1),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    raw_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (property_id)
        REFERENCES properties(property_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TABLE units (
    unit_id INTEGER PRIMARY KEY,
    room_type_id INTEGER NOT NULL,
    beds24_unit_id INTEGER NOT NULL,
    unit_name TEXT NOT NULL,
    unit_type TEXT CHECK (
        unit_type IS NULL OR
        unit_type IN ('bungalow', 'villa', 'yurt', 'other')
    ),
    position INTEGER,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    raw_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    UNIQUE (room_type_id, beds24_unit_id),

    FOREIGN KEY (room_type_id)
        REFERENCES room_types(room_type_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TABLE offers (
    offer_id INTEGER PRIMARY KEY,
    room_type_id INTEGER NOT NULL,
    beds24_offer_id INTEGER NOT NULL,
    offer_name TEXT,
    enabled_mode TEXT,
    position INTEGER,
    booking_type TEXT,
    minimum_stay_type TEXT,
    minimum_stay_days INTEGER,
    cancellation_type TEXT,
    cancellation_days_before_arrival INTEGER,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    raw_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    UNIQUE (room_type_id, beds24_offer_id),

    FOREIGN KEY (room_type_id)
        REFERENCES room_types(room_type_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

-- =========================================================
-- BEDS24 OPERATIONAL INVENTORY
-- =========================================================

-- Authoritative commercial result returned by:
-- GET /inventory/rooms/offers
--
-- numAdults is only a technical request parameter and is deliberately
-- not stored as a pricing dimension.
CREATE TABLE offer_prices (
    offer_price_id INTEGER PRIMARY KEY,
    room_type_id INTEGER NOT NULL,
    offer_id INTEGER,
    beds24_offer_id INTEGER NOT NULL,
    arrival_date TEXT NOT NULL,
    departure_date TEXT NOT NULL,
    price REAL CHECK (price IS NULL OR price >= 0),
    units_available INTEGER CHECK (
        units_available IS NULL OR units_available >= 0
    ),
    currency TEXT,
    raw_json TEXT NOT NULL,
    synced_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    UNIQUE (
        room_type_id,
        beds24_offer_id,
        arrival_date,
        departure_date
    ),

    FOREIGN KEY (room_type_id)
        REFERENCES room_types(room_type_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    FOREIGN KEY (offer_id)
        REFERENCES offers(offer_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

-- Availability and restrictions returned by:
-- GET /inventory/rooms/calendar
--
-- This table is linked to room_types because the Beds24 payload is
-- aggregated by roomId, not by physical unit.
--
-- calendar.price1 is never an authoritative price and is not normalized.
-- It remains available only inside raw_json.
CREATE TABLE room_calendar (
    room_calendar_id INTEGER PRIMARY KEY,
    room_type_id INTEGER NOT NULL,
    from_date TEXT NOT NULL,
    to_date TEXT NOT NULL,
    num_available INTEGER CHECK (
        num_available IS NULL OR num_available >= 0
    ),
    min_stay INTEGER CHECK (
        min_stay IS NULL OR min_stay >= 0
    ),
    max_stay INTEGER CHECK (
        max_stay IS NULL OR max_stay >= 0
    ),
    override_value TEXT,
    multiplier REAL,
    raw_json TEXT NOT NULL,
    synced_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    UNIQUE (room_type_id, from_date, to_date),

    FOREIGN KEY (room_type_id)
        REFERENCES room_types(room_type_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

-- =========================================================
-- BEDS24 BOOKINGS
-- =========================================================

CREATE TABLE bookings (
    booking_id INTEGER PRIMARY KEY,
    beds24_booking_id INTEGER NOT NULL UNIQUE,

    property_id INTEGER NOT NULL,
    room_type_id INTEGER NOT NULL,
    unit_id INTEGER,
    offer_id INTEGER,

    api_source_id INTEGER,
    api_source TEXT,
    channel TEXT,
    api_reference TEXT,
    reference TEXT,
    voucher TEXT,
    referer TEXT,
    referer_editable TEXT,

    master_beds24_booking_id INTEGER,
    room_quantity INTEGER,

    status TEXT NOT NULL,
    sub_status TEXT,
    status_code INTEGER,

    arrival_date TEXT NOT NULL,
    departure_date TEXT NOT NULL,
    arrival_time TEXT,

    adults INTEGER NOT NULL DEFAULT 0 CHECK (adults BETWEEN 0 AND 99),
    children INTEGER NOT NULL DEFAULT 0 CHECK (children BETWEEN 0 AND 99),

    guest_title TEXT,
    first_name TEXT,
    last_name TEXT,
    guest_name TEXT,

    email TEXT,
    phone TEXT,
    mobile TEXT,
    fax TEXT,
    company TEXT,

    address TEXT,
    city TEXT,
    state TEXT,
    postcode TEXT,
    country TEXT,
    country_code TEXT,
    language_code TEXT,

    comments TEXT,
    notes TEXT,
    guest_message TEXT,
    group_note TEXT,

    custom1 TEXT,
    custom2 TEXT,
    custom3 TEXT,
    custom4 TEXT,
    custom5 TEXT,
    custom6 TEXT,
    custom7 TEXT,
    custom8 TEXT,
    custom9 TEXT,
    custom10 TEXT,

    flag_color TEXT,
    flag_text TEXT,

    price REAL CHECK (price IS NULL OR price >= 0),
    deposit REAL CHECK (deposit IS NULL OR deposit >= 0),
    tax REAL CHECK (tax IS NULL OR tax >= 0),
    commission REAL CHECK (commission IS NULL OR commission >= 0),
    currency TEXT,

    rate_description TEXT,
    invoicee_id INTEGER,

    allow_channel_update TEXT,
    allow_auto_action TEXT,
    allow_review TEXT,

    cancellation_type TEXT,
    cancellation_days_before_arrival INTEGER,

    booking_time TEXT,
    modified_time TEXT,
    cancel_time TEXT,

    raw_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (property_id)
        REFERENCES properties(property_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    FOREIGN KEY (room_type_id)
        REFERENCES room_types(room_type_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    FOREIGN KEY (unit_id)
        REFERENCES units(unit_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    FOREIGN KEY (offer_id)
        REFERENCES offers(offer_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

CREATE TABLE booking_group_members (
    booking_group_member_id INTEGER PRIMARY KEY,
    master_beds24_booking_id INTEGER NOT NULL,
    member_beds24_booking_id INTEGER NOT NULL,
    is_master INTEGER NOT NULL DEFAULT 0 CHECK (is_master IN (0, 1)),
    raw_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    UNIQUE (
        master_beds24_booking_id,
        member_beds24_booking_id
    )
);

CREATE TABLE booking_guests (
    booking_guest_id INTEGER PRIMARY KEY,
    booking_id INTEGER NOT NULL,
    beds24_guest_id INTEGER,

    guest_title TEXT,
    first_name TEXT,
    last_name TEXT,

    email TEXT,
    phone TEXT,
    mobile TEXT,
    company TEXT,

    address TEXT,
    city TEXT,
    state TEXT,
    postcode TEXT,
    country TEXT,
    country_code TEXT,

    flag_text TEXT,
    flag_color TEXT,
    note TEXT,

    custom1 TEXT,
    custom2 TEXT,
    custom3 TEXT,
    custom4 TEXT,
    custom5 TEXT,
    custom6 TEXT,
    custom7 TEXT,
    custom8 TEXT,
    custom9 TEXT,
    custom10 TEXT,

    raw_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    UNIQUE (booking_id, beds24_guest_id),

    FOREIGN KEY (booking_id)
        REFERENCES bookings(booking_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE TABLE booking_info_items (
    booking_info_item_id INTEGER PRIMARY KEY,
    booking_id INTEGER NOT NULL,
    info_code TEXT NOT NULL,
    info_name TEXT,
    info_value TEXT,
    raw_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    UNIQUE (booking_id, info_code),

    FOREIGN KEY (booking_id)
        REFERENCES bookings(booking_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

-- =========================================================
-- VANARA OPERATIONAL DATA
-- =========================================================

CREATE TABLE booking_actions (
    booking_action_id INTEGER PRIMARY KEY,
    booking_id INTEGER NOT NULL,
    action_type TEXT,
    action_status TEXT,
    scheduled_at TEXT,
    executed_at TEXT,
    note TEXT,
    raw_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (booking_id)
        REFERENCES bookings(booking_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE TABLE housekeeping (
    housekeeping_id INTEGER PRIMARY KEY,
    unit_id INTEGER NOT NULL,
    booking_id INTEGER,
    work_date TEXT NOT NULL,
    status TEXT NOT NULL,
    assigned_to TEXT,
    started_at TEXT,
    completed_at TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (unit_id)
        REFERENCES units(unit_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    FOREIGN KEY (booking_id)
        REFERENCES bookings(booking_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

CREATE TABLE maintenance (
    maintenance_id INTEGER PRIMARY KEY,
    unit_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT,
    status TEXT,
    assigned_to TEXT,
    opened_at TEXT NOT NULL,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (unit_id)
        REFERENCES units(unit_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TABLE shopping_items (
    shopping_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL,
    item_name TEXT NOT NULL,
    quantity TEXT,
    notes TEXT,
    priority TEXT NOT NULL DEFAULT 'normal',
    status TEXT NOT NULL DEFAULT 'pending',
    created_by TEXT,
    created_at TEXT NOT NULL,
    completed_by TEXT,
    completed_at TEXT,

    FOREIGN KEY (property_id)
        REFERENCES properties(property_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

-- =========================================================
-- SYNC CONTROL
-- =========================================================

CREATE TABLE sync_runs (
    sync_run_id INTEGER PRIMARY KEY,
    sync_type TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL,
    records_read INTEGER NOT NULL DEFAULT 0,
    records_written INTEGER NOT NULL DEFAULT 0,
    records_failed INTEGER NOT NULL DEFAULT 0,
    error_message TEXT
);

CREATE TABLE sync_cursors (
    cursor_name TEXT PRIMARY KEY,
    cursor_value TEXT,
    updated_at TEXT NOT NULL
);

-- =========================================================
-- INDEXES
-- =========================================================

CREATE INDEX idx_room_types_property_id
    ON room_types(property_id);

CREATE INDEX idx_units_room_type_id
    ON units(room_type_id);

CREATE INDEX idx_offers_room_type_id
    ON offers(room_type_id);

CREATE INDEX idx_offer_prices_room_dates
    ON offer_prices(room_type_id, arrival_date, departure_date);

CREATE INDEX idx_room_calendar_room_dates
    ON room_calendar(room_type_id, from_date, to_date);

CREATE INDEX idx_bookings_arrival_date
    ON bookings(arrival_date);

CREATE INDEX idx_bookings_departure_date
    ON bookings(departure_date);

CREATE INDEX idx_bookings_status
    ON bookings(status);

CREATE INDEX idx_bookings_room_type_id
    ON bookings(room_type_id);

CREATE INDEX idx_bookings_unit_id
    ON bookings(unit_id);

CREATE INDEX idx_booking_guests_booking_id
    ON booking_guests(booking_id);

CREATE INDEX idx_booking_info_items_booking_id
    ON booking_info_items(booking_id);

CREATE INDEX idx_housekeeping_work_date
    ON housekeeping(work_date);

CREATE INDEX idx_housekeeping_status
    ON housekeeping(status);

CREATE INDEX idx_maintenance_status
    ON maintenance(status);

CREATE INDEX idx_sync_runs_type_started
    ON sync_runs(sync_type, started_at);