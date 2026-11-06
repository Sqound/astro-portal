// In "Rapproché" no target waits more than 10 min
// after the previous one; when none can follow, the chain stops there and the
// box "demandées / tiennent" says why.
import assert from "node:assert/strict";
import test from "node:test";
import { autoFillRule } from "../src/auto-fill.js";
import { autoFillFreeLine, autoFillFreeReason } from "../src/auto-fill-copy.js";
import { suggestNight } from "../src/suggest-night.js";
import { suggestDialogModel } from "../src/suggest-dialog-model.js";
import { suggestionMessages, suggestMessage } from "../src/suggest-messages.js";
import { messages as portalMessages } from "portal/i18n.js";

const minuteMs = 60000;
const wait = autoFillRule.chainedWaitMaximumMinutes;

// A synthetic sky: a grid of targets (right ascension every 15°, declination
// every 15°) over a night from 19:00 to 05:00 mean local time, the altitude
// sampled every 10 min, the quality window where it stays above 30°.
function sky({ latitude, longitude, date }) {
  const start = Date.parse(`${date}T19:00:00Z`) - (longitude / 15) * 3600000;
  const total = 600;
  const iso = (minute) => new Date(start + minute * minuteMs).toISOString();
  const rad = Math.PI / 180;
  const types = ["galaxy", "emission-nebula", "open-cluster", "globular"];
  const candidates = [];
  let index = 0;
  for (let ra = 0; ra < 360; ra += 15)
    for (let dec = -60; dec <= 75; dec += 15) {
      const series = [];
      for (let minute = 0; minute <= total; minute += 10) {
        const days = (start + minute * minuteMs) / 86400000 + 2440587.5;
        const sidereal =
          (280.46061837 + 360.98564736629 * (days - 2451545) + longitude) % 360;
        const hour = (sidereal - ra) * rad;
        const altitude =
          Math.asin(
            Math.sin(latitude * rad) * Math.sin(dec * rad) +
              Math.cos(latitude * rad) * Math.cos(dec * rad) * Math.cos(hour),
          ) / rad;
        series.push({ minute, altitude });
      }
      const windows = [];
      let open = null;
      for (const point of series) {
        if (point.altitude >= 30 && open === null) open = point.minute;
        if (point.altitude < 30 && open !== null) {
          if (point.minute - 10 > open)
            windows.push({ start: open, end: point.minute - 10 });
          open = null;
        }
      }
      if (open !== null && total > open)
        windows.push({ start: open, end: total });
      const peak = Math.max(...series.map((point) => point.altitude));
      const id = `g${String(index).padStart(3, "0")}`;
      candidates.push({
        card: {
          target: {
            id,
            designation: id.toUpperCase(),
            title: "",
            skyTarget: { typeKey: types[index % 4] },
          },
          integration: {
            available: true,
            recommendedMinutes: 45 + (index % 4) * 30,
          },
          visibilityWindows: windows.map((entry) => ({
            start: iso(entry.start),
            end: iso(entry.end),
          })),
          series: series.map((point) => ({
            time: iso(point.minute),
            altitude: Math.round(point.altitude * 100) / 100,
          })),
        },
        score: { total: Math.max(0, Math.round(peak)), max: 100 },
        windows,
      });
      index += 1;
    }
  return {
    night: { start: iso(0), end: iso(total) },
    candidates: candidates.map(({ card, score }) => ({ card, score })),
    windows: new Map(candidates.map((entry) => [entry.card.target.id, entry])),
  };
}

const places = [
  { latitude: 45, longitude: -30 },
  { latitude: 20, longitude: -30 },
  { latitude: 60, longitude: -30 },
  { latitude: -30, longitude: -30 },
];
const dates = Array.from({ length: 12 }, (_, month) => {
  const year = month < 2 ? 2026 : 2027;
  return `${year}-${String(((month + 10) % 12) + 1).padStart(2, "0")}-15`;
});
const runs = [
  { mode: "visual", count: 12 },
  { mode: "visual", count: "all" },
  { mode: "imaging", count: 4 },
  { mode: "imaging", count: "all" },
];

