// SESSION-GUIDING-STATS-01 — « Guidage » and « Poses » of the page of
// a session, and « Les nuits de cette image » of the owner's page of a
// capture: the rules of the view (`session-guiding-view.js`) and the
// sections rendered on the night of 10 to 11 August (report v3, real values
// reduced), on a report v2 (no direction of the corrections, no left-out
// frame), on a night without a guiding log, and on the three nights of a plan.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { messages } from "../dist/i18n.js";
import {
  guidingSummary,
  guidingTraceOf,
  posesSummary,
} from "../dist/sessions/night-summary.js";
import {
  curveRuns,
  eveningSpan,
  filterTone,
  inUnit,
  nightWindow,
  pauseLabels,
  placeLabels,
  smoothRuns,
  smoothingApplies,
  offsetScale,
  planNightsView,
  pointTip,
  posesByFilter,
  posesOf,
  sayCounted,
  settleRuns,
  traceOf,
  windowTicks,
} from "../dist/components/sessions/session-guiding-view.js";
import { nightReport } from "./fixtures/night/report-v2.mjs";
import {
  NIGHT,
  guidingNightReport,
  planNightsBody,
} from "./fixtures/night/guiding-night-v3.mjs";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const loadJsxModule = (path) => import(`portal/${path}`);

const NBSP = "\u00a0";
const plain = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replaceAll(NBSP, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/[ \t\n]+/g, " ")
    .trim();
const count = (html, pattern) => (html.match(pattern) ?? []).length;

const ZONE = NIGHT.timeZone;
const BOUNDS = { start: NIGHT.start, end: NIGHT.end };

async function guiding(props) {
  const { SessionGuidingSection } = await loadJsxModule(
    "components/sessions/SessionGuiding.js",
  );
  return renderToStaticMarkup(
    createElement(SessionGuidingSection, {
      locale: "fr",
      bounds: BOUNDS,
      zone: ZONE,
      ...props,
    }),
  );
}

async function poses(props) {
  const { SessionPosesSection } = await loadJsxModule(
    "components/sessions/SessionPoses.js",
  );
  return renderToStaticMarkup(
    createElement(SessionPosesSection, {
      locale: "fr",
      bounds: BOUNDS,
      zone: ZONE,
      ...props,
    }),
  );
}

test("the view: the trace as instants, its settles as runs, never drawn as spikes", () => {
  const report = guidingNightReport();
  const trace = traceOf(report.guidingTrace);
  assert.equal(trace.points.length, report.guidingTrace.points.length);
  assert.equal(trace.pulsesKnown, true);
  assert.equal(trace.scale, 6.88);
  const settles = settleRuns(trace);
  assert.ok(settles.length >= 40, "a settle after each dither");
  // No point of a settle is in a curve; the excursions of a dither are out.
  const window = nightWindow(BOUNDS, trace);
  const drawn = curveRuns(trace, "dec", window).flat();
  const settling = trace.points.filter((point) => point.settle);
  assert.ok(settling.length > 0);
  assert.ok(
    !drawn.some((point) => settling.some((s) => s.at === point.at)),
    "a settle window is never drawn",
  );
  // The scale comes from the calm windows: a few arc seconds, not 30″.
  const scale = offsetScale(trace, window, "arcsec");
  assert.ok(scale.top >= 1 && scale.top <= 4, `top ${scale.top}`);
  // In guide pixels: ″ ÷ the guide scale.
  assert.equal(inUnit(6.88, "px", 6.88), 1);
  assert.equal(inUnit(1, "px", null), null);
  const px = offsetScale(trace, window, "px");
  assert.ok(px.top < 1, `px top ${px.top}`);
});

test("the view: the window is the whole night, its ticks in the place's hours, finer zoomed", () => {
  const trace = traceOf(guidingNightReport().guidingTrace);
  const window = nightWindow(BOUNDS, trace);
  // From the first point of the log (before the first frame, 22:53) to the end.
  assert.equal(window.from, trace.from);
  assert.ok(trace.from < Date.parse(NIGHT.start));
  const ticks = windowTicks(window, ZONE, 950);
  assert.ok(ticks.some((tick) => tick.label === "23:00" && tick.whole));
  assert.ok(
    ticks.some((tick) => tick.label === "23:15"),
    "every 15 min",
  );
  assert.ok(!ticks.some((tick) => tick.label === "21:00"), "never UTC");
  // Zoomed on half an hour: every 5 minutes.
  const half = {
    from: Date.parse("2026-08-10T22:00:00.000Z"),
    to: Date.parse("2026-08-10T22:30:00.000Z"),
  };
  assert.deepEqual(
    windowTicks(half, ZONE, 950).map((tick) => tick.label),
    ["00:00", "00:05", "00:10", "00:15", "00:20", "00:25", "00:30"],
  );
  // Narrow (390 px): fewer labels.
  assert.ok(windowTicks(window, ZONE, 330).length <= 6);
});

