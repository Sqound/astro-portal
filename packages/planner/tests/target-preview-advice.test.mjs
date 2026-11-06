// In « Prévisualiser », the filter chosen closes the equipment line, the card « Idéal avec votre
// matériel » sits under the verdict with « Essayer », the filter the target
// needs is said again when no verdict can be given, and the photo tab gives
// the filter, the ideal frame and the focal ratio. The case: NGC 6960,
// Newton 250/1200, Plössl 10 mm, UHC, Bortle 1.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { registerHooks } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import { eyepieceProfiles } from "../src/planner.js";
import {
  targetPreviewEquipmentLines,
  targetPreviewPreferenceKey,
  targetPreviewResolve,
  targetPreviewShown,
  targetPreviewVisibility,
} from "../src/target-preview.js";
import {
  targetPreviewAdviceNumber,
  targetPreviewIdeal,
  targetPreviewPhotoAdvice,
  targetPreviewTrialEquipment,
} from "../src/target-preview-advice.js";
import { visualCardAdviceText } from "../src/visual-filter-advice.js";
import common from "../src/common-equipment-profiles.json" with { type: "json" };

const plain = (text) => text?.replace(/[  ]/g, " ") ?? text;

const veil = {
  id: "openngc-ngc6960",
  designation: "NGC 6960",
  title: "NGC 6960",
  coordinate: { ra: 20.7662 * 15, dec: 30.5951 },
  integratedMagnitude: 7,
  apparentSizeArcmin: [210, 160],
  skyTarget: { typeKey: "Rémanent de supernova" },
  tags: [],
};
const m51 = {
  id: "openngc-ngc5194",
  designation: "M51",
  title: "M51",
  coordinate: { ra: 202.47, dec: 47.2 },
  integratedMagnitude: 8.4,
  apparentSizeArcmin: [13.7, 11.7],
  skyTarget: { typeKey: "Galaxie" },
  tags: [],
};
const uhc = { id: "own-uhc", name: "UHC", family: "uhc" };
const eyepiece = (id) => eyepieceProfiles.find((profile) => profile.id === id);
const profiles = {
  telescopes: common.telescopes,
  eyepieces: [eyepiece("plossl-10"), eyepiece("plossl-32")],
  cameras: common.cameras,
  filters: [uhc],
};
const inventory = {
  eyepieces: [eyepiece("plossl-10"), eyepiece("plossl-32")],
  filters: [uhc],
  telescopes: [],
};
const referenceKit = {
  mode: "visual",
  telescopeId: "skywatcher-newton-250-1200",
  eyepieceId: "plossl-10",
  filterIds: ["own-uhc"],
};
const bortle1 = { bortleClass: 1, sqm: 22 };
const visibilityOf = (equipment, owned = inventory) =>
  targetPreviewVisibility({
    target: veil,
    resolved: targetPreviewResolve(equipment, "visual", profiles),
    sky: bortle1,
    locale: "fr",
    inventory: owned,
  });

test("the filter chosen closes the equipment line: « … · Plössl 10 mm · UHC »", () => {
  const resolved = targetPreviewResolve(referenceKit, "visual", profiles);
  const { name } = targetPreviewEquipmentLines({
    shown: { equipment: referenceKit, resolved, mode: "visual" },
    profiles,
    locale: "fr",
  });
  assert.equal(
    name,
    "Sky-Watcher Newton 250/1200 (BK P250/1200) · Plössl 10 mm · UHC",
  );
  // Without a filter, nothing is added.
  const bare = { ...referenceKit, filterIds: [] };
  assert.doesNotMatch(
    targetPreviewEquipmentLines({
      shown: {
        equipment: bare,
        resolved: targetPreviewResolve(bare, "visual", profiles),
        mode: "visual",
      },
      profiles,
      locale: "fr",
    }).name,
    /UHC/,
  );
});

