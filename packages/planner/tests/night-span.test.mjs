import assert from "node:assert/strict";
import test from "node:test";

import { readFileSync } from "node:fs";
import { message } from "portal/i18n.js";
import { plannerFlowMessage } from "portal/planner/flow-messages.js";
import {
  fillMessage,
  nightSpanChartDescription,
  nightSpanForecastParts,
  nightSpanMoonPhrase,
  nightSpanNightDates,
  nightSpanRainPhrase,
} from "planner/night-span-copy.js";
import { planWithDarkness } from "planner/darkness-setting.js";
import { plannedItemPlacement } from "planner/item-placement.js";
import {
  cardWithinNightSpan,
  customNightSpan,
  customSpanOfWindow,
  movedNightSpan,
  nightSpanForecastSummary,
  planWithNightSpan,
  steppedNightSpan,
} from "planner/night-span.js";
import {
  activePlanCardReviewReasons,
  planNightSpanSky,
  planNightWindow,
} from "planner/planner.js";
import { scheduleItemNightSpanReason } from "planner/recommendations.js";
import { durationText } from "portal/written-forms.js";

// The span of the night, chosen in the place-and-date stage with two handles
// (ten-minute steps, never before sunset nor after sunrise, thirty minutes at
// least).

const place = {
  latitude: "45",
  longitude: "-30",
  elevation: "0",
  timeZone: "Atlantic/Azores",
};
const plan = { date: "2026-10-14", location: place };
const sky = planNightSpanSky(plan);
const minutesOf = (iso) => Date.parse(iso) / 60000;

test("the sky of the night: scale, bounds, twilights and the Moon", () => {
  assert.equal(sky.span, "astronomical");
  // Thirty minutes either side of sunset and sunrise.
  assert.equal(Date.parse(sky.sunset) - Date.parse(sky.scaleStart), 30 * 60000);
  assert.equal(Date.parse(sky.scaleEnd) - Date.parse(sky.sunrise), 30 * 60000);
  // Bounds on ten-minute marks, inside sunset–sunrise.
  assert.equal(minutesOf(sky.bounds.start) % 10, 0);
  assert.equal(minutesOf(sky.bounds.end) % 10, 0);
  assert.ok(Date.parse(sky.bounds.start) >= Date.parse(sky.sunset));
  assert.ok(Date.parse(sky.bounds.end) <= Date.parse(sky.sunrise));
  // Civil, then nautical, then astronomical darkness, nested.
  assert.ok(sky.twilights.civil.start < sky.twilights.nautical.start);
  assert.ok(sky.twilights.nautical.start < sky.twilights.astronomical.start);
  assert.equal(sky.twilights.astronomical.start, sky.darkStart);
  // The Moon every ten minutes across the whole scale.
  assert.equal(sky.moonSeries[0].time, sky.scaleStart);
  assert.equal(sky.moonSeries.at(-1).time, sky.scaleEnd);
});

test("handles move by ten-minute steps", () => {
  const span = customNightSpan(sky);
  assert.deepEqual(span, {
    mode: "custom",
    start: "2026-10-14T21:00:00.000Z",
    end: "2026-10-15T06:30:00.000Z",
  });
  const moved = movedNightSpan({
    span,
    edge: "start",
    to: "2026-10-14T21:24:00.000Z",
    bounds: sky.bounds,
  });
  assert.equal(moved.start, "2026-10-14T21:20:00.000Z");
  assert.equal(
    movedNightSpan({
      span,
      edge: "end",
      to: "2026-10-15T02:15:00.000Z",
      bounds: sky.bounds,
    }).end,
    "2026-10-15T02:20:00.000Z",
  );
});

test("handles never go before sunset nor after sunrise", () => {
  const span = customNightSpan(sky);
  assert.equal(
    movedNightSpan({
      span,
      edge: "start",
      to: "2026-10-14T12:00:00.000Z",
      bounds: sky.bounds,
    }).start,
    sky.bounds.start,
  );
  assert.equal(
    movedNightSpan({
      span,
      edge: "end",
      to: "2026-10-15T12:00:00.000Z",
      bounds: sky.bounds,
    }).end,
    sky.bounds.end,
  );
});

