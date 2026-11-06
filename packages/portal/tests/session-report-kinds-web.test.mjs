// « Signalements — les genres créés par
// Astro Sync »: on the web, the four kinds Astro Sync detects (exposure
// time, guiding timeouts, sensor temperature, guiding spikes) and the
// fall-back of a kind this version does not know, in the frise and its
// legend, the lines of a target, the fiche of a disc, « Remanier » (a bin, no
// pencil) and the journal list of the page. The night: Sadr,
// 14 and 15 August (the guiding figures are the real ones, read-only; the
// exposure change, the temperature drift and the unknown kind are invented).
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { messages } from "../dist/i18n.js";
import * as model from "../dist/components/sessions/session-page-model.js";
import * as view from "../dist/components/sessions/session-page-view.js";
import * as rework from "../dist/components/sessions/session-rework.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const loadJsxModule = (path) => import(`portal/${path}`);

const NBSP = "\u00a0";
const START = "2026-08-14T21:30:00.000Z";
const END = "2026-08-15T05:50:00.000Z";
const plain = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

let counter = 0;
const ulid = () =>
  `01J8Z3K9QZ6N3S6R3E6G8H${String(++counter).padStart(4, "0")}`;
const event = (type, recordedAt, payload, extra = {}) => ({
  eventId: ulid(),
  sessionId: "s1",
  type,
  recordedAt,
  receivedAt: recordedAt,
  originDeviceId: null,
  timing: "observed",
  payload,
  ...extra,
});
const detected = (type, at, payload) =>
  event(type, at, payload, { source: "astro-sync" });

const events = [
  event("target_started", "2026-08-14T21:31:00.000Z", { targetId: "sadr" }),
  detected("guiding_timeouts", "2026-08-14T21:44:00.000Z", {
    count: 11,
    firstAt: "2026-08-14T21:44:10Z",
    lastAt: "2026-08-15T03:44:02Z",
  }),
  detected("exposure_change", "2026-08-14T23:12:00.000Z", {
    fromSeconds: 120,
    toSeconds: 180,
  }),
  detected("guiding_spikes", "2026-08-15T00:10:00.000Z", {
    count: 3,
    maxArcSeconds: 9,
    firstAt: "2026-08-15T00:10:00Z",
    lastAt: "2026-08-15T01:08:00Z",
  }),
  detected("sensor_temperature_drift", "2026-08-15T02:05:00.000Z", {
    fromCelsius: -10,
    toCelsius: -6,
  }),
  event("equipment_issue", "2026-08-15T01:02:00.000Z", {
    description: "Guidage perd l’étoile",
  }),
  event("focus_drift", "2026-08-14T23:40:00.000Z", {
    description: "Dérive du focuseur : 12 pas",
  }),
  event("future_without_words", "2026-08-15T03:00:00.000Z", {}),
  event("target_finished", "2026-08-15T03:50:00.000Z", { targetId: "sadr" }),
];
const passages = model.nightPassages(events, END);
const cardsOf = (reports) =>
  model.sessionCards({
    targets: [
      {
        targetId: "sadr",
        state: "planned",
        startedAt: "2026-08-14T21:31:00.000Z",
        finishedAt: "2026-08-15T03:50:00.000Z",
      },
    ],
    passages,
    reports,
    titleOf: () => "Sadr",
  });
const reports = () =>
  model.sessionReports({ events, passages, windowEnd: END });

test("the four detected kinds are reports, each its own kind, a point, placed on the target they happened during", () => {
  const found = reports();
  assert.deepEqual(
    found.map((report) => report.kind),
    [
      "guidingTimeout",
      "exposure",
      "signal",
      "guidingSpikes",
      "incident",
      "temperature",
      "signal",
    ],
  );
  for (const report of found) assert.equal(report.until, null);
  for (const kind of ["guidingTimeout", "exposure", "temperature"])
    assert.equal(
      found.find((report) => report.kind === kind).targetKey,
      "sadr",
    );
});

