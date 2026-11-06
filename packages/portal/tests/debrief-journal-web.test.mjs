import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { messages } from "../dist/i18n.js";
import {
  figureText,
  frozenShooting,
  measuredShootingText,
  plannedShootingText,
  prefilledShooting,
} from "../dist/components/sessions/acquisition-figures.js";
import {
  initialMomentRows,
  momentRowsToDecision,
  takePlanned,
} from "../dist/components/sessions/debrief-moment.js";
import { buildDebriefDecisionBody } from "../dist/components/sessions/debrief-decision.js";
import { sessionCards } from "../dist/components/sessions/session-page-model.js";
import { cardLines } from "../dist/components/sessions/session-page-view.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// « Prise de vue par cible »: the debriefing form starts with the planned
// frames and exposure of each target (the lines the launch froze), the request
// sends the exposure next to the frames, and the page of a session writes
// « Prévu » against « Mesuré (Astro Sync) » or « Déclaré ».

const NBSP = " ";
const plain = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t\n]+/g, " ")
    .trim();

const frozenLine = {
  filter: "L",
  exposureSeconds: 120,
  gain: 100,
  binning: 1,
  frameCount: 28,
};
const items = [
  {
    id: "m31",
    targetId: "m31",
    startMinute: 0,
    endMinute: 120,
    target: { title: "M 31" },
  },
  {
    id: "m42",
    targetId: "m42",
    startMinute: 120,
    endMinute: 200,
    target: { title: "M 42" },
  },
];
const launched = [
  {
    planItemId: "m31",
    targetId: "m31",
    startMinute: 0,
    endMinute: 120,
    acquisition: { lines: [frozenLine] },
    ruleVersion: "expo-b-1",
  },
  // The second item was launched without frozen lines (an old launch).
  { planItemId: "m42", targetId: "m42", startMinute: 120, endMinute: 200 },
];
const payload = {
  name: "Nuit au col",
  date: "2026-10-10",
  location: { name: "Col des Mélèzes" },
  items,
  launchedSchedule: launched,
};

test("the frozen lines of a plan: found per item, nothing for an old launch, a free execution or a visual night", () => {
  assert.deepEqual(frozenShooting(payload, "m31"), {
    ruleVersion: "expo-b-1",
    lines: [{ filter: "L", exposureSeconds: 120, gain: 100, frameCount: 28 }],
  });
  assert.equal(frozenShooting(payload, "m42"), null);
  assert.equal(
    frozenShooting({ ...payload, launchedSchedule: [] }, "m31"),
    null,
  );
  assert.equal(
    frozenShooting({ ...payload, blankExecution: true }, "m31"),
    null,
  );
  assert.equal(
    frozenShooting({ ...payload, equipment: { mode: "visual" } }, "m31"),
    null,
  );
});

test("the planned frames and exposure are computed; a line that adds up, a mixed exposure stays empty", () => {
  assert.deepEqual(prefilledShooting(frozenShooting(payload, "m31")), {
    frames: "28",
    exposure: "120",
  });
  assert.deepEqual(prefilledShooting(null), { frames: "", exposure: "" });
  assert.deepEqual(
    prefilledShooting({
      lines: [
        { exposureSeconds: 60, frameCount: 10 },
        { exposureSeconds: 180, frameCount: 5 },
      ],
    }),
    { frames: "15", exposure: "" },
  );
  assert.deepEqual(
    prefilledShooting({ lines: [{ exposureSeconds: 0.5, frameCount: null }] }),
    { frames: "", exposure: "0.5" },
  );
  const rows = initialMomentRows({
    items,
    nightStartAt: "2026-10-10T19:00:00.000Z",
    shooting: {
      m31: prefilledShooting(frozenShooting(payload, "m31")),
      m42: prefilledShooting(frozenShooting(payload, "m42")),
    },
  });
  // They are a proposal; the fields themselves start empty.
  assert.deepEqual(
    rows.map((row) => [row.itemId, row.frames, row.exposure]),
    [
      ["m31", "", ""],
      ["m42", "", ""],
    ],
  );
  assert.deepEqual(
    rows.map((row) => row.proposed),
    [
      { frames: "28", exposure: "120" },
      { frames: "", exposure: "" },
    ],
  );
  // Without the freezing the fields are empty.
  assert.deepEqual(
    initialMomentRows({ items, nightStartAt: "2026-10-10T19:00:00.000Z" }).map(
      (row) => [row.frames, row.exposure],
    ),
    [
      ["", ""],
      ["", ""],
    ],
  );
});