test("the span keeps thirty minutes at least", () => {
  const span = {
    mode: "custom",
    start: "2026-10-14T22:00:00.000Z",
    end: "2026-10-15T01:00:00.000Z",
  };
  const start = movedNightSpan({
    span,
    edge: "start",
    to: "2026-10-15T03:00:00.000Z",
    bounds: sky.bounds,
  });
  assert.equal(start.start, "2026-10-15T00:30:00.000Z");
  const end = movedNightSpan({
    span,
    edge: "end",
    to: "2026-10-14T20:00:00.000Z",
    bounds: sky.bounds,
  });
  assert.equal(end.end, "2026-10-14T22:30:00.000Z");
});

test("the keyboard moves a handle by ten minutes per step", () => {
  const span = customNightSpan(sky);
  assert.equal(
    steppedNightSpan({ span, edge: "start", steps: 1, bounds: sky.bounds })
      .start,
    "2026-10-14T21:10:00.000Z",
  );
  assert.equal(
    steppedNightSpan({ span, edge: "end", steps: -2, bounds: sky.bounds }).end,
    "2026-10-15T06:10:00.000Z",
  );
  // From the dark night, whose edges are not on the grid: the first step
  // lands on a ten-minute mark.
  const dark = { start: sky.darkStart, end: sky.darkEnd };
  assert.equal(
    steppedNightSpan({
      span: dark,
      edge: "start",
      steps: -1,
      bounds: sky.bounds,
    }).start,
    "2026-10-14T20:50:00.000Z",
  );
});

test("the forecast summary of a span: clouds, rain, the Moon", () => {
  const hour = (iso, cloud, precipitationAmount) => ({
    time: Date.parse(iso),
    cloud,
    precipitationAmount,
  });
  const hourly = [
    hour("2026-10-14T20:00:00Z", 8, 0),
    hour("2026-10-14T21:00:00Z", 12, 0),
    hour("2026-10-14T22:00:00Z", 18, 0),
    hour("2026-10-15T03:00:00Z", 41, 0.4),
  ];
  const moonSeries = [
    { time: "2026-10-14T20:00:00.000Z", altitude: 4 },
    { time: "2026-10-14T21:00:00.000Z", altitude: 1 },
    { time: "2026-10-14T22:00:00.000Z", altitude: -2 },
  ];
  const dry = nightSpanForecastSummary(hourly, moonSeries, {
    start: "2026-10-14T20:30:00.000Z",
    end: "2026-10-14T23:00:00.000Z",
  });
  assert.deepEqual(dry.forecast, {
    cloudMin: 8,
    cloudMax: 18,
    rain: { level: "none", from: null, fromStart: false },
  });
  assert.equal(dry.minutes, 150);
  assert.equal(dry.moon.kind, "until");
  assert.equal(dry.moon.periods[0].end, "2026-10-14T21:20:00.000Z");
  const wet = nightSpanForecastSummary(hourly, moonSeries, {
    start: "2026-10-14T20:30:00.000Z",
    end: "2026-10-15T04:00:00.000Z",
  });
  assert.deepEqual(wet.forecast.rain, {
    level: "light",
    from: "2026-10-15T03:00:00.000Z",
    fromStart: false,
  });
  // A far date: no hour of the forecast, the Moon still known.
  const far = nightSpanForecastSummary([], moonSeries, {
    start: "2026-10-14T20:30:00.000Z",
    end: "2026-10-14T23:00:00.000Z",
  });
  assert.equal(far.forecast, null);
  assert.equal(far.moon.kind, "until");
});

