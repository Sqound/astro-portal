// The visual model's data (VISUAL-SIM-02a): what the eyepiece verdict
// (`visualSuitability`, `planner.js`) reads besides the catalogue's magnitude
// and size, written once.
//
// 1. The structure of a target and its filling factor. The catalogue's size
//    is the ellipse that holds the whole object; its light is not spread
//    evenly over it. A filamentary object (a supernova remnant, the filaments
//    of a large nebula) fills a small share `f` of its ellipse, so the
//    surface brightness the eye meets is the one of the part filled:
//      SB(filled) = SB(mean) + 2.5 log10(f).
//    A diffuse object fills its ellipse (f = 1). A concentrated object (a
//    planetary nebula, a globular cluster, a galaxy with a bright bulge)
//    keeps f = 1 by default (its size is its own), a target of the table
//    below may give its bright part. A target may carry its own
//    `structureClass` and `fillingFactor` (optional fields of the target);
//    else the table below, else its class by type. The values are estimates
//    (VISUAL-SIM-02 § 3.2: filaments fill 5 to 15 % of their ellipse; no
//    published figure found, § 3.7), set on the conservative side; a filamentary target is never « suitable »
//    under `filamentarySuitableMargin` magnitudes of margin.
// 2. The gain of a filter, in magnitudes of contrast, by filter family and
//    kind of target (emission nebula, supernova remnant, planetary nebula,
//    other). A line filter (OIII, UHC, Hβ) dims the sky's background much
//    more than the line light of an emission object, so it raises the
//    contrast of these, and dims a galaxy, a cluster or a reflection nebula
//    as much as the sky or more (a loss). The values are read from Knisely's
//    ratings (Prairie Astronomy Club, 0–5 « improvement over no filter »,
//    converted 5 → +2, 4 → +1.5, 3 → +1, 2 → +0.5, 1 → 0, 0 → −2) and
//    checked on the low end of what observers report (VISUAL-SIM-02 § 3.7);
//    the loss on galaxies and clusters is a direction, not a measure: the margin of contrast grows by the gain;
//    for a target without a contrast margin (a cluster, or no sky known) only
//    a loss is counted. A broadband filter (UV/IR cut, CLS) counts for
//    nothing. Hα and S II pass light the dark-adapted eye barely sees.

export const visualStructureRule = Object.freeze({
  fillingFactors: Object.freeze({
    filamentary: 0.15,
    diffuse: 1,
    concentrated: 1,
  }),
  filamentarySuitableMargin: 1,
  fillingFactorMinimum: 0.01,
});

// The targets whose structure is not the one of their type, by
// designation (the catalogue's, without spaces, upper case), with why.
// Sizes are the catalogue's (OpenNGC, `target-facts-curated.jsonl`).
const crabFilterGains = Object.freeze({ uhc: 1.5, oiii: 1, hb: -2, dual: 1.5 });

export const visualStructureByDesignation = Object.freeze({
  // The Cygnus Loop's ellipse (210 × 160′, mag 7, OpenNGC): the light is in
  // the filaments of the two Veils and Pickering's Triangle.
  NGC6960: Object.freeze({ structureClass: "filamentary", fillingFactor: 0.1 }),
  // The Eastern Veil's size (60 × 8′) already traces its arc.
  NGC6992: Object.freeze({ structureClass: "filamentary", fillingFactor: 1 }),
  NGC6995: Object.freeze({ structureClass: "filamentary", fillingFactor: 1 }),
  // The Crab: an even glow (8 × 4′ in OpenNGC), not filaments at the eyepiece.
  // Knisely rates it UHC 4, OIII 3, Hβ 0: the OIII gain is below a remnant's.
  M1: Object.freeze({
    structureClass: "diffuse",
    fillingFactor: 1,
    filterGains: crabFilterGains,
  }),
  NGC1952: Object.freeze({
    structureClass: "diffuse",
    fillingFactor: 1,
    filterGains: crabFilterGains,
  }),
  // The Orion Nebula: the Huygens region holds most of its light.
  M42: Object.freeze({ structureClass: "concentrated", fillingFactor: 0.3 }),
  NGC1976: Object.freeze({
    structureClass: "concentrated",
    fillingFactor: 0.3,
  }),
  // Andromeda: its bulge holds most of the light seen at the eyepiece.
  M31: Object.freeze({ structureClass: "concentrated", fillingFactor: 0.2 }),
  NGC224: Object.freeze({ structureClass: "concentrated", fillingFactor: 0.2 }),
  // Triangulum: a face-on spiral of low, even surface brightness.
  M33: Object.freeze({ structureClass: "diffuse", fillingFactor: 1 }),
  NGC598: Object.freeze({ structureClass: "diffuse", fillingFactor: 1 }),
  // The Rosette: a ring around its cluster.
  NGC2237: Object.freeze({ structureClass: "diffuse", fillingFactor: 0.6 }),
  // North America, the Heart, the Soul: large, even emission regions.
  NGC7000: Object.freeze({ structureClass: "diffuse", fillingFactor: 1 }),
  IC1805: Object.freeze({ structureClass: "diffuse", fillingFactor: 1 }),
  IC1848: Object.freeze({ structureClass: "diffuse", fillingFactor: 1 }),
  // The California Nebula: its light is Hα and Hβ; an Hβ filter is the
  // one that shows it, an OIII one dims it.
  NGC1499: Object.freeze({
    structureClass: "diffuse",
    fillingFactor: 1,
    filterGains: Object.freeze({ hb: 1.5, uhc: 0.5, oiii: 0, dual: 0.5 }),
  }),
  // The Horsehead's background, IC 434: the classic Hβ target.
  IC434: Object.freeze({
    structureClass: "diffuse",
    fillingFactor: 1,
    filterGains: Object.freeze({ hb: 1.5, uhc: 1, oiii: -2, dual: 1 }),
  }),
});