test("« Détecté par Astro Sync » only on what the service says Astro Sync wrote; never on an unknown kind", () => {
  const found = reports();
  assert.deepEqual(
    found.map((report) => [report.kind, report.detected]),
    [
      ["guidingTimeout", true],
      ["exposure", true],
      ["signal", false],
      ["guidingSpikes", true],
      ["incident", false],
      ["temperature", true],
      ["signal", false],
    ],
  );
  // A service that predates `source` (or an event it did not write) says
  // nothing: no mention, even for a kind Astro Sync usually writes.
  const silent = model.sessionReports({
    events: [
      event("guiding_spikes", "2026-08-15T00:10:00.000Z", {
        count: 1,
        maxArcSeconds: 5,
        firstAt: "2026-08-15T00:10:00Z",
        lastAt: "2026-08-15T00:10:00Z",
      }),
    ],
  });
  assert.equal(silent[0].detected, false);
  // A pause or an incident Astro Sync wrote (the « Liste des incidents »)
  // carries the mention as well.
  const pause = model.sessionReports({
    events: [
      event("pause", "2026-08-15T00:13:00.000Z", {}, { source: "astro-sync" }),
      event("resume", "2026-08-15T00:25:00.000Z", {}),
      event(
        "equipment_issue",
        "2026-08-15T01:02:00.000Z",
        { description: "x" },
        { source: "astro-sync" },
      ),
    ],
  });
  assert.deepEqual(
    pause.map((report) => [report.kind, report.detected]),
    [
      ["pause", true],
      ["incident", true],
    ],
  );
});

test("the movements of the night are no report; a type nobody knows is a « signal », with the sentence of the service when it has one", () => {
  const found = reports();
  const signals = found.filter((report) => report.kind === "signal");
  assert.deepEqual(
    signals.map((report) => report.text),
    ["Dérive du focuseur : 12 pas", null],
  );
  assert.ok(
    !found.some((report) =>
      ["target_started", "target_finished"].includes(report.payload?.type),
    ),
  );
  // Nine movements and gestures, none of them a signal.
  const only = model.sessionReports({
    events: [
      event("target_started", START, { targetId: "sadr" }),
      event("auto_time_confirmed", START, { targetId: "sadr" }),
      event("target_skipped", START, { targetId: "sadr", reason: "weather" }),
    ],
  });
  assert.deepEqual(only, []);
});

test("the sentences, in French and as the phone writes them", () => {
  const sentence = (kind) =>
    view.reportText(
      reports().find((report) => report.kind === kind),
      "fr",
    );
  assert.equal(
    sentence("guidingTimeout"),
    `Attentes de guidage dépassées${NBSP}: 11 fois de 21:44 à 03:44`,
  );
  assert.equal(
    sentence("exposure"),
    `Durée de pose changée${NBSP}: de 120${NBSP}s à 180${NBSP}s`,
  );
  assert.equal(
    sentence("guidingSpikes"),
    `Pics de guidage${NBSP}: 3 fois, jusqu’à 9,0″ de 00:10 à 01:08`,
  );
  assert.equal(
    sentence("temperature"),
    `Température du capteur${NBSP}: de −10${NBSP}°C à −6${NBSP}°C`,
  );
  const unknown = reports().filter((report) => report.kind === "signal");
  assert.equal(
    view.reportText(unknown[0], "fr"),
    "Signalement · Dérive du focuseur : 12 pas",
  );
  assert.equal(view.reportText(unknown[1], "fr"), "Signalement");
});