test("the card: the best pair of « Mon matériel », then a generic one said « pas dans votre matériel »", () => {
  const own = visibilityOf(referenceKit);
  assert.equal(own.status, "difficult");
  const ideal = targetPreviewIdeal({
    best: own.best,
    advice: own.advice,
    eyepieceName: "Plössl 10 mm",
    locale: "fr",
  });
  assert.equal(ideal.label, "Idéal avec votre matériel");
  assert.equal(ideal.line, "Plössl 32 mm + UHC · visible");
  assert.equal(ideal.detail, null);
  assert.deepEqual(ideal.trial, {
    eyepieceId: "plossl-32",
    eyepieceFocalLengthMm: 32,
    filterIds: null,
  });

  // The 32 mm is the owner's, the OIII is not (VS02-B1): « un OIII ».
  const bare = { ...referenceKit, filterIds: [] };
  const generic = visibilityOf(bare, { ...inventory, filters: [] });
  const missing = targetPreviewIdeal({
    best: generic.best,
    advice: generic.advice,
    locale: "fr",
  });
  assert.equal(missing.label, "Idéal pour cette cible");
  assert.equal(missing.line, "Plössl 32 mm + un OIII · visible");
  assert.equal(
    plain(missing.detail),
    "Le filtre OIII n’est pas dans votre matériel.",
  );
  assert.deepEqual(missing.trial.filterIds, ["generic-filter-oiii"]);

  // Neither piece is the owner's (VS02-B2): nothing to try.
  const neither = targetPreviewIdeal({
    best: {
      ...generic.best,
      eyepiece: { ...generic.best.eyepiece, generic: true },
    },
    advice: generic.advice,
    locale: "fr",
  });
  assert.equal(neither.line, "Un oculaire de 32 mm + un OIII · visible");
  assert.equal(
    plain(neither.detail),
    "Ni l’un ni l’autre dans votre matériel.",
  );
  assert.equal(neither.trial, null);

  // Nothing shows the target: the sentence, no « Essayer »; the choice
  // already the best: no card.
  assert.deepEqual(
    targetPreviewIdeal({
      best: own.best,
      advice: { key: "none", status: "unlikely" },
      locale: "fr",
    }),
    {
      label: "Idéal pour cette cible",
      line: "Aucun oculaire ni filtre ne la rend visible sous ce ciel.",
      detail: null,
      status: "unlikely",
      generic: false,
      missingFilterName: null,
      trial: null,
    },
  );
  assert.equal(
    targetPreviewIdeal({
      best: own.best,
      advice: { ...own.advice, key: "chosen" },
      locale: "fr",
    }),
    null,
  );
});

test("« Essayer » puts the pair in the preview: the line says it, the verdict goes, « Mon matériel » can come back", () => {
  const own = visibilityOf(referenceKit);
  const ideal = targetPreviewIdeal({
    best: own.best,
    advice: own.advice,
    locale: "fr",
  });
  const tried = targetPreviewTrialEquipment(referenceKit, ideal.trial);
  assert.deepEqual(tried, {
    ...referenceKit,
    eyepieceId: "plossl-32",
    eyepieceFocalLengthMm: 32,
  });
  const shown = targetPreviewShown({
    preference: tried,
    configuration: referenceKit,
    mode: "visual",
    profiles,
  });
  assert.equal(shown.source, "preference");
  assert.equal(shown.canRevert, true);
  assert.equal(
    targetPreviewEquipmentLines({ shown, profiles, locale: "fr" }).name,
    "Sky-Watcher Newton 250/1200 (BK P250/1200) · Plössl 32 mm · UHC",
  );
  assert.equal(visibilityOf(tried), null);

  // A generic filter tried is found by its id: « · OIII ».
  const generic = targetPreviewTrialEquipment(
    { ...referenceKit, filterIds: [] },
    { eyepieceId: null, filterIds: ["generic-filter-oiii"] },
  );
  const resolved = targetPreviewResolve(generic, "visual", profiles);
  assert.deepEqual(
    resolved.filterProfiles.map((filter) => filter.name),
    ["OIII"],
  );
});

