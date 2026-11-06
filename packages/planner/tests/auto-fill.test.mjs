import assert from "node:assert/strict";
import test from "node:test";
import {
  autoFillFreeSlots,
  autoFillNight,
  autoFillRule,
} from "../src/auto-fill.js";

const nightStart = Date.UTC(2026, 9, 14, 19, 48, 0);
const nightLength = 520;
const night = {
  start: new Date(nightStart).toISOString(),
  end: new Date(nightStart + nightLength * 60000).toISOString(),
};
const at = (minute) => new Date(nightStart + minute * 60000).toISOString();

// A dome of altitude: `peak` degrees at minute `centre`, falling by
// `width` minutes either side to zero. Sampled every ten minutes, like
// `planNight`. The quality window is where it stays above 30 degrees.
function card({
  id,
  centre,
  peak = 80,
  width = 260,
  recommendedMinutes = 90,
  type = "Galaxie",
  title = "",
  cut = null,
}) {
  const altitude = (minute) =>
    peak - ((minute - centre) ** 2 * peak) / width ** 2;
  const series = [];
  for (let minute = 0; minute <= nightLength; minute += 10)
    series.push({ time: at(minute), altitude: altitude(minute) });
  const half = width * Math.sqrt(1 - 30 / peak);
  const window = {
    start: Math.max(0, cut ? cut[0] : centre - half),
    end: Math.min(nightLength, cut ? cut[1] : centre + half),
  };
  return {
    target: {
      id,
      designation: id.toUpperCase(),
      title,
      skyTarget: { typeKey: type },
    },
    series,
    visibilityWindows: [{ start: at(window.start), end: at(window.end) }],
    usableStart: at(window.start),
    usableEnd: at(window.end),
    integration: { available: true, recommendedMinutes },
  };
}

const score = (total, max = 100) => ({ total, max });
const entry = (cardValue, scoreValue = null) => ({
  card: cardValue,
  score: scoreValue,
});
const item = (id, start, end) => ({
  id,
  startMinute: start,
  endMinute: end,
  durationMinutes: end - start,
});

function fill(overrides = {}) {
  return autoFillNight({
    night,
    span: null,
    items: [],
    hourly: [],
    moonSeries: [],
    ownedFilters: [],
    mode: "imaging",
    ...overrides,
  });
}

test("the targets are placed by score, the best one first, whatever the order they come in", () => {
  // Both want the middle of the night, 90 minutes each, and only one can
  // have it: the better score keeps the ideal position.
  const low = card({ id: "low", centre: 260 });
  const high = card({ id: "high", centre: 260 });
  const proposal = fill({
    candidates: [entry(low, score(40)), entry(high, score(80))],
  });
  const byId = Object.fromEntries(
    proposal.items.map((proposed) => [proposed.target.id, proposed]),
  );
  assert.equal(byId.high.placement, "ideal");
  assert.equal(byId.high.startMinute, 215);
  assert.notEqual(byId.low.placement, "ideal");
});

test("a score is compared as a share of its own maximum", () => {
  const first = card({ id: "a", centre: 260 });
  const second = card({ id: "b", centre: 260 });
  // 62/80 = 77.5 % beats 75/100.
  const proposal = fill({
    candidates: [entry(second, score(75, 100)), entry(first, score(62, 80))],
  });
  assert.equal(
    proposal.items.find((proposed) => proposed.target.id === "a").placement,
    "ideal",
  );
});

test("equal scores go to the earlier culmination, then to the id", () => {
  const late = card({ id: "late", centre: 300, recommendedMinutes: 120 });
  const early = card({ id: "early", centre: 220, recommendedMinutes: 120 });
  const proposal = fill({
    candidates: [entry(late, score(70)), entry(early, score(70))],
  });
  assert.equal(
    proposal.items.find((proposed) => proposed.target.id === "early").placement,
    "ideal",
  );
  const twinA = card({ id: "twin-a", centre: 260 });
  const twinB = card({ id: "twin-b", centre: 260 });
  const reversed = fill({
    candidates: [entry(twinB, score(70)), entry(twinA, score(70))],
  });
  assert.equal(
    reversed.items.find((proposed) => proposed.target.id === "twin-a")
      .placement,
    "ideal",
  );
});

test("a target without a score comes after every scored one", () => {
  const unscored = card({ id: "unscored", centre: 260 });
  const scored = card({ id: "scored", centre: 260 });
  const proposal = fill({
    candidates: [entry(unscored, null), entry(scored, score(10))],
  });
  assert.equal(
    proposal.items.find((proposed) => proposed.target.id === "scored")
      .placement,
    "ideal",
  );
});

