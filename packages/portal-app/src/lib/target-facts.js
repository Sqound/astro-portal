// The facts table of the catalogue texts.
//
// One row per target; each fact is a list of values, each value with its
// unit and its source. The model that writes a text sees only this table
// (« the model writes only from the facts table »), and
// `target-text-check.js` compares every number of the text with it.
//
// Sources, in the order the table trusts them:
//   - `curated`   — the published distances of `astro-core/target-distances.json`
// , each with its bibliographic reference;
//   - `wikidata`  — Wikidata (CC0): the statement's entity, property, rank,
//                   references and qualifiers, as Wikidata gives them;
//   - `seed`      — the target catalogue's own fields (OpenNGC, CC BY-SA 4.0:
//                   magnitude, apparent size, radial velocity, type), marked
//                   so that a text built from them keeps the credit line.
// Nothing of SIMBAD's text, nothing non-commercial, nothing without a licence.
//
// Pure: no I/O, no import. The network and the files are the caller's; the
// tests drive this module with small entities.

export const targetFactsSchemaVersion = 1;

/** The Wikidata items of the catalogues the targets belong to (the label
 * is checked at build time, a wrong item stops the build). */
export const catalogueItems = {
  Messier: ["Q14530", "Messier object"],
  NGC: ["Q14534", "New General Catalogue"],
  IC: ["Q741672", "Index Catalogue"],
  Caldwell: ["Q857461", "Caldwell catalogue"],
  Sharpless: ["Q2565783", "Sharpless catalog"],
};

/** The units of the table, by their Wikidata item: symbol, dimension and the
 * factor to the base unit of the dimension (metre, arcsecond, kilogram,
 * year, kelvin, metre per second, metre per second squared). */
const units = [
  ["Q531", "ly", "length", 9.4607304725808e15],
  ["Q12129", "pc", "length", 3.0856775814913673e16],
  ["Q11929860", "kpc", "length", 3.0856775814913673e19],
  ["Q3773454", "Mpc", "length", 3.0856775814913673e22],
  ["Q14916719", "Gpc", "length", 3.0856775814913673e25],
  ["Q828224", "km", "length", 1e3],
  ["Q11573", "m", "length", 1],
  ["Q174789", "mm", "length", 1e-3],
  ["Q1811", "AU", "length", 1.495978707e11],
  ["Q48440", "R☉", "length", 6.957e8],
  ["Q1155470", "R⊕", "length", 6.371e6],
  ["Q829073", "arcsec", "angle", 1],
  ["Q209426", "arcmin", "angle", 60],
  ["Q21500224", "mas", "angle", 1e-3],
  ["Q28390", "deg", "angle", 3600],
  ["Q11570", "kg", "mass", 1],
  ["Q180892", "M☉", "mass", 1.98847e30],
  ["Q681996", "M⊕", "mass", 5.9722e24],
  ["Q651336", "MJ", "mass", 1.89813e27],
  ["Q577", "yr", "duration", 1],
  ["Q217208", "yr", "duration", 1],
  ["Q524410", "Gyr", "duration", 1e9],
  ["Q573", "d", "duration", 1 / 365.25],
  ["Q25235", "h", "duration", 1 / 8766],
  ["Q11579", "K", "temperature", 1],
  ["Q25267", "°C", "temperature", 1],
  ["Q3674704", "km/s", "velocity", 1e3],
  ["Q182429", "m/s", "velocity", 1],
  ["Q180154", "km/h", "velocity", 1 / 3.6],
  ["Q11229", "%", "percent", 1],
  ["Q613726", "Yg", "mass", 1e21],
  ["Q115359865", "Rg", "mass", 1e24],
  ["Q20764", "Myr", "duration", 1e6],
  ["Q11574", "s", "duration", 1 / 31557600],
  ["Q1051665", "m/s²", "acceleration", 1],
  ["Q39699418", "cm/s²", "acceleration", 1e-2],
];

const bySymbol = new Map();
const byItem = new Map();
for (const [item, symbol, dimension, factor] of units) {
  byItem.set(item, { symbol, dimension, factor });
  if (!bySymbol.has(symbol)) bySymbol.set(symbol, { dimension, factor });
}
// Symbols the texts and the checker use that Wikidata has no item for here.
bySymbol.set("Mly", { dimension: "length", factor: 9.4607304725808e21 });
bySymbol.set("kly", { dimension: "length", factor: 9.4607304725808e18 });
bySymbol.set("Gly", { dimension: "length", factor: 9.4607304725808e24 });
bySymbol.set("mag", { dimension: "magnitude", factor: 1 });
bySymbol.set("1", { dimension: "none", factor: 1 });
bySymbol.set("date", { dimension: "date", factor: 1 });
bySymbol.set("km/s/Mpc", { dimension: "hubble", factor: 1 });

