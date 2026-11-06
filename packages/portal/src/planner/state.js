// Versioned, portable planner state. A night owns its geographic context;
// each plan owns its equipment, constraints and browsing preferences.
import { civilDateLabel, civilNightRangeLabel } from "./day-words.js";
import { defaultHorizonMask } from "./horizon-mask.js";
import { normalizeSkyEntered } from "../sky-brightness-source.js";
import { planAcquisitionDefaults } from "./plan-acquisition.js";

export const plannerSchemaVersion = 2;
export const planSettingKeys = [
  "equipment",
  "minAltitude",
  "moonSeparationMinimum",
  "moonSeparationMinimumByFilter",
  "mountSafety",
  "catalogueSelection",
];
export const defaultPlanView = {
  type: "",
  catalogue: "",
  plan: "",
  query: "",
  source: "catalogue",
  sort: "altitude",
  view: "list",
  equipmentCollapsed: false,
  constraintsCollapsed: false,
  skyMap: "realistic",
  selectedTargetId: null,
  horizon: {
    projection: "circular",
    rotation: 0,
    showLabels: false,
    sampleIndex: null,
    mode: "positions",
    pathTargetId: null,
    layers: { mask: true, lightPollution: false },
  },
};
const copy = (value) => structuredClone(value);
const plain = (value) =>
  value && typeof value === "object" && !Array.isArray(value);

// The horizon map's two modes: every target at one instant (`positions`), or
// the whole night of one chosen target (`path`). An absent or unknown mode
// reads as `positions`; the chosen target is a non-empty string id or null.
// Every other key of the sub-state passes through.
//
// Its layers: the place's horizon mask, on unless switched off, and the
// estimated light pollution by direction, off unless switched on. Only
// `false` turns the mask off and only `true` turns the light pollution on;
// any other value reads as the default. Other keys of `layers` pass through.
// The grid the light-pollution layer draws is never stored here.
export const planHorizonModes = ["positions", "path"];
export function normalizePlanHorizonLayers(layers) {
  const current = plain(layers) ? copy(layers) : {};
  return {
    ...current,
    mask: current.mask !== false,
    lightPollution: current.lightPollution === true,
  };
}
export function normalizePlanHorizonView(horizon) {
  const current = plain(horizon) ? copy(horizon) : {};
  return {
    ...copy(defaultPlanView.horizon),
    ...current,
    mode: current.mode === "path" ? "path" : "positions",
    pathTargetId:
      typeof current.pathTargetId === "string" && current.pathTargetId
        ? current.pathTargetId
        : null,
    layers: normalizePlanHorizonLayers(current.layers),
  };
}

export function planViewForTargetSelection(view) {
  const current = plain(view) ? view : {};
  return {
    ...copy(defaultPlanView),
    ...copy(current),
    view: "list",
    equipmentCollapsed: true,
    constraintsCollapsed: true,
    horizon: normalizePlanHorizonView(current.horizon),
  };
}

const dateValid = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value + "T12:00:00Z")) &&
  new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value;
const number = (value) =>
  (typeof value === "string" && !value.trim()) ||
  value === null ||
  value === undefined
    ? null
    : Number(value);