test("the request sends the exposure next to the frames, as the person said them; the untouched proposal and a skipped target send neither", () => {
  const rows = initialMomentRows({
    items,
    nightStartAt: "2026-10-10T19:00:00.000Z",
    shooting: { m31: { frames: "28", exposure: "120" } },
  });
  const send = (edit) => {
    const edited = rows.map((row) =>
      row.itemId === "m31" ? { ...row, ...edit } : row,
    );
    const { targetRows, addedRows } = momentRowsToDecision(edited);
    return buildDebriefDecisionBody({
      outcome: "partial",
      targetRows,
      addedRows,
    }).sessionAdjustments.targets.find((entry) => entry.targetId === "m31");
  };
  // Debriefed without editing, nothing is declared.
  const untouched = send({});
  assert.equal("frameCount" in untouched, false);
  assert.equal("exposureSeconds" in untouched, false);
  // Taken as planned, it is declared.
  const taken = send(takePlanned(rows[0]));
  assert.deepEqual([taken.frameCount, taken.exposureSeconds], [28, 120]);
  const corrected = send({ frames: "26", exposure: "180" });
  assert.deepEqual(
    [corrected.frameCount, corrected.exposureSeconds],
    [26, 180],
  );
  assert.equal(send({ exposure: "1,5" }).exposureSeconds, 1.5);
  // An empty or impossible exposure is not sent.
  for (const exposure of ["", "0", "-3", "abc", "90000"])
    assert.equal("exposureSeconds" in send({ exposure }), false, exposure);
  const skipped = send({ result: "skipped", reason: "weather" });
  assert.equal("exposureSeconds" in skipped, false);
  assert.equal("frameCount" in skipped, false);
});

test("the debriefing page shows « Prévu … » per target and proposes it in the fields; an old launch shows neither", async () => {
  await registerJsx();
  const { DebriefScreen } =
    await import("portal/components/sessions/DebriefScreen.js");
  const render = (planPayload) =>
    renderToStaticMarkup(
      createElement(DebriefScreen, {
        locale: "fr",
        planId: "plan-1",
        plan: { id: "plan-1", status: "active", payload: planPayload },
        queueEntry: {
          nightStartAt: "2026-10-10T19:00:00.000Z",
          nightEndAt: "2026-10-11T04:00:00.000Z",
          staleDevices: [],
        },
        TargetsPicker: () => null,
      }),
    );
  const html = render(payload);
  const text = plain(html).replaceAll(NBSP, " ");
  assert.ok(
    text.includes("Prévu 28 × 120 s · gain 100 · L"),
    `the planned line is missing:\n${text}`,
  );
  // The M 42 item was launched without frozen lines: one « Prévu » line only.
  assert.equal(text.split("Prévu 28 ×").length - 1, 1);
  const fields = [...html.matchAll(/<input[^>]*type="number"[^>]*>/g)].map(
    (match) => match[0],
  );
  // The planned values are a hint, not a value.
  assert.ok(
    fields.some((field) => /placeholder="28"/.test(field)),
    "frames",
  );
  assert.ok(
    fields.some((field) => /placeholder="120"/.test(field)),
    "exposure",
  );
  assert.ok(!fields.some((field) => /value="(28|120)"/.test(field)));
  assert.ok(text.includes("pas encore déclaré"), "the proposal is marked");
  assert.ok(html.includes("Reprendre le prévu"), "the button");
  assert.ok(
    fields.some((field) => /aria-label="Pose \(s\)"/.test(field)),
    "an exposure field",
  );
  // A plan launched before the freezing: as today, nothing planned, empty.
  const old = render({ ...payload, launchedSchedule: [] });
  assert.ok(!plain(old).includes("× 120 s"));
  assert.ok(!/value="28"/.test(old));
  // A night at the eyepiece asks for no exposure.
  const visual = render({ ...payload, equipment: { mode: "visual" } });
  assert.ok(!/aria-label="Pose \(s\)"/.test(visual));
});

const target = (fields) => ({
  targetId: "m31",
  label: "M 31",
  planItemId: "m31",
  state: "planned",
  outcome: "done",
  reason: null,
  plannedSeconds: 7200,
  acquiredSeconds: 7200,
  frameCount: 27,
  filter: "L",
  exposureSeconds: 120,
  exposureFamilies: 1,
  ...fields,
});
const planned = {
  ruleVersion: "expo-b-1",
  lines: [{ filter: "L", exposureSeconds: 120, gain: 100, frameCount: 28 }],
};
const linesOf = (fields, locale = "fr") => {
  const [card] = sessionCards({ targets: [target(fields)] });
  return cardLines(card, locale, "UTC");
};

