// The web catalogue asks the service for the notoriety order (the editorial
// selection, then the catalogue's rank, then the designation), never for the
// night's score.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(
  new URL("../src/components/PlannerPage.js", import.meta.url),
  "utf8",
);

test("the web catalogue's request carries sort=notoriety", () => {
  const request = page.slice(
    page.indexOf(
      "const parameters = new URLSearchParams({\n        locale,\n        q: query,",
    ),
  );
  const parameters = request.slice(0, request.indexOf("});"));
  assert.match(parameters, /sort:\s*"notoriety"/);
  assert.match(parameters, /catalogue,/);
  assert.match(parameters, /offset:\s*String\(offset\)/);
});

test("the web catalogue never asks for the night's score", () => {
  const request = page.slice(
    page.indexOf(
      "const parameters = new URLSearchParams({\n        locale,\n        q: query,",
    ),
  );
  const parameters = request.slice(0, request.indexOf("});"));
  assert.doesNotMatch(parameters, /sort:\s*"planner"/);
  assert.doesNotMatch(parameters, /latitude/);
});