test("an interval outside the chosen span is flagged, never removed", () => {
  const nightStart = sky.darkStart;
  const span = {
    mode: "custom",
    start: "2026-10-14T21:00:00.000Z",
    end: "2026-10-15T02:20:00.000Z",
  };
  const items = [
    { id: "m31", startMinute: 30, endMinute: 150, durationMinutes: 120 },
    { id: "m42", startMinute: 420, endMinute: 540, durationMinutes: 120 },
  ];
  const shortened = planWithNightSpan({ ...plan, items }, span);
  // Shortening the night keeps every interval exactly as it was.
  assert.deepEqual(shortened.items, items);
  assert.deepEqual(shortened.nightSpan, span);
  const window = planNightWindow(shortened);
  const custom = customSpanOfWindow(window);
  assert.deepEqual(custom, { start: span.start, end: span.end });
  const reasons = items.map((item) =>
    scheduleItemNightSpanReason({ item, nightStart, span: custom }),
  );
  assert.deepEqual(reasons, [null, "outside-night-span"]);
  const card = activePlanCardReviewReasons({
    card: { target: { id: "m42", plannerSource: "saved" }, reviewReasons: [] },
    equipment: {},
    nightSpanReason: reasons[1],
  });
  assert.deepEqual(card.reviewReasons, ["outside-night-span"]);
  assert.equal(
    plannerFlowMessage("fr", "review_outside-night-span"),
    "hors de la durée choisie",
  );
  // Back to the whole night: nothing is flagged any more.
  const whole = planWithNightSpan(shortened, { mode: "astronomical" });
  assert.equal(customSpanOfWindow(planNightWindow(whole)), null);
  assert.deepEqual(whole.items, items);
});

test("a target added to the plan is placed inside the chosen span", () => {
  const night = {
    start: "2026-10-14T20:00:00.000Z",
    end: "2026-10-15T04:00:00.000Z",
  };
  const card = {
    target: { id: "ngc-7000" },
    series: [
      { time: "2026-10-14T20:00:00.000Z", altitude: 60 },
      { time: "2026-10-14T22:00:00.000Z", altitude: 70 },
      { time: "2026-10-15T00:00:00.000Z", altitude: 55 },
      { time: "2026-10-15T04:00:00.000Z", altitude: 30 },
    ],
    visibilityWindows: [{ start: night.start, end: night.end }],
    usableStart: night.start,
    usableEnd: night.end,
    integration: { available: true, recommendedMinutes: 90 },
  };
  const span = {
    start: "2026-10-15T00:00:00.000Z",
    end: "2026-10-15T03:00:00.000Z",
  };
  const free = plannedItemPlacement({ card, night, items: [] });
  // Without a span it would sit at culmination, before midnight.
  assert.ok(free.endMinute <= 240);
  const placed = plannedItemPlacement({
    card: cardWithinNightSpan(card, span),
    night,
    items: [],
  });
  assert.ok(placed.startMinute >= 240, `${placed.startMinute}`);
  assert.ok(placed.endMinute <= 420, `${placed.endMinute}`);
  assert.equal(placed.durationMinutes, 90);
  assert.equal(
    scheduleItemNightSpanReason({
      item: placed,
      nightStart: night.start,
      span,
    }),
    null,
  );
});

// The web section (08.4): the words, then the section as React renders it.
const clockUtc = (value) =>
  value ? new Date(value).toISOString().slice(11, 16) : "—";
const forecastHours = Array.from({ length: 16 }, (_, hour) => ({
  time: Date.parse("2026-10-14T18:00:00Z") + hour * 3600000,
  cloud: hour < 9 ? 8 + hour : 30,
  precipitationAmount: hour === 10 ? 0.6 : 0,
}));

