import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { localeKeyGaps, message } from "portal/i18n.js";
import {
  framingDraft,
  framingDraftName,
  framingNameSuggestions,
  savedFramingTarget,
} from "../src/framings.js";
import { framingPreviewUrl } from "../src/surveys.js";
import {
  framingFootprint,
  framingPlacement,
  framingSuggestionLimit,
  framingTargetNotoriety,
  framingTargetsUnderFrame,
} from "../src/framing-targets.js";

// Rule: a framing created by aiming at M31 offers M31, and more generally a
// list of what lies under the frame, in the name suggestion; when there is no
// target, it offers the coordinates rather than "Framing". The shared fixtures
// (`fixtures/framing-targets-under-frame.json`) pin the rule.

const degree = Math.PI / 180;
const nucleus = { ra: 10.6847, dec: 41.2687 };
const field04 = { width: 0.4, height: 0.4, shape: "rectangle" };

const target = (id, designation, ra, dec, extra = {}) => ({
  id,
  designation,
  title: designation,
  coordinate: { ra, dec },
  ...extra,
});

const m31 = target("m31", "M31", 10.6847, 41.2687, {
  title: "Galaxie d’Andromède",
  name: "Galaxie d’Andromède",
  objects: ["M31", "NGC 224"],
  apparentSizeArcmin: [190, 60],
});
const m32 = target("m32", "M32", 10.6742, 40.8652, {
  apparentSizeArcmin: [9, 6],
});
const m110 = target("m110", "M110", 10.0923, 41.6853, {
  apparentSizeArcmin: [22, 11],
});
const pgc = target("pgc2557", "PGC 2557", 10.704, 41.2, {
  apparentSizeArcmin: [1],
});
const orion = target("m42", "M42", 83.82, -5.39, {
  title: "Grande nébuleuse d’Orion",
});
const group = [m31, m32, m110, pgc, orion];

const ids = (targets) => targets.map((entry) => entry.id);
const under = (options) =>
  ids(
    framingTargetsUnderFrame({
      center: nucleus,
      field: field04,
      candidates: group,
      ...options,
    }),
  );

test("M31 is under a 0.4 degree frame laid on its nucleus", () => {
  assert.deepEqual(under(), ["m31", "pgc2557"]);
});

test("and under one laid on its disc a degree from the nucleus, by its extent alone", () => {
  const found = under({ center: { ra: 10.0, dec: 40.55 } });
  assert.deepEqual(found, ["m31"]);
  // Its centre is nowhere near a 0.4 degree frame there: only the 190'
  // extent reaches in.
  const frame = framingFootprint({
    center: { ra: 10.0, dec: 40.55 },
    field: field04,
  });
  assert.equal(
    framingPlacement(frame, m31.coordinate.ra, m31.coordinate.dec, 0),
    null,
  );
  assert.equal(
    framingPlacement(frame, m31.coordinate.ra, m31.coordinate.dec, 95 / 60)
      .centreInside,
    false,
  );
});

test("a frame outside the widest reach of the extent has no M31 under it", () => {
  assert.deepEqual(under({ center: { ra: 10.6847, dec: 43.27 } }), []);
  assert.deepEqual(under({ center: { ra: 200, dec: -60 } }), []);
});

test("a mosaic's whole surface reaches more than one field does", () => {
  assert.equal(under().includes("m110"), false);
  assert.equal(
    under({ field: { width: 6, height: 3, shape: "rectangle" } }).includes(
      "m110",
    ),
    true,
  );
});

test("a frame turned by its angle covers a different strip of sky", () => {
  const east = target(
    "east",
    "East",
    10.6847 + 0.8 / Math.cos(41.2687 * degree),
    41.2687,
  );
  const strip = { width: 2, height: 0.1, shape: "rectangle" };
  const at = (angleDegrees) =>
    ids(
      framingTargetsUnderFrame({
        center: nucleus,
        field: strip,
        angleDegrees,
        candidates: [east],
      }),
    );
  assert.deepEqual(at(0), ["east"]);
  assert.deepEqual(at(90), []);
  assert.deepEqual(at(-90), []);
  assert.deepEqual(at(180), ["east"]);
});

