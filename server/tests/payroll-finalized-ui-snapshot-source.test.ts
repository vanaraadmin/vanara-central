import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../../src/pages/PayrollPage.tsx"), "utf8");

test("finalized payroll UI uses the server-authoritative calculation view", () => {
  assert.match(page, /const calculation = selected\?\.calculation \?\? null;/);
  assert.match(page, /const contract = selected\?\.calculation\?\.contract \?\? null;/);
  assert.doesNotMatch(page, /selected\.record\.calculation/);
});
