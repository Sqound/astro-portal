// "Après 21:09, Lune levée : rien de satisfaisant ne reste" was said on a night
// where the Moon sets at 01:49 and the night runs to 04:01, while the planner's
// own suggestions placed a target at 02:16 -- the two windows read one Moon,
// and the sentence is only true of a stretch the Moon is up over from end to
// end. The same engine (`suggestNight`) answers both.
import assert from "node:assert/strict";
import test from "node:test";
import { suggestNight } from "../src/suggest-night.js";

const nightStart = Date.UTC(2026, 9, 20, 10, 17, 0); // 19:17 at +09:00
const nightLength = 524; // to 04:01
const night = {
  start: new Date(nightStart).toISOString(),
  end: new Date(nightStart + nightLength * 60000).toISOString(),
};
const at = (minute) => new Date(nightStart + minute * 60000).toISOString();
const minuteOf = (iso) => (Date.parse(iso) - nightStart) / 60000;
const MOONSET = 392; // 01:49

function card(id, from, to) {
  const series = [];
  for (let minute = 0; minute <= nightLength; minute += 10)
    series.push({
      time: at(minute),
      altitude: minute >= from && minute <= to ? 60 : 10,
    });
  return {
    target: { id, designation: id.toUpperCase(), title: "", skyTarget: {} },
    series,
    visibilityWindows: [{ start: at(from), end: at(to) }],
    usableStart: at(from),
    usableEnd: at(to),
    integration: { available: true, recommendedMinutes: 60 },
  };
}
const evening = card("evening", 0, 112); // up until 21:09
const late = card("late", 419, 524); // up from 02:16
const pool = [evening, late].map((entry) => ({
  card: entry,
  score: { total: 70, max: 100 },
}));
// The Moon up until 01:49, then down; sampled every ten minutes, the night's
// end included, as `planNightSpanSky` does.
const moonSeries = [
  ...Array.from({ length: 53 }, (_, index) => index * 10),
  nightLength,
].map((minute) => ({
  time: at(minute),
  altitude: minute < MOONSET ? 30 : -20,
}));
const request = {
  candidates: pool,
  night,
  moonSeries,
  hourly: [],
  ownedFilters: [],
  mode: "imaging",
  layout: "night",
};

test("« Cette nuit »: the evening target asked for, the Moon up till 01:49 is not the reason nothing follows", () => {
  const proposal = suggestNight({
    ...request,
    only: ["evening"],
    count: 3,
    placement: "ideal",
  });
  assert.deepEqual(
    proposal.items.map((entry) => entry.target.id),
    ["evening"],
  );
  assert.ok(proposal.shortfall, "a shortfall is told");
  assert.notEqual(proposal.shortfall.kind, "moon");
  for (const slot of proposal.free)
    if (slot.reason.kind === "moon")
      assert.ok(
        minuteOf(slot.end) <= MOONSET,
        "« Lune levée » is said of a stretch the Moon is up over",
      );
});

test("the planner's window and « Cette nuit » place the same target after moonset", () => {
  const planner = suggestNight({ ...request, count: 3, placement: "ideal" });
  const tonight = suggestNight({
    ...request,
    only: ["evening", "late"],
    count: 2,
    placement: "ideal",
  });
  for (const proposal of [planner, tonight]) {
    const after = proposal.items.find((entry) => entry.target.id === "late");
    assert.ok(after, "a target is placed after the Moon sets");
    assert.ok(minuteOf(after.start) >= MOONSET, "after 01:49");
  }
  assert.deepEqual(
    tonight.items.map((entry) => [entry.target.id, entry.startMinute]),
    planner.items.map((entry) => [entry.target.id, entry.startMinute]),
  );
});

test("a stretch the Moon is up over from end to end is still « Lune levée », and it cites its start", () => {
  const proposal = suggestNight({
    ...request,
    candidates: [pool[0]],
    only: ["evening"],
    count: 3,
    placement: "ideal",
    moonSeries: moonSeries.map((point) => ({ ...point, altitude: 30 })),
  });
  assert.equal(proposal.shortfall.kind, "moon");
  assert.equal(proposal.shortfall.start, proposal.free.at(-1).start);
});