test("a single finding and a group inside one minute read as a point; a payload without figures says nothing wrong", () => {
  const one = {
    kind: "guidingTimeout",
    at: Date.parse("2026-08-14T21:44:00.000Z"),
    payload: {
      count: 1,
      firstAt: "2026-08-14T21:44:10Z",
      lastAt: "2026-08-14T21:44:10Z",
    },
  };
  assert.equal(
    view.reportText(one, "fr"),
    "Attente de guidage dépassée à 21:44",
  );
  const same = { ...one, payload: { ...one.payload, count: 4 } };
  assert.equal(
    view.reportText(same, "fr"),
    `Attentes de guidage dépassées${NBSP}: 4 fois à 21:44`,
  );
  const bare = { kind: "guidingSpikes", at: one.at, text: null, payload: {} };
  assert.equal(view.reportText(bare, "fr"), "");
});

test("every sentence exists in the ten languages, with its placeholders", () => {
  const keys = {
    sessionReportExposure: ["{from}", "{to}"],
    sessionReportTemperature: ["{from}", "{to}"],
    sessionReportTimeoutsOne: ["{at}"],
    sessionReportTimeoutsOther: ["{count}", "{from}", "{to}"],
    sessionReportTimeoutsSame: ["{count}", "{at}"],
    sessionReportSpikesOne: ["{max}", "{at}"],
    sessionReportSpikesOther: ["{count}", "{max}", "{from}", "{to}"],
    sessionReportSpikesSame: ["{count}", "{max}", "{at}"],
    sessionReportDetected: [],
    sessionPageLegendExposure: [],
    sessionPageLegendGuidingTimeout: [],
    sessionPageLegendTemperature: [],
    sessionPageLegendGuidingSpikes: [],
    sessionPageLegendSignal: [],
  };
  const locales = Object.keys(messages);
  assert.equal(locales.length, 10);
  for (const locale of locales)
    for (const [key, placeholders] of Object.entries(keys)) {
      const text = messages[locale][key];
      assert.equal(typeof text, "string", `${locale} ${key}`);
      for (const placeholder of placeholders)
        assert.ok(
          text.includes(placeholder),
          `${locale} ${key} ${placeholder}`,
        );
    }
  // And the sentence is composed in each of them from the structured fields.
  const timeouts = reports().find((report) => report.kind === "guidingTimeout");
  const spikes = reports().find((report) => report.kind === "guidingSpikes");
  for (const locale of locales) {
    for (const report of [timeouts, spikes]) {
      const text = view.reportText(report, locale);
      assert.ok(text.includes("21:44") || text.includes("00:10"), locale);
      assert.ok(!text.includes("{"), `${locale}: ${text}`);
    }
  }
});

test("the frise draws a disc per kind, the legend names only the kinds present, the fiche carries the mention", async () => {
  const { SessionFrise } = await loadJsxModule(
    "components/sessions/SessionFrise.js",
  );
  const frise = model.sessionFrise({
    cards: cardsOf(reports()),
    reports: reports(),
    windowStart: START,
    windowEnd: END,
  });
  const html = renderToStaticMarkup(
    createElement(SessionFrise, { locale: "fr", frise }),
  );
  for (const kind of [
    "exposure",
    "guidingTimeout",
    "temperature",
    "guidingSpikes",
    "signal",
  ])
    assert.ok(html.includes(`session-frise-marker is-${kind}`), kind);
  const legend = html.slice(html.lastIndexOf("session-frise-legend"));
  const words = plain(legend);
  for (const word of [
    "durée de pose",
    "attente de guidage",
    "température",
    "pics de guidage",
    "signalement",
    "incident",
  ])
    assert.ok(words.includes(word), word);
  // Without any of them, the legend is the one of before.
  const quietReports = model.sessionReports({
    events: [event("note", START, { text: "Rosée" })],
  });
  const quiet = model.sessionFrise({
    cards: cardsOf(quietReports),
    reports: quietReports,
    windowStart: START,
    windowEnd: END,
  });
  const quietLegend = plain(
    renderToStaticMarkup(
      createElement(SessionFrise, { locale: "fr", frise: quiet }),
    ),
  );
  for (const word of [
    "durée de pose",
    "attente de guidage",
    "pics de guidage",
    "signalement",
  ])
    assert.ok(!quietLegend.includes(word), word);
});