test("an eyepiece's circle leaves out what the square around it holds", () => {
  const corner = target(
    "corner",
    "Corner",
    10.6847 + 0.45 / Math.cos(41.2687 * degree),
    41.2687 + 0.45,
  );
  const at = (shape) =>
    ids(
      framingTargetsUnderFrame({
        center: nucleus,
        field: { width: 1, height: 1, shape },
        candidates: [corner],
      }),
    );
  assert.deepEqual(at("rectangle"), ["corner"]);
  assert.deepEqual(at("circle"), []);
});

test("a frame with no size or no centre has nothing under it", () => {
  assert.deepEqual(under({ field: { width: 0, height: 0 } }), []);
  assert.deepEqual(under({ center: { ra: null, dec: 3 } }), []);
  assert.equal(framingFootprint({}), null);
});

test("the target a search put forward comes first, even beside a nearer, better-known one", () => {
  const wide = { width: 6, height: 3, shape: "rectangle" };
  assert.equal(under({ field: wide })[0], "m31");
  assert.equal(under({ field: wide, featured: m110 })[0], "m110");
  // It is judged under the frame whether or not the candidates carry it.
  assert.equal(
    ids(
      framingTargetsUnderFrame({
        center: nucleus,
        field: wide,
        candidates: [],
        featured: m110,
      }),
    )[0],
    "m110",
  );
});

test("a searched target that is not under the frame is not proposed", () => {
  assert.equal(under({ featured: orion }).includes("m42"), false);
});

test("centre inside comes before what the frame only touches, then the well-known before the obscure, then the nearest", () => {
  const onM32 = under({ center: { ra: 10.667, dec: 40.8652 } });
  assert.equal(onM32[0], "m32");
  assert.ok(onM32.indexOf("m31") > onM32.indexOf("m32"));
  const wide = under({ field: { width: 2.8, height: 1.87 } });
  assert.deepEqual(wide, ["m31", "m32", "m110", "pgc2557"]);
});

test("five at most, and the limit can be raised", () => {
  const crowd = Array.from({ length: 12 }, (_, index) =>
    target(
      `ngc${index}`,
      `NGC ${1000 + index}`,
      10.6847 + index * 0.002,
      41.2687,
    ),
  );
  const found = framingTargetsUnderFrame({
    center: nucleus,
    field: { width: 2, height: 2 },
    candidates: crowd,
  });
  assert.equal(found.length, framingSuggestionLimit);
  assert.equal(found[0].id, "ngc0");
  assert.equal(
    framingTargetsUnderFrame({
      center: nucleus,
      field: { width: 2, height: 2 },
      candidates: crowd,
      limit: 8,
    }).length,
    8,
  );
});

test("notoriety: Messier, Caldwell and a name of its own before a bare designation", () => {
  assert.equal(framingTargetNotoriety({ designation: "M31" }), 0);
  assert.equal(framingTargetNotoriety({ designation: "M 31" }), 0);
  assert.equal(framingTargetNotoriety({ designation: "C14" }), 0);
  assert.equal(
    framingTargetNotoriety({
      designation: "NGC 224",
      objects: ["NGC 224", "M31"],
    }),
    0,
  );
  assert.equal(
    framingTargetNotoriety({
      designation: "NGC 1499",
      name: "Nébuleuse de Californie",
    }),
    0,
  );
  assert.equal(
    framingTargetNotoriety({
      designation: "NGC 1499",
      name: "アンドロメダ銀河",
    }),
    0,
  );
  assert.equal(framingTargetNotoriety({ designation: "NGC 1234" }), 1);
  assert.equal(
    framingTargetNotoriety({
      designation: "PGC 2557",
      name: "PGC 2557",
      title: "PGC 2557",
    }),
    1,
  );
  assert.equal(
    framingTargetNotoriety({ designation: "Sh2-155", name: "Sh2 155" }),
    1,
  );
});