test("a slot lasts 45 minutes at least: a recommended time under it is raised to it", () => {
  const brief = card({ id: "brief", centre: 260, recommendedMinutes: 20 });
  const proposal = fill({ candidates: [entry(brief, score(60))] });
  assert.equal(proposal.items[0].durationMinutes, autoFillRule.minimumMinutes);
});

test("a gap shorter than 45 minutes is left alone and a target the cascade can only shorten below it is skipped", () => {
  const wide = card({ id: "wide", centre: 260, recommendedMinutes: 100 });
  // Seen only in a 40-minute window that the plan already holds most of.
  const narrow = card({ id: "narrow", centre: 260, cut: [200, 240] });
  const proposal = fill({
    candidates: [entry(narrow, score(90)), entry(wide, score(50))],
  });
  assert.deepEqual(
    proposal.items.map((proposed) => proposed.target.id),
    ["wide"],
  );
  assert.ok(proposal.items.every((proposed) => proposed.durationMinutes >= 45));
  // A shortened placement must stay at the floor or above.
  const crowded = fill({
    items: [item("held", 0, 190), item("held-2", 250, 520)],
    candidates: [
      entry(
        card({ id: "fits", centre: 220, recommendedMinutes: 120 }),
        score(80),
      ),
    ],
  });
  assert.equal(crowded.items.length, 1);
  assert.equal(crowded.items[0].placement, "shortened");
  assert.equal(crowded.items[0].durationMinutes, 60);
  const tooTight = fill({
    items: [item("held", 0, 210), item("held-2", 250, 520)],
    candidates: [
      entry(
        card({ id: "fits", centre: 220, recommendedMinutes: 120 }),
        score(80),
      ),
    ],
  });
  assert.deepEqual(tooTight.items, []);
});

test("a long recommended time is capped at three hours, so a night holds several targets", () => {
  const proposal = fill({
    candidates: [
      entry(
        card({ id: "a", centre: 200, width: 300, recommendedMinutes: 420 }),
        score(90),
      ),
      entry(
        card({ id: "b", centre: 320, width: 300, recommendedMinutes: 400 }),
        score(80),
      ),
    ],
  });
  assert.equal(proposal.items.length, 2);
  assert.ok(
    proposal.items.every(
      (proposed) => proposed.durationMinutes <= autoFillRule.maximumSlotMinutes,
    ),
  );
  assert.equal(proposal.items[0].durationMinutes, 180);
});

test("six targets at most", () => {
  const pool = Array.from({ length: 9 }, (_, index) =>
    entry(
      card({
        id: `t${index}`,
        centre: 60 + index * 50,
        recommendedMinutes: 45,
        width: 110,
      }),
      score(90 - index),
    ),
  );
  const proposal = fill({ candidates: pool });
  assert.equal(proposal.items.length, autoFillRule.maximumTargets);
  const ids = proposal.items.map((proposed) => proposed.target.id);
  assert.ok(ids.includes("t0") && !ids.includes("t8"));
});

test("what is already in the plan stays where it is and its targets are not proposed again", () => {
  const items = [item("m31", 100, 220)];
  const proposal = fill({
    items,
    candidates: [
      entry(card({ id: "m31", centre: 160 }), score(99)),
      entry(
        card({ id: "m45", centre: 160, recommendedMinutes: 100 }),
        score(60),
      ),
    ],
  });
  assert.deepEqual(items, [item("m31", 100, 220)]);
  assert.deepEqual(
    proposal.items.map((proposed) => proposed.target.id),
    ["m45"],
  );
  for (const proposed of proposal.items)
    assert.ok(proposed.endMinute <= 100 || proposed.startMinute >= 220);
});

test("a proposal never overlaps itself or the plan", () => {
  const items = [item("held", 150, 250)];
  const pool = Array.from({ length: 5 }, (_, index) =>
    entry(
      card({
        id: `p${index}`,
        centre: 200 + index * 20,
        recommendedMinutes: 120,
      }),
      score(70 - index),
    ),
  );
  const proposal = fill({ items, candidates: pool });
  const all = [
    ...items.map((held) => ({ start: held.startMinute, end: held.endMinute })),
    ...proposal.items.map((proposed) => ({
      start: proposed.startMinute,
      end: proposed.endMinute,
    })),
  ].sort((left, right) => left.start - right.start);
  for (let index = 1; index < all.length; index += 1)
    assert.ok(all[index].start >= all[index - 1].end);
});

