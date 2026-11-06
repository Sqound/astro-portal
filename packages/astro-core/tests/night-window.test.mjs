import assert from "node:assert/strict";
import test from "node:test";

import {
  astronomicalNightWindow,
  longitudeOffsetMinutes,
  nightAltitudeCrossings,
  validTimeZone,
  zonedDate,
} from "astro-core/night-window.js";

// This first case is a literal value, kept in the test itself so that the
// suite proves conformance independently of any other fixture file.
const MID_LATITUDE_NIGHT = {
  input: {
    date: "2025-01-10",
    latitude: 45,
    longitude: 10,
    elevation: 0,
    timeZone: "UTC",
  },
  window: {
    start: "2025-01-10T17:43:46.146Z",
    end: "2025-01-11T05:11:33.384Z",
  },
};

test("matches the planner's own -18° search, to the millisecond, for the plan-night fixture's night", () => {
  assert.deepEqual(
    astronomicalNightWindow(MID_LATITUDE_NIGHT.input),
    MID_LATITUDE_NIGHT.window,
  );
});

test("accepts latitude and longitude as numeric strings, exactly as a plan payload may send them", () => {
  assert.deepEqual(
    astronomicalNightWindow({
      ...MID_LATITUDE_NIGHT.input,
      latitude: "45",
      longitude: "10",
    }),
    MID_LATITUDE_NIGHT.window,
  );
});

test("a southern-hemisphere winter night", () => {
  assert.deepEqual(
    astronomicalNightWindow({
      date: "2025-06-21",
      latitude: -34.6,
      longitude: -58.4,
      elevation: 25,
      timeZone: "America/Argentina/Buenos_Aires",
    }),
    {
      start: "2025-06-21T22:20:49.726Z",
      end: "2025-06-22T09:30:21.931Z",
    },
  );
});

test("a night anchored the evening before a spring daylight-saving transition", () => {
  assert.deepEqual(
    astronomicalNightWindow({
      date: "2025-03-29",
      latitude: 48.85,
      longitude: 2.35,
      elevation: 35,
      timeZone: "Europe/Paris",
    }),
    {
      start: "2025-03-29T20:07:13.351Z",
      end: "2025-03-30T03:42:18.537Z",
    },
  );
});

test("a night anchored the evening before a fall daylight-saving transition", () => {
  assert.deepEqual(
    astronomicalNightWindow({
      date: "2025-11-01",
      latitude: 40.71,
      longitude: -74.0,
      elevation: 10,
      timeZone: "America/New_York",
    }),
    {
      start: "2025-11-01T23:24:32.857Z",
      end: "2025-11-02T09:55:03.128Z",
    },
  );
});

// Mobile/web parity: an unusable or absent time zone no
// longer falls back to a blanket "UTC" (nor, worse, to the server's own
// zone) — it anchors on the place's own longitude instead
// (`longitudeOffsetMinutes`), so the night stays close to that place's own
// evening wherever the request comes from. `MID_LATITUDE_NIGHT`'s longitude
// (10°E) rounds to a +60 min offset, one hour east of the `timeZone: "UTC"`
// fixture case above; the resulting `start`/`end` still land on the exact
// same physical dusk/dawn (an hour's shift in the search anchor, itself many
// hours before either crossing, does not change which crossing is found —
// only `start` moves, by 33 ms, an artifact of the root-finder converging
// from a different starting point, not a different night).
test("an unusable IANA zone anchors on the place's own longitude, not UTC and not the server's zone", () => {
  const withUnusableZone = astronomicalNightWindow({
    ...MID_LATITUDE_NIGHT.input,
    timeZone: "Not/AZone",
  });
  assert.deepEqual(withUnusableZone, {
    start: "2025-01-10T17:43:46.179Z",
    end: MID_LATITUDE_NIGHT.window.end,
  });
});

test("an absent timeZone also anchors on the place's own longitude", () => {
  const { timeZone: _omitted, ...withoutTimeZone } = MID_LATITUDE_NIGHT.input;
  assert.deepEqual(astronomicalNightWindow(withoutTimeZone), {
    start: "2025-01-10T17:43:46.179Z",
    end: MID_LATITUDE_NIGHT.window.end,
  });
});

test('an explicit "UTC" is a true zero offset, not a longitude guess', () => {
  assert.deepEqual(
    astronomicalNightWindow({ ...MID_LATITUDE_NIGHT.input, timeZone: "UTC" }),
    MID_LATITUDE_NIGHT.window,
  );
});

test('an explicit "Etc/UTC" is the same true zero offset', () => {
  assert.deepEqual(
    astronomicalNightWindow({
      ...MID_LATITUDE_NIGHT.input,
      timeZone: "Etc/UTC",
    }),
    MID_LATITUDE_NIGHT.window,
  );
});