test("the photo advice: NGC 6960 and M 51 on the Newton with the ASI2600MC (VS02-C, D)", () => {
  const camera = common.cameras.find(
    (entry) => entry.id === "zwo-asi2600mc-pro",
  );
  const resolved = targetPreviewResolve(
    {
      mode: "imaging",
      telescopeId: "skywatcher-newton-250-1200",
      cameraId: camera.id,
    },
    "imaging",
    profiles,
  );
  const veilAdvice = targetPreviewPhotoAdvice({
    target: veil,
    resolved,
    camera,
    telescopes: [],
    telescopeName: "Sky-Watcher Newton 250/1200",
    locale: "fr",
  });
  assert.equal(
    plain(veilAdvice.filter.title),
    "Filtre conseillé : double bande",
  );
  assert.doesNotMatch(veilAdvice.filter.detail, /bibande/);
  assert.equal(
    plain(veilAdvice.focal.title),
    "Cadre idéal pour le capteur ZWO ASI2600MC Pro (23,5 × 15,7 mm) : focale 140–230 mm",
  );
  assert.match(
    plain(veilAdvice.focal.detail),
    /Avec Sky-Watcher Newton 250\/1200 \(focale 1 200 mm, ouverture 254 mm\), vous voyez le centre\./,
  );
  assert.equal(veilAdvice.focal.fits, false);
  assert.equal(plain(veilAdvice.aperture.title), "Rapport focal : f/4 à f/6");
  // « Mon matériel » first: the owner's short refractor.
  assert.match(
    plain(
      targetPreviewPhotoAdvice({
        target: veil,
        resolved,
        camera,
        telescopes: [{ id: "own", name: "Lunette 70/200", focalLengthMm: 200 }],
        locale: "fr",
      }).focal.detail,
    ),
    /Votre Lunette 70\/200 \(focale 200 mm\) convient\./,
  );
  const galaxy = targetPreviewPhotoAdvice({
    target: m51,
    resolved,
    camera,
    locale: "fr",
  });
  assert.equal(plain(galaxy.filter.title), "Filtre : aucun conseillé");
  assert.equal(
    plain(galaxy.focal.title),
    "Cadre idéal pour le capteur ZWO ASI2600MC Pro (23,5 × 15,7 mm) : focale 930–1 550 mm · votre focale de 1 200 mm convient",
  );
  assert.equal(galaxy.focal.fits, true);
  assert.equal(plain(galaxy.aperture.title), "Rapport focal : f/5 à f/8");
  // Out of photo: nothing.
  assert.equal(
    targetPreviewPhotoAdvice({
      target: veil,
      resolved: targetPreviewResolve(referenceKit, "visual", profiles),
      locale: "fr",
    }),
    null,
  );
});

test("the Moon half-line under the filter: above 30 % only, shared with the app", () => {
  const fixture = JSON.parse(
    readFileSync(
      new URL("./fixtures/target-preview-moon-line.json", import.meta.url),
      "utf8",
    ),
  );
  for (const row of fixture.cases) {
    const advice = targetPreviewPhotoAdvice({
      target: row.dual ? veil : m51,
      resolved: fixture.resolved,
      moonIlluminationPercent: row.percent,
      locale: "fr",
    });
    assert.equal(
      plain(advice.filter.moon),
      plain(row.line),
      `${row.target} at ${row.percent}`,
    );
  }
});

test("the frame sentences name the instrument, its focal length and its aperture", () => {
  const fixture = JSON.parse(
    readFileSync(
      new URL("./fixtures/target-preview-focal-lines.json", import.meta.url),
      "utf8",
    ),
  );
  const targets = { veil, m51 };
  for (const row of fixture.cases) {
    const advice = targetPreviewPhotoAdvice({
      target: targets[row.target],
      resolved: fixture.resolved[row.resolved],
      camera: row.cameraName ? { name: row.cameraName } : null,
      telescopeName: row.telescopeName,
      integratedCamera: row.integratedCamera === true,
      cameraOwned: row.cameraOwned === true,
      locale: "fr",
    });
    assert.equal(plain(advice.focal.title), plain(row.title), row.title);
    assert.equal(plain(advice.focal.detail), plain(row.detail), row.title);
  }
});

