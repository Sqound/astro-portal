import assert from "node:assert/strict";
import test from "node:test";
import { knownElevation } from "../dist/planner/state.js";

// A place whose elevation is not known is not at sea level. The row of the
// place wrote "Elevation 0 m" for a place saved while offline, or whose
// elevation the service could not estimate; the web turned both into "0" while
// normalizing (`String(elevation || "0")`). What the place stores now tells
// them apart: an elevation nobody gave is empty, a real zero is the string "0".

test("an elevation that is absent, empty or not a number is unknown", () => {
  for (const value of [undefined, null, "", "   ", "n/a", "NaN", "12 m"])
    assert.equal(knownElevation(value), null, JSON.stringify(value));
});

test("a real zero is a zero, and any other figure is itself", () => {
  assert.equal(knownElevation("0"), "0");
  assert.equal(knownElevation(0), "0");
  assert.equal(knownElevation("42"), "42");
  assert.equal(knownElevation(" 12.5 "), "12.5");
  assert.equal(knownElevation("-3"), "-3");
});