test("the view: the bubble of a point — the time with its seconds, the mean, the corrections and their direction", () => {
  const trace = traceOf({
    intervalSeconds: 10,
    startUtc: "2026-08-10T22:16:10.000Z",
    scaleArcsecPerPx: 6.88,
    points: [
      {
        t: 0,
        n: 3,
        out: 0,
        ra: 0.72,
        dec: -0.4,
        raPulseMs: -203,
        decPulseMs: -198,
      },
    ],
    markers: [],
  });
  const tip = pointTip(trace.points[0], trace, { locale: "fr", zone: ZONE });
  assert.equal(
    tip.head,
    "00:16:10 · moyenne sur 10 s (3 mesures)".replace("10 s", `10${NBSP}s`),
  );
  assert.equal(tip.lines[0].text, `AD +0,72″ · correction 203${NBSP}ms O`);
  assert.equal(tip.lines[1].text, `Déc −0,40″ · correction 198${NBSP}ms S`);
  const en = pointTip(trace.points[0], trace, { locale: "en", zone: ZONE });
  assert.equal(en.lines[0].text, "RA +0.72″ · correction 203 ms W");
});

test("« Guidage » on the night of 10 August: the four figures, the facts, the curve and the bars, the marks, the hours of the place", async () => {
  const report = guidingNightReport();
  const html = await guiding({
    guidingTrace: guidingTraceOf(report),
    summary: guidingSummary(report),
    report,
  });
  const text = plain(html);
  assert.ok(
    text.startsWith("Guidage Mesuré par Astro Sync · PHD2"),
    text.slice(0, 80),
  );
  assert.ok(
    text.includes(
      "heures du lieu · écart de l’étoile guide à sa position, en secondes d’arc",
    ),
  );
  assert.ok(text.includes("RMS total 0,90″ RMS AD 0,64″ RMS Déc 0,63″"), text);
  assert.ok(text.includes("Guidée 2 h 56 journal entier"));
  assert.ok(
    text.includes(
      "44 dithers · aucune perte d’étoile · 1 retournement au méridien · aucune stabilisation expirée · échelle de guidage 6,88″/px · image 4,08″/px",
    ),
    text,
  );
  assert.ok(text.includes("Toute la nuit"));
  assert.ok(text.includes("glissez sur la courbe pour zoomer"));
  // ″ by default, px offered (the guide scale is known).
  assert.match(
    html,
    /<button type="button" class="is-active" aria-pressed="true">″<\/button>/,
  );
  assert.ok(text.includes("″ px"));
  // The two curves, the corrections, the settles, the dithers, the flip.
  assert.ok(count(html, /session-guiding-line is-ra/g) > 10);
  assert.ok(count(html, /session-guiding-line is-dec/g) > 10);
  assert.ok(count(html, /session-guiding-bar is-ra/g) > 100);
  assert.ok(count(html, /session-guiding-bar is-dec/g) > 100);
  assert.ok(count(html, /class="session-guiding-settle"/g) >= 30);
  assert.ok(count(html, /class="session-guiding-dither"/g) >= 30);
  assert.ok(
    text.includes("Retournement 01:11"),
    "the flip, in the place's hours",
  );
  assert.ok(html.includes("session-guiding-pause"), "the flip's pause hatched");
  assert.ok(text.includes("23:00") && text.includes("01:00"));
  assert.ok(!text.includes("corrections non connues"));
  assert.ok(
    text.includes(
      "AD Déc lissé 30 s corrections envoyées (E/O, N/S, durée) dither stabilisation (hors RMS) pause retournement",
    ),
    text.slice(-300),
  );
});

