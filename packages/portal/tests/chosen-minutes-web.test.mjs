// An instant the PERSON chooses (a time typed in the dialog of a
// target of « Remanier la session ») is an exact minute, whatever the seconds
// of the session or night it is laid on; an instant that REALLY happened is
// shown cut to its minute and is not touched by this.
import assert from "node:assert/strict";
import test from "node:test";
import {
  clockValue,
  instantOfClock,
} from "../dist/components/sessions/debrief-moment.js";
import { reworkBody } from "../dist/components/sessions/session-rework.js";

const draftOf = (start, end) => ({
  targets: [
    {
      key: "ngc7000",
      origin: "planned",
      removed: false,
      start,
      end,
      frames: "",
      filter: "",
      reason: "",
    },
  ],
  added: [],
  moves: {},
  removals: [],
  replacements: {},
});

for (const [zone, label] of [
  ["UTC", "a place without a zone"],
  ["Europe/Paris", "a place with a zone"],
]) {
  test(`a time typed for a target is written as that exact minute, ${label}`, () => {
    // The session started at a real instant, seconds included.
    const sessionStart = "2026-10-18T20:47:41.000Z";
    const wall = (iso) =>
      clockValue(iso, zone === "UTC" ? "UTC" : "Europe/Paris");
    const typedStart = wall("2026-10-18T20:58:00.000Z");
    const typedEnd = wall("2026-10-18T23:02:00.000Z");
    const body = reworkBody(draftOf(typedStart, typedEnd), {
      sessionStart,
      timeZone: zone,
    });
    assert.equal(body.targets[0].startedAt, "2026-10-18T20:58:00.000Z");
    assert.equal(body.targets[0].finishedAt, "2026-10-18T23:02:00.000Z");
    for (const instant of [
      instantOfClock(typedStart, sessionStart, null, zone),
      instantOfClock(typedEnd, sessionStart, null, zone),
    ])
      assert.equal(instant % 60_000, 0, "no seconds in a chosen instant");
  });
}

test("a real event at 20:57:52 still displays 20:57 (instants are cut)", () => {
  assert.equal(clockValue("2026-10-18T20:57:52.000Z", "UTC"), "20:57");
  assert.equal(clockValue(Date.parse("2026-10-18T20:57:52Z"), "UTC"), "20:57");
});