export function placeCoordinates(value) {
  const latitude = number(value?.latitude),
    longitude = number(value?.longitude);
  return Number.isFinite(latitude) &&
    Math.abs(latitude) <= 90 &&
    Number.isFinite(longitude) &&
    Math.abs(longitude) <= 180
    ? { latitude, longitude }
    : null;
}
// A place's stored elevation (a decimal string of metres) as text to show, or
// null when the place does not know it. Unknown is not sea level: a place
// saved while offline, or whose elevation the service could not estimate, has
// none, and "0" is only ever a real zero (a seaside place). The web used to
// turn both into "0" while normalizing, and wrote an elevation of 0 m for a
// hilltop.
export function knownElevation(value) {
  const text =
    value === null || value === undefined ? "" : String(value).trim();
  return text && Number.isFinite(Number(text)) ? text : null;
}
export function resolvedPlaceNaming(current, resolvedPlace, fallback) {
  // A search-result selection resolves its coordinates with reverse:false
  // (the name is already known from the search), so resolvedPlace then has
  // no name/locality of its own. Keep whatever the search result (or an
  // earlier resolution) already suggested instead of collapsing to the
  // generic fallback and erasing a perfectly good name — that fallback is
  // only appropriate when nothing else is known yet, e.g. a first GPS fix.
  //
  // `resolvedPlace.shortName` is the same finest-place-level name
  // `name`/`locality` already carry, minus the full postal address; prefer
  // it here so a fresh reverse geocode suggests "Sainte-Julie" rather than
  // "12 Rue des Lilas, Sainte-Julie, Quebec, Canada" — `locality` below is
  // unaffected and keeps the whole label either way.
  const name =
    !current?.name || current.name === current?.locality
      ? resolvedPlace?.shortName ||
        resolvedPlace?.name ||
        current?.name ||
        fallback
      : current.name;
  const locality =
    resolvedPlace?.locality ||
    resolvedPlace?.name ||
    current?.locality ||
    fallback;
  return { name, locality };
}
// A flat horizon on the mask's own grid (one point every 10°), switched on.
export function emptyHorizon() {
  return { ...defaultHorizonMask(), enabled: true };
}
export function placeDistanceKm(left, right) {
  const a = placeCoordinates(left),
    b = placeCoordinates(right);
  if (!a || !b) return null;
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
// From this distance a new place is « very distant » from the night's current
// one: the
// night shifts by about ten minutes, the targets' altitudes by about two
// degrees and the weather is another system.
export const VERY_FAR_PLACE_KM = 200;
// Above this distance from the saved place being modified, « modifier » asks
// first (so as not to edit the wrong place).
export const MODIFY_CONFIRMATION_KM = 50;
export function placeIsVeryFar(current, next) {
  const km = placeDistanceKm(current, next);
  return km !== null && km >= VERY_FAR_PLACE_KM;
}
// « ≈ 420 km »: great circle, rounded to 10 km.
export function roundedPlaceDistanceKm(km) {
  return Math.round(km / 10) * 10;
}
export function placeFingerprint(place) {
  const coordinates = placeCoordinates(place);
  return JSON.stringify(
    coordinates
      ? [
          coordinates.latitude.toFixed(5),
          coordinates.longitude.toFixed(5),
          place.timeZone || "UTC",
          place.horizonMask || null,
        ]
      : null,
  );
}
function stableId(prefix, value) {
  let hash = 2166136261;
  for (const character of String(value))
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}
// The single definition of "which night does this date+place belong to",
// shared by the legacy migration below and by repairPlannerDocument. A client
// derives the same FNV-1a id from the same two inputs, so a night rebuilt
// here from a plan's own date/location always lands on the id the client
// already sent — this is what lets the repair reuse the plan's nightId
// instead of minting a new one.
export function nightIdFor(date, location) {
  return stableId("night", `${date}:${placeFingerprint(location)}`);
}
export function validatePlannerDocument(value) {
  if (!plain(value)) throw new Error("Invalid planner document.");
  if (
    value.schemaVersion !== undefined &&
    ![1, plannerSchemaVersion].includes(value.schemaVersion)
  )
    throw new Error(
      "Unsupported planner document version. Existing plans were not changed.",
    );
  if (!Array.isArray(value.plans))
    throw new Error("Planner document must contain a plans array.");
  const ids = new Set();
  for (const plan of value.plans) {
    if (
      !plain(plan) ||
      typeof plan.id !== "string" ||
      !plan.id ||
      ids.has(plan.id) ||
      !dateValid(plan.date) ||
      !Array.isArray(plan.items)
    )
      throw new Error(
        "Invalid or duplicate plan. Existing plans were not changed.",
      );
    ids.add(plan.id);
    const itemIds = new Set();
    for (const item of plan.items) {
      if (
        !plain(item) ||
        typeof item.id !== "string" ||
        !item.id ||
        itemIds.has(item.id)
      )
        throw new Error("Invalid or duplicate plan target.");
      itemIds.add(item.id);
    }
  }
  if (value.schemaVersion === plannerSchemaVersion) {
    if (!Array.isArray(value.nights))
      throw new Error("Planner nights are missing.");
    const nights = new Map();
    for (const night of value.nights) {
      if (
        !plain(night) ||
        !night.id ||
        nights.has(night.id) ||
        !dateValid(night.date)
      )
        throw new Error("Invalid or duplicate observing night.");
      nights.set(night.id, night);
    }
    if (
      value.plans.some(
        (plan) =>
          !nights.has(plan.nightId) ||
          nights.get(plan.nightId).date !== plan.date,
      )
    )
      throw new Error("A plan refers to an unknown observing night.");
  }
  return value;
}
// A non-throwing projection of the same rule, so the rejection contract is
// recordable as a portable fixture rather than only as a thrown message.
export function plannerDocumentValidation(value) {
  try {
    validatePlannerDocument(value);
    return { valid: true, error: null };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}
export function normalizePlace(value) {
  if (!placeCoordinates(value)) return null;
  const place = {
    ...copy(value),
    id: String(value.id || stableId("place", placeFingerprint(value))),
    version: Math.max(1, Number(value.version) || 1),
    name: String(value.name || "").trim(),
    locality: String(value.locality || value.name || "").trim(),
    horizonStatus:
      value.horizonStatus || (value.horizonMask ? "verified" : "unverified"),
  };
  const knownPlace = normalizeKnownPlaceLink(value.knownPlace);
  if (knownPlace) place.knownPlace = knownPlace;
  else delete place.knownPlace;
  // The sky background the observer typed for the place (additive):
  // `{ sqm, enteredAt }`, else absent.
  const skyEntered = normalizeSkyEntered(value.skyEntered);
  if (skyEntered) place.skyEntered = skyEntered;
  else delete place.skyEntered;
  return place;
}
// The link of a personal place to the known place it was added from
// (additive): `{ source: "osm", id: "node/123", type, linkedAt }`. The
// personal place stays the observer's own — its name, coordinates and
// horizon are copied, editable — and the details of the known place
// (website, hours, access…) are read through `GET /v1/places/known` when
// shown, never stored here. The id is kept as the source writes it
// (`node/123`); the `osm:` prefix of a suggestion's id is dropped. Anything
// else — another source, an unknown type, a date that is not an instant —
// is not a link, and the place simply has none.
export const knownPlaceTypes = Object.freeze([
  "viewpoint",
  "campsite",
  "park",
  "picnic",
]);
// The type of a place of the space (`kind`): « private » (a place of one's
// own, what a new place is by default) or the type of a known place.
export const placeKinds = Object.freeze(["private", ...knownPlaceTypes]);
const knownPlaceIdPattern =
  /^(?:osm:)?((?:node|way|relation)\/[1-9][0-9]{0,15})$/;
export function normalizeKnownPlaceLink(value) {
  if (!plain(value) || value.source !== "osm") return null;
  const id =
    typeof value.id === "string" ? knownPlaceIdPattern.exec(value.id) : null;
  if (!id || !knownPlaceTypes.includes(value.type)) return null;
  if (isoInstant(value.linkedAt) === null) return null;
  return {
    source: "osm",
    id: id[1],
    type: value.type,
    linkedAt: value.linkedAt,
  };
}
// The night of a plan: two additive plan properties, `darkness` and
// `nightSpan`. Both are optional and both are normalised here, once, by
// whoever reads them (web: planner.js `planNightWindow`; fixtures planner-darkness.json and
// planner-night-span.json). The server stores them untouched in the plan
// payload. Absent = the whole astronomical night, exactly as before.
export const planDarknessValues = Object.freeze([
  "astronomical",
  "nautical",
  "civil",
]);
// A span moves in ten-minute
// steps, never before sunset nor after sunrise, and lasts thirty
// minutes at least.
export const nightSpanRule = Object.freeze({
  stepMinutes: 10,
  minimumMinutes: 30,
});
// `darkness` as stored: one of the three names, else `null` (= absent =
// astronomical).
export function normalizePlanDarkness(value) {
  return planDarknessValues.includes(value) ? value : null;
}
const isoInstantPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
function isoInstant(value) {
  if (typeof value !== "string" || !isoInstantPattern.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
// `nightSpan` as stored, against the night's `bounds` (`{ sunset, sunrise }`,
// ISO-8601 instants, astro-core `twilightWindows(...).sun`; absent or `null`
// for a night with no sunset, where only the step and the minimum apply):
// - not an object, or an unknown `mode` → `null` (absent);
// - `{ mode: "astronomical" }` → itself, other keys dropped;
// - `{ mode: "custom", start, end }`: both instants rounded to the nearest
//   ten minutes, the start moved up to the first ten-minute mark at or after
//   sunset, the end down to the last one at or before sunrise; unreadable
//   instants, or a span shorter than thirty minutes once clamped →
//   `{ mode: "astronomical" }`. Instants come back as ISO-8601 UTC.
export function normalizeNightSpan(value, bounds = null) {
  if (!plain(value)) return null;
  const astronomical = { mode: "astronomical" };
  if (value.mode === "astronomical") return astronomical;
  if (value.mode !== "custom") return null;
  let start = isoInstant(value.start);
  let end = isoInstant(value.end);
  if (start === null || end === null) return astronomical;
  const step = nightSpanRule.stepMinutes * 60000;
  start = Math.round(start / step) * step;
  end = Math.round(end / step) * step;
  const sunset = isoInstant(bounds?.sunset);
  const sunrise = isoInstant(bounds?.sunrise);
  if (sunset !== null) start = Math.max(start, Math.ceil(sunset / step) * step);
  if (sunrise !== null) end = Math.min(end, Math.floor(sunrise / step) * step);
  if (end - start < nightSpanRule.minimumMinutes * 60000) return astronomical;
  return {
    mode: "custom",
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
  };
}
// A plan with both night properties normalised: an absent (`null`) result
// removes the key, so a plan that never had them comes back identical.
export function normalizePlanNightProperties(plan, bounds = null) {
  if (!plain(plan)) return plan;
  const { darkness: rawDarkness, nightSpan: rawSpan, ...rest } = plan;
  const darkness = normalizePlanDarkness(rawDarkness);
  const nightSpan = normalizeNightSpan(rawSpan, bounds);
  return {
    ...rest,
    ...(darkness ? { darkness } : {}),
    ...(nightSpan ? { nightSpan } : {}),
  };
}
// Read-time repair for a v2 document whose `nights` array lost track of a
// night one of its own plans already refers to — a client that never calls
// PUT /api/plans never gets a chance to write the night record that
// route derives; its plans arrive carrying a nightId (and their own date +
// location) with no matching entry in `nights`. Reconstruct that missing
// night instead of letting validatePlannerDocument reject the whole
// document, and reattach a plan whose night now points at a different date
// (e.g. the night was retimed elsewhere). validatePlannerDocument itself is
// untouched and stays strict — this only widens what a *read* tolerates
// before that check runs, never what a write accepts.
export function repairPlannerDocument(value) {
  if (!plain(value) || value.schemaVersion !== plannerSchemaVersion)
    return value;
  if (!Array.isArray(value.plans) || !Array.isArray(value.nights)) return value;
  const nights = new Map(
    value.nights
      .filter((night) => plain(night) && night.id)
      .map((night) => [night.id, night]),
  );
  const nightsSizeBefore = nights.size;
  let plansChanged = false;
  const plans = value.plans.map((plan) => {
    if (!plain(plan) || !dateValid(plan.date)) return plan;
    const referenced = plan.nightId ? nights.get(plan.nightId) : null;
    if (referenced && referenced.date === plan.date) return plan;
    const location = normalizePlace(plan.location);
    // The night is simply absent (the common case of such a client): reuse the id the
    // plan already carries, since it is already the same FNV-1a id this
    // document's own algorithm would derive from plan.date + location. Only
    // when the referenced night exists but disagrees on the date do we
    // derive a fresh id for the (possibly new) night the plan now belongs to.
    const nightId =
      plan.nightId && !referenced
        ? plan.nightId
        : nightIdFor(plan.date, location);
    if (!nights.has(nightId))
      nights.set(nightId, {
        id: nightId,
        date: plan.date,
        location: copy(location),
      });
    if (plan.nightId === nightId) return plan;
    plansChanged = true;
    return { ...plan, nightId };
  });
  if (!plansChanged && nights.size === nightsSizeBefore) return value;
  return { ...value, nights: [...nights.values()], plans };
}
export function migratePlannerState(value, defaults) {
  if (!plain(value)) return value;
  if (
    value.schemaVersion !== undefined &&
    ![1, plannerSchemaVersion].includes(value.schemaVersion)
  )
    throw new Error("Unsupported planner document version.");
  const state = copy(value),
    legacy = state.schemaVersion !== plannerSchemaVersion;
  const byPlaceId = new Map();
  for (const value of state.knownLocations || []) {
    const place = normalizePlace(value);
    if (place && !byPlaceId.has(place.id)) byPlaceId.set(place.id, place);
  }
  const orphanProfiles = [];
  if (
    legacy &&
    (state.currentHorizonMask?.enabled ||
      state.currentHorizonMask?.points?.some((point) => point.altitude > 0))
  )
    orphanProfiles.push({
      id: "legacy-device-horizon",
      name: "Horizon",
      mask: copy(state.currentHorizonMask),
    });
  for (const profile of legacy ? state.horizonProfiles || [] : []) {
    if (!placeCoordinates(profile.location)) {
      orphanProfiles.push(copy(profile));
      continue;
    }
    const place = normalizePlace({
      ...profile.location,
      id: `horizon-${profile.id}`,
      name: profile.name,
      horizonMask: profile.mask,
      horizonStatus: "verified",
    });
    const same = [...byPlaceId.values()].find(
      (entry) => placeFingerprint(entry) === placeFingerprint(place),
    );
    if (!same) byPlaceId.set(place.id, place);
  }
  const nights = new Map(
    (state.nights || []).map((night) => [night.id, copy(night)]),
  );
  const defaultsForPlan = Object.fromEntries(
    planSettingKeys.map((key) => [key, copy(state[key] ?? defaults[key])]),
  );
  state.plans = (state.plans || []).map((plan) => {
    const settings = Object.fromEntries(
      planSettingKeys.map((key) => [
        key,
        copy(plan[key] ?? defaultsForPlan[key]),
      ]),
    );
    settings.equipment = {
      ...copy(defaults.equipment),
      ...settings.equipment,
      filterIds: [
        ...new Set(
          settings.equipment?.filterIds ||
            (settings.equipment?.filterId ? [settings.equipment.filterId] : []),
        ),
      ],
    };
    const location = normalizePlace(plan.location);
    const nightId = plan.nightId || nightIdFor(plan.date, location);
    if (!nights.has(nightId))
      nights.set(nightId, {
        id: nightId,
        date: plan.date,
        location: copy(location),
      });
    return {
      ...plan,
      ...settings,
      nightId,
      location: copy(nights.get(nightId).location),
      view: {
        ...copy(defaultPlanView),
        ...(plan.view || {}),
        horizon: normalizePlanHorizonView(plan.view?.horizon),
      },
      ...(legacy &&
      plan.items?.length &&
      (!location || planSettingKeys.some((key) => plan[key] == null))
        ? { migrationReview: true }
        : {}),
    };
  });
  let activeNight =
    nights.get(state.activeNightId) ||
    nights.get(
      state.plans.find((plan) => plan.id === state.activePlanId)?.nightId,
    );
  if (!activeNight || activeNight.date !== state.date)
    activeNight = [...nights.values()].find(
      (night) => night.date === state.date,
    );
  if (!activeNight && dateValid(state.date)) {
    let location = normalizePlace(state.location);
    const profile = (state.horizonProfiles || []).find(
      (p) => p.id === state.activeHorizonProfileId,
    );
    if (location && legacy && profile && placeCoordinates(profile.location)) {
      const a = placeCoordinates(location),
        b = placeCoordinates(profile.location);
      if (a.latitude === b.latitude && a.longitude === b.longitude)
        location = normalizePlace({
          ...location,
          horizonMask: profile.mask,
          horizonStatus: "verified",
        });
    }
    activeNight = {
      id: nightIdFor(state.date, location),
      date: state.date,
      location,
    };
    nights.set(activeNight.id, activeNight);
  }
  if (
    legacy &&
    activeNight?.location &&
    !byPlaceId.has(activeNight.location.id)
  )
    byPlaceId.set(activeNight.location.id, copy(activeNight.location));
  state.schemaVersion = plannerSchemaVersion;
  state.nights = [...nights.values()];
  state.activeNightId = activeNight?.id || null;
  state.knownLocations = [...byPlaceId.values()];
  state.unassignedHorizonProfiles = [
    ...new Map(
      [...(state.unassignedHorizonProfiles || []), ...orphanProfiles].map(
        (p) => [p.id, p],
      ),
    ).values(),
  ];
  return selectPlannerPlan(state, state.activePlanId, defaults);
}
// The top-level fields are a compatibility projection for the existing
// astronomical components, never the source for a different plan's settings.
export function selectPlannerPlan(
  state,
  id = state.activePlanId,
  defaults = state,
) {
  const plan = state.plans.find((entry) => entry.id === id);
  const night = state.nights?.find(
    (entry) => entry.id === (plan?.nightId || state.activeNightId),
  );
  const settings = plan
    ? Object.fromEntries(
        planSettingKeys.map((key) => [key, copy(plan[key] ?? defaults[key])]),
      )
    : {};
  return {
    ...state,
    ...settings,
    activePlanId: plan?.id || null,
    activeNightId: night?.id || state.activeNightId,
    date: night?.date || plan?.date || state.date,
    location: copy(
      night?.location || {
        ...defaults.location,
        name: "",
        latitude: "",
        longitude: "",
      },
    ),
  };
}
export function patchPlannerPlan(state, patch) {
  if (!state.activePlanId) return { ...state, ...copy(patch) };
  const next = {
    ...state,
    plans: state.plans.map((plan) =>
      plan.id === state.activePlanId ? { ...plan, ...copy(patch) } : plan,
    ),
  };
  return selectPlannerPlan(next, state.activePlanId);
}
export function applyNightPlace(state, location) {
  const place = normalizePlace(location);
  if (!place) throw new Error("Valid place coordinates are required.");
  const nightId = state.activeNightId;
  const changed = placeFingerprint(state.location) !== placeFingerprint(place);
  return {
    ...state,
    location: copy(place),
    nights: state.nights.map((night) =>
      night.id === nightId ? { ...night, location: copy(place) } : night,
    ),
    plans: state.plans.map((plan) =>
      plan.nightId === nightId
        ? {
            ...plan,
            location: copy(place),
            locationReview: Boolean(
              plan.locationReview || (changed && plan.items?.length),
            ),
          }
        : plan,
    ),
  };
}
// `state` with the plans `planIds` (the ones still to do) taken out of the
// night they share with plans that ran, into the night of the same date at
// `location` (the stable id the clients derive from date and place, or the one
// already there), which becomes the active night. The plans keep their
// content; `applyNightPlace` then writes the place into them and flags their
// targets for review. The document's `location` stays the old one so that rule
// sees a change.
export function movePendingPlansToNight(state, location, planIds) {
  const place = normalizePlace(location);
  if (!place) throw new Error("Valid place coordinates are required.");
  const nightId = nightIdFor(state.date, place);
  const ids = new Set(planIds);
  return {
    ...state,
    activeNightId: nightId,
    activePlanId: ids.has(state.activePlanId)
      ? state.activePlanId
      : (planIds[0] ?? null),
    nights: state.nights.some((night) => night.id === nightId)
      ? state.nights
      : [
          ...state.nights,
          { id: nightId, date: state.date, location: copy(place) },
        ],
    plans: state.plans.map((plan) =>
      ids.has(plan.id) ? { ...plan, nightId } : plan,
    ),
  };
}
// The active night (already at its new place) moved to the night that place is
// in now, `nightDate`, when nothing of it is tied to its hours yet: every plan
// of it still to do, without a target and without a chosen slot. `null` when
// the night stays where it is; a night of `nightDate` that already holds plans
// is never joined here.
export function nightFollowingPlace(state, nightDate) {
  if (!nightDate || state.date === nightDate) return null;
  const night = state.nights.find((entry) => entry.id === state.activeNightId);
  if (!night) return null;
  const own = state.plans.filter((plan) => plan.nightId === night.id);
  const free = own.every(
    (plan) =>
      (plan.status ?? "pending") === "pending" &&
      !(plan.items || []).length &&
      plan.nightSpan?.mode !== "custom",
  );
  if (!free) return null;
  const taken = state.nights.some(
    (entry) =>
      entry.date === nightDate &&
      state.plans.some((plan) => plan.nightId === entry.id),
  );
  if (taken) return null;
  const nightId = nightIdFor(nightDate, night.location);
  return {
    ...state,
    date: nightDate,
    activeNightId: nightId,
    nights: state.nights
      .filter((entry) => entry.id === night.id || entry.id !== nightId)
      .map((entry) =>
        entry.id === night.id
          ? { ...entry, id: nightId, date: nightDate }
          : entry,
      ),
    plans: state.plans.map((plan) =>
      plan.nightId === night.id ? { ...plan, nightId, date: nightDate } : plan,
    ),
  };
}
// `seed: false` joins (or opens) the night without starting a plan for it: the
// page that only shows a night (a load) writes nothing the person did not ask
// for.
export function choosePlannerDate(
  state,
  date,
  { id, name, darkness, equipment, acquisitionDefaults, seed = true },
) {
  if (!dateValid(date)) return state;
  let night =
    state.nights.find(
      (entry) =>
        entry.date === date &&
        placeFingerprint(entry.location) === placeFingerprint(state.location),
    ) || state.nights.find((entry) => entry.date === date);
  if (!night)
    night = {
      id: nightIdFor(date, state.location),
      date,
      location: normalizePlace(state.location),
    };
  let next = {
    ...state,
    date,
    activeNightId: night.id,
    nights: state.nights.some((entry) => entry.id === night.id)
      ? state.nights
      : [...state.nights, night],
  };
  const plans = next.plans.filter((plan) => plan.nightId === night.id);
  const selected =
    plans.find((plan) => plan.id === state.activePlanId) ||
    plans.find((plan) => plan.status === "pending") ||
    plans[0];
  if (selected) return selectPlannerPlan(next, selected.id);
  // WEB-review n148: a plan is only ever created once a place has been
  // chosen -- picking a date with no place selected must land on the
  // planner's empty state instead of silently seeding a placeless plan.
  if (!night.location || !seed) return selectPlannerPlan(next, null);
  // Joining an existing night by its date alone (the document may carry no
  // place, e.g. right after a blank night): the first plan of that night
  // takes the night's own place, never the document's stale one, or the
  // plan would be filed under a night whose place it does not share.
  next = addPlannerPlan(
    { ...next, location: night.location },
    { id, name, darkness, equipment, acquisitionDefaults },
  );
  return next;
}
// `darkness`, when given and not astronomical, is the threshold the new plan
// starts with (the device preference); absent, the plan carries none, which
// reads as astronomical. `equipment`, when given (an object), is the equipment
// the new plan starts with — « Ma configuration par défaut » through
// `planStartEquipment`; absent, the plan takes the current equipment, as
// before. `acquisitionDefaults`, when given (a line the contract accepts, not
// empty), is the plan's « Prise de vue » defaults — what the last plan of this
// browser chose (tier 1 of « Prise de vue par cible »); absent, the plan
// carries none.
export function addPlannerPlan(
  state,
  { id, name, darkness, equipment, acquisitionDefaults },
) {
  const settings = Object.fromEntries(
    planSettingKeys.map((key) => [key, copy(state[key])]),
  );
  if (plain(equipment)) settings.equipment = copy(equipment);
  const plan = {
    id,
    name,
    date: state.date,
    nightId: state.activeNightId,
    location: normalizePlace(state.location),
    ...settings,
    ...(normalizePlanDarkness(darkness) &&
    normalizePlanDarkness(darkness) !== "astronomical"
      ? { darkness: normalizePlanDarkness(darkness) }
      : {}),
    ...(planAcquisitionDefaults({ acquisitionDefaults })
      ? {
          acquisitionDefaults: planAcquisitionDefaults({ acquisitionDefaults }),
        }
      : {}),
    status: "pending",
    archivedAt: null,
    items: [],
    view: copy(defaultPlanView),
  };
  return selectPlannerPlan({ ...state, plans: [...state.plans, plan] }, id);
}
export function nightDateLabel(value, locale = "en") {
  const start = new Date(value + "T12:00:00Z"),
    end = new Date(start);
  if (Number.isNaN(start.getTime())) return "";
  end.setUTCDate(start.getUTCDate() + 1);
  const format = (date, options) =>
    date
      .toLocaleDateString(locale, { timeZone: "UTC", ...options })
      .replace(locale === "fr" ? /^1(?= |$)/ : /$^/, "1er");
  if (locale === "fr") {
    const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
    const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();
    return `Nuit du ${format(start, { day: "numeric", ...(!sameMonth && { month: "long" }), ...(!sameYear && { year: "numeric" }) })} au ${format(end, { day: "numeric", month: "long", year: "numeric" })}`;
  }
  // German, Spanish, Italian and Portuguese: « Nacht vom 14. auf den 15.
  // Oktober 2026 » — the day and month words of `./day-words.js`, the way
  // French keeps its own template above.
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();
  const from = civilDateLabel(locale, start, {
    month: !sameMonth,
    year: !sameYear,
  });
  if (from !== null)
    return civilNightRangeLabel(
      locale,
      from,
      civilDateLabel(locale, end, { year: true }),
    );
  if (locale === "zh-Hans" || locale === "zh-Hant") {
    // Written out, not read from the ICU range (whose Chinese form depends on
    // the engine's data): « 2026年10月2日至3日的观测夜 ».
    const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
    const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();
    const full = (date) =>
      `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
    const to = !sameYear
      ? full(end)
      : sameMonth
        ? `${end.getUTCDate()}日`
        : `${end.getUTCMonth() + 1}月${end.getUTCDate()}日`;
    return `${full(start)}至${to}${locale === "zh-Hans" ? "的观测夜" : "的觀測夜"}`;
  }
  if (locale === "ru") {
    // « Ночь с 2 на 3 октября 2026 г. »: the month once when it does not
    // change, in the genitive.
    const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
    const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();
    const from = `${start.getUTCDate()}${sameMonth ? "" : ` ${ruMonths[start.getUTCMonth()]}`}${sameYear ? "" : ` ${start.getUTCFullYear()} г.`}`;
    return `Ночь с ${from} на ${end.getUTCDate()} ${ruMonths[end.getUTCMonth()]} ${end.getUTCFullYear()} г.`;
  }
  const label = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).formatRange(start, end);
  return locale === "ja" ? `${label}の観測夜` : `Night of ${label}`;
}

// The Russian months in the genitive, as a date reads them (« 2 октября »).
const ruMonths = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];