export const unitSymbols = () => [...bySymbol.keys()];

/** `{ dimension, base }` of a value in a unit symbol, or `null` when the
 * symbol is unknown. Temperature in °C goes to kelvin. */
export function toBase(value, symbol) {
  const unit = bySymbol.get(symbol);
  if (!unit || !Number.isFinite(value)) return null;
  const base = symbol === "°C" ? value + 273.15 : value * unit.factor;
  return { dimension: unit.dimension, base };
}

export function entityIdOf(uri) {
  return String(uri || "").match(/(Q\d+)$/)?.[1] ?? null;
}

// The properties read on every entity, each in the dimension its values have.
// Several are only ever present on the Solar System bodies; reading them on
// every entity costs nothing and a deep-sky object that has them keeps them.
export const factProperties = {
  discoverer: { property: "P61", type: "item" },
  discoveryYear: { property: "P575", type: "time" },
  distance: { property: "P2583", type: "quantity" },
  diameter: { property: "P2386", type: "quantity" },
  radius: { property: "P2120", type: "quantity" },
  angularDiameter: { property: "P5348", type: "quantity" },
  // Wikidata writes an apparent magnitude without a unit (« 1 »): the table
  // types it `mag` (marked `unitNormalised`), so that the checker reads
  // « magnitude 3,4 » against it.
  magnitude: { property: "P1215", type: "quantity", unitless: "mag" },
  radialVelocity: { property: "P2216", type: "quantity" },
  age: { property: "P7584", type: "quantity" },
  mass: { property: "P2067", type: "quantity" },
  semiMajorAxis: { property: "P2233", type: "quantity" },
  periapsis: { property: "P2244", type: "quantity" },
  apoapsis: { property: "P2243", type: "quantity" },
  orbitalPeriod: { property: "P2146", type: "quantity" },
  rotationPeriod: { property: "P2147", type: "quantity" },
  eccentricity: { property: "P1096", type: "quantity" },
  inclination: { property: "P2045", type: "quantity" },
  temperature: { property: "P2076", type: "quantity" },
  surfaceGravity: { property: "P7015", type: "quantity" },
  // The facts of a catalogue (its year, its size, its author): read on the
  // catalogue items, to let a text name them.
  publicationYear: { property: "P577", type: "time" },
  count: { property: "P1114", type: "quantity" },
  author: { property: "P50", type: "item" },
  instanceOf: { property: "P31", type: "item" },
  constellation: { property: "P59", type: "item" },
};

/** The properties the builder asks Wikidata for. */
export const wikidataProperties = Object.values(factProperties).map(
  (entry) => entry.property,
);

/** Statements of a property: the preferred ones when there are some, else
 * the normal ones; a deprecated statement is never read. */
export function statementsOf(entity, property) {
  const all = (entity?.claims?.[property] || []).filter(
    (statement) => statement?.rank !== "deprecated" && statement?.mainsnak,
  );
  const preferred = all.filter((statement) => statement.rank === "preferred");
  return preferred.length ? preferred : all;
}

function snakText(snak) {
  const value = snak?.datavalue?.value;
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  if (value.id) return value.id;
  if (value.amount !== undefined) return String(value.amount);
  if (value.time) return value.time.replace(/^\+/, "").slice(0, 10);
  if (value.text) return value.text;
  return null;
}

function referencesOf(statement) {
  return (statement.references || [])
    .map((reference) =>
      Object.entries(reference.snaks || {})
        .filter(([property]) =>
          ["P248", "P854", "P143", "P577", "P1476", "P813"].includes(property),
        )
        .map(([property, snaks]) =>
          snaks.map((snak) => `${property}=${snakText(snak)}`).join(","),
        )
        .join(" | "),
    )
    .filter(Boolean)
    .slice(0, 3);
}

function qualifiersOf(statement) {
  const result = {};
  for (const property of ["P459", "P585", "P1227", "P518"]) {
    const snaks = statement.qualifiers?.[property];
    if (snaks?.length) result[property] = snaks.map(snakText).filter(Boolean);
  }
  return Object.keys(result).length ? result : undefined;
}