test("the cost of asking a catalogue of 14 400 targets is a few milliseconds", () => {
  let seed = 31;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const catalogue = Array.from({ length: 14400 }, (_, index) =>
    target(
      `row${index}`,
      `NGC ${index + 1}`,
      random() * 360,
      (Math.asin(random() * 2 - 1) * 180) / Math.PI,
      { apparentSizeArcmin: [1 + Math.floor(random() * 90), 1] },
    ),
  );
  catalogue.push(m31);
  const run = () =>
    framingTargetsUnderFrame({
      center: nucleus,
      field: field04,
      candidates: catalogue,
    });
  assert.ok(ids(run()).includes("m31"));
  let best = Infinity;
  for (let turn = 0; turn < 7; turn += 1) {
    const start = performance.now();
    run();
    best = Math.min(best, performance.now() - start);
  }
  assert.ok(best < 50, `${best.toFixed(2)} ms would be a visible stall`);
});

// The name the dialog proposes.
test("the name is the first object under the frame, not all of them joined", () => {
  const draft = framingDraft({
    center: nucleus,
    field: { width: 2.8, height: 1.87 },
    matches: framingTargetsUnderFrame({
      center: nucleus,
      field: { width: 2.8, height: 1.87 },
      candidates: group,
    }),
  });
  assert.deepEqual(draft.objects, ["M31", "M32", "M110", "PGC 2557"]);
  assert.equal(framingDraftName(draft, "Framing"), "M31");
});

test("with nothing under the frame the name is the centre's coordinates, never the generic word", () => {
  const empty = framingDraft({
    center: { ra: 200, dec: -60 },
    field: field04,
    matches: [],
  });
  assert.equal(
    framingDraftName(empty, "Framing"),
    "13h 20m 00s · −60° 00′ 00″",
  );
  assert.notEqual(framingDraftName(empty, "Cadrage"), "Cadrage");
  assert.equal(
    framingDraftName({ center: { ra: 0, dec: 41.2687 }, objects: [] }, "X"),
    "0h 00m 00s · +41° 16′ 07″",
  );
  // The generic word survives only for a draft with no place in the sky.
  assert.equal(framingDraftName({ objects: [] }, "Cadrage"), "Cadrage");
  assert.equal(framingDraftName(null, "Cadrage"), "Cadrage");
});

test("the choices are the draft's matches in order, one per name, with what to recognise them by", () => {
  const draft = framingDraft({
    center: nucleus,
    field: { width: 2.8, height: 1.87 },
    matches: [
      { ...m31, skyTarget: { type: "Galaxie spirale" } },
      { ...m32, skyTarget: { type: "Galaxie elliptique naine" } },
      { ...m32, id: "m32-again" },
    ],
  });
  const suggestions = framingNameSuggestions(draft);
  assert.deepEqual(
    suggestions.map(({ name, detail }) => [name, detail]),
    [
      ["M31", "Galaxie d’Andromède"],
      ["M32", "Galaxie elliptique naine"],
    ],
  );
  assert.equal(suggestions[0].target.id, "m31");
  assert.deepEqual(framingNameSuggestions({ matches: [] }), []);
  assert.deepEqual(framingNameSuggestions(null), []);
});

