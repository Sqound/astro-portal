import { normaliseMeridianLimit } from "./constraints.js";
import { cardinalDirection } from "portal/planner/cardinal-directions.js";
import {
  Body,
  Equator,
  EquatorFromVector,
  Horizon,
  Illumination,
  Observer,
  RotateVector,
  Rotation_EQJ_EQD,
  Vector,
} from "astronomy-engine";
import { coordinateForTarget } from "astro-core/sky-coordinates.js";
import {
  selectionModeOfEquipmentMode,
  targetInSelectionPool,
} from "astro-core/target-selection.js";
import {
  localizedPlannerName,
  plannerCatalogue,
} from "astro-core/planner-targets.js";
import {
  canonicalObjectType,
  taxonomyLabel,
} from "astro-core/catalog-taxonomy.js";
import {
  SUNRISE_SUNSET_ALTITUDE,
  darknessAltitude,
  nightAltitudeCrossings,
  validTimeZone,
  zonedDate,
  zonedDateOrLongitudeAnchor,
} from "astro-core/night-window.js";
import { copyFor } from "portal/locales.js";
import { targetLookupKey } from "portal/target-library.js";
import {
  nightSpanRule,
  normalizeNightSpan,
  normalizePlanDarkness,
} from "portal/planner/state.js";
import commonEquipmentData from "./common-equipment-profiles.json" with { type: "json" };
import { instrumentKindOf } from "portal/equipment/instrument-kind.js";
import eyepieceViewConstants from "./eyepiece-view-constants.json" with { type: "json" };
import {
  instrumentLimitingMagnitude,
  schaeferLimitingMagnitude,
  schaeferNelmSkyOffset,
  schaeferNelmZero,
  visualEyePupilMm,
} from "./visual-limits.js";
import {
  filterFamily,
  genericPlannerFilters,
  recommendedFilterFamilies,
  targetFilterCompatibility,
} from "./filters.js";
import {
  visualFilterGain,
  visualStructureRule,
  visualTargetStructure,
} from "./visual-model.js";
import { visualBestPair } from "./visual-pairs.js";

const DEG = Math.PI / 180;

// Angular dimensions are deliberately approximate visual extents (arcminutes),
// not sensor frames. They are useful for a framing recommendation and remain
// editable when the curated deep-sky catalogue is expanded.
const apparentSizesArcmin = {
  "IC 1318": [180, 120],
  "IC 1396": [170, 140],
  "IC 1805": [150, 150],
  "IC 342": [21, 21],
  "IC 410": [40, 30],
  "IC 434": [60, 10],
  "IC 443": [50, 40],
  LDN1235: [80, 60],
  M1: [6, 4],
  M100: [7, 6],
  M101: [28, 28],
  M13: [20, 20],
  M16: [35, 28],
  M17: [46, 37],
  M27: [8, 6],
  M31: [190, 60],
  M37: [24, 24],
  M40: [8, 8],
  M42: [85, 60],
  M43: [20, 15],
  M45: [110, 110],
  M51: [11, 7],
  M57: [1.4, 1.1],
  M64: [10, 5],
  M65: [9, 2],
  M78: [8, 6],
  M8: [90, 40],
  M81: [27, 14],
  M82: [11, 5],
  M97: [3.4, 3.4],
  "NGC 1491": [20, 15],
  "NGC 1579": [12, 10],
  "NGC 2024": [30, 20],
  "NGC 2174": [40, 30],
  "NGC 2392": [0.8, 0.8],
  "NGC 2903": [13, 6],
  "NGC 4490": [7, 2],
  "NGC 4565": [15, 3],
  "NGC 6960": [210, 160],
  "NGC 6992": [60, 8],
  "NGC 7000": [120, 100],
  "NGC 7023": [20, 16],
  "NGC 7635": [8, 6],
  Sadr: [150, 100],
};

export const plannerPlanetDefinitions = [
  {
    body: Body.Mercury,
    name: "Mercure",
    apparentSizeArcmin: [0.2, 0.2],
    imageUrl:
      "https://images-assets.nasa.gov/image/PIA13823/PIA13823~thumb.jpg",
  },
  {
    body: Body.Venus,
    name: "Vénus",
    apparentSizeArcmin: [0.8, 0.8],
    imageUrl:
      "https://images-assets.nasa.gov/image/PIA23791/PIA23791~thumb.jpg",
  },
  {
    body: Body.Mars,
    name: "Mars",
    apparentSizeArcmin: [0.4, 0.4],
    imageUrl:
      "https://images-assets.nasa.gov/image/PIA00407/PIA00407~thumb.jpg",
  },
  {
    body: Body.Jupiter,
    name: "Jupiter",
    apparentSizeArcmin: [0.8, 0.8],
    imageUrl:
      "https://images-assets.nasa.gov/image/PIA01509/PIA01509~thumb.jpg",
  },
  {
    body: Body.Saturn,
    name: "Saturne",
    apparentSizeArcmin: [0.5, 0.5],
    imageUrl:
      "https://images-assets.nasa.gov/image/PIA02225/PIA02225~thumb.jpg",
  },
  {
    body: Body.Uranus,
    name: "Uranus",
    apparentSizeArcmin: [0.1, 0.1],
    imageUrl:
      "https://images-assets.nasa.gov/image/PIA18182/PIA18182~thumb.jpg",
  },
  {
    body: Body.Neptune,
    name: "Neptune",
    apparentSizeArcmin: [0.05, 0.05],
    imageUrl:
      "https://images-assets.nasa.gov/image/PIA01492/PIA01492~thumb.jpg",
  },
];

// The common equipment profiles: one data file of the open core, every
// value from its maker's page. A connected telescope
// carries its integrated camera and its mount; a profile carries the pages
// its values come from (`makerPages`).
const commonSource = (key) => {
  const source = commonEquipmentData.sources[key];
  if (!source) throw new Error(`Unknown equipment source ${key}.`);
  return { url: source.url, readOn: source.readOn };
};
const commonProfile = (entry) => {
  const { sources, ...profile } = entry;
  return { ...profile, makerPages: (sources || []).map(commonSource) };
};
const commonById = (profiles, id) =>
  profiles.find((profile) => profile.id === id) || null;

export const integratedCameraProfiles =
  commonEquipmentData.integratedCameras.map(commonProfile);

export const telescopeProfiles = commonEquipmentData.telescopes.map((entry) => {
  const { integratedCameraId, mountId, ...telescope } = commonProfile(entry);
  const integratedCamera = integratedCameraId
    ? commonById(integratedCameraProfiles, integratedCameraId)
    : null;
  const mount = mountId
    ? commonById(commonEquipmentData.mounts, mountId)
    : null;
  if (integratedCameraId && !integratedCamera)
    throw new Error(`Unknown integrated camera ${integratedCameraId}.`);
  if (mountId && !mount) throw new Error(`Unknown mount ${mountId}.`);
  return {
    ...telescope,
    // A smart telescope offers its own filters only.
    ...(telescope.group === "connected" ? { ownFiltersOnly: true } : {}),
    ...(integratedCamera ? { integratedCamera } : {}),
    ...(mount ? { mount: { ...mount } } : {}),
  };
});

// The common binoculars (EQUIPMENT-INSTRUMENTS-01): instruments of the
// telescope picker's type « Jumelles », each with its maker's magnification,
// objective and real field.
export const binocularsProfiles = (commonEquipmentData.binoculars || []).map(
  (entry) => ({ ...commonProfile(entry), isBinoculars: true }),
);

// The common telescopes, then the common binoculars: every instrument a plan
// can name without « Mon matériel ».
export const instrumentProfiles = [...telescopeProfiles, ...binocularsProfiles];

// [telescopes] with the common binoculars a list read from the portal
// predates (its default rows hold telescopes only).
export function withCommonBinoculars(telescopes = []) {
  const list = Array.isArray(telescopes) ? telescopes : [];
  const ids = new Set(list.map((profile) => profile?.id));
  return [
    ...list,
    ...binocularsProfiles.filter((profile) => !ids.has(profile.id)),
  ];
}

export const cameraProfiles = commonEquipmentData.cameras.map(commonProfile);

// The common mounts (EQUIPMENT-CATALOGUE-01): the products of the mount
// picker, each with its maker and its `kind` (`altaz`, `equatorial`,
// `hybrid` or `tracker`), headed by the integrated azimuth mount of the smart
// telescopes. The planner reads a mount's id, name and kind only.
export const mountProfiles = commonEquipmentData.mounts.map(commonProfile);

// The filters the smart telescopes carry or their makers sell for them
// ("Prise de vue par cible"): each has its family and the pages it comes from,
// and `telescopeIds` names the common telescopes it belongs to, so that a
// picker can narrow the list to the telescope chosen.
export const smartTelescopeFilterProfiles = commonEquipmentData.filters.map(
  (entry) => {
    const { telescopeIds, ...filter } = commonProfile(entry);
    return { ...filter, telescopeIds: [...telescopeIds], builtIn: true };
  },
);

// The filters the makers sell (EQUIPMENT-CATALOGUE-01): products of the
// filter picker, each with its maker, its `family` and the pages it comes
// from. They belong to no telescope and are not proposed to every plan
// (`forAllEquipment: false`): a person picks them in the list, attaches them
// to the equipment that carries them.
export const filterProductProfiles = (
  commonEquipmentData.filterProducts || []
).map((entry) => ({ ...commonProfile(entry), forAllEquipment: false }));

// The filters a guest, or a device that has no list from the portal, is
// offered: the generic ones, the smart telescopes' own, then the makers'.
export const bundledPlannerFilters = Object.freeze([
  ...genericPlannerFilters,
  ...smartTelescopeFilterProfiles,
  ...filterProductProfiles,
]);

// `filters` with the smart telescopes' own appended when the list lacks them
// (by id): a list read from the portal's default equipment predates them.
export function withSmartTelescopeFilters(filters) {
  const list = Array.isArray(filters) ? filters : [];
  const known = new Set(list.map((filter) => filter?.id));
  return [
    ...list,
    ...smartTelescopeFilterProfiles.filter((filter) => !known.has(filter.id)),
  ];
}

// The built-in filters of `equipment` (a telescope: its own id or the id of
// the maker's profile it was made from), read-only rows of the maker's data
// (`builtIn`). A hand-typed telescope has none.
export function builtInFiltersOf(equipment) {
  return smartTelescopeFilterProfiles.filter((filter) =>
    filterBelongsTo(filter, equipment),
  );
}

// The filters of the smart telescope `telescopeId` (the generic ones first
// when `withGeneric`).
export function filtersForTelescope(telescopeId, { withGeneric = false } = {}) {
  const own = builtInFiltersOf({ id: telescopeId });
  return withGeneric ? [...genericPlannerFilters, ...own] : own;
}

// The identifiers a piece of equipment goes by when a filter names its owner:
// its own id and, for a telescope made from a smart-telescope profile, the id
// of that profile (`planner.profileId`) -- the built-in filters of the profile
// name the profile, never the person's copy.
function ownerKeysOf(equipment) {
  return [equipment?.id, equipment?.profileId].filter(
    (key) => typeof key === "string" && key !== "",
  );
}

// Whether `filter` is attached to `equipment`: the person attached it
// (`equipmentIds`) or it is a built-in filter of the maker's profile
// (`telescopeIds`, read-only, `builtIn`).
export function filterBelongsTo(filter, equipment) {
  const keys = ownerKeysOf(equipment);
  if (!keys.length) return false;
  const attached = Array.isArray(filter?.equipmentIds)
    ? filter.equipmentIds
    : [];
  const builtIn = Array.isArray(filter?.telescopeIds)
    ? filter.telescopeIds
    : [];
  return [...attached, ...builtIn].some((id) => keys.includes(id));
}

// A generic filter is "Proposé pour tout le matériel": the platform's
// defaults and the person's filters that were not limited to some equipment.
const filterIsGeneric = (filter) =>
  filter?.forAllEquipment !== false && !Array.isArray(filter?.telescopeIds);