test("« Guidage » of a report v2: the curve rebuilt, no bars, « corrections non connues », no px without a guide scale", async () => {
  const report = nightReport();
  const trace = guidingTraceOf(report);
  assert.equal(trace.points[0].raPulseMs, null);
  const html = await guiding({
    guidingTrace: trace,
    summary: guidingSummary(report),
    report,
    bounds: {
      start: "2026-10-07T21:10:00.000Z",
      end: "2026-10-08T01:10:00.000Z",
    },
    zone: null,
  });
  const text = plain(html);
  assert.ok(text.includes("heures UTC"));
  assert.ok(
    !html.includes("session-guiding-bar"),
    "no bar without a direction",
  );
  assert.ok(text.includes("corrections non connues"));
  assert.ok(
    !html.includes("session-guiding-units"),
    "no px without a guide scale",
  );
  assert.ok(!text.includes("corrections envoyées"), "no legend of the bars");
});

test("« Guidage » without a trace: a night analysed without PHD2, a night of Astro Sync without its logs, a night without Astro Sync", async () => {
  const report = guidingNightReport({ guidingTrace: undefined });
  const analysed = plain(
    await guiding({ guidingTrace: null, summary: null, report }),
  );
  assert.ok(analysed.includes("Pas de journal de guidage pour cette nuit."));
  assert.ok(
    analysed.includes(
      "Les poses et leur chronologie restent dessinées plus bas.",
    ),
  );
  assert.ok(!analysed.includes("0,00″"), "never an empty curve nor a 0,00″");
  const notSent = plain(
    await guiding({ guidingTrace: null, report: null, fromAstroSync: true }),
  );
  assert.ok(
    notSent.includes("Les journaux de cette nuit ne sont pas encore envoyés."),
  );
  assert.ok(notSent.includes("« Journaux » coché"));
  assert.equal(
    await guiding({ guidingTrace: null, report: null, fromAstroSync: false }),
    "",
  );
});

test("the frames: filters by family, the table by filter, the left-out frames only when the report says so", () => {
  assert.equal(filterTone(null), "none");
  assert.equal(filterTone("Ha"), "ha");
  assert.equal(filterTone("H-alpha"), "ha");
  assert.equal(filterTone("OIII"), "oiii");
  assert.equal(filterTone("L"), "l");
  assert.equal(filterTone("Dual-band"), "other");
  const report = guidingNightReport();
  const list = posesOf(report);
  assert.equal(list.length, 90);
  assert.deepEqual(
    list
      .filter((pose) => pose.rejected)
      .map((pose) => [pose.index, pose.rejectReason]),
    [[59, "unregistered"]],
  );
  const [group] = posesByFilter(list);
  assert.equal(group.kept, 89);
  assert.equal(group.rejected, 1);
  assert.equal(group.keptSeconds, 89 * 90);
  // A report v2: no frame is said left out.
  assert.equal(
    posesOf(nightReport(), { rejectedKnown: false }).some((p) => p.rejected),
    false,
  );
});

test("« Poses » on the night of 10 August: 89 of 90, 2 h 14, frame 59 not aligned, the sensor, the bars by filter, the table", async () => {
  const report = guidingNightReport();
  const html = await poses({
    summary: posesSummary(report),
    report,
    guidingTrace: guidingTraceOf(report),
  });
  const text = plain(html);
  assert.ok(text.startsWith("Poses Comptées par Astro Sync"));
  assert.ok(text.includes("hachurée = laissée hors de l’empilement"));
  assert.ok(text.includes("Poses gardées 89 sur 90"), text);
  assert.ok(text.includes("Intégration gardée 2 h 14 90 s · gain 100"), text);
  assert.ok(text.includes("Rejetées par Astro Sync 1 non alignée"), text);
  assert.match(text, /Capteur −10,1 °C (stable|médiane) \(±0,\d\)/);
  assert.equal(count(html, /class="session-poses-bar tone-none"/g), 89);
  assert.equal(
    count(html, /class="session-poses-bar tone-none is-rejected"/g),
    1,
  );
  assert.ok(text.includes("▲ pose 59 rejetée"));
  // The events are written once, on « Guidage »: here the symbols alone
  // (hatch, dashed line), their words only in the bubbles.
  assert.ok(!html.includes("session-poses-note is-pause"));
  assert.ok(!/<text[^>]*>[^<]*(Retournement|pause 11)/.test(html));
  assert.match(html, /<title>Retournement 01:11<\/title>/);
  assert.match(
    html.replaceAll(NBSP, " "),
    /<title>pause 11 min · \d\d:\d\d–\d\d:\d\d<\/title>/,
  );
  // The reason in the frame's bubble.
  assert.match(
    html.replaceAll(NBSP, " "),
    /<title>Pose 59 · \d\d:\d\d:\d\d · 90 s · Sans filtre · −10,\d °C · RMS de guidage pendant la pose \d,\d\d″ · rejetée : non alignée<\/title>/,
  );
  assert.ok(
    text.includes(
      "Filtre Pose Gardées Rejetées Intégration Capteur FWHM · excentricité Sans filtre 90 s · gain 100 89 1 non alignée 2 h 14",
    ),
    text,
  );
  assert.ok(text.includes("— (pas mesurées)"));
  assert.ok(text.includes("sans filtre (OSC) rejetée pause retournement"));
});

