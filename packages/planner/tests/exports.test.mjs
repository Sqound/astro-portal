import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { message, messages } from "portal/i18n.js";
import { planCalendarIcs } from "portal/planner/export.js";
import {
  acquisitionExportWords,
  acquisitionLineText,
  acquisitionTextByItem,
  exportAcquisitionByItem,
  exportAcquisitionContext,
} from "planner/acquisition-export.js";
import {
  asiairCopyLines,
  planAsiairCsv,
  planExportFilename,
  planNinaCsv,
  planNinaTargetSet,
} from "planner/export.js";
import { printablePlanSheet } from "planner/printable.js";

// "Prise de vue par cible": what the exports carry. The cases both platforms
// replay are the fixtures `export-acquisition-by-item`, `nina-target-set`,
// `asiair-copy-lines` and `ics-export`; these tests pin the words, the files
// and what did not change.

const target = (id, designation, title, ra, dec, typeKey) => ({
  id,
  designation,
  title,
  coordinate: { ra, dec },
  skyTarget: { typeKey },
});
const context = {
  mode: "imaging",
  equipment: {
    deviceKind: "dedicated",
    sensorKind: "colour",
    pixelSizeUm: 2.9,
    focalLengthMm: 250,
    apertureMm: 50,
    unityGain: null,
    hcgGain: 100,
    maxExposureSeconds: null,
    mountKind: null,
  },
  filters: [
    { name: "UV/IR-cut", family: "broadband" },
    { name: "Duo-band", family: "dual" },
  ],
  sky: { sqm: 21 },
  moon: { illumination: 10 },
};
const plan = {
  id: "plan-1",
  date: "2026-10-21",
  name: "Autumn nebulae",
  equipment: { mode: "imaging" },
  items: [
    {
      id: "m31",
      filter: "L",
      startMinute: 0,
      endMinute: 120,
      target: target(
        "m31",
        "M 31",
        "M 31 — Andromeda Galaxy",
        10.684708,
        41.26875,
        "Galaxy",
      ),
    },
    {
      id: "ngc7000",
      startMinute: 120,
      endMinute: 200,
      acquisition: {
        lines: [
          {
            filter: "Duo-band",
            exposureSeconds: 300,
            gain: 100,
            frameCount: 16,
          },
        ],
      },
      target: target(
        "ngc7000",
        "NGC 7000",
        "NGC 7000 — North America Nebula",
        314.75,
        44.333333,
        "Emission nebula",
      ),
    },
    {
      id: "m45",
      startMinute: 200,
      endMinute: 260,
      target: target(
        "m45",
        "M 45",
        "M 45 — Pleiades",
        56.75,
        24.116667,
        "Open cluster",
      ),
    },
  ],
};
const night = {
  start: "2026-10-21T19:00:00.000Z",
  end: "2026-10-22T03:00:00.000Z",
};
const cards = plan.items.map((item) => ({ target: item.target }));

test("the line reads « 120 s · gain 100 · UV/IR-cut · ≈ 28 poses » in the words of each language", () => {
  const line = {
    filter: "UV/IR-cut",
    noFilter: false,
    exposureSeconds: 120,
    gain: 100,
    gainDevice: false,
    binning: null,
    frameCount: 28,
    approximate: true,
    suggested: false,
  };
  const written = (locale, over = {}) =>
    acquisitionLineText(
      { ...line, ...over },
      acquisitionExportWords(locale, message),
    );
  assert.equal(written("en"), "120 s · gain 100 · UV/IR-cut · ≈ 28 frames");
  assert.equal(
    written("fr", { approximate: false, suggested: true }),
    "120 s · gain 100 · UV/IR-cut · 28 poses · suggéré",
  );
  assert.equal(written("ja"), "120 s · ゲイン 100 · UV/IR-cut · ≈ 28枚");
  assert.equal(
    written("ru", { frameCount: 2 }),
    "120 s · усиление 100 · UV/IR-cut · ≈ 2 кадра",
  );
  assert.equal(written("ru", { frameCount: 5 }).endsWith("≈ 5 кадров"), true);
  assert.equal(written("fr", { frameCount: 1 }).endsWith("≈ 1 pose"), true);
  assert.equal(written("fr", { frameCount: 0 }).endsWith("≈ 0 poses"), true);
  // Units under the second, a gain left to the device, no filter.
  assert.equal(
    written("fr", {
      exposureSeconds: 1 / 250,
      gain: null,
      gainDevice: true,
      filter: null,
      noFilter: true,
      frameCount: null,
    }),
    "1/250 s · gain de l’appareil · sans filtre",
  );
  assert.equal(
    written("en", { exposureSeconds: 0.0035, gain: null, frameCount: null }),
    "3.5 ms · UV/IR-cut",
  );
  assert.equal(
    written("fr", { exposureSeconds: 1.5, frameCount: null }),
    "1,5 s · gain 100 · UV/IR-cut",
  );
});

