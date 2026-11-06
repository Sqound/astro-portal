import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { knownElevation } from "portal/planner/state.js";

// Review v1: "Altitude 0 m" for a place whose elevation is unknown (a place
// saved while offline, or whose elevation the service could not estimate). The
// web could not tell the two apart: its normalizers wrote `String(elevation ||
// "0")`, so an elevation nobody gave became a sea-level place before the row
// ever drew it. An unknown elevation stays empty now, is not written, and a
// real zero (a seaside place, the string "0") is.

const page = await readFile(
  new URL("../src/components/PlannerPage.js", import.meta.url),
  "utf8",
);
const dialog = await readFile(
  new URL(
    "../../../packages/portal/src/components/planner/PlannerPlaceDialog.js",
    import.meta.url,
  ),
  "utf8",
);
const repository = await readFile(
  new URL(
    "../../../packages/portal/src/persistence/planner-state-repository.js",
    import.meta.url,
  ),
  "utf8",
);

test("the rule: unknown is not zero", () => {
  assert.equal(knownElevation(""), null);
  assert.equal(knownElevation(undefined), null);
  assert.equal(knownElevation("0"), "0");
  assert.equal(knownElevation("312"), "312");
});

test("no normalizer turns an unknown elevation into sea level", () => {
  for (const [name, source] of [
    ["PlannerPage.js", page],
    ["planner-state-repository.js", repository],
  ]) {
    assert.doesNotMatch(source, /elevation:\s*String\([^)]*\|\|\s*"0"\)/, name);
    assert.match(source, /elevation:\s*String\([^)]*\?\?\s*""\)/, name);
  }
});

test("the row of the place writes the elevation only when it is known", () => {
  const row = page.slice(page.indexOf('className="planner-location-summary"'));
  const elevation = row.indexOf('message(locale, "plannerElevation")');
  assert.ok(elevation > 0);
  assert.match(
    row.slice(0, elevation),
    /knownElevation\(state\.location\.elevation\)\s*!==\s*null/,
  );
});

test("the review of the place dialog writes the elevation only when it is known", () => {
  assert.match(dialog, /knownElevation\(draft\.elevation\)\s*!==\s*null/);
  assert.doesNotMatch(dialog, /°\s*·\s*\{draft\.elevation\} m/);
});

test("an elevation the service could not estimate is not kept as the placeholder zero it answers", () => {
  assert.match(
    dialog,
    /elevationSource === "unavailable"\s*\?\s*\{ \.\.\.resolved, elevation: "" \}/,
  );
});
