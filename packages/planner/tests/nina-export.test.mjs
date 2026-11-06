import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { localeKeyGaps, message, messages } from "portal/i18n.js";
import {
  framingNinaCsv,
  ninaDeclination,
  ninaPositionAngle,
  ninaRightAscension,
  planAsiairCsv,
  planExportFilename,
  planNinaCsv,
} from "planner/export.js";

// The N.I.N.A. target list. These tests pin what the file is, byte by byte.

const plan = {
  name: "Autumn nebulae",
  date: "2026-09-15",
  items: [
    {
      id: "m31",
      startMinute: 60,
      target: {
        id: "m31",
        designation: "M31",
        coordinate: { ra: 10.684708, dec: 41.26875 },
      },
    },
    {
      id: "ngc7000",
      startMinute: 0,
      target: {
        id: "ngc7000",
        designation: "NGC 7000",
        coordinate: { ra: 314.75, dec: 44.333333 },
      },
    },
  ],
};

test("the N.I.N.A. list has the four columns of its import and no other", () => {
  const { content, exportedCount, skippedTargets } = planNinaCsv({ plan });
  const [header, ...rows] = content.split("\r\n");
  assert.equal(header, "Pane,RA,DEC,Position Angle (East)");
  assert.doesNotMatch(content, /Right Ascension|Center|Width|Overlap/);
  assert.equal(exportedCount, 2);
  assert.deepEqual(skippedTargets, []);
  for (const row of rows.filter(Boolean))
    assert.equal(row.split(",").length, 4, row);
  assert.deepEqual(rows, [
    "NGC 7000,20:59:00.0,+44:20:00.0,0.00",
    "M31,00:42:44.3,+41:16:07.5,0.00",
    "",
  ]);
});

test("lines end in CRLF with a final line break, without a BOM", () => {
  const { content } = planNinaCsv({ plan });
  assert.ok(content.endsWith("0.00\r\n"));
  assert.equal(content.split("\n").length, content.split("\r\n").length);
  assert.notEqual(content.charCodeAt(0), 0xfeff);
  assert.equal(Buffer.from(content, "utf8")[0], "P".charCodeAt(0));
  // The same target list as ASIAIR, in the same order.
  assert.deepEqual(
    planAsiairCsv({ plan })
      .content.split("\r\n")
      .slice(1)
      .map((row) => row.split(",")[0]),
    content
      .split("\r\n")
      .slice(1)
      .map((row) => row.split(",")[0]),
  );
});

test("the plan's N.I.N.A. file is <plan>-<date>-nina.csv", () => {
  assert.equal(
    planExportFilename(plan, "nina"),
    "autumn-nebulae-2026-09-15-nina.csv",
  );
  assert.equal(
    planExportFilename(plan, "asiair"),
    "autumn-nebulae-2026-09-15-asiair.csv",
  );
});

test("coordinates and angle are written with a decimal point and carried roundings", () => {
  assert.equal(ninaRightAscension(359.99987), "00:00:00.0");
  assert.equal(ninaRightAscension(10.749833), "00:43:00.0");
  assert.equal(ninaDeclination(-0.5), "-00:30:00.0");
  assert.equal(ninaDeclination(41.999989), "+42:00:00.0");
  assert.equal(ninaDeclination(-90), "-90:00:00.0");
  assert.equal(ninaPositionAngle(-90), "270.00");
  assert.equal(ninaPositionAngle(undefined), "0.00");
  assert.equal(ninaPositionAngle(359.999), "0.00");
  assert.equal(ninaPositionAngle(12.346), "12.35");
});

test("a free-standing framing keeps its title as typed; without the mosaic extension its centre only", () => {
  const target = {
    id: "framing-7",
    source: "framing:framing-7",
    designation: "m 31, Andromède",
    title: "m 31, Andromède",
    coordinate: { ra: 10.684708, dec: 41.26875 },
    framing: {
      angleDegrees: -90,
      mosaic: {
        panes: [
          { index: 1, coordinate: { ra: 10.1, dec: 41.26875 } },
          { index: 2, coordinate: { ra: 11.3, dec: 41.26875 } },
        ],
      },
    },
  };
  assert.equal(
    framingNinaCsv(target).content,
    'Pane,RA,DEC,Position Angle (East)\r\n"m 31, Andromède",00:42:44.3,+41:16:07.5,270.00\r\n',
  );
  const panes = (paneTarget) =>
    paneTarget.framing.mosaic.panes.map((pane) => ({
      name: `${paneTarget.designation} P${pane.index}`,
      index: pane.index,
      coordinate: pane.coordinate,
    }));
  assert.deepEqual(
    framingNinaCsv(target, { expandTarget: panes })
      .content.split("\r\n")
      .slice(1, 3),
    [
      '"m 31, Andromède Panel 1",00:40:24.0,+41:16:07.5,270.00',
      '"m 31, Andromède Panel 2",00:45:12.0,+41:16:07.5,270.00',
    ],
  );
});