test("every export word exists in the ten languages", () => {
  for (const locale of Object.keys(messages)) {
    const words = acquisitionExportWords(locale, message);
    for (const text of [
      words.seconds("1"),
      words.milliseconds("1"),
      words.gain("1"),
      words.gainDevice,
      words.noFilter,
      words.suggested,
      words.frames(3, true),
      words.frames(1, false),
    ])
      assert.ok(text && !text.startsWith("expoE"), `${locale} ${text}`);
  }
});

test("the calendar carries each target's line in its description; a target without one keeps its filter", () => {
  const byItem = exportAcquisitionByItem(plan, { context });
  const text = acquisitionTextByItem(
    byItem,
    acquisitionExportWords("fr", message),
  );
  assert.match(
    text.m31,
    /^\d+ s · gain 100 · UV\/IR-cut · ≈ \d+ poses · suggéré$/,
  );
  assert.equal(text.ngc7000, "300 s · gain 100 · Duo-band · 16 poses");
  const ics = planCalendarIcs({
    plan,
    night,
    targets: cards,
    now: new Date("2026-10-21T10:00:00Z"),
    locale: "fr",
    acquisitionText: text,
  });
  const description = ics
    .split("\r\n")
    .find((line) => line.startsWith("DESCRIPTION:M 31"));
  assert.ok(
    description.includes(
      `M 31 — Andromeda Galaxy · ${text.m31.replaceAll(",", "\\,")}`,
    ),
  );
  assert.ok(description.includes("NGC 7000 — North America Nebula · 300 s"));
  // Without the lines the calendar is what it was: the item's filter.
  const before = planCalendarIcs({
    plan,
    night,
    targets: cards,
    now: new Date("2026-10-21T10:00:00Z"),
    locale: "fr",
  });
  assert.match(before, /DESCRIPTION:M 31 — Andromeda Galaxy · L/);
});

test("a launched plan writes the frozen line, never the rule's", () => {
  const launched = {
    ...plan,
    launchedSchedule: [
      {
        planItemId: "m31",
        startMinute: 0,
        endMinute: 120,
        ruleVersion: "expo-b-1",
        acquisition: {
          lines: [
            { filter: "L", exposureSeconds: 60, gain: 80, frameCount: 99 },
          ],
        },
      },
    ],
  };
  const byItem = exportAcquisitionByItem(launched, { context });
  assert.equal(byItem.m31.frozen, true);
  assert.equal(
    acquisitionTextByItem(byItem, acquisitionExportWords("en", message)).m31,
    "60 s · gain 80 · L · 99 frames",
  );
  // The context may change afterwards: the frozen line does not.
  const other = exportAcquisitionByItem(launched, {
    context: { ...context, sky: { sqm: 18 }, moon: { illumination: 95 } },
  });
  assert.deepEqual(other.m31, byItem.m31);
});

test("visual mode has no line and every export is as it was", () => {
  const visual = { ...plan, equipment: { mode: "visual" } };
  assert.deepEqual(
    exportAcquisitionByItem(visual, {
      context: { ...context, mode: undefined },
    }),
    {},
  );
  assert.deepEqual(exportAcquisitionContext({ plan: visual }).mode, "visual");
  assert.equal(
    planCalendarIcs({ plan: visual, night, targets: cards, now: night.start }),
    planCalendarIcs({
      plan: visual,
      night,
      targets: cards,
      now: night.start,
      acquisitionText: {},
    }),
  );
  assert.deepEqual(
    printablePlanSheet({ plan: visual, night: { ...night, cards: [] } })
      ?.entries,
    [],
  );
});