test("« Poses » of a report v2: no left-out frame, one line « rejets non connus (ancien rapport) »", async () => {
  const report = nightReport();
  const summary = posesSummary(report);
  assert.equal(summary.rejectedKnown, false);
  const html = await poses({
    summary,
    report,
    guidingTrace: guidingTraceOf(report),
    bounds: {
      start: "2026-10-07T21:10:00.000Z",
      end: "2026-10-08T01:10:00.000Z",
    },
    zone: null,
  });
  const text = plain(html);
  assert.ok(text.includes("Rejets non connus (ancien rapport)"));
  assert.ok(
    text.includes("Rejetées par Astro Sync — non connues (ancien rapport)"),
    text,
  );
  assert.ok(!html.includes("is-rejected"), "no hatched frame");
  assert.ok(!text.includes("hachurée"));
  assert.ok(
    !text.includes("Rejetées Intégration"),
    "no column of left-out frames",
  );
  // Three filters, each its own colour family, the table one row each.
  assert.ok(
    html.includes("tone-ha") &&
      html.includes("tone-oiii") &&
      html.includes("tone-none"),
  );
  // No frame row: no section.
  assert.equal(await poses({ summary: null, report }), "");
});

test("the nights of a plan: the summary line, the cumulative row, each night's share and its link", () => {
  assert.equal(eveningSpan("2026-08-07", "fr"), "7–8 août");
  const view = planNightsView(planNightsBody(), "fr");
  assert.match(
    view.summary.replaceAll(NBSP, " "),
    /^Guidage RMS 0,\d\d″ · 309 poses gardées sur 324 · 3 nuits · 13 h 14$/,
  );
  assert.deepEqual(
    view.nights.map((night) => [
      night.span,
      night.rmsTotal,
      night.kept,
      night.total,
    ]),
    [
      ["7–8 août", 0.67, 120, 120],
      ["10–11 août", 0.89, 89, 90],
      ["12–13 août", 0.95, 100, 114],
    ],
  );
  assert.ok(
    Math.abs(view.nights.reduce((sum, n) => sum + n.share, 0) - 1) < 1e-9,
  );
  const missing = planNightsView(planNightsBody({ missing: [2] }), "fr");
  assert.match(missing.summary, /2 nuits sur 3/);
  assert.equal(missing.nights[2].analysed, false);
});

