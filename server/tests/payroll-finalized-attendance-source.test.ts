import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../../src/pages/PayrollPage.tsx"), "utf8");

test("finalized contract payroll remains immutable while attendance corrections stay available", () => {
  const submitAttendance = page.match(/function submitAttendance[\s\S]*?\n {2}\}/u)?.[0] ?? "";
  const attendanceSection = page.match(/<section className="payroll-events" aria-label="Contract attendance">[\s\S]*?<\/section>/u)?.[0] ?? "";

  assert.match(submitAttendance, /if \(contract\) attendanceMutation\.mutate\(\)/);
  assert.doesNotMatch(submitAttendance, /!locked/);
  assert.match(attendanceSection, /Attendance corrections are carried into the next open payroll/);
  assert.doesNotMatch(attendanceSection, /disabled=\{locked/);
  assert.match(attendanceSection, /disabled=\{attendanceMutation\.isPending\}/);
});
