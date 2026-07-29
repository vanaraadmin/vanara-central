-- Procurement foundation: staff supply requests and owner review workflow.
-- Procurement is the internal name; staff UI remains supply-request focused.

CREATE TABLE procurement_suppliers (
    supplier_id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE procurement_items (
    item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name_en TEXT NOT NULL,
    name_th TEXT,
    category TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    default_unit TEXT,
    default_quantity TEXT,
    notes TEXT,
    preferred_supplier_id INTEGER,
    supplier_product_id TEXT,
    supplier_product_url TEXT,
    supplier_sku TEXT,
    last_price REAL CHECK (last_price IS NULL OR last_price >= 0),
    last_purchase_date TEXT,
    automation_enabled INTEGER NOT NULL DEFAULT 0 CHECK (automation_enabled IN (0, 1)),
    allow_substitution INTEGER NOT NULL DEFAULT 1 CHECK (allow_substitution IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (preferred_supplier_id)
        REFERENCES procurement_suppliers(supplier_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

CREATE TABLE procurement_requests (
    request_id INTEGER PRIMARY KEY AUTOINCREMENT,
    requested_by TEXT NOT NULL,
    requested_by_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'reviewed', 'ordered', 'received', 'rejected')),
    custom_item_text TEXT,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    reviewed_at TEXT,
    ordered_at TEXT,
    received_at TEXT,
    rejected_at TEXT,
    updated_by TEXT,
    updated_by_name TEXT
);

CREATE TABLE procurement_request_items (
    request_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,

    UNIQUE (request_id, item_id),

    FOREIGN KEY (request_id)
        REFERENCES procurement_requests(request_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    FOREIGN KEY (item_id)
        REFERENCES procurement_items(item_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE INDEX idx_procurement_items_active
    ON procurement_items(active, category, name_en);

CREATE INDEX idx_procurement_requests_status
    ON procurement_requests(status, created_at);

CREATE INDEX idx_procurement_requests_requested_by
    ON procurement_requests(requested_by, created_at);

CREATE INDEX idx_procurement_request_items_request
    ON procurement_request_items(request_id);

INSERT INTO procurement_items (code, name_en, name_th, category, active, default_unit, default_quantity, notes, created_at, updated_at)
VALUES
  ('laundry_detergent', 'Laundry detergent', NULL, 'Housekeeping', 1, NULL, NULL, NULL, datetime('now'), datetime('now')),
  ('fabric_softener', 'Fabric softener', NULL, 'Housekeeping', 1, NULL, NULL, NULL, datetime('now'), datetime('now')),
  ('guest_room_tea', 'Tea for guest rooms', NULL, 'Guest Room', 1, NULL, NULL, NULL, datetime('now'), datetime('now')),
  ('guest_room_water', 'Bottled water for guest rooms', NULL, 'Guest Room', 1, NULL, NULL, NULL, datetime('now'), datetime('now')),
  ('guest_room_nespresso', 'Nespresso capsules for guest rooms', NULL, 'Guest Room', 1, NULL, NULL, NULL, datetime('now'), datetime('now')),
  ('cat_food', 'Cat food', NULL, 'Animals', 1, NULL, NULL, NULL, datetime('now'), datetime('now')),
  ('trash_bags_large_black', 'Large black trash bags', NULL, 'Cleaning', 1, NULL, NULL, NULL, datetime('now'), datetime('now')),
  ('trash_bags_small_guest_room', 'Small trash bags for guest rooms', NULL, 'Guest Room', 1, NULL, NULL, NULL, datetime('now'), datetime('now'))
ON CONFLICT(code) DO UPDATE SET
  name_en = excluded.name_en,
  name_th = excluded.name_th,
  category = excluded.category,
  active = excluded.active,
  updated_at = datetime('now');
