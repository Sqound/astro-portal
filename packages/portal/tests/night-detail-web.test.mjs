// The page of a session of the web Journal — the head, the figures, the frise with the
// reports on their target, a card per target, « Qualité des captures », the
// message of Astro Sync — and under « Détails de la nuit » what the page of a
// night held: « La nuit » field by
// field, the steps, the source of the measures with « Remplacer » and
// « Supprimer », « Qualité » and « Guidage » over the whole night, the night
// without an analysis, the notes, and the journal folded with each passage
// once. Invented data (Camille,
// « Col des Étoiles », NGC 7000, IC 1396, M31, M45).
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { messages } from "../dist/i18n.js";
import {
  guidingSeries,
  guidingSummary,
  qualitySummary,
} from "../dist/sessions/night-summary.js";
import { journalEntries } from "../dist/components/sessions/journal-rows.js";
import {
  guidingCountsLine,
  integrationText,
  nightDateOf,
  nightDateRow,
  seriesPaths,
  timeAxis,
} from "../dist/components/sessions/night-detail-view.js";
import { nightReport } from "./fixtures/night/report-v2.mjs";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
/** A component of `packages/portal`, its JSX made runnable by the loader. */
const loadJsxModule = (path) => import(`portal/${path}`);

const NBSP = " ";
const plain = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replaceAll(NBSP, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/[ \t\n]+/g, " ")
    .trim();

const START = "2026-10-07T21:08:00.000Z";
const END = "2026-10-08T03:48:00.000Z";

const night = (changes = {}) => ({
  title: { value: "Nuit d’octobre au col", source: "plan" },
  startedAt: { value: START, source: "night" },
  finishedAt: { value: END, source: "night" },
  place: {
    value: { name: "Col des Étoiles", latitude: 45, longitude: -30 },
    source: "plan",
  },
  equipment: {
    value: {
      telescopeId: "eq-askar",
      cameraId: "eq-533",
      mountId: "eq-am5",
      filterIds: ["eq-dual"],
    },
    source: "plan",
  },
  targetIds: { value: ["ngc7000", "ic1396", "m31"], source: "plan" },
  notes: {
    value:
      "Ciel très sec, seeing correct après minuit. Penser à reprendre IC 1396 avec plus de poses.",
    source: "night",
  },
  ...changes,
});
const equipmentNames = {
  "eq-askar": "Askar 50P",
  "eq-533": "ZWO ASI533MC Pro",
  "eq-am5": "ZWO AM5N",
  "eq-dual": "Dual-band",
};
const targetNames = { ngc7000: "NGC 7000", ic1396: "IC 1396", m31: "M31" };

const step = (
  id,
  targetId,
  filter,
  frameCount,
  exposureSeconds,
  more = {},
) => ({
  id,
  sessionId: "night-1",
  targetId,
  targetHint: null,
  filter,
  frameCount,
  exposureSeconds,
  gain: 100,
  integrationSeconds: frameCount * exposureSeconds,
  origin: "analysis",
  stepKey: `${id}-key`,
  edited: false,
  editedAt: null,
  position: 0,
  ...more,
});
const steps = () => [
  step("s1", "ngc7000", "Dual-band", 40, 180),
  step("s2", "ic1396", "Dual-band", 38, 180),
  step("s3", "m31", null, 42, 120),
];

let counter = 0;
const event = (type, recordedAt, payload = {}, timing = undefined) => ({
  eventId: `01J9W09TEST${String((counter += 1)).padStart(15, "0")}`,
  type,
  recordedAt,
  ...(timing ? { timing } : {}),
  payload,
});
/** The night's journal, then the debriefing « exécuté » that planned it again. */
function measuredThenPlanned() {
  const field = [
    event("target_started", START, { targetId: "ngc7000", planItemId: "a" }),
    event("pause", "2026-10-07T22:18:00.000Z", { reason: "Retournement" }),
    event("resume", "2026-10-07T22:28:00.000Z"),
    event("target_finished", "2026-10-07T23:28:00.000Z", {
      targetId: "ngc7000",
      planItemId: "a",
    }),
    event("target_started", "2026-10-07T23:38:00.000Z", {
      targetId: "ic1396",
      planItemId: "b",
    }),
    event("target_finished", "2026-10-08T01:48:00.000Z", {
      targetId: "ic1396",
      planItemId: "b",
    }),
    event("target_started", "2026-10-08T01:58:00.000Z", {
      targetId: "m31",
      planItemId: "c",
    }),
    event("note", "2026-10-08T02:08:00.000Z", {
      targetId: "m31",
      targetLabel: "M31",
      text: "Rosée sur le tube vers 2 h, résistance montée d’un cran.",
    }),
    event("target_finished", END, { targetId: "m31", planItemId: "c" }),
  ];
  const planned = ["a", "b", "c"].flatMap((planItemId, index) => [
    event(
      "target_started",
      `2026-10-0${7 + Math.floor(index / 2)}T${["21:06", "23:36", "01:46"][index]}:00.000Z`,
      { targetId: ["ngc7000", "ic1396", "m31"][index], planItemId },
      "planned",
    ),
    event(
      "target_finished",
      `2026-10-0${7 + Math.ceil(index / 2)}T${["23:36", "01:46", "03:46"][index]}:00.000Z`,
      { targetId: ["ngc7000", "ic1396", "m31"][index], planItemId },
      "planned",
    ),
  ]);
  return [...field, ...planned];
}

/** The targets of the session as `GET /v1/sessions/{id}` gives them: kept, added in the field, removed. */
const targetsOfNight = () => [
  {
    targetId: "ngc7000",
    label: "NGC 7000",
    planItemId: "a",
    state: "planned",
    outcome: "done",
    reason: null,
    plannedSeconds: 9000,
    acquiredSeconds: 7200,
    frameCount: 40,
    filter: "Dual-band",
    captureId: "cap-1",
    thumbnailUrl: "/v1/captures/cap-1/media?variant=thumbnail",
  },
  {
    targetId: "ic1396",
    label: "IC 1396",
    planItemId: "b",
    state: "planned",
    outcome: "done",
    reason: null,
    plannedSeconds: 7800,
    acquiredSeconds: 6840,
    frameCount: 38,
    filter: "Dual-band",
    captureId: null,
    thumbnailUrl: null,
  },
  {
    targetId: "m31",
    label: "M31",
    planItemId: null,
    state: "added",
    outcome: "done",
    reason: null,
    plannedSeconds: null,
    acquiredSeconds: 5040,
    frameCount: 42,
    filter: null,
    captureId: null,
    thumbnailUrl: null,
  },
  {
    targetId: "m45",
    label: "M45",
    planItemId: "d",
    state: "removed",
    outcome: "skipped",
    reason: "weather",
    plannedSeconds: 7200,
    acquiredSeconds: null,
    frameCount: null,
    filter: null,
    captureId: null,
    thumbnailUrl: null,
  },
];
const slotsOfNight = () => ({
  perTarget: [
    ["ngc7000", "a", "2026-10-07T21:06:00.000Z", "2026-10-07T23:36:00.000Z"],
    ["ic1396", "b", "2026-10-07T23:36:00.000Z", "2026-10-08T01:46:00.000Z"],
    ["m45", "d", "2026-10-08T01:46:00.000Z", "2026-10-08T03:46:00.000Z"],
  ].map(([targetId, planItemId, start, end]) => ({
    targetId,
    planItemId,
    slot: { start, end },
  })),
});

const analysisResource = (report) => ({
  id: "analysis-1",
  sessionId: "night-1",
  reportVersion: 2,
  createdAt: "2026-10-08T09:12:00.000Z",
  deviceName: "MacBook de Camille",
  report,
});

function pageProps({
  report = nightReport(),
  withAnalysis = true,
  ...more
} = {}) {
  const nightSteps = steps();
  return {
    locale: "fr",
    sessionId: "night-1",
    session: {
      id: "night-1",
      planId: "plan-1",
      status: "finished",
      outcome: "partial",
      origin: "execution",
      projectId: null,
      eveningDate: "2026-10-07",
      reworkRevision: 0,
      startedAt: START,
      finishedAt: END,
    },
    events: { events: measuredThenPlanned() },
    targets: targetsOfNight(),
    debriefSummary: slotsOfNight(),
    plan: { name: "Nuit d’octobre au col", date: "2026-10-07", timeZone: null },
    analysis: withAnalysis ? analysisResource(report) : null,
    nightData: {
      night: night(),
      steps: nightSteps,
      qualitySummary: withAnalysis ? qualitySummary(report, nightSteps) : null,
      guidingSummary: withAnalysis ? guidingSummary(report) : null,
      guidingSeries: withAnalysis ? guidingSeries(report) : [],
    },
    online: {
      sessionId: "night-1",
      targets: [
        {
          targetId: "ngc7000",
          name: "NGC 7000",
          planned: true,
          captures: [
            {
              id: "cap-1",
              stage: "finalized",
              visibility: "private",
              createdAt: "2026-10-08T10:00:00.000Z",
            },
          ],
        },
        { targetId: "ic1396", name: "IC 1396", planned: true, captures: [] },
        { targetId: "m31", name: "M31", planned: true, captures: [] },
      ],
      analysis: withAnalysis
        ? {
            present: true,
            sentAt: "2026-10-08T09:12:00.000Z",
            deviceName: "MacBook de Camille",
            producer: "astro-sync",
          }
        : { present: false },
    },
    captureCards: { "cap-1": { thumbnail: true } },
    targetNames,
    equipmentNames,
    ...more,
  };
}

async function renderPage(props) {
  const { SessionDetailPage } = await loadJsxModule(
    "components/sessions/SessionDetailPage.js",
  );
  return renderToStaticMarkup(createElement(SessionDetailPage, props));
}

