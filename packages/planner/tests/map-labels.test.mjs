import assert from "node:assert/strict";
import test from "node:test";
import {
  estimatedLabelWidth,
  labelCandidateRects,
  layOutMapLabels,
  mapLabelClearance,
  mapLabelPriority,
  positionLabelBestCount,
  positionLabelFontSize,
  positionLabelTargetIds,
  positionLabelWidth,
  preferredLabelRect,
} from "../src/map-labels.js";

// The label layout rule: a crowd, a ranking and a determinism guarantee.

const canvas = { width: 360, height: 360 };

function request({
  key,
  origin,
  priority = "normal",
  text,
  size = { width: 60, height: 12 },
}) {
  return {
    key,
    text: text ?? key,
    origin,
    size,
    priority,
    offset: { x: 12, y: -14 },
    gap: 12,
  };
}

function rectsByKey(placements) {
  return Object.fromEntries(
    placements.map((placement) => [placement.key, placement.rect]),
  );
}

function assertNoOverlap(placements) {
  for (let i = 0; i < placements.length; i += 1)
    for (let j = i + 1; j < placements.length; j += 1) {
      const a = placements[i].rect;
      const b = placements[j].rect;
      const guarded = {
        x: a.x - mapLabelClearance,
        y: a.y - mapLabelClearance,
        right: a.right + mapLabelClearance,
        bottom: a.bottom + mapLabelClearance,
      };
      assert.ok(
        !(
          guarded.x < b.right &&
          b.x < guarded.right &&
          guarded.y < b.bottom &&
          b.y < guarded.bottom
        ),
        `${placements[i].key} overlaps ${placements[j].key}`,
      );
    }
}

test("leaves a lone label at its preferred position", () => {
  const only = request({ key: "a", origin: { x: 100, y: 100 } });
  const placed = layOutMapLabels({ requests: [only], canvas });
  assert.equal(placed.length, 1);
  assert.deepEqual(placed[0].rect, preferredLabelRect(only));
});

test("shifts the second label of a colliding pair to a free position", () => {
  // Four pixels apart: the two preferred rectangles overlap almost entirely.
  const first = request({ key: "a", origin: { x: 160, y: 160 } });
  const second = request({ key: "b", origin: { x: 164, y: 162 } });
  const placed = layOutMapLabels({ requests: [first, second], canvas });
  assert.equal(placed.length, 2);
  const rects = rectsByKey(placed);
  // Same rank, so the key breaks the tie: `a` keeps the right-hand slot.
  assert.deepEqual(rects.a, preferredLabelRect(first));
  assert.notDeepEqual(rects.b, preferredLabelRect(second));
  // `b` fell back to the left-hand candidate, which is a real position
  // rather than a nudge.
  assert.ok(rects.b.right < second.origin.x);
  assertNoOverlap(placed);
});

test("drops a label when every candidate position is taken", () => {
  // Six labels within six pixels of one another: four candidate positions
  // cannot hold them all.
  const placed = layOutMapLabels({
    requests: Array.from({ length: 6 }, (_, index) =>
      request({
        key: `target-${index}`,
        origin: { x: 180 + index, y: 180 + index },
      }),
    ),
    canvas,
  });
  assert.ok(placed.length > 0);
  assert.ok(placed.length < 6);
  assertNoOverlap(placed);
});

test("never lets two placed labels overlap in a dense field", () => {
  assertNoOverlap(
    layOutMapLabels({
      requests: Array.from({ length: 24 }, (_, index) =>
        request({
          key: `target-${index}`,
          origin: {
            x: 120 + (index % 6) * 7,
            y: 120 + Math.floor(index / 6) * 9,
          },
        }),
      ),
      canvas,
    }),
  );
});

test("keeps the higher-ranked label at its preferred position", () => {
  const ambient = request({
    key: "constellation:cyg",
    origin: { x: 160, y: 160 },
    priority: "ambient",
  });
  const selected = request({
    key: "marker:m31",
    origin: { x: 162, y: 161 },
    priority: "selected",
  });
  // Declared ambient-first, so only the ranking can decide.
  const rects = rectsByKey(
    layOutMapLabels({ requests: [ambient, selected], canvas }),
  );
  assert.deepEqual(rects["marker:m31"], preferredLabelRect(selected));
  assert.notDeepEqual(rects["constellation:cyg"], preferredLabelRect(ambient));
});

test("drops the ambient name before any target name", () => {
  // All four on the same point: there is room for three of them, and the one
  // that goes is the lowest rank.
  const origin = { x: 160, y: 160 };
  const selected = request({
    key: "marker:selected",
    origin,
    priority: "selected",
  });
  const placed = layOutMapLabels({
    requests: [
      request({ key: "constellation:and", origin, priority: "ambient" }),
      request({ key: "marker:other", origin, priority: "normal" }),
      request({ key: "marker:plan", origin, priority: "emphasized" }),
      selected,
    ],
    canvas,
  });
  assert.deepEqual(
    placed.map((placement) => placement.priority),
    ["selected", "emphasized", "normal"],
  );
  assert.deepEqual(placed[0].rect, preferredLabelRect(selected));
  assertNoOverlap(placed);
});

