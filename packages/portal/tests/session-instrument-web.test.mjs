// SMART-SCOPE-INSTRUMENT-PANEL-01: the card « Instrument » of the page of a
// session and of the debriefing — one small card per fact a smart telescope
// gave, the curve of the night under them, the filter and the rejected frames
// on the lines of the targets. The events are those of the shared fixture
// (`session-instrument-summary.json`), which the phone reads too.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { messages } from "../dist/i18n.js";
import { debriefSummary } from "../dist/debrief-summary.js";
import * as model from "../dist/components/sessions/session-page-model.js";
import { sessionDeviceLines } from "../dist/components/sessions/session-device-lines.js";
import { sessionInstrumentChart } from "../dist/components/sessions/session-instrument-lines.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const loadJsxModule = (path) => import(`portal/${path}`);
const { instrumentTargetLine, instrumentView, withoutInstrumentSamples } =
  await loadJsxModule("components/sessions/SessionInstrument.js");

const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../../astro-contracts/fixtures/spec/session-instrument-summary.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const eventsOf = (id) => fixture.cases.find((entry) => entry.id === id).args[0];
const OPEN = eventsOf("vespera-night-application-open");
const CLOSED = eventsOf("vespera-night-application-closed-and-rebuilt");
const SEESTAR = eventsOf("seestar-light-pollution-board-overheat-star-trails");
const DWARF = eventsOf("dwarf-own-filter-word-and-wrong-values-ignored");
const NONE = eventsOf("no-instrument-sample");
const HEATER_OFF = eventsOf("heater-said-off-all-night");

const NB = " ";