test("« Les nuits de cette image » under « Cette image »: tabs Cumulé and a night each, the table, the links to the sessions", async () => {
  const { CaptureQualityZone } = await loadJsxModule(
    "components/manage/CaptureSessionQuality.js",
  );
  const { metadataCopyFor } = await loadJsxModule(
    "components/manage/capture-metadata-copy.js",
  ).catch(() => ({ metadataCopyFor: null }));
  const meta = metadataCopyFor
    ? metadataCopyFor("fr")
    : {
        qualityImageTitle: "Cette image",
        qualityImageNote: "Mesurée par Astro Sync sur l’image empilée.",
        qualityStars: () => "étoiles mesurées",
        nightZone: "La session",
      };
  const capture = {
    id: "cap-sh2-103",
    projectId: "project-sh2-103",
    quality: { fwhmArcsec: 10.49, eccentricity: 0.49, starCount: 55 },
    metadata: { sessionId: null },
    detail: {},
  };
  const html = renderToStaticMarkup(
    createElement(CaptureQualityZone, {
      capture,
      meta,
      locale: "fr",
      href: null,
      nights: planNightsBody(),
    }),
  );
  const text = plain(html);
  const image = text.indexOf("Cette image");
  const nights = text.indexOf("Les nuits de cette image");
  assert.ok(image >= 0 && nights > image, "under « Cette image »");
  assert.match(
    text,
    /Guidage RMS 0,\d\d″ · 309 poses gardées sur 324 · 3 nuits · 13 h 14/,
  );
  assert.ok(text.includes("Cumulé 7–8 août 10–11 août 12–13 août"));
  assert.ok(text.includes("Nuit RMS total AD Déc Poses gardées Intégration"));
  assert.ok(
    text.includes(
      "10–11 août 0,89″ 0,64″ 0,63″ 89 / 90 2 h 14 Statistiques de la nuit →",
    ),
    text,
  );
  assert.ok(html.includes('href="/fr/sessions/night-10"'));
  assert.ok(text.includes("part de chaque nuit dans l’intégration gardée"));
  assert.match(
    html,
    /role="tab" aria-selected="true" class="is-active">Cumulé/,
  );

  const { CaptureNightsPart } = await loadJsxModule(
    "components/manage/CaptureNights.js",
  );
  const tab = plain(
    renderToStaticMarkup(
      createElement(CaptureNightsPart, {
        body: planNightsBody({ missing: [2] }),
        locale: "fr",
        initialTab: "night-10",
        fetcher: async () => ({ ok: false }),
      }),
    ),
  );
  assert.ok(
    tab.includes(
      "RMS total 0,89″ RMS AD 0,64″ RMS Déc 0,63″ Poses gardées 89 sur 90",
    ),
    tab,
  );
  assert.ok(tab.includes("Ouvrir la session du 10–11 août →"));
  assert.ok(tab.includes("2 nuits sur 3"));
  // A capture of one night: no tab.
  const one = planNightsBody();
  one.nights = one.nights.slice(1, 2);
  const single = renderToStaticMarkup(
    createElement(CaptureNightsPart, {
      body: one,
      locale: "fr",
      fetcher: async () => ({ ok: false }),
    }),
  );
  assert.ok(!single.includes('role="tab"'));
  assert.ok(plain(single).includes("1 nuit"));
});

test("« 1 nuit sur 3 », « 2 nuits sur 3 »: the French words agree with their number", () => {
  assert.equal(
    sayCounted("fr", "captureNightsAnalysed", 1, { analysed: 1, count: 3 }),
    "1 nuit sur 3",
  );
  assert.equal(
    sayCounted("fr", "captureNightsAnalysed", 2, { analysed: 2, count: 3 }),
    "2 nuits sur 3",
  );
  assert.equal(
    sayCounted("fr", "captureNightsPoses", 1, { kept: "1", total: "324" }),
    "1 pose gardée sur 324",
  );
  assert.equal(
    sayCounted("en", "captureNightsAnalysed", 1, { analysed: 1, count: 3 }),
    "1 of 3 nights",
  );
});