test("the view: « 2 h 00 », the date row in UTC with the next day, the night's date from the plan or the longitude", () => {
  assert.equal(integrationText(7200, "fr"), `2${NBSP}h${NBSP}00`);
  assert.equal(integrationText(6840, "fr"), `1${NBSP}h${NBSP}54`);
  assert.equal(integrationText(2700, "fr"), `45${NBSP}min`);
  assert.equal(integrationText(7200, "en"), `2${NBSP}h`);
  const row = nightDateRow(night(), "fr");
  assert.equal(row.main, "Mer. 7 oct. 2026 · 21:08 → 03:48");
  assert.equal(row.endDay, "jeu. 8 oct.");
  assert.equal(row.zone, "UTC");
  assert.equal(
    nightDateOf({ planDate: "2026-10-07", startedAt: END }),
    "2026-10-07",
  );
  // Without a plan: the evening of the start, at the place's longitude.
  assert.equal(nightDateOf({ startedAt: END, longitude: -30 }), "2026-10-07");
  assert.equal(
    nightDateOf({ startedAt: "2026-10-07T12:30:00.000Z", longitude: 139 }),
    "2026-10-07",
  );
});

// « La nuit »'s date row and the entries of « Journal de la nuit » read the
// hours of the place, as the head and the frise already did -- « UTC » is
// written only without a zone.
const loveNight = (place) => ({
  ...pageProps(),
  session: {
    ...pageProps().session,
    startedAt: "2026-10-16T09:29:00.000Z",
    finishedAt: "2026-10-16T19:23:00.000Z",
  },
  events: {
    events: [
      event("target_started", "2026-10-16T09:29:00.000Z", {
        targetId: "m31",
        planItemId: "c",
      }),
      event("target_finished", "2026-10-16T19:23:00.000Z", {
        targetId: "m31",
        planItemId: "c",
      }),
    ],
  },
  nightData: {
    ...pageProps().nightData,
    night: night({
      startedAt: { value: "2026-10-16T09:29:00.000Z", source: "night" },
      finishedAt: { value: "2026-10-16T19:23:00.000Z", source: "night" },
      place: { value: place, source: "night" },
    }),
  },
});

test("the date row of « La nuit » is in the hours of the place, « UTC » only for a place without a zone", () => {
  const night = loveNight({}).nightData.night;
  const tokyo = nightDateRow(night, "fr", "Asia/Tokyo");
  assert.equal(tokyo.main, "Ven. 16 oct. 2026 · 18:29 → 04:23");
  assert.equal(tokyo.endDay, "sam. 17 oct.");
  assert.equal(tokyo.zone, null);
  // No zone (or UTC itself): the hours of UTC, said so.
  for (const zone of [null, "UTC", "Etc/UTC", "Not/AZone"]) {
    const row = nightDateRow(night, "fr", zone);
    assert.equal(row.main, "Ven. 16 oct. 2026 · 09:29 → 19:23", String(zone));
    assert.equal(row.endDay, null);
    assert.equal(row.zone, "UTC");
  }
  // Another side of the date line: the day is the place's too.
  const hawaii = nightDateRow(night, "en", "Pacific/Honolulu");
  assert.equal(hawaii.main, "Thu, Oct 15, 2026 · 23:29 → 09:23");
});

test("an event of the journal is written in the hours of the place, « UTC » only without a zone", async () => {
  const { formatSessionInstant } =
    await import("../dist/components/sessions/debrief-decision.js");
  const at = "2026-10-16T09:29:00.000Z";
  assert.match(formatSessionInstant(at, "fr", "Asia/Tokyo"), /18:29$/);
  assert.doesNotMatch(formatSessionInstant(at, "fr", "Asia/Tokyo"), /UTC/);
  for (const zone of [null, "UTC", "Etc/UTC"])
    assert.match(formatSessionInstant(at, "fr", zone), /09:29 UTC$/, zone);
});

test("the session page of a place in Tokyo -- the date row and the journal read 18:29, not 09:29 UTC", async () => {
  const withZone = loveNight({
    name: "Love",
    latitude: 35.6762,
    longitude: 139.6503,
    timeZone: "Asia/Tokyo",
  });
  const text = plain(await renderPage(withZone));
  assert.ok(
    text.includes("Ven. 16 oct. 2026 · 18:29 → 04:23 (sam. 17 oct.)"),
    text,
  );
  assert.ok(!text.includes("Ven. 16 oct. 2026 · 09:29"), "no UTC date row");
  // The journal's two entries: 18:29 and 04:23 (the next day), no « UTC ».
  const journal = text.slice(text.indexOf("Journal de la nuit"));
  assert.match(journal, /16 oct\. 2026.{1,4}18:29/);
  assert.match(journal, /17 oct\. 2026.{1,4}04:23/);
  assert.ok(!/09:29|19:23/.test(journal.slice(0, 600)), journal.slice(0, 600));
  // The editor of the row reads the place's hours as well, and says so.
  const editor = await loadJsxModule("components/sessions/NightFieldEditor.js");
  const draft = editor.nightPatchFor(
    "date",
    { start: "18:30", end: "04:00" },
    withZone.nightData.night,
    "Asia/Tokyo",
  );
  assert.deepEqual(draft, {
    startedAt: "2026-10-16T09:30:00.000Z",
    finishedAt: "2026-10-16T19:00:00.000Z",
  });
  // The position alone: the table gives Tokyo, the hours are local.
  const byPosition = plain(
    await renderPage(
      loveNight({ name: "Love", latitude: 35.6762, longitude: 139.6503 }),
    ),
  );
  assert.ok(byPosition.includes("Ven. 16 oct. 2026 · 18:29 → 04:23"));
  // Neither a zone nor a position: UTC, written once on the row.
  const none = plain(await renderPage(loveNight({ name: "Love" })));
  assert.ok(none.includes("Ven. 16 oct. 2026 · 09:29 → 19:23 · UTC"), none);
});

