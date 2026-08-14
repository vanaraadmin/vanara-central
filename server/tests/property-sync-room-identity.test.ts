import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  PROPERTY_UNIT_UPSERT_SQL,
  propertySyncCanonicalUnitName,
} from "../src/services/property-sync.service.ts";

function createDatabase(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE room_types (
      room_type_id INTEGER PRIMARY KEY,
      beds24_room_id INTEGER NOT NULL UNIQUE
    );
    CREATE TABLE units (
      unit_id INTEGER PRIMARY KEY,
      room_type_id INTEGER NOT NULL,
      beds24_unit_id INTEGER NOT NULL,
      unit_name TEXT NOT NULL,
      unit_type TEXT NOT NULL,
      position INTEGER,
      active INTEGER NOT NULL,
      raw_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(room_type_id, beds24_unit_id)
    );
    INSERT INTO room_types (room_type_id, beds24_room_id) VALUES (7, 700);
  `);
  return db;
}

function syncUnit(db: DatabaseSync, beds24UnitId: number, externalName: string, position: number): void {
  const timestamp = "2026-08-14T05:00:00.000Z";
  db.prepare(PROPERTY_UNIT_UPSERT_SQL).run(
    700,
    beds24UnitId,
    propertySyncCanonicalUnitName(beds24UnitId, externalName),
    "bungalow",
    position,
    JSON.stringify({ id: beds24UnitId, name: externalName }),
    timestamp,
    timestamp,
  );
}

test("Beds property sync preserves an existing canonical room name when Beds sends E2", () => {
  const db = createDatabase();
  db.prepare(`
    INSERT INTO units (
      unit_id, room_type_id, beds24_unit_id, unit_name, unit_type, position,
      active, raw_json, created_at, updated_at
    ) VALUES (3, 7, 200, 'Bungalow 1', 'bungalow', 1, 1, '{}', '2026-08-01', '2026-08-01')
  `).run();

  syncUnit(db, 200, "E2", 2);

  const row = db.prepare("SELECT unit_id, unit_name, position, raw_json FROM units WHERE beds24_unit_id = 200").get() as Record<string, unknown>;
  assert.equal(row.unit_id, 3);
  assert.equal(row.unit_name, "Bungalow 1");
  assert.equal(row.position, 2);
  assert.match(String(row.raw_json), /"name":"E2"/);
  db.close();
});

test("an unmapped new Beds code is stored fail-closed while its external identity remains in raw_json", () => {
  const db = createDatabase();
  syncUnit(db, 201, "E9", 3);

  const row = db.prepare("SELECT unit_name, raw_json FROM units WHERE beds24_unit_id = 201").get() as Record<string, unknown>;
  assert.equal(row.unit_name, "Room not assigned");
  assert.match(String(row.raw_json), /"name":"E9"/);
  db.close();
});
