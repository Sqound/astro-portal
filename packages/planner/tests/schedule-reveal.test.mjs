import assert from "node:assert/strict";
import test from "node:test";
import { scheduleRevealOffset } from "../src/schedule-reveal.js";

// The measurements the running portal reports at 402x874: a 54 px sticky
// header and a stage whose scroll-margin-top is that header plus 5rem.
const viewportHeight = 874;
const headerHeight = 54;
const stageInset = 134;
const base = {
  headerHeight,
  stageInset,
  viewportHeight,
  maxScroll: 40000,
};

test("the stage's heading lands at the top of the visible area", () => {
  assert.equal(
    scheduleRevealOffset({ ...base, stageTop: 3012 }),
    3012 - stageInset,
  );
});

test("a row that fits below the heading keeps the heading parked", () => {
  // Stage at 3012, row 500 px into it, 74 px tall: its bottom sits 574 px
  // below the heading, well inside the 874 px viewport.
  const offset = scheduleRevealOffset({
    ...base,
    stageTop: 3012,
    rowTop: 3512,
    rowHeight: 74,
  });
  assert.equal(offset, 3012 - stageInset);
  // And it really is visible from there.
  assert.ok(3512 + 74 - offset <= viewportHeight);
});

test("a row past the fold becomes the anchor, a third of the way down", () => {
  // The same stage with a long timeline: the row's bottom would sit 1074 px
  // below the parked heading, past the viewport.
  const rowTop = 4012;
  const offset = scheduleRevealOffset({
    ...base,
    stageTop: 3012,
    rowTop,
    rowHeight: 74,
  });
  const band = viewportHeight - headerHeight;
  assert.equal(offset, rowTop - headerHeight - band / 3);
  // The row is now a third of the way down the area below the header.
  // (Compared with a tolerance: the two sides reassociate the same sum
  // differently, which costs a last-place bit.)
  assert.ok(Math.abs(rowTop - offset - (headerHeight + band / 3)) < 1e-9);
});

test("the boundary case keeps the heading: a row ending exactly at the fold", () => {
  const stageTop = 3012;
  const destination = stageTop - stageInset;
  const rowHeight = 74;
  const rowTop = destination + viewportHeight - rowHeight;
  assert.equal(
    scheduleRevealOffset({ ...base, stageTop, rowTop, rowHeight }),
    destination,
  );
  // One pixel lower and the row takes over.
  assert.notEqual(
    scheduleRevealOffset({ ...base, stageTop, rowTop: rowTop + 1, rowHeight }),
    destination,
  );
});

test("the destination never leaves the document", () => {
  assert.equal(
    scheduleRevealOffset({ ...base, stageTop: 40, maxScroll: 40000 }),
    0,
    "a stage near the top of a short page cannot scroll above zero",
  );
  assert.equal(
    scheduleRevealOffset({ ...base, stageTop: 9000, maxScroll: 4038 }),
    4038,
    "and never past the document's last scroll offset",
  );
});

test("no row to reveal falls back to the stage", () => {
  assert.equal(
    scheduleRevealOffset({ ...base, stageTop: 3012, rowTop: null }),
    3012 - stageInset,
  );
});

test("unusable measurements produce no destination", () => {
  assert.equal(
    scheduleRevealOffset({ ...base, stageTop: Number.NaN }),
    null,
    "an unmeasurable stage",
  );
  assert.equal(
    scheduleRevealOffset({ ...base, stageTop: 3012, viewportHeight: 0 }),
    null,
    "a viewport with no height",
  );
});

test("missing insets degrade to a plain top alignment", () => {
  assert.equal(
    scheduleRevealOffset({
      stageTop: 3012,
      viewportHeight,
      maxScroll: 40000,
    }),
    3012,
  );
});

test("a header taller than the viewport cannot invert the third", () => {
  const offset = scheduleRevealOffset({
    ...base,
    headerHeight: 2000,
    stageTop: 3012,
    rowTop: 6000,
    rowHeight: 74,
  });
  assert.equal(offset, 6000 - viewportHeight);
  assert.ok(offset >= 0);
});
