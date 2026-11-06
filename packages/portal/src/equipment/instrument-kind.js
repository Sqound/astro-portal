// The instruments of « Mon matériel » (EQUIPMENT-INSTRUMENTS-01): a
// telescope, a pair of binoculars, or a smartphone on a tripod. All three are
// the same item of the contract (`type: "telescope"` of
// `equipment.schema.json`, unchanged): the kind lives in the item's
// `planner.kind` (a profile's own `kind`), next to the optical formula a
// telescope keeps there (« Lunette », « Newton »…).
//
// - Binoculars carry their magnification and their real field in
//   `specifications` (`magnification`, `trueFieldDegrees`, optionally
//   `apparentFieldDegrees`); the exit pupil is computed (aperture ÷
//   magnification). The former box « Cet instrument est une paire de
//   jumelles » (`isBinoculars`) reads as this kind: an item that has it and
//   no kind is converted ([migrateBinocularsItem]); `isBinoculars` is still
//   written, true for binoculars, for the readers that predate the kind.
// - A smartphone on a tripod is made by the app only (« Ajouter ce
//   téléphone »): its camera is `planner.integratedCamera`, its tripod
//   `planner.mount`, like a smart telescope, and `planner.phone` keeps what
//   the phone said of itself. On iOS the OS gives
//   no real focal length nor sensor size: the item then holds the 35 mm
//   equivalent ones (`phone.equivalentFrame`), which give the same field.
// - The mobile application holds the same rule; the
//   planner (`packages/planner/src/planner.js`) reads it from here.

export const INSTRUMENT_KINDS = Object.freeze([
  "telescope",
  "binoculars",
  "smartphone",
]);

const plain = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

/**
 * `telescope`, `binoculars` or `smartphone` for an item of « Mon matériel »
 * (its `planner.kind`, else its `isBinoculars`) or a profile (its `kind`).
 */
export function instrumentKindOf(entry) {
  if (!entry || typeof entry !== "object") return "telescope";
  const own = typeof entry.kind === "string" ? entry.kind.trim() : "";
  const planner = plain(entry.planner);
  const kind =
    own || (typeof planner.kind === "string" ? planner.kind.trim() : "");
  if (kind === "smartphone") return "smartphone";
  if (kind === "binoculars" || entry.isBinoculars === true) return "binoculars";
  return "telescope";
}

/**
 * An item of « Mon matériel » once the former box « paire de jumelles » is
 * read as the kind: a telescope item with `isBinoculars` and another kind (or
 * none) gets `planner.kind: "binoculars"`; any other item is returned as is.
 */
export function migrateBinocularsItem(item) {
  if (!item || typeof item !== "object" || item.type !== "telescope") {
    return item;
  }
  if (item.isBinoculars !== true) return item;
  const planner = plain(item.planner);
  if (planner.kind === "binoculars") return item;
  return { ...item, planner: { ...planner, kind: "binoculars" } };
}

const positive = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

/** Aperture ÷ magnification, millimetres; `null` without both. */
export function binocularsExitPupilMm(apertureMm, magnification) {
  const aperture = positive(apertureMm);
  const power = positive(magnification);
  return aperture && power ? aperture / power : null;
}

/**
 * The real field of a pair of binoculars, degrees: the maker's, else the
 * apparent field ÷ the magnification; `null` without either.
 */
export function binocularsTrueFieldDegrees(profile) {
  const source = plain(profile);
  const real = positive(source.trueFieldDegrees);
  if (real) return real;
  const apparent = positive(source.apparentFieldDegrees);
  const power = positive(source.magnification);
  return apparent && power ? apparent / power : null;
}
