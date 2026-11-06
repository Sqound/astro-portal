import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// A target the catalogue gives no size used to wear a ring of an invented 12
// arcminutes, as wide as a measured nebula. It is a point source: it keeps the
// 10 px minimum that leaves it tappable.

for (const file of [
  "src/components/PlannerNightSkyMap.js",
  "dist/components/PlannerNightSkyMap.js",
]) {
  test(`${file}: the marker of an unsized target invents no extent`, () => {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    const start = source.indexOf("function markerProjection");
    const end = source.indexOf("\n}\n", start);
    const body = source.slice(start, end);
    assert.match(body, /const \[major = 0, minor = major\] =/);
    assert.doesNotMatch(body, /major = 12/);
    assert.match(body, /Math\.max\(10, projectedWidth\)/);
  });
}
