import assert from "node:assert/strict";
import test from "node:test";

import {
  placeForecastAvailability,
  placeForecastIsNear,
  tonightDate,
} from "planner/tonight-overview.js";

// The forecast's window counts from the night the place is in, not from the UTC
// date. Places without a time zone: the night is read from the longitude (a
// place without a time zone anchors on its own longitude).
const west = { latitude: "45", longitude: "-30" };
const east = { latitude: "45", longitude: "179" };
const azores = { ...west, timeZone: "Atlantic/Azores" };
const at = (iso) => Date.parse(iso);

test("30° W, evening and small hours: the night of the 9th stays available on both sides of midnight UTC", () => {
  for (const place of [west, azores]) {
    for (const iso of [
      "2026-10-09T21:30:00Z", // 19:30 local, before midnight UTC
      "2026-10-09T23:59:00Z",
      "2026-10-10T00:01:00Z", // 22:01 local, after midnight UTC
      "2026-10-10T01:00:00Z",
      "2026-10-10T05:00:00Z", // 03:00 local, in the night still
    ]) {
      const now = at(iso);
      assert.equal(tonightDate({ now, place }), "2026-10-09", iso);
      assert.equal(
        placeForecastAvailability({ date: "2026-10-09", now, place }),
        "available",
        `${iso} ${place.timeZone ?? "no zone"}`,
      );
      assert.equal(
        placeForecastIsNear({ date: "2026-10-09", now, place }),
        true,
      );
    }
  }
});

test("30° W: once the night is over, its date is past; the next night is available", () => {
  const now = at("2026-10-10T11:00:00Z"); // 09:00 local, after dawn
  assert.equal(tonightDate({ now, place: west }), "2026-10-10");
  assert.equal(
    placeForecastAvailability({ date: "2026-10-09", now, place: west }),
    "past",
  );
  assert.equal(
    placeForecastAvailability({ date: "2026-10-10", now, place: west }),
    "available",
  );
});

test("179° E, evening and small hours: the ten days count from the night the place is in", () => {
  // 09:00 and 13:00 UTC: 21:00 on the 9th and 01:00 on the 10th at the place,
  // the night of the 9th, as the UTC date says.
  for (const iso of ["2026-10-09T09:00:00Z", "2026-10-09T13:00:00Z"]) {
    const now = at(iso);
    assert.equal(tonightDate({ now, place: east }), "2026-10-09", iso);
    assert.equal(
      placeForecastAvailability({ date: "2026-10-19", now, place: east }),
      "available",
      iso,
    );
    // The eleventh day is a trend, the sixteenth beyond.
    assert.equal(
      placeForecastAvailability({ date: "2026-10-20", now, place: east }),
      "trend",
      iso,
    );
    assert.equal(
      placeForecastAvailability({ date: "2026-10-25", now, place: east }),
      "beyond-range",
      iso,
    );
  }
  // 23:59 UTC on the 9th and 00:01 UTC on the 10th: 11:59 and 12:01 on the
  // 10th at the place, which is already in the night of the 10th.
  for (const iso of ["2026-10-09T23:59:00Z", "2026-10-10T00:01:00Z"]) {
    const now = at(iso);
    assert.equal(tonightDate({ now, place: east }), "2026-10-10", iso);
    assert.equal(
      placeForecastAvailability({ date: "2026-10-20", now, place: east }),
      "available",
      iso,
    );
    assert.equal(
      placeForecastAvailability({ date: "2026-10-09", now, place: east }),
      "past",
      iso,
    );
  }
});

test("without a place with coordinates the UTC date counts, as before", () => {
  const now = at("2026-10-10T01:00:00Z");
  for (const place of [null, {}, { latitude: "", longitude: "" }]) {
    assert.equal(
      placeForecastAvailability({ date: "2026-10-09", now, place }),
      "past",
    );
  }
});
