import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  dateLabel,
  isPlannerDate,
  savedPlannerDate,
} from "../dist/date-label.js";

/**
 * The import of an export into a private portal writes a
 * planner document with `date: null`; the page read it as the night's date
 * and died on `RangeError: Invalid time value`. A date that is not a real day
 * reads as nothing, and a saved document opens on the fallback day.
 */

test("a planner date is a real day written YYYY-MM-DD", () => {
  for (const value of ["2026-10-21", "2024-02-29"])
    assert.equal(isPlannerDate(value), true, value);
  for (const value of [
    null,
    undefined,
    "",
    "null",
    "2026-13-01",
    "2026-02-30",
    "2026-10-2",
    "21/10/2026",
    20261021,
    {},
  ])
    assert.equal(isPlannerDate(value), false, String(value));
});

test("a saved document with no usable date opens on the fallback day", () => {
  assert.equal(savedPlannerDate("2026-10-21", "2026-10-28"), "2026-10-21");
  for (const value of [null, undefined, "", "tomorrow", "2026-02-30"])
    assert.equal(savedPlannerDate(value, "2026-10-28"), "2026-10-28");
});

test("the label of a date that is not a day is empty, never an error", () => {
  for (const locale of ["en", "fr", "ja", "ru", "zh-Hans"]) {
    assert.match(dateLabel("2026-10-21", locale), /2026|２０２６/);
    for (const value of [null, undefined, "", "null", "2026-02-30"])
      assert.equal(dateLabel(value, locale), "", `${locale} ${value}`);
  }
  assert.equal(dateLabel("2026-10-21", "en"), "Wednesday, October 21, 2026");
});

test("the page reads a saved document's date through the guard, and writes dates through the guarded label", () => {
  const page = readFileSync(
    new URL("../src/components/PlannerPage.js", import.meta.url),
    "utf8",
  );
  assert.match(
    page,
    /import \{ dateLabel, savedPlannerDate \} from "\.\.\/date-label\.js"/,
  );
  assert.match(
    page,
    /const date = savedPlannerDate\(value\.date, fallback\.date\)/,
  );
  assert.doesNotMatch(
    page,
    /function dateLabel\(/,
    "the page's own, unguarded formatter is gone",
  );
});