test("a line of the target: the sentence, the glyph and the mention; an unknown kind has no mention", async () => {
  const { ReportLine } = await loadJsxModule(
    "components/sessions/SessionTargetCard.js",
  );
  const [timeouts] = reports();
  const line = plain(
    renderToStaticMarkup(
      createElement(ReportLine, { report: timeouts, locale: "fr" }),
    ),
  );
  assert.ok(line.includes("21:44"));
  assert.ok(line.includes("Attentes de guidage dépassées"));
  assert.ok(line.includes("Détecté par Astro Sync"));
  const unknown = reports().find((report) => report.kind === "signal");
  const html = renderToStaticMarkup(
    createElement(ReportLine, { report: unknown, locale: "fr" }),
  );
  assert.ok(html.includes("Signalement"));
  assert.ok(!html.includes("Détecté"));
  assert.ok(!html.includes("Note"));
});

test("« Remanier »: a detected report has a bin and no pencil; the fall-back has neither; the four gestures are as before", () => {
  const byKind = (kind) => reports().find((report) => report.kind === kind);
  for (const kind of [
    "exposure",
    "guidingTimeout",
    "temperature",
    "guidingSpikes",
  ]) {
    // The incidents Astro Sync finds in the guiding are corrected as
    // incidents; a measure (a pose, a temperature) has no pencil.
    assert.equal(
      rework.reportIsEditable(byKind(kind)),
      kind === "guidingTimeout" || kind === "guidingSpikes",
      kind,
    );
    assert.equal(rework.reportIsRemovable(byKind(kind)), true, kind);
  }
  assert.equal(rework.reportIsEditable(byKind("signal")), false);
  assert.equal(rework.reportIsRemovable(byKind("signal")), false);
  // An incident written by the phone stays editable and, being logged and
  // not added, has no bin; one the rework added has one.
  assert.equal(rework.reportIsEditable(byKind("incident")), true);
  assert.equal(rework.reportIsRemovable(byKind("incident")), false);
  assert.equal(
    rework.reportIsRemovable({ ...byKind("incident"), added: true }),
    true,
  );
  // The bin sends the ids to `eventRemovals`.
  const draft = {
    ...rework.emptyDraft?.([]),
    removals: byKind("guidingSpikes").ids,
    added: [],
    moves: {},
    targets: [],
  };
  assert.deepEqual(
    rework.reworkBody(draft, { sessionStart: START }).eventRemovals,
    byKind("guidingSpikes").ids,
  );
  // Once removed, it leaves the page.
  assert.ok(
    !rework
      .reportsWithDraft(reports(), draft)
      .some((report) => report.kind === "guidingSpikes"),
  );
});

test("the fiche of a disc: the kind, the sentence, the target and the mention; an unknown kind says « Signalement » and the sentence of the service, no mention", async () => {
  const { EventPopover } = await loadJsxModule(
    "components/sessions/SessionFrise.js",
  );
  const draw = (report) =>
    plain(
      renderToStaticMarkup(
        createElement(EventPopover, {
          locale: "fr",
          report,
          label: "Sadr",
          zone: null,
          onClose() {},
        }),
      ),
    );
  const timeouts = draw(reports()[0]);
  assert.ok(timeouts.includes("Durée de pose") === false);
  assert.ok(timeouts.includes("Attente de guidage"));
  assert.ok(timeouts.includes("11 fois de 21:44 à 03:44"));
  assert.ok(timeouts.includes("Pendant Sadr"));
  assert.ok(timeouts.includes("Détecté par Astro Sync"));
  const unknown = draw(reports().find((report) => report.kind === "signal"));
  assert.ok(unknown.includes("Signalement"));
  assert.ok(unknown.includes("Dérive du focuseur : 12 pas"));
  assert.ok(!unknown.includes("Détecté"));
  assert.ok(!unknown.includes("Note"));
});