test("the new words are in the ten catalogues, with the same placeholders", () => {
  const keys = Object.keys(messages.fr).filter((key) =>
    /^(sessionGuiding|sessionPoses|captureNights|sessionChartHours|sessionPageDetailsQualityOnly)/.test(
      key,
    ),
  );
  assert.ok(keys.length >= 95, `${keys.length}`);
  // The names a text fills, a plural's own number included (« {kept,
  // plural, … {total} … } »), each once.
  const holes = (value) => [
    ...new Set(
      [...String(value).matchAll(/\{(\w+)[},]/g)].map((m) => m[1]).sort(),
    ),
  ];
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

test("the fixture of the night is a report v3 the service accepts (schema and trace checks)", async () => {
  const { reportSchemaErrors } =
    await import("../dist/api/session-analysis-report-schema.js");
  const { traceError } =
    await import("../dist/api/session-analysis-resources.js");
  const report = guidingNightReport();
  assert.deepEqual(await reportSchemaErrors(report), []);
  assert.equal(traceError(report), null);
});

test("the smoothed curve: a 30 s mean over the whole night, the raw one faint under it, the raw one alone under an hour", async () => {
  const runs = [
    [0, 0, 3, 0, 0].map((value, index) => ({ at: index * 10_000, value })),
  ];
  const smooth = smoothRuns(runs, 10);
  assert.deepEqual(
    smooth[0].map((point) => point.value),
    [0, 1, 1, 1, 0],
    "a lone spike keeps a third of its height on three points",
  );
  assert.deepEqual(
    smooth[0].map((point) => point.at),
    runs[0].map((point) => point.at),
  );
  assert.equal(
    smoothRuns(runs, 60),
    runs,
    "a window of one point is the raw curve",
  );
  assert.ok(smoothingApplies({ from: 0, to: 3_600_001 }));
  assert.ok(!smoothingApplies({ from: 0, to: 3_600_000 }));
  const report = guidingNightReport();
  const html = await guiding({
    guidingTrace: guidingTraceOf(report),
    summary: guidingSummary(report),
    report,
  });
  assert.match(html, /data-smoothed="true"/);
  assert.ok(count(html, /session-guiding-line is-ra is-faint/g) > 10);
  assert.ok(count(html, /session-guiding-line is-ra is-smooth/g) > 10);
  assert.ok(plain(html).includes("lissé 30 s"));
  const { GuidingTraceChart } = await loadJsxModule(
    "components/sessions/SessionGuiding.js",
  );
  const trace = traceOf(guidingTraceOf(report));
  const zoomed = renderToStaticMarkup(
    createElement(GuidingTraceChart, {
      locale: "fr",
      trace,
      markers: [],
      window: { from: trace.from, to: trace.from + 30 * 60_000 },
      zone: ZONE,
      initialWidth: 1000,
    }),
  );
  assert.match(zoomed, /data-smoothed="false"/);
  assert.ok(!zoomed.includes("is-faint") && !zoomed.includes("is-smooth"));
});

test("the labels of the events: the second one goes down a line, the third is hidden, a narrow pause has none, close narrow ones make one", () => {
  const plan = placeLabels(
    [
      { key: "a", from: 100, to: 200 },
      { key: "b", from: 150, to: 250 },
      { key: "c", from: 160, to: 260 },
      { key: "d", from: 400, to: 480 },
    ],
    { lines: 2 },
  );
  assert.deepEqual(
    plan.placed.map((label) => [label.key, label.line]),
    [
      ["a", 0],
      ["b", 1],
      ["d", 0],
    ],
  );
  assert.deepEqual(
    plan.hidden.map((label) => label.key),
    ["c"],
  );
  assert.equal(plan.lines, 2);
  assert.equal(placeLabels([], {}).lines, 0);
  const minute = 60_000;
  // 2 px per minute: only a pause of 40 minutes or more carries its text.
  const labels = pauseLabels(
    [
      { from: 0, to: 60 * minute },
      { from: 200 * minute, to: 202 * minute },
      { from: 210 * minute, to: 213 * minute },
      { from: 220 * minute, to: 224 * minute },
      { from: 600 * minute, to: 603 * minute },
    ],
    {
      toX: (t) => (2 * t) / minute,
      textOf: (minutes) => `pause ${minutes} min`,
      groupText: (count, minutes) => `${count} pauses · ${minutes} min`,
    },
  );
  assert.deepEqual(
    labels.map((label) => [label.kind, label.text]),
    [
      ["pause", "pause 60 min"],
      ["group", "3 pauses · 9 min"],
    ],
  );
  assert.equal(labels[1].pauses.length, 3);
});

test("« Guidage » writes the flip once, labels in at most two lines, none over the other", async () => {
  const report = guidingNightReport();
  const html = await guiding({
    guidingTrace: guidingTraceOf(report),
    summary: guidingSummary(report),
    report,
  });
  assert.equal(count(html, /data-label="flip"/g), 1);
  const { placed } = (() => {
    const found = [
      ...html.matchAll(
        /<text class="session-guiding-event[^"]*" x="([\d.]+)" y="([\d.]+)" text-anchor="(\w+)"[^>]*>(?:<title>[^<]*<\/title>)?([^<]*)</g,
      ),
    ].map(([, at, y, anchor, label]) => {
      const w = Math.ceil(label.length * 5.8) + 4;
      const x = Number(at);
      const from =
        anchor === "end" ? x - w : anchor === "middle" ? x - w / 2 : x;
      return { y, from, to: from + w };
    });
    return { placed: found };
  })();
  for (const a of placed)
    for (const b of placed)
      if (a !== b && a.y === b.y)
        assert.ok(a.to <= b.from || b.to <= a.from, "same line, no overlap");
});