test("sweep: over 48 nights (12 dates, 4 places), a full and a sparse catalogue and 4 requests, no wait between two chained targets is longer than 10 min", () => {
  let waits = 0;
  let stops = 0;
  for (const place of places)
    for (const date of dates) {
      const { night, candidates: full, windows } = sky({ ...place, date });
      // A sparse catalogue (one target in eleven) leaves stretches where
      // nothing is up: the chain waits there, or stops.
      const sparse = full.filter((_, index) => index % 11 === 0);
      for (const [candidates, { mode, count }] of [full, sparse].flatMap(
        (pool) => runs.map((run) => [pool, run]),
      )) {
        const label = `${place.latitude}° ${date} ${mode} ${count} ${candidates.length}`;
        const result = suggestNight({
          night,
          mode,
          count,
          candidates,
          placement: "chained",
        });
        const minimum = mode === "visual" ? 20 : 45;
        assert.ok(result.items.length > 0, `${label}: something proposed`);
        result.items.forEach((item, index) => {
          const own = windows.get(item.target.id).windows;
          assert.ok(
            own.some(
              (entry) =>
                entry.start <= item.startMinute && item.endMinute <= entry.end,
            ),
            `${label}: ${item.target.id} inside its quality window`,
          );
          assert.ok(item.durationMinutes >= minimum, `${label}: duration`);
          if (!index) return;
          const gap = item.startMinute - result.items[index - 1].endMinute;
          assert.ok(gap >= 0 && gap <= wait, `${label}: a wait of ${gap} min`);
          if (gap > 0) waits += 1;
        });
        const stop = result.free.find(
          (slot) => slot.reason.kind === "no-follower",
        );
        if (stop) {
          stops += 1;
          assert.equal(stop.startMinute, result.items.at(-1).endMinute);
          if (count !== "all")
            assert.deepEqual(
              [result.shortfall.kind, result.shortfall.startMinute],
              ["no-follower", stop.startMinute],
              label,
            );
        }
      }
    }
  // The sweep exercises both a short wait and a stop.
  assert.ok(waits > 0, `waits: ${waits}`);
  assert.ok(stops > 0, `stops: ${stops}`);
});

test("sweep: the chain stops only when no open target can start within 10 min", () => {
  for (const place of places.slice(0, 2))
    for (const date of dates.filter((_, index) => index % 3 === 0)) {
      const { night, candidates, windows } = sky({ ...place, date });
      const result = suggestNight({
        night,
        mode: "visual",
        count: "all",
        candidates,
        placement: "chained",
      });
      const end = result.items.at(-1).endMinute;
      if (end >= result.window.endMinute) continue;
      const placed = new Set(result.items.map((item) => item.target.id));
      // The types already three times in the last decade are capped.
      const decade = result.items.slice(
        Math.floor(result.items.length / 10) * 10,
      );
      const types = new Map();
      for (const item of decade)
        types.set(item.type, (types.get(item.type) || 0) + 1);
      for (const [id, entry] of windows) {
        if (placed.has(id)) continue;
        if ((types.get(entry.card.target.skyTarget.typeKey) || 0) >= 3)
          continue;
        const follows = entry.windows.some(
          (room) =>
            Math.max(room.start, end) <= end + wait &&
            room.end - Math.max(room.start, end) >= 20,
        );
        assert.equal(follows, false, `${date}: ${id} could have followed`);
      }
    }
});

const at = (minute) =>
  new Date(Date.UTC(2026, 9, 14, 19) + minute * minuteMs).toISOString();
const flat = { start: at(0), end: at(720) };
function target(id, windows, score) {
  return {
    card: {
      target: { id, designation: id.toUpperCase(), title: "" },
      integration: { available: true, recommendedMinutes: 60 },
      visibilityWindows: windows.map(([start, end]) => ({
        start: at(start),
        end: at(end),
      })),
      series: [0, 360, 720].map((minute) => ({
        time: at(minute),
        altitude: 60,
      })),
    },
    score: { total: score, max: 100 },
  };
}
const chain = (candidates, extra = {}) =>
  suggestNight({
    night: flat,
    mode: "visual",
    placement: "chained",
    candidates,
    ...extra,
  });
const slots = (result) =>
  result.items.map((item) => [item.target.id, item.startMinute]);

// Nine targets chain to the end of the ninth, then nothing rises before 30 min.
const nine = [0, 20, 40, 60, 86, 106, 126, 152, 172].map((start, index) =>
  target(`s${index + 1}`, [[start, start + 24]], 90 - index),
);
const late = [0, 1, 2].map((index) =>
  target(`late${index + 1}`, [[222 + index * 30, 720]], 60 - index),
);

