import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  cardHeading,
  hoursText,
  promiseText,
  totalBlock,
} from "../dist/components/sessions/journal-list-view.js";
import {
  givenSessionName,
  sessionHeading,
  sessionHours,
  sessionHoursOfPlaces,
} from "../dist/components/sessions/session-page-view.js";

// A session is called by the name the person gave it, else by its night; and
// the hours of a session are the place's — « UTC », written, only when the
// place has no zone.

const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../../astro-contracts/fixtures/session-hours.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("the name: the night's own title, never the plan's name read through it", () => {
  assert.equal(
    givenSessionName({
      title: { value: " audit-bob-renomme-web ", source: "night" },
    }),
    "audit-bob-renomme-web",
  );
  // Read through the plan while the person never set it: no name.
  assert.equal(
    givenSessionName({
      title: { value: "Nuit du 19 octobre", source: "plan" },
    }),
    null,
  );
  assert.equal(
    givenSessionName({ title: { value: "  ", source: "night" } }),
    null,
  );
  assert.equal(
    givenSessionName({ title: { value: null, source: "night" } }),
    null,
  );
  assert.equal(givenSessionName(null), null);
});

test("the head: the name with the night under it, else « Session · Nuit du … » alone", () => {
  const named = sessionHeading({
    night: { title: { value: "audit-bob-renomme-web", source: "night" } },
    eveningDate: "2026-10-19",
    locale: "fr",
  });
  assert.equal(named.title, "audit-bob-renomme-web");
  assert.equal(named.nightLine, "Nuit du 19 au 20 oct.");
  const unnamed = sessionHeading({
    night: { title: { value: "Nuit du 19 octobre", source: "plan" } },
    eveningDate: "2026-10-19",
    locale: "fr",
  });
  assert.equal(unnamed.title, "Session · Nuit du 19 au 20 oct.");
  assert.equal(unnamed.nightLine, null);
  assert.equal(
    sessionHeading({ night: null, eveningDate: "2026-10-19", locale: "en" })
      .title,
    "Session · Night of Oct 19 to 20",
  );
});

test("the card of the Journal: the name heads it, the place goes under; no name, the place heads it as before", () => {
  const line = {
    placeName: "Col des Mélèzes",
    instrumentLabel: "Askar 50P",
    state: "executed",
  };
  assert.deepEqual(
    cardHeading({ ...line, title: "audit-bob-renomme-web" }, "fr"),
    {
      title: "audit-bob-renomme-web",
      named: true,
      line: "Col des Mélèzes · Askar 50P",
    },
  );
  assert.deepEqual(cardHeading({ ...line, title: null }, "fr"), {
    title: "Col des Mélèzes · Askar 50P",
    named: false,
    line: "",
  });
});

test("the same session reads the same hour on both sides — a place with a time zone, a place without (the phone replays this fixture)", () => {
  assert.ok(fixture.cases.length >= 11);
  for (const { id, args, result } of fixture.cases)
    assert.equal(sessionHoursOfPlaces(...args), result, id);
  const hours = (id) => fixture.cases.find((entry) => entry.id === id).result;
  // A session: 14:18 UTC in a garden in Tokyo is 23:18 there.
  assert.equal(hours("a-place-in-japan-reads-japanese-hours"), "23:18 → 23:19");
  assert.equal(
    hours("a-place-with-a-zone-reads-its-own-hours"),
    "23:08 → 05:48",
  );
  // A night in a garden in Tokyo (09:29 -> 19:23 UTC) is 18:29 -> 04:23
  // there, with the zone or by the position alone; the date row of « La
  // nuit » and the journal's entries write these very hours.
  assert.equal(
    hours("the-audit-night-in-tokyo-reads-18-29-to-04-23"),
    "18:29 → 04:23",
  );
  assert.equal(
    hours("the-audit-night-by-position-only-reads-the-table-zone"),
    "18:29 → 04:23",
  );
  assert.equal(
    hours("the-audit-night-without-a-zone-or-a-position-is-in-utc"),
    "09:29 → 19:23 UTC",
  );
  // No zone to read: UTC, written once.
  assert.equal(
    hours("a-place-with-no-zone-and-no-position-is-in-utc"),
    "21:08 → 03:48 UTC",
  );
  assert.equal(hours("a-zone-of-utc-is-utc-written"), "21:08 → 03:48 UTC");
  assert.equal(hours("a-night-that-ends-with-its-start-tells-no-hours"), null);
});

test("« Etc/UTC » is UTC, written, as on the phone", () => {
  assert.equal(
    sessionHours("2026-10-07T21:08:00Z", "2026-10-08T03:48:00Z", "Etc/UTC"),
    "21:08 → 03:48 UTC",
  );
});

test("the Journal's list writes the hours of the place the service names, « UTC » when it names none", () => {
  const session = {
    startedAt: "2026-10-19T14:18:00.000Z",
    finishedAt: "2026-10-19T14:19:00.000Z",
    acquiredSeconds: 60,
    targets: [],
    state: "executed",
  };
  assert.equal(
    hoursText({ ...session, placeTimeZone: "Asia/Tokyo" }),
    "23:18 → 23:19",
  );
  assert.equal(
    hoursText({ ...session, placeTimeZone: null }),
    "14:18 → 14:19 UTC",
  );
  assert.equal(
    hoursText({ ...session, placeTimeZone: "UTC" }),
    "14:18 → 14:19 UTC",
  );
  assert.equal(
    hoursText({ ...session, placeTimeZone: "Etc/UTC" }),
    "14:18 → 14:19 UTC",
  );
  // A line of an older service (no field) is in UTC, as it always was.
  assert.equal(hoursText(session), "14:18 → 14:19 UTC");
  assert.match(
    totalBlock({ ...session, placeTimeZone: "Asia/Tokyo" }, "fr").line,
    /23:18 → 23:19$/,
  );
  // The promise of a night to debrief reads the plan's hours in the place's.
  const promise = {
    state: "to_debrief",
    plannedSeconds: 3600,
    placeTimeZone: "Asia/Tokyo",
    targets: [
      { targetId: "m31", label: "M31", planItemId: "m31", state: "planned" },
    ],
  };
  const slots = {
    m31: {
      start: Date.parse("2026-10-19T14:00:00Z"),
      end: Date.parse("2026-10-19T15:00:00Z"),
    },
  };
  assert.match(promiseText(promise, "fr", slots), /M31 23:00 → 00:00/);
  assert.match(
    promiseText({ ...promise, placeTimeZone: null }, "fr", slots),
    /M31 14:00 → 15:00/,
  );
});