/**
 * The filters offered for a plan: the filters attached to the plan's
 * telescope, those attached to its camera, and -- for each of the two that
 * does not say `ownFiltersOnly` -- the generic ones; two opposite settings
 * give the union. Without any equipment the generic filters are offered.
 * `selectedIds` stay in the list so that a chosen filter can be unticked. A
 * smart telescope's built-in camera is no separate piece of equipment: pass
 * only a camera that has an identifier. Same order as `filters`.
 */
export function filtersOfferedFor({
  filters,
  telescope = null,
  camera = null,
  selectedIds = [],
} = {}) {
  const owners = [telescope, camera].filter(
    (equipment) => ownerKeysOf(equipment).length > 0,
  );
  const withGeneric =
    owners.length === 0 ||
    owners.some((owner) => owner.ownFiltersOnly !== true);
  return (Array.isArray(filters) ? filters : []).filter(
    (filter) =>
      selectedIds.includes(filter?.id) ||
      owners.some((owner) => filterBelongsTo(filter, owner)) ||
      (withGeneric && filterIsGeneric(filter)),
  );
}

/**
 * The pose sheet's two lists: `carried`, what the person has with them -- the
 * filters ticked at step 2 and the built-in filters of the plan's telescope
 * -- and `others`, the rest of the offered filters, drawn quieter after a
 * thin rule. With nothing ticked the whole offered list is carried.
 */
export function acquisitionFilterGroups({
  offered,
  selectedIds = [],
  telescope = null,
} = {}) {
  const list = Array.isArray(offered) ? offered : [];
  if (!list.some((filter) => selectedIds.includes(filter?.id)))
    return { carried: [...list], others: [] };
  const carriedByTelescope = (filter) =>
    Array.isArray(filter?.telescopeIds) && filterBelongsTo(filter, telescope);
  const carried = list.filter(
    (filter) => selectedIds.includes(filter?.id) || carriedByTelescope(filter),
  );
  return {
    carried,
    others: list.filter((filter) => !carried.includes(filter)),
  };
}

/**
 * The pieces of equipment `filter` belongs to, among `equipment` (telescopes
 * and cameras with their ids): what a list that mixes equipment shows beside
 * the filter's bare name. Never read from the name.
 */
export function filterOwners(filter, equipment = []) {
  return (Array.isArray(equipment) ? equipment : []).filter((piece) =>
    filterBelongsTo(filter, piece),
  );
}

// Bundled so that guest planning keeps a coherent visual mode; a paired or
// signed-in owner reads their own inventory instead.
// `minFocalLengthMm`/`maxFocalLengthMm` describe a zoom eyepiece.
export const eyepieceProfiles =
  commonEquipmentData.eyepieces.map(commonProfile);

export const opticalModifiers = commonEquipmentData.opticalModifiers.map(
  (modifier) => ({ ...modifier }),
);

// The most common choice of each mode, which the first launch preselects
// in photo the Seestar S50 (its camera is built in, nothing else
// to choose); in visual the Sky-Watcher Skymax 127 with a 25 mm Plössl. A
// profile the lists no longer hold is `null`: the app falls back on the
// smallest refractor, else the smallest Maksutov.
export const firstLaunchPreselection = Object.freeze({
  imaging: Object.freeze({
    telescope: commonById(
      telescopeProfiles,
      commonEquipmentData.firstLaunchPreselection.imaging.telescopeId,
    ),
  }),
  visual: Object.freeze({
    telescope: commonById(
      telescopeProfiles,
      commonEquipmentData.firstLaunchPreselection.visual.telescopeId,
    ),
    eyepiece: commonById(
      eyepieceProfiles,
      commonEquipmentData.firstLaunchPreselection.visual.eyepieceId,
    ),
  }),
});

const profileById = (profiles, id) =>
  profiles.find((profile) => profile.id === id) || null;

// The built-in sensor a smart telescope carries in its `planner`: a name and
// a positive width and height (numbers, or numbers written as text), the
// pixel size when it is given; anything else is no integrated camera.
function integratedCameraOf(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const sensorWidthMm = Number(value.sensorWidthMm);
  const sensorHeightMm = Number(value.sensorHeightMm);
  if (!(sensorWidthMm > 0 && sensorHeightMm > 0)) return null;
  const pixelSizeUm = Number(value.pixelSizeUm);
  return {
    name: String(value.name ?? "").trim(),
    sensorWidthMm,
    sensorHeightMm,
    ...(pixelSizeUm > 0 ? { pixelSizeUm } : {}),
    ...cameraAcquisitionTraits(value),
  };
}

// `mono` or `colour` from what an inventory row writes (`sensorKind`, also
// "color", "monochrome"); `null` for anything else.
export function normalizeSensorKind(value) {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (text === "mono" || text === "monochrome") return "mono";
  if (text === "colour" || text === "color") return "colour";
  return null;
}

// What the exposure rule reads of a camera ("Prise de vue par cible"): the kind of sensor, the unity or HCG gain and the read noise at it;
// only the traits the row holds, a number being positive (a gain: zero or
// more).
function cameraAcquisitionTraits(source) {
  const sensorKind = normalizeSensorKind(source?.sensorKind);
  const unityGain = traitNumber(source?.unityGain);
  const hcgGain = traitNumber(source?.hcgGain);
  const readNoiseE = traitNumber(source?.readNoiseE);
  return {
    ...(sensorKind ? { sensorKind } : {}),
    ...(unityGain >= 0 ? { unityGain } : {}),
    ...(hcgGain >= 0 ? { hcgGain } : {}),
    ...(readNoiseE > 0 ? { readNoiseE } : {}),
  };
}

// A number written as a number, or as text that is not empty; NaN otherwise.
function traitNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return Number.NaN;
}

// The maker and the kind (`refractor`, `zoom`, `mono`, `reducer`…) a row's
// `planner` carries, as the pickers' « Marque » and « Type » menus read them;
// each left out when the row has none.
function makerAndKind(planner) {
  const extra =
    planner && typeof planner === "object" && !Array.isArray(planner)
      ? planner
      : {};
  return {
    ...(typeof extra.maker === "string" && extra.maker.trim()
      ? { maker: extra.maker.trim() }
      : {}),
    ...(typeof extra.kind === "string" && extra.kind.trim()
      ? { kind: extra.kind.trim() }
      : {}),
  };
}

export function equipmentProfilesFromInventory(items = []) {
  const profiles = {
    telescopes: [],
    cameras: [],
    eyepieces: [],
    modifiers: [{ id: "none", name: "Aucun", multiplier: 1 }],
    filters: [],
    mounts: [],
  };
  for (const item of items || []) {
    if (!item || item.archivedAt) continue;
    const source = { ...(item.specifications || {}), ...(item.planner || {}) };
    const id = String(item.id || "");
    const name = String(item.name || "").trim();
    if (!id || !name) continue;
    const labels = makerAndKind(item.planner);
    if (item.type === "telescope") {
      const apertureMm = Number(source.apertureMm);
      const focalLengthMm = Number(source.focalLengthMm);
      // EQUIPMENT-INSTRUMENTS-01: binoculars need their objective and their
      // magnification (or, written before the kind, a focal length); a
      // smartphone its camera and its focal length (its aperture is known on
      // Android only).
      const instrumentKind = instrumentKindOf(item);
      const magnification = Number(source.magnification);
      if (instrumentKind === "binoculars") {
        if (!(apertureMm > 0 && (magnification > 0 || focalLengthMm > 0)))
          continue;
      } else if (instrumentKind === "smartphone") {
        if (!(focalLengthMm > 0 && integratedCameraOf(source.integratedCamera)))
          continue;
      } else if (!(apertureMm > 0 && focalLengthMm > 0)) continue;
      // A smart telescope: the box
      // "Télescope intelligent" of "Mon matériel" writes its built-in
      // sensor and mount into `planner`; the pickers then hide the camera
      // and the mount, as for a connected telescope of the common profiles.
      const integratedCamera = integratedCameraOf(source.integratedCamera);
      const maxExposureSeconds = Number(source.maxExposureSeconds);
      // The maker's profile the telescope was made from, and whether it
      // offers its own filters only (the profile's smart telescopes do).
      const profileId =
        typeof source.profileId === "string" ? source.profileId.trim() : "";
      const ownFiltersOnly =
        typeof source.ownFiltersOnly === "boolean"
          ? source.ownFiltersOnly
          : commonById(telescopeProfiles, profileId)?.ownFiltersOnly === true
            ? true
            : undefined;
      const trueFieldDegrees = Number(source.trueFieldDegrees);
      const apparentFieldDegrees = Number(source.apparentFieldDegrees);
      profiles.telescopes.push({
        id,
        name,
        ...(apertureMm > 0 || instrumentKind === "telescope"
          ? { apertureMm }
          : {}),
        ...(focalLengthMm > 0 || instrumentKind === "telescope"
          ? { focalLengthMm }
          : {}),
        isBinoculars: instrumentKind === "binoculars",
        ...labels,
        ...(instrumentKind === "telescope" ? {} : { kind: instrumentKind }),
        ...(instrumentKind === "binoculars" && magnification > 0
          ? { magnification }
          : {}),
        ...(instrumentKind === "binoculars" && trueFieldDegrees > 0
          ? { trueFieldDegrees }
          : {}),
        ...(instrumentKind === "binoculars" && apparentFieldDegrees > 0
          ? { apparentFieldDegrees }
          : {}),
        ...(instrumentKind === "smartphone" &&
        source.phone &&
        typeof source.phone === "object" &&
        !Array.isArray(source.phone)
          ? { phone: { ...source.phone } }
          : {}),
        ...(profileId ? { profileId } : {}),
        ...(ownFiltersOnly === undefined ? {} : { ownFiltersOnly }),
        ...(maxExposureSeconds > 0 ? { maxExposureSeconds } : {}),
        ...(integratedCamera ? { integratedCamera } : {}),
        ...(integratedCamera &&
        source.mount &&
        typeof source.mount === "object" &&
        !Array.isArray(source.mount)
          ? { mount: { ...source.mount } }
          : {}),
      });
    }
    if (item.type === "camera") {
      const sensorWidthMm = Number(source.sensorWidthMm);
      const sensorHeightMm = Number(source.sensorHeightMm);
      // The pixel size, when the inventory has it, gives the sampling of the
      // equipment sheet.
      const pixelSizeUm = Number(source.pixelSizeUm);
      if (!(sensorWidthMm > 0 && sensorHeightMm > 0)) continue;
      profiles.cameras.push({
        id,
        name,
        sensorWidthMm,
        sensorHeightMm,
        ...labels,
        ...(pixelSizeUm > 0 ? { pixelSizeUm } : {}),
        ...cameraAcquisitionTraits(source),
        ...(source.ownFiltersOnly === true ? { ownFiltersOnly: true } : {}),
      });
    }
    if (item.type === "eyepiece") {
      const focalLengthMm = Number(source.focalLengthMm);
      const minFocalLengthMm = Number(source.minFocalLengthMm);
      const maxFocalLengthMm = Number(source.maxFocalLengthMm);
      const apparentFieldDegrees = Number(source.apparentFieldDegrees);
      const minApparentFieldDegrees = Number(source.minApparentFieldDegrees);
      const maxApparentFieldDegrees = Number(source.maxApparentFieldDegrees);
      if (!(focalLengthMm > 0 && apparentFieldDegrees > 0)) continue;
      profiles.eyepieces.push({
        id,
        name,
        focalLengthMm,
        apparentFieldDegrees,
        ...labels,
        ...(minFocalLengthMm > 0 && maxFocalLengthMm >= minFocalLengthMm
          ? { minFocalLengthMm, maxFocalLengthMm }
          : {}),
        ...(minApparentFieldDegrees > 0 &&
        maxApparentFieldDegrees >= minApparentFieldDegrees
          ? { minApparentFieldDegrees, maxApparentFieldDegrees }
          : {}),
      });
    }
    if (item.type === "lens")
      profiles.modifiers.push({
        id,
        name,
        multiplier: Number(source.multiplier) || 1,
        ...labels,
      });
    if (item.type === "filter") {
      // The equipment the filter is attached to, and whether it is offered
      // for all equipment (the default) or only with those.
      const equipmentIds = [
        ...new Set(
          (Array.isArray(source.equipmentIds) ? source.equipmentIds : [])
            .filter((entry) => typeof entry === "string" && entry !== "")
            .map(String),
        ),
      ];
      profiles.filters.push({
        id,
        name,
        ...labels,
        ...(equipmentIds.length ? { equipmentIds } : {}),
        ...(source.forAllEquipment === false ? { forAllEquipment: false } : {}),
      });
    }
    if (item.type === "mount") {
      // MERIDIAN-LIMIT-02a: the minutes the mount keeps tracking past the
      // meridian (0..120; absent: not said, nothing is cut).
      const meridianLimit = normaliseMeridianLimit(source.meridianLimitMinutes);
      profiles.mounts.push({
        id,
        name,
        ...labels,
        ...(meridianLimit === null
          ? {}
          : { meridianLimitMinutes: meridianLimit }),
      });
    }
  }
  return profiles;
}