/** Where a Wikidata value comes from: entity, property, statement, rank,
 * references (when it has some) and the qualifiers that qualify it. */
export function wikidataSource(entityId, property, statement) {
  const references = referencesOf(statement);
  // How well the statement is backed: `referenced` (a « stated in » or a
  // URL), `imported` (only « imported from a Wikimedia project »),
  // `unreferenced`. The text writer treats the last two with care.
  const trust = references.some((reference) => /P248=|P854=/.test(reference))
    ? "referenced"
    : references.length
      ? "imported"
      : "unreferenced";
  return {
    origin: "wikidata",
    qid: entityId,
    property,
    statement: statement.id,
    rank: statement.rank,
    trust,
    ...(references.length ? { references } : {}),
    ...(qualifiersOf(statement) ? { qualifiers: qualifiersOf(statement) } : {}),
  };
}

/** A Wikidata quantity: `{ value, unit, lower?, upper? }`. The unit is the
 * symbol of the table, or the unit's item when the table does not know it
 * (the value is then kept, never converted). */
export function quantityOf(snak) {
  const raw = snak?.datavalue?.value;
  if (!raw || raw.amount === undefined) return null;
  const value = Number(raw.amount);
  if (!Number.isFinite(value)) return null;
  const itemId = entityIdOf(raw.unit);
  const unit =
    raw.unit === "1" || !raw.unit
      ? "1"
      : byItem.get(itemId)?.symbol || itemId || "1";
  const lower = raw.lowerBound === undefined ? null : Number(raw.lowerBound);
  const upper = raw.upperBound === undefined ? null : Number(raw.upperBound);
  return {
    value,
    unit,
    ...(Number.isFinite(lower) && lower !== value ? { lower } : {}),
    ...(Number.isFinite(upper) && upper !== value ? { upper } : {}),
  };
}

const timePrecisions = {
  6: "millennium",
  7: "century",
  8: "decade",
  9: "year",
  10: "month",
  11: "day",
};

/** A Wikidata time as a year: `{ value, precision }`; `null` when the
 * precision is coarser than a millennium or the year is unreadable. */
export function yearOf(snak) {
  const raw = snak?.datavalue?.value;
  if (!raw?.time) return null;
  const year = Number(raw.time.match(/^([+-]\d+)-/)?.[1]);
  if (!Number.isFinite(year)) return null;
  const precision = timePrecisions[raw.precision];
  if (!precision) return null;
  return { value: year, precision };
}

/**
 * The facts of one Wikidata entity: `{ [key]: [ { value, unit?, label?,
 * qid?, source } ] }`, only the keys the entity has. `labelOf(qid)` gives
 * an item's English label (discoverer, constellation, class).
 */
export function factsFromEntity(entity, labelOf = () => null) {
  const facts = {};
  const add = (key, record) => {
    (facts[key] ||= []).push(record);
  };
  for (const [key, spec] of Object.entries(factProperties)) {
    for (const statement of statementsOf(entity, spec.property)) {
      const source = wikidataSource(entity.id, spec.property, statement);
      if (spec.type === "item") {
        const qid = entityIdOf(statement.mainsnak.datavalue?.value?.id);
        if (qid) add(key, { value: labelOf(qid) || qid, qid, source });
      } else if (spec.type === "time") {
        const year = yearOf(statement.mainsnak);
        if (year)
          add(key, {
            value: year.value,
            unit: "date",
            precision: year.precision,
            source,
          });
      } else {
        const quantity = quantityOf(statement.mainsnak);
        if (quantity && spec.unitless && quantity.unit === "1")
          add(key, {
            ...quantity,
            unit: spec.unitless,
            unitNormalised: `Wikidata unit 1 → ${spec.unitless}`,
            source,
          });
        else if (quantity) add(key, { ...quantity, source });
      }
    }
  }
  return facts;
}