test("is deterministic whatever order the requests arrive in", () => {
  const requests = Array.from({ length: 10 }, (_, index) =>
    request({
      key: `target-${index}`,
      origin: { x: 140 + index * 5, y: 150 + (index % 3) * 6 },
    }),
  );
  const forward = rectsByKey(layOutMapLabels({ requests, canvas }));
  assert.ok(Object.keys(forward).length > 0);
  assert.deepEqual(
    rectsByKey(layOutMapLabels({ requests: [...requests].reverse(), canvas })),
    forward,
  );
  assert.deepEqual(rectsByKey(layOutMapLabels({ requests, canvas })), forward);
});

test("drops a label no candidate can keep on the canvas", () => {
  assert.deepEqual(
    layOutMapLabels({
      requests: [request({ key: "off", origin: { x: -400, y: -400 } })],
      canvas,
    }),
    [],
  );
});

test("reserves no space for an empty label", () => {
  const named = request({ key: "named", origin: { x: 160, y: 160 } });
  const placed = layOutMapLabels({
    requests: [
      request({ key: "blank", origin: { x: 160, y: 160 }, text: "" }),
      named,
    ],
    canvas,
  });
  assert.equal(placed.length, 1);
  assert.equal(placed[0].key, "named");
  assert.deepEqual(placed[0].rect, preferredLabelRect(named));
});

test("an unknown rank sorts last rather than outranking the selection", () => {
  const origin = { x: 160, y: 160 };
  const selected = request({ key: "a:sel", origin, priority: "selected" });
  const placed = layOutMapLabels({
    requests: [request({ key: "a:odd", origin, priority: "???" }), selected],
    canvas,
  });
  assert.deepEqual(placed[0].rect, preferredLabelRect(selected));
});

test("the candidate list starts at the preferred position and drops its duplicates", () => {
  const only = request({ key: "a", origin: { x: 160, y: 160 } });
  const candidates = labelCandidateRects(only);
  assert.deepEqual(candidates[0], preferredLabelRect(only));
  for (let i = 1; i < candidates.length; i += 1)
    assert.notDeepEqual(candidates[i], candidates[0]);
});

test("a marker's rank follows its state on the map", () => {
  assert.equal(mapLabelPriority({ selected: true, inPlan: true }), "selected");
  assert.equal(mapLabelPriority({ inPlan: true }), "emphasized");
  assert.equal(mapLabelPriority({}), "normal");
  assert.equal(mapLabelPriority(), "normal");
});

test("an unmeasurable label's width is a plain product, server and browser alike", () => {
  assert.equal(estimatedLabelWidth("NGC 7000", 2), 16);
  assert.equal(estimatedLabelWidth("", 2), 0);
  assert.equal(estimatedLabelWidth(null, 2), 0);
});

// Which targets the "Positions" map names, and how wide a name is at
// the floor size.
const listed = Array.from({ length: 30 }, (_, index) => ({
  target: { id: `t${index}` },
}));
const scored = new Map(
  listed.map((card, index) => [
    card.target.id,
    // The later in the list, the higher the share of its own maximum.
    { total: index + 10, max: 100 },
  ]),
);

test("the « Positions » map names the selected target, the plan's and the ten best-rated others", () => {
  const named = positionLabelTargetIds({
    cards: listed,
    selectedTargetId: "t3",
    planIds: new Set(["t0", "t1"]),
    scores: scored,
  });
  assert.ok(named.has("t3"), "the selected target");
  assert.ok(named.has("t0") && named.has("t1"), "the plan's targets");
  const others = [...named].filter((id) => !["t3", "t0", "t1"].includes(id));
  assert.equal(others.length, positionLabelBestCount);
  assert.equal(positionLabelBestCount, 10);
  // The best ten of the rest are the last ten of the list.
  assert.deepEqual(
    others.sort(
      (left, right) => Number(left.slice(1)) - Number(right.slice(1)),
    ),
    Array.from({ length: 10 }, (_, index) => `t${20 + index}`),
  );
  assert.equal(named.size, 13, "the 17 others keep their dot, not their name");
});

test("without a score a card ranks after the scored ones, in the list's own order", () => {
  const partial = new Map([["t5", { total: 1, max: 100 }]]);
  const named = positionLabelTargetIds({
    cards: listed,
    scores: partial,
    limit: 3,
  });
  assert.deepEqual([...named].sort(), ["t0", "t1", "t5"]);
  assert.equal(
    positionLabelTargetIds({ cards: listed, limit: 0 }).size,
    0,
    "nothing named when nothing is selected, planned or ranked in",
  );
  // Scores compare by share of their own maximum, never a rounded percent.
  const mixed = new Map([
    ["t0", { total: 6, max: 10 }],
    ["t1", { total: 59, max: 100 }],
  ]);
  assert.deepEqual(
    [
      ...positionLabelTargetIds({
        cards: listed.slice(0, 2),
        scores: mixed,
        limit: 1,
      }),
    ],
    ["t0"],
  );
});

test("a name is at least 11 px high and its width a plain sum, Latin and CJK alike", () => {
  assert.equal(positionLabelFontSize, 11);
  assert.ok(Math.abs(positionLabelWidth("M31") - 3 * 0.62 * 11) < 1e-9);
  assert.equal(positionLabelWidth("おうし座"), 4 * 11);
  assert.equal(positionLabelWidth(""), 0);
  assert.equal(positionLabelWidth(null), 0);
  assert.equal(positionLabelWidth("M31", 22), 2 * positionLabelWidth("M31"));
});
