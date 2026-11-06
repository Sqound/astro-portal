import assert from "node:assert/strict";
import test from "node:test";

import { planFrise } from "planner/plan-frise.js";
import {
  estimateTextWidth,
  fitName,
  planFriseLayout,
  planFriseSizes,
} from "planner/plan-frise-layout.js";
import { boardPlan, item, planWith } from "./helpers/plan-frise-cases.mjs";

// Where the frise sits in pixels — the numbers of the design — and the names
// that never touch.

const near = (actual, expected, tolerance = 0.06) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} is not within ${tolerance} of ${expected}`,
  );
const board = planFrise(boardPlan());

test("the full frise at 330 px has the specified layout: ticks, night lines, blocks, references", () => {
  const layout = planFriseLayout(board, { width: 330, captionText: "Légende" });
  assert.equal(layout.width, 330);
  assert.equal(layout.height, 146);
  assert.deepEqual(layout.plot, {
    left: 26,
    top: 24,
    right: 328,
    bottom: 124,
    height: 100,
    width: 302,
  });
  // The ticks: 19:00 at x 40.4, 20:00 at 69.1, … 04:00 at 299.2.
  assert.equal(layout.ticks.length, 10);
  near(layout.ticks[0].x, 40.4);
  near(layout.ticks[1].x, 69.1);
  near(layout.ticks[9].x, 299.2);
  assert.deepEqual(
    layout.ticks.filter((tick) => tick.labelled).map((tick) => tick.text),
    ["20:00", "22:00", "00:00", "02:00", "04:00"],
  );
  near(layout.night.x0, 37.5);
  near(layout.night.x1, 317.5);
  const [m31, ngc, m33, m45] = layout.blocks;
  near(m31.left, 63.9);
  near(m31.right - m31.left, 57.5);
  near(ngc.left, 135.8);
  near(m33.right - m33.left, 71.9);
  near(m45.left, 265.2);
  near(m45.right - m45.left, 28.8);
  // 60° and 30° at y 57.3 and 90.7, their labels at the left, a little lower.
  near(layout.heights[0].y, 90.7);
  near(layout.heights[1].y, 57.3);
  near(layout.heights[1].labelY, 60.8);
  assert.equal(layout.heights[1].labelX, 22);
  assert.deepEqual(
    layout.blocks.map((block) => block.name.text),
    ["M31", "NGC 7000", "M33", "M45"],
  );
  near(m31.name.x, 92.7, 0.1);
  assert.equal(m31.name.y, 116);
  assert.deepEqual(layout.caption, { x: 26, y: 140, text: "Légende" });
});

test("the reduced frise at 328 px has the specified layout: 328 × 60, the plot 44 high, names under the blocks, no hours", () => {
  const layout = planFriseLayout(board, { width: 328, variant: "reduced" });
  assert.equal(layout.height, 60);
  assert.equal(layout.plot.top, 2);
  assert.equal(layout.plot.bottom, 46);
  assert.equal(layout.plot.right, 326);
  assert.deepEqual(layout.ticks, []);
  assert.equal(layout.caption, null);
  near(layout.night.x0, 14.3);
  near(layout.night.x1, 314.7);
  near(layout.blocks[0].left, 42.6);
  near(layout.blocks[0].right - layout.blocks[0].left, 61.7);
  near(layout.heights[1].y, 2 + 44 * (1 - 60 / 90), 0.001);
  assert.equal(layout.blocks[0].name.y, 58);
  near(layout.blocks[0].name.x, 73.5);
});

test("the frise is never wider than its maximum, whatever the box, and never narrower than its floor", () => {
  assert.equal(planFriseLayout(board, { width: 1280 }).width, 330);
  assert.equal(
    planFriseLayout(board, { width: 1280, variant: "reduced" }).width,
    328,
  );
  assert.equal(planFriseLayout(board, { width: 10 }).width, 220);
  assert.equal(planFriseLayout(board).width, planFriseSizes.full.maxWidth);
  const narrow = planFriseLayout(board, { width: 280 });
  assert.equal(narrow.plot.right, 278);
  assert.ok(narrow.blocks.every((block) => block.right <= 278));
});

test("a curve ends inside its block, one pixel from each edge, and is a path of cubic segments", () => {
  const layout = planFriseLayout(board, { width: 330 });
  const [m31] = layout.blocks;
  assert.match(m31.curve, /^M[\d. ]+C/);
  const numbers = m31.curve.match(/-?\d+(\.\d+)?/g).map(Number);
  near(numbers[0], m31.left + 1, 0.06);
  near(numbers.at(-2), m31.right - 1, 0.06);
  // M31 rises from 48° to 68°: the path ends higher (a smaller y) than it starts.
  assert.ok(numbers.at(-1) < numbers[1]);
});

test("a partial curve keeps its place in the block; a block with no series has no curve", () => {
  const frise = planFrise(
    planWith([
      {
        ...item("a", 0, 100, [
          { time: "2026-10-14T19:34:00.000Z", altitude: 30 },
          { time: "2026-10-14T19:44:00.000Z", altitude: 31 },
          { time: "2026-10-14T19:54:00.000Z", altitude: 32 },
        ]),
      },
      item("b", 120, 200),
    ]),
  );
  const layout = planFriseLayout(frise, { width: 330 });
  const [a, b] = layout.blocks;
  // The series starts 40 minutes into the block: its path does not.
  const start = Number(a.curve.match(/^M(-?\d+(\.\d+)?)/)[1]);
  assert.ok(start > a.left + 10, `${start} should be well inside ${a.left}`);
  assert.equal(b.curve, null);
  assert.equal(layout.blocks[1].name.text, "b");
});

test("a name that would touch its neighbour is shortened with « … », never overlapped", () => {
  const frise = planFrise(
    planWith([
      { ...item("a", 100, 130), label: "Nébuleuse de l’Amérique du Nord" },
      { ...item("b", 131, 160), label: "Nébuleuse de l’Haltère" },
    ]),
  );
  const layout = planFriseLayout(frise, { width: 330 });
  const [first, second] = layout.blocks.map((block) => block.name);
  assert.ok(first.text.endsWith("…") && second.text.endsWith("…"));
  const width = (text) => estimateTextWidth(text, { size: 11, weight: 600 });
  assert.ok(
    first.x + width(first.text) / 2 <= second.x - width(second.text) / 2,
  );
});

test("fitName cuts by glyph with an ellipsis, trims the space before it, and gives nothing when not even the ellipsis fits", () => {
  const measure = (text) => [...text].length * 10;
  assert.equal(fitName("M31", 30, measure), "M31");
  assert.equal(fitName("NGC 7000", 50, measure), "NGC…");
  assert.equal(fitName("NGC 7000", 20, measure), "N…");
  assert.equal(fitName("NGC 7000", 10, measure), "…");
  assert.equal(fitName("NGC 7000", 5, measure), "");
  assert.equal(fitName("", 100, measure), "");
});

test("the caption is cut to the width of the box", () => {
  const long = "Hauteur de chaque cible pendant son créneau de la nuit entière";
  const layout = planFriseLayout(board, { width: 330, captionText: long });
  assert.ok(layout.caption.text.endsWith("…"));
  assert.ok(estimateTextWidth(layout.caption.text, { size: 11 }) <= 330 - 26);
});
