import { message } from "portal/i18n.js";
import { equipmentSearch, foldForSearch } from "./equipment-search.js";
import {
  orderedTelescopeGroups,
  sortTelescopes,
  telescopeDisplayName,
  telescopeMaker,
} from "./telescope-order.js";
import {
  binocularsExitPupilMm,
  binocularsTrueFieldDegrees,
  instrumentKindOf,
} from "portal/equipment/instrument-kind.js";

export { foldForSearch };

// The telescope field of the "Matériel" stage on the web: the owner's own
// telescopes and the common ones in groups, one line of facts after each
// name, a search over the names, and a connected telescope's fixed camera and
// mount. Pure functions, so the rules are the same wherever the field is
// drawn and are testable without the page.

const groupLabelKeys = {
  connected: "plannerGroupConnected",
  refractors: "plannerGroupRefractors",
  reflectors: "plannerGroupReflectors",
  binoculars: "plannerKindTelescopeBinoculars",
};

// The profiles whose display name holds every word of `query`, case and
// accents ignored (the maker is part of the name a picker shows: "zwo"
// finds the Seestar); all of them for an empty query.
export function searchTelescopes(profiles = [], query = "") {
  return equipmentSearch({
    category: "telescope",
    mine: profiles,
    query,
    nameOf: telescopeDisplayName,
    makerOf: telescopeMaker,
  }).mine;
}

// What the telescope picker shows for a text and the menus « Marque » and
// « Type » (`equipment-search.js`): the rows, the menus' values and counts.
export function telescopeSearch(
  { mine = [], common = [] },
  query = "",
  { maker = null, kind = null } = {},
) {
  return equipmentSearch({
    category: "telescope",
    mine,
    defaults: common,
    query,
    maker,
    kind,
    nameOf: telescopeDisplayName,
    makerOf: telescopeMaker,
  });
}

function number(locale, value) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
    value,
  );
}

// "50 mm · 250 mm · f/5": aperture, focal length with the locale's
// grouping, the f-ratio with one decimal at most and the locale's decimal
// sign. The line of the option and the readout under the select say it the
// same way.
export function telescopeOpticsLine(locale, profile) {
  const aperture = Number(profile?.apertureMm);
  const focal = Number(profile?.focalLengthMm);
  const known = aperture > 0 && focal > 0;
  return [
    `${known ? number(locale, aperture) : "—"} mm`,
    `${known ? number(locale, focal) : "—"} mm`,
    `f/${known ? number(locale, focal / aperture) : "—"}`,
  ].join(" · ");
}

// Whether the figures of a profile are estimates. The common profiles list the
// values they `calculated` and how (`calculation`); one that begins "Estimation
// :" is not the maker's (a retailer's, the press's or a community page's
// figure), any other is arithmetic on the maker's own figures. A connected
// telescope is estimated when its integrated camera is.
const isEstimate = (calculation) =>
  typeof calculation === "string" &&
  calculation.trimStart().startsWith("Estimation");
export function equipmentProfileIsEstimated(profile) {
  if (!profile) return false;
  return (
    isEstimate(profile.calculation) ||
    isEstimate(profile.integratedCamera?.calculation)
  );
}

// The effective focal length as the readout writes it. A telescope that is
// not chosen or not filled in resolves to 0, which is an absence, never a
// focal length: "—", not "0 mm".
export function effectiveFocalLengthText(locale, focalLengthMm) {
  const value = Number(focalLengthMm);
  if (!Number.isFinite(value) || value <= 0) return "—";
  return `${number(locale, value)} mm`;
}

