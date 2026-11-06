import assert from "node:assert/strict";
import test from "node:test";
import {
  facetedCounterLabel,
  hasActiveFacetFilter,
} from "../dist/target-catalogue-counters.js";

const identity = (value) => String(value);

test("hasActiveFacetFilter: no filter active", () => {
  assert.equal(hasActiveFacetFilter(["", "", "", "", "", ""]), false);
});

test("hasActiveFacetFilter: one filter active", () => {
  assert.equal(hasActiveFacetFilter(["", "messier", "", "", "", ""]), true);
});

test("hasActiveFacetFilter: two filters active", () => {
  assert.equal(
    hasActiveFacetFilter(["", "messier", "galaxy", "", "", ""]),
    true,
  );
});

test("hasActiveFacetFilter: a favorites-tab flag counts as active, like the mobile Catalogue screen", () => {
  assert.equal(
    hasActiveFacetFilter(["", "", "", "", "", "", "favorites"]),
    true,
  );
});

test("facetedCounterLabel: no filter active shows the plain count", () => {
  assert.equal(facetedCounterLabel(162, 162, false, identity), "162");
  // `total` is ignored entirely while no filter is active, even when it
  // differs from `count` (a portal that computed it anyway).
  assert.equal(facetedCounterLabel(162, 500, false, identity), "162");
});

test("facetedCounterLabel: one filter active shows x/n", () => {
  assert.equal(facetedCounterLabel(38, 162, true, identity), "38/162");
});

test("facetedCounterLabel: two filters active still shows x/n against the same unfiltered n", () => {
  // The formatter itself does not know how many filters are active, only
  // whether at least one is — the "x" already reflects every active
  // dimension, computed server-side (`matchesExcept`).
  assert.equal(facetedCounterLabel(6, 162, true, identity), "6/162");
});

test("facetedCounterLabel: a dropdown ignores its own filter dimension", () => {
  // Simulates the server's facet contract for a "type" dropdown: once
  // `type=galaxy` is the active filter, the "Nebula" option's own count must
  // not collapse to zero, because the type facet is computed with the type
  // dimension itself excepted (`matchesExcept(matches, "type")` in
  // `src/lib/target-library.server.js`). The shared formatter simply prints
  // whatever the server already computed — this test documents that it does
  // not re-apply the active `type` value on top.
  const typeOptions = [
    { id: "galaxy", count: 12, total: 40 },
    { id: "nebula", count: 8, total: 25 },
  ];
  const hasActiveFilter = hasActiveFacetFilter(["", "", "galaxy", "", "", ""]);
  assert.equal(hasActiveFilter, true);
  assert.equal(
    facetedCounterLabel(
      typeOptions[0].count,
      typeOptions[0].total,
      hasActiveFilter,
      identity,
    ),
    "12/40",
  );
  assert.equal(
    facetedCounterLabel(
      typeOptions[1].count,
      typeOptions[1].total,
      hasActiveFilter,
      identity,
    ),
    "8/25",
  );
});

test("facetedCounterLabel: zero results still pairs x/n rather than hiding the counter", () => {
  assert.equal(facetedCounterLabel(0, 0, true, identity), "0/0");
  assert.equal(facetedCounterLabel(0, 162, true, identity), "0/162");
});

test("facetedCounterLabel: zero results with no active filter shows the plain zero", () => {
  assert.equal(facetedCounterLabel(0, 0, false, identity), "0");
});

test("facetedCounterLabel: missing count answers null (nothing to show)", () => {
  assert.equal(facetedCounterLabel(null, 10, true, identity), null);
  assert.equal(facetedCounterLabel(undefined, 10, false, identity), null);
});

test("facetedCounterLabel: missing or non-finite total falls back to the plain count, like a portal predating countsUnfiltered", () => {
  assert.equal(facetedCounterLabel(38, null, true, identity), "38");
  assert.equal(facetedCounterLabel(38, undefined, true, identity), "38");
  assert.equal(facetedCounterLabel(38, Number.NaN, true, identity), "38");
});

test("facetedCounterLabel: uses the supplied locale-aware formatter for both numbers", () => {
  const formatNumber = (value) => new Intl.NumberFormat("fr-FR").format(value);
  assert.equal(
    facetedCounterLabel(1234, 14386, true, formatNumber),
    `${formatNumber(1234)}/${formatNumber(14386)}`,
  );
});

test("facetedCounterLabel: defaults to a plain decimal string without a formatter", () => {
  assert.equal(facetedCounterLabel(5, 10, true), "5/10");
  assert.equal(facetedCounterLabel(5, 10, false), "5");
});