// The gain of each family, in magnitudes of contrast, by kind of target
// (`visualFilterTargetKind`). Families absent count for 0.
export const visualFilterGains = Object.freeze({
  emission: Object.freeze({
    uhc: 1.5,
    oiii: 1.5,
    hb: 0.5,
    dual: 1.5,
    ha: -2,
    sii: -2,
  }),
  remnant: Object.freeze({
    oiii: 2,
    uhc: 1.5,
    dual: 1.5,
    hb: 0,
    ha: -2,
    sii: -2,
  }),
  planetary: Object.freeze({
    oiii: 2,
    uhc: 1.5,
    dual: 1.5,
    hb: 0,
    ha: -2,
    sii: -2,
  }),
  other: Object.freeze({
    oiii: -1,
    uhc: -0.7,
    hb: -1.5,
    dual: -1,
    ha: -2,
    sii: -2,
  }),
});

// The families a visual observer is advised, in the order a tie keeps.
export const visualAdvisedFilterFamilies = Object.freeze(["uhc", "oiii", "hb"]);

const normalize = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const typeOf = (target) =>
  normalize(
    `${target?.skyTarget?.typeKey || target?.typeKey || target?.skyTarget?.type || ""} ${(target?.tags || []).join(" ")}`,
  );

/**
 * The kind of target a filter's gain reads: `planetary`, `remnant`,
 * `emission` or `other` (galaxies, clusters, reflection and dark nebulae,
 * stars, anything else).
 */
export function visualFilterTargetKind(target) {
  const type = typeOf(target);
  if (/nebuleuse planetaire|planetary nebula/.test(type)) return "planetary";
  if (/remanent|supernova|remnant/.test(type)) return "remnant";
  if (/reflexion|reflection|sombre|obscure|dark|galax|amas|cluster/.test(type))
    return "other";
  if (/emission|h ii|nebuleuse|nebula/.test(type)) return "emission";
  return "other";
}

// The designation a target is looked up by in the table: its own, else its
// source, else read from an OpenNGC id (`openngc-ngc0224` → `NGC224`).
function designationsOf(target) {
  const keys = [];
  const add = (value) => {
    const key = String(value || "")
      .replace(/\s+/g, "")
      .toUpperCase();
    if (key) keys.push(key.replace(/^(NGC|IC|M)0+(\d)/, "$1$2"));
  };
  add(target?.designation);
  add(target?.source);
  add(target?.skyTarget?.designation);
  const id = /^openngc-([a-z]+)(\d+)/.exec(String(target?.id || ""));
  if (id) add(`${id[1]}${id[2]}`);
  return keys;
}

/** The table's entry for `target`, `null` when it has none. */
export function visualStructureEntry(target) {
  for (const key of designationsOf(target)) {
    const entry = visualStructureByDesignation[key];
    if (entry) return entry;
  }
  return null;
}

const structureClasses = Object.keys(visualStructureRule.fillingFactors);

/**
 * `{ structureClass, fillingFactor }` of `target`: its own fields, else the
 * table's, else its class by type (a remnant is filamentary, a planetary
 * nebula or a cluster concentrated, anything else diffuse).
 */
export function visualTargetStructure(target) {
  const entry = visualStructureEntry(target);
  const own = structureClasses.includes(target?.structureClass)
    ? target.structureClass
    : null;
  const kind = visualFilterTargetKind(target);
  const type = typeOf(target);
  const structureClass =
    own ||
    entry?.structureClass ||
    (kind === "remnant"
      ? "filamentary"
      : kind === "planetary" || /amas|cluster/.test(type)
        ? "concentrated"
        : "diffuse");
  const given = Number(target?.fillingFactor);
  const factor =
    Number.isFinite(given) && given > 0 && given <= 1
      ? given
      : own
        ? visualStructureRule.fillingFactors[own]
        : (entry?.fillingFactor ??
          visualStructureRule.fillingFactors[structureClass]);
  return {
    structureClass,
    fillingFactor: Math.max(visualStructureRule.fillingFactorMinimum, factor),
  };
}

/**
 * The gain in magnitudes of contrast of a filter of `family` on `target`
 * (`null` family: no filter, 0).
 */
export function visualFilterGain(target, family) {
  if (!family) return 0;
  const own = visualStructureEntry(target)?.filterGains;
  if (own && Object.hasOwn(own, family)) return own[family];
  const gains = visualFilterGains[visualFilterTargetKind(target)];
  return Object.hasOwn(gains, family) ? gains[family] : 0;
}

/**
 * The families advised for `target` at the eyepiece, from the gains: those
 * of `visualAdvisedFilterFamilies` with a positive gain, the largest first
 * (that order on a tie); `null` when none helps.
 */
export function visualFilterFamiliesByGain(target) {
  const helping = visualAdvisedFilterFamilies
    .map((family, index) => ({
      family,
      index,
      gain: visualFilterGain(target, family),
    }))
    .filter((entry) => entry.gain > 0)
    .sort((a, b) => b.gain - a.gain || a.index - b.index)
    .map((entry) => entry.family);
  return helping.length ? helping : null;
}