/** Light-years of a length value, or `null`. */
export function lightYearsOf(value, unit) {
  const base = toBase(value, unit);
  return base?.dimension === "length"
    ? base.base / bySymbol.get("ly").factor
    : null;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** The largest spread (max / min) the distances of one object may have
 * and still be called consistent. */
export const distanceConsistencyRatio = 1.15;

/**
 * The distance of a target (`docs/STATIC_DATA.md`, « Target distances »:
 * Wikidata's P2583 is a cross-check, never a source, because its values
 * contradict each other for one object).
 *   - an existing distance (`known`: the curated table, then the parallax
 *     and redshift layers) is **retained**, and Wikidata's values are kept
 *     beside it as a cross-check (`retained: false`, `agrees`);
 *   - without one, Wikidata's values are retained only when they agree with
 *     each other within `distanceConsistencyRatio`; the retained value is
 *     the median, written in the unit of the median's statement;
 *   - contradictory values are all kept, none retained, `reason` says why.
 * `known` is `{ value, unit, source }` or `null`.
 */
export function consolidateDistance(known, wikidataValues) {
  const candidates = (wikidataValues || [])
    .map((record) => ({ record, ly: lightYearsOf(record.value, record.unit) }))
    .filter((entry) => entry.ly !== null && entry.ly > 0);
  if (known) {
    const knownLy = lightYearsOf(known.value, known.unit);
    return [
      { ...known, retained: true },
      ...candidates.map(({ record, ly }) => ({
        ...record,
        retained: false,
        reason: "cross-check",
        agrees: knownLy
          ? Math.max(ly, knownLy) / Math.min(ly, knownLy) <= 1.3
          : null,
      })),
    ];
  }
  if (!candidates.length) return [];
  const values = candidates.map((entry) => entry.ly);
  const spread = Math.max(...values) / Math.min(...values);
  if (spread <= distanceConsistencyRatio) {
    const middle = median(values);
    const nearest = candidates.reduce((best, entry) =>
      Math.abs(entry.ly - middle) < Math.abs(best.ly - middle) ? entry : best,
    );
    return candidates.map(({ record, ly }) => ({
      ...record,
      retained: ly === nearest.ly,
      ...(ly === nearest.ly ? {} : { reason: "consistent, not the median" }),
    }));
  }
  return candidates.map(({ record }) => ({
    ...record,
    retained: false,
    reason: `contradictory (spread x${spread.toFixed(1)})`,
  }));
}

/** The spread of a quantity's values, `max/min`, for the coverage report;
 * `null` for fewer than two positive values of one dimension. */
export function spreadOf(records) {
  const bases = (records || [])
    .map((record) => toBase(record.value, record.unit))
    .filter((base) => base && base.base > 0);
  if (bases.length < 2) return null;
  return (
    Math.max(...bases.map((b) => b.base)) /
    Math.min(...bases.map((b) => b.base))
  );
}

// ---------------------------------------------------------------------------
// The identifiers a target is looked up by.

const wikidataCatalogues = {
  M: "Q14530",
  NGC: "Q14534",
  IC: "Q741672",
  // Not « C »: Wikidata files « C 14 » under the Chomiński catalog, and
  // « B 33 » under the Brown catalog (found out the hard way: the items the
  // codes find are not the Caldwell or Barnard objects). Barnard is
  // written « Barnard 33 », under its own catalogue item.
  Barnard: "Q3247327",
  LDN: "Q68581348",
  LBN: "Q13411059",
  "SH 2-": "Q66381095",
};

/** A match is accepted without a confirming position only when a code of
 * these catalogues found it: the others are written in Wikidata with items
 * that are not the catalogue itself (« LDN » is filed under a journal
 * article, « SH 2- » under the 1959 paper). */
export const trustedCodePrefixes = ["NGC ", "IC ", "M ", "LBN ", "Barnard "];

export function matchIsTrusted(resolved) {
  if (!resolved?.entity) return false;
  if (resolved.positionChecked) return true;
  return (resolved.codes || []).some((code) =>
    trustedCodePrefixes.some((prefix) => code.startsWith(prefix)),
  );
}

/** The catalogues of Wikidata the builder scans (item of the catalogue,
 * and the prefix of the code Wikidata writes for it in P528). */
export const wikidataCatalogueScans = Object.entries(wikidataCatalogues).map(
  ([prefix, catalogue]) => ({ prefix, catalogue }),
);

/**
 * The `(catalogue item, P528 code)` pairs that can name a target, from its
 * designation and aliases (`M31`, `NGC 224`, `C014`, `B033`, `Sh2-240`,
 * `LDN 1622`, `LBN 777`, `IC 1396`). Wikidata writes « M 31 », « NGC 224 »,
 * « C 14 », « B 33 », « SH 2-274 », « LDN 1622 »: no leading zero, a space.
 */
export function wikidataCodesFor(target) {
  const names = [target.designation, ...(target.aliases || [])];
  const pairs = new Map();
  const add = (prefix, number, suffix = "") => {
    const catalogue = wikidataCatalogues[prefix];
    if (!catalogue) return;
    const code =
      prefix === "SH 2-"
        ? `${prefix}${number}${suffix}`
        : `${prefix} ${number}${suffix}`;
    pairs.set(`${catalogue}|${code}`, { catalogue, code });
  };
  for (const raw of names) {
    const name = String(raw || "").trim();
    let match;
    if ((match = name.match(/^M\s?(\d+)$/i))) add("M", Number(match[1]));
    else if ((match = name.match(/^NGC\s?0*(\d+)([A-Z]?)$/i)))
      add("NGC", Number(match[1]), match[2].toUpperCase());
    else if ((match = name.match(/^IC\s?0*(\d+)([A-Z]?)$/i)))
      add("IC", Number(match[1]), match[2].toUpperCase());
    else if ((match = name.match(/^B\s?0*(\d+)([A-Z]?)$/i)))
      add("Barnard", Number(match[1]), match[2].toUpperCase());
    else if ((match = name.match(/^LDN\s?0*(\d+)$/i)))
      add("LDN", Number(match[1]));
    else if ((match = name.match(/^LBN\s?0*(\d+)$/i)))
      add("LBN", Number(match[1]));
    else if ((match = name.match(/^Sh\s?2[- ]?0*(\d+)([A-Z]?)$/i)))
      add("SH 2-", Number(match[1]), match[2].toUpperCase());
  }
  return [...pairs.values()];
}

/** The designation labels Wikidata may carry for an object that has no
 * catalogue statement (the fallback lookup by English label). */
export function wikidataLabelsFor(target) {
  const labels = new Set();
  const designation = String(target.designation || "").trim();
  let match;
  if ((match = designation.match(/^Abell\s?(\d+)$/i)))
    labels.add(`Abell ${match[1]}`);
  if ((match = designation.match(/^Sh\s?2[- ]?(\d+)$/i)))
    labels.add(`Sh2-${match[1]}`);
  for (const name of target.commonNames || []) labels.add(String(name));
  return [...labels].filter(Boolean);
}

/** The sky position Wikidata gives an entity, in degrees: right ascension
 * (P6257, in degrees or hours) and declination (P6258, in degrees). */
export function positionOf(entity) {
  const read = (property, hoursAllowed) => {
    const quantity = quantityOf(statementsOf(entity, property)[0]?.mainsnak);
    if (quantity?.unit === "deg") return quantity.value;
    // A right ascension is often written in hours.
    if (hoursAllowed && quantity?.unit === "h") return quantity.value * 15;
    return null;
  };
  const ra = read("P6257", true);
  const dec = read("P6258", false);
  return ra === null || dec === null ? null : { ra, dec };
}

/** Angular separation in degrees between two (ra, dec) positions in degrees. */
export function separationDegrees(a, b) {
  const rad = Math.PI / 180;
  const cosine =
    Math.sin(a.dec * rad) * Math.sin(b.dec * rad) +
    Math.cos(a.dec * rad) *
      Math.cos(b.dec * rad) *
      Math.cos((a.ra - b.ra) * rad);
  return Math.acos(Math.min(1, Math.max(-1, cosine))) / rad;
}

/** A match whose Wikidata position is further than this from the target's
 * catalogue position is rejected (a wrong object under the same code). */
export const positionToleranceDegrees = 1;

/**
 * Picks the entity of a target among the candidate entities its codes
 * found: the one found by the most codes, then the one with the most
 * statements. `candidates` is `[{ entity, codes }]`. Each candidate whose
 * position is known and further than the tolerance is dropped first.
 * Returns `{ entity, codes, others, rejected }` or `null`.
 */
export function chooseEntity(target, candidates) {
  const here =
    target.coordinate && Number.isFinite(target.coordinate.ra)
      ? { ra: target.coordinate.ra * 15, dec: target.coordinate.dec }
      : null;
  const rejected = [];
  const kept = [];
  for (const candidate of candidates) {
    const position = positionOf(candidate.entity);
    if (
      here &&
      position &&
      separationDegrees(here, position) > positionToleranceDegrees
    )
      rejected.push(candidate.entity.id);
    else kept.push(candidate);
  }
  if (!kept.length) return rejected.length ? { entity: null, rejected } : null;
  const count = (candidate) =>
    Object.keys(candidate.entity.claims || {}).length;
  kept.sort((a, b) => b.codes.length - a.codes.length || count(b) - count(a));
  return {
    entity: kept[0].entity,
    codes: kept[0].codes,
    others: kept.slice(1).map((candidate) => candidate.entity.id),
    rejected,
    positionChecked: Boolean(here && positionOf(kept[0].entity)),
  };
}

// ---------------------------------------------------------------------------
// The seed's own facts.

const openNgcLicence = "CC BY-SA 4.0 (OpenNGC)";

/** The facts the catalogue seed itself carries, marked as such. */
export function factsFromSeed(target) {
  const facts = {};
  const source = (field) => ({
    origin: "seed",
    field,
    licence: openNgcLicence,
  });
  const [major, minor] = Array.isArray(target.apparentSizeArcmin)
    ? target.apparentSizeArcmin.map((value) =>
        value === null ? NaN : Number(value),
      )
    : [];
  if (Number.isFinite(major) && major > 0) {
    facts.apparentSize = [
      {
        value: major,
        unit: "arcmin",
        axis: "major",
        source: source("apparentSizeArcmin[0]"),
      },
    ];
    if (Number.isFinite(minor) && minor > 0 && Math.abs(minor - major) > 0.005)
      facts.apparentSize.push({
        value: minor,
        unit: "arcmin",
        axis: "minor",
        source: source("apparentSizeArcmin[1]"),
      });
  }
  const magnitude = Number(target.magnitude);
  if (
    target.magnitude !== null &&
    target.magnitude !== undefined &&
    Number.isFinite(magnitude)
  )
    facts.magnitude = [
      { value: magnitude, unit: "mag", source: source("magnitude") },
    ];
  const velocity = Number(
    target.source?.radialVelocityKmS ?? target.radialVelocityKmS,
  );
  if (
    (target.source?.radialVelocityKmS ?? target.radialVelocityKmS) !== null &&
    (target.source?.radialVelocityKmS ?? target.radialVelocityKmS) !==
      undefined &&
    Number.isFinite(velocity)
  )
    facts.radialVelocity = [
      { value: velocity, unit: "km/s", source: source("radialVelocityKmS") },
    ];
  if (target.typeKey)
    facts.type = [{ value: target.typeKey, source: source("typeKey") }];
  if (target.constellationKey)
    facts.constellation = [
      { value: target.constellationKey, source: source("constellationKey") },
    ];
  return facts;
}

/** The distance record of the target's existing layers (`published`,
 * `parallax`, `redshift`) as a table value, in light-years. */
export function knownDistance(distance) {
  const lightYears = Number(distance?.lightYears);
  if (!distance || !Number.isFinite(lightYears) || lightYears <= 0) return null;
  return {
    value: lightYears,
    unit: "ly",
    layer: distance.source,
    estimate: distance.source === "redshift",
    source: {
      origin: distance.source === "published" ? "curated" : "seed",
      layer: distance.source,
      reference: distance.reference,
      ...(distance.source === "published" ? {} : { licence: openNgcLicence }),
    },
  };
}

/** Merges the facts of the seed, the existing distance and Wikidata into the
 * facts of a row; the distance goes through `consolidateDistance`. */
export function mergeFacts({ seedFacts, wikidataFacts, known }) {
  const facts = { ...seedFacts };
  for (const [key, records] of Object.entries(wikidataFacts || {})) {
    if (key === "distance") continue;
    facts[key] = [...(facts[key] || []), ...records];
  }
  const distance = consolidateDistance(known, wikidataFacts?.distance);
  if (distance.length) facts.distance = distance;
  // A distance of the redshift layer is a model: the constant it rests on is
  // a fact a text may state (« 70 km/s/Mpc »).
  if (known?.layer === "redshift")
    facts.hubbleConstant = [
      { value: 70, unit: "km/s/Mpc", source: known.source },
    ];
  return facts;
}

/** The tier of a target for the coverage tables. */
export function tierOf(target) {
  if (target.catalogue === "Système solaire") return "solar-system";
  if (target.isBest) return "essential";
  if (target.isExtended) return "extended";
  return "rest";
}

/** The facts of the table that carry a number (the ones a text may quote). */
export const numericFactKeys = [
  "discoveryYear",
  "distance",
  "diameter",
  "radius",
  "angularDiameter",
  "apparentSize",
  "magnitude",
  "radialVelocity",
  "age",
  "mass",
  "semiMajorAxis",
  "periapsis",
  "apoapsis",
  "orbitalPeriod",
  "rotationPeriod",
  "eccentricity",
  "inclination",
  "temperature",
  "surfaceGravity",
];