test("longitudeOffsetMinutes: local mean solar time, rounded to the hour and clamped to +/-12 h", () => {
  assert.equal(longitudeOffsetMinutes(139), 540, "Tokyo-like longitude");
  assert.equal(longitudeOffsetMinutes(-70), -300, "Chile-like longitude");
  assert.equal(longitudeOffsetMinutes(10), 60);
  assert.equal(longitudeOffsetMinutes(0), 0);
  assert.equal(longitudeOffsetMinutes(179), 12 * 60, "clamped, not 720");
  assert.equal(longitudeOffsetMinutes(-179), -12 * 60, "clamped, not -720");
  assert.equal(
    longitudeOffsetMinutes(NaN),
    0,
    "not finite: zero, never a guess",
  );
});

test("a night computed twice for the same zoneless place, once with an absent timeZone and once with an unresolvable one, agrees exactly", () => {
  const { timeZone: _omitted, ...withoutTimeZone } = MID_LATITUDE_NIGHT.input;
  assert.deepEqual(
    astronomicalNightWindow(withoutTimeZone),
    astronomicalNightWindow({
      ...MID_LATITUDE_NIGHT.input,
      timeZone: "Not/AZone",
    }),
  );
});

test("polar summer — the Sun never descends through -18°, so there is no dusk — is null, not a placeholder", () => {
  assert.equal(
    astronomicalNightWindow({
      date: "2025-06-15",
      latitude: 70,
      longitude: 20,
      timeZone: "UTC",
    }),
    null,
  );
});

test("polar winter — the Sun never ascends back through -18° within the search window — is null", () => {
  assert.equal(
    astronomicalNightWindow({
      date: "2025-12-15",
      latitude: 85,
      longitude: 20,
      timeZone: "UTC",
    }),
    null,
  );
});

test("unusable inputs return null rather than throwing", () => {
  assert.equal(
    astronomicalNightWindow({ ...MID_LATITUDE_NIGHT.input, date: undefined }),
    null,
    "missing date",
  );
  assert.equal(
    astronomicalNightWindow({ date: "2025-01-10", longitude: 10 }),
    null,
    "missing latitude",
  );
  assert.equal(
    astronomicalNightWindow({ date: "2025-01-10", latitude: 45 }),
    null,
    "missing longitude",
  );
  assert.equal(
    astronomicalNightWindow({
      date: "2025-01-10",
      latitude: "north",
      longitude: 10,
    }),
    null,
    "non-numeric latitude",
  );
  assert.equal(
    astronomicalNightWindow({
      date: "2025-01-10",
      latitude: 45,
      longitude: "east",
    }),
    null,
    "non-numeric longitude",
  );
  assert.equal(
    astronomicalNightWindow({
      date: "2025-01-10",
      latitude: 95,
      longitude: 10,
    }),
    null,
    "latitude out of [-90, 90]",
  );
  assert.equal(
    astronomicalNightWindow({
      date: "2025-01-10",
      latitude: 45,
      longitude: 190,
    }),
    null,
    "longitude out of [-180, 180]",
  );
});

test("nightAltitudeCrossings is the raw search astronomicalNightWindow is built from", () => {
  const anchor = zonedDate(MID_LATITUDE_NIGHT.input.date, 12, "UTC");
  const { dusk, dawn } = nightAltitudeCrossings({
    latitude: MID_LATITUDE_NIGHT.input.latitude,
    longitude: MID_LATITUDE_NIGHT.input.longitude,
    elevation: MID_LATITUDE_NIGHT.input.elevation,
    anchor,
  });
  assert.equal(dusk.toISOString(), MID_LATITUDE_NIGHT.window.start);
  assert.equal(dawn.toISOString(), MID_LATITUDE_NIGHT.window.end);
});

test("nightAltitudeCrossings reports no dawn when there is no dusk to search forward from", () => {
  const anchor = zonedDate("2025-06-15", 12, "UTC");
  const crossings = nightAltitudeCrossings({
    latitude: 70,
    longitude: 20,
    elevation: 0,
    anchor,
  });
  assert.deepEqual(crossings, { dusk: null, dawn: null });
});

test("validTimeZone falls back to UTC for an unusable zone and passes a usable one through unchanged", () => {
  assert.equal(validTimeZone("Not/AZone"), "UTC");
  assert.equal(validTimeZone("Europe/Paris"), "Europe/Paris");
});

test("zonedDate turns a civil date and hour in a zone into the matching UTC instant", () => {
  const noon = zonedDate("2025-01-10", 12, "UTC");
  assert.equal(noon.toISOString(), "2025-01-10T12:00:00.000Z");
});

test("zonedDate returns null for a date it cannot parse", () => {
  assert.equal(zonedDate("not-a-date", 12, "UTC"), null);
});
