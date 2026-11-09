-- External laundry workflow: every load is auditable from dispatch to return.
CREATE TABLE IF NOT EXISTS laundry_inventory_items (
  sku TEXT PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_th TEXT NOT NULL,
  purchased_total INTEGER NOT NULL DEFAULT 0 CHECK (purchased_total >= 0),
  display_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS laundry_loads (
  laundry_load_id INTEGER PRIMARY KEY AUTOINCREMENT,
  load_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('SENT', 'RECEIVED', 'DISCREPANCY')),
  sent_kg REAL NOT NULL CHECK (sent_kg > 0),
  received_kg REAL CHECK (received_kg >= 0),
  sent_note TEXT,
  received_note TEXT,
  sent_by_user_id TEXT NOT NULL,
  sent_by_name TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  received_by_user_id TEXT,
  received_by_name TEXT,
  received_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS laundry_load_items (
  laundry_load_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
  laundry_load_id INTEGER NOT NULL REFERENCES laundry_loads(laundry_load_id) ON DELETE CASCADE,
  sku TEXT NOT NULL REFERENCES laundry_inventory_items(sku),
  sent_quantity INTEGER NOT NULL DEFAULT 0 CHECK (sent_quantity >= 0),
  received_quantity INTEGER CHECK (received_quantity >= 0),
  UNIQUE(laundry_load_id, sku)
);

CREATE TABLE IF NOT EXISTS laundry_load_events (
  laundry_load_event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  laundry_load_id INTEGER NOT NULL REFERENCES laundry_loads(laundry_load_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('SENT', 'RECEIVED', 'DISCREPANCY')),
  actor_user_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  details_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_laundry_loads_status_sent_at ON laundry_loads(status, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_laundry_load_items_load ON laundry_load_items(laundry_load_id);

INSERT OR IGNORE INTO laundry_inventory_items (sku, name_en, name_th, purchased_total, display_order, created_at, updated_at) VALUES
  ('KING_DUVET_COVER', 'King-size duvet cover', 'ผ้าคลุมผ้านวมคิงไซซ์', 36, 10, datetime('now'), datetime('now')),
  ('SINGLE_DUVET_COVER', 'Single-bed duvet cover', 'ผ้าคลุมผ้านวมเตียงเดี่ยว', 10, 20, datetime('now'), datetime('now')),
  ('KING_FITTED_SHEET', 'King-size fitted sheet', 'ผ้ารัดมุมคิงไซซ์', 36, 30, datetime('now'), datetime('now')),
  ('SINGLE_FITTED_SHEET', 'Single fitted sheet', 'ผ้ารัดมุมเตียงเดี่ยว', 10, 40, datetime('now'), datetime('now')),
  ('PILLOWCASE', 'Pillowcase', 'ปลอกหมอน', 82, 50, datetime('now'), datetime('now')),
  ('KING_DUVET', 'King-size duvet', 'ผ้านวมคิงไซซ์', 25, 60, datetime('now'), datetime('now')),
  ('SINGLE_DUVET', 'Single duvet', 'ผ้านวมเตียงเดี่ยว', 8, 70, datetime('now'), datetime('now')),
  ('LARGE_TOWEL', 'Large towel', 'ผ้าเช็ดตัวผืนใหญ่', 0, 80, datetime('now'), datetime('now')),
  ('SMALL_TOWEL', 'Small towel', 'ผ้าเช็ดตัวผืนเล็ก', 0, 90, datetime('now'), datetime('now'));