// The rows of "Matériel par défaut" (`defaults` of `GET /api/equipment` and
// `GET /v1/equipment`) as the profile sets the pickers list: the shape
// `equipmentProfilesFromInventory` gives a space's own items, plus what a default row
// carries in its `planner` — a connected telescope's `group`, `maker`, `driver`,
// `integratedCamera` and `mount`, the maker pages, a filter's `family`. The modifier "Aucun"
// is the pickers' own first choice, never a default row.
export function defaultEquipmentProfiles(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const extras = new Map();
  for (const row of list)
    if (row && typeof row === "object" && !row.archivedAt)
      extras.set(
        String(row.id || ""),
        row.planner && typeof row.planner === "object" ? row.planner : {},
      );
  const profiles = equipmentProfilesFromInventory(list);
  const pages = (extra) =>
    Array.isArray(extra.makerPages) ? { makerPages: extra.makerPages } : {};
  const telescope = (profile) => {
    const extra = extras.get(profile.id) || {};
    return {
      ...profile,
      ...(typeof extra.group === "string" && extra.group
        ? { group: extra.group }
        : {}),
      ...(extra.group === "connected" && profile.ownFiltersOnly === undefined
        ? { ownFiltersOnly: true }
        : {}),
      ...(typeof extra.maker === "string" && extra.maker
        ? { maker: extra.maker }
        : {}),
      ...(typeof extra.driver === "string" && extra.driver
        ? { driver: extra.driver }
        : {}),
      ...(extra.integratedCamera && typeof extra.integratedCamera === "object"
        ? { integratedCamera: extra.integratedCamera }
        : {}),
      ...(extra.mount && typeof extra.mount === "object"
        ? { mount: extra.mount }
        : {}),
      ...pages(extra),
    };
  };
  const withPages = (profile) => ({
    ...profile,
    ...pages(extras.get(profile.id) || {}),
  });
  return {
    telescopes: profiles.telescopes.map(telescope),
    cameras: profiles.cameras.map(withPages),
    eyepieces: profiles.eyepieces.map(withPages),
    modifiers: profiles.modifiers.filter((profile) => profile.id !== "none"),
    filters: profiles.filters.map((profile) => {
      const family = (extras.get(profile.id) || {}).family;
      return typeof family === "string" && family
        ? { ...profile, family }
        : profile;
    }),
    mounts: profiles.mounts,
  };
}

/**
 * The telescope and the camera a plan's equipment selection names, resolved
 * the way `resolveEquipment` does ("Prise de vue par cible" reads
 * both to know the sensor, the focal ratio and the gains): `{ telescope,
 * camera }`, each possibly `undefined`.
 */
export function resolveEquipmentProfiles(selection = {}, profileSets = null) {
  const telescopes = profileSets?.telescopes?.length
    ? profileSets.telescopes
    : telescopeProfiles;
  const cameras = profileSets?.cameras?.length
    ? profileSets.cameras
    : cameraProfiles;
  // A paired owner's inventory comes first; the common telescopes the picker
  // lists after it (`commonTelescopes`, else the data file's own) are found by
  // their id too: a plan that names one resolves to it wherever the sets come
  // from, never to the owner's first telescope. A telescope or a camera not
  // chosen yet (`null`, absent, or an id no list holds) resolves to nothing:
  // never a profile picked in silence.
  const telescope =
    profileById(telescopes, selection.telescopeId) ||
    profileById(
      profileSets?.commonTelescopes || telescopeProfiles,
      selection.telescopeId,
    ) ||
    // The common binoculars, which a list read from the portal predates.
    profileById(binocularsProfiles, selection.telescopeId) ||
    undefined;
  // A connected telescope's camera is fixed: its integrated
  // camera, whatever `cameraId` says.
  const camera = telescope?.integratedCamera
    ? telescope.integratedCamera
    : profileById(cameras, selection.cameraId) || undefined;
  return { telescope, camera };
}

export function resolveEquipment(selection = {}, profileSets = null) {
  const mode = selection.mode === "visual" ? "visual" : "imaging";
  const eyepieces = profileSets?.eyepieces?.length
    ? profileSets.eyepieces
    : eyepieceProfiles;
  const modifiers = profileSets?.modifiers?.length
    ? profileSets.modifiers
    : opticalModifiers;
  const filters = profileSets?.filters || [];
  const { telescope, camera } = resolveEquipmentProfiles(
    selection,
    profileSets,
  );
  // EQUIPMENT-INSTRUMENTS-01: binoculars that know their magnification carry
  // their own eyepieces: the plan's eyepiece and modifier are not applied,
  // the magnification and the real field are theirs.
  const instrumentKind = instrumentKindOf(telescope);
  const binocularsPower =
    instrumentKind === "binoculars" ? Number(telescope?.magnification) : NaN;
  const ownEyepieces = binocularsPower > 0;
  // An eyepiece not chosen yet resolves to nothing, like the telescope.
  const eyepiece = ownEyepieces
    ? undefined
    : profileById(eyepieces, selection.eyepieceId) || undefined;
  // Behind a smart telescope the reducer leaves the plan's sheet with the
  // camera and the mount; whatever the plan still names is not applied. The
  // modifier alone falls back to the first of its list, « Aucun ».
  const modifier =
    telescope?.integratedCamera || ownEyepieces
      ? null
      : profileById(modifiers, selection.modifierId) || modifiers[0];
  const selectedFilters = (selection.filterIds || [])
    .map((id) => profileById(filters, id))
    .filter(Boolean);
  const multiplier = Number(modifier?.multiplier) || 1;
  const focalLengthMm = Number(telescope?.focalLengthMm) * multiplier;
  const zoomMinimum = Number(eyepiece?.minFocalLengthMm);
  const zoomMaximum = Number(eyepiece?.maxFocalLengthMm);
  const requestedEyepieceFocalLength = Number(selection.eyepieceFocalLengthMm);
  const eyepieceFocalLengthMm =
    zoomMinimum > 0 && zoomMaximum >= zoomMinimum
      ? Math.max(
          zoomMinimum,
          Math.min(
            zoomMaximum,
            Number.isFinite(requestedEyepieceFocalLength)
              ? requestedEyepieceFocalLength
              : Number(eyepiece?.focalLengthMm),
          ),
        )
      : Number(eyepiece?.focalLengthMm);
  const apparentMinimum = Number(eyepiece?.minApparentFieldDegrees);
  const apparentMaximum = Number(eyepiece?.maxApparentFieldDegrees);
  const zoomRatio =
    zoomMaximum > zoomMinimum
      ? (eyepieceFocalLengthMm - zoomMinimum) / (zoomMaximum - zoomMinimum)
      : 0;
  const apparentFieldDegrees =
    apparentMinimum > 0 && apparentMaximum >= apparentMinimum
      ? apparentMaximum - (apparentMaximum - apparentMinimum) * zoomRatio
      : Number(eyepiece?.apparentFieldDegrees);
  const magnification = ownEyepieces
    ? binocularsPower
    : focalLengthMm / eyepieceFocalLengthMm;
  const binocularsField = ownEyepieces
    ? Number(telescope?.trueFieldDegrees) > 0
      ? Number(telescope.trueFieldDegrees)
      : Number(telescope?.apparentFieldDegrees) / binocularsPower
    : Number.NaN;
  const visualFieldDiameterDegrees = ownEyepieces
    ? binocularsField
    : Number.isFinite(magnification) && magnification > 0
      ? apparentFieldDegrees / magnification
      : Number.NaN;
  return {
    mode,
    name: [
      telescope?.name,
      mode === "visual" ? eyepiece?.name : camera?.name,
      modifier?.id === "none" ? null : modifier?.name,
    ]
      .filter(Boolean)
      .join(" · "),
    apertureMm: Number(telescope?.apertureMm),
    focalLengthMm,
    sensorWidthMm: Number(camera?.sensorWidthMm),
    sensorHeightMm: Number(camera?.sensorHeightMm),
    eyepieceFocalLengthMm,
    apparentFieldDegrees: ownEyepieces
      ? Number(telescope?.apparentFieldDegrees) > 0
        ? Number(telescope.apparentFieldDegrees)
        : binocularsField * binocularsPower
      : apparentFieldDegrees,
    magnification,
    exitPupilMm:
      Number.isFinite(magnification) && magnification > 0
        ? Number(telescope?.apertureMm) / magnification
        : Number.NaN,
    visualFieldDiameterDegrees,
    filters: selectedFilters.map((filter) => filter.name),
    filterProfiles: selectedFilters,
    unresolvedFilterIds: (selection.filterIds || []).filter(
      (id) => !profileById(filters, id),
    ),
    ...(instrumentKind === "telescope" || !telescope ? {} : { instrumentKind }),
  };
}

// What a new plan's telescope, camera and eyepiece start on: the owner's own
// instrument when the selection already names one; otherwise the inventory's
// first of that kind (the order `equipmentProfilesFromInventory` lists them,
// archived items skipped), and `null` -- « Choisir… », nothing chosen yet --
// when the inventory has none: never a common profile chosen in silence. A
// guest has no inventory: `null`.
export function newPlanEquipment(equipment = {}, items = []) {
  const profiles = equipmentProfilesFromInventory(items || []);
  const current = equipment && typeof equipment === "object" ? equipment : {};
  const next = { ...current };
  for (const [idKey, list] of [
    ["telescopeId", profiles.telescopes],
    ["cameraId", profiles.cameras],
    ["eyepieceId", profiles.eyepieces],
  ]) {
    const id = current[idKey];
    if (list.some((profile) => profile.id === id)) continue;
    next[idKey] = list[0]?.id ?? null;
  }
  return next;
}

// What an owner's plan starts on once the inventory is known
// (`newPlanEquipment`), except that a common profile the person chose
// themselves -- a telescope, a camera or an eyepiece of `common` -- is a
// choice and stays: a new plan never starts on one in silence, but one a plan
// already names was picked. `common` is `{ telescopes, cameras, eyepieces }`,
// the lists of common profiles.
export function ownerStartEquipment(equipment = {}, items = [], common = {}) {
  const start = newPlanEquipment(equipment, items);
  const chosen = (idKey, list = []) =>
    list.some((profile) => profile.id === equipment?.[idKey])
      ? equipment[idKey]
      : start[idKey];
  return {
    ...start,
    telescopeId: chosen("telescopeId", common.telescopes),
    cameraId: chosen("cameraId", common.cameras),
    eyepieceId: chosen("eyepieceId", common.eyepieces),
  };
}

// Extracted from the equipment-hydration block PlannerPage.js used inline:
// the stored selection over `fallbackEquipment`, and `filterIds` only ever
// survives load as an array (never inherited from `fallbackEquipment`).
export function normalizedEquipmentSelection(
  equipment,
  fallbackEquipment = {},
) {
  return {
    ...fallbackEquipment,
    ...equipment,
    filterIds: Array.isArray(equipment?.filterIds)
      ? equipment.filterIds.map(String)
      : [],
  };
}

