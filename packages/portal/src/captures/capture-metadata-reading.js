import { lunarPhaseForDate, moonSetBetween } from "astro-core/lunar-phase.js";
import { nightOf } from "../api/night-resources.js";
import { sessionRowById } from "../persistence/observation-session-repository.js";
import { nightStepsFor } from "./capture-night-steps.js";
import { planRowFor } from "../persistence/planner-state-repository.js";
import { planCaptureFieldsOf } from "../persistence/plan-capture-fields.js";
import { shownPlaceName } from "../places/shown-place-name.js";
import {
  knownPlacesOf,
  placeTimeZoneOf,
} from "../journal/journal-repository.js";
import {
  isObject,
  nightLines,
  parse,
  storedMetadata,
} from "./capture-metadata.js";

/**
 * Reading the metadata of a capture: the rows (`readMetadataInputs`) and the
 * merged answer (`captureMetadata`) with the values computed at reading —
 * the sky quality and the Moon. Kept out of `capture-metadata.js` because
 * the Moon comes from `astronomy-engine`, which the image's `server.mjs`
 * (the upload maintenance, the processing's proposals) must never load:
 * Next's trace carries it for the routes, the standalone server does not.
 */

// ---------------------------------------------------------------------------
// Reading: the merged metadata of a capture.

/**
 * The equipment of the image of a multi-night plan, which belongs to no
 * night: what the nights it combines (`plan_json.combinedNightIds`) say of
 * theirs. A role (telescope, camera, mount) the nights agree on is that
 * piece; a role they disagree on is left empty (no night is preferred to
 * another); the filters are the union of the nights', in the order met.
 * `null` when no night names any equipment.
 */
export async function combinedNightsEquipment(db, tenantId, capture) {
  if (capture.session_id) return null;
  const { combinedNightIds } = planCaptureFieldsOf(capture.plan_json);
  if (!combinedNightIds.length) return null;
  const values = [];
  for (const sessionId of combinedNightIds) {
    const session = await sessionRowById(db, { tenantId, sessionId });
    if (!session) continue;
    const plan = session.plan_id
      ? await planRowFor(db, tenantId, session.plan_id)
      : null;
    const value =
      nightOf(session, plan)?.equipment?.value || planEquipment(plan);
    if (isObject(value)) values.push(value);
  }
  if (!values.length) return null;
  const merged = {};
  for (const role of ["telescopeId", "cameraId", "mountId"]) {
    const ids = values.map((value) => value[role] || null);
    if (ids[0] && ids.every((id) => id === ids[0])) merged[role] = ids[0];
  }
  const filters = [];
  for (const value of values)
    for (const id of value.filterIds || [])
      if (id && !filters.includes(id)) filters.push(id);
  if (filters.length) merged.filterIds = filters;
  return Object.keys(merged).length ? merged : null;
}

/**
 * The rows a capture's metadata is read from, every one bounded by its
 * space: its night (`observation_sessions`), the night's plan (or the
 * capture's own plan), the night's steps for the capture's targets, and the
 * names of the equipment its values name.
 */
