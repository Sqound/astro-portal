import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  createPlacementGesture,
  placementCommit,
  placementFloorMinutes,
  schedulePlacementRun,
} from "../dist/schedule.js";

// The neighbour resists, is compressed to 10 min,
// escapes to the biggest free stretch, is compressed to 5 min and then covered
// -- never deleted. The nights below are real ones: the plans recorded in the
// fixtures of the repository (auto-fill outputs, debrief plans), each taken
// with every target dragged by real gestures -- slow, fast, backing off,
// to both edges of the night.

const epsilon = 1e-6;

function recordedNights() {
  const roots = [new URL("../../astro-contracts/fixtures/", import.meta.url)];
  const nights = new Map();
  const visit = (value) => {
    if (Array.isArray(value)) {
      const slots = value.filter(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          Number.isFinite(entry.startMinute) &&
          Number.isFinite(entry.endMinute),
      );
      if (slots.length >= 3 && slots.length === value.length) {
        const sorted = slots
          .map((slot) => [slot.startMinute, slot.endMinute])
          .sort((a, b) => a[0] - b[0]);
        const clean = sorted.every(
          ([start, end], index) =>
            start >= 0 &&
            end - start >= 15 &&
            (index === 0 || start >= sorted[index - 1][1]),
        );
        if (clean) nights.set(JSON.stringify(sorted), sorted);
      }
      value.forEach(visit);
    } else if (value && typeof value === "object") {
      Object.values(value).forEach(visit);
    }
  };
  for (const root of roots)
    for (const name of readdirSync(root)) {
      const path = join(root.pathname, name);
      if (!name.endsWith(".json") || statSync(path).size > 4e6) continue;
      try {
        visit(JSON.parse(readFileSync(path, "utf8")));
      } catch {
        // not a recorded night
      }
    }
  // The public repository keeps only the contracts' fixtures: a few nights
  // written by hand complete the recordings (tight, loose, many short slots,
  // one long slot), so the gestures meet every shape on every checkout.
  for (const night of [
    [
      [1200, 1290],
      [1290, 1380],
      [1380, 1500],
    ],
    [
      [1180, 1240],
      [1260, 1350],
      [1420, 1500],
      [1560, 1680],
    ],
    [
      [1150, 1180],
      [1180, 1215],
      [1215, 1255],
      [1255, 1300],
      [1300, 1340],
      [1340, 1400],
    ],
    [
      [1230, 1500],
      [1500, 1700],
      [1700, 1760],
    ],
    [
      [1100, 1160],
      [1200, 1260],
      [1320, 1380],
      [1440, 1500],
      [1560, 1620],
    ],
    [
      [1210, 1270],
      [1270, 1330],
      [1330, 1390],
      [1390, 1450],
    ],
  ])
    nights.set(JSON.stringify(night), night);
  return [...nights.values()];
}

const nights = recordedNights();

const slotsOf = (night) =>
  night.map(([start, end], index) => ({ id: `t${index}`, start, end }));

function assertScene(items, result, lo, hi, label) {
  const live = Object.entries(result.items).filter(
    ([, slot]) => slot.state !== "covered",
  );
  assert.ok(result.start >= lo - epsilon, `${label}: dragged before lo`);
  assert.ok(result.end <= hi + epsilon, `${label}: dragged past hi`);
  const ranges = [
    ["moving", result.start, result.end],
    ...live.map(([id, slot]) => [id, slot.start, slot.end]),
  ];
  for (const [id, start, end] of ranges) {
    assert.ok(
      start >= lo - epsilon && end <= hi + epsilon,
      `${label}: ${id} out of the night`,
    );
    assert.ok(
      end - start >= placementFloorMinutes - epsilon,
      `${label}: ${id} under the floor (${end - start})`,
    );
  }
  ranges.sort((a, b) => a[1] - b[1]);
  for (let i = 1; i < ranges.length; i += 1)
    assert.ok(
      ranges[i][1] >= ranges[i - 1][2] - 1e-4,
      `${label}: ${ranges[i - 1][0]} and ${ranges[i][0]} overlap (${ranges[i - 1][2]} > ${ranges[i][1]})`,
    );
  assert.equal(
    Object.keys(result.items).length,
    items.length - 1,
    `${label}: a target went missing`,
  );
}

function paths(origin, lo, hi, duration) {
  const upper = hi - duration;
  const walk = (from, to, step) => {
    const out = [];
    const sign = to >= from ? 1 : -1;
    for (let at = from; sign * (to - at) > 0; at += sign * step) out.push(at);
    out.push(to);
    return out;
  };
  return {
    "slow right": walk(origin, upper, 1),
    "slow left": walk(origin, lo, 1),
    "fast right": walk(origin, upper, 37),
    "fast left": walk(origin, lo, 37),
    "right then back": [...walk(origin, upper, 3), ...walk(upper, origin, 3)],
    "left then back": [...walk(origin, lo, 3), ...walk(lo, origin, 3)],
    "right, back half, right again": [
      ...walk(origin, upper, 5),
      ...walk(upper, (origin + upper) / 2, 5),
      ...walk((origin + upper) / 2, upper, 5),
    ],
    "both edges": [...walk(origin, upper, 4), ...walk(upper, lo, 4), origin],
  };
}

