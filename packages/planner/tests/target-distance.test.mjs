import assert from "node:assert/strict";
import test from "node:test";
import { targetDistanceOf } from "../dist/target-distance.js";

test("a web target's distance reads from the full view, a candidate and its knowledge, and is absent otherwise", () => {
  const full = {
    distance: { lightYears: 2500000, source: "published", reference: "x" },
  };
  assert.deepEqual(targetDistanceOf(full), {
    lightYears: 2500000,
    source: "published",
    isEstimate: false,
  });
  const candidate = { distanceLy: 52000000, distanceSource: "redshift" };
  assert.equal(targetDistanceOf(candidate).isEstimate, true);
  assert.equal(
    targetDistanceOf({ knowledge: candidate, ...candidate }).lightYears,
    52000000,
  );
  for (const absent of [
    {},
    null,
    { distance: null },
    { distanceLy: null, distanceSource: null },
    { distanceLy: 0, distanceSource: "parallax" },
    { distanceLy: 1000, distanceSource: "wikidata" },
  ])
    assert.equal(targetDistanceOf(absent), null);
});