test("fewer than asked: the chain stops when nothing follows within 10 min, and says why", () => {
  const result = chain([...nine, ...late], { count: 12 });
  assert.equal(result.placed, 9);
  assert.equal(result.requested, 12);
  assert.equal(result.items.at(-1).endMinute, 192);
  assert.deepEqual(
    [
      result.shortfall.kind,
      result.shortfall.startMinute,
      result.shortfall.wait,
    ],
    ["no-follower", 192, 10],
  );
  assert.deepEqual(result.free.at(-1).reason, {
    kind: "no-follower",
    wait: 10,
  });
  // The words: the box's line and the line of its ⓘ.
  const model = suggestDialogModel({
    proposal: result,
    selected: new Set(result.items.map((item) => item.target.id)),
    locale: "fr",
    timeZone: "UTC",
    visual: true,
    placement: "chained",
  });
  assert.equal(
    model.shortfallReason,
    "Après 22:12, aucune cible ne suit la précédente à moins de 10 min.",
  );
  assert.equal(
    model.shortfallDetail.at(-1),
    "22:12 → 07:00 : aucune cible ne suit la précédente à moins de 10 min",
  );
  assert.equal(
    suggestDialogModel({
      proposal: result,
      selected: new Set(),
      locale: "en",
      timeZone: "UTC",
      visual: true,
    }).shortfallReason,
    "After 22:12, no target follows the previous one within 10 min.",
  );
});

test("a better-ranked target 20 min away is never waited for; the next one within 10 min is taken", () => {
  const result = chain(
    [
      target("a", [[0, 20]], 80),
      target("best", [[40, 720]], 99),
      target("next", [[28, 60]], 70),
    ],
    { count: 3 },
  );
  assert.deepEqual(slots(result), [
    ["a", 0],
    ["next", 28],
    ["best", 48],
  ]);
});

test("the plan's items and the kept targets are links: the chain resumes after them, within 10 min", () => {
  const result = chain(
    [
      target("a", [[0, 720]], 95),
      target("b", [[0, 720]], 90),
      target("c", [[0, 720]], 85),
      target("k", [[0, 720]], 99),
    ],
    {
      count: 4,
      items: [{ id: "planned", startMinute: 20, endMinute: 80 }],
      kept: [{ id: "k", startMinute: 100, endMinute: 120 }],
    },
  );
  assert.deepEqual(
    result.items.map((item) => [item.target.id, item.startMinute, item.kept]),
    [
      ["a", 0, false],
      ["b", 80, false],
      ["k", 100, true],
      ["c", 120, false],
    ],
  );
});

test("the ticked targets (`only`) are never dropped for the wait: the next starts when it rises", () => {
  const result = chain(
    [target("x", [[0, 720]], 95), target("y", [[90, 720]], 90)],
    { count: 2, only: ["x", "y"] },
  );
  assert.deepEqual(slots(result), [
    ["x", 0],
    ["y", 90],
  ]);
  // Without `only`, the same pool stops after x.
  assert.deepEqual(
    slots(
      chain([target("x", [[0, 720]], 95), target("y", [[90, 720]], 90)], {
        count: 2,
      }),
    ),
    [["x", 0]],
  );
});

test("« Toute la nuit »: the chain goes on until nothing follows, without a shortfall box", () => {
  const result = chain([...nine, ...late], { count: "all" });
  assert.equal(result.placed, 9);
  assert.equal(result.shortfall, null);
  assert.equal(result.free.at(-1).reason.kind, "no-follower");
});

test("the first target of a free window may start late: nothing is waited for before it", () => {
  const result = chain(
    [target("a", [[45, 720]], 95), target("b", [[50, 720]], 90)],
    {
      count: 2,
    },
  );
  assert.deepEqual(slots(result), [
    ["a", 45],
    ["b", 65],
  ]);
});

test("the words, in the ten languages of the web (the dialog's catalogue and the portal's)", () => {
  const english = suggestionMessages.en.suggestAfterNoFollower;
  for (const [locale, catalogue] of Object.entries(suggestionMessages)) {
    assert.match(catalogue.suggestAfterNoFollower, /\{time\}/, locale);
    assert.match(catalogue.suggestAfterNoFollower, /\{minutes\}/, locale);
    if (locale !== "en")
      assert.notEqual(catalogue.suggestAfterNoFollower, english, locale);
    assert.match(catalogue.suggestPlacementDetail, /10/, locale);
  }
  for (const locale of Object.keys(portalMessages)) {
    const line = autoFillFreeReason(
      { kind: "no-follower", wait: 10 },
      { locale },
    );
    assert.match(line, /10/, locale);
    assert.notEqual(
      line,
      autoFillFreeReason({ kind: "nothing" }, { locale }),
      locale,
    );
  }
  assert.equal(
    autoFillFreeLine(
      {
        start: at(192),
        end: at(720),
        reason: { kind: "no-follower", wait: 10 },
      },
      { locale: "ja", timeZone: "UTC" },
    ),
    "22:12 → 07:00：前の対象から10分以内に続けられる対象がない",
  );
});
