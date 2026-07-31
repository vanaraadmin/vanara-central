import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { generateTm30Workbook, listTm30PassportRows, type Tm30PassportRow } from "../src/services/tm30-export.service.ts";
import { buildTm30NationalityMap, tm30NationalityCodeFrom } from "../src/services/tm30-nationality.service.ts";
import { readZipEntries, textEntry } from "../src/services/tm30-zip.service.ts";

class FakeStmt {
  private params: unknown[] = [];
  constructor(private rows: Record<string, unknown>[]) {}
  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }
  async all<T>() {
    const date = String(this.params[0]);
    return { results: this.rows.filter((row) => row.arrival_date === date && String(row.status).toLowerCase() === "confirmed") as T[] };
  }
}

class FakeTm30DB {
  constructor(private rows: Record<string, unknown>[]) {}
  prepare() {
    return new FakeStmt(this.rows);
  }
}

const templateUrl = new URL("../../src/TM30_template/Template-InformAccom-ImportExcel.xlsx", import.meta.url);

async function officialTemplate(): Promise<ArrayBuffer> {
  const bytes = await readFile(templateUrl);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function workbookBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function xmlDecode(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

async function firstSheetCells(workbook: Uint8Array): Promise<Map<string, string>> {
  const entries = await readZipEntries(workbookBuffer(workbook));
  const sheet = textEntry(entries, "xl/worksheets/sheet1.xml");
  const cells = new Map<string, string>();
  for (const match of sheet.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
    const reference = /\br="([^"]+)"/.exec(match[1] ?? "")?.[1];
    const text = /<t\b[^>]*>([\s\S]*?)<\/t>/.exec(match[2] ?? "")?.[1];
    if (reference && text !== undefined) cells.set(reference, xmlDecode(text));
  }
  return cells;
}

const baseRow: Tm30PassportRow = {
  bookingId: 9001,
  firstName: "MALI",
  middleName: null,
  lastName: "GUEST",
  gender: "F",
  passportNumber: "AB1234567",
  nationality: "THAI",
  birthDate: "1990-01-15",
  checkOutDate: "2026-08-02",
  phone: "+66812345678",
};

test("TM30 export maps booking with one passport into the official first sheet", async () => {
  const result = await generateTm30Workbook(await officialTemplate(), [baseRow]);
  const cells = await firstSheetCells(result.workbook);

  assert.equal(result.rowCount, 1);
  assert.deepEqual(result.missingFields, []);
  assert.equal(cells.get("A2"), "MALI");
  assert.equal(cells.get("C2"), "GUEST");
  assert.equal(cells.get("D2"), "F");
  assert.equal(cells.get("E2"), "AB1234567");
  assert.equal(cells.get("F2"), "THA");
  assert.equal(cells.get("G2"), "15/01/1990");
  assert.equal(cells.get("H2"), "02/08/2026");
  assert.equal(cells.get("I2"), "+66812345678");
});

test("TM30 export writes multiple passports for the same arrival date", async () => {
  const result = await generateTm30Workbook(await officialTemplate(), [
    baseRow,
    { ...baseRow, bookingId: 9001, firstName: "NOK", passportNumber: "CD7654321", nationality: "THE UNITED STATES OF AMERICA", gender: "MALE" },
  ]);
  const cells = await firstSheetCells(result.workbook);

  assert.equal(result.rowCount, 2);
  assert.equal(cells.get("A2"), "MALI");
  assert.equal(cells.get("A3"), "NOK");
  assert.equal(cells.get("D3"), "M");
  assert.equal(cells.get("F3"), "USA");
});

test("TM30 nationality conversion uses the official template mapping and reusable aliases", async () => {
  const map = await buildTm30NationalityMap(await officialTemplate());

  assert.equal(tm30NationalityCodeFrom("THAI", map), "THA");
  assert.equal(tm30NationalityCodeFrom("THE KINGDOM OF THAILAND", map), "THA");
  assert.equal(tm30NationalityCodeFrom("United States of America", map), "USA");
  assert.equal(tm30NationalityCodeFrom("not a nationality", map), null);
});

test("TM30 export allows missing optional fields without marking required fields missing", async () => {
  const result = await generateTm30Workbook(await officialTemplate(), [{
    ...baseRow,
    middleName: null,
    lastName: null,
    phone: null,
  }]);
  const cells = await firstSheetCells(result.workbook);

  assert.deepEqual(result.missingFields, []);
  assert.equal(cells.has("B2"), false);
  assert.equal(cells.has("C2"), false);
  assert.equal(cells.has("I2"), false);
});

test("TM30 generated workbook remains a valid xlsx package", async () => {
  const template = await officialTemplate();
  const originalEntries = await readZipEntries(template);
  const result = await generateTm30Workbook(template, [baseRow]);
  const generatedEntries = await readZipEntries(workbookBuffer(result.workbook));

  assert.deepEqual(generatedEntries.map((entry) => entry.name), originalEntries.map((entry) => entry.name));
  assert.ok(textEntry(generatedEntries, "xl/workbook.xml").includes("แบบแจ้งที่พัก Inform Accom"));
  assert.ok(textEntry(generatedEntries, "xl/worksheets/sheet1.xml").includes("AB1234567"));
});

test("TM30 booking query returns one row per persisted passport", async () => {
  const db = new FakeTm30DB([
    {
      id: 1,
      booking_id: 9001,
      first_name: "MALI",
      middle_name: null,
      last_name: "GUEST",
      passport_number: "AB1234567",
      nationality: "THAI",
      gender: "F",
      birth_date: "1990-01-15",
      departure_date: "2026-08-02",
      phone: null,
      mobile: "+66812345678",
      arrival_date: "2026-07-31",
      status: "Confirmed",
    },
    {
      id: 2,
      booking_id: 9001,
      first_name: "NOK",
      middle_name: null,
      last_name: "GUEST",
      passport_number: "CD7654321",
      nationality: "THAI",
      gender: "F",
      birth_date: "1992-04-20",
      departure_date: "2026-08-02",
      phone: "+66111111111",
      mobile: null,
      arrival_date: "2026-07-31",
      status: "Confirmed",
    },
    {
      id: 3,
      booking_id: 9002,
      first_name: "FUTURE",
      middle_name: null,
      last_name: "GUEST",
      passport_number: "EF0000001",
      nationality: "THAI",
      gender: "M",
      birth_date: "1991-01-01",
      departure_date: "2026-08-05",
      phone: null,
      mobile: null,
      arrival_date: "2026-08-01",
      status: "Confirmed",
    },
  ]);

  const rows = await listTm30PassportRows({ DB: db as unknown as D1Database }, "2026-07-31");

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => [row.bookingId, row.firstName, row.phone]), [
    [9001, "MALI", "+66812345678"],
    [9001, "NOK", "+66111111111"],
  ]);
});