test("the numbers: one rule for the web and the app", () => {
  assert.equal(targetPreviewAdviceNumber(1200, "fr", 0), "1 200");
  assert.equal(targetPreviewAdviceNumber(1200, "en", 0), "1,200");
  assert.equal(targetPreviewAdviceNumber(1200, "es", 0), "1200");
  assert.equal(targetPreviewAdviceNumber(12000, "es", 0), "12.000");
  assert.equal(targetPreviewAdviceNumber(4.72, "de"), "4,7");
  assert.equal(targetPreviewAdviceNumber(4, "fr"), "4");
});

test("a suggested card says its best pair, « pas dans votre matériel » for a generic one", () => {
  const card = (advice) => ({ target: veil, visual: { pair: { advice } } });
  assert.equal(
    visualCardAdviceText(
      "fr",
      card({
        key: "filter",
        status: "suitable",
        filterFamily: "oiii",
        generic: true,
      }),
    ),
    "Visible avec un filtre OIII · pas dans votre matériel",
  );
  assert.equal(
    visualCardAdviceText(
      "fr",
      card({
        key: "eyepiece",
        status: "suitable",
        eyepieceFocalLengthMm: 32,
        generic: false,
      }),
    ),
    "Visible au 32 mm",
  );
  // No pair to change: the filter the target needs, as before.
  assert.equal(
    plain(visualCardAdviceText("fr", card({ key: "chosen" }))),
    "Filtre conseillé : OIII / UHC",
  );
});