test("the journal list of the page: the four kinds are named, a type nobody knows is « Signalement », never « Note »", async () => {
  const { eventTypeLabel, eventDetail } = await loadJsxModule(
    "components/sessions/SessionDetailPage.js",
  );
  const named = (type) => eventTypeLabel(type, "fr");
  assert.equal(named("exposure_change"), "Durée de pose");
  assert.equal(named("guiding_timeouts"), "Attente de guidage");
  assert.equal(named("sensor_temperature_drift"), "Température");
  assert.equal(named("guiding_spikes"), "Pics de guidage");
  assert.equal(named("focus_drift"), "Signalement");
  assert.equal(named("note"), "Note");
  assert.equal(eventTypeLabel("focus_drift", "en"), "Report");
  const spikes = events.find((entry) => entry.type === "guiding_spikes");
  assert.equal(
    eventDetail(spikes, "fr"),
    `Pics de guidage${NBSP}: 3 fois, jusqu’à 9,0″ de 00:10 à 01:08`,
  );
  const unknown = events.find((entry) => entry.type === "focus_drift");
  assert.equal(eventDetail(unknown, "fr"), "Dérive du focuseur : 12 pas");
  assert.equal(
    eventDetail(
      events.find((entry) => entry.type === "future_without_words"),
      "fr",
    ),
    "",
  );
});

test("the sheet of an incident has « Modifier » beside « Fermer » when the page may rework; no other report does, and without a handler nothing changes", async () => {
  const { EventPopover } = await loadJsxModule(
    "components/sessions/SessionFrise.js",
  );
  const draw = (report, extra = {}) =>
    renderToStaticMarkup(
      createElement(EventPopover, {
        locale: "fr",
        report,
        label: "Sadr",
        zone: null,
        onClose() {},
        ...extra,
      }),
    );
  const incident = reports().find((report) => report.kind === "incident");
  const withEdit = draw(incident, { onEdit() {} });
  assert.ok(withEdit.includes('data-testid="session-frise-event-edit"'));
  assert.ok(plain(withEdit).includes("Modifier Fermer"));
  assert.ok(withEdit.includes("btn-secondary"));
  assert.ok(withEdit.includes("btn-primary"));
  assert.ok(
    !draw(incident).includes("session-frise-event-edit"),
    "no handler, no button",
  );
  // The incidents Astro Sync finds in the guiding have it too; a measure (a
  // pose, a temperature), a note, the sky and the fall-back do not.
  for (const other of reports().filter(
    (report) => !rework.isIncidentKind(report.kind),
  ))
    assert.ok(
      !draw(other, { onEdit() {} }).includes("session-frise-event-edit"),
      other.kind,
    );
  for (const kind of ["guidingTimeout", "guidingSpikes"])
    assert.ok(
      draw(
        reports().find((report) => report.kind === kind),
        { onEdit() {} },
      ).includes("session-frise-event-edit"),
      kind,
    );
});

test("a guiding incident Astro Sync found is edited as an incident — its sentence the words to correct", () => {
  const spikes = reports().find((report) => report.kind === "guidingSpikes");
  const sentence = view.detectedSentence(spikes, "fr");
  assert.ok(sentence);
  const form = rework.reportForm(spikes, sentence);
  assert.equal(form.kind, "incident");
  assert.equal(form.text, sentence);
  assert.deepEqual(rework.editableKinds(form), [
    "note",
    "sky",
    "incident",
    "pause",
  ]);
  const draft = rework.editReport(
    rework.emptyDraft(cardsOf(reports())),
    spikes,
    { ...form, text: "Pics de guidage après le retournement" },
  );
  const [replacement] = rework.eventReplacementsBody(draft);
  assert.equal(replacement.eventId, spikes.id);
  assert.equal(replacement.event.type, "equipment_issue");
  assert.deepEqual(replacement.event.payload, {
    description: "Pics de guidage après le retournement",
  });
  // The page shows the correction at once as an incident, not as spikes.
  const shown = rework
    .reportsWithDraft(reports(), draft)
    .find((report) => report.id === spikes.id);
  assert.equal(shown.kind, "incident");
  assert.equal(shown.text, "Pics de guidage après le retournement");
  assert.equal(shown.detected, true, "the mention stays");
});

