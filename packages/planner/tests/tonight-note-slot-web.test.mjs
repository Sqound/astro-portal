import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { forecastHourScore } from "portal/astronomy-forecast.js";
import { planNightSpanSky } from "planner/planner.js";
import { tonightOverview } from "planner/tonight-overview.js";
import { tonightWords } from "planner/tonight-words.js";
import {
  plansWithTonightSlot,
  readTonightSlotRecord,
  tonightChosenSlot,
  tonightSlotStorageKey,
  tonightSnappedSlot,
  writeTonightSlotRecord,
} from "planner/tonight-slot.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// The slot on the pending plan or in the browser, the card as one button with
// the slot line and its link, "La nuit" with its grey buttons and the chosen
// slot, the hatched hours, the ⓘ in the corner.
await registerJsx();
const { VerdictSection, NightZone } =
  await import("planner/components/NightDetailParts.js");
const { HourlyForecast } = await import("planner/components/HourlyForecast.js");

const place = {
  id: "lac-noir",
  name: "Camping du Lac Noir",
  latitude: "45",
  longitude: "-30",
  timeZone: "UTC",
};
const date = "2026-10-14";
const sky = planNightSpanSky({ date }, place);
const hour = 3600000;
const first = Math.ceil(Date.parse(sky.darkStart) / hour) * hour;
// Clear for the first hours, then covered: a "Bon début de nuit" night.
const hourly = Array.from({ length: 9 }, (_, index) => {
  const row = {
    time: first + index * hour,
    cloud: index < 4 ? 5 : 80,
    precipitation: 0,
    visibility: 20000,
    wind: 8,
    humidity: 70,
  };
  return { ...row, score: forecastHourScore(row).score };
});
const forecast = (rows) => ({
  score: rows.reduce((sum, row) => sum + row.score, 0) / rows.length,
});
const at = (value) => new Date(value).toISOString().slice(11, 16);
const pending = {
  id: "plan-lac",
  name: "Nuit d’octobre au lac",
  status: "pending",
};
const slot = {
  start: new Date(first).toISOString(),
  end: new Date(first + 3 * hour).toISOString(),
};