test("the recorded nights give real material", () => {
  assert.ok(nights.length >= 8, `only ${nights.length} recorded nights`);
});

test("on every recorded night, every target dragged by every gesture keeps the scene valid", () => {
  let scenes = 0;
  for (const night of nights) {
    const items = slotsOf(night);
    const hi = Math.max(...night.map(([, end]) => end)) + 60;
    for (const moving of items) {
      const duration = moving.end - moving.start;
      for (const [name, path] of Object.entries(
        paths(moving.start, 0, hi, duration),
      )) {
        const run = schedulePlacementRun({
          items,
          movingId: moving.id,
          hi,
          path,
        });
        for (const step of run) {
          assertScene(
            items,
            step,
            0,
            hi,
            `${moving.id} ${name} @${step.finger} night ${JSON.stringify(night)}`,
          );
          scenes += 1;
        }
        // backing all the way off puts every target back where it was
        if (path.at(-1) === moving.start) {
          const last = run.at(-1);
          for (const item of items.filter((i) => i.id !== moving.id)) {
            assert.deepEqual(
              [
                last.items[item.id].start,
                last.items[item.id].end,
                last.items[item.id].state,
              ],
              [item.start, item.end, "solid"],
              `${moving.id} ${name}: ${item.id} did not come back`,
            );
          }
        }
      }
    }
  }
  assert.ok(scenes > 5000, `${scenes} scenes`);
});

test("the release writes whole minutes, never under 5 minutes, never deletes", () => {
  for (const night of nights) {
    const items = slotsOf(night);
    const hi = Math.max(...night.map(([, end]) => end)) + 30;
    for (const moving of items) {
      const duration = moving.end - moving.start;
      for (const path of Object.values(paths(moving.start, 0, hi, duration))) {
        for (const step of schedulePlacementRun({
          items,
          movingId: moving.id,
          hi,
          path,
        })) {
          const { commit } = step;
          for (const slot of [commit.moving, ...Object.values(commit.items)]) {
            assert.ok(
              Number.isInteger(slot.start) && Number.isInteger(slot.end),
            );
            assert.ok(slot.end - slot.start >= placementFloorMinutes);
          }
          assert.equal(
            Object.keys(commit.items).length + commit.covered.length,
            items.length - 1,
          );
        }
      }
    }
  }
});

test("a neighbour resists: the dragged slot advances slower than the finger, down to 0.35", () => {
  const items = [
    { id: "a", start: 0, end: 60 },
    { id: "b", start: 60, end: 120 },
  ];
  const finger = [0, 10, 20, 30, 40, 50];
  const run = schedulePlacementRun({
    items,
    movingId: "a",
    hi: 480,
    path: finger,
  });
  const ahead = run.map((step) => step.start);
  assert.equal(ahead[0], 0);
  const gaps = ahead.slice(1).map((value, i) => value - ahead[i]);
  assert.ok(
    gaps.every((gap) => gap < 10 && gap > 0.35 * 10 - 1e-9),
    "held back, never stopped",
  );
  assert.ok(
    gaps.every((gap, i) => i === 0 || gap < gaps[i - 1]),
    "ever more",
  );
  assert.equal(run[5].items.b.state, "compressed");
});

test("a neighbour compressed to 10 min escapes to the biggest free stretch", () => {
  const items = [
    { id: "m", start: 60, end: 100 },
    { id: "n", start: 100, end: 160 },
  ];
  // free: 0-60 (60 on the left), 160-480 (320 on the right).
  const path = Array.from({ length: 120 }, (_, i) => 60 + i);
  const right = schedulePlacementRun({ items, movingId: "m", hi: 480, path });
  const hop = right.flatMap((step) => step.hops)[0];
  assert.equal(hop.id, "n");
  assert.equal(hop.toward, "right");
  assert.ok(hop.to.start >= 160 && hop.room.right > hop.room.left);
  // mirrored: the biggest stretch is on the left
  const mirrored = [
    { id: "n", start: 320, end: 380 },
    { id: "m", start: 380, end: 420 },
  ];
  const left = schedulePlacementRun({
    items: mirrored,
    movingId: "m",
    hi: 480,
    path: Array.from({ length: 120 }, (_, i) => 380 - i),
  });
  const leftHop = left.flatMap((step) => step.hops)[0];
  assert.equal(leftHop.toward, "left");
  assert.ok(leftHop.to.end <= 320);
});