export function fieldOfView(profile) {
  if (profile?.mode === "visual") {
    const diameter = Number(profile.visualFieldDiameterDegrees);
    if (!(diameter > 0)) return null;
    return { width: diameter, height: diameter, diameter, shape: "circle" };
  }
  const focalLength = Number(profile?.focalLengthMm);
  const sensorWidth = Number(profile?.sensorWidthMm);
  const sensorHeight = Number(profile?.sensorHeightMm);
  if (![focalLength, sensorWidth, sensorHeight].every((value) => value > 0))
    return null;
  return {
    width: (2 * Math.atan(sensorWidth / (2 * focalLength))) / DEG,
    height: (2 * Math.atan(sensorHeight / (2 * focalLength))) / DEG,
    shape: "rectangle",
  };
}

export function stellariumTargetUrl(target, field) {
  const source =
    target?.source || target?.stellarium?.source || target?.objects?.[0];
  if (!source) return null;
  const selectedField = Number(field?.width);
  const fov =
    selectedField > 0 ? selectedField : Number(target?.stellarium?.fov) || 3.34;
  return `https://stellarium-web.org/skysource/${encodeURIComponent(source)}?fov=${fov.toFixed(2)}`;
}

// `zonedDate` and `validTimeZone` now live in astro-core/night-window.js —
// the night-window definition moved there (see `planNightGeometry` below)
// and `validTimeZone` is also used outside any night calculation (by
// components/PlannerPage.js, to validate a timezone before display), so both
// are imported above and re-exported here rather than duplicated.
export { validTimeZone, zonedDate };

export function applyActivePlanSnapshot(state, snapshot) {
  if (!state.activePlanId) return state;
  const copiedSnapshot = structuredClone(snapshot);
  return {
    ...state,
    plans: state.plans.map((plan) =>
      plan.id === state.activePlanId ? { ...plan, ...copiedSnapshot } : plan,
    ),
  };
}

export function restorePlanHistoryState(state, id, snapshot) {
  const restored = structuredClone(snapshot);
  const context = state.nights?.find((night) => night.id === restored.nightId);
  if (context) restored.location = structuredClone(context.location);
  const next = {
    ...state,
    plans: state.plans.map((plan) => (plan.id === id ? restored : plan)),
  };
  if (id !== state.activePlanId) return next;
  return {
    ...next,
    location: restored.location
      ? { ...state.location, ...restored.location }
      : state.location,
    equipment: restored.equipment
      ? structuredClone({ ...state.equipment, ...restored.equipment })
      : state.equipment,
    minAltitude: Number.isFinite(Number(restored.minAltitude))
      ? Number(restored.minAltitude)
      : state.minAltitude,
    moonSeparationMinimum: Number.isFinite(
      Number(restored.moonSeparationMinimum),
    )
      ? Number(restored.moonSeparationMinimum)
      : state.moonSeparationMinimum,
    moonSeparationMinimumByFilter:
      restored.moonSeparationMinimumByFilter &&
      typeof restored.moonSeparationMinimumByFilter === "object"
        ? structuredClone(restored.moonSeparationMinimumByFilter)
        : state.moonSeparationMinimumByFilter,
    mountSafety: restored.mountSafety
      ? structuredClone(restored.mountSafety)
      : state.mountSafety,
    catalogueSelection: restored.catalogueSelection ?? state.catalogueSelection,
  };
}