test("« Modifier » an incident — its genre can change (not a pause's), one replacement is sent and the service keeps its origin", () => {
  const incident = reports().find((report) => report.kind === "incident");
  assert.deepEqual(rework.editableKinds(rework.reportForm(incident)), [
    "note",
    "sky",
    "incident",
    "pause",
  ]);
  assert.deepEqual(rework.editableKinds(null), [
    "note",
    "sky",
    "incident",
    "pause",
  ]);
  assert.deepEqual(rework.editableKinds({ kind: "pause" }), ["pause"]);
  // The request: the incident becomes a note; the original's id is the
  // replacement's.
  const form = { ...rework.reportForm(incident), kind: "note" };
  const draft = rework.editReport(
    rework.emptyDraft(cardsOf(reports())),
    incident,
    form,
  );
  const [replacement] = rework.eventReplacementsBody(draft);
  assert.equal(replacement.eventId, incident.id);
  assert.equal(replacement.event.type, "note");
  assert.deepEqual(replacement.event.payload, {
    text: "Guidage perd l’étoile",
  });
  // …or a pause with its two ends.
  const asPause = rework.editReport(
    rework.emptyDraft(cardsOf(reports())),
    incident,
    {
      ...rework.reportForm(incident),
      kind: "pause",
      until: incident.at + 600_000,
    },
  );
  const [pause] = rework.eventReplacementsBody(asPause);
  assert.equal(pause.event.type, "pause");
  assert.ok(pause.event.until);
});

test("a card has the liseré of its target's colour, dashed when the target was not done or has no colour", async () => {
  const { SessionTargetCard } = await loadJsxModule(
    "components/sessions/SessionTargetCard.js",
  );
  const [card] = cardsOf(reports());
  const draw = (extra) =>
    renderToStaticMarkup(
      createElement(
        "ul",
        null,
        createElement(SessionTargetCard, {
          locale: "fr",
          card,
          ...extra,
        }),
      ),
    );
  const coloured = draw({ colour: 1 });
  assert.ok(coloured.includes("session-card-lisere is-c1"));
  assert.ok(!coloured.includes("is-dashed"));
  assert.ok(draw({ colour: null }).includes("session-card-lisere is-dashed"));
  assert.ok(
    draw({ colour: 1, card: { ...card, outcome: "skipped" } }).includes(
      "session-card-lisere is-dashed",
    ),
  );
  assert.ok(
    draw({ colour: 1, card: { ...card, state: "removed" } }).includes(
      "session-card-lisere is-dashed",
    ),
  );
  // Eight colours, then they come round again.
  assert.ok(draw({ colour: 9 }).includes("is-c1"));
});

test("a target the night left without time is « Non faite » with « Manque de temps » said for it, unless another reason was given", async () => {
  const moment = await import("../dist/components/sessions/debrief-moment.js");
  const items = moment.noTimeItemsOf([
    { planItemId: "ic1805", noTimeTonight: true },
    { planItemId: "m33", noTimeTonight: false },
    { planItemId: null, noTimeTonight: true },
  ]);
  assert.deepEqual([...items], ["ic1805"]);
  const rows = [
    { itemId: "ic1805", result: "skipped", reason: "" },
    { itemId: "m33", result: "skipped", reason: "" },
    { itemId: "ic1805b", result: "done", reason: "" },
  ];
  const next = moment.presetNoTimeReasons(rows, items);
  assert.equal(next[0].reason, "time");
  assert.equal(next[1].reason, "", "not concerned");
  assert.equal(next[2], rows[2], "returned as it is");
  const said = moment.presetNoTimeReasons(
    [{ itemId: "ic1805", result: "skipped", reason: "weather" }],
    items,
  );
  assert.equal(said[0].reason, "weather", "the person's reason stays");
});