test("the page of a session writes « Prévu » against « Mesuré (Astro Sync) », else « Déclaré »", () => {
  const measured = linesOf({
    planned,
    measured: {
      source: "astro-sync",
      lines: [{ filter: "L", exposureSeconds: 120, gain: 100, frameCount: 27 }],
    },
  });
  assert.equal(measured.plannedShooting, "Prévu 28 × 120 s · gain 100 · L");
  assert.equal(
    measured.measuredShooting,
    "Mesuré (Astro Sync) 27 × 120 s · gain 100 · L",
  );
  // The measured line says the frames: the older « 27 × 120 s · L » is not repeated.
  assert.equal(measured.frames, null);

  const declared = linesOf({
    planned,
    measured: {
      source: "declared",
      lines: [
        { filter: null, exposureSeconds: 120, gain: null, frameCount: 26 },
      ],
    },
  });
  assert.equal(declared.plannedShooting, "Prévu 28 × 120 s · gain 100 · L");
  assert.equal(declared.measuredShooting, "Déclaré 26 × 120 s");

  // A plan launched before the freezing: the measured lines alone.
  const old = linesOf({
    measured: {
      source: "astro-sync",
      lines: [{ filter: "L", exposureSeconds: 120, gain: 100, frameCount: 27 }],
    },
  });
  assert.equal(old.plannedShooting, null);
  assert.match(old.measuredShooting, /^Mesuré \(Astro Sync\) 27 × 120 s/);
  // Nothing at all: the lines of today.
  const bare = linesOf({});
  assert.deepEqual([bare.plannedShooting, bare.measuredShooting], [null, null]);
  assert.match(bare.frames, /^27 × 120 s/);
  // A night at the eyepiece takes no frames.
  const [card] = sessionCards({
    targets: [
      target({
        planned,
        measured: {
          source: "declared",
          lines: [
            { filter: null, exposureSeconds: 120, gain: null, frameCount: 26 },
          ],
        },
      }),
    ],
  });
  const visual = cardLines(card, "fr", "UTC", { visual: true });
  assert.deepEqual(
    [visual.plannedShooting, visual.measuredShooting],
    [null, null],
  );
  // A free execution promised nothing.
  const [free] = sessionCards({
    targets: [target({ planned })],
    unpromised: true,
  });
  assert.equal(free.plannedShooting, null);
});

test("a figure line: the gain and the filter the plan chose are said even when they are the device's; a measured line says only what it measured", () => {
  const line = {
    filter: null,
    exposureSeconds: 120,
    gain: null,
    frameCount: 28,
  };
  assert.equal(
    plannedShootingText({ lines: [line] }, "fr"),
    "Prévu 28 × 120 s · gain de l’appareil · sans filtre",
  );
  assert.equal(
    measuredShootingText({ source: "declared", lines: [line] }, "fr"),
    "Déclaré 28 × 120 s",
  );
  assert.equal(
    measuredShootingText({ source: "astro-sync", lines: [line] }, "en"),
    "Measured (Astro Sync) 28 × 120 s · no filter",
  );
  assert.equal(measuredShootingText(null, "en"), null);
  assert.equal(plannedShootingText({ lines: [] }, "en"), null);
  assert.equal(
    figureText({ exposureSeconds: 0.003, frameCount: 300 }, "en"),
    "300 × 3 ms",
  );
  assert.equal(figureText({ exposureSeconds: 0.003 }, "en"), "3 ms");
  assert.equal(figureText({ exposureSeconds: 1 / 250 }, "en"), "1/250 s");
  assert.equal(figureText({ frameCount: 12 }, "en"), "12 frames");
  assert.equal(figureText({ frameCount: 1 }, "en"), "1 frame");
  // Several lines (a mono camera): one text, the lines joined by « + ».
  assert.equal(
    plannedShootingText(
      {
        lines: [
          { filter: "L", exposureSeconds: 60, gain: 100, frameCount: 10 },
          { filter: "Ha", exposureSeconds: 300, gain: 100, frameCount: 4 },
        ],
      },
      "fr",
    ),
    "Prévu 10 × 60 s · gain 100 · L + 4 × 300 s · gain 100 · Ha",
  );
});
