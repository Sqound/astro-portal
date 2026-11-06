import assert from "node:assert/strict";
import test from "node:test";

import { journalPlanDate } from "../dist/components/sessions/journal-rows.js";

test("a plan's night is named by its date, short, with a capital", () => {
  assert.equal(journalPlanDate("2026-09-12", "fr"), "Sam. 12 sept.");
  assert.equal(journalPlanDate("2026-09-12", "en"), "Sat, Sep 12");
  assert.equal(journalPlanDate("", "fr"), "");
});