function words({ chosen = null } = {}) {
  const inSlot = chosen
    ? hourly.filter(
        (row) =>
          row.time >= Date.parse(chosen.start) &&
          row.time <= Date.parse(chosen.end),
      )
    : hourly;
  const overview = tonightOverview({
    place,
    date,
    night: sky,
    hourly,
    moonIllumination: 10,
    moonSeries: [],
    forecast: forecast(inSlot),
    slot: chosen,
  });
  return {
    overview,
    words: tonightWords(overview, {
      locale: "fr",
      timeZone: "UTC",
      verdictHours: hourly,
    }),
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("the slot is the pending plan's, else the browser's record for tonight only", () => {
  const withPlan = {
    date,
    plans: [{ ...pending, nightSpan: { mode: "custom", ...slot } }],
  };
  assert.deepEqual(tonightChosenSlot(withPlan, null), slot);
  assert.equal(
    tonightChosenSlot(
      { date, plans: [{ ...pending, nightSpan: { mode: "astronomical" } }] },
      null,
    ),
    null,
  );
  const storage = memoryStorage();
  writeTonightSlotRecord(storage, { date, ...slot });
  const record = readTonightSlotRecord(storage);
  assert.deepEqual(tonightChosenSlot({ date, plans: [] }, record), slot);
  // A record of another night is forgotten.
  assert.equal(
    tonightChosenSlot({ date: "2026-10-15", plans: [] }, record),
    null,
  );
  writeTonightSlotRecord(storage, null);
  assert.equal(storage.getItem(tonightSlotStorageKey), null);
});

test("choosing writes the pending plan's nightSpan, « Toute la nuit » the astronomical night", () => {
  const subject = { date, plans: [pending] };
  const written = plansWithTonightSlot(
    [pending, { id: "other" }],
    subject,
    slot,
  );
  assert.equal(written.plan.id, "plan-lac");
  assert.deepEqual(written.plans[0].nightSpan, { mode: "custom", ...slot });
  assert.deepEqual(written.plans[1], { id: "other" });
  assert.deepEqual(
    plansWithTonightSlot([pending], subject, null).plans[0].nightSpan,
    { mode: "astronomical" },
  );
  assert.equal(plansWithTonightSlot([], { date, plans: [] }, slot).plan, null);
});

test("the ideal slot is brought onto the editor's ten-minute marks", () => {
  const snapped = tonightSnappedSlot(sky, {
    start: new Date(first).toISOString(),
    end: sky.darkEnd,
  });
  assert.equal(snapped.mode, "custom");
  assert.equal(new Date(snapped.end).getUTCMinutes() % 10, 0);
  assert.ok(Date.parse(snapped.end) <= Date.parse(sky.darkEnd));
});

test("the card: one button with the score, the story's sentence and « Créneau idéal » with its link", () => {
  const { words: page } = words();
  assert.equal(page.verdict.slot.kind, "ideal");
  assert.equal(page.verdict.slot.link, "Utiliser ce créneau");
  assert.equal(page.verdict.slot.label, "Créneau idéal :");
  const html = renderToStaticMarkup(
    createElement(VerdictSection, {
      words: page,
      locale: "fr",
      onRetry: () => {},
      onUseIdeal: () => {},
      onWholeNight: () => {},
    }),
  );
  assert.match(
    html,
    /class="tonight-verdict-hit"[^>]*aria-label="Verdict de la nuit, \d+\/100, Nuit [^"]+\. [^"]+"/u,
  );
  assert.match(html, /aria-description="Ouvre le détail de la note"/u);
  assert.match(html, /data-testid="tonight-verdict-ideal"/u);
  // The link is a 20 px icon, named by the same words.
  assert.match(
    html,
    /class="tonight-verdict-slot-icon"[^>]*aria-label="Utiliser ce créneau"[^>]*title="Utiliser ce créneau"/u,
  );
  assert.match(html, /class="tonight-verdict-info"/u);
  assert.doesNotMatch(html, /pointillé/u);
});

test("a chosen slot: « Créneau choisi » and « Toute la nuit » on the card only when a plan holds it; « La nuit » follows the slot", () => {
  const { overview, words: page } = words({ chosen: slot });
  assert.equal(overview.slot.start, slot.start);
  assert.equal(page.verdict.slot.kind, "chosen");
  assert.equal(page.night.label, "Créneau choisi · nuit astronomique");
  assert.equal(page.night.window, `${at(slot.start)} → ${at(slot.end)}`);
  assert.equal(page.night.duration, "3 h choisies");
  assert.equal(
    page.night.slot.follows,
    "Les notes, les tuiles et la prévision de cette page suivent ce créneau.",
  );
  const card = (onWholeNight) =>
    renderToStaticMarkup(
      createElement(VerdictSection, {
        words: page,
        locale: "fr",
        onRetry: () => {},
        onWholeNight,
      }),
    );
  assert.match(
    card(() => {}),
    />Toute la nuit</u,
  );
  assert.doesNotMatch(card(null), /tonight-verdict-chosen/u);
  // The filigree keeps the whole night, the outside hatched.
  assert.ok(page.verdict.excluded.from === 0);
  assert.ok(page.verdict.excluded.to > 0 && page.verdict.excluded.to < 1);
  assert.match(
    card(() => {}),
    /data-testid="tonight-excluded"/u,
  );
  const zone = renderToStaticMarkup(
    createElement(NightZone, {
      words: page,
      overview,
      onChooseSlot: () => {},
      onWholeNight: () => {},
    }),
  );
  assert.match(
    zone,
    /data-testid="tonight-night-slot-button"[^>]*aria-label="Choisir le créneau de la nuit"/u,
  );
  assert.match(zone, /data-testid="tonight-night-slot-follows"/u);
  assert.match(zone, /data-testid="tonight-night-whole-night"/u);
  assert.ok((zone.match(/data-testid="tonight-excluded"/gu) || []).length >= 2);
});

test("the hourly strip hatches the hours outside the slot and keeps its ⓘ in the corner", () => {
  const html = renderToStaticMarkup(
    createElement(HourlyForecast, {
      forecast: { hourly, fetchedAt: null },
      locale: "fr",
      night: { start: sky.darkStart, end: sky.darkEnd },
      onRefresh: () => {},
      timeZone: "UTC",
      title: "Estimation météo heure par heure",
      hourScores: true,
      infoInCorner: true,
      slot,
    }),
  );
  assert.match(html, /planner-hourly-forecast is-info-corner/u);
  const excluded = (html.match(/data-excluded="true"/gu) || []).length;
  assert.equal(excluded, hourly.length - 3);
  // The refresh comes before the ⓘ: immediately left of it.
  assert.ok(
    html.indexOf("planner-hourly-forecast-refresh") <
      html.indexOf("planner-info-disclosure"),
  );
});

test("the style sheet: the ⓘ against the corner, the threshold's button grey, the hatch's grey", () => {
  const css = readFileSync(
    new URL("../../portal-app/styles/portal.css", import.meta.url),
    "utf8",
  );
  const rule = (selector) => {
    const start = css.indexOf(`${selector} {`);
    assert.ok(start >= 0, selector);
    return css.slice(start, css.indexOf("}", start));
  };
  const info = rule(".tonight-verdict-info");
  assert.match(info, /position: absolute;/u);
  assert.match(info, /top: 0;/u);
  assert.match(info, /right: 0;/u);
  assert.match(info, /width: 44px;/u);
  assert.match(rule(".tonight-night-threshold"), /color: var\(--muted\);/u);
  assert.doesNotMatch(rule(".tonight-night-threshold"), /var\(--accent\)/u);
  assert.match(rule(".tonight-verdict-slot-link"), /min-height: 44px;/u);
});