test("the French words, in the three languages", () => {
  const keys = [
    ["plannerNightSpanTitle", "Durée de la nuit"],
    ["plannerNightSpanCustom", "Définir"],
    ["plannerNightSpanLegendClouds", "Nuages (%)"],
    ["plannerNightSpanLegendRain", "Pluie (mm/h)"],
    ["plannerNightSpanLegendMoon", "Lune levée"],
    ["plannerNightSpanWholeNight", "Toute la nuit exploitable"],
    [
      "plannerNightSpanHint",
      "Faites glisser les poignées pour changer le début et la fin",
    ],
    ["plannerNightSpanReset", "Revenir à toute la nuit"],
    [
      "plannerNightSpanNoForecast",
      "Prévisions météo indisponibles pour cette date",
    ],
    [
      "plannerNightSpanNoForecastHelp",
      "La météo apparaîtra automatiquement à l’approche de la date. Les calculs astronomiques restent disponibles.",
    ],
  ];
  for (const [key, french] of keys) {
    assert.equal(message("fr", key), french, key);
    assert.notEqual(message("en", key), key);
    assert.notEqual(message("ja", key), message("en", key), key);
  }
  assert.equal(
    fillMessage(message("fr", "plannerNightSpanStartHandle"), {
      time: "20:30",
    }),
    "Heure de début : 20:30",
  );
  assert.equal(
    fillMessage(message("fr", "plannerNightSpanEndHandle"), { time: "02:15" }),
    "Heure de fin : 02:15",
  );
});

test("the forecast line reads like the specified wording", () => {
  const span = {
    start: "2026-10-14T20:30:00.000Z",
    end: "2026-10-15T02:20:00.000Z",
  };
  const summary = nightSpanForecastSummary(forecastHours, sky.moonSeries, span);
  assert.equal(
    fillMessage(message("fr", "plannerNightSpanForecastLine"), {
      parts: nightSpanForecastParts("fr", summary, clockUtc),
    }),
    "Prévision sur cette plage : nuages 10 à 16 % · pas de pluie · Lune levée jusqu’à 20:52",
  );
  const whole = nightSpanForecastSummary(forecastHours, sky.moonSeries, {
    start: sky.darkStart,
    end: sky.darkEnd,
  });
  assert.equal(
    nightSpanForecastParts("fr", whole, clockUtc),
    "nuages 10 à 30 % · pluie faible après 04:00 · Lune couchée",
  );
  assert.match(
    nightSpanChartDescription({
      locale: "fr",
      sky,
      summary,
      custom: true,
      date: "2026-10-14",
      clock: clockUtc,
    }),
    /^Nuit du 14 au 15 octobre, de 18:46 à 08:45\. Nuit noire de 20:54 à 06:38\. Nuages entre 10 et 16 %\. Pas de pluie\. Lune levée jusqu’à 20:52\. Plage choisie de 20:30 à 02:20\.$/,
  );
});