test("the plan's span of the night is respected", () => {
  const span = { start: at(120), end: at(300) };
  const proposal = fill({
    span,
    candidates: [
      entry(card({ id: "a", centre: 80, recommendedMinutes: 120 }), score(90)),
      entry(card({ id: "b", centre: 400, recommendedMinutes: 120 }), score(80)),
      entry(card({ id: "c", centre: 220, recommendedMinutes: 120 }), score(70)),
    ],
  });
  assert.equal(proposal.window.startMinute, 120);
  assert.equal(proposal.window.endMinute, 300);
  assert.ok(proposal.items.length >= 1);
  for (const proposed of proposal.items) {
    assert.ok(proposed.startMinute >= 120 && proposed.endMinute <= 300);
  }
  for (const slot of proposal.free)
    assert.ok(slot.startMinute >= 120 && slot.endMinute <= 300);
});

test("each target says why: the meridian, before the dew, high from dusk, or its best window", () => {
  const hourly = Array.from({ length: 10 }, (_, index) => ({
    time: nightStart + (index - 1) * 3600000 + 12 * 60000,
    cloud: 10,
    dewRisk: index >= 6 ? "high" : "low",
  }));
  const dusk = card({ id: "dusk", centre: -60, peak: 85, width: 300 });
  const meridian = card({
    id: "meridian",
    centre: 420,
    recommendedMinutes: 100,
  });
  const dew = card({ id: "dew", centre: 200, recommendedMinutes: 100 });
  const edge = card({
    id: "edge",
    centre: 700,
    peak: 60,
    width: 520,
    recommendedMinutes: 60,
  });
  const proposal = fill({
    hourly,
    ownedFilters: [{ name: "Duo-band" }],
    candidates: [
      entry(
        { ...dusk, target: { ...dusk.target, typeKey: "emission" } },
        score(90),
      ),
      entry(meridian, score(80)),
      entry(dew, score(70)),
      entry(edge, score(60)),
    ],
  });
  const reasons = Object.fromEntries(
    proposal.items.map((proposed) => [proposed.target.id, proposed.reason]),
  );
  assert.equal(reasons.dusk.kind, "high-from-dusk");
  assert.equal(reasons.meridian.kind, "meridian");
  assert.equal(reasons.dew.kind, "culmination-before-dew");
  assert.match(reasons.meridian.time, /T\d\d:\d\d:00\.000Z$/);
  assert.equal(
    proposal.items.find((p) => p.target.id === "edge").reason.kind,
    "best-window",
  );
});

test("a dual-band target is said to be so only when the observer has a dual-band filter", () => {
  const nebula = {
    ...card({ id: "nebula", centre: -60, peak: 85, width: 300 }),
  };
  nebula.target.knowledge = {
    observingGuide: { photoFilterFamilies: ["dual"] },
  };
  const withFilter = fill({
    ownedFilters: [{ name: "L-eXtreme" }],
    candidates: [entry(nebula, score(80))],
  });
  const without = fill({
    ownedFilters: [{ name: "UV/IR cut" }],
    candidates: [entry(nebula, score(80))],
  });
  assert.equal(withFilter.items[0].reason.kind, "high-from-dusk");
  assert.equal(withFilter.items[0].reason.dualBand, true);
  assert.equal(without.items[0].reason.dualBand, false);
});

test("the highest altitude of an item is read inside its own slot", () => {
  const proposal = fill({
    candidates: [entry(card({ id: "dome", centre: 260, peak: 80 }), score(80))],
  });
  assert.equal(proposal.items[0].maxAltitude, 80);
  const flank = fill({
    items: [item("held", 0, 200)],
    candidates: [
      entry(card({ id: "dome", centre: 150, peak: 80, width: 200 }), score(80)),
    ],
  });
  assert.ok(flank.items[0].maxAltitude < 80);
  assert.ok(flank.items[0].maxAltitude > 30);
});

test("each free slot left says why", () => {
  const dewHours = Array.from({ length: 10 }, (_, index) => ({
    time: nightStart + (index - 1) * 3600000,
    cloud: 20,
    dewRisk: "high",
  }));
  const target = (id, centre, extra = {}) =>
    entry(
      card({ id, centre, width: 120, recommendedMinutes: 60, ...extra }),
      score(80),
    );
  // A target in the first third of the night; the rest is empty.
  const common = { candidates: [target("early", 80, { cut: [0, 100] })] };
  assert.equal(fill(common).free.at(-1).reason.kind, "no-target");
  assert.equal(
    fill({
      ...common,
      hourly: dewHours.map((row) => ({ ...row, cloud: 90 })),
    }).free.at(-1).reason.kind,
    "clouds",
  );
  assert.equal(
    fill({
      ...common,
      hourly: dewHours.map((row) => ({ ...row, cloud: 90 })),
    }).free.at(-1).reason.cloud,
    90,
  );
  // Only already-placed targets are up in the free stretch: nothing else.
  const wideTarget = entry(
    card({ id: "wide", centre: 260, width: 300, recommendedMinutes: 60 }),
    score(80),
  );
  const nothing = fill({ candidates: [wideTarget] });
  assert.ok(nothing.free.length >= 1);
  assert.ok(
    ["nothing", "dew", "moon"].includes(nothing.free.at(-1).reason.kind),
  );
  assert.equal(
    fill({ candidates: [wideTarget], hourly: dewHours }).free.every(
      (slot) => slot.reason.kind === "dew" || slot.reason.kind === "no-target",
    ),
    true,
  );
  const moonUp = fill({
    candidates: [wideTarget],
    moonSeries: Array.from({ length: 60 }, (_, index) => ({
      time: at(index * 10),
      altitude: 30,
    })),
  });
  assert.ok(
    moonUp.free.every((slot) =>
      ["moon", "no-target"].includes(slot.reason.kind),
    ),
  );
});