test("the ASIAIR CSV is byte for byte what it was; the help gets the line to copy", () => {
  const simple = {
    items: [
      { id: "m31", startMinute: 0, target: plan.items[0].target },
      { id: "ngc7000", startMinute: 120, target: plan.items[1].target },
      { id: "m45", startMinute: 200, target: plan.items[2].target },
    ],
  };
  const expectedAsiair =
    'Plan,RA,DEC\r\nM 31,0h 42m 44s,"+41° 16\' 8"""\r\nNGC 7000,20h 59m 0s,"+44° 20\' 0"""\r\nM 45,3h 47m 0s,"+24° 7\' 0"""\r\n';
  assert.equal(planAsiairCsv({ plan: simple }).content, expectedAsiair);
  assert.equal(
    planNinaCsv({ plan: simple }).content,
    "Pane,RA,DEC,Position Angle (East)\r\nM 31,00:42:44.3,+41:16:07.5,0.00\r\nNGC 7000,20:59:00.0,+44:20:00.0,0.00\r\nM 45,03:47:00.0,+24:07:00.0,0.00\r\n",
  );
  const text = acquisitionTextByItem(
    exportAcquisitionByItem(plan, { context }),
    acquisitionExportWords("fr", message),
  );
  const lines = asiairCopyLines({
    plan: simple,
    acquisitionText: text,
  });
  assert.deepEqual(
    lines.map((entry) => entry.name),
    ["M 31", "NGC 7000", "M 45"],
  );
  assert.equal(
    `${lines[1].name} · ${lines[1].line}`,
    "NGC 7000 · 300 s · gain 100 · Duo-band · 16 poses",
  );
  // A target with no line is left out of the help.
  assert.deepEqual(
    asiairCopyLines({ plan: simple, acquisitionText: { m45: "x" } }),
    [{ name: "M 45", line: "x" }],
  );
});

test("the printable sheet carries the line of each target", () => {
  const sheet = printablePlanSheet({
    plan,
    night: {
      ...night,
      moonIllumination: 10,
      cards: plan.items.map((item) => ({
        target: item.target,
        usableStart: night.start,
        usableEnd: night.end,
        best: { time: night.start },
        maxAltitude: 60,
        direction: "S",
      })),
    },
    acquisitionText: { ngc7000: "300 s · gain 100 · Duo-band · 16 poses" },
  });
  const byId = Object.fromEntries(
    sheet.entries.map((entry) => [entry.id, entry]),
  );
  assert.equal(
    byId.ngc7000.acquisition,
    "300 s · gain 100 · Duo-band · 16 poses",
  );
  assert.equal("acquisition" in byId.m31, false);
});

// ------------------------------------------------------------ .ninaTargetSet

const goldenPlan = {
  items: [
    { id: "m31", startMinute: 0, target: plan.items[0].target },
    { id: "ngc7000", startMinute: 120, target: plan.items[1].target },
    { id: "m45", startMinute: 200, target: plan.items[2].target },
  ],
};
const line = (over) => ({
  filter: null,
  noFilter: false,
  exposureSeconds: null,
  gain: null,
  gainDevice: false,
  binning: null,
  frameCount: null,
  approximate: true,
  suggested: false,
  ...over,
});
const goldenAcquisition = {
  m31: {
    frozen: false,
    lines: [
      line({
        filter: "UV/IR-cut",
        exposureSeconds: 120,
        gain: 100,
        frameCount: 28,
        suggested: true,
      }),
    ],
  },
  ngc7000: {
    frozen: false,
    lines: [
      line({
        filter: "Duo-band",
        exposureSeconds: 300,
        gain: 100,
        binning: 2,
        frameCount: 16,
        approximate: false,
      }),
    ],
  },
  m45: {
    frozen: true,
    lines: [
      line({
        noFilter: true,
        gainDevice: true,
        exposureSeconds: 60,
        frameCount: 58,
        approximate: false,
      }),
    ],
  },
};

// A well-formed check without a parser: every start tag meets its end tag.
function assertBalanced(xml) {
  const stack = [];
  for (const match of xml.matchAll(/<(\/?)([A-Za-z]+)([^>]*?)(\/?)>/g)) {
    const [, closing, name, , selfClosing] = match;
    if (selfClosing) continue;
    if (closing) assert.equal(stack.pop(), name, `closing ${name}`);
    else stack.push(name);
  }
  assert.deepEqual(stack, []);
}

test("the .ninaTargetSet of a three-target plan is the golden file", () => {
  const result = planNinaTargetSet({
    plan: goldenPlan,
    acquisition: goldenAcquisition,
  });
  const golden = readFileSync(
    new URL("./golden/three-targets.ninaTargetSet", import.meta.url),
    "utf8",
  );
  assert.equal(result.content, golden);
  assert.equal(result.exportedCount, 3);
  assert.equal(result.captureLineCount, 3);
  assertBalanced(result.content);
});