// The section, rendered on the server.
await registerJsx();
globalThis.__createElement = createElement;
const DIALOG = `data:text/javascript,${encodeURIComponent(
  'const h = globalThis.__createElement; export const WebDialog = ({ title, children, footer }) => h("div", { className: "web-dialog-stand-in" }, h("h2", null, title), h("div", { className: "web-dialog-body" }, children), footer ? h("div", { className: "web-dialog-footer" }, footer) : null);',
)}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "portal/components/dialog/WebDialog.js")
      return { url: DIALOG, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { TargetPreviewBlock, TargetPreviewSheet } =
  await import("planner/components/TargetPreviewBlock.js");

const render = (options = {}) => renderWith(profiles, options);
const renderWith = (
  shownProfiles,
  { target = veil, equipment = referenceKit, sky = bortle1 } = {},
) => {
  const before = globalThis.window;
  const values = new Map([
    [
      targetPreviewPreferenceKey,
      JSON.stringify({ [equipment.mode]: equipment }),
    ],
  ]);
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  };
  try {
    return plain(
      renderToStaticMarkup(
        createElement(TargetPreviewBlock, {
          locale: "fr",
          card: { target },
          visualMode: equipment.mode === "visual",
          preview: {
            planEquipment: null,
            configuration: null,
            profiles: shownProfiles,
            sky,
            visualInventory: inventory,
          },
        }),
      ),
    );
  } finally {
    if (before === undefined) delete globalThis.window;
    else globalThis.window = before;
  }
};

test("the web section: the filter in the line, the card and « Essayer » under the verdict", () => {
  const markup = render();
  assert.match(
    markup,
    /data-testid="preview-equipment">Sky-Watcher Newton 250\/1200 \(BK P250\/1200\) · Plössl 10 mm · UHC</,
  );
  assert.match(
    markup,
    /data-testid="preview-visibility" data-visibility="difficult"/,
  );
  assert.match(markup, /data-testid="preview-ideal"/);
  assert.match(markup, /Idéal avec votre matériel/);
  assert.match(
    markup,
    /data-testid="preview-ideal-line">Plössl 32 mm \+ UHC · visible</,
  );
  assert.match(
    markup,
    /<button type="button" class="btn-link planner-target-preview-ideal-try" data-testid="preview-ideal-try">Essayer<\/button>/,
  );
  // The card stands after the verdict and before the equipment line.
  assert.ok(
    markup.indexOf("preview-visibility") <
      markup.indexOf('data-testid="preview-ideal"') &&
      markup.indexOf('data-testid="preview-ideal"') <
        markup.indexOf("preview-equipment"),
  );
  assert.doesNotMatch(markup, /preview-filter-advice/);
  assert.doesNotMatch(markup, /invisible/);
});

test("the web section without a sky: the filter the target needs, said again", () => {
  const markup = render({ sky: null });
  assert.doesNotMatch(markup, /data-testid="preview-ideal"/);
  assert.match(
    markup,
    /data-testid="preview-filter-advice">Filtre conseillé : OIII \/ UHC</,
  );
});

test("the web section: « Filtre idéal : OIII » under the caption, always, and nothing else (VISUAL-SIM-03)", () => {
  const pill =
    /<span class="planner-target-preview-pill" data-testid="preview-ideal-filter" data-filter-family="(\w+)">([^<]+)<\/span>/;
  const markup = render();
  const found = pill.exec(markup);
  assert.deepEqual([found[1], found[2]], ["oiii", "Filtre idéal : OIII"]);
  // Under the caption, before the verdict.
  assert.ok(
    markup.indexOf("Simulation de la vue") <
      markup.indexOf("preview-ideal-filter") &&
      markup.indexOf("preview-ideal-filter") <
        markup.indexOf("preview-visibility"),
  );
  // No sentence, no « dans votre matériel », no link: the card keeps that role.
  assert.doesNotMatch(markup, /meilleur de votre matériel|Ajouter un/);
  // Without a sky it stays; a galaxy says « aucun »; the photo tab has none.
  assert.match(render({ sky: null }), /data-filter-family="oiii"/);
  const galaxy = pill.exec(render({ target: m51 }));
  assert.deepEqual([galaxy[1], galaxy[2]], ["none", "Filtre idéal : aucun"]);
  assert.doesNotMatch(
    render({ equipment: { mode: "imaging" } }),
    /preview-ideal-filter/,
  );
});

test("the web section: « ★ Idéal » at the end of the equipment line, rule (c) (VISUAL-SIM-03)", () => {
  const badge = /data-testid="preview-ideal-badge"/;
  const enough = { ...referenceKit, eyepieceId: "plossl-32" };
  // 32 mm + UHC on the Dentelle under Bortle 1: visible, the UHC helps.
  const markup = render({ equipment: enough });
  assert.match(
    markup,
    /Plössl 32 mm · UHC <span[^>]*preview-ideal-badge[^>]*>/,
  );
  assert.match(markup, />Idéal<\/span><\/p>/);
  // The reference 10 mm: difficult, no badge; the card keeps its role.
  assert.doesNotMatch(render(), badge);
  // No sky, no verdict, no badge; in photo none either.
  assert.doesNotMatch(render({ equipment: enough, sky: null }), badge);
  assert.doesNotMatch(render({ equipment: { mode: "imaging" } }), badge);
  // M 51: bare it is « Idéal », behind a UHC (which dims it) it is not.
  const bare = { ...enough, filterIds: [] };
  assert.match(render({ target: m51, equipment: bare }), badge);
  assert.doesNotMatch(render({ target: m51, equipment: enough }), badge);
});

test("the web disc reads the verdict: the reference case is no longer a black disc", () => {
  const read = (markup) => ({
    cutoff: Number(/data-eyepiece-cutoff="([\d.]+)"/.exec(markup)?.[1]),
    gain: Number(/data-eyepiece-gain="([\d.]+)"/.exec(markup)?.[1]),
  });
  // 32 mm + UHC, Bortle 1: « visible » (+2,1), the filaments pass (it was 0.70 / 0.54).
  const enough = read(
    render({ equipment: { ...referenceKit, eyepieceId: "plossl-32" } }),
  );
  assert.ok(enough.cutoff < 0.12 && enough.gain > 0.95, JSON.stringify(enough));
  // Without the UHC the same disc is fainter and « difficile »: only the
  // brightest share stays (cutoff of 0.60 at least).
  const bare = read(
    render({
      equipment: { ...referenceKit, eyepieceId: "plossl-32", filterIds: [] },
    }),
  );
  assert.ok(
    bare.cutoff > enough.cutoff &&
      bare.cutoff >= 0.6 &&
      bare.gain < enough.gain,
  );
  // Without a sky there is no verdict: the render of the eyepiece rule stays.
  const unknown = read(
    render({
      sky: null,
      equipment: { ...referenceKit, eyepieceId: "plossl-32" },
    }),
  );
  assert.notDeepEqual(unknown, enough);
});

test("the web disc: an observer's NGC 6960, 115 mm APO + OIII under Bortle 8", () => {
  const oiii = { id: "own-oiii", name: "OIII", family: "oiii" };
  const wide = {
    ...profiles,
    eyepieces: [...profiles.eyepieces, eyepiece("plossl-15")],
    filters: [uhc, oiii],
  };
  const read = (eyepieceId) => {
    const markup = renderWith(wide, {
      equipment: {
        mode: "visual",
        telescopeId: "sky-rover-115-apo",
        eyepieceId,
        filterIds: ["own-oiii"],
      },
      sky: { bortleClass: 8, sqm: 17.7 },
    });
    return {
      cutoff: Number(/data-eyepiece-cutoff="([\d.]+)"/.exec(markup)?.[1]),
      gain: Number(/data-eyepiece-gain="([\d.]+)"/.exec(markup)?.[1]),
    };
  };
  // 15 mm: 2,1 mm of pupil with a narrow-band filter, almost empty;
  // 32 mm: the same patch, brighter.
  const fifteen = read("plossl-15");
  const thirtyTwo = read("plossl-32");
  assert.ok(
    fifteen.cutoff > 0.7 && fifteen.gain <= 0.31,
    JSON.stringify(fifteen),
  );
  assert.ok(
    thirtyTwo.cutoff < fifteen.cutoff && thirtyTwo.gain > fifteen.gain,
    JSON.stringify(thirtyTwo),
  );
});

test("the web photo tab: the filter, the ideal frame, the focal ratio", () => {
  const imaging = {
    mode: "imaging",
    telescopeId: "skywatcher-newton-250-1200",
    cameraId: "zwo-asi2600mc-pro",
  };
  const markup = render({ equipment: imaging });
  assert.match(markup, /data-testid="preview-photo-advice"/);
  assert.match(markup, /Filtre conseillé : double bande/);
  assert.match(
    markup,
    /Cadre idéal pour votre ZWO ASI2600MC Pro \(23,5 × 15,7 mm\) : focale 140–230 mm/,
  );
  assert.match(markup, /Rapport focal : f\/4 à f\/6/);
  const galaxy = render({ target: m51, equipment: imaging });
  assert.match(galaxy, /Filtre : aucun conseillé/);
  assert.match(galaxy, /data-testid="preview-photo-focal"/);
  assert.match(galaxy, /votre focale de 1 200 mm convient/);
  assert.match(
    galaxy,
    /class="planner-target-preview-photo-advice-row is-fits"/,
  );
});

test("the sheet: a filter selector, « Aucun », the owner's filters and the generic ones", () => {
  const shown = targetPreviewShown({
    preference: referenceKit,
    mode: "visual",
    profiles,
  });
  const markup = plain(
    renderToStaticMarkup(
      createElement(TargetPreviewSheet, {
        locale: "fr",
        shown,
        profiles,
        onApply: () => {},
        onClose: () => {},
      }),
    ),
  );
  assert.match(
    markup,
    /<select aria-label="Filtre" data-testid="preview-sheet-filter">/,
  );
  assert.match(markup, /<option value="">Aucun<\/option>/);
  assert.match(markup, /<option value="own-uhc" selected="">UHC<\/option>/);
  assert.match(
    markup,
    /<option value="generic-filter-oiii">OIII · pas dans votre matériel<\/option>/,
  );
});