test("the head, the figures and the frise with its reports — the zones in their fixed order, no identifier on screen", async () => {
  const html = await renderPage(pageProps());
  const text = plain(html);
  const order = [
    "Retour au Journal",
    // « Session · Nuit du … » is the title, the plan it
    // comes from the link under it, « UTC » written once on the line of the place.
    "Session · Nuit du 7 au 8 oct.",
    "Plan d’origine · « Nuit d’octobre au col »",
    // The place has a position and no zone — its hours are those of the
    // zone the table gives (mid-Atlantic: UTC−2), no longer UTC.
    "Col des Étoiles · 19:08 → 01:48 · Askar 50P · ZWO ASI533MC Pro · ZWO AM5N",
    "Exécutée en partie",
    "Mesurée par Astro Sync",
    "Importer un paquet de nuit",
    // The state of the sending, under the head.
    "Cette session est ",
    "acquises sur",
    "poses",
    "cibles faites · 1 retirée",
    "Frise de la nuit",
    // The hours of the place, or « UTC » written; « Lire la
    // frise » is the ⓘ of the header; « plan initial » above the targets.
    // The place has a zone (the table's), so the frise says its hours.
    "heures du lieu",
    "plan initial",
    // The legend says only what is drawn — the rail above, the
    // execution in the colour of each target.
    "capture : la couleur de sa cible",
    "Cibles",
    "Tout voir dans la galerie",
    "Qualité des captures",
    "Astro Sync a complété cette session le 8 oct. depuis « MacBook de Camille »",
    "Détails de la nuit",
    "La nuit",
    "Paliers d’acquisition",
    "Qualité et guidage en détail",
    "Notes",
    "Journal de la nuit",
    // The foot of the page.
    "Remanier cette session",
    "Autres actions",
    "Supprimer la session",
  ];
  let at = -1;
  for (const words of order) {
    const found = text.indexOf(words, at + 1);
    assert.ok(found > at, `« ${words} » after the previous zone`);
    at = found;
  }
  // The plan as launched is the rail above (the removed target
  // keeps its frame there); under it one segment per passage, the added
  // target included, nothing for the removed one; the pause and the note
  // sit on the markers under it.
  assert.equal((html.match(/data-initial="/g) ?? []).length, 3);
  assert.ok((html.match(/data-segment="/g) ?? []).length >= 3);
  assert.ok(!html.includes('data-segment="m45"'), "removed: no segment");
  assert.ok(!html.includes("data-kind="), "no frame of the plan retraced");
  assert.equal((html.match(/data-report="/g) ?? []).length >= 2, true);
  assert.match(
    html,
    /role="img" aria-label="Frise de la nuit · NGC 7000 19:06/,
  );
  // « Importer un paquet de nuit » stays the header's secondary.
  assert.match(html, /class="btn-secondary"[^>]*>Importer un paquet de nuit/);
  for (const hidden of ["night-1", "plan-1", "eq-askar", "ngc7000", "{"])
    assert.ok(!text.includes(hidden), `no « ${hidden} » on screen`);
  // A session born without a plan, a multi-night plan's night, a session to
  // debrief: the words of the head follow.
  const noPlan = plain(
    await renderPage(
      pageProps({
        session: { ...pageProps().session, planId: null, outcome: null },
        plan: null,
      }),
    ),
  );
  assert.ok(!noPlan.includes("Plan d’origine"), noPlan);
  assert.ok(noPlan.includes("Sans plan"));
  const multi = plain(
    await renderPage(
      pageProps({ session: { ...pageProps().session, projectId: "p-1" } }),
    ),
  );
  assert.ok(multi.includes("Plan d’origine · « Nuit d’octobre au col »"));
});

test("a field edit: the body of PATCH …/night for each field, the end passing midnight, and the saved value shown", async () => {
  const { nightPatchFor, nightInstant, NightFieldCard } = await loadJsxModule(
    "components/sessions/NightFieldEditor.js",
  );
  const current = night();
  const draft = (changes) => ({
    title: "",
    start: "21:08",
    end: "03:48",
    placeName: "",
    latitude: null,
    longitude: null,
    telescopeId: "",
    cameraId: "",
    mountId: "",
    filterIds: [],
    targetIds: [],
    notes: "",
    ...changes,
  });
  assert.deepEqual(
    nightPatchFor(
      "place",
      draft({ placeName: "Col des Brumes", latitude: 44.9, longitude: -29.8 }),
      current,
    ),
    { place: { name: "Col des Brumes", latitude: 44.9, longitude: -29.8 } },
  );
  assert.deepEqual(nightPatchFor("title", draft({ title: "  " }), current), {
    title: null,
  });
  assert.deepEqual(
    nightPatchFor("date", draft({ start: "21:30", end: "04:10" }), current),
    {
      startedAt: "2026-10-07T21:30:00.000Z",
      finishedAt: "2026-10-08T04:10:00.000Z",
    },
  );
  assert.equal(nightInstant(START, "23:59"), "2026-10-07T23:59:00.000Z");
  assert.deepEqual(
    nightPatchFor(
      "equipment",
      draft({ telescopeId: "eq-askar", filterIds: ["eq-dual"] }),
      current,
    ),
    {
      equipment: {
        telescopeId: "eq-askar",
        cameraId: null,
        mountId: null,
        filterIds: ["eq-dual"],
      },
    },
  );
  assert.deepEqual(
    nightPatchFor("targets", draft({ targetIds: ["m31"] }), current),
    { targetIds: ["m31"] },
  );
  // The night the service answers is the one the card shows.
  const saved = night({
    place: { value: { name: "Col des Brumes" }, source: "night" },
  });
  const html = renderToStaticMarkup(
    createElement(NightFieldCard, {
      locale: "fr",
      sessionId: "night-1",
      night: saved,
      names: { equipment: equipmentNames, targets: targetNames },
    }),
  );
  assert.ok(plain(html).includes("Lieu Col des Brumes"));
});

test("the steps — six columns, the integration computed, « · modifié », the total, a pencil and a red bin named by their target, « Ajouter un palier » a tertiary", async () => {
  const { NightStepsTable, stepBody, stepComplete, draftIntegration } =
    await loadJsxModule("components/sessions/NightStepsTable.js");
  const rows = steps();
  rows[0] = { ...rows[0], edited: true, origin: "analysis" };
  const html = renderToStaticMarkup(
    createElement(NightStepsTable, {
      locale: "fr",
      sessionId: "night-1",
      steps: rows,
      targetIds: ["ngc7000", "ic1396", "m31"],
      names: targetNames,
      analysisMeta: {
        present: true,
        sentAt: "2026-10-08T09:12:00.000Z",
        producer: "astro-sync",
      },
      dayOf: () => "8 oct.",
      clockOf: () => "09:12",
    }),
  );
  const text = plain(html);
  assert.ok(
    text.includes(
      "D’après Astro Sync, le 8 oct. à 09:12 ; vous pouvez corriger chaque palier.",
    ),
  );
  assert.ok(
    text.includes(
      "Cible Filtre Poses Exposition Gain Intégration Actions NGC 7000 · modifié Dual-band 40 180 s 100 2 h 00",
    ),
  );
  assert.ok(text.includes("M31 Sans filtre 42 120 s 100 1 h 24"));
  assert.ok(text.includes("Total 120 poses 5 h 18"));
  assert.ok(html.includes('aria-label="Modifier le palier de IC 1396"'));
  assert.match(
    html,
    /class="night-icon-button night-icon-button-danger"[^>]*aria-label="Supprimer le palier de M31"/,
  );
  assert.match(html, /class="btn-tertiary"[^>]*>.*Ajouter un palier/s);
  // The fields of a step: the body of POST/PATCH, « Ajouter ce palier »
  // greyed while the target, the frames or the exposure miss.
  const fields = {
    targetId: "m31",
    filter: "",
    frameCount: "42",
    exposureSeconds: "120",
    gain: "",
  };
  assert.deepEqual(stepBody(fields), {
    targetId: "m31",
    filter: null,
    frameCount: 42,
    exposureSeconds: 120,
    gain: null,
  });
  assert.equal(draftIntegration(fields), 5040);
  assert.equal(stepComplete(fields), true);
  assert.equal(stepComplete({ ...fields, targetId: "" }), false);
  assert.equal(stepComplete({ ...fields, exposureSeconds: "" }), false);
  // Steps entered by hand, no analysis: the line says so.
  const manual = plain(
    renderToStaticMarkup(
      createElement(NightStepsTable, {
        locale: "fr",
        sessionId: "night-1",
        steps: rows,
        names: targetNames,
      }),
    ),
  );
  assert.ok(
    manual.includes(
      "Saisis à la main ; une analyse d’Astro Sync les complétera sans écraser vos corrections.",
    ),
  );
});

test("the source of the measures: one zone, two tertiaries, « Supprimer cette analyse » in the destructive tint, no primary", async () => {
  const { MeasuresSourceBar } = await loadJsxModule(
    "components/sessions/SessionDetailPage.js",
  );
  const html = renderToStaticMarkup(
    createElement(MeasuresSourceBar, {
      locale: "fr",
      sessionId: "night-1",
      meta: {
        present: true,
        sentAt: "2026-10-08T09:12:00.000Z",
        deviceName: "MacBook de Camille",
        producer: "astro-sync",
      },
    }),
  );
  assert.match(
    html,
    /class="btn-tertiary"[^>]*>Remplacer par une nouvelle analyse/,
  );
  assert.match(
    html,
    /class="btn-tertiary is-destructive"[^>]*>Supprimer cette analyse/,
  );
  assert.ok(!html.includes("btn-primary"));
  // The import says where the measures came from.
  const imported = plain(
    renderToStaticMarkup(
      createElement(MeasuresSourceBar, {
        locale: "fr",
        meta: {
          present: true,
          sentAt: "2026-10-08T09:12:00.000Z",
          producer: "import",
        },
      }),
    ),
  );
  assert.ok(
    imported.includes(
      "Mesures importées de l’ancien portail, le jeu. 8 oct. à 09:12.",
    ),
  );
});

test("« Qualité » and « Guidage »: the four figures with « 2,6 px · 8,1″ », the old portal's measures carried, one line per step, the charts over the night", async () => {
  const report = nightReport();
  const text = plain(await renderPage(pageProps({ report })));
  // Medians of the fixture: FWHM 2,7 px at 3,1″/px, eccentricity 0,46…
  assert.ok(text.includes("FWHM 2,7 px · 8,4″"), "FWHM in px and arcseconds");
  assert.ok(text.includes("Excentricité 0,46"));
  assert.match(text, /Fond de ciel 1.005 ADU/);
  assert.ok(
    text.includes("Bruit du fond 11,0 ADU"),
    "background noise carried",
  );
  assert.ok(text.includes("Étoiles détectées 850"), "star count carried");
  assert.ok(text.includes("Poses mesurées 6"));
  assert.ok(text.includes("Palier FWHM Excentricité Fond de ciel Poses"));
  // A step the night no longer holds is named by the report's hint.
  assert.ok(
    text.includes(
      "NGC 7000 · Ha 2,6 px · 8,1″ 0,42 1.010 ADU 3".replace(".", "\u202f"),
    ) || /NGC 7000 · Ha 2,6 px · 8,1″ 0,42 1.010 ADU 3/.test(text),
  );
  assert.ok(text.includes("FWHM (px) 2,7 médiane"));
  assert.ok(
    text.includes("RMS sur toute la nuit, par tranche de 2 minutes (PHD2)."),
  );
  assert.ok(
    text.includes("Total AD Déc Dither Mise au point Retournement au méridien"),
  );
  const html = await renderPage(pageProps({ report }));
  assert.ok(html.includes('aria-label="Qualité par pose, sur toute la nuit"'));
  assert.ok(
    html.includes(
      `aria-label="Guidage sur toute la nuit${NBSP}: RMS par tranche de 2 minutes"`,
    ),
  );
  assert.ok(html.includes("night-chart-dither"), "dithers as triangles");
  assert.ok(html.includes("night-chart-focus"), "focus runs as rings");
  // The flip at 22:10 UTC, in the place's hours like the rest of the page
  // (the place, at sea west of Europe, is two hours behind UTC).
  assert.ok(html.includes("Retournement 20:10"), "the meridian flip, named");
  assert.ok(!html.includes("Retournement 22:10"), "never the UTC hour");
});

test("the guiding line: the old screen's counts in one line", () => {
  assert.equal(
    guidingCountsLine(
      {
        guidedSeconds: 6.5 * 3600,
        dithers: 15,
        autofocusRuns: 3,
        autofocusSucceeded: 3,
        meridianFlips: 1,
        settleTimeouts: 0,
      },
      "fr",
    ).replaceAll(NBSP, " "),
    "6 h 30 guidées · 15 dithers · 3 mises au point réussies sur 3 · 1 retournement au méridien · aucune stabilisation expirée",
  );
  // A gap of more than two slices (the flip) breaks the line.
  const axis = timeAxis(START, END, 1000);
  const slice = (minute, value) => ({
    start: new Date(Date.parse(START) + minute * 60000).toISOString(),
    end: new Date(Date.parse(START) + (minute + 2) * 60000).toISOString(),
    rmsTotal: value,
  });
  const paths = seriesPaths(
    [slice(0, 0.6), slice(2, 0.7), slice(20, 0.5), slice(22, 0.6)],
    "rmsTotal",
    axis,
    (value) => 100 - value * 50,
  );
  assert.equal(paths.length, 2);
});

test("guiding without quality — « Qualité » is one line + ⓘ, « Guidage » whole", async () => {
  const report = nightReport({
    quality: nightReport().quality.map((row) => ({
      ...row,
      fwhmPixels: null,
      eccentricity: null,
      skyBackgroundAdu: null,
      skyBackgroundNoiseAdu: undefined,
      starCount: undefined,
    })),
  });
  const html = await renderPage(pageProps({ report }));
  const text = plain(html);
  assert.ok(
    text.includes(
      "Aucune mesure de qualité : les en-têtes de vos poses ne portent ni FWHM ni fond de ciel.",
    ),
  );
  assert.ok(!html.includes("Qualité par pose, sur toute la nuit"));
  assert.ok(text.includes("RMS total"));
  assert.ok(text.includes("Remplacer par une nouvelle analyse"));
});

test("a night without analysis — no curves, the invitation of Astro Sync, « Qualité et guidage en détail » in one line + ⓘ, no source bar, steps entered by hand", async () => {
  const props = pageProps({ withAnalysis: false });
  props.nightData.steps = props.nightData.steps.map((entry, index) => ({
    ...entry,
    origin: "manual",
    edited: index === 0,
  }));
  const html = await renderPage(props);
  const text = plain(html);
  assert.ok(!text.includes("Qualité des captures"));
  assert.ok(!text.includes("Mesurée par Astro Sync"));
  assert.ok(
    text.includes(
      "Utilisez Astro Sync sur un ordinateur pour compléter la nuit",
    ),
  );
  assert.ok(text.includes("Découvrir Astro Sync"));
  assert.ok(text.includes("Qualité et guidage"));
  assert.ok(
    text.includes("Aucune mesure de qualité ni de guidage pour cette nuit."),
  );
  assert.ok(text.includes("NGC 7000 · modifié"));
  assert.ok(!html.includes("night-source"), "no source bar");
  assert.ok(text.includes("Saisis à la main"));
  // With the analysis: three curves, the guiding line leading to the detail.
  const measured = await renderPage(pageProps());
  assert.equal((measured.match(/data-curve="/g) ?? []).length, 3);
  assert.ok(plain(measured).includes("Guidage · RMS total"));
  assert.ok(measured.includes('href="#session-details-quality"'));
  assert.ok(plain(measured).includes("Voir le guidage"));
});

test("a card per target — the promise, what the night gave, the final photo, the reports on their target, the send button", async () => {
  const html = await renderPage(pageProps());
  const text = plain(html);
  const card = (id) =>
    plain(
      html.slice(
        html.indexOf(`data-target-id="${id}"`),
        html.indexOf("</li>", html.indexOf(`data-target-id="${id}"`)) + 5,
      ),
    );
  assert.equal((html.match(/class="session-card is-/g) ?? []).length, 4);
  // Kept: planned, done, frames and filter from the steps, the photo's pills.
  assert.ok(
    card("ngc7000").includes(
      // The hours of the place (the table's zone, UTC−2).
      "NGC 7000 Prévu 19:06 → 21:36 · 2 h 30 Fait 19:08 → 21:28 · 2 h 00 40 × 180 s · Dual-band Photo finale Finalisée Privée Voir la fiche",
    ),
    card("ngc7000"),
  );
  // The pause of 22:18 sits on its target.
  assert.ok(card("ngc7000").includes("20:18 Pause · Retournement · 10 min"));
  // Added in the field: no promise, the badge, the note on its target.
  assert.ok(
    card("m31").includes("M31 Ajoutée sur le terrain Pas dans le plan Fait"),
    card("m31"),
  );
  assert.ok(card("m31").includes("00:08 Rosée sur le tube vers 2 h"));
  // Removed: hatched, never erased, with its reason, and no send button.
  assert.ok(
    card("m45").includes(
      "M45 Retirée au débriefing Prévu 23:46 → 01:46 · 2 h Non faite · Météo",
    ),
    card("m45"),
  );
  assert.ok(html.includes('data-state="removed"'));
  // The send button: an icon button named by the action, on each target
  // that can receive a photo (not the removed one).
  assert.equal(
    (html.match(/aria-label="Envoyer une photo finale"/g) ?? []).length,
    3,
  );
  assert.ok(html.includes('href="/fr/manage/captures/cap-1"'));
  // A night of a multi-night plan: no send button, the sentence says why.
  const multi = await renderPage(
    pageProps({
      session: { ...pageProps().session, projectId: "p-1" },
    }),
  );
  assert.ok(!multi.includes("Envoyer une photo finale"));
  assert.ok(
    plain(multi).includes(
      "La photo finale viendra à la fin du plan multi-nuits",
    ),
  );
  // What the service answered to a photo: the card says it.
  const { photoSentence } =
    await import("../dist/components/sessions/session-page-view.js");
  // A photo sent from the browser that replaces the previous one says so in
  // its own words; the sentence that names Astro Sync is for an image of
  // Astro Sync.
  assert.equal(
    photoSentence("replaced", "fr"),
    "Cette photo a remplacé la précédente.",
  );
  assert.equal(
    photoSentence("replaced", "ja"),
    "この画像が前の画像に置き換わりました。",
  );
  assert.equal(
    photoSentence("replaced", "en"),
    "This photo replaced the previous one.",
  );
  assert.equal(
    photoSentence("replacedByAstroSync", "fr"),
    "Astro Sync a remplacé la photo envoyée du téléphone par son image.",
  );
  assert.equal(
    photoSentence("variant", "fr"),
    "La photo envoyée du téléphone reste en variante.",
  );
  assert.equal(photoSentence(null, "fr"), null);
  assert.ok(text.includes("Cibles"));
});

test("the boxes of the frise are handles in the rework; the hours and the exposure of a target come from the service", async () => {
  const model =
    await import("../dist/components/sessions/session-page-model.js");
  const view = await import("../dist/components/sessions/session-page-view.js");
  const { SessionFrise } = await loadJsxModule(
    "components/sessions/SessionFrise.js",
  );
  const props = pageProps();
  const events = props.events.events;
  const passages = model.nightPassages(events, END);
  const reports = model.sessionReports({ events, passages, windowEnd: END });
  const base = {
    debriefSummary: props.debriefSummary,
    passages,
    reports,
    steps: [],
    titleOf: (id) => targetNames[id] ?? id,
  };
  // The service gives the hours (the rework's, set with the pencil, and not
  // the journal's) and the exposure of the target: the card keeps its
  // interval and says « 40 × 180 s »; with two families of exposures the main
  // one is not the only one, so it says « 38 poses » only.
  const given = props.targets.map((target) =>
    target.targetId === "ngc7000"
      ? {
          ...target,
          startedAt: "2026-10-07T21:30:00.000Z",
          finishedAt: "2026-10-07T23:10:00.000Z",
          exposureSeconds: 180,
          exposureFamilies: 1,
        }
      : target.targetId === "ic1396"
        ? { ...target, exposureSeconds: 180, exposureFamilies: 2 }
        : target,
  );
  const cards = model.sessionCards({ ...base, targets: given });
  const [ngc, ic] = cards;
  assert.equal(ngc.realStart, Date.parse("2026-10-07T21:30:00.000Z"));
  assert.equal(ngc.realEnd, Date.parse("2026-10-07T23:10:00.000Z"));
  assert.equal(ngc.hoursSet, true, "differs from the journal's passages");
  assert.equal(ngc.exposureSeconds, 180);
  assert.equal(ic.exposureSeconds, null, "two families: no single exposure");
  assert.equal(ic.hoursSet, false, "the same hours as the journal");
  const lines = view.cardLines(ngc, "fr");
  assert.equal(lines.done.span, "Fait 21:30 → 23:10");
  assert.equal(lines.frames, "40 × 180 s · Dual-band");
  assert.equal(view.cardLines(ic, "fr").frames, "38 poses · Dual-band");
  // The frise draws the interval set, not the passages of the journal.
  const frise = model.sessionFrise({
    cards,
    reports,
    windowStart: START,
    windowEnd: END,
  });
  assert.deepEqual(
    frise.runs.filter((run) => run.key === "ngc7000"),
    [
      {
        key: "ngc7000",
        start: Date.parse("2026-10-07T21:30:00.000Z"),
        end: Date.parse("2026-10-07T23:10:00.000Z"),
      },
    ],
  );
  // The boxes: in the rework each held target is a focusable handle named by
  // its place; a target taken out is not; outside the rework nothing is.
  const draw = (reorder) =>
    renderToStaticMarkup(
      createElement(SessionFrise, { locale: "fr", frise, reorder }),
    );
  const still = draw(null);
  assert.ok(!still.includes("data-frise-box"));
  assert.ok(still.includes('role="img"'));
  const moving = draw({
    order: ["ngc7000", "ic1396", "m31"],
    onDrop() {},
    onStep() {},
  });
  assert.equal((moving.match(/data-frise-box="/g) ?? []).length, 3);
  assert.ok(moving.includes('role="group"'));
  assert.ok(
    moving.includes(
      'aria-label="NGC 7000, place 1 sur 3. Glissez la boîte ou utilisez les flèches pour la déplacer."',
    ),
    "named by its place",
  );
  assert.ok(!moving.includes('data-frise-box="m45"'), "the removed one");
});

test("« Remanier la session » — the draft, what the page shows of it before saving, and the body of the rework", async () => {
  const model =
    await import("../dist/components/sessions/session-page-model.js");
  const rework = await import("../dist/components/sessions/session-rework.js");
  const view = await import("../dist/components/sessions/session-page-view.js");
  const props = pageProps();
  const events = props.events.events;
  const passages = model.nightPassages(events, END);
  const reports = model.sessionReports({ events, passages, windowEnd: END });
  const cards = model.sessionCards({
    targets: props.targets,
    debriefSummary: props.debriefSummary,
    passages,
    reports,
    steps: steps(),
    titleOf: (id) => targetNames[id] ?? id,
  });
  const pause = reports.find((report) => report.kind === "pause");
  assert.equal(
    pause.targetKey,
    "ngc7000",
    "a pause sits on the target it fell in",
  );

  let draft = rework.emptyDraft(cards);
  assert.equal(rework.draftChanged(draft, cards), false, "nothing to save");
  // Order: a target moves down one step (the keyboard's drag), then before another.
  draft = rework.stepTarget(draft, "ngc7000", 1);
  assert.deepEqual(
    draft.targets.map((t) => t.key),
    ["ic1396", "ngc7000", "m31", "m45"],
  );
  draft = rework.moveTarget(draft, "m31", "ic1396");
  assert.deepEqual(
    draft.targets.map((t) => t.key),
    ["m31", "ic1396", "ngc7000", "m45"],
  );
  // The frise's drag drops a box before or after another; the keys held
  // are the order the person reads (a target taken out is not in it, and a
  // step goes over it).
  const dropped = rework.dropTarget(draft, "m31", "ngc7000", true);
  assert.deepEqual(rework.heldOrder(dropped), ["ic1396", "ngc7000", "m31"]);
  assert.deepEqual(
    rework
      .dropTarget(dropped, "m31", "ic1396", false)
      .targets.map((t) => t.key),
    ["m31", "ic1396", "ngc7000", "m45"],
  );
  assert.equal(rework.dropTarget(draft, "m31", "m31", true), draft);
  const withRemoved = {
    ...draft,
    targets: draft.targets.map((t) =>
      t.key === "ic1396" ? { ...t, removed: true } : t,
    ),
  };
  assert.deepEqual(
    rework.stepTarget(withRemoved, "m31", 1).targets.map((t) => t.key),
    ["ic1396", "ngc7000", "m31", "m45"],
    "a step goes over a target taken out",
  );
  assert.equal(
    rework.stepTarget(draft, "m31", -1),
    draft,
    "the first one cannot go up",
  );
  // The pause follows another target; a note is added; a planned target is
  // taken out with its reason, an added one is erased for good.
  draft = { ...draft, moves: { [pause.id]: "ic1396" } };
  draft = {
    ...draft,
    added: [
      {
        id: rework.draftEventId(),
        kind: "note",
        at: Date.parse("2026-10-08T00:10:00.000Z"),
        until: null,
        targetKey: "ic1396",
        text: "Rosée",
      },
      {
        id: rework.draftEventId(),
        kind: "pause",
        at: Date.parse("2026-10-08T00:20:00.000Z"),
        until: Date.parse("2026-10-08T00:30:00.000Z"),
        targetKey: null,
        text: "Nuages",
      },
    ],
  };
  draft = {
    ...draft,
    targets: draft.targets.map((t) =>
      t.key === "ngc7000"
        ? { ...t, removed: true, reason: "equipment" }
        : t.key === "m31"
          ? {
              ...t,
              frames: "50",
              filter: "L-Pro",
              start: "01:58",
              end: "03:48",
            }
          : t,
    ),
  };
  const shown = rework.applyDraft({
    cards,
    reports,
    draft,
    sessionStart: START,
  });
  assert.deepEqual(
    shown.cards.map((c) => [c.key, c.state]),
    [
      ["m31", "added"],
      ["ic1396", "planned"],
      ["ngc7000", "removed"],
      ["m45", "removed"],
    ],
  );
  const byKey = Object.fromEntries(shown.cards.map((c) => [c.key, c]));
  assert.equal(byKey.m31.frameCount, 50);
  assert.equal(byKey.m31.filter, "L-Pro");
  assert.ok(
    byKey.ic1396.reports.some((r) => r.kind === "pause"),
    "the pause followed its move",
  );
  assert.ok(
    byKey.ic1396.reports.some((r) => r.kind === "note" && r.reconstructed),
  );
  assert.ok(
    shown.loose.some((r) => r.kind === "pause" && r.draft),
    "the added pause: the whole night",
  );
  assert.equal(rework.draftChanged(draft, cards), true);
  // The body: the whole list in order, removed kept with its reason, hours as
  // instants, the added events with their placement, the moves.
  const body = rework.reworkBody(draft, { sessionStart: START });
  assert.deepEqual(
    body.targets.map((t) => [t.targetId, t.state]),
    [
      ["m31", "added"],
      ["ic1396", "planned"],
      ["ngc7000", "removed"],
      ["m45", "removed"],
    ],
  );
  assert.equal(body.targets[0].frameCount, 50);
  assert.equal(body.targets[0].startedAt, "2026-10-08T01:58:00.000Z");
  assert.equal(body.targets[2].reason, "equipment");
  assert.equal(body.targets[1].frameCount, null, "a figure left empty is kept");
  assert.deepEqual(
    body.addedEvents.map((e) => [e.type, e.targetId ?? null]),
    [
      ["note", "ic1396"],
      ["pause", null],
    ],
  );
  assert.equal(body.addedEvents[1].until, "2026-10-08T00:30:00.000Z");
  assert.deepEqual(body.eventMoves, [
    { eventId: pause.id, targetId: "ic1396" },
  ]);
  // « Modifier »: a recorded report is rewritten by a replacement of the
  // same type, its place carried in it (a move chosen after is folded
  // into it, never sent as an `eventMoves`), the payload fields of the
  // original the form does not edit kept; one added in the draft is
  // rewritten in place; « Annuler la modification » reads the original
  // again.
  const pauseReport = reports.find((report) => report.kind === "pause");
  const skyReport = {
    id: "sky-1",
    ids: ["sky-1"],
    kind: "sky",
    at: Date.parse("2026-10-08T00:40:00.000Z"),
    until: null,
    targetKey: null,
    text: null,
    sky: "hazy",
    cause: null,
    payload: { sky: "hazy", seeing: 3 },
  };
  let edited = rework.editReport(rework.emptyDraft(cards), pauseReport, {
    ...rework.reportForm(pauseReport),
    cause: "dew",
    text: "Rosée",
  });
  edited = rework.moveReport(edited, pauseReport, "ic1396");
  edited = rework.editReport(edited, skyReport, {
    ...rework.reportForm(skyReport),
    sky: "overcast",
    cause: "clouds",
    text: "Voile épais",
  });
  const replaced = rework.reworkBody(edited, { sessionStart: START });
  assert.equal(
    replaced.eventMoves,
    undefined,
    "a replaced report is not also moved",
  );
  assert.deepEqual(
    replaced.eventReplacements.map((entry) => [
      entry.eventId,
      entry.event.type,
      entry.event.targetId ?? null,
    ]),
    [
      [pauseReport.id, "pause", "ic1396"],
      ["sky-1", "condition", null],
    ],
  );
  assert.deepEqual(replaced.eventReplacements[0].event.payload, {
    cause: "dew",
    reason: "Rosée",
  });
  assert.equal(
    replaced.eventReplacements[0].event.until,
    new Date(pauseReport.until).toISOString(),
  );
  assert.deepEqual(replaced.eventReplacements[1].event.payload, {
    sky: "overcast",
    cause: "clouds",
    notes: "Voile épais",
    seeing: 3,
  });
  const seen = rework.applyDraft({
    cards,
    reports: [pauseReport, skyReport],
    draft: edited,
    sessionStart: START,
  });
  const shownPause = seen.reports.find(
    (report) => report.id === pauseReport.id,
  );
  assert.equal(shownPause.replaced, true);
  assert.equal(shownPause.cause, "dew");
  assert.equal(shownPause.targetKey, "ic1396");
  assert.equal(rework.draftChanged(edited, cards), true);
  const back = rework.revertReport(
    rework.revertReport(edited, pauseReport),
    skyReport,
  );
  assert.equal(rework.draftChanged(back, cards), false, "nothing left to save");
  const own = {
    ...rework.emptyDraft(cards),
    added: [
      {
        id: "draft-9",
        kind: "note",
        at: Date.parse("2026-10-08T00:10:00.000Z"),
        until: null,
        targetKey: null,
        text: "avant",
      },
    ],
  };
  const rewrittenOwn = rework.editReport(
    own,
    { id: "draft-9", draft: true, kind: "note" },
    {
      kind: "note",
      at: Date.parse("2026-10-08T00:12:00.000Z"),
      until: null,
      targetKey: "ic1396",
      text: "après",
      sky: null,
      cause: null,
    },
  );
  assert.equal(
    rework.reworkBody(rewrittenOwn, { sessionStart: START }).eventReplacements,
    undefined,
  );
  assert.equal(
    rework.reworkBody(rewrittenOwn, { sessionStart: START }).addedEvents[0]
      .payload.text,
    "après",
  );
  // A target the night saw and a rework takes out stays « retirée »; one the
  // night never saw and the rework added leaves no trace.
  const seenTarget = cards.find((card) => card.key === "m31");
  assert.equal(rework.seenByNight(seenTarget), true);
  assert.equal(
    rework.seenByNight({
      passages: [],
      acquiredSeconds: null,
      frameCount: null,
      measured: false,
    }),
    false,
  );
  const takeOut = (key) => ({
    ...rework.emptyDraft(cards),
    targets: rework
      .emptyDraft(cards)
      .targets.map((entry) =>
        entry.key === key
          ? { ...entry, removed: true, reason: "weather" }
          : entry,
      ),
  });
  assert.equal(
    rework
      .applyDraft({
        cards,
        reports,
        draft: takeOut("m31"),
        sessionStart: START,
      })
      .cards.find((card) => card.key === "m31").state,
    "removed",
  );
  // A removed report of the log: both events of a pause go.
  const removed = rework.reworkBody(
    { ...rework.emptyDraft(cards), removals: pause.ids },
    { sessionStart: START },
  );
  assert.deepEqual(removed.eventRemovals, pause.ids);
  // The page in edition: the hint, the handle, the pencil, the red bin, the
  // adders, « Annuler » then the only primary; free, no label, no purchase.
  const text = plain(await renderPage(props));
  assert.ok(text.includes("Remanier cette session"));
  assert.ok(!/Planification|Synchronisation avanc|Offres|Acheter/.test(text));
  // What the service answered to a photo.
  assert.equal(view.photoAnswerOf({ replaced: true }), "replaced");
  assert.equal(
    view.photoAnswerOf({ replaced: true }, { source: "astro-sync" }),
    "replacedByAstroSync",
  );
  assert.equal(
    view.photoAnswerOf({ replaced: true }, { source: "stacking" }),
    "replacedByAstroSync",
  );
  assert.equal(
    view.photoAnswerOf({ replaced: false, variant: { id: "v" } }),
    "variant",
  );
  assert.equal(view.photoAnswerOf({ replaced: false }), null);
  // A replacement that turned a public capture private says so first,
  // whoever made it; a plain replacement is unchanged.
  assert.equal(
    view.photoAnswerOf({
      replaced: true,
      capture: { replacedMadePrivate: true },
    }),
    "madePrivate",
  );
  assert.equal(
    view.photoAnswerOf(
      { replaced: true, capture: { replacedMadePrivate: true } },
      { source: "astro-sync" },
    ),
    "madePrivate",
  );
  assert.equal(
    view.photoAnswerOf({ replaced: true, capture: { visibility: "private" } }),
    "replaced",
  );
  assert.equal(
    view.photoSentence("madePrivate", "fr"),
    "Votre capture est redevenue privée, car son image a été remplacée. Publiez-la à nouveau si vous le souhaitez.",
  );
  assert.equal(
    view.photoSentence("madePrivate", "en"),
    "Your capture is private again, because its image was replaced. Publish it again if you wish.",
  );
});

test("the states of the page — imported (read-only), not carried out, a read failure, a session without a plan", async () => {
  const imported = await renderPage(
    pageProps({
      readOnly: true,
      session: {
        ...pageProps().session,
        planId: null,
        origin: "import",
        outcome: null,
      },
      plan: null,
      nightData: null,
      analysis: null,
    }),
  );
  const importedText = plain(imported);
  assert.ok(importedText.includes("Importée"));
  assert.ok(
    importedText.includes(
      "Session importée : elle se lit ici, sans envoi de photo.",
    ),
  );
  assert.ok(!imported.includes("Envoyer une photo finale"));
  assert.ok(!imported.includes("Remanier cette session"));
  assert.ok(!imported.includes("Supprimer la session"));
  assert.ok(!imported.includes("Importer un paquet de nuit"));
  // A night not carried out keeps its session, with its reason, and no frise.
  const notDone = plain(
    await renderPage(
      pageProps({
        session: { ...pageProps().session, outcome: "abandoned" },
        targets: targetsOfNight().map((target) => ({
          ...target,
          state: "removed",
          outcome: "skipped",
          reason: "weather",
          acquiredSeconds: null,
          frameCount: null,
          captureId: null,
          thumbnailUrl: null,
        })),
      }),
    ),
  );
  assert.ok(notDone.includes("Abandonnée"));
  assert.ok(notDone.includes("Raison : Météo"));
  assert.ok(!notDone.includes("Frise de la nuit"));
  assert.ok(!notDone.includes("cibles faites"));
  // A read failure says so, with « Réessayer ».
  const { SessionReadFailed } = await loadJsxModule(
    "components/sessions/SessionReadFailed.js",
  );
  const failed = plain(
    renderToStaticMarkup(createElement(SessionReadFailed, { locale: "fr" })),
  );
  assert.ok(failed.includes("Cette session n’a pas pu être lue."));
  assert.ok(failed.includes("Réessayer"));
  // The words, in the ten languages, with the same placeholders.
  const keys = Object.keys(messages.fr).filter((key) =>
    /^(sessionPage|debriefMoment)/.test(key),
  );
  assert.ok(keys.length >= 120);
  const holes = (value) =>
    [...String(value).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const locale of [
    "en",
    "de",
    "es",
    "it",
    "pt-BR",
    "ru",
    "ja",
    "zh-Hans",
    "zh-Hant",
  ])
    for (const key of keys) {
      assert.equal(
        typeof messages[locale]?.[key],
        "string",
        `${locale}.${key}`,
      );
      assert.deepEqual(
        holes(messages[locale][key]),
        holes(messages.fr[key]),
        `${locale}.${key}`,
      );
    }
});

test("the journal: each passage once after a measured debriefing (finding (a)), folded by default", async () => {
  const all = measuredThenPlanned();
  const kept = journalEntries(all);
  assert.equal(all.length, 15);
  assert.equal(kept.length, 9, "the six planned starts and finishes go");
  assert.ok(kept.every((entry) => entry.timing !== "planned"));
  // A target the field never started keeps its planned passage.
  const onlyPlanned = journalEntries([
    ...all.slice(0, 3),
    event(
      "target_started",
      "2026-10-08T02:00:00.000Z",
      { targetId: "m33", planItemId: "d" },
      "planned",
    ),
    event(
      "target_finished",
      "2026-10-08T03:00:00.000Z",
      { targetId: "m33", planItemId: "d" },
      "planned",
    ),
  ]);
  assert.equal(onlyPlanned.length, 5);
  const html = await renderPage(pageProps());
  assert.match(
    html,
    /<details class="night-card night-fold" id="session-details-journal">/,
  );
  assert.ok(!/<details[^>]*\sopen/.test(html), "folded by default");
  assert.ok(plain(html).includes("Journal de la nuit 9 événements"));
  assert.equal((html.match(/debrief-journal-entry"/g) ?? []).length, 9);
  // « Notes prises sur le terrain »: the note event, read only.
  assert.ok(
    plain(html).includes(
      "Notes prises sur le terrain 02:08 · M31 — Rosée sur le tube vers 2 h, résistance montée d’un cran.",
    ),
  );
});

test("a box of the frise writes its name whole or not at all, and its hour only if it fits, whatever the name does — never cut", async () => {
  const model =
    await import("../dist/components/sessions/session-page-model.js");
  const { SessionFrise } = await loadJsxModule(
    "components/sessions/SessionFrise.js",
  );
  const props = pageProps();
  const cards = model.sessionCards({
    targets: props.targets,
    debriefSummary: props.debriefSummary,
    passages: [],
    skipGaps: [],
    reports: [],
    steps: [],
    titleOf: (id) => targetNames[id] ?? id,
  });
  const frise = model.sessionFrise({
    cards,
    reports: [],
    windowStart: START,
    windowEnd: END,
  });
  // The execution row draws the passages (`runs`); a segment of
  // four minutes writes no name in it — a flag above names it, whole.
  const t0 = Date.parse(START);
  const runs = [
    { key: "ngc7000", start: t0 + 60 * 60_000, end: t0 + 64 * 60_000 },
    { key: "ic1396", start: t0 + 120 * 60_000, end: t0 + 240 * 60_000 },
  ];
  const narrow = renderToStaticMarkup(
    createElement(SessionFrise, {
      locale: "fr",
      frise: { ...frise, runs, colours: { ngc7000: 0, ic1396: 1 } },
    }),
  );
  assert.ok(!narrow.includes('data-name="ngc7000"'));
  assert.ok(narrow.includes('data-flag="ngc7000"'), "named by a flag");
  assert.ok(!plain(narrow).includes("…"));
  // The wide one keeps its name inside.
  assert.ok(narrow.includes('data-name="ic1396"'));
  assert.ok(!narrow.includes('data-flag="ic1396"'));
});

test("a target skipped then taken up again keeps the part skipped hatched on the frise, in its slot, and the legend says it", async () => {
  const model =
    await import("../dist/components/sessions/session-page-model.js");
  const { SessionFrise } = await loadJsxModule(
    "components/sessions/SessionFrise.js",
  );
  const props = pageProps();
  // NGC 7000 (slot 21:06 → 23:36) skipped at 21:58 while it ran, taken up
  // again at 22:28; IC 1396 (slot 23:36 → 01:46) skipped at 23:30, before its
  // slot and before it ever ran, taken up at 00:30.
  const field = [
    event("target_started", START, { targetId: "ngc7000", planItemId: "a" }),
    event("target_skipped", "2026-10-07T21:58:00.000Z", {
      targetId: "ngc7000",
      planItemId: "a",
    }),
    event("target_started", "2026-10-07T22:28:00.000Z", {
      targetId: "ngc7000",
      planItemId: "a",
    }),
    event("target_finished", "2026-10-07T23:28:00.000Z", {
      targetId: "ngc7000",
      planItemId: "a",
    }),
    event("target_skipped", "2026-10-07T23:30:00.000Z", {
      targetId: "ic1396",
      planItemId: "b",
    }),
    event("target_started", "2026-10-08T00:30:00.000Z", {
      targetId: "ic1396",
      planItemId: "b",
    }),
    event("target_finished", "2026-10-08T01:48:00.000Z", {
      targetId: "ic1396",
      planItemId: "b",
    }),
    // M45 is skipped for good: no hole.
    event("target_skipped", "2026-10-08T01:50:00.000Z", {
      targetId: "m45",
      planItemId: "d",
    }),
  ];
  const gaps = model.nightSkipGaps(field);
  assert.equal(gaps.length, 2);
  assert.deepEqual(
    gaps.map((gap) => [gap.targetId, gap.ran]),
    [
      ["ngc7000", true],
      ["ic1396", false],
    ],
  );
  const passages = model.nightPassages(field, END);
  const cards = model.sessionCards({
    targets: props.targets,
    debriefSummary: props.debriefSummary,
    passages,
    skipGaps: gaps,
    reports: [],
    steps: [],
    titleOf: (id) => targetNames[id] ?? id,
  });
  const at = (iso) => Date.parse(iso);
  const holes = (key) => cards.find((card) => card.key === key).skipGaps;
  assert.deepEqual(holes("ngc7000"), [
    {
      start: at("2026-10-07T21:58:00.000Z"),
      end: at("2026-10-07T22:28:00.000Z"),
    },
  ]);
  // Skipped before it ran: the hole runs from the slot's start.
  assert.deepEqual(holes("ic1396"), [
    {
      start: at("2026-10-07T23:36:00.000Z"),
      end: at("2026-10-08T00:30:00.000Z"),
    },
  ]);
  assert.deepEqual(holes("m45"), []);
  assert.deepEqual(holes("m31"), []);
  const frise = model.sessionFrise({
    cards,
    reports: [],
    windowStart: START,
    windowEnd: END,
  });
  assert.equal(frise.gaps.length, 2);
  assert.deepEqual(
    frise.gaps.map((gap) => gap.key),
    ["ngc7000", "ic1396"],
  );
  const html = renderToStaticMarkup(
    createElement(SessionFrise, { locale: "fr", frise }),
  );
  // The execution row draws only what was done — the passages
  // before and after the skip, nothing hatched for the time skipped (the
  // plan as launched keeps the slot on the rail above).
  assert.equal((html.match(/class="session-frise-skipped"/g) ?? []).length, 0);
  assert.ok(!html.includes("is-cancelled"));
  assert.ok(!plain(html).includes("annulé"));
  // A night with no hole draws none and names none.
  const plainFrise = model.sessionFrise({
    cards: model.sessionCards({
      targets: props.targets,
      debriefSummary: props.debriefSummary,
      passages: model.nightPassages(props.events.events, END),
      reports: [],
      steps: [],
      titleOf: (id) => targetNames[id] ?? id,
    }),
    reports: [],
    windowStart: START,
    windowEnd: END,
  });
  assert.equal(plainFrise.gaps.length, 0);
  const calm = renderToStaticMarkup(
    createElement(SessionFrise, { locale: "fr", frise: plainFrise }),
  );
  assert.ok(!calm.includes("session-frise-skipped"));
});

test("the skip-gap rule: a skip never resumed is no hole, the debriefing's events open and close nothing, any order", async () => {
  const { sessionSkipGaps, skipGapSpan } =
    await import("../dist/session-skip-gaps.js");
  const t = (hhmm) => `2026-10-07T${hhmm}:00.000Z`;
  const gaps = sessionSkipGaps({
    events: [
      event("target_started", t("22:00"), { targetId: "a" }),
      event("target_skipped", t("23:00"), { targetId: "z" }),
      event("target_skipped", t("21:30"), { targetId: "a" }),
      event("target_started", t("21:00"), { targetId: "a" }),
      event("target_skipped", t("22:30"), { targetId: "a" }),
      event("target_started", t("23:30"), { targetId: "a" }),
      event("target_skipped", t("20:00"), { targetId: "b", planItemId: "i1" }),
      event(
        "target_started",
        t("20:30"),
        { targetId: "b", planItemId: "i1" },
        "reconstructed",
      ),
    ],
  });
  assert.deepEqual(
    gaps.map((gap) => [gap.targetId, gap.skippedAt, gap.resumedAt, gap.ran]),
    [
      ["a", Date.parse(t("21:30")), Date.parse(t("22:00")), true],
      ["a", Date.parse(t("22:30")), Date.parse(t("23:30")), true],
    ],
  );
  const [gap] = sessionSkipGaps({
    events: [
      event("target_skipped", t("20:50"), { targetId: "c" }),
      event("target_started", t("22:00"), { targetId: "c" }),
    ],
  });
  assert.equal(gap.ran, false);
  assert.deepEqual(skipGapSpan(gap, Date.parse(t("21:15"))), {
    start: Date.parse(t("21:15")),
    end: Date.parse(t("22:00")),
  });
  assert.deepEqual(skipGapSpan(gap, Date.parse(t("20:00"))), {
    start: Date.parse(t("20:50")),
    end: Date.parse(t("22:00")),
  });
  assert.equal(skipGapSpan(gap, Date.parse(t("22:30"))), null);
  assert.deepEqual(sessionSkipGaps({ events: null }), []);
});

test("« Terminée automatiquement à … » sits under the hours, only for a night that closed by itself", async () => {
  const closed = (closedBy) => {
    const props = pageProps();
    return {
      ...props,
      session: { ...props.session, ...(closedBy ? { closedBy } : {}) },
    };
  };
  const automatic = plain(await renderPage(closed("automatic")));
  assert.ok(automatic.includes("Terminée automatiquement à 01:48"), automatic);
  // Under the line of the hours, before the status chips.
  assert.ok(
    automatic.indexOf("19:08 → 01:48") <
      automatic.indexOf("Terminée automatiquement"),
  );
  assert.ok(
    automatic.indexOf("Terminée automatiquement") <
      automatic.indexOf("Exécutée en partie"),
  );
  const html = await renderPage(closed("automatic"));
  assert.ok(html.includes('data-testid="session-closed-automatically"'));
  for (const closedBy of ["manual", null, undefined]) {
    const other = await renderPage(closed(closedBy));
    assert.ok(
      !other.includes("session-closed-automatically"),
      `${closedBy}: no line`,
    );
    assert.ok(!plain(other).includes("automatiquement"));
  }
  // In English too.
  const en = plain(await renderPage({ ...closed("automatic"), locale: "en" }));
  assert.ok(en.includes("Closed automatically at 01:48"), en);
});

test("the new words are in the ten catalogues, with the same placeholders", () => {
  const holes = (value) =>
    [...String(value).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const locale of [
    "fr",
    "en",
    "de",
    "es",
    "it",
    "pt-BR",
    "ru",
    "ja",
    "zh-Hans",
    "zh-Hant",
  ])
    for (const key of [
      "sessionPageLegendCancelled",
      "sessionPageClosedAutomatically",
    ]) {
      assert.equal(
        typeof messages[locale]?.[key],
        "string",
        `${locale}.${key}`,
      );
      assert.deepEqual(
        holes(messages[locale][key]),
        holes(messages.fr[key]),
        `${locale}.${key}`,
      );
    }
  assert.deepEqual(holes(messages.fr.sessionPageClosedAutomatically), ["time"]);
  for (const locale of ["en", "de", "es", "it", "ru", "ja"])
    assert.notEqual(
      messages[locale].sessionPageClosedAutomatically,
      messages.fr.sessionPageClosedAutomatically,
      locale,
    );
});

test("ten catalogues: every word of the page in each language, the same placeholders", () => {
  const keys = Object.keys(messages.fr).filter((key) =>
    key.startsWith("nightPage"),
  );
  assert.ok(keys.length >= 140);
  const holes = (value) =>
    [...String(value).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const locale of [
    "en",
    "de",
    "es",
    "it",
    "pt-BR",
    "ru",
    "ja",
    "zh-Hans",
    "zh-Hant",
  ])
    for (const key of keys) {
      assert.equal(
        typeof messages[locale]?.[key],
        "string",
        `${locale}.${key}`,
      );
      assert.deepEqual(
        holes(messages[locale][key]),
        holes(messages.fr[key]),
        `${locale}.${key}`,
      );
    }
  assert.ok(
    !keys.some((key) => /session/i.test(messages.fr[key])),
    "never « session » on screen",
  );
});

test("the words of the new gestures are in the ten catalogues, with the same placeholders,", async () => {
  const keys = [
    "sessionPhotoReplacedManual",
    "sessionPageReworkFriseBox",
    "sessionPageReworkMoved",
    "sessionPageEventKindSky",
    "sessionPageEventKindIncident",
    "sessionPageEventPauseCause",
    "sessionPageEventPauseCauseNone",
    "sessionPageEventSkyCause",
    "sessionPageEventSkyCauseNone",
    "sessionPageEditReport",
    "sessionPageEditReportTitle",
    "sessionPageRevertReport",
    "sessionPageReworkEventReplaced",
    "sessionPageReworkEventNotEditable",
    "sessionPageReworkEventGone",
    "debriefErrorEventChanged",
  ];
  const holes = (value) =>
    [...String(value).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const locale of [
    "fr",
    "en",
    "de",
    "es",
    "it",
    "pt-BR",
    "ru",
    "ja",
    "zh-Hans",
    "zh-Hant",
  ])
    for (const key of keys) {
      assert.equal(
        typeof messages[locale]?.[key],
        "string",
        `${locale}.${key}`,
      );
      assert.deepEqual(
        holes(messages[locale][key]),
        holes(messages.fr[key]),
        `${locale}.${key}`,
      );
    }
  // The capture page's words for the image of a plan and the computer.
  const { metadataCopyFor } =
    await import("../dist/components/manage/capture-metadata-copy.js");
  for (const locale of [
    "fr",
    "en",
    "de",
    "es",
    "it",
    "pt-BR",
    "ru",
    "ja",
    "zh-Hans",
    "zh-Hant",
  ]) {
    const meta = metadataCopyFor(locale);
    assert.ok(
      meta.integrationsPlanOrigin("IC 1805").includes("IC 1805"),
      locale,
    );
    assert.ok(meta.integrationsNotCombined(1, "X").includes("X"), locale);
    assert.equal(typeof meta.integrationsSyncPlan, "string", locale);
    assert.ok(
      meta.integrationsMeasuredFrom("T", "MacBook").includes("MacBook"),
      `${locale}: the computer is named`,
    );
    assert.ok(
      !/undefined|null/.test(meta.integrationsMeasured("T")) &&
        !meta.integrationsMeasured("T").includes("MacBook"),
      `${locale}: no computer, no name`,
    );
  }
});

test("the frise of the page reads like the phone's — the plan as launched, each target's time, a pause hatched yellow in its frame, one clickable line and icon per event, the hours of the place, a scale finer at each zoom", async () => {
  const model =
    await import("../dist/components/sessions/session-page-model.js");
  const { SessionFrise, friseScaleSteps, friseMarks } = await loadJsxModule(
    "components/sessions/SessionFrise.js",
  );
  const props = pageProps();
  const events = props.events.events;
  const passages = model.nightPassages(events, END);
  const reports = model.sessionReports({ events, passages, windowEnd: END });
  const cards = model.sessionCards({
    targets: props.targets,
    debriefSummary: props.debriefSummary,
    passages,
    reports,
    steps: [],
    titleOf: (id) => targetNames[id] ?? id,
  });
  const frise = model.sessionFrise({
    cards,
    reports,
    windowStart: START,
    windowEnd: END,
  });
  const draw = (timeZone) =>
    renderToStaticMarkup(
      createElement(SessionFrise, { locale: "fr", frise, timeZone }),
    );
  const html = draw(null);
  // « plan initial »: a thin frame per planned (or removed) target.
  assert.ok(plain(html).includes("plan initial"));
  assert.equal(
    (html.match(/data-initial="/g) ?? []).length,
    frise.planned.filter((box) => box.kind !== "added").length,
  );
  // One segment per passage, in the colour of its target.
  assert.equal((html.match(/data-segment="/g) ?? []).length, frise.runs.length);
  assert.match(html, /session-frise-segment is-c0/);
  assert.match(html, /session-frise-run is-c0/);
  // The pause: hatched yellow on the band and on its target's segment.
  assert.ok(html.includes("session-frise-hatch-pause"));
  assert.ok(html.includes("data-pause="), "the pause on its target's segment");
  // An event is a button (its detail opens under the frise).
  assert.ok(
    /class="session-frise-marker[^"]*"[^>]*role="button"/.test(html) ||
      /role="button"[^>]*class="session-frise-marker/.test(html),
  );
  // « UTC » written without a zone; « heures du lieu » with one.
  assert.ok(plain(html).includes("UTC"));
  assert.ok(plain(draw("Atlantic/Azores")).includes("heures du lieu"));
  // « Lire la frise » is the ⓘ of the header.
  assert.match(html, /class="info-button[^"]*"[^>]*aria-label="Lire la frise"/);
  // The finest step whose labels stay 40 px apart.
  assert.deepEqual(friseScaleSteps(0.7), { label: 60, tick: 15 });
  assert.deepEqual(friseScaleSteps(2), { label: 30, tick: 10 });
  assert.deepEqual(friseScaleSteps(3), { label: 15, tick: 5 });
  const start = Date.parse("2026-10-07T20:10:00Z");
  const end = Date.parse("2026-10-07T22:10:00Z");
  assert.deepEqual(
    friseMarks(start, end, null, 30).map((at) => new Date(at).toISOString()),
    [
      "2026-10-07T20:30:00.000Z",
      "2026-10-07T21:00:00.000Z",
      "2026-10-07T21:30:00.000Z",
      "2026-10-07T22:00:00.000Z",
    ],
  );
});

test("the title with the night, the plan of origin, the hours of the place or « UTC » once, and the six states of the sending", async () => {
  const view = await import("../dist/components/sessions/session-page-view.js");
  assert.equal(
    view.sessionTitle("2026-10-07", "fr"),
    "Session · Nuit du 7 au 8 oct.",
  );
  assert.equal(
    view.sessionTitle("2026-10-07", "en"),
    "Session · Night of Oct 7 to 8",
  );
  assert.equal(
    view.originLine("Nuit d’octobre au col", "fr").replaceAll("\u00a0", " "),
    "Plan d’origine · « Nuit d’octobre au col »",
  );
  // The hours: « UTC » written once without a time zone, the place's hours
  // (no « UTC ») with one.
  assert.equal(
    view.sessionHours("2026-10-07T21:08:00Z", "2026-10-08T03:48:00Z", "UTC"),
    "21:08 → 03:48 UTC",
  );
  assert.equal(
    view.sessionHours(
      "2026-10-07T21:08:00Z",
      "2026-10-08T03:48:00Z",
      "Asia/Tokyo",
    ),
    "06:08 → 12:48",
  );
  assert.equal(view.sessionHours(null, null, "UTC"), null);
  // A window of zero minutes says no hours.
  assert.equal(
    view.sessionHours("2026-10-27T21:00:00Z", "2026-10-27T21:00:20Z", "UTC"),
    null,
  );
  // The state of the sending.
  const state = (facts) => view.sessionSendingState(facts);
  assert.deepEqual(state({ outcomeKind: "toDebrief" }), {
    key: "sessionStateToDebrief",
    waits: true,
  });
  assert.deepEqual(state({ outcomeKind: "executed", visual: true }), {
    key: "sessionStateVisual",
    waits: false,
  });
  assert.deepEqual(
    state({ outcomeKind: "executed", hasCaptures: true, hasLogs: true }),
    { key: "sessionStateComplete", waits: false },
  );
  assert.equal(
    state({ outcomeKind: "executed", hasCaptures: true }).key,
    "sessionStateAwaitingLogs",
  );
  assert.equal(
    state({ outcomeKind: "executed", hasLogs: true }).key,
    "sessionStateAwaitingCaptures",
  );
  assert.equal(
    state({ outcomeKind: "partial" }).key,
    "sessionStateAwaitingBoth",
  );
  // A night that had no plan was never debriefed: no sentence says it was.
  const { messages } = await import("../dist/i18n.js");
  for (const facts of [
    { outcomeKind: "noPlan" },
    { outcomeKind: "noPlan", hasCaptures: true },
    { outcomeKind: "noPlan", hasLogs: true },
    { outcomeKind: "noPlan", hasCaptures: true, hasLogs: true },
    { outcomeKind: "noPlan", hasCaptures: true, fromAstroSync: true },
  ]) {
    const { key } = state(facts);
    assert.match(key, /^sessionStateNoPlan/, JSON.stringify(facts));
    for (const locale of Object.keys(messages))
      assert.ok(messages[locale][key], `${locale}.${key}`);
    assert.doesNotMatch(
      messages.en[key],
      /debrief/i,
      `${key} does not claim a debriefing`,
    );
  }
  assert.equal(
    state({ outcomeKind: "noPlan" }).key,
    "sessionStateNoPlanAwaitingBoth",
  );
  // A planned night keeps its sentences.
  assert.match(messages.en.sessionStateAwaitingBoth, /debriefed/);
  // The outcome in the shared palette: grey for the past, blue for what waits.
  assert.equal(view.outcomeTone("executed"), "executed");
  assert.equal(view.outcomeTone("notExecuted"), "abandoned");
  assert.equal(view.outcomeTone("toDebrief"), "toDebrief");
  assert.equal(view.outcomeTone("noPlan"), null);
  // On the page itself: the state sentence, the tag, the foot.
  const html = await renderPage(pageProps());
  assert.match(html, /data-testid="session-sending-state"/);
  assert.match(
    html,
    /class="status-tag is-partial is-openable session-outcome"/,
  );
  assert.match(html, /data-action="delete-session"/);
});

test("the rework reads and sends the hours of the place, UTC without a zone", async () => {
  const rework = await import("../dist/components/sessions/session-rework.js");
  const moment = await import("../dist/components/sessions/debrief-moment.js");
  const view = await import("../dist/components/sessions/session-page-view.js");
  // A place at UTC−7 (Phoenix, no daylight saving): 04:17Z is 21:17 there.
  const sessionStart = "2026-10-08T03:55:00.000Z";
  const realStart = Date.parse("2026-10-08T04:17:00.000Z");
  const realEnd = Date.parse("2026-10-08T06:02:00.000Z");
  const zone = "America/Phoenix";
  const card = {
    key: "m31",
    planItemId: "m31",
    label: "M31",
    state: "planned",
    realStart,
    realEnd,
  };
  // The card and the dialog show the same hour.
  assert.equal(view.reportClock({ at: realStart }, zone), "21:17");
  assert.equal(moment.clockValue(card.realStart, zone), "21:17");
  assert.equal(moment.clockValue(card.realEnd, zone), "23:02");
  // The hours the person types are the place's; the request holds the UTC.
  const draft = {
    ...rework.emptyDraft([card]),
    targets: [
      {
        ...rework.emptyDraft([card]).targets[0],
        start: "21:17",
        end: "23:02",
      },
    ],
  };
  const body = rework.reworkBody(draft, { sessionStart, timeZone: zone });
  assert.equal(body.targets[0].startedAt, "2026-10-08T04:17:00.000Z");
  assert.equal(body.targets[0].finishedAt, "2026-10-08T06:02:00.000Z");
  const shown = rework.applyDraft({
    cards: [card],
    reports: [],
    draft,
    sessionStart,
    timeZone: zone,
  });
  assert.equal(shown.cards[0].realStart, realStart);
  assert.equal(shown.cards[0].realEnd, realEnd);
  // A night across the local midnight keeps its order.
  const late = {
    ...draft,
    targets: [{ ...draft.targets[0], start: "23:30", end: "00:40" }],
  };
  const lateBody = rework.reworkBody(late, { sessionStart, timeZone: zone });
  assert.equal(lateBody.targets[0].startedAt, "2026-10-08T06:30:00.000Z");
  assert.equal(lateBody.targets[0].finishedAt, "2026-10-08T07:40:00.000Z");
  // A place without a zone keeps UTC, written as such.
  assert.equal(moment.clockValue(card.realStart), "04:17");
  const utcBody = rework.reworkBody(
    {
      ...draft,
      targets: [{ ...draft.targets[0], start: "04:17", end: "06:02" }],
    },
    { sessionStart },
  );
  assert.equal(utcBody.targets[0].startedAt, "2026-10-08T04:17:00.000Z");
  assert.equal(utcBody.targets[0].finishedAt, "2026-10-08T06:02:00.000Z");
  assert.equal(
    view.sessionHours(sessionStart, "2026-10-08T10:00:00Z", "UTC"),
    "03:55 → 10:00 UTC",
  );
});

// The debriefing's « Note sur la nuit » is a `note` event of the whole night;
// the fold « Notes » says it is there instead of « Aucune note ».
test("the debriefing's note is a note of the night — the fold does not say there is none", async () => {
  const debriefNote = event("note", "2026-10-08T04:00:00.000Z", {
    text: "Nuit courte, ciel limpide.",
  });
  const withoutNightNotes = night({ notes: { value: "", source: "night" } });
  const html = await renderPage(
    pageProps({
      events: { events: [debriefNote] },
      nightData: { ...pageProps().nightData, night: withoutNightNotes },
    }),
  );
  const text = plain(html);
  assert.ok(text.includes("Nuit courte, ciel limpide."), "the note is shown");
  assert.ok(!text.includes("Aucune note pour cette nuit."), text);
  // Without any note at all, the fold still says so.
  const none = plain(
    await renderPage(
      pageProps({
        events: { events: [] },
        nightData: { ...pageProps().nightData, night: withoutNightNotes },
      }),
    ),
  );
  assert.ok(none.includes("Aucune note pour cette nuit."));
});

// A free execution's plan promised nothing — no « Prévu », no « plan
// initial », no « Plan d’origine ».
test("a free execution's plan draws no promise", async () => {
  const promised = plain(await renderPage(pageProps()));
  assert.ok(promised.includes("plan initial"));
  assert.ok(promised.includes("Prévu 19:06 → 21:36"));
  assert.ok(promised.includes("Plan d’origine"));
  const base = pageProps();
  const free = plain(
    await renderPage(
      pageProps({ plan: { ...base.plan, blankExecution: true } }),
    ),
  );
  assert.ok(!free.includes("plan initial"), free);
  assert.ok(!free.includes("Prévu 19:06"), free);
  assert.ok(!free.includes("Plan d’origine"), free);
  assert.ok(free.includes("NGC 7000"));
});

test("a night Astro Sync created and sent says where its captures came from, waits for no log and does not invite to discover Astro Sync", async () => {
  const view = await import("../dist/components/sessions/session-page-view.js");
  assert.deepEqual(
    view.sessionSendingState({
      outcomeKind: "executed",
      hasCaptures: true,
      fromAstroSync: true,
    }),
    { key: "sessionStateCapturesFromAstroSync", waits: false },
  );
  // Without the origin, the page still waits for the logs it can receive.
  assert.equal(
    view.sessionSendingState({ outcomeKind: "executed", hasCaptures: true })
      .key,
    "sessionStateAwaitingLogs",
  );
  const withProps = (origin) =>
    pageProps({
      withAnalysis: false,
      session: { ...pageProps().session, origin },
      targets: targetsOfNight().map((target, index) => ({
        ...target,
        captureId: index === 0 ? "cap-1" : null,
      })),
    });
  const sent = plain(await renderPage(withProps("astro-sync")));
  assert.match(sent, /Vos captures sont reçues d’Astro Sync/u);
  assert.doesNotMatch(sent, /attend encore vos journaux/u);
  assert.doesNotMatch(sent, /Découvrir Astro Sync/u);
  assert.doesNotMatch(sent, /Utilisez Astro Sync sur un ordinateur/u);
  // A night nobody sent from Astro Sync keeps its invitation.
  const other = plain(await renderPage(withProps("execution")));
  assert.match(other, /Découvrir Astro Sync/u);
  assert.match(other, /attend encore vos journaux/u);
  for (const locale of [
    "fr",
    "en",
    "ja",
    "de",
    "es",
    "it",
    "pt-BR",
    "ru",
    "zh-Hans",
    "zh-Hant",
  ]) {
    assert.ok(
      messages[locale].sessionStateCapturesFromAstroSync?.includes(
        "Astro Sync",
      ),
      locale,
    );
  }
});