test("no free stretch: the neighbour is compressed to 5 min, then covered, never deleted", () => {
  const items = [
    { id: "x", start: 0, end: 30 },
    { id: "a", start: 0, end: 40 },
    { id: "b", start: 40, end: 80 },
    { id: "c", start: 80, end: 120 },
  ];
  const path = Array.from({ length: 91 }, (_, i) => i);
  const run = schedulePlacementRun({
    items,
    movingId: "x",
    hi: 120,
    path,
    added: true,
  });
  const states = new Set(run.map((s) => s.items.a.state));
  assert.ok(
    states.has("compressed") && states.has("squeezed") && states.has("covered"),
  );
  assert.ok(
    run.every((s) => "a" in s.items && "b" in s.items && "c" in s.items),
  );
  assert.ok(run.at(-1).commit.covered.length > 0);
  for (const step of run)
    assertScene(items, step, 0, 120, `full night @${step.finger}`);
  // backing off to the start brings them back
  const back = schedulePlacementRun({
    items,
    movingId: "x",
    hi: 120,
    path: [...path, 0],
    added: true,
  });
  assert.deepEqual(back.at(-1).commit.covered, []);
});

test("a fixed slot (the target in progress, a past one) is never moved nor crossed, and « now » is a floor", () => {
  const items = [
    { id: "past", start: 0, end: 60, fixed: true },
    { id: "m", start: 80, end: 120 },
    { id: "n", start: 130, end: 170 },
    { id: "stuck", start: 200, end: 260, fixed: true },
  ];
  const run = schedulePlacementRun({
    items,
    movingId: "m",
    lo: 70,
    hi: 300,
    path: [
      ...Array.from({ length: 250 }, (_, i) => 80 - i / 2),
      ...Array.from({ length: 250 }, (_, i) => 80 + i),
    ],
  });
  for (const step of run) {
    assert.ok(step.start >= 70 - epsilon, "never before now");
    assert.ok(step.end <= 200 + epsilon, "never across the fixed slot");
    assert.deepEqual(
      [
        step.items.past.start,
        step.items.past.end,
        step.items.stuck.start,
        step.items.stuck.end,
      ],
      [0, 60, 200, 260],
    );
  }
});

test("« now » late in the night leaves the slot inside the night (defect of the former shiftWindow)", () => {
  const items = [{ id: "m", start: 100, end: 200 }];
  const run = schedulePlacementRun({
    items,
    movingId: "m",
    lo: 420,
    hi: 480,
    path: [100, 300, 380, 420, 470],
  });
  for (const step of run) {
    assert.ok(
      step.start >= 420 && step.end <= 480,
      `${step.start}-${step.end}`,
    );
    assert.ok(step.commit.moving.end <= 480);
  }
});

test("a slot added right after a fixed one starts exactly there; what it covers yields or is covered", () => {
  const items = [
    { id: "run", start: 50, end: 110, fixed: true },
    { id: "x", start: 110, end: 170 },
    { id: "n", start: 110, end: 170 },
    { id: "o", start: 170, end: 240 },
  ];
  const [step] = schedulePlacementRun({
    items,
    movingId: "x",
    lo: 70,
    hi: 240,
    added: true,
    path: [110],
  });
  assert.equal(step.start, 110);
  assert.equal(step.items.run.state, "solid");
  assert.equal(step.items.n.state, "covered");
});

test("a gesture is the same at every zoom: the engine only reads minutes, the finger's resolution moves a result by a step at most", () => {
  const items = slotsOf(nights[0]);
  const gesture = (step) =>
    schedulePlacementRun({
      items,
      movingId: items[0].id,
      hi: 600,
      path: Array.from({ length: Math.ceil(300 / step) }, (_, i) => i * step),
    }).at(-1).commit;
  const fine = gesture(0.25);
  for (const step of [0.5, 1, 2]) {
    const coarse = gesture(step);
    const slots = (commit) => [commit.moving, ...Object.values(commit.items)];
    slots(fine).forEach((slot, i) => {
      assert.ok(Math.abs(slot.start - slots(coarse)[i].start) <= step + 1);
      assert.ok(Math.abs(slot.end - slots(coarse)[i].end) <= step + 1);
    });
    assert.deepEqual(coarse.covered, fine.covered);
  }
});

test("createPlacementGesture and the replay agree", () => {
  const items = slotsOf(nights[0]);
  const gesture = createPlacementGesture({
    items,
    movingId: items[1].id,
    hi: 600,
  });
  const direct = gesture.update(200);
  assert.deepEqual(
    placementCommit(gesture, direct),
    schedulePlacementRun({
      items,
      movingId: items[1].id,
      hi: 600,
      path: [200],
    })[0].commit,
  );
});