// « Le sélecteur de genre »: the picker offers the four
// kinds a person can declare; the four Astro Sync detects are shown, never
// chosen.
const KIND_PICKER_KEYS = [
  "sessionPageEventDetectedKinds",
  "sessionPageDetectedNotEditable",
  "sessionPageKindBecomes",
];
const DETECTED_NAMES_FR = [
  "Durée de pose",
  "Attente de guidage",
  "Pics de guidage",
  "Température",
];

test("« Ajouter » offers the four declarable kinds as chips, in the specified order, with the grey sentence; no « Autre… », no detected kind", async () => {
  const { EventKindField } = await loadJsxModule(
    "components/sessions/SessionReworkDialogs.js",
  );
  const html = renderToStaticMarkup(
    createElement(EventKindField, {
      locale: "fr",
      editing: false,
      kinds: rework.editableKinds(null),
      kind: "note",
      kindLocked: false,
      detectedReport: null,
    }),
  );
  assert.equal((html.match(/type="radio"/g) ?? []).length, 4);
  const labels = [...html.matchAll(/<\/?input[^>]*>([^<]+)</g)].map((m) =>
    m[1].trim(),
  );
  assert.deepEqual(labels, [
    "Note",
    "État du ciel",
    "Incident matériel",
    "Pause",
  ]);
  assert.ok(!html.includes("Autre"));
  for (const name of DETECTED_NAMES_FR) assert.ok(!labels.includes(name));
  // The grey sentence, once, under the group.
  assert.equal((html.match(/session-rework-kind-help/g) ?? []).length, 1);
  assert.ok(
    plain(html).includes(
      "sont détectés par Astro Sync : ils ne se notent pas à la main.",
    ),
  );
  assert.ok(html.indexOf("<p") > html.lastIndexOf("</label>"));
});

test("« Modifier » has no grey sentence; a declared report keeps its four chips and a pause is locked", async () => {
  const { EventKindField } = await loadJsxModule(
    "components/sessions/SessionReworkDialogs.js",
  );
  const draw = (initial, kind) =>
    renderToStaticMarkup(
      createElement(EventKindField, {
        locale: "fr",
        editing: true,
        kinds: rework.editableKinds(initial),
        kind,
        kindLocked: rework.editableKinds(initial).length === 1,
        detectedReport: null,
      }),
    );
  const incident = draw({ kind: "incident" }, "incident");
  assert.ok(!incident.includes("session-rework-kind-help"));
  assert.equal((incident.match(/type="radio"/g) ?? []).length, 4);
  const pause = draw({ kind: "pause" }, "pause");
  assert.equal((pause.match(/type="radio"/g) ?? []).length, 1);
  assert.ok(pause.includes("disabled"));
});

test("correcting a guiding detection shows a card, not « Genre »: kind, mention, sentence, and what the correction makes of it", async () => {
  const { EventKindField, detectedKindCard } = await loadJsxModule(
    "components/sessions/SessionReworkDialogs.js",
  );
  for (const kind of ["guidingTimeout", "guidingSpikes"]) {
    const report = reports().find((entry) => entry.kind === kind);
    assert.equal(detectedKindCard(true, report), report);
    assert.equal(detectedKindCard(false, report), null, "not when adding");
    const html = renderToStaticMarkup(
      createElement(EventKindField, {
        locale: "fr",
        editing: true,
        kinds: ["note", "sky", "incident", "pause"],
        kind: "incident",
        kindLocked: false,
        detectedReport: report,
      }),
    );
    const text = plain(html);
    assert.ok(html.includes('data-testid="session-rework-kind-card"'));
    assert.ok(!html.includes('type="radio"'), "the kind is not a choice");
    assert.ok(!text.includes("Genre"));
    assert.ok(text.includes("Détecté par Astro Sync"));
    assert.ok(
      text.includes(view.detectedSentence(report, "fr").replace(/\s+/g, " ")),
    );
    assert.ok(
      text.includes(
        "Corrigé, il devient un incident matériel et garde la mention",
      ),
    );
  }
  // The kind of the form is the incident, locked: the contract would allow
  // a pause or a note, the screen no longer suggests it.
  const spikes = reports().find((entry) => entry.kind === "guidingSpikes");
  assert.equal(rework.reportForm(spikes, "x").kind, "incident");
  // The other detected kinds are never corrected (no « Modifier »).
  assert.equal(
    detectedKindCard(
      true,
      reports().find((entry) => entry.kind === "incident"),
    ),
    null,
  );
});