test("the web section: two equal choices, keyboard handles, a link back", () => {
  const component = readFileSync(
    new URL("../src/components/NightSpanTimeline.js", import.meta.url),
    "utf8",
  );
  // "Nuit astronomique | Définir": a radio group, the chosen one selected.
  assert.match(component, /role="radiogroup"/);
  assert.equal(component.match(/role="radio"/g).length, 2);
  // Each handle names its time and moves by ten minutes with the arrows.
  assert.match(component, /plannerNightSpanStartHandle/);
  assert.match(component, /plannerNightSpanEndHandle/);
  assert.match(component, /ArrowRight/);
  assert.match(component, /ArrowLeft/);
  assert.match(
    component,
    /steppedNightSpan\(\{ span, edge, steps, bounds \}\)/,
  );
  assert.match(component, /aria-describedby="planner-night-span-hint"/);
  // "Revenir à toute la nuit" is a link.
  assert.match(component, /className="btn-link planner-night-span-reset"/);
  // The far date: the notice and the help, no forecast legend.
  assert.match(component, /plannerNightSpanNoForecast"/);
  assert.match(component, /plannerNightSpanNoForecastHelp/);
  // The notice is a line under the drawing, not
  // laid over it (it hid the hours and the Moon); its line keeps its room
  // once the forecast is there, and the drawing one height with or without.
  const timeline = component.slice(
    component.indexOf('className="planner-night-span-timeline"'),
    component.indexOf('<ul className="planner-night-span-legend">'),
  );
  const drawingEnd = timeline.indexOf('{editing && handle("end")}');
  assert.ok(drawingEnd > 0);
  assert.doesNotMatch(
    timeline.slice(0, drawingEnd),
    /planner-night-span-no-forecast/,
  );
  assert.match(
    timeline.slice(drawingEnd),
    /<p\s+className=\{`planner-night-span-no-forecast\$\{forecastAvailable \? " is-reserved" : ""\}`\}/,
  );
  assert.match(component, /const height = custom \? 154 : 96;/);
  assert.doesNotMatch(component, /top \+ plotHeight \/ 2 - 22/);
});

test("a night without sunset or sunrise has no custom span", () => {
  // Midsummer far north: the Sun sets, but never 18° under the horizon.
  const north = planNightSpanSky({
    date: "2026-06-21",
    location: { latitude: "69", longitude: "19", timeZone: "Europe/Berlin" },
  });
  assert.equal(north.bounds, null);
  assert.equal(customNightSpan(north), null);
  assert.equal(
    movedNightSpan({
      span: { start: north.start, end: north.end },
      edge: "start",
      to: north.start,
      bounds: north.bounds,
    }),
    null,
  );
});

test("a fraction of a step or an unknown edge moves nothing", () => {
  const span = customNightSpan(sky);
  assert.equal(
    steppedNightSpan({ span, edge: "start", steps: 0.5, bounds: sky.bounds }),
    null,
  );
  assert.equal(
    movedNightSpan({
      span,
      edge: "middle",
      to: span.start,
      bounds: sky.bounds,
    }),
    null,
  );
});

test("the Moon's phrases: up throughout, rising, setting then rising", () => {
  const series = (altitudes) =>
    altitudes.map((altitude, index) => ({
      time: new Date(
        Date.parse("2026-10-14T20:00:00Z") + index * 3600000,
      ).toISOString(),
      altitude,
    }));
  const span = {
    start: "2026-10-14T20:00:00.000Z",
    end: "2026-10-15T04:00:00.000Z",
  };
  const phrase = (altitudes) =>
    nightSpanMoonPhrase(
      "fr",
      nightSpanForecastSummary([], series(altitudes), span),
      clockUtc,
    );
  assert.equal(
    phrase([5, 9, 12, 14, 15, 14, 12, 9, 5]),
    "Lune levée sur toute la plage",
  );
  assert.equal(
    phrase([-9, -6, -3, -1, 1, 3, 6, 9, 12]),
    "Lune levée à partir de 23:30",
  );
  assert.equal(
    phrase([4, 2, -2, -6, -8, -6, -2, 2, 4]),
    "Lune levée jusqu’à 21:30 puis à partir de 02:30",
  );
  assert.equal(
    phrase([-4, -2, 2, 4, 2, -2, -4, -6, -8]),
    "Lune levée de 21:30 à 00:30",
  );
  assert.equal(phrase([-4, -6, -8, -9, -9, -8, -6, -5, -4]), "Lune couchée");
});

test("rain already falling at the start, and heavier rain", () => {
  assert.equal(
    nightSpanRainPhrase(
      "fr",
      { level: "light", from: sky.darkStart, fromStart: true },
      clockUtc,
    ),
    "pluie faible dès le début",
  );
  assert.equal(
    nightSpanRainPhrase(
      "fr",
      { level: "heavy", from: "2026-10-15T03:00:00.000Z", fromStart: false },
      clockUtc,
    ),
    "forte pluie après 03:00",
  );
  assert.equal(nightSpanRainPhrase("fr", null, clockUtc), null);
});

test("the night's dates across a month, in the three languages", () => {
  assert.deepEqual(nightSpanNightDates("2026-10-14", "fr"), {
    from: "14",
    to: "15 octobre",
  });
  assert.deepEqual(nightSpanNightDates("2026-10-31", "fr"), {
    from: "31 octobre",
    to: "1 novembre",
  });
  assert.deepEqual(nightSpanNightDates("2026-10-14", "en"), {
    from: "October 14",
    to: "15",
  });
  assert.deepEqual(nightSpanNightDates("2026-10-31", "ja"), {
    from: "10月31日",
    to: "11月1日",
  });
});

test("the length of the span is written as every duration (U4)", () => {
  assert.equal(durationText(345, "fr").replaceAll("\u00a0", " "), "5 h 45");
  assert.equal(durationText(30, "fr").replaceAll("\u00a0", " "), "30 min");
});

test("a target not usable during the span still lands inside it", () => {
  const night = {
    start: "2026-10-14T20:00:00.000Z",
    end: "2026-10-15T04:00:00.000Z",
  };
  const span = {
    start: "2026-10-15T01:00:00.000Z",
    end: "2026-10-15T03:00:00.000Z",
  };
  const card = {
    target: { id: "m33" },
    series: [{ time: night.start, altitude: 40 }],
    visibilityWindows: [
      { start: "2026-10-14T20:00:00.000Z", end: "2026-10-14T22:00:00.000Z" },
    ],
    usableStart: "2026-10-14T20:00:00.000Z",
    usableEnd: "2026-10-14T22:00:00.000Z",
  };
  const placed = plannedItemPlacement({
    card: cardWithinNightSpan(card, span),
    night,
    items: [],
  });
  assert.equal(placed.startMinute, 300);
  assert.ok(placed.endMinute <= 420);
});

test("a new darkness keeps the clock time of a plan with a chosen span", () => {
  const items = [
    { id: "m31", startMinute: 60, endMinute: 180, durationMinutes: 120 },
  ];
  const withSpan = planWithNightSpan({ ...plan, items }, customNightSpan(sky));
  const nautical = planWithDarkness(withSpan, "nautical");
  const before = planNightWindow(withSpan);
  const after = planNightWindow(nautical);
  const clock = (window, item) =>
    Date.parse(window.darkStart) + item.startMinute * 60000;
  // Same instant to the minute, the span untouched.
  assert.ok(
    Math.abs(clock(before, items[0]) - clock(after, nautical.items[0])) <=
      60000,
  );
  assert.deepEqual(nautical.nightSpan, withSpan.nightSpan);
});

test("the web span editor: a pencil at rest, a tick and « Annuler » in edition, nothing written before the tick", () => {
  const component = readFileSync(
    new URL("../src/components/NightSpanTimeline.js", import.meta.url),
    "utf8",
  );
  // The pencil (an icon button, rule 8) only on a plan that holds a span and
  // can be edited; the tick (the secondary look) takes its place in edition.
  assert.match(component, /className="planner-night-span-edit"/);
  assert.match(component, /stored && editable/);
  assert.match(
    component,
    /className="btn-secondary planner-night-span-validate"/,
  );
  assert.match(component, /plannerNightSpanEdit/);
  assert.match(component, /plannerNightSpanValidate/);
  // "Annuler" is a link (rule 6) and drops the draft without writing.
  assert.match(
    component,
    /className="btn-link planner-night-span-cancel"\s+onClick=\{\(\) => finish\(null\)\}/,
  );
  assert.match(component, /message\(locale, "plannerCancel"\)/);
  // The tick writes the draft once; the handles and the keyboard only move it.
  assert.match(component, /onClick=\{\(\) => finish\(draft\)\}/);
  assert.doesNotMatch(component, /write\(/);
  assert.match(component, /setDraft\(steppedNightSpan\(/);
  // Handles and hint only in edition; the hours are plain text at rest.
  assert.match(component, /\{editing && handle\("start"\)\}/);
  assert.match(component, /plainHours=\{custom && !editing\}/);
  assert.match(component, /\{editing && \(\s*<p id="planner-night-span-hint"/);
  // "Nuit astronomique" in edition leaves it; "Définir" from the whole
  // night enters it directly.
  assert.match(
    component,
    /custom && finish\(stored \? \{ mode: "astronomical" \} : null\)/,
  );
  assert.match(component, /startEditing\(customNightSpan\(night\)\)/);
  // The chart keeps its height at rest and in edition.
  assert.match(component, /const height = custom \? 154 : 96;/);
});