// The web's two dialogs, read in the page: the rendered ones are looked at
// in a browser (the phase's captures).
const page = readFileSync(
  new URL("../src/components/PlannerPage.js", import.meta.url),
  "utf8",
);
const dist = readFileSync(
  new URL("../dist/components/PlannerPage.js", import.meta.url),
  "utf8",
);

test("the plan's export dialog lists ASIAIR, then N.I.N.A., then the archive", () => {
  for (const text of [page, dist]) {
    const start = text.indexOf("function PlanExportDialog(");
    const dialog = text.slice(start, text.indexOf("function ", start + 30));
    const order = [
      "plannerExportAsiairTitle",
      "plannerExportNinaTitle",
      "plannerExportPortalTitle",
    ].map((key) => dialog.indexOf(`"${key}"`));
    assert.ok(
      order.every((index) => index > 0),
      "the three rows exist",
    );
    assert.deepEqual(
      order,
      [...order].sort((a, b) => a - b),
    );
    // One line each, the detail behind the ⓘ named "Détail du format".
    assert.match(dialog, /"plannerExportAsiairLine"/);
    assert.match(dialog, /"plannerExportNinaLine"/);
    assert.match(dialog, /"plannerExportNinaHelp"/);
    assert.doesNotMatch(
      dialog,
      /<span>\{message\(locale, "plannerExportAsiairHelp"/,
    );
  }
});

test("the N.I.N.A. export of a plan and of a framing goes through the mosaic point of ASIAIR", () => {
  assert.match(
    page,
    /planNinaCsv\(\{[^}]*expandTarget: plannerExtension\("planner.export.asiair"\)/,
  );
  assert.match(page, /planExportFilename\(plan, "nina"\)/);
  assert.match(
    page,
    /framingNinaCsv\(target, options\)/,
    "the framing writer takes the same point",
  );
  // "export" opens the dialog instead of downloading the ASIAIR file at once.
  assert.match(page, /case "export":[^}]*setExportFramingResource\(resource\)/);
  // A disabled row says why and has no ⓘ.
  const start = page.indexOf("function FramingExportDialog(");
  const dialog = page.slice(start, page.indexOf("function ", start + 30));
  assert.match(dialog, /disabled=\{!ninaReady\}/);
  assert.match(dialog, /\{ninaReady && \(\s*<ExportDetailButton/);
});

test("the texts of the export are in the ten languages, the ASIAIR help moved whole behind the ⓘ", () => {
  const keys = [
    "plannerExportAsiairLine",
    "plannerExportNinaTitle",
    "plannerExportNinaLine",
    "plannerExportNinaHelp",
    "plannerExportFormatDetail",
    "plannerNinaNoTargets",
    "plannerNinaExported",
    "plannerExportFramingTitle",
    "plannerExportFramingAsiairLine",
    "plannerExportFramingNinaLine",
    "plannerFramingAsiairNoCoordinate",
    "plannerFramingNinaNoCoordinate",
  ];
  for (const locale of Object.keys(messages))
    for (const key of keys)
      assert.ok(messages[locale][key], `${locale} ${key}`);
  assert.deepEqual(
    Object.values(localeKeyGaps()).flatMap((gap) => gap.missing),
    [],
  );
  assert.equal(
    message("fr", "plannerExportNinaHelp"),
    "Colonnes Pane, RA, DEC et Position Angle (East), coordonnées J2000, une ligne par cible dans l’ordre de la nuit. Dans N.I.N.A., ouvrez le séquenceur et choisissez « Import Target » : l’import remplace la liste de cibles déjà ouverte.",
  );
  assert.match(
    message("en", "plannerExportAsiairHelp"),
    /Paste it into ASIAIR Plan/,
  );
});
