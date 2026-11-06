import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  conditionsCalendar,
  conditionsToday,
} from "planner/conditions-calendar.js";
import { tonightSubject } from "planner/tonight-overview.js";

// The night "Cette nuit" shows is the one the displayed place is in, from its
// longitude, whatever the plan's date and the device's zone. One instant, two
// places: 07:30 on the 15th at the eastern place, the small hours of the 15th
// (still the night of the 14th) at the western one. The same cases are recorded
// in `packages/astro-contracts/fixtures/tonight-subject-night.json`.
const east = {
  id: "est",
  name: "Pré des Brumes",
  latitude: "45",
  longitude: "135",
  timeZone: "Asia/Tokyo",
};
const west = {
  id: "ouest",
  name: "Lande du Vent",
  latitude: "45",
  longitude: "2",
  timeZone: "Europe/Paris",
};
const morning = Date.parse("2026-10-14T22:30:00Z");
const plan = (id, date, location) => ({
  id,
  date,
  status: "pending",
  location,
});

test("a place chosen in the small hours of the night before shows that night, not the plan's date", () => {
  const document = {
    plans: [plan("e15", "2026-10-15", east)],
    location: east,
  };
  const atEast = tonightSubject({ document, now: morning });
  assert.equal(atEast.date, "2026-10-15");
  assert.deepEqual(
    atEast.plans.map((entry) => entry.id),
    ["e15"],
  );

  const atWest = tonightSubject({ document, now: morning, chosen: west });
  assert.equal(atWest.place.id, "ouest");
  assert.equal(atWest.date, "2026-10-14");
  assert.deepEqual(atWest.plans, []);
  assert.equal(atWest.settings, null);
});

test("a plan moved to the western place keeps its date and is not tonight's there", () => {
  // "Changer" moves the plan and chooses the place, as one gesture.
  const document = { plans: [plan("w15", "2026-10-15", west)] };
  const subject = tonightSubject({ document, now: morning, chosen: west });
  assert.equal(subject.place.id, "ouest");
  assert.equal(subject.date, "2026-10-14");
  assert.deepEqual(subject.plans, []);
});

test("the plan of the night lived at the place is tonight's, its neighbour is not", () => {
  const document = {
    plans: [plan("w14", "2026-10-14", west), plan("w15", "2026-10-15", west)],
  };
  const subject = tonightSubject({ document, now: morning });
  assert.equal(subject.date, "2026-10-14");
  assert.deepEqual(
    subject.plans.map((entry) => entry.id),
    ["w14"],
  );
});

test("the recorded cases agree with the explicit nights above", () => {
  const fixture = JSON.parse(
    readFileSync(
      new URL(
        "../../astro-contracts/fixtures/tonight-subject-night.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const dates = Object.fromEntries(
    fixture.cases.map((entry) => [entry.id, entry.result.date]),
  );
  assert.equal(dates["same-instant-east-place"], "2026-10-15");
  assert.equal(dates["same-instant-west-place"], "2026-10-14");
  assert.equal(dates["same-instant-east-place-without-zone"], "2026-10-15");
  assert.equal(dates["same-instant-west-place-without-zone"], "2026-10-14");
});

test("[COND]: the calendar's today is the night of the place, from its longitude, on the same instant", () => {
  const atEast = conditionsToday({ place: east, now: morning });
  const atWest = conditionsToday({ place: west, now: morning });
  assert.equal(atEast, "2026-10-15");
  assert.equal(atWest, "2026-10-14");
  // Without a zone the longitude says the same.
  const { timeZone: _east, ...eastBare } = east;
  const { timeZone: _west, ...westBare } = west;
  assert.equal(conditionsToday({ place: eastBare, now: morning }), atEast);
  assert.equal(conditionsToday({ place: westBare, now: morning }), atWest);
  // No coordinates yet: the UTC date.
  assert.equal(conditionsToday({ place: null, now: morning }), "2026-10-14");

  const kind = (today) =>
    conditionsCalendar({ today, place: west }).cells["2026-10-14"].kind;
  assert.equal(kind(atWest), "forecast", "the night being lived in the west");
  assert.equal(kind(atEast), "past", "already behind the eastern place");
});
