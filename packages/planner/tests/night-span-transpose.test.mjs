import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { message } from "portal/i18n.js";
import { transposeNightSpan } from "planner/night-span.js";
import {
  transposeDeviceSlot,
  transposeNightSpansOfPlaceChange,
} from "planner/night-slot-transpose.js";

// A chosen slot follows the place's local hours when the
// place changes zone, within the new astronomical night; with less than one
// hour left it goes back to the whole night, and says so.

const tokyo = {
  latitude: "35.7",
  longitude: "139.7",
  timeZone: "Asia/Tokyo",
};
const harbour = {
  latitude: "45",
  longitude: "-30",
};
const slot = (start, end) => ({ mode: "custom", start, end });

test("the shared fixture is the rule the web runs", () => {
  const fixture = JSON.parse(
    readFileSync(
      new URL(
        "../../astro-contracts/fixtures/night-span-transpose.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.ok(fixture.cases.length >= 10);
  for (const { id, args, result } of fixture.cases)
    assert.deepEqual(transposeNightSpan(...args), result, id);
});

test("a same-zone change keeps the slot, +9 h keeps the local hours", () => {
  const night = {
    start: "2026-10-14T18:40:00.000Z",
    end: "2026-10-15T05:30:00.000Z",
  };
  const span = slot("2026-10-14T10:00:00.000Z", "2026-10-14T14:00:00.000Z");
  const same = transposeNightSpan({
    span,
    date: "2026-10-14",
    from: tokyo,
    to: { ...tokyo, longitude: "135.5" },
    night,
  });
  assert.deepEqual(same, { span, fellBack: false });
  const west = transposeNightSpan({
    span,
    date: "2026-10-14",
    from: tokyo,
    to: { timeZone: "Etc/UTC", longitude: "0" },
    night,
  });
  assert.deepEqual(west, {
    span: slot("2026-10-14T19:00:00.000Z", "2026-10-14T23:00:00.000Z"),
    fellBack: false,
  });
});

test("a place change moves each custom slot of the night and flags the ones that fall back", () => {
  const before = {
    date: "2026-09-15",
    activeNightId: "n1",
    location: tokyo,
    plans: [
      {
        id: "evening",
        nightId: "n1",
        date: "2026-09-15",
        // 22:00–02:00 in Tokyo.
        nightSpan: slot("2026-09-15T13:00:00.000Z", "2026-09-15T17:00:00.000Z"),
      },
      {
        id: "noon",
        nightId: "n1",
        date: "2026-09-15",
        // 12:00–15:00 in Tokyo: daylight once moved to the harbour.
        nightSpan: slot("2026-09-15T03:00:00.000Z", "2026-09-15T06:00:00.000Z"),
      },
      { id: "whole", nightId: "n1", date: "2026-09-15" },
      {
        id: "other-night",
        nightId: "n2",
        date: "2026-09-15",
        nightSpan: slot("2026-09-15T13:00:00.000Z", "2026-09-15T17:00:00.000Z"),
      },
    ],
  };
  const after = { ...before, location: harbour };
  const moved = transposeNightSpansOfPlaceChange(before, after);
  assert.deepEqual(moved.slots, ["evening", "noon"]);
  assert.deepEqual(moved.fellBack, ["noon"]);
  const byId = Object.fromEntries(moved.state.plans.map((p) => [p.id, p]));
  // 22:00–02:00 at 30° W (UTC−2 by its longitude) is 00:00Z–04:00Z.
  assert.deepEqual(
    byId.evening.nightSpan,
    slot("2026-09-16T00:00:00.000Z", "2026-09-16T04:00:00.000Z"),
  );
  assert.deepEqual(byId.noon.nightSpan, { mode: "astronomical" });
  assert.equal(byId.whole.nightSpan, undefined);
  assert.deepEqual(byId["other-night"], before.plans[3]);
});

test("without a custom slot the state comes back as it was", () => {
  const before = {
    activeNightId: "n1",
    location: tokyo,
    plans: [{ id: "whole", nightId: "n1", date: "2026-09-15" }],
  };
  const after = { ...before, location: harbour };
  const moved = transposeNightSpansOfPlaceChange(before, after);
  assert.equal(moved.state, after);
  assert.deepEqual(moved.slots, []);
});

test("the browser's slot of a night without plan follows the place", () => {
  const record = {
    date: "2026-09-15",
    start: "2026-09-15T13:00:00.000Z",
    end: "2026-09-15T17:00:00.000Z",
  };
  const kept = transposeDeviceSlot({ record, from: tokyo, to: harbour });
  assert.deepEqual(kept, {
    record: {
      date: "2026-09-15",
      start: "2026-09-16T00:00:00.000Z",
      end: "2026-09-16T04:00:00.000Z",
    },
    fellBack: false,
  });
  const noon = {
    date: "2026-09-15",
    start: "2026-09-15T03:00:00.000Z",
    end: "2026-09-15T06:00:00.000Z",
  };
  assert.deepEqual(
    transposeDeviceSlot({ record: noon, from: tokyo, to: harbour }),
    { record: null, fellBack: true },
  );
  assert.deepEqual(
    transposeDeviceSlot({ record: null, from: tokyo, to: harbour }),
    { record: null, fellBack: false },
  );
});

test("the notice is worded in the ten catalogues, « vous » and no placeholder", () => {
  const locales = [
    "fr",
    "en",
    "de",
    "es",
    "it",
    "ja",
    "pt-BR",
    "ru",
    "zh-Hans",
    "zh-Hant",
  ];
  const seen = new Set();
  for (const locale of locales) {
    const text = message(locale, "tonightSlotFellBack");
    assert.ok(text && text !== "tonightSlotFellBack", locale);
    assert.ok(!text.includes("{"), locale);
    seen.add(text);
  }
  assert.equal(seen.size, locales.length);
  assert.equal(
    message("fr", "tonightSlotFellBack"),
    "Créneau remis sur la nuit astronomique : vos heures ne tombaient pas dans la nuit de ce lieu.",
  );
});
