import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

import { planNightWindow } from "planner/planner.js";
import { placeCivilDate, tonightDate } from "planner/tonight-overview.js";

// The night window of a place, and the date of the night it is in, do not
// depend on the browser's clock or zone. A place with no time zone reads its
// night from its longitude (display stays in UTC), an explicit "UTC" is a true
// zero offset.
const west = { latitude: "45", longitude: "-30" };
const east = { latitude: "45", longitude: "179" };
const tokyo = {
  latitude: "35.68",
  longitude: "139.69",
  timeZone: "Asia/Tokyo",
};
const utc = { latitude: "45", longitude: "179", timeZone: "UTC" };

const windowOf = (date, location) => {
  const { start, end } = planNightWindow({ date, location });
  return [start, end];
};

test("night window: a place with no zone is anchored on its longitude", () => {
  assert.deepEqual(windowOf("2026-10-09", west).map(second), [
    "2026-10-09T21:03:09",
    "2026-10-10T06:31:40",
  ]);
  // 179° E: the night of the 9th is the evening of the 9th at the place, which
  // is the morning of the 9th in UTC.
  assert.deepEqual(windowOf("2026-10-09", east).map(second), [
    "2026-10-09T07:08:12",
    "2026-10-09T16:34:56",
  ]);
  assert.deepEqual(windowOf("2026-10-09", tokyo).map(second), [
    "2026-10-09T09:39:04",
    "2026-10-09T19:18:19",
  ]);
  // An explicit UTC is a true zero offset, not a longitude guess.
  assert.deepEqual(windowOf("2026-10-09", utc).map(second), [
    "2026-10-10T07:06:23",
    "2026-10-10T16:36:12",
  ]);
});

function second(iso) {
  return iso.slice(0, 19);
}

// [instant (UTC), place, civil date at the place, night being lived]
const cases = [
  ["2026-10-09T21:30:00Z", west, "2026-10-09", "2026-10-09"],
  ["2026-10-09T23:59:00Z", west, "2026-10-09", "2026-10-09"],
  ["2026-10-10T00:01:00Z", west, "2026-10-09", "2026-10-09"],
  ["2026-10-10T05:00:00Z", west, "2026-10-10", "2026-10-09"],
  ["2026-10-10T08:00:00Z", west, "2026-10-10", "2026-10-10"],
  ["2026-10-09T10:00:00Z", east, "2026-10-09", "2026-10-09"],
  ["2026-10-09T13:00:00Z", east, "2026-10-10", "2026-10-09"],
  ["2026-10-09T20:00:00Z", east, "2026-10-10", "2026-10-10"],
  ["2026-10-09T23:59:00Z", east, "2026-10-10", "2026-10-10"],
  ["2026-10-10T00:01:00Z", east, "2026-10-10", "2026-10-10"],
  ["2026-10-09T14:59:00Z", tokyo, "2026-10-09", "2026-10-09"],
  ["2026-10-09T15:01:00Z", tokyo, "2026-10-10", "2026-10-09"],
  ["2026-10-09T18:00:00Z", tokyo, "2026-10-10", "2026-10-09"],
  ["2026-10-09T20:00:00Z", tokyo, "2026-10-10", "2026-10-10"],
  ["2026-10-09T23:59:00Z", utc, "2026-10-09", "2026-10-09"],
  ["2026-10-10T00:01:00Z", utc, "2026-10-10", "2026-10-09"],
];

test("civil date and night lived at the place, both sides of midnight UTC", () => {
  for (const [iso, place, civil, night] of cases) {
    const now = Date.parse(iso);
    const label = `${iso} @ ${place.longitude}${place.timeZone ? ` ${place.timeZone}` : ""}`;
    assert.equal(placeCivilDate(now, place), civil, `civil ${label}`);
    assert.equal(tonightDate({ now, place }), night, `night ${label}`);
  }
});

// The browser's own zone must change nothing: the same cases run in child
// processes whose `TZ` is far from every place, including the planner's
// reading of "today" (`tonightDate`).
const probe = `
  import { tonightDate } from "planner/tonight-overview.js";
  const cases = JSON.parse(process.argv[1]);
  const out = cases.map(([iso, place]) =>
    tonightDate({ now: Date.parse(iso), place }),
  );
  console.log(JSON.stringify(out));
`;

for (const zone of ["America/New_York", "Pacific/Auckland", "UTC"]) {
  test(`browser zone ${zone}: the dates are the place's, not the browser's`, () => {
    const stdout = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        probe,
        JSON.stringify(cases.map(([iso, place]) => [iso, place])),
      ],
      { env: { ...process.env, TZ: zone }, encoding: "utf8" },
    );
    const read = JSON.parse(stdout);
    cases.forEach(([iso, , , night], index) => {
      assert.equal(read[index], night, `${zone} ${iso}`);
    });
  });
}