// "50 mm · 250 mm · f/5 · caméra intégrée": the optics, then the integrated
// camera for a connected telescope.
export function telescopeSpecLine(locale, profile) {
  // EQUIPMENT-INSTRUMENTS-01: binoculars say « 10× · 50 mm · 6,5° · 5 mm »
  // (magnification, objective, real field, exit pupil), a smartphone its
  // field and its f-number.
  const kind = instrumentKindOf(profile);
  if (kind === "binoculars") {
    const power = Number(profile?.magnification);
    const aperture = Number(profile?.apertureMm);
    const field = binocularsTrueFieldDegrees(profile);
    const pupil = binocularsExitPupilMm(aperture, power);
    return [
      power > 0 && `${number(locale, power)}×`,
      aperture > 0 && `${number(locale, aperture)} mm`,
      field && `${number(locale, field)}°`,
      pupil && `${number(locale, pupil)} mm`,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (kind === "smartphone") {
    const phone = profile?.phone || {};
    return [
      phone.fieldWidthDegrees > 0 &&
        phone.fieldHeightDegrees > 0 &&
        `${Math.round(phone.fieldWidthDegrees)}° × ${Math.round(phone.fieldHeightDegrees)}°`,
      phone.fNumber > 0 && `f/${number(locale, phone.fNumber)}`,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  return [
    telescopeOpticsLine(locale, profile),
    ...(profile.integratedCamera
      ? [message(locale, "plannerSpecIntegratedCamera")]
      : []),
  ].join(" · ");
}

// The text of an option of the native select: "maker model · line of facts".
export function telescopeOptionLabel(locale, profile) {
  return `${telescopeDisplayName(profile)} · ${telescopeSpecLine(locale, profile)}`;
}

// The groups the select shows, in order: "Mon matériel" (the owner's own
// telescopes, in the order the owner keeps them), then the common groups
// (connected, refractors, reflectors), each by maker then model; a group
// with no match is left out with its label. A telescope with no group (a
// stored list older than the groups) is listed with no label, last.
//
// `defaultsLabelled` (a signed-in person): the common groups are the
// administration's "Matériel par défaut", and a native `<optgroup>`
// cannot nest, so the kind becomes the second half of the label
// ("Matériel par défaut · Lunette"); a default telescope without a group
// is listed last under "Matériel par défaut".
//
// `filters` are the menus' values (`{ maker, kind }`): they narrow the
// common groups, never "Mon matériel".
export function telescopeGroups(
  locale,
  { mine = [], common = [], defaultsLabelled = false },
  query = "",
  filters = {},
) {
  const defaultLabel = message(locale, "plannerGroupDefault");
  const groups = [];
  const shown = telescopeSearch({ mine, common }, query, filters);
  const ownMatches = shown.mine;
  if (ownMatches.length)
    groups.push({
      key: "mine",
      label: message(locale, "plannerGroupMine"),
      profiles: ownMatches,
    });
  const met = [];
  for (const profile of common)
    if (profile.group && !met.includes(profile.group)) met.push(profile.group);
  for (const group of orderedTelescopeGroups(met)) {
    const matches = sortTelescopes(
      shown.defaults.filter((profile) => profile.group === group),
    );
    if (matches.length) {
      const kind = groupLabelKeys[group]
        ? message(locale, groupLabelKeys[group])
        : group;
      groups.push({
        key: group,
        label: defaultsLabelled ? `${defaultLabel} · ${kind}` : kind,
        profiles: matches,
      });
    }
  }
  const ungrouped = sortTelescopes(
    shown.defaults.filter((profile) => !profile.group),
  );
  if (ungrouped.length)
    groups.push({
      key: "ungrouped",
      label: defaultsLabelled ? defaultLabel : "",
      profiles: ungrouped,
    });
  return groups;
}

// A connected telescope's camera, built into the same housing:
// "Intégrée au Seestar S50 · IMX462" and the sentence that says why.
export function integratedCameraLine(locale, telescope) {
  return message(locale, "plannerIntegratedCamera")
    .replace("{telescope}", telescope.name)
    .replace("{sensor}", telescope.integratedCamera?.name || "");
}

export function integratedCameraNote(locale, telescope) {
  return message(locale, "plannerIntegratedCameraNote").replace(
    "{telescope}",
    telescope.name,
  );
}

// "Azimutale intégrée" (the common profiles' `integrated-altaz`, and a
// mount without a name), "Équatoriale intégrée" (`integrated-eq`, the box
// "Télescope intelligent" of "Mon matériel"), else its own name.
export function integratedMountName(locale, telescope) {
  if (telescope.mount?.id === "integrated-eq")
    return message(locale, "plannerMountIntegratedEquatorial");
  return !telescope.mount ||
    telescope.mount.id === "integrated-altaz" ||
    !String(telescope.mount.name || "").trim()
    ? message(locale, "plannerMountIntegratedAltaz")
    : telescope.mount.name;
}

// What the stage's header names: a connected telescope alone in imaging mode
// (its camera is part of it), else the resolved equipment's name.
// A smart telescope takes no reducer: its name alone.
export function equipmentStageName(equipment, telescope, _modifier, visual) {
  if (visual || !telescope?.integratedCamera) return equipment.name;
  return telescope.name;
}