test("the limit of six targets is named when more would have fitted", () => {
  const pool = Array.from({ length: 8 }, (_, index) =>
    entry(
      card({
        id: `x${index}`,
        centre: 260,
        width: 300,
        recommendedMinutes: 45,
      }),
      score(90 - index),
    ),
  );
  const proposal = fill({ candidates: pool });
  assert.equal(proposal.items.length, autoFillRule.maximumTargets);
  assert.ok(proposal.free.some((slot) => slot.reason.kind === "limit"));
});

test("a slot of 15 to 44 minutes is listed as too short; a shorter one is not listed", () => {
  const proposal = fill({
    items: [item("a", 0, 100), item("b", 130, 300), item("c", 308, 520)],
    candidates: [],
  });
  assert.deepEqual(
    proposal.free.map((slot) => [
      slot.startMinute,
      slot.endMinute,
      slot.reason.kind,
    ]),
    [[100, 130, "short"]],
  );
  assert.equal(proposal.freeMinutes, 30);
});

test("the totals add up: imaging and free minutes", () => {
  const proposal = fill({
    candidates: [
      entry(card({ id: "a", centre: 150, recommendedMinutes: 120 }), score(80)),
      entry(card({ id: "b", centre: 350, recommendedMinutes: 90 }), score(70)),
    ],
  });
  assert.equal(
    proposal.imagingMinutes,
    proposal.items.reduce((sum, proposed) => sum + proposed.durationMinutes, 0),
  );
  assert.equal(
    proposal.freeMinutes,
    proposal.free.reduce((sum, slot) => sum + slot.minutes, 0),
  );
  const occupied = proposal.imagingMinutes + proposal.freeMinutes;
  assert.ok(occupied <= nightLength);
});

test("the proposal is the same however the pool is ordered, and every time", () => {
  const pool = Array.from({ length: 7 }, (_, index) =>
    entry(
      card({
        id: `d${index}`,
        centre: 70 + index * 60,
        width: 150,
        recommendedMinutes: 60 + index * 5,
      }),
      score(50 + (index % 3) * 10),
    ),
  );
  const first = fill({ candidates: pool });
  const again = fill({ candidates: pool });
  const reversed = fill({ candidates: pool.slice().reverse() });
  assert.deepEqual(again, first);
  assert.deepEqual(reversed, first);
});

test("nothing to propose: no target, the whole free time left with its reason", () => {
  const proposal = fill({ candidates: [] });
  assert.deepEqual(proposal.items, []);
  assert.equal(proposal.imagingMinutes, 0);
  assert.equal(proposal.free.length, 1);
  assert.equal(proposal.free[0].startMinute, 0);
  assert.equal(proposal.free[0].endMinute, nightLength);
  assert.equal(proposal.free[0].reason.kind, "no-target");
});

test("a night that cannot be read gives no proposal", () => {
  assert.equal(autoFillNight({ candidates: [], night: null }), null);
  assert.equal(
    autoFillNight({ candidates: [], night: { start: "x", end: "y" } }),
    null,
  );
});

test("the free time of a plan, for the entry of the action", () => {
  assert.deepEqual(
    autoFillFreeSlots({ night, span: null, items: [item("a", 0, 500)] }),
    [],
  );
  assert.deepEqual(
    autoFillFreeSlots({
      night,
      span: null,
      items: [item("a", 100, 200), item("b", 230, 520)],
    }),
    [{ startMinute: 0, endMinute: 100, minutes: 100 }],
  );
  assert.deepEqual(
    autoFillFreeSlots({
      night,
      span: { start: at(90), end: at(160) },
      items: [item("a", 100, 120)],
    }),
    [],
  );
  assert.deepEqual(autoFillFreeSlots({ night: null }), []);
});
