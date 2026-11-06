// What is left of a night is what a suggestion of that night works with, and
// the night in progress lasts until dawn.
import assert from "node:assert/strict";
import test from "node:test";
import { QuickPlanAction } from "../src/quick-plan.js";
import {
  suggestionSpanAt,
  suggestionSpanFrom,
  suggestionSpanFromNow,
} from "../src/suggest-span.js";
import { openingNightDate, tonightDate } from "../src/tonight-overview.js";
import { at, base, night } from "./helpers/suggestion-cases.mjs";

test("a running night is suggested from now, to its end", () => {
  assert.deepEqual(suggestionSpanFromNow(night, Date.parse(at(240))), {
    start: at(240),
    end: night.end,
  });
});

test("before the night starts, and once it is over, the whole night (null)", () => {
  assert.equal(suggestionSpanFromNow(night, Date.parse(at(-30))), null);
  assert.equal(suggestionSpanFromNow(night, Date.parse(at(720))), null);
  assert.equal(suggestionSpanFromNow(night, Date.parse(at(900))), null);
  assert.equal(suggestionSpanFromNow({ start: "x", end: "y" }, 0), null);
});

test("a span narrowed to begin at a moment keeps its own start when that is later", () => {
  const span = { start: at(300), end: at(600) };
  assert.deepEqual(suggestionSpanFrom(span, night, Date.parse(at(100))), span);
  assert.deepEqual(suggestionSpanFrom(span, night, Date.parse(at(400))), {
    start: at(400),
    end: at(600),
  });
  assert.deepEqual(suggestionSpanFrom(null, night, Date.parse(at(100))), {
    start: at(100),
    end: night.end,
  });
});

test("the planner narrows the plan's span only while the night runs", () => {
  const span = { start: at(60), end: at(660) };
  assert.deepEqual(suggestionSpanAt(span, night, Date.parse(at(240))), {
    start: at(240),
    end: at(660),
  });
  assert.deepEqual(suggestionSpanAt(span, night, Date.parse(at(-60))), span);
  assert.equal(suggestionSpanAt(null, night, Date.parse(at(800))), null);
});

test("no target is proposed in the hours already past", async () => {
  const quick = (span) =>
    new QuickPlanAction({
      document: { plans: [], nights: [] },
      date: "2026-10-14",
      location: { name: "Lac", latitude: "45", longitude: "-30" },
      name: "Nuit",
      newSettings: { equipment: {} },
      capabilities: { "planner.multiple": false },
      inputsFor: async () => base,
      persist: async () => {},
      span,
      id: () => "quick",
    });
  const now = Date.parse(at(300));
  const whole = await quick(null).create(new Set(["t00", "t01"]));
  assert.ok(
    whole.plan.items.some((entry) => entry.startMinute < 300),
    "the control: from the dusk, slots lie before the moment",
  );
  const fromNow = await quick(suggestionSpanFromNow(night, now)).create(
    new Set(["t00", "t01"]),
  );
  assert.equal(fromNow.kind, "created");
  assert.ok(fromNow.plan.items.length > 0);
  assert.ok(
    fromNow.plan.items.every((entry) => entry.startMinute >= 300),
    "every slot begins after now",
  );
});

test("a merge into the plan of a running night also starts from now", async () => {
  const location = { name: "Lac", latitude: "45", longitude: "-30" };
  const old = {
    id: "old",
    name: "Plan",
    status: "pending",
    date: "2026-10-14",
    location,
    items: [],
  };
  const action = new QuickPlanAction({
    document: { plans: [old], nights: [] },
    date: "2026-10-14",
    location,
    name: "Nuit",
    newSettings: { equipment: {} },
    capabilities: { "planner.multiple": false },
    inputsFor: async () => base,
    persist: async () => {},
    span: suggestionSpanFromNow(night, Date.parse(at(400))),
  });
  const result = await action.merge(new Set(["t00"]));
  assert.equal(result.kind, "merged");
  assert.ok(result.plan.items.every((entry) => entry.startMinute >= 400));
});

test("the night that the ticked targets cannot be placed on is an empty result, never a plan", async () => {
  const action = new QuickPlanAction({
    document: { plans: [], nights: [] },
    date: "2026-10-14",
    location: { name: "Lac", latitude: "45", longitude: "-30" },
    name: "Nuit",
    newSettings: { equipment: {} },
    capabilities: { "planner.multiple": false },
    inputsFor: async () => base,
    persist: async () => assert.fail("nothing is written"),
    // Eight minutes of night are left: not one target.
    span: { start: at(712), end: at(720) },
  });
  assert.equal((await action.create(new Set(["t00"]))).kind, "empty");
});

// Tokyo, 2026-10-21: the dawn that ends the night of the 20th is at 04:33.
const nagano = {
  latitude: "36.0458",
  longitude: "138.2433",
  timeZone: "Asia/Tokyo",
};
const jst = (clock) => Date.parse(`2026-10-21T${clock}:00+09:00`);

test("the night in progress lasts until dawn: at 01:10 it is the night of the 20th", () => {
  assert.equal(tonightDate({ now: jst("01:10"), place: nagano }), "2026-10-20");
  assert.equal(tonightDate({ now: jst("12:00"), place: nagano }), "2026-10-21");
});

test("the planner opens on the night in progress once its place is known", () => {
  const open = (clock, extra = {}) =>
    openingNightDate({
      date: "2026-10-21",
      place: nagano,
      zone: "Asia/Tokyo",
      now: jst(clock),
      ...extra,
    });
  // Past midnight the browser's civil date is already the next night's.
  assert.equal(open("01:10"), "2026-10-20");
  assert.equal(open("04:00"), "2026-10-20");
  // After dawn it is the day's own night.
  assert.equal(open("05:00"), "2026-10-21");
  assert.equal(open("12:00"), "2026-10-21");
  // A night to come the person chose, or any night that holds a plan, is kept.
  assert.equal(open("01:10", { date: "2026-10-25" }), "2026-10-25");
  assert.equal(open("01:10", { planDates: ["2026-10-21"] }), "2026-10-21");
  assert.equal(
    open("12:00", { date: "2026-10-18", planDates: ["2026-10-18"] }),
    "2026-10-18",
  );
  // A night that is over and holds nothing is not a place to land: the date
  // chosen at 01:10 of the 21st (the 20th) is the 21st's at noon.
  assert.equal(open("12:00", { date: "2026-10-20" }), "2026-10-21");
  assert.equal(open("12:00", { date: "2026-10-01" }), "2026-10-21");
  // Without a place, the browser's civil date, as before.
  assert.equal(open("01:10", { place: null }), "2026-10-21");
});