// The wiring, read off the sources like the other editor tests do: a page
// that is only ever a browser cannot be rendered here.
test("the naming dialog lists the choices and puts a clicked name in the field", async () => {
  const source = await readFile(
    new URL("../src/components/PlannerPage.js", import.meta.url),
    "utf8",
  );
  const dialog = source.slice(
    source.indexOf("function FramingDialog("),
    source.indexOf("function normalizeMosaicSurface("),
  );
  assert.match(dialog, /framingNameSuggestions\(draft\)/);
  assert.match(dialog, /onClick=\{\(\) => setName\(suggestion\.name\)\}/);
  assert.match(dialog, /plannerUseFramingUnderFrame/);
  assert.match(dialog, /plannerUseFramingNoTarget/);
  assert.doesNotMatch(dialog, /draft\.objects\.join/);
  // Both ways of making a framing propose the centre when there is no object.
  assert.equal(
    (source.match(/framingDraftName\(\s*\{ objects, center:/g) || []).length,
    2,
  );
});

test("the map names a framing from what lies under it, the searched target first", async () => {
  const source = await readFile(
    new URL("../src/components/PlannerNightSkyMap.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /framingTargetsUnderFrame\(\{/);
  assert.match(source, /featured: highlightedTarget/);
  assert.doesNotMatch(source, /targetInEquipmentField/);
});

test("every text the choices add exists in en, fr and ja, and speaks as « vous »", () => {
  const keys = [
    "plannerUseFramingUnderFrame",
    "plannerUseFramingNoTarget",
    "plannerUseFramingUseName",
  ];
  for (const locale of ["en", "fr", "ja"])
    for (const key of keys) {
      const text = message(locale, key);
      assert.notEqual(text, key, `${locale} lacks ${key}`);
      assert.ok(text.trim().length > 0);
    }
  assert.ok(message("en", "plannerUseFramingUseName").includes("{name}"));
  assert.ok(message("fr", "plannerUseFramingUseName").includes("{name}"));
  assert.ok(message("ja", "plannerUseFramingUseName").includes("{name}"));
  for (const key of keys)
    assert.doesNotMatch(
      message("fr", key),
      /\b(tu|ton|ta|tes|toi|choisis|touche)\b/i,
    );
  assert.match(message("fr", "plannerUseFramingUnderFrame"), /choisissez/);
  for (const [locale, gaps] of Object.entries(localeKeyGaps("en")))
    assert.deepEqual(gaps, { missing: [], extra: [] }, locale);
});

// The picture of the sky under a framing. On the web it must
// still be there for a framing made from the editor — its draft goes through
// two spreads before it is saved, and neither may drop the preview.
test("the editor's draft keeps the preview picture all the way to the saved framing", async () => {
  const field = { width: 2.8, height: 1.87, shape: "rectangle" };
  const previewImageUrl = framingPreviewUrl(nucleus, field, false);
  assert.match(
    previewImageUrl,
    /^https:\/\/alasky\.cds\.unistra\.fr\/hips-image-services\/hips2fits\?/,
  );
  const draft = framingDraft({
    center: nucleus,
    field,
    matches: [m31],
    previewImageUrl,
  });
  // `FramingEditorDialog.handleUseFraming`, then `handleFramingEditorConfirm`.
  const fromEditor = { ...draft, mosaic: undefined, referenceEquipment: null };
  const confirmed = { ...fromEditor, objects: draft.objects, name: "M31" };
  const target = savedFramingTarget({
    draft: confirmed,
    id: "framing-1",
    name: "M31",
    savedAt: "2026-09-29T00:00:00.000Z",
  });
  assert.equal(target.framing.previewImageUrl, previewImageUrl);
  assert.deepEqual(target.featured, { imageUrl: previewImageUrl });

  // The two spreads, read off the source: the draft is copied whole.
  const page = await readFile(
    new URL("../src/components/PlannerPage.js", import.meta.url),
    "utf8",
  );
  const handleUseFraming = page.slice(
    page.indexOf("const handleUseFraming = (draft) => {"),
    page.indexOf('if (typeof document === "undefined") return null;'),
  );
  assert.match(handleUseFraming, /\.\.\.draft,/);
  const confirmHandler = page.slice(
    page.indexOf("const handleFramingEditorConfirm = (draft) => {"),
    page.indexOf("const removeFramingReferenceFromPlan"),
  );
  assert.match(
    confirmHandler,
    /setFramingEditorDraft\(\{ \.\.\.draft, objects, name: defaultName \}\)/,
  );
  // …and the map cuts the picture for the frame it names (the mosaic's whole
  // surface for a mosaic).
  const map = await readFile(
    new URL("../src/components/PlannerNightSkyMap.js", import.meta.url),
    "utf8",
  );
  assert.match(
    map,
    /previewImageUrl: framingPreviewUrl\(center, previewField, visualMode\)/,
  );
  // The library card shows what the framing saved.
  assert.match(
    page,
    /const image = target\?\.featured\?\.imageUrl \|\| target\?\.framing\?\.previewImageUrl;/,
  );
});