export async function readMetadataInputs(db, tenantId, capture, targetIds) {
  const session = capture.session_id
    ? await sessionRowById(db, { tenantId, sessionId: capture.session_id })
    : null;
  const planId = session?.plan_id || capture.plan_id || null;
  const plan = planId ? await planRowFor(db, tenantId, planId) : null;
  const steps = session ? await nightStepsFor(db, session.id, targetIds) : [];
  const night = session ? nightOf(session, plan) : null;
  const stored = storedMetadata(capture);
  const combinedEquipment = await combinedNightsEquipment(
    db,
    tenantId,
    capture,
  );
  const ids = new Set();
  const nightEquipment =
    night?.equipment?.value || planEquipment(plan) || combinedEquipment || {};
  for (const source of [nightEquipment, stored.equipment || {}]) {
    for (const role of ["telescopeId", "cameraId", "mountId"])
      if (source[role]) ids.add(source[role]);
    for (const id of source.filterIds || []) ids.add(id);
  }
  const names = new Map();
  const integratedCameras = new Map();
  if (ids.size) {
    const list = [...ids];
    const rows = (
      await db.query(
        `SELECT id, name, planner_json FROM equipment
         WHERE id IN (${list.map(() => "?").join(", ")})
           AND (tenant_id = ? OR scope = 'default')`,
        [...list, tenantId],
      )
    ).rows;
    for (const row of rows) {
      names.set(row.id, row.name);
      // A smart telescope's camera is built into it; the profile names the
      // sensor (`planner.integratedCamera.name`).
      const sensor = parse(row.planner_json, null)?.integratedCamera?.name;
      if (typeof sensor === "string" && sensor.trim())
        integratedCameras.set(row.id, sensor.trim());
    }
  }
  // The zone the night's hours are read in — the one rule of
  // the session's page (`placeTimeZoneOf`); `null` when none can be read.
  const knownPlaces = await knownPlacesOf(db, tenantId);
  const placeTimeZone = session
    ? placeTimeZoneOf(session, plan, knownPlaces)
    : null;
  // The name the night's place is shown under: the live place's, else the
  // copy's, never a position written as a name.
  const placeName = shownPlaceName(
    [
      parse(session?.place_json, null),
      parse(plan?.payload_json, null)?.location ??
        parse(plan?.location_json, null),
    ],
    knownPlaces,
  );
  return {
    placeName,
    session,
    plan,
    night,
    steps,
    stored,
    equipmentNames: names,
    integratedCameras,
    placeTimeZone,
    combinedEquipment,
  };
}

function planEquipment(plan) {
  const value = parse(plan?.equipment_json, null);
  return isObject(value) ? value : null;
}

/** The planner's word for a role with nothing in it (`quick-plan-equipment`). */
const NO_EQUIPMENT = "none";

/** The id of the camera built into a smart telescope (never a row of the space). */
export const INTEGRATED_CAMERA = "integrated";

const finite = (value) => {
  const number = Number(value);
  return value !== null && value !== undefined && Number.isFinite(number)
    ? number
    : null;
};

const isoDay = (value) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)
    ? value.slice(0, 10)
    : null;

const round3 = (value) => Math.round(value * 1000) / 1000;

/**
 * What the screen writes on a line of « Intégrations »: `declared` (the
 * session said so), `measured` (Astro Sync measured it: its own lines, and
 * the night's steps of its analysis) or `manual` (written by hand,
 * imported, or a night's step that is not an analysis). Derived at every
 * read, never stored.
 */
export function provenanceOf(line) {
  switch (line.origin) {
    case "session":
      return "declared";
    case "astro-sync":
      return "measured";
    case "night":
      return line.stepOrigin === "analysis" ? "measured" : "manual";
    default:
      return "manual";
  }
}

/**
 * One line as read: the integration computed (frames × exposure), never
 * stored — except for a declared line whose frame count is not known
 * (`frameCount` 0): the time the session declared.
 */
function lineRead(line) {
  const known = line.frameCount > 0 && line.exposureSeconds > 0;
  return {
    id: line.id,
    filter: line.filter ?? null,
    frameCount: line.frameCount,
    exposureSeconds: line.exposureSeconds,
    gain: line.gain ?? null,
    integrationSeconds: known
      ? round3(line.frameCount * line.exposureSeconds)
      : round3(Math.max(0, Number(line.declaredSeconds) || 0)),
    origin: line.origin,
    provenance: provenanceOf(line),
    // The computer Astro Sync measured the line on, when it said.
    computerLabel: line.computerLabel ?? null,
    // The lines of the image of a multi-night plan name the session (the
    // night) they come from; every other line has none.
    ...(line.sessionId
      ? { sessionId: line.sessionId, eveningDate: line.eveningDate ?? null }
      : {}),
    editedAt: line.editedAt ?? null,
    edited: Boolean(line.editedAt),
  };
}