const draw = async (props) => {
  const { SessionInstrument } = await loadJsxModule(
    "components/sessions/SessionInstrument.js",
  );
  return renderToStaticMarkup(
    createElement(SessionInstrument, { locale: "fr", ...props }),
  );
};
const textOf = (html) =>
  html
    .replace(/<[^>]+>/gu, "|")
    .replace(/\|+/gu, "|")
    .replace(/&#x27;/gu, "’")
    .replace(/&amp;/gu, "&");
const cardsOf = (view) =>
  view.cards.map((card) => [card.id, card.value, card.detail]);

test("a night with the application open: six cards, one per fact, in their agreed words", async () => {
  const view = instrumentView(OPEN, "fr");
  assert.equal(view.title, "Instrument");
  assert.equal(view.device, "Relevé par le Vespera II");
  assert.equal(view.subtitle, "relevés de la nuit, de 17:58 à 21:12");
  assert.deepEqual(cardsOf(view), [
    ["filter", "Double bande", "de 19:46 à 21:09 · aucun avant"],
    [
      "hygrometry",
      `74 à 83${NB}%`,
      `11 à 13${NB}°C · écart au point de rosée mini 2,8${NB}°C à 20:40`,
    ],
    ["heater", `1${NB}h${NB}14`, "actif de 19:58 à 21:12"],
    ["frames", "700 gardées", `190 rejetées (21${NB}%) · étoiles non rondes`],
    ["pointing", "1 abandon", "M45 · 6 essais, réussie à 20:05"],
    ["battery", `61${NB}%`, `92${NB}% à 17:58 → 61${NB}% à 21:12`],
  ]);
  assert.deepEqual(
    view.cards.map((card) => card.label),
    [
      "Filtre",
      "Hygrométrie",
      "Chauffage anti-buée",
      "Poses",
      "Pointage",
      "Batterie",
    ],
  );
  const html = await draw({ events: OPEN });
  assert.match(html, /Relevé par le Vespera II/u);
  assert.equal((html.match(/data-fact="/gu) ?? []).length, 6);
  assert.match(html, /<h2[^>]*>Instrument<\/h2>/u);
  // The curve of the night, under the cards, with its legend.
  assert.match(html, /data-testid="session-instrument-chart"/u);
  assert.ok(
    textOf(html).includes(
      "humidité (ligne), chauffage (bande), filtre (barre bleue) et poses rejetées par tranche de 10 min (barres)",
    ),
  );
  assert.match(html, /chauffage actif/u);
  assert.match(html, /filtre double bande/u);
  assert.ok(!html.includes("application fermée"));
  // « double bande », never « Dual-band ».
  assert.ok(!/dual/iu.test(html));
});

test("a night with the application closed: the line says where the collection stopped, the cards say « jusqu’à » and « au moins »", async () => {
  const view = instrumentView(CLOSED, "fr");
  assert.equal(
    view.subtitle,
    "relevés jusqu’à 20:30" +
      `${NB}: application fermée ensuite, rouverte à 21:40 · poses et échecs relus sur le Vespera`,
  );
  assert.deepEqual(cardsOf(view), [
    ["filter", "Double bande", "de 19:46 jusqu’à 20:30 au moins · aucun avant"],
    [
      "hygrometry",
      `74 à 82${NB}%`,
      `jusqu’à 20:30 · 11 à 13${NB}°C · écart au point de rosée mini 3,2${NB}°C à 20:05`,
    ],
    ["heater", `32${NB}min au moins`, "actif de 19:58 jusqu’à 20:30 au moins"],
    [
      "frames",
      "700 gardées",
      `190 rejetées (21${NB}%) · étoiles non rondes · relues à 21:40`,
    ],
    ["pointing", "1 abandon", "M45 · 6 essais, réussie à 20:05"],
    ["battery", `60${NB}%`, `92${NB}% à 17:58 → 60${NB}% à 21:40`],
  ]);
  const html = await draw({ events: CLOSED });
  // The hole of the curve is hatched and says it.
  assert.ok(textOf(html).includes(`application fermée${NB}: pas de relevé`));
  assert.match(html, /night-instrument-hole/u);
  // A card with no « relues » ends no sentence with it: the open night has none.
  assert.ok(
    !instrumentView(OPEN, "fr").subtitle.includes("relus sur"),
    "a night without a hole says nothing of a re-reading",
  );
});

test("a Seestar: « Filtre anti-pollution » active, the circuit board's temperature and its overheating, the star trails", () => {
  const view = instrumentView(SEESTAR, "fr");
  assert.equal(view.device, "Relevé par le Seestar S50 Pro");
  assert.deepEqual(cardsOf(view), [
    ["filter", "Actif", "de 21:26 à 21:40"],
    ["heater", "Jamais", "jamais enclenché"],
    ["frames", "18 gardées", `2 rejetées (10${NB}%) · traînées d’étoiles`],
    ["battery", `82${NB}%`, `84${NB}% à 21:26 → 82${NB}% à 21:40`],
    ["board", `38 à 41${NB}°C`, "surchauffe à 21:36"],
  ]);
  assert.deepEqual(
    view.cards.map((card) => card.label),
    [
      "Filtre anti-pollution",
      "Chauffage anti-buée",
      "Poses",
      "Batterie",
      "Température de la carte",
    ],
  );
  assert.equal(view.cards.at(-1).warn, true);
});

test("a DWARF: the word it gives its filter, « 32 gardées sur 35 prises », the sensor's temperature, no hygrometer", () => {
  const view = instrumentView(DWARF, "fr");
  assert.equal(view.device, "Relevé par le DWARF");
  assert.deepEqual(cardsOf(view), [
    ["filter", "IR", "de 22:00 à 22:05"],
    ["frames", "32 gardées", "sur 35 prises"],
    ["sensor", `9 à 12${NB}°C`, null],
  ]);
  assert.equal(view.cards.at(-1).label, "Température");
});

test("the device's model names the card, else its family, else « le télescope »", () => {
  assert.equal(
    instrumentView(HEATER_OFF, "fr").device,
    "Relevé par le Vespera",
  );
  assert.equal(
    instrumentView(
      [
        {
          type: "device_instrument",
          recordedAt: "2026-11-02T23:00:00.000Z",
          payload: { heater: "off" },
        },
      ],
      "fr",
    ).device,
    "Relevé par le télescope",
  );
});

test("a night with no sample draws nothing, not even a title", async () => {
  assert.equal(instrumentView(NONE, "fr"), null);
  assert.equal(instrumentView([], "fr"), null);
  assert.equal(await draw({ events: NONE }), "");
  assert.equal(await draw({ events: [] }), "");
  // Samples that say nothing a card could show draw nothing either.
  assert.equal(
    await draw({
      events: [
        {
          type: "device_instrument",
          recordedAt: "2026-11-02T23:00:00.000Z",
          payload: { family: "vespera", targetLabel: "M45" },
        },
      ],
    }),
    "",
  );
});

test("one card per fact the telescope gave, never a card without a fact", () => {
  // The heater said off all night is one card: « Jamais ».
  assert.deepEqual(cardsOf(instrumentView(HEATER_OFF, "fr")), [
    ["heater", "Jamais", "jamais enclenché"],
  ]);
  for (const id of fixture.cases.map((entry) => entry.id)) {
    const view = instrumentView(eventsOf(id), "fr");
    if (view === null) continue;
    const ids = view.cards.map((card) => card.id);
    assert.equal(new Set(ids).size, ids.length, id);
    for (const card of view.cards) {
      assert.ok(card.label && card.value, `${id} ${card.id}`);
      assert.notEqual(card.value, "—", `${id} ${card.id}`);
    }
  }
  // A telescope that says its humidity and nothing else: that card alone.
  const humidity = instrumentView(
    [
      {
        type: "device_instrument",
        recordedAt: "2026-11-02T23:00:00.000Z",
        payload: { family: "vespera", humidity: 71 },
      },
    ],
    "fr",
  );
  assert.deepEqual(cardsOf(humidity), [["hygrometry", `71${NB}%`, null]]);
  assert.equal(humidity.subtitle, "relevés de la nuit, à 23:00");
});

test("the filter's cards: several stretches name their filter, none at all says « Aucun », a Seestar without one is « Inactif »", () => {
  const sample = (at, payload) => ({
    type: "device_instrument",
    recordedAt: `2026-11-02T${at}:00.000Z`,
    payload: { family: "vespera", ...payload },
  });
  const two = instrumentView(
    [
      sample("20:00", { filter: "dual_band" }),
      sample("20:05", { filter: "dual_band" }),
      sample("20:10", { filter: "none" }),
      sample("20:20", { filter: "cls" }),
      sample("20:25", { filter: "cls" }),
    ],
    "fr",
  );
  assert.deepEqual(cardsOf(two), [
    ["filter", "CLS", "double bande de 20:00 à 20:10 · CLS de 20:20 à 20:25"],
  ]);
  const none = instrumentView(
    [sample("20:00", { filter: "none" }), sample("20:05", { filter: "none" })],
    "fr",
  );
  assert.deepEqual(cardsOf(none), [["filter", "Aucun", null]]);
  const seestar = instrumentView(
    [
      sample("20:00", { family: "seestar", filter: "none" }),
      sample("20:05", { family: "seestar", filter: "none" }),
    ],
    "fr",
  );
  assert.deepEqual(cardsOf(seestar), [["filter", "Inactif", null]]);
  assert.equal(seestar.cards[0].label, "Filtre anti-pollution");
  // « Anti-pollution » for the Vespera's own word.
  assert.equal(
    instrumentView([sample("20:00", { filter: "light_pollution" })], "fr")
      .cards[0].value,
    "Anti-pollution",
  );
});

test("the causes: three known ones are said, any other as it comes; the second only when it counts", () => {
  const frames = (rejections, rejected) =>
    instrumentView(
      [
        {
          type: "device_instrument",
          recordedAt: "2026-11-02T20:00:00.000Z",
          payload: {
            family: "vespera",
            framesStacked: 80,
            framesRejected: rejected,
            rejections,
          },
        },
      ],
      "fr",
    ).cards[0].detail;
  assert.equal(
    frames(
      [
        { cause: "StackingRoundnessError", count: 10 },
        { cause: "StackingStarsError", count: 8 },
      ],
      18,
    ),
    `18 rejetées (18${NB}%) · étoiles non rondes, trop peu d’étoiles`,
  );
  assert.equal(
    frames([{ cause: "star_trails", count: 2 }], 2),
    `2 rejetées (2${NB}%) · traînées d’étoiles`,
  );
  assert.equal(
    frames([{ cause: "Overexposed", count: 3 }], 3),
    `3 rejetées (4${NB}%) · Overexposed`,
  );
  assert.equal(
    frames([{ cause: "StackingRoundnessError", count: 0 }], 0),
    "aucune rejetée",
  );
});

test("the lines of the targets: the filter read on the device and the frames it rejected, nothing for a target it did not talk about", () => {
  const { summary } = instrumentView(OPEN, "fr");
  assert.deepEqual(
    instrumentTargetLine(summary, { key: "ic1805", label: "IC 1805" }, "fr"),
    { filter: "double bande", rejected: "128 rejetées" },
  );
  // M45 carried no filter: only its rejected frames.
  assert.deepEqual(
    instrumentTargetLine(summary, { key: "m45", label: "M45" }, "fr"),
    { filter: null, rejected: "62 rejetées" },
  );
  // Read by name when the key is not the device's.
  assert.deepEqual(
    instrumentTargetLine(summary, { key: "ic-1805", label: " ic 1805 " }, "fr"),
    { filter: "double bande", rejected: "128 rejetées" },
  );
  assert.equal(
    instrumentTargetLine(summary, { key: "m31", label: "M 31" }, "fr"),
    null,
  );
  assert.equal(instrumentTargetLine(null, { key: "ic1805" }, "fr"), null);
  // A target that rejected nothing has no « rejetées »; a Seestar says its filter.
  const seestar = instrumentView(SEESTAR, "fr").summary;
  assert.deepEqual(
    instrumentTargetLine(seestar, { key: "m42", label: "M42" }, "fr"),
    { filter: "anti-pollution", rejected: "2 rejetées" },
  );
  assert.equal(
    instrumentTargetLine(seestar, { key: "m31", label: "M31" }, "fr"),
    null,
  );
  assert.deepEqual(
    instrumentTargetLine(
      instrumentView(DWARF, "fr").summary,
      { key: "m33", label: "M33" },
      "fr",
    ),
    { filter: "IR", rejected: null },
  );
});

test("a card of a target says them after its declared line, or on a line of its own", async () => {
  const { SessionTargetCard } = await loadJsxModule(
    "components/sessions/SessionTargetCard.js",
  );
  const [card] = model.sessionCards({
    targets: [
      {
        targetId: "ic1805",
        label: "IC 1805",
        planItemId: "ic1805",
        state: "planned",
        outcome: "done",
        reason: null,
        plannedSeconds: 7200,
        acquiredSeconds: 7200,
        measured: {
          source: "declared",
          lines: [
            { filter: "L", exposureSeconds: 10, gain: null, frameCount: 40 },
          ],
        },
      },
    ],
  });
  const line = (props, shown = card) =>
    renderToStaticMarkup(
      createElement(
        "ul",
        null,
        createElement(SessionTargetCard, {
          locale: "fr",
          card: shown,
          ...props,
        }),
      ),
    );
  const html = line({
    instrument: { filter: "double bande", rejected: "128 rejetées" },
  });
  assert.match(
    textOf(html),
    /Déclaré 40 × 10 s · L\|?\s*· \|?double bande\|?\s*· \|?128 rejetées/u,
  );
  assert.match(html, /session-card-rejected/u);
  // Nothing to add, nothing added.
  assert.ok(!line({ instrument: null }).includes("data-instrument"));
  // No declared line: the instrument's words take a line of their own.
  const bare = line(
    { instrument: { filter: null, rejected: "62 rejetées" } },
    { ...card, measuredShooting: null },
  );
  assert.ok(!bare.includes("Déclaré"));
  assert.match(bare, /62 rejetées/u);
});

test("an instrument sample adds nothing to « Monture et pointage », to the reports, to the window or to the journal list", () => {
  const samples = OPEN.filter((event) => event.type === "device_instrument");
  assert.ok(samples.length > 20);
  assert.deepEqual(sessionDeviceLines(samples), []);
  // The `device_connected` that names the model and the link lost keep their
  // own lines; the samples add none.
  assert.deepEqual(
    sessionDeviceLines(OPEN).map((line) => line.kind),
    ["connected", "linkLost"],
  );
  assert.deepEqual(
    model.sessionReports({
      events: samples,
      windowEnd: "2026-11-03T00:00:00.000Z",
    }),
    [],
  );
  const base = {
    nightStartAt: "2026-11-02T17:00:00.000Z",
    window: { start: "2026-11-02T17:00:00.000Z" },
    planItems: [
      { id: "ic1805", targetId: "ic1805", startMinute: 60, endMinute: 180 },
    ],
  };
  const target = {
    type: "target_started",
    recordedAt: "2026-11-02T18:00:00.000Z",
    eventId: "t1",
    payload: { targetId: "ic1805", planItemId: "ic1805" },
  };
  const note = {
    type: "note",
    recordedAt: "2026-11-02T20:00:00.000Z",
    eventId: "n1",
    payload: { text: "Vent." },
  };
  assert.deepEqual(
    debriefSummary({ ...base, events: [target, note, ...samples] }),
    debriefSummary({ ...base, events: [target, note] }),
  );
  // The journal list leaves the samples out and keeps the rest.
  assert.deepEqual(
    withoutInstrumentSamples([target, ...samples, note]).map(
      (event) => event.type,
    ),
    ["target_started", "note"],
  );
});

test("the curve of the night: ten-minute slices, the heater's band, the rejected frames, the hole of a closed application", () => {
  const open = sessionInstrumentChart(OPEN, 10);
  assert.equal(open.length, 20);
  // The mean of the two samples of the first slice (74 and 75.2).
  assert.equal(open[0].humidity, 74.6);
  assert.equal(open[0].heater, false);
  // 19:58 is the twelfth slice from 17:58.
  assert.equal(open[12].heater, true);
  assert.ok(open.slice(12).every((bin) => bin.heater));
  assert.ok(open.slice(0, 12).every((bin) => !bin.heater));
  assert.equal(open[0].filter, "none");
  assert.ok(open.some((bin) => bin.filter === "dual_band"));
  assert.equal(
    open.reduce((sum, bin) => sum + bin.rejected, 0),
    190,
  );
  assert.ok(open.every((bin) => bin.hole === false));

  const closed = sessionInstrumentChart(CLOSED, 10);
  const holes = closed.filter((bin) => bin.hole);
  assert.ok(holes.length >= 5);
  for (const bin of holes) {
    assert.equal(bin.humidity, null);
    assert.equal(bin.heater, false);
  }
  assert.equal(closed[0].hole, false);
  assert.equal(sessionInstrumentChart(NONE, 10), null);
});

test("the hours are the place's when its zone is known, UTC otherwise", () => {
  assert.equal(
    instrumentView(OPEN, "fr").subtitle,
    "relevés de la nuit, de 17:58 à 21:12",
  );
  assert.equal(
    instrumentView(OPEN, "fr", "Asia/Tokyo").subtitle,
    "relevés de la nuit, de 02:58 à 06:12",
  );
  assert.equal(
    instrumentView(OPEN, "fr", "Asia/Tokyo").cards[0].detail,
    "de 04:46 à 06:09 · aucun avant",
  );
});

test("the debriefing shows the cards without the curve", async () => {
  const html = await draw({ events: OPEN, chart: false });
  assert.equal((html.match(/data-fact="/gu) ?? []).length, 6);
  assert.ok(!html.includes("session-instrument-chart"));
  assert.ok(!html.includes("<svg"));
});

test("every language says every card: no key is missing, no placeholder is left, « Dual-band » is nobody's word", () => {
  const events = [OPEN, CLOSED, SEESTAR, DWARF, HEATER_OFF];
  for (const locale of Object.keys(messages)) {
    for (const key of Object.keys(messages.fr).filter((name) =>
      name.startsWith("sessionInstrument"),
    )) {
      assert.ok(messages[locale][key], `${locale} ${key}`);
      assert.ok(!/dual-band/iu.test(messages[locale][key]), `${locale} ${key}`);
    }
    for (const night of events) {
      const view = instrumentView(night, locale, "UTC");
      const sentences = [
        view.title,
        view.device,
        view.subtitle,
        ...view.cards.flatMap((card) => [card.label, card.value, card.detail]),
      ].filter((text) => text !== null);
      for (const text of sentences) {
        assert.ok(text.length > 0, locale);
        assert.ok(!/[{}]/u.test(text), `${locale}: ${text}`);
        assert.ok(!text.includes("undefined"), `${locale}: ${text}`);
      }
    }
  }
});

test("the French words keep their typography: a no-break space before « : » and « % », the true apostrophe", () => {
  for (const key of Object.keys(messages.fr).filter((name) =>
    name.startsWith("sessionInstrument"),
  )) {
    const text = messages.fr[key];
    assert.ok(!/ [:;?!%]/u.test(text), `${key}: ${text}`);
    assert.ok(!text.includes("'"), key);
  }
  assert.equal(messages.fr.sessionInstrumentFilterDualBand, "Double bande");
});
