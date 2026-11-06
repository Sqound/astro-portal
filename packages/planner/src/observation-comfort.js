// « Observation confortable »:
// in visual, the heights at which the eyepiece is easy to reach with the
// plan's instrument. A refractor's eyepiece sits at the back, behind a
// diagonal: past a certain height the observer has to crouch under it. A
// Newtonian on a Dobsonian mount has its eyepiece at the top of the tube: the
// lower the target, the lower the eyepiece. With the switch on, the
// suggestions prefer the targets that pass through that range tonight and
// place them while they are inside it (`autoFillNight`'s `comfort`). It is a
// preference, never a filter: a target outside the range stays offered,
// lower, and stays choosable.
//
// The ranges are starting values, to be confirmed on the captures:
// they live in this one table, nowhere else.

/**
 * The comfortable height of each family of instruments, in degrees:
 * `minAltitude`/`maxAltitude`, `null` for no bound on that side. The bottom
 * of a range never goes under the plan's minimum height nor under the horizon
 * mask: the suggestions only ever place a target inside its quality windows,
 * which already hold both.
 */
export const observationComfortRanges = Object.freeze({
  // A refractor: the eyepiece at the back, behind a diagonal.
  refractor: Object.freeze({ minAltitude: null, maxAltitude: 65 }),
  // Schmidt-Cassegrain, Maksutov, Cassegrain, Ritchey-Chrétien: the same.
  "rear-eyepiece": Object.freeze({ minAltitude: null, maxAltitude: 65 }),
  // A Newtonian on a Dobsonian or alt-azimuth mount: the eyepiece at the top
  // of the tube, low when the target is low.
  "newtonian-altaz": Object.freeze({ minAltitude: 30, maxAltitude: null }),
  // A Newtonian on an equatorial mount: the eyepiece turns with the tube.
  "newtonian-equatorial": Object.freeze({ minAltitude: 25, maxAltitude: 75 }),
  // Binoculars, held or on a photo tripod.
  binoculars: Object.freeze({ minAltitude: null, maxAltitude: 55 }),
});

const rearEyepieceKinds = new Set([
  "schmidt-cassegrain",
  "maksutov",
  "cassegrain",
  "ritchey-chretien",
]);

function fold(value) {
  return typeof value === "string"
    ? value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    : "";
}

// The kind of a telescope: its own `kind` (the data file's, or the one the
// inventory keeps), else read from its name.
function telescopeKind(telescope) {
  const kind = typeof telescope?.kind === "string" ? telescope.kind.trim() : "";
  if (kind) return kind;
  const name = fold(telescope?.name);
  if (/dob|newton|reflect/.test(name)) return "newtonian";
  if (/schmidt|\bsct\b|edge ?hd|\bc(5|6|8|9|11|14)\b/.test(name))
    return "schmidt-cassegrain";
  if (/maksutov|\bmak\b/.test(name)) return "maksutov";
  if (/ritchey|\brc\b/.test(name)) return "ritchey-chretien";
  if (/cassegrain/.test(name)) return "cassegrain";
  if (
    /lunette|refract|refrakt|rifratt|refrat|\bapo\b|\bed\b|triplet|doublet|achromat/.test(
      name,
    )
  )
    return "refractor";
  return "";
}

// Whether a Newtonian sits on an equatorial mount: the plan's mount, else
// the telescope's own, read by id and name. A Dobson is alt-azimuth, and so
// is a Newtonian whose mount is unknown (the common case in visual).
function newtonianOnEquatorial(telescope, mount) {
  const ids = [mount?.id, telescope?.mount?.id].map((id) => String(id ?? ""));
  if (ids.includes("integrated-eq")) return true;
  if (ids.includes("integrated-altaz")) return false;
  if (/dob/.test(fold(telescope?.name))) return false;
  // A mount of the common profiles says what it is (`kind`); a hybrid one
  // (AZ-EQ, HAE, NYX) is read by its name, as before.
  const kinds = [mount?.kind, telescope?.mount?.kind];
  if (kinds.includes("equatorial") || kinds.includes("tracker")) return true;
  if (kinds.includes("altaz")) return false;
  const text = fold(
    [mount?.name, telescope?.mount?.name, mount?.id].filter(Boolean).join(" "),
  );
  if (/dob|alt.?az|azimut|\baz\b|az-?gti/.test(text)) return false;
  return /\beq|equat|\bheq|\bneq|\bcem|\bcgem|\bgem\b/.test(text);
}

/**
 * The family of the plan's instrument for « Observation confortable »:
 * `refractor`, `rear-eyepiece`, `newtonian-altaz`, `newtonian-equatorial`,
 * `binoculars`, or `naked-eye` (visual without a telescope: no height is
 * uncomfortable, the switch is not offered). `null` when the switch is not
 * offered at all: photo, a smart telescope (the posture does not count
 * there), or an instrument whose kind cannot be told.
 *
 * `telescope` is the plan's telescope profile (`kind`, `name`,
 * `isBinoculars`, `integratedCamera`, `mount`), `mount` the plan's mount
 * (`{ id, name }`) when there is one.
 */
export function observationComfortFamily({ mode, telescope, mount } = {}) {
  if (mode !== "visual") return null;
  if (!telescope || typeof telescope !== "object") return "naked-eye";
  if (telescope.integratedCamera) return null;
  if (telescope.isBinoculars === true) return "binoculars";
  const kind = telescopeKind(telescope);
  if (kind === "smart") return null;
  if (kind === "refractor") return "refractor";
  if (rearEyepieceKinds.has(kind)) return "rear-eyepiece";
  if (kind === "newtonian")
    return newtonianOnEquatorial(telescope, mount)
      ? "newtonian-equatorial"
      : "newtonian-altaz";
  return null;
}

/**
 * The comfortable range of a family (`{ minAltitude, maxAltitude }`), for
 * `autoFillNight`'s `comfort`; `null` for `naked-eye`, an unknown family or
 * none.
 */
export function observationComfortRange(family) {
  return Object.hasOwn(observationComfortRanges, family ?? "")
    ? { ...observationComfortRanges[family] }
    : null;
}

/**
 * The choice « Confort » every suggestion dialog of this browser shares
 * (`planner.suggest.comfort.v1`, as the mobile preference): `true` for
 * « Visée confortable ». A browser that keeps nothing answers `false`.
 */
export const observationComfortStorageKey = "planner.suggest.comfort.v1";

// What this page chose last, for a browser that keeps nothing.
let chosenHere = null;

export function readObservationComfort(storage) {
  try {
    const kept = storage?.getItem(observationComfortStorageKey);
    if (kept === "on" || kept === "off") return kept === "on";
  } catch {
    // Nothing kept: what this page chose, if anything.
  }
  return chosenHere === true;
}

export function writeObservationComfort(storage, on) {
  chosenHere = Boolean(on);
  try {
    storage?.setItem(observationComfortStorageKey, on ? "on" : "off");
  } catch {
    // A browser that keeps nothing: the choice lasts while the page does.
  }
}