const ownSource = (origin, fallback = null) =>
  origin
    ? {
        source: origin.source,
        at: origin.at ?? null,
        edited: Boolean(origin.edited),
      }
    : { source: fallback, at: null, edited: false };

/**
 * The merged metadata of a capture for its owner (`audience: "owner"`) or
 * for a visitor (`"visitor"`: no origin, no place, no notes, no
 * `edited`). `inputs` is `readMetadataInputs`'s answer.
 */
export function captureMetadata(inputs, { audience = "owner" } = {}) {
  const {
    session,
    plan,
    night,
    steps,
    stored,
    equipmentNames,
    integratedCameras = new Map(),
    placeTimeZone = null,
    combinedEquipment = null,
    placeName: readPlaceName,
  } = inputs;
  const origins = stored.origins || {};
  const nightSource = (field) =>
    night?.[field]?.source === "plan" ? "plan" : night ? "night" : null;
  const text = (field) =>
    stored[field] !== null && stored[field] !== undefined
      ? { value: stored[field], ...ownSource(origins[field], "owner") }
      : { value: null, source: null, at: null, edited: false };

  // The acquisition: the capture's own lines, else its night's steps.
  const ownLines = Array.isArray(stored.acquisition);
  const lines = (ownLines ? stored.acquisition : nightLines(steps)).map(
    lineRead,
  );
  const totalSeconds = round3(
    lines.reduce((sum, line) => sum + line.integrationSeconds, 0),
  );
  const totalFrames = lines.reduce((sum, line) => sum + line.frameCount, 0);
  const acquisitionOrigin = ownLines
    ? {
        source: origins.acquisition?.source ?? "owner",
        at: origins.acquisition?.at ?? null,
        edited: lines.some((line) => line.edited),
      }
    : {
        source: lines.length ? "night" : null,
        at: null,
        edited: lines.some((line) => line.edited),
      };

  // The equipment: per role, the capture's own value, else the night's.
  const nightEquipment =
    night?.equipment?.value || planEquipment(plan) || combinedEquipment || {};
  const equipmentFrom =
    nightSource("equipment") ??
    (plan ? "plan" : combinedEquipment ? "night" : null);
  const ownEquipment = stored.equipment || {};
  // The planner writes « none » for a role the plan leaves empty (a mount, a
  // reducer) and `null` for a telescope or a camera not chosen yet: both are
  // nothing chosen.
  const named = (id) =>
    id && id !== NO_EQUIPMENT
      ? { id, name: equipmentNames?.get(id) ?? null }
      : null;
  const roleValue = (key, id) => {
    if (key === "filterIds") return (id || []).map(named).filter(Boolean);
    // Behind a smart telescope the camera is the one built into it, whatever
    // the plan's `cameraId` says: it reads as
    // `integrated` with the sensor's name, and the page says « Intégrée au
    // {telescope} · {capteur} ».
    if (key === "cameraId" && !own("cameraId")) {
      const telescopeId = own("telescopeId")
        ? ownEquipment.telescopeId
        : nightEquipment.telescopeId;
      const sensor = integratedCameras.get(telescopeId);
      if (sensor) return { id: INTEGRATED_CAMERA, name: sensor };
    }
    return named(id);
  };
  const own = (key) => ownEquipment[key] !== undefined;
  const role = (key) => {
    const field = `equipment.${key}`;
    const id = own(key) ? ownEquipment[key] : (nightEquipment[key] ?? null);
    const value = roleValue(key, id);
    return {
      value,
      ...(own(key)
        ? ownSource(origins[field], "owner")
        : {
            source: (key === "filterIds" ? value.length : value)
              ? equipmentFrom
              : null,
            at: null,
            edited: false,
          }),
    };
  };
  const equipment = {
    telescope: role("telescopeId"),
    camera: role("cameraId"),
    mount: role("mountId"),
    filters: role("filterIds"),
  };

  const processingPart = (part) => {
    const value = stored.processing?.[part] ?? null;
    return value !== null
      ? { value, ...ownSource(origins[`processing.${part}`], "owner") }
      : { value: null, source: null, at: null, edited: false };
  };

  // The night: its date, its span, its title (the plan's while unset).
  const nightDate =
    isoDay(plan?.plan_date) ?? isoDay(session?.started_at) ?? null;
  const place = night?.place?.value ?? null;
  const location = parse(plan?.location_json, null);
  // The name `readMetadataInputs` worked out from the live places; inputs
  // built by hand name the night's place or the plan's copy of it.
  const placeName =
    readPlaceName === undefined
      ? shownPlaceName([place, location], [])
      : readPlaceName;
  const bortle = Number(location?.bortle);
  const skyQuality =
    Number.isInteger(bortle) && bortle >= 1 && bortle <= 9 ? { bortle } : null;
  const phase = nightDate ? lunarPhaseForDate(nightDate) : null;
  const latitude = finite(place?.latitude ?? location?.latitude);
  const longitude = finite(place?.longitude ?? location?.longitude);
  const startedAt = session?.started_at ?? null;
  const finishedAt = session?.finished_at ?? null;
  const moonSetsAt =
    audience === "owner" && phase && latitude !== null && longitude !== null
      ? moonSetBetween({
          latitude,
          longitude,
          start: startedAt,
          end: finishedAt,
        })
      : null;

  const sensor =
    stored.sensor !== null && stored.sensor !== undefined
      ? { value: stored.sensor, ...ownSource(origins.sensor, "owner") }
      : { value: null, source: null, at: null, edited: false };

  if (audience === "visitor")
    return {
      title: stored.title ?? null,
      description: stored.description ?? null,
      acquisition: lines.map((line) => ({
        filter: line.filter,
        frameCount: line.frameCount,
        exposureSeconds: line.exposureSeconds,
        gain: line.gain,
        integrationSeconds: line.integrationSeconds,
      })),
      totalIntegrationSeconds: lines.length ? totalSeconds : null,
      calibration: stored.calibration ?? null,
      sensor: stored.sensor ?? null,
      processing: {
        software: stored.processing?.software ?? null,
        steps: stored.processing?.steps ?? null,
      },
      filters: equipment.filters.value
        .map((entry) => entry.name)
        .filter(Boolean),
      moonIllumination: phase ? phase.illumination : null,
    };

  return {
    title: text("title"),
    description: text("description"),
    notes: text("notes"),
    calibration: text("calibration"),
    sensor,
    acquisition: {
      ...acquisitionOrigin,
      own: ownLines,
      lines,
      totalFrames,
      totalSeconds: lines.length ? totalSeconds : null,
    },
    equipment,
    processing: {
      software: processingPart("software"),
      steps: processingPart("steps"),
    },
    sessionId: session?.id ?? null,
    night: session
      ? {
          value: {
            title: night?.title?.value ?? null,
            date: nightDate,
            startedAt,
            finishedAt,
          },
          source: nightSource("title"),
          planName: plan ? (plan.name ?? null) : null,
          placeTimeZone,
        }
      : {
          value: nightDate
            ? {
                title: null,
                date: nightDate,
                startedAt: null,
                finishedAt: null,
              }
            : null,
          source: plan ? "plan" : null,
          planName: plan ? (plan.name ?? null) : null,
          placeTimeZone: null,
        },
    place: {
      value: placeName ? { name: placeName } : null,
      source: night ? nightSource("place") : plan ? "plan" : null,
    },
    computed: {
      skyQuality,
      moon: phase
        ? { illumination: phase.illumination, setsAt: moonSetsAt }
        : null,
    },
  };
}