test("the fiche of a kind that is not corrected says so; the two guiding kinds, the incident and the unknown kind do not", async () => {
  const { EventPopover } = await loadJsxModule(
    "components/sessions/SessionFrise.js",
  );
  const draw = (report, extra = {}) =>
    renderToStaticMarkup(
      createElement(EventPopover, {
        locale: "fr",
        report,
        label: "Sadr",
        zone: null,
        onClose() {},
        ...extra,
      }),
    );
  for (const kind of ["exposure", "temperature"]) {
    const html = draw(
      reports().find((entry) => entry.kind === kind),
      { onEdit() {} },
    );
    assert.ok(html.includes('data-testid="session-frise-event-not-editable"'));
    assert.ok(
      plain(html).includes("il se retire, il ne se modifie pas."),
      kind,
    );
    assert.ok(!html.includes("session-frise-event-edit"), "no button added");
    assert.ok(html.includes("btn-link"), "« Fermer » stays the link");
  }
  for (const kind of ["guidingTimeout", "guidingSpikes", "incident", "signal"])
    assert.ok(
      !draw(
        reports().find((entry) => entry.kind === kind),
        { onEdit() {} },
      ).includes("session-frise-event-not-editable"),
      kind,
    );
});

test("the three sentences are in the ten languages, and the chips keep their contour (the CSS rule that stripped them is beaten)", async () => {
  const { messages: dictionaries } = await import("../dist/i18n.js");
  const { shippedLocales } = await import("../dist/locales.js");
  const locales = shippedLocales();
  assert.equal(locales.length, 10);
  for (const locale of locales)
    for (const key of KIND_PICKER_KEYS) {
      const text = dictionaries[locale]?.[key];
      assert.ok(text && text.length > 20, `${locale}: ${key}`);
      assert.match(text, /Astro Sync/, `${locale}: ${key}`);
    }
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(
    new URL("../../portal-app/styles/portal.css", import.meta.url),
    "utf8",
  );
  const rule = css.slice(
    css.indexOf(
      ".session-rework-fields .session-rework-kinds label.debrief-chip",
    ),
  );
  const body = rule.slice(0, rule.indexOf("}"));
  assert.match(body, /border: 1px solid var\(--line\)/);
  assert.match(body, /padding: 0\.25rem 0\.8rem/);
});

test("the sentence of a guiding incident says its hours in the place's zone, like its line (UTC without one)", () => {
  // The night of the 10 August: 20 waits from 21:04 to 23:56 UTC, at a place
  // two hours east of UTC in summer.
  const report = {
    kind: "guidingTimeout",
    at: Date.parse("2026-08-10T21:04:00Z"),
    payload: {
      count: 20,
      firstAt: "2026-08-10T21:04:00Z",
      lastAt: "2026-08-10T23:56:00Z",
    },
  };
  const local = view.detectedSentence(report, "fr", "Europe/Paris");
  assert.ok(local.includes("23:04"), local);
  assert.ok(local.includes("01:56"), local);
  assert.ok(!local.includes("21:04"), local);
  const utc = view.detectedSentence(report, "fr");
  assert.ok(utc.includes("21:04") && utc.includes("23:56"), utc);
  assert.equal(view.detectedSentence(report, "fr", "UTC"), utc);
  assert.equal(view.reportText(report, "fr", "Europe/Paris"), local);
});