test("the .ninaTargetSet has N.I.N.A.'s structure and invents nothing", () => {
  const { content } = planNinaTargetSet({
    plan: goldenPlan,
    acquisition: goldenAcquisition,
  });
  assert.ok(content.startsWith('<?xml version="1.0" encoding="utf-8"?>\n'));
  assert.ok(content.endsWith("</ArrayOfCaptureSequenceList>\n"));
  assert.ok(!content.includes("\r"));
  assert.ok(!content.startsWith("﻿"));
  assert.equal(content.match(/<CaptureSequenceList /g).length, 3);
  // A frame count and an exposure are both needed for a capture line.
  const partial = planNinaTargetSet({
    plan: goldenPlan,
    acquisition: {
      m31: { frozen: false, lines: [line({ exposureSeconds: 120 })] },
      ngc7000: { frozen: false, lines: [line({ frameCount: 10 })] },
    },
  });
  assert.equal(partial.captureLineCount, 0);
  assert.equal(partial.exportedCount, 3);
  // The order of the night, not of the plan's list.
  const reversed = planNinaTargetSet({
    plan: { items: [...goldenPlan.items].reverse() },
    acquisition: goldenAcquisition,
  });
  assert.equal(
    reversed.content,
    planNinaTargetSet({ plan: goldenPlan, acquisition: goldenAcquisition })
      .content,
  );
  assert.equal(
    planExportFilename({ name: "Autumn", date: "2026-10-21" }, "ninaTargetSet"),
    "autumn-2026-10-21-nina.ninaTargetSet",
  );
});

// ------------------------------------------------------------- the web page

const page = readFileSync(
  new URL("../src/components/PlannerPage.js", import.meta.url),
  "utf8",
);
const builtPage = readFileSync(
  new URL("../dist/components/PlannerPage.js", import.meta.url),
  "utf8",
);

test("the plan's export dialog offers the target set after N.I.N.A.'s CSV, in photo mode only", () => {
  for (const text of [page, builtPage]) {
    const start = text.indexOf("function PlanExportDialog(");
    const dialog = text.slice(start, text.indexOf("\nfunction ", start + 30));
    const order = [
      '"plannerExportNinaTitle"',
      '"expoENinaSetTitle"',
      '"plannerExportPortalTitle"',
    ].map((key) => dialog.indexOf(key));
    assert.ok(order.every((index) => index > 0));
    assert.deepEqual(
      order,
      [...order].sort((a, b) => a - b),
    );
    assert.match(dialog, /acquisition\?\.available &&/);
    assert.match(dialog, /"expoEAsiairHelp"/);
    assert.match(dialog, /"plannerExportAsiairHelp"/);
    assert.match(dialog, /"expoENinaSetHelp"/);
  }
});

test("the page writes the lines into the calendar, the printed sheet and the target set", () => {
  for (const text of [page, builtPage]) {
    assert.match(
      text,
      /acquisitionText: exportAcquisitionFor\(plan, context\)\.text/,
    );
    assert.match(text, /planNinaTargetSet\(\{/);
    assert.match(text, /planExportFilename\(plan, "ninaTargetSet"\)/);
    assert.match(text, /acquisitionText=\{printableAcquisitionText\}/);
    assert.match(text, /"expoEPrintAcquisition"/);
  }
});

test("the new texts exist in the ten languages and say the target set is to check on import", () => {
  const keys = [
    "expoEAsiairLine",
    "expoEAsiairHelp",
    "expoENinaSetTitle",
    "expoENinaSetLine",
    "expoENinaSetHelp",
    "expoENinaSetExported",
    "expoEPrintAcquisition",
    "expoESeconds",
    "expoEFramesOne",
    "expoEFramesFew",
    "expoEFramesMany",
    "expoEFramesOther",
  ];
  for (const locale of Object.keys(messages))
    for (const key of keys)
      assert.ok(messages[locale][key], `${locale} ${key}`);
  assert.match(
    message("fr", "expoENinaSetHelp"),
    /Format N\.I\.N\.A\. 3\.x, à vérifier à l’import/,
  );
  assert.doesNotMatch(
    message("fr", "expoENinaSetHelp"),
    /testé avec N\.I\.N\.A\./,
  );
});