function dateAfter(dateString) {
  const value = new Date(`${dateString}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function observerFor(location) {
  return new Observer(
    Number(location.latitude),
    Number(location.longitude),
    Number(location.elevation || 0),
  );
}

function equatorialOfDate(date, coordinate) {
  const ra = coordinate.ra * DEG;
  const dec = coordinate.dec * DEG;
  const vector = new Vector(
    Math.cos(dec) * Math.cos(ra),
    Math.cos(dec) * Math.sin(ra),
    Math.sin(dec),
    date,
  );
  return EquatorFromVector(RotateVector(Rotation_EQJ_EQD(date), vector));
}

function horizontal(date, observer, coordinate) {
  const equatorial = equatorialOfDate(date, coordinate);
  return horizontalEquatorial(date, observer, equatorial);
}

function horizontalEquatorial(date, observer, equatorial) {
  return {
    ...Horizon(date, observer, equatorial.ra, equatorial.dec, "normal"),
    equatorial,
  };
}

function separationDegrees(first, second) {
  const raDifference = (first.ra - second.ra) * 15 * DEG;
  const firstDec = first.dec * DEG;
  const secondDec = second.dec * DEG;
  const cosine =
    Math.sin(firstDec) * Math.sin(secondDec) +
    Math.cos(firstDec) * Math.cos(secondDec) * Math.cos(raDifference);
  return Math.acos(Math.min(1, Math.max(-1, cosine))) / DEG;
}

function fixedCandidates(targets) {
  const bySource = new Map();
  for (const target of targets) {
    const coordinate = target.coordinate || coordinateForTarget(target);
    const source =
      target.source || target.stellarium?.source || target.objects?.[0];
    if (!coordinate || !source) continue;
    const candidateKey = plannerCandidateKey({ ...target, source });
    const previous = bySource.get(candidateKey);
    if (!previous || target.tags?.includes("50P"))
      bySource.set(candidateKey, { ...target, coordinate, source });
  }
  return [...bySource.values()];
}

function plannerCandidateKey(target) {
  return `${target?.plannerSource || "catalogue"}:${target?.source || target?.id || ""}`;
}

function localizedPlannerTarget(target, locale, references = {}) {
  const typeKey = canonicalObjectType(
    target.skyTarget?.typeKey || target.skyTarget?.type,
    references.taxonomy?.objectTypeAliases,
  );
  const constellationKey =
    target.skyTarget?.constellationKey || target.skyTarget?.constellation;
  const name = localizedPlannerName(target.name, locale, references.nameLabels);
  return {
    ...target,
    name,
    title: name ? `${target.designation} — ${name}` : target.designation,
    skyTarget: {
      ...target.skyTarget,
      typeKey,
      constellationKey,
      type: taxonomyLabel(typeKey, locale, references.taxonomy),
      constellation: taxonomyLabel(
        constellationKey,
        locale,
        references.taxonomy,
      ),
    },
    catalogue:
      target.catalogue === "Planètes"
        ? copyFor(planetsCatalogueLabels, locale, "planner.planetsCatalogue")
        : target.catalogue,
  };
}

// The name of the catalogue of the planets, in each language (the French
// word is the data's own key).
const planetsCatalogueLabels = {
  fr: "Planètes",
  en: "Planets",
  ja: "惑星",
  "zh-Hans": "行星",
  "zh-Hant": "行星",
  ru: "Планеты",
  de: "Planeten",
  es: "Planetas",
  it: "Pianeti",
  "pt-BR": "Planetas",
};

function planetCandidates(locale, references = {}) {
  const planets = Array.isArray(references.planets)
    ? references.planets
    : plannerPlanetDefinitions;
  return planets.map((planet) => ({
    id: `planner-planet-${planet.name.toLowerCase()}`,
    source: planet.name,
    designation: localizedPlannerName(planet.name, locale),
    name: localizedPlannerName(planet.name, locale),
    title: localizedPlannerName(planet.name, locale),
    objects: [planet.name],
    catalogue: copyFor(
      planetsCatalogueLabels,
      locale,
      "planner.planetsCatalogue",
    ),
    apparentSizeArcmin: planet.apparentSizeArcmin,
    skyTarget: {
      typeKey: "Planète",
      constellationKey: "Système solaire",
      type: taxonomyLabel("Planète", locale),
      constellation: taxonomyLabel("Système solaire", locale),
    },
    tags: ["planet"],
    plannerSource: "catalogue",
    body: planet.body,
    featured: { imageUrl: planet.imageUrl },
  }));
}

function horizontalForTarget(date, observer, target) {
  if (target.body) {
    return horizontalEquatorial(
      date,
      observer,
      Equator(target.body, date, observer, true, true),
    );
  }
  return horizontal(date, observer, target.coordinate);
}

export function planningTargets(
  capturedTargets = [],
  locale = "fr",
  knowledgeBySource = {},
  references = {},
) {
  const sourceKey = (source) =>
    String(source || "")
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "");
  const capturedBySource = new Map();
  for (const target of capturedTargets) {
    for (const source of [
      target.stellarium?.source,
      ...(target.objects || []),
    ]) {
      if (source) capturedBySource.set(sourceKey(source), target);
    }
  }
  const catalogue = Array.isArray(references.catalogue)
    ? references.catalogue
    : plannerCatalogue;
  const plannerCandidates = Array.isArray(references.catalogueTargets)
    ? references.catalogueTargets
    : [];
  const localizedCatalogue = plannerCandidates.length
    ? plannerCandidates
    : catalogue.map((target) => {
        const localized = localizedPlannerTarget(target, locale, references);
        const knowledge = [
          localized.source,
          localized.designation,
          ...(localized.objects || []),
        ]
          .map(targetLookupKey)
          .map((key) => knowledgeBySource[key])
          .find(Boolean);
        return knowledge ? { ...localized, knowledge } : localized;
      });
  const curatedBySource = new Map(
    localizedCatalogue.map((target) => [sourceKey(target.source), target]),
  );
  const curated = localizedCatalogue.map((target) => {
    return {
      ...target,
      plannerSource: "catalogue",
      hasCapture: capturedBySource.has(sourceKey(target.source)),
    };
  });
  const captures = capturedTargets.map((target) => {
    const source = target.stellarium?.source || target.objects?.[0];
    const curatedTarget = source
      ? curatedBySource.get(sourceKey(source))
      : null;
    if (!curatedTarget) {
      return { ...target, plannerSource: "capture", hasCapture: true };
    }
    return {
      ...curatedTarget,
      ...target,
      plannerSource: "capture",
      hasCapture: true,
      source: curatedTarget.source,
      coordinate: curatedTarget.coordinate,
      catalogue: curatedTarget.catalogue,
      apparentSizeArcmin: curatedTarget.apparentSizeArcmin,
      skyTarget: curatedTarget.skyTarget,
    };
  });
  return [...curated, ...captures];
}

// The catalogue guides are deliberately broad. This gate only answers whether
// a target belongs in a *restricted* recommendation list; it is not a
// replacement for the field-of-view preview or an observation feasibility
// calculation.
export function targetMatchesEquipmentGuide(target, profile) {
  const guide = target?.knowledge?.observingGuide || target?.observingGuide;
  if (!guide || !profile) return false;
  if (profile.mode === "visual") {
    const aperture = Number(profile.apertureMm);
    return (
      Number.isFinite(aperture) &&
      aperture >= Number(guide.visualMinimumApertureMm)
    );
  }
  const focalLength = Number(profile.focalLengthMm);
  const minimum = Number(guide.focalLengthMinimumMm);
  const maximum = Number(guide.focalLengthMaximumMm);
  if (
    !Number.isFinite(focalLength) ||
    !Number.isFinite(minimum) ||
    !Number.isFinite(maximum)
  )
    return false;
  // The displayed range is indicative and deliberately sensor-agnostic.
  // Keep a modest margin so the restriction stays useful rather than brittle.
  return focalLength >= minimum * 0.8 && focalLength <= maximum * 1.25;
}

// Cards already committed to the active plan keep their existing review
// reasons (e.g. a retained target's visual-suitability note) and only ever
// gain "equipment", "selection" (its selection, in the equipment's mode),
// the wind's reason of their interval
// (`windReason`, `scheduleItemWindReason`) or its place against the span of
// the night (`nightSpanReason`, `scheduleItemNightSpanReason`, phase
// 08) or its place against the target's own usable windows
// (`usableWindowReason`, `scheduleItemUsableWindowReason`) on top,
// deduplicated the same way.
export function activePlanCardReviewReasons({
  card,
  equipment,
  restrictToEquipment = false,
  catalogueSelection = "best",
  favoritesReady = false,
  isFavoriteTarget = false,
  windReason = null,
  nightSpanReason = null,
  usableWindowReason = null,
}) {
  const reasons = [...(card.reviewReasons || [])];
  if (
    restrictToEquipment &&
    card.target.plannerSource === "catalogue" &&
    (!targetMatchesEquipmentGuide(card.target, equipment) ||
      targetFilterCompatibility(card.target, equipment) === false)
  )
    reasons.push("equipment");
  // The planner's « Étendues » is the two selections together (they are
  // disjoint since TARGET-SELECTIONS-TAGS-01), and a selection keeps the
  // targets of the equipment's mode: a card the selection no longer holds in
  // that mode is to be reviewed.
  const selectionMode = selectionModeOfEquipmentMode(equipment?.mode);
  if (
    card.target.plannerSource === "catalogue" &&
    (((catalogueSelection === "best" || catalogueSelection === "extended") &&
      !targetInSelectionPool(card.target, catalogueSelection, selectionMode)) ||
      (catalogueSelection === "favorites" &&
        favoritesReady &&
        !isFavoriteTarget))
  )
    reasons.push("selection");
  if (
    windReason === "wind-over-tolerance" ||
    windReason === "wind-near-tolerance"
  )
    reasons.push(windReason);
  if (nightSpanReason === "outside-night-span") reasons.push(nightSpanReason);
  if (usableWindowReason === "outside-usable-window")
    reasons.push(usableWindowReason);
  return { ...card, reviewReasons: [...new Set(reasons)] };
}

export function suggestedFilter(target, profile) {
  const available = profile?.filters || [];
  const families = recommendedFilterFamilies(target, profile?.mode);
  if (families)
    return (
      available.find((filter) => families.includes(filterFamily(filter))) ||
      null
    );
  const type = `${target.skyTarget?.typeKey || target.skyTarget?.type || ""} ${(target.tags || []).join(" ")}`;
  if (/réflexion|reflection|sombre|dark/i.test(type))
    return available.find((filter) => /uv|ir|rgb|clear/i.test(filter)) || null;
  if (/nébuleuse|emission|h ii|rémanent|supernova/i.test(type))
    return available.find((filter) => /duo|narrow|band/i.test(filter)) || null;
  return available.find((filter) => /uv|ir|rgb|clear/i.test(filter)) || null;
}

function targetIntegrationProfile(target) {
  const type = `${target.skyTarget?.typeKey || target.skyTarget?.type || ""} ${(target.tags || []).join(" ")}`;
  if (/planète|planet/i.test(type)) return { hours: 0.25, kind: "planet" };
  if (/amas globulaire|globular/i.test(type))
    return { hours: 1.1, kind: "cluster" };
  if (/amas ouvert|open cluster/i.test(type))
    return { hours: 0.8, kind: "cluster" };
  if (/nébuleuse planétaire|planetary nebula/i.test(type))
    return { hours: 1.8, kind: "planetary" };
  if (/rémanent|supernova remnant/i.test(type))
    return { hours: 5, kind: "faint-nebula" };
  if (/nébuleuse|nebula|émission|emission|h ii|dark/i.test(type))
    return { hours: 4, kind: "nebula" };
  if (/galaxie|galaxy/i.test(type)) return { hours: 3, kind: "galaxy" };
  return { hours: 2.5, kind: "general" };
}

function roundIntegrationMinutes(minutes) {
  return Math.max(15, Math.round(minutes / 15) * 15);
}

// This is deliberately a planning estimate, not an exposure-time calculator.
// A curated magnitude combined with apparent size can refine it; total
// magnitude alone is not reliable for an extended object.
export function suggestedIntegration(target, profile, maxAltitude) {
  // A free framing has a fixed centre and a field preview, but no intrinsic
  // brightness or object class. Do not invent an exposure recommendation for
  // it. A framing matched to a catalogue target stores a compact reference
  // and can use that target's documented metadata instead.
  if (target?.plannerSource === "framing" && !target.integrationReference) {
    return {
      kind: "unknown",
      minimumMinutes: null,
      recommendedMinutes: null,
      maximumMinutes: null,
      usesMagnitude: false,
      available: false,
    };
  }
  const integrationTarget = target.integrationReference || target;
  const source = targetIntegrationProfile(integrationTarget);
  if (source.kind === "planet") {
    return {
      kind: source.kind,
      minimumMinutes: 10,
      recommendedMinutes: 15,
      maximumMinutes: 30,
      usesMagnitude: false,
      available: true,
    };
  }
  const focalRatio =
    Number(profile?.focalLengthMm) / Number(profile?.apertureMm || 1);
  const focalFactor = Number.isFinite(focalRatio)
    ? Math.min(5, Math.max(0.35, (focalRatio / 3.8) ** 2))
    : 1;
  const altitude = Math.max(20, Number(maxAltitude) || 45);
  const altitudeFactor = Math.min(
    1.9,
    Math.max(1, 1 / Math.sin(altitude * DEG)),
  );
  const magnitude =
    integrationTarget.integratedMagnitude === null ||
    integrationTarget.integratedMagnitude === undefined
      ? Number.NaN
      : Number(integrationTarget.integratedMagnitude);
  const size = integrationTarget.apparentSizeArcmin;
  const surfaceBrightness =
    Number.isFinite(magnitude) &&
    Array.isArray(size) &&
    size[0] > 0 &&
    size[1] > 0
      ? magnitude + 2.5 * Math.log10(Math.PI * (size[0] * 30) * (size[1] * 30))
      : null;
  // One magnitude per square arcsecond is a substantial signal-to-noise change;
  // cap it so the result remains a useful session-planning range.
  const brightnessFactor = Number.isFinite(surfaceBrightness)
    ? Math.min(2.6, Math.max(0.55, 1.35 ** (surfaceBrightness - 22)))
    : 1;
  const has50PCalibration = (integrationTarget.tags || []).some((tag) =>
    /50p/i.test(tag),
  );
  const historicMinutes = has50PCalibration
    ? Number(integrationTarget.currentTotalSeconds) / 60
    : Number.NaN;
  const calibratedMinutes =
    Number.isFinite(historicMinutes) &&
    historicMinutes >= 30 &&
    historicMinutes <= 12 * 60
      ? historicMinutes * focalFactor
      : source.hours * 60 * focalFactor * altitudeFactor * brightnessFactor;
  const recommendedMinutes = roundIntegrationMinutes(calibratedMinutes);
  return {
    kind: source.kind,
    minimumMinutes: Math.max(
      15,
      Math.round((recommendedMinutes * 0.7) / 15) * 15,
    ),
    recommendedMinutes,
    maximumMinutes: Math.max(
      15,
      Math.round((recommendedMinutes * 1.35) / 15) * 15,
    ),
    usesMagnitude: Number.isFinite(surfaceBrightness),
    available: true,
  };
}

export function sortSuggestedCards(cards, order = "altitude") {
  const entries = [...cards];
  const usableMinutes = (card) =>
    (new Date(card.usableEnd).getTime() -
      new Date(card.usableStart).getTime()) /
    60000;
  return entries.sort((left, right) => {
    if (order === "window")
      return (
        usableMinutes(right) - usableMinutes(left) ||
        right.maxAltitude - left.maxAltitude
      );
    if (order === "early")
      return (
        new Date(left.usableStart).getTime() -
          new Date(right.usableStart).getTime() ||
        right.maxAltitude - left.maxAltitude
      );
    if (order === "margin")
      return (
        right.altitudeMargin - left.altitudeMargin ||
        right.maxAltitude - left.maxAltitude
      );
    // "Score de ce soir": the higher share of its own maximum first, by
    // cross-multiplication (`compareTonightScores`, `target-score.js`); a
    // card without `tonightScore` last.
    if (order === "score") {
      const leftScore = left.tonightScore;
      const rightScore = right.tonightScore;
      const leftScored = Boolean(leftScore && leftScore.max > 0);
      const rightScored = Boolean(rightScore && rightScore.max > 0);
      const byScore =
        leftScored && rightScored
          ? rightScore.total * leftScore.max - leftScore.total * rightScore.max
          : leftScored === rightScored
            ? 0
            : leftScored
              ? -1
              : 1;
      return byScore || right.maxAltitude - left.maxAltitude;
    }
    return (
      right.maxAltitude - left.maxAltitude ||
      right.best.moonSeparation - left.best.moonSeparation
    );
  });
}

export function framing(target, field) {
  const size = target.apparentSizeArcmin || apparentSizesArcmin[target.source];
  if (!field || !size) return { size, fit: "unknown", occupancy: null };
  const occupancy = Math.max(
    (size[0] / 60 / field.width) * 100,
    (size[1] / 60 / field.height) * 100,
  );
  return {
    size,
    occupancy,
    fit: occupancy <= 68 ? "comfortable" : occupancy <= 98 ? "tight" : "mosaic",
  };
}

// The visual rule's settings, written once (VISUAL-SUGGESTIONS-PRECISION-01).
//
// 1. The limit under the place's sky. Without a sky the limit stays the
//    textbook dark-sky one, 2.7 + 5 log10(aperture in mm). With the place's
//    sky (its SQM, measured, typed or estimated; else the typical SQM of its
//    Bortle class), the limit is the naked-eye limit against the background
//    the eye sees at the eyepiece, plus the aperture's gain:
//      limit = NELM(sky + 5 log10(7 / exit pupil)) + 5 log10(aperture / 7)
//      NELM(b) = 7.93 - 5 log10(10^(4.316 - b / 5) + 1)
//    NELM(b) is the relation between the sky brightness b (mag/arcsec²) and
//    the naked-eye limiting magnitude derived from Schaefer, B. E. (1990),
//    "Telescopic limiting magnitudes", PASP 102, 212-229, in the form
//    Unihedron publishes for its Sky Quality Meter. The telescope dims the
//    background by (exit pupil / 7 mm)² (a 7 mm eye pupil, the transmission
//    left out), which is why a higher magnification shows fainter stars
//    under a bright sky.
// 2. The contrast of a diffuse object (a galaxy, a nebula, a planetary
//    nebula). Magnification dims the object and the sky alike, so what a
//    bright sky takes from a diffuse object is its contrast: its mean surface
//    brightness SB (its integrated magnitude spread over the ellipse of its
//    apparent size) against the sky's. Its margin is
//      sky + threshold - SB,
//    `threshold` being how much fainter than the sky a large surface can be
//    and still be seen, in magnitudes; the target's margin is the smaller of
//    this one and the magnitude margin. Stars and clusters keep the magnitude
//    margin alone. The eye needs less contrast against a brighter background:
//    at the low light of the eyepiece the threshold contrast falls as the
//    square root of the background's luminance (the de Vries-Rose law), half
//    a magnitude of threshold per magnitude of background:
//      threshold = contrastThreshold
//        + contrastSlope * (contrastBackground - background at the eye),
//    between contrastThresholdMinimum and contrastThresholdMaximum.
//    contrastThreshold = 2.2 mag (13 %) at a background of 23.75 mag/arcsec²
//    at the eye is a rounded value of the order of the threshold contrasts
//    Blackwell measured for large targets (Blackwell, H. R. (1946), "Contrast
//    thresholds of the human eye", JOSA 36, 624-643, as Clark, R. N. (1990),
//    "Visual Astronomy of the Deep Sky", applies them to the telescope),
//    checked on reference targets: under a city sky (SQM 18.5) M31 and M42
//    stay suitable in a 114 mm at 36x, M33 and M101 become difficult.
// 3. The size at the eyepiece. A target whose apparent size at the eye
//    (its size times the magnification) is under smallComfortArcmin (half a
//    degree, the Moon seen with the naked eye) is a little small for the
//    eyepiece, and at smallPointArcmin (three times the eye's resolution of
//    about 1') or less it is little more than a point: its share runs from 0
//    to 1 between the two, in log. A target larger than largeOnsetRatio
//    times the true field is too large for it, with a share up to 1 at
//    largeFullRatio; the clusters and the nebulae one sweeps start later
//    (sweptOnsetRatio, sweptFullRatio). The share never changes the status:
//    it only lowers the target in the suggestions.
export const visualSuitabilityRule = Object.freeze({
  eyePupilMm: visualEyePupilMm,
  nelmZero: schaeferNelmZero,
  nelmSkyOffset: schaeferNelmSkyOffset,
  contrastThreshold: 2.2,
  contrastBackground: 23.75,
  contrastSlope: 0.5,
  contrastThresholdMinimum: 1,
  contrastThresholdMaximum: 5,
  smallComfortArcmin: 30,
  smallPointArcmin: 3,
  largeOnsetRatio: 1.5,
  largeFullRatio: 4,
  sweptOnsetRatio: 3,
  sweptFullRatio: 8,
});

const visualFinite = (value) =>
  value === null || value === undefined || value === ""
    ? Number.NaN
    : Number(value);

// The SQM of the place's sky (`{ sqm, bortleClass }`): its SQM, else the
// typical SQM of its Bortle class; `null` without either.
export function visualSkySqm(sky) {
  const sqm = visualFinite(sky?.sqm);
  if (Number.isFinite(sqm) && sqm > 0) return sqm;
  const bortleClass = visualFinite(sky?.bortleClass);
  if (
    Number.isInteger(bortleClass) &&
    bortleClass >= 1 &&
    bortleClass <= eyepieceViewConstants.sky.sqmByBortle.length
  )
    return eyepieceViewConstants.sky.sqmByBortle[bortleClass - 1];
  return null;
}

// The naked-eye limiting magnitude under a sky of `skySqm` mag/arcsec²
// (Schaefer 1990, in Unihedron's form: `visual-limits.js`).
export function nakedEyeLimitingMagnitude(skySqm) {
  return schaeferLimitingMagnitude(skySqm);
}

// The kind of target the visual rule reads: a planetary nebula is told
// apart before anything else (its English name holds "planet").
export function visualTargetKind(target) {
  const type = `${target?.skyTarget?.typeKey || target?.skyTarget?.type || ""} ${(target?.tags || []).join(" ")}`;
  if (/nébuleuse planétaire|planetary nebula/i.test(type)) return "planetary";
  if (/amas|cluster/i.test(type)) return "cluster";
  if (/rémanent|supernova remnant/i.test(type)) return "faint-nebula";
  if (/nébuleuse|nebula|émission|emission|h ii|dark/i.test(type))
    return "nebula";
  if (/galaxie|galaxy/i.test(type)) return "galaxy";
  return "general";
}

// The share (0 to 1) of the size penalty: too small for the magnification,
// or too large for the true field (`visualSuitabilityRule`, 3.).
function visualSizeFit(
  targetDiameterDegrees,
  magnification,
  framingRatio,
  kind,
) {
  const rule = visualSuitabilityRule;
  const apparentArcmin = targetDiameterDegrees * 60 * magnification;
  if (apparentArcmin > 0 && apparentArcmin < rule.smallComfortArcmin) {
    const share = Math.min(
      1,
      Math.log10(rule.smallComfortArcmin / apparentArcmin) /
        Math.log10(rule.smallComfortArcmin / rule.smallPointArcmin),
    );
    return { sizeFit: "small", sizeShare: share };
  }
  const swept =
    kind === "cluster" || kind === "nebula" || kind === "faint-nebula";
  const onset = swept ? rule.sweptOnsetRatio : rule.largeOnsetRatio;
  const full = swept ? rule.sweptFullRatio : rule.largeFullRatio;
  if (framingRatio !== null && framingRatio > onset) {
    const share = Math.min(
      1,
      Math.log10(framingRatio / onset) / Math.log10(full / onset),
    );
    return { sizeFit: "large", sizeShare: share };
  }
  return { sizeFit: null, sizeShare: 0 };
}

// The filter a visual profile puts in front of the eyepiece: of its filters
// (`filterProfiles`, else `filters`, and the ids not resolved, whose family is
// read from the id), the one of the largest gain on `target`
// (`visualFilterGain`); `{ family: null, gain: 0 }` when none has a positive
// one. A filter that dims the target is taken off.
export function visualProfileFilter(target, profile) {
  const filters = [
    ...(Array.isArray(profile?.filterProfiles) && profile.filterProfiles.length
      ? profile.filterProfiles
      : Array.isArray(profile?.filters)
        ? profile.filters
        : []),
    ...(Array.isArray(profile?.unresolvedFilterIds)
      ? profile.unresolvedFilterIds
      : []),
  ];
  let best = { family: null, gain: 0 };
  for (const filter of filters) {
    const family = filterFamily(filter);
    const gain = visualFilterGain(target, family);
    if (gain > best.gain) best = { family, gain };
  }
  return best;
}

// This is deliberately a conservative observing aid, not a promise of what
// the eye will see. Integrated magnitudes of diffuse objects are uneven, so
// unknown values stay in the list and only clearly implausible combinations
// are withheld from visual recommendations. `sky` is the place's sky
// (`{ sqm, bortleClass }`) or null: without it, the limit is the dark-sky one
// of before (`visualSuitabilityRule`).
export function visualSuitability(
  target,
  profile,
  field = fieldOfView(profile),
  sky = null,
) {
  if (profile?.mode !== "visual")
    return { status: "not-applicable", visible: true };
  if ((target.tags || []).some((tag) => /planet/i.test(tag)))
    return { status: "suitable", visible: true, reason: "planet" };
  const rule = visualSuitabilityRule;
  const apertureMm = Number(profile?.apertureMm);
  const magnitude = visualFinite(target?.integratedMagnitude);
  const size = target?.apparentSizeArcmin;
  const targetDiameter = Array.isArray(size)
    ? Math.max(Number(size[0]) || 0, Number(size[1]) || 0) / 60
    : 0;
  const trueFieldDegrees = Number(field?.diameter || field?.width);
  const magnification = Number(profile?.magnification);
  const exitPupilMm = Number(profile?.exitPupilMm);
  const skySqm = visualSkySqm(sky);
  // The background the eye sees at the eyepiece: the sky dimmed by the
  // exit pupil (the naked-eye sky without a known exit pupil).
  const pupilMm =
    Number.isFinite(exitPupilMm) && exitPupilMm > 0
      ? Math.min(exitPupilMm, rule.eyePupilMm)
      : rule.eyePupilMm;
  const eyeBackground =
    skySqm === null ? null : skySqm + 5 * Math.log10(rule.eyePupilMm / pupilMm);
  // The one instrument limit (`visual-limits.js`): the same background, the
  // aperture's gain; the dark-sky rule of thumb without a sky.
  const magnitudeLimit = instrumentLimitingMagnitude({
    apertureMm,
    sqm: skySqm,
    exitPupilMm,
  });
  // The surface brightness of the part of the ellipse the target fills
  // (`visual-model.js`, 1.).
  const { structureClass, fillingFactor } = visualTargetStructure(target);
  const surfaceBrightness =
    Number.isFinite(magnitude) &&
    Array.isArray(size) &&
    Number(size[0]) > 0 &&
    Number(size[1]) > 0
      ? magnitude +
        2.5 * Math.log10(Math.PI * Number(size[0]) * Number(size[1]) * 900) +
        2.5 * Math.log10(fillingFactor)
      : Number.NaN;
  const effectiveMagnitude = Number.isFinite(magnitude)
    ? magnitude +
      Math.min(
        1.2,
        Math.max(
          0,
          (Number.isFinite(surfaceBrightness) ? surfaceBrightness : 22) - 22,
        ) * 0.15,
      )
    : Number.NaN;
  const kind = visualTargetKind(target);
  const diffuse =
    kind === "galaxy" ||
    kind === "nebula" ||
    kind === "faint-nebula" ||
    kind === "planetary";
  // The filter in front of the eyepiece (`visual-model.js`, 2.): the best of
  // the profile's, or none when none helps.
  const { family: filterFamilyUsed, gain: filterGain } = visualProfileFilter(
    target,
    profile,
  );
  const contrastMargin =
    eyeBackground !== null && diffuse && Number.isFinite(surfaceBrightness)
      ? filterGain +
        skySqm +
        Math.min(
          rule.contrastThresholdMaximum,
          Math.max(
            rule.contrastThresholdMinimum,
            rule.contrastThreshold +
              rule.contrastSlope * (rule.contrastBackground - eyeBackground),
          ),
        ) -
        surfaceBrightness
      : null;
  const magnitudeMargin = Number.isFinite(magnitudeLimit)
    ? contrastMargin === null
      ? magnitudeLimit - effectiveMagnitude + Math.min(0, filterGain)
      : Math.min(magnitudeLimit - effectiveMagnitude, contrastMargin)
    : Number.NaN;
  const framingRatio =
    targetDiameter > 0 && trueFieldDegrees > 0
      ? targetDiameter / trueFieldDegrees
      : null;
  const { sizeFit, sizeShare } = visualSizeFit(
    targetDiameter,
    magnification,
    framingRatio,
    kind,
  );
  const exitPupilComfortable =
    !Number.isFinite(exitPupilMm) || (exitPupilMm >= 0.4 && exitPupilMm <= 7);
  const facts = {
    magnification,
    exitPupilMm,
    trueFieldDegrees,
    framingRatio,
    skySqm,
    contrastMargin,
    sizeFit,
    sizeShare,
    structureClass,
    fillingFactor,
    filterFamily: filterFamilyUsed,
    filterGain,
  };
  if (!Number.isFinite(magnitudeMargin)) {
    return {
      status: "unknown",
      visible: true,
      magnitudeLimit,
      ...facts,
    };
  }
  if (magnitudeMargin < -2) {
    return {
      status: "unlikely",
      visible: false,
      magnitudeLimit,
      magnitudeMargin,
      ...facts,
    };
  }
  return {
    status:
      magnitudeMargin < 0 ||
      !exitPupilComfortable ||
      (structureClass === "filamentary" &&
        magnitudeMargin < visualStructureRule.filamentarySuitableMargin)
        ? "difficult"
        : "suitable",
    visible: true,
    magnitudeLimit,
    magnitudeMargin,
    ...facts,
  };
}

// The visual verdict of a card (VISUAL-SIM-02a, stage 5): the one of the
// best pair (eyepiece, filter) of « Mon matériel » on the telescope of
// `profile` (`visualBestPair`), so that the suggestions and the preview judge
// the same thing; when « Mon matériel » shows nothing but a generic pair
// does, the verdict of that pair. `pair` says which pair it is (`advice`:
// what to change, `generic`: not in « Mon matériel »). Out of visual mode,
// the verdict of before.
export function visualCardVerdict(
  target,
  profile,
  field,
  skyQuality,
  inventory = null,
) {
  const result =
    profile?.mode === "visual"
      ? visualBestPair({
          target,
          profile,
          eyepieces: inventory?.eyepieces || [],
          filters: inventory?.filters || [],
          sky: skyQuality,
        })
      : null;
  if (!result) return visualSuitability(target, profile, field, skyQuality);
  const ownShows = result.ownVerdict.visible !== false;
  const verdict = ownShows ? result.ownVerdict : result.bestVerdict;
  const pair = ownShows ? result.own : result.best;
  return {
    ...verdict,
    pair: {
      eyepiece: pair.eyepiece,
      filter: pair.filter,
      status: pair.status,
      generic: pair.generic,
      chosen: pair.chosen,
      advice: result.advice,
    },
  };
}

function timeSamples(start, end, minutes = 10) {
  const values = [];
  for (
    let current = start.getTime();
    current <= end.getTime();
    current += minutes * 60000
  )
    values.push(new Date(current));
  if (values.at(-1)?.getTime() !== end.getTime()) values.push(end);
  return values;
}

// `darkness` is the plan's twilight threshold (`astronomical`, `nautical` or
// `civil`): the night is the Sun's time under -18°, -12° or -6°. Absent or
// unknown, it is the astronomical night, as it always was.
export function planNightGeometry({
  date,
  location,
  targets,
  locale = "fr",
  planetReferences,
  darkness,
}) {
  const latitude = String(location?.latitude ?? "").trim();
  const longitude = String(location?.longitude ?? "").trim();
  if (
    !date ||
    !latitude ||
    !longitude ||
    !Number.isFinite(Number(latitude)) ||
    !Number.isFinite(Number(longitude))
  )
    return null;
  const observer = observerFor(location);
  // A place with no usable IANA zone at all — absent, or a name ICU does not
  // recognize — anchors on its own longitude rather than assuming UTC
  // `zonedDateOrLongitudeAnchor` is the
  // exact same rule `astronomicalNightWindow` applies server-side, so this
  // interactive timeline and the server's authoritative
  // `nightStartAt`/`nightEndAt` never derive a different night for the same
  // zoneless place. An explicit `"UTC"`/`"Etc/UTC"` is still a true zero
  // offset.
  const noon = zonedDateOrLongitudeAnchor(
    date,
    12,
    location.timeZone,
    Number(location.longitude),
  );
  const followingNoon = zonedDateOrLongitudeAnchor(
    dateAfter(date),
    12,
    location.timeZone,
    Number(location.longitude),
  );
  // The -18° crossing search itself lives in astro-core/night-window.js now
  // (astronomicalNightWindow's own definition of a night), shared with the
  // server so it never drifts from this one. What stays here, deliberately,
  // is the polar substitution: when the Sun never crosses -18° that night —
  // permanent day, or a night longer than the search window — this planner
  // still needs *a* geometry to draw the step-4 timeline against, so it
  // falls back to local civil noon and the following noon. The open
  // definition must not do that: see the contract's "night boundaries of a
  // plan" section for why a server-derived night is never invented.
  const { dusk: astronomicalDusk, dawn: astronomicalDawn } =
    nightAltitudeCrossings({
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      elevation: Number(location.elevation || 0),
      anchor: noon,
      sunAltitudeDegrees: darknessAltitude(darkness),
    });
  const start = astronomicalDusk || noon;
  const end = astronomicalDawn || followingNoon;
  if (!start || !end || end <= start) return null;
  const samples = timeSamples(start, end);
  const moonIllumination = Math.round(
    Illumination(Body.Moon, start).phase_fraction * 100,
  );
  const moonSeries = samples.map((sample) => {
    const equatorial = Equator(Body.Moon, sample, observer, true, true);
    return {
      time: sample.toISOString(),
      altitude: horizontalEquatorial(sample, observer, equatorial).altitude,
    };
  });
  const candidates = [
    ...fixedCandidates(targets),
    ...planetCandidates(locale, planetReferences),
  ]
    .map((target) => {
      const series = samples.map((sample) => {
        const position = horizontalForTarget(sample, observer, target);
        const moon = Equator(Body.Moon, sample, observer, true, true);
        return {
          time: sample.toISOString(),
          altitude: position.altitude,
          azimuth: position.azimuth,
          moonSeparation: separationDegrees(position.equatorial, moon),
        };
      });
      const best = series.reduce((current, point) =>
        point.altitude > current.altitude ? point : current,
      );
      return { target, series, best };
    })
    .filter(Boolean);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    moonIllumination,
    moonSeries,
    candidates,
  };
}

/**
 * The Moon's place in the sky at each of `times` (ISO-8601 instants) seen from
 * `location`: `[{ time, altitude, azimuth }]`, the very ephemeris and
 * refraction `planNightGeometry` reads the Moon's altitude from, so the track
 * of the Moon over a target's night never disagrees with the Moon's separation
 * the same samples carry.
 */
export function moonHorizontalTrack({ location, times }) {
  const observer = observerFor(location);
  return (Array.isArray(times) ? times : []).flatMap((time) => {
    const sample = new Date(time);
    if (Number.isNaN(sample.getTime())) return [];
    const position = horizontalEquatorial(
      sample,
      observer,
      Equator(Body.Moon, sample, observer, true, true),
    );
    return [
      {
        time: sample.toISOString(),
        altitude: position.altitude,
        azimuth: position.azimuth,
      },
    ];
  });
}

/**
 * The night of a plan, as every consumer reads it: `{ start, end, darkness,
 * span, darkStart, darkEnd, sunset, sunrise }`, all instants ISO-8601 UTC.
 *
 * - `darkness`: the plan's normalised `darkness`, `"astronomical"` when
 *   absent or unknown;
 * - `darkStart`/`darkEnd`: the night at that darkness — the Sun's crossings
 *   of -18°, -12° or -6° searched exactly as `planNightGeometry` searches
 *   -18° (same anchor, same polar substitution of noon and the following
 *   noon), so a plan with neither property gets exactly `planNightGeometry`'s
 *   `start` and `end`;
 * - `sunset`/`sunrise`: the Sun's crossings of -0.8333° that evening, each
 *   or `null` (no such crossing);
 * - `span`: `"custom"` when the plan's normalised `nightSpan` is a custom
 *   span (clamped to sunset–sunrise, ten-minute steps, thirty minutes at
 *   least — `normalizeNightSpan`), else `"astronomical"`;
 * - `start`/`end`: the custom span when there is one, else the dark night.
 *
 * `place` defaults to the plan's own `location`. `null` when the plan has no
 * date or the place no usable coordinates.
 */
export function planNightWindow(plan, place = plan?.location) {
  const date = plan?.date;
  const location = place;
  const latitude = String(location?.latitude ?? "").trim();
  const longitude = String(location?.longitude ?? "").trim();
  if (
    !date ||
    !latitude ||
    !longitude ||
    !Number.isFinite(Number(latitude)) ||
    !Number.isFinite(Number(longitude))
  )
    return null;
  const noon = zonedDateOrLongitudeAnchor(
    date,
    12,
    location.timeZone,
    Number(location.longitude),
  );
  const followingNoon = zonedDateOrLongitudeAnchor(
    dateAfter(date),
    12,
    location.timeZone,
    Number(location.longitude),
  );
  const observer = {
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
    elevation: Number(location.elevation || 0),
    anchor: noon,
  };
  const darkness = normalizePlanDarkness(plan.darkness) || "astronomical";
  const { dusk, dawn } = nightAltitudeCrossings({
    ...observer,
    sunAltitudeDegrees: darknessAltitude(darkness),
  });
  const darkStart = dusk || noon;
  const darkEnd = dawn || followingNoon;
  if (!darkStart || !darkEnd || darkEnd <= darkStart) return null;
  const sun = nightAltitudeCrossings({
    ...observer,
    sunAltitudeDegrees: SUNRISE_SUNSET_ALTITUDE,
  });
  const sunset = sun.dusk ? sun.dusk.toISOString() : null;
  const sunrise = sun.dawn ? sun.dawn.toISOString() : null;
  const nightSpan = normalizeNightSpan(plan.nightSpan, { sunset, sunrise });
  const custom = nightSpan?.mode === "custom";
  return {
    start: custom ? nightSpan.start : darkStart.toISOString(),
    end: custom ? nightSpan.end : darkEnd.toISOString(),
    darkness,
    span: custom ? "custom" : "astronomical",
    darkStart: darkStart.toISOString(),
    darkEnd: darkEnd.toISOString(),
    sunset,
    sunrise,
  };
}

// How far the timeline of "Durée de la nuit" reaches beyond sunset and
// sunrise.
export const nightSpanScaleMarginMinutes = 30;

/**
 * The night's Moon as the forecast's score reads it:
 * `{ illumination, series }` for `hourlyAstronomyForecast` and
 * `summarizeAstronomyForecast`, from a `planNight` result (its
 * `moonIllumination` and `moonSeries`) or a `planNightSpanSky` one (the share
 * of the disc lit at the start of the dark night); `null` without a series.
 */
export function forecastMoonOfNight(night) {
  if (!Array.isArray(night?.moonSeries)) return null;
  const start = new Date(night.darkStart ?? night.start);
  const illumination = Number.isFinite(night.moonIllumination)
    ? night.moonIllumination
    : Number.isFinite(start.getTime())
      ? Math.round(Illumination(Body.Moon, start).phase_fraction * 100)
      : null;
  return illumination === null
    ? null
    : { illumination, series: night.moonSeries };
}

/**
 * The sky of a plan's night for the "Durée de la nuit" timeline: everything
 * the timeline draws that the place, the date and the plan's darkness
 * decide, computed locally and always available.
 *
 * `{ darkness, span, start, end, darkStart, darkEnd, sunset, sunrise,
 * scaleStart, scaleEnd, bounds, twilights, moonSeries }`, instants ISO-8601
 * UTC:
 * - everything `planNightWindow` returns (`start`/`end` are the span the plan
 *   uses: the custom span, else the dark night);
 * - `scaleStart`/`scaleEnd`: the timeline, thirty minutes before sunset to
 *   thirty minutes after sunrise (the dark night's when the Sun does not set
 *   or rise);
 * - `bounds`: where a custom span may lie, the first ten-minute mark at or
 *   after sunset to the last one at or before sunrise, `null` without a
 *   sunset or a sunrise (no custom span then);
 * - `twilights`: `{ civil, nautical, astronomical }`, each `{ start, end }`
 *   (the Sun under -6°, -12°, -18°) or `null`;
 * - `moonSeries`: the Moon's altitude every ten minutes across the scale,
 *   `[{ time, altitude }]`.
 *
 * `null` when the plan has no date or the place no usable coordinates.
 */
export function planNightSpanSky(plan, place = plan?.location) {
  const window = planNightWindow(plan, place);
  if (!window) return null;
  const location = place;
  const anchor = zonedDateOrLongitudeAnchor(
    plan.date,
    12,
    location.timeZone,
    Number(location.longitude),
  );
  const crossingsAt = (altitude) =>
    nightAltitudeCrossings({
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      elevation: Number(location.elevation || 0),
      anchor,
      sunAltitudeDegrees: altitude,
    });
  const twilights = {};
  for (const darkness of ["civil", "nautical", "astronomical"]) {
    const { dusk, dawn } = crossingsAt(darknessAltitude(darkness));
    twilights[darkness] =
      dusk && dawn
        ? { start: dusk.toISOString(), end: dawn.toISOString() }
        : null;
  }
  const margin = nightSpanScaleMarginMinutes * 60000;
  const scaleStart = new Date(
    Date.parse(window.sunset ?? window.darkStart) - margin,
  );
  const scaleEnd = new Date(
    Date.parse(window.sunrise ?? window.darkEnd) + margin,
  );
  const step = nightSpanRule.stepMinutes * 60000;
  const boundStart = window.sunset
    ? Math.ceil(Date.parse(window.sunset) / step) * step
    : null;
  const boundEnd = window.sunrise
    ? Math.floor(Date.parse(window.sunrise) / step) * step
    : null;
  const bounds =
    boundStart !== null &&
    boundEnd !== null &&
    boundEnd - boundStart >= nightSpanRule.minimumMinutes * 60000
      ? {
          start: new Date(boundStart).toISOString(),
          end: new Date(boundEnd).toISOString(),
        }
      : null;
  const observer = observerFor(location);
  const moonSeries = timeSamples(scaleStart, scaleEnd).map((sample) => ({
    time: sample.toISOString(),
    altitude: horizontalEquatorial(
      sample,
      observer,
      Equator(Body.Moon, sample, observer, true, true),
    ).altitude,
  }));
  return {
    ...window,
    scaleStart: scaleStart.toISOString(),
    scaleEnd: scaleEnd.toISOString(),
    bounds,
    twilights,
    moonSeries,
  };
}

export function planNight({
  date,
  location,
  targets,
  profile,
  locale = "fr",
  minAltitude = 30,
  moonSeparationMinimum = 25,
  moonSeparationMinimumForTarget,
  planetReferences,
  geometry = null,
  retainedTargetIds = [],
  darkness,
  // The place's sky (`{ sqm, bortleClass }`: measured, typed or estimated),
  // for the visual limit (`visualSuitability`); null keeps the dark-sky one.
  skyQuality = null,
  // VISUAL-SIM-02a: the eyepieces and filters of « Mon matériel »
  // (`{ eyepieces, filters }`) the visual verdict of a card tries with the
  // telescope of `profile` (`visualBestPair`); null: the pair of `profile`.
  visualInventory = null,
}) {
  const calculatedGeometry =
    geometry ||
    planNightGeometry({
      date,
      location,
      targets,
      locale,
      planetReferences,
      darkness,
    });
  if (!calculatedGeometry) return null;
  const field = fieldOfView(profile);
  const allowedCandidates = new Set(
    [
      ...fixedCandidates(targets),
      ...planetCandidates(locale, planetReferences),
    ].map(plannerCandidateKey),
  );
  const cards = calculatedGeometry.candidates
    .filter(({ target }) => allowedCandidates.has(plannerCandidateKey(target)))
    .map(({ target, series, best }) => {
      const families = recommendedFilterFamilies(target, profile?.mode);
      const compatibleFilters = (profile?.filters || []).filter(
        (filter) => !families || families.includes(filterFamily(filter)),
      );
      const options = (
        compatibleFilters.length
          ? compatibleFilters
          : [suggestedFilter(target, profile)]
      )
        .map((filter) => {
          const requested = moonSeparationMinimumForTarget?.({
            target,
            filter,
          });
          return {
            filter,
            threshold:
              requested !== null &&
              requested !== undefined &&
              Number.isFinite(Number(requested))
                ? Number(requested)
                : moonSeparationMinimum,
          };
        })
        .sort((a, b) => a.threshold - b.threshold);
      const filter = options[0].filter;
      const targetMoonSeparationMinimum = options[0].threshold;
      const aboveAltitude = series.filter(
        (point) => point.altitude >= minAltitude,
      );
      const usable = aboveAltitude.filter(
        (point) => point.moonSeparation >= targetMoonSeparationMinimum,
      );
      const retained = retainedTargetIds.includes(target.id);
      if (!usable.length && !retained) {
        return {
          excluded: {
            target,
            reason: aboveAltitude.length ? "moon" : "altitude",
          },
        };
      }
      const visual = visualCardVerdict(
        target,
        profile,
        field,
        skyQuality,
        visualInventory,
      );
      if (profile?.mode === "visual" && !visual.visible && !retained)
        return null;
      return {
        target,
        series,
        retained,
        reviewReasons: [
          ...(!usable.length
            ? [aboveAltitude.length ? "moon" : "altitude"]
            : []),
          ...(profile?.mode === "visual" && !visual.visible ? ["visual"] : []),
        ],
        usableStart: usable[0]?.time || calculatedGeometry.start,
        usableEnd: usable.at(-1)?.time || calculatedGeometry.end,
        best,
        maxAltitude: best.altitude,
        altitudeMargin: best.altitude - minAltitude,
        usableMinutes: usable.length
          ? Math.round(
              (new Date(usable.at(-1).time).getTime() -
                new Date(usable[0].time).getTime()) /
                60000,
            )
          : 0,
        direction: `${cardinalDirection(usable[0]?.azimuth ?? best.azimuth, locale)} → ${cardinalDirection(usable.at(-1)?.azimuth ?? best.azimuth, locale)}`,
        filter,
        moonSeparationMinimum: targetMoonSeparationMinimum,
        framing: framing(target, field),
        integration: suggestedIntegration(target, profile, best.altitude),
        visual,
      };
    })
    .filter(Boolean);
  const exclusions = cards
    .filter((card) => card.excluded)
    .map((card) => card.excluded);
  const usableCards = cards
    .filter((card) => !card.excluded)
    .sort(
      (left, right) =>
        right.maxAltitude - left.maxAltitude ||
        right.best.moonSeparation - left.best.moonSeparation,
    );
  return {
    start: calculatedGeometry.start,
    end: calculatedGeometry.end,
    field,
    moonIllumination: calculatedGeometry.moonIllumination,
    moonSeries: calculatedGeometry.moonSeries,
    cards: usableCards,
    exclusions,
  };
}

// `partial` is the service's own word for a night debriefed "en partie":
// without it a debriefed plan read as `pending`, which is editable.
const planStatuses = new Set([
  "pending",
  "executed",
  "partial",
  "abandoned",
  "archived",
]);

export const plannerPlanStatuses = planStatuses;

export function planStatus(plan) {
  return planStatuses.has(plan?.status) ? plan.status : "pending";
}

/** The states a plan can have had when it was archived (`archivedFrom`). */
export const planArchivedFromStates = Object.freeze([
  "executed",
  "partial",
  "abandoned",
]);

/** The state an archived plan had before its archive, or `null`. */
export function planArchivedFrom(plan) {
  return planStatus(plan) === "archived" &&
    planArchivedFromStates.includes(plan?.archivedFrom)
    ? plan.archivedFrom
    : null;
}

/** `plan` without an `archivedFrom` that does not belong to it. */
export function planWithValidArchivedFrom(plan) {
  if (!plan || !Object.hasOwn(plan, "archivedFrom")) return plan;
  if (planArchivedFrom(plan)) return plan;
  const { archivedFrom: _stale, ...rest } = plan;
  return rest;
}

/**
 * `plan` set to `status`: `archivedAt` stamped on the way into `archived` and
 * cleared on every other change, and the state the plan had kept in
 * `archivedFrom` by an archive (an archive replaces the status, so
 * « Abandonné » would be lost) and dropped by any other change. The service
 * keeps the same fact on its own and serves it back.
 */
export function planWithStatus(plan, status, { now = new Date() } = {}) {
  const { archivedFrom: _before, ...rest } = plan;
  const before = planStatus(plan);
  const kept =
    status !== "archived"
      ? null
      : before === "archived"
        ? planArchivedFrom(plan)
        : planArchivedFromStates.includes(before)
          ? before
          : null;
  return {
    ...rest,
    status,
    archivedAt: status === "archived" ? now.toISOString() : null,
    ...(kept ? { archivedFrom: kept } : {}),
  };
}

/**
 * The one status of a plan as the library says it: "Planifié", "À débriefer", "Exécuté",
 * "En partie", "Abandonné" "Archivé". `toDebrief` is the service's word for a
 * plan whose night is over and whose debriefing is still to be done (the
 * Journal's `to_debrief`): it takes the place of every status but `archived`.
 *
 * | stored `status` | `toDebrief` | status        |
 * | --------------- | ----------- | ------------- |
 * | `archived`      | any         | `archived`    |
 * | any other       | yes         | `toDebrief`   |
 * | `executed`      | no          | `executed`    |
 * | `partial`       | no          | `partial`     |
 * | `abandoned`     | no          | `abandoned`   |
 * | `pending`       | no          | `planned`     |
 */
const planLibraryStatusKeys = Object.freeze({
  planned: "plannerPlanStatusPending",
  toDebrief: "plannerPlanStatusToDebrief",
  executed: "plannerPlanStatusExecuted",
  partial: "plannerPlanStatusPartial",
  abandoned: "plannerPlanStatusAbandoned",
  archived: "plannerPlanStatusArchived",
});
export const planLibraryStatuses = Object.freeze(
  Object.keys(planLibraryStatusKeys),
);

export function planLibraryStatus(plan, { toDebrief = false } = {}) {
  const status = planStatus(plan);
  if (status === "archived") return "archived";
  if (toDebrief) return "toDebrief";
  if (status === "executed" || status === "partial" || status === "abandoned")
    return status;
  return "planned";
}

/** The catalogue key of a library status (`plannerPlanStatus…`). */
export const planLibraryStatusKey = (status) => planLibraryStatusKeys[status];

/**
 * The status the address names (`?status=to-debrief`, `abandoned`…) and
 * the status a parameter names (`null` for "Tous" or an unknown word).
 */
export const planLibraryStatusParameter = (status) =>
  status.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
export const planLibraryStatusFromParameter = (value) =>
  planLibraryStatuses.find(
    (status) => planLibraryStatusParameter(status) === value,
  ) ?? null;

/** The catalogue key of a library status as the filter says it (plural). */
export function planLibraryFilterKey(status) {
  return `plannerPlanFilter${status[0].toUpperCase()}${status.slice(1)}`;
}

export function plansForNight(plans, nightId) {
  return (plans || []).filter((plan) => plan.nightId === nightId);
}

/**
 * The planner's tabs — the plans of a night still to plan. A plan that ran,
 * was abandoned or put away is not a tab: it stays reachable from "Cette
 * nuit" and the Journal.
 */
export function plannerTabPlans(plans) {
  return (plans || []).filter((plan) => planStatus(plan) === "pending");
}

// A night's editing history is bounded so an long session cannot grow the
// document without limit; an identical consecutive snapshot is not recorded.
export const planHistoryDepth = 40;

export function recordPlanHistory(history, plan) {
  const past = history?.past || [];
  const snapshot = structuredClone(plan);
  const previous = past.at(-1);
  if (previous && JSON.stringify(previous) === JSON.stringify(snapshot))
    return null;
  return { past: [...past, snapshot].slice(-planHistoryDepth), future: [] };
}

export function stepPlanHistory({ history, plan, direction }) {
  const past = history?.past || [];
  const future = history?.future || [];
  const source = direction === "redo" ? future : past;
  if (!source.length || !plan || planStatus(plan) !== "pending") return null;
  const restored = structuredClone(source.at(-1));
  const kept = structuredClone(plan);
  return direction === "redo"
    ? {
        history: { past: [...past, kept], future: future.slice(0, -1) },
        restored,
      }
    : {
        history: { past: past.slice(0, -1), future: [...future, kept] },
        restored,
      };
}

// A completed plan is intentionally read-only. Do not restore it as the
// working plan when an editable plan exists on the same night: otherwise
// every session control appears broken after a refresh.
export function restoredActivePlanId({ plans, activePlanId, date }) {
  const remembered = plans.find((plan) => plan.id === activePlanId);
  const pendingForRememberedDate = plans.find(
    (plan) =>
      plan.date === (remembered?.date || date) &&
      planStatus(plan) === "pending",
  );
  return remembered?.status === "pending"
    ? remembered.id
    : pendingForRememberedDate?.id || null;
}

// The altitude selector only ever offers this range; a stored value outside
// it comes from an edited document, never from the UI.
export const plannerMinAltitudeRange = [20, 40];
export const plannerMoonSeparationRange = [10, 60];

function clampConstraint(value, [minimum, maximum]) {
  return Math.min(maximum, Math.max(minimum, value));
}

// `clampMinAltitude` is off for the stored web contract, which historically
// clamps the Moon separation on load and leaves the altitude untouched.
export function savedPlanConstraints(plan, { clampMinAltitude = false } = {}) {
  const minAltitude =
    plan.minAltitude !== null &&
    plan.minAltitude !== undefined &&
    plan.minAltitude !== "" &&
    Number.isFinite(Number(plan.minAltitude))
      ? Number(plan.minAltitude)
      : null;
  return {
    minAltitude:
      minAltitude !== null && clampMinAltitude
        ? clampConstraint(minAltitude, plannerMinAltitudeRange)
        : minAltitude,
    moonSeparationMinimum:
      plan.moonSeparationMinimum !== null &&
      plan.moonSeparationMinimum !== undefined &&
      plan.moonSeparationMinimum !== "" &&
      Number.isFinite(Number(plan.moonSeparationMinimum))
        ? clampConstraint(
            Number(plan.moonSeparationMinimum),
            plannerMoonSeparationRange,
          )
        : null,
    moonSeparationMinimumByFilter:
      plan.moonSeparationMinimumByFilter &&
      typeof plan.moonSeparationMinimumByFilter === "object"
        ? Object.fromEntries(
            Object.entries(plan.moonSeparationMinimumByFilter)
              .map(([key, threshold]) => [
                key,
                clampConstraint(Number(threshold), plannerMoonSeparationRange),
              ])
              .filter(([, threshold]) => Number.isFinite(threshold)),
          )
        : null,
  };
}
