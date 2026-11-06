import { randomUUID } from "node:crypto";
import { METADATA_LIMITS } from "./metadata-limits.js";
import { changedLineIds, withCaptureLock } from "./capture-revision.js";
import {
  GENERATED_TEXT_LIMITS,
  generatedTextLocales,
  generatedTextProblem,
  storedGeneratedText,
} from "./image-texts.js";

/**
 * The metadata of a capture. Four levels, the night's principle (`null` = taken
 * from the level above): **plan → night → capture → image**. The capture
 * reads what its night and its plan know; it keeps a value of its own only
 * when its owner corrects it or a producer (Astro Sync, the import, the
 * photo) proposes it.
 *
 * - **Limits** (`METADATA_LIMITS`): a capture's title 80, description
 *   2 000, notes 4 000, calibration 120; an acquisition line's filter 40;
 *   the processing's software 120 and steps 500; an image's title 90 and
 *  description 280.
 * - **Reading** (`captureMetadata`): every value as `{ value, source, at,
 *   edited }`, the source among `plan`, `night`, `astro-sync`, `photo`,
 *   `import`, `owner` (`null` when nothing holds it). Computed at reading,
 *   never stored: the integration per line and the total, the sky quality,
 *   the Moon. The place is the night's, for the owner only (never on a
 *   capture, never published).
 * - **Writing by the owner** (`applyOwnerChange`): one field per request;
 *   `null` gives the field back to its source; any other value is the
 *   owner's (`edited: true`).
 * - **Proposals** (`applyProposals`): a producer's values, each with its
 *   source; a value the owner edited is never overwritten nor cleared, a
 *   value proposed earlier and untouched is updated, a missing one added,
 *   nothing deleted; what was left comes back in `skipped`; the same
 *   proposal twice changes nothing.
 *
 * Pure but for `readMetadataInputs` (the rows) — the owner's routes, the
 * device routes, the uploads and the galleries share it, so that no reader
 * says more than this.
 */

export { METADATA_LIMITS };

/** Where a value comes from (`fieldOrigins`, the origin line of a zone). */
export const METADATA_SOURCES = Object.freeze([
  "plan",
  "night",
  "astro-sync",
  "photo",
  "import",
  "owner",
]);

/** The sources a device may propose under (`proposed`, `uploadMetadata`). */
export const PROPOSAL_SOURCES = Object.freeze(["astro-sync", "import"]);

/** The fields the owner writes, one per request (`metadata`). */
export const OWNER_FIELDS = Object.freeze([
  "title",
  "description",
  "notes",
  "calibration",
  "acquisition",
  "sensor",
  "equipment.telescopeId",
  "equipment.cameraId",
  "equipment.mountId",
  "equipment.filterIds",
  "processing.software",
  "processing.steps",
  "sessionId",
  "targetIds",
]);

/**
 * The fields the owner's hand writes from the phone, by its device token:
 * the rest is web only.
 */
export const DEVICE_OWNER_FIELDS = Object.freeze([
  "title",
  "description",
  "notes",
  "calibration",
  // The phone also writes the sensor, the processing, the equipment and the
  // targets (`deviceMetadataField`); changing the capture's session stays the
  // web session's.
  "sensor",
  "processing.software",
  "processing.steps",
  "equipment.telescopeId",
  "equipment.cameraId",
  "equipment.mountId",
  "equipment.filterIds",
  "acquisition",
  "targetIds",
]);

/** What a producer may propose for a capture (`proposed`, `uploadMetadata`). */
export const PROPOSABLE_FIELDS = Object.freeze([
  "title",
  "description",
  "acquisition",
  "calibration",
  "sensor",
  "processing",
]);

const TEXT_FIELDS = Object.freeze({
  title: "title",
  description: "description",
  notes: "notes",
  calibration: "calibration",
});

const EQUIPMENT_ROLES = Object.freeze({
  "equipment.telescopeId": "telescopeId",
  "equipment.cameraId": "cameraId",
  "equipment.mountId": "mountId",
  "equipment.filterIds": "filterIds",
});

const PROCESSING_PARTS = Object.freeze({
  "processing.software": ["software", METADATA_LIMITS.software],
  "processing.steps": ["steps", METADATA_LIMITS.steps],
});

/** Characters as the database counts them (code points, not UTF-16 units). */
export const textLength = (text) => [...String(text ?? "")].length;

/** A text as stored: trimmed, blank read as `null`; never normalised else. */
export function storedText(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

/** A refusal of a value: `invalid_metadata` names the field and its limit. */
export class MetadataError extends Error {
  constructor(field, limit, message, { status = 400, code } = {}) {
    super(message);
    this.name = "MetadataError";
    this.code = code ?? "invalid_metadata";
    this.status = status;
    this.field = field;
    this.limit = limit ?? null;
  }
}

const refuse = (field, limit, message) =>
  new MetadataError(field, limit, message);

export const parse = (value, fallback = null) => {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

export const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function textInput(field, value, limit) {
  if (value === null) return null;
  if (typeof value !== "string")
    throw refuse(field, limit, `${field} is a string or null.`);
  const stored = storedText(value);
  if (stored !== null && textLength(stored) > limit)
    throw refuse(field, limit, `${field} holds ${limit} characters at most.`);
  return stored;
}

/**
 * One acquisition line as typed or proposed: `filter` (free text, 40
 * characters at most, never normalised; `null` for none), `frameCount` (an
 * integer ≥ 1), `exposureSeconds` (> 0), `gain` (an integer, or `null`).
 */
export function acquisitionLineInput(
  value,
  field = "acquisition",
  { producer = false } = {},
) {
  if (!isObject(value))
    throw refuse(field, null, "An acquisition line is an object.");
  for (const key of Object.keys(value)) {
    // The provenance of a line is derived by the service and read only; a
    // request that carries it is refused.
    if (key === "provenance")
      throw new MetadataError(
        field,
        null,
        "provenance is derived by the service and read only.",
        { code: "invalid_request" },
      );
    // The computer a producer (Astro Sync) measured the line on; a line
    // typed by the owner never carries one.
    if (
      !["filter", "frameCount", "exposureSeconds", "gain"].includes(key) &&
      !(producer && key === "computerLabel")
    )
      throw refuse(field, null, `Unexpected acquisition property "${key}".`);
  }
  const filter =
    value.filter === undefined
      ? null
      : textInput(`${field}.filter`, value.filter, METADATA_LIMITS.filter);
  const { frameCount, exposureSeconds } = value;
  if (
    !Number.isSafeInteger(frameCount) ||
    frameCount < 1 ||
    frameCount > 100000
  )
    throw refuse(
      `${field}.frameCount`,
      1,
      "frameCount is an integer of at least 1.",
    );
  if (
    typeof exposureSeconds !== "number" ||
    !Number.isFinite(exposureSeconds) ||
    exposureSeconds <= 0 ||
    exposureSeconds > 86400
  )
    throw refuse(
      `${field}.exposureSeconds`,
      0,
      "exposureSeconds is a duration of more than 0 s.",
    );
  const gain = value.gain ?? null;
  if (
    gain !== null &&
    (!Number.isSafeInteger(gain) || gain < -1000 || gain > 100000)
  )
    throw refuse(`${field}.gain`, null, "gain is an integer or null.");
  const line = { filter, frameCount, exposureSeconds, gain };
  if (producer && value.computerLabel !== undefined) {
    if (value.computerLabel !== null && typeof value.computerLabel !== "string")
      throw refuse(
        `${field}.computerLabel`,
        80,
        "computerLabel is a string or null.",
      );
    const label = storedText(value.computerLabel ?? "");
    if (label !== null && textLength(label) > 80)
      throw refuse(
        `${field}.computerLabel`,
        80,
        "computerLabel holds 80 characters at most.",
      );
    line.computerLabel = label;
  }
  return line;
}

/** The sensor: `{ temperatureC, binning }`, each optional; `null` for none. */
export function sensorInput(value, field = "sensor") {
  if (value === null) return null;
  if (!isObject(value))
    throw refuse(field, null, "sensor is an object or null.");
  for (const key of Object.keys(value))
    if (!["temperatureC", "binning"].includes(key))
      throw refuse(field, null, `Unexpected sensor property "${key}".`);
  const temperatureC = value.temperatureC ?? null;
  if (
    temperatureC !== null &&
    (typeof temperatureC !== "number" ||
      !Number.isFinite(temperatureC) ||
      temperatureC < -100 ||
      temperatureC > 60)
  )
    throw refuse(
      `${field}.temperatureC`,
      null,
      "temperatureC is a temperature between -100 and 60 °C, or null.",
    );
  const binning = value.binning ?? null;
  if (
    binning !== null &&
    (!Number.isSafeInteger(binning) || binning < 1 || binning > 8)
  )
    throw refuse(
      `${field}.binning`,
      null,
      "binning is an integer from 1 to 8, or null.",
    );
  if (temperatureC === null && binning === null) return null;
  return { temperatureC, binning };
}

/** The processing a producer proposes: `{ software?, steps? }`. */
export function processingInput(value, field = "processing") {
  if (!isObject(value)) throw refuse(field, null, "processing is an object.");
  const result = {};
  for (const key of Object.keys(value)) {
    if (!["software", "steps"].includes(key))
      throw refuse(field, null, `Unexpected processing property "${key}".`);
    result[key] = textInput(
      `${field}.${key}`,
      value[key],
      METADATA_LIMITS[key],
    );
  }
  return result;
}

const identifier = (field, value) => {
  if (typeof value !== "string" || !value || value.length > 200)
    throw refuse(field, null, `${field} is an identifier.`);
  return value;
};

/**
 * The owner's change, checked: `{ field, value }` from `metadata` — one
 * key, the value its own shape (`null` gives the field back). The
 * acquisition takes an operation: `null` (back to the night),
 * `{ add: line }`, `{ line: id, set: line }`, `{ line: id, delete: true }`.
 */
export function ownerChangeInput(metadata) {
  if (!isObject(metadata))
    throw refuse("metadata", null, "metadata is an object of one field.");
  const keys = Object.keys(metadata);
  if (keys.length !== 1)
    throw refuse(
      "metadata",
      null,
      "Send exactly one field of metadata per request.",
    );
  const [field] = keys;
  const value = metadata[field];
  if (!OWNER_FIELDS.includes(field))
    throw refuse(field, null, `Unknown metadata field "${field}".`);
  if (Object.hasOwn(TEXT_FIELDS, field))
    return { field, value: textInput(field, value, METADATA_LIMITS[field]) };
  if (Object.hasOwn(PROCESSING_PARTS, field)) {
    const [, limit] = PROCESSING_PARTS[field];
    return { field, value: textInput(field, value, limit) };
  }
  if (field === "sensor") return { field, value: sensorInput(value) };
  // `null` detaches the capture from its session.
  if (field === "sessionId")
    return {
      field,
      value: value === null ? null : identifier("sessionId", value),
    };
  // « Ajouter / changer la cible » — the capture's whole ordered list of
  // targets (16 at most, none to remove the last one).
  if (field === "targetIds") {
    if (!Array.isArray(value) || value.length > 16)
      throw refuse(field, 16, "targetIds is a list of at most 16 identifiers.");
    return {
      field,
      value: [...new Set(value.map((id) => identifier(field, id)))],
    };
  }
  if (field === "equipment.filterIds") {
    if (value === null) return { field, value: null };
    if (!Array.isArray(value) || value.length > 8)
      throw refuse(field, 8, "filterIds is a list of identifiers or null.");
    return {
      field,
      value: [...new Set(value.map((id) => identifier(field, id)))],
    };
  }
  if (Object.hasOwn(EQUIPMENT_ROLES, field))
    return {
      field,
      value: value === null ? null : identifier(field, value),
    };
  // field === "acquisition"
  if (value === null) return { field, value: null };
  if (!isObject(value))
    throw refuse(field, null, "acquisition is an operation or null.");
  if (value.add !== undefined) {
    if (Object.keys(value).length !== 1)
      throw refuse(field, null, "add comes alone.");
    return {
      field,
      value: { op: "add", line: acquisitionLineInput(value.add) },
    };
  }
  const lineId = identifier("acquisition.line", value.line);
  if (value.delete === true && Object.keys(value).length === 2)
    return { field, value: { op: "delete", lineId } };
  if (value.set !== undefined && Object.keys(value).length === 2)
    return {
      field,
      value: { op: "set", lineId, line: acquisitionLineInput(value.set) },
    };
  throw refuse(
    field,
    null,
    "acquisition is { add }, { line, set } or { line, delete: true }.",
  );
}

/**
 * The quality (`capture.schema.json` `imageQuality`) of a stacked image a
 * producer measured on its linear master, checked and put in its stored form
 * (`null` for none). A value outside the bounds, an unexpected property or a
 * missing one is `invalid_metadata` with the field (`imageQuality…`).
 */
export function imageQualityInput(value, field = "imageQuality") {
  if (value === null || value === undefined) return null;
  if (!isObject(value))
    throw refuse(field, null, "imageQuality is an object or null.");
  const allowed = [
    "fwhmPixels",
    "fwhmArcsec",
    "eccentricity",
    "starCount",
    "measuredOn",
    "measuredAt",
    "tool",
  ];
  for (const key of Object.keys(value))
    if (!allowed.includes(key))
      throw refuse(field, null, `Unexpected imageQuality property "${key}".`);
  const number = (key, { min, max, exclusive = false, nullable = false }) => {
    const v = value[key];
    if (v === null || (v === undefined && nullable)) return null;
    if (
      typeof v !== "number" ||
      !Number.isFinite(v) ||
      (exclusive ? v <= min : v < min) ||
      v > max
    )
      throw refuse(`${field}.${key}`, null, `${key} is out of bounds.`);
    return v;
  };
  const fwhmPixels = number("fwhmPixels", {
    min: 0,
    max: 1000,
    exclusive: true,
  });
  if (fwhmPixels === null)
    throw refuse(`${field}.fwhmPixels`, null, "fwhmPixels is required.");
  const fwhmArcsec = number("fwhmArcsec", {
    min: 0,
    max: 1000,
    exclusive: true,
    nullable: true,
  });
  const eccentricity = number("eccentricity", {
    min: 0,
    max: 1,
    nullable: true,
  });
  const { starCount } = value;
  if (
    !Number.isSafeInteger(starCount) ||
    starCount < 0 ||
    starCount > 100_000_000
  )
    throw refuse(`${field}.starCount`, null, "starCount is a whole number.");
  if (value.measuredOn !== "linear")
    throw refuse(
      `${field}.measuredOn`,
      null,
      "measuredOn is linear: an image processed elsewhere has no quality.",
    );
  const { measuredAt } = value;
  if (
    typeof measuredAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(
      measuredAt,
    ) ||
    Number.isNaN(Date.parse(measuredAt))
  )
    throw refuse(`${field}.measuredAt`, null, "measuredAt is a timestamp.");
  const { tool } = value;
  if (
    !isObject(tool) ||
    Object.keys(tool).some((key) => !["name", "version"].includes(key)) ||
    typeof tool.name !== "string" ||
    !tool.name.length ||
    tool.name.length > 60 ||
    typeof tool.version !== "string" ||
    !tool.version.length ||
    tool.version.length > 40
  )
    throw refuse(
      `${field}.tool`,
      null,
      "tool is { name, version }: the program and its version.",
    );
  return {
    fwhmPixels,
    fwhmArcsec,
    eccentricity,
    starCount,
    measuredOn: "linear",
    measuredAt,
    tool: { name: tool.name, version: tool.version },
  };
}

/**
 * A producer's proposals, checked: `{ source, fields }` where `fields` may
 * hold `title`, `description`, `acquisition[]`, `calibration`, `sensor`,
 * `processing`. A proposal never clears: `null` and blank values are left
 * out.
 */
export function proposalsInput(body, { field = "proposed" } = {}) {
  if (!isObject(body)) throw refuse(field, null, `${field} is an object.`);
  const { source, ...rest } = body;
  if (!PROPOSAL_SOURCES.includes(source))
    throw refuse(
      `${field}.source`,
      null,
      `source is one of ${PROPOSAL_SOURCES.join(", ")}.`,
    );
  return { source, fields: proposedFieldsInput(rest, field) };
}

/** The proposed fields alone (`uploadMetadata` carries them beside its own). */
export function proposedFieldsInput(body, field = "proposed") {
  const fields = {};
  for (const key of Object.keys(body)) {
    if (!PROPOSABLE_FIELDS.includes(key))
      throw refuse(`${field}.${key}`, null, `Unknown proposed field "${key}".`);
    const value = body[key];
    if (value === null || value === undefined) continue;
    if (Object.hasOwn(TEXT_FIELDS, key)) {
      const text = textInput(key, value, METADATA_LIMITS[key]);
      if (text !== null) fields[key] = text;
    } else if (key === "sensor") {
      const sensor = sensorInput(value);
      if (sensor) fields.sensor = sensor;
    } else if (key === "processing") {
      const processing = processingInput(value);
      for (const [part, text] of Object.entries(processing))
        if (text !== null) (fields.processing ??= {})[part] = text;
    } else {
      if (!Array.isArray(value) || value.length > 40)
        throw refuse(
          "acquisition",
          40,
          "acquisition is a list of 40 lines at most.",
        );
      if (value.length)
        fields.acquisition = value.map((line, index) =>
          acquisitionLineInput(line, `acquisition[${index}]`, {
            producer: true,
          }),
        );
    }
  }
  return fields;
}

/**
 * A generated text proposed (`generatedTitle`, `generatedDescription`):
 * the ten languages, English required (`image-texts.js`); `undefined` when
 * absent. `field` names it in the refusal (`variantGeneratedTitle` at an
 * upload).
 */
function generatedTextInput(field, value, limit) {
  if (value === undefined) return undefined;
  const problem = generatedTextProblem(value, limit);
  if (problem)
    throw refuse(
      field,
      limit,
      problem === "too_long"
        ? `${field} holds ${limit} characters at most in each language.`
        : `${field} is an object of texts keyed by ${generatedTextLocales().join(", ")}, en required.`,
    );
  return storedGeneratedText(value);
}

/**
 * An image's title and description proposed (`variantTitle`,
 * `variantDescription`: the owner's fields, in one language), and the texts
 * the producer generated in the ten languages (`generatedTitle`,
 * `generatedDescription`, kept apart), and what made the image
 * (`processing`, `variantProcessing` at an upload). `names` are the fields as
 * the request names them, for the refusals.
 */
export function variantProposalInput(
  { title, description, generatedTitle, generatedDescription, processing } = {},
  names = {
    generatedTitle: "generatedTitle",
    generatedDescription: "generatedDescription",
    processing: "processing",
  },
) {
  const out = {};
  // What made this image (`{ software?, steps? }`): the image's own, kept with
  // it; `null` or absent proposes nothing.
  if (processing !== undefined && processing !== null) {
    const kept = Object.fromEntries(
      Object.entries(
        processingInput(processing, names.processing ?? "processing"),
      ).filter(([, text]) => text !== null && text !== undefined),
    );
    if (Object.keys(kept).length) out.processing = kept;
  }
  const gt = generatedTextInput(
    names.generatedTitle,
    generatedTitle,
    GENERATED_TEXT_LIMITS.generatedTitle,
  );
  const gd = generatedTextInput(
    names.generatedDescription,
    generatedDescription,
    GENERATED_TEXT_LIMITS.generatedDescription,
  );
  if (gt) out.generatedTitle = gt;
  if (gd) out.generatedDescription = gd;
  const t = textInput(
    "variantTitle",
    title ?? null,
    METADATA_LIMITS.variantTitle,
  );
  const d = textInput(
    "variantDescription",
    description ?? null,
    METADATA_LIMITS.variantDescription,
  );
  if (t !== null) out.title = t;
  if (d !== null) out.description = d;
  return out;
}

// ---------------------------------------------------------------------------
// The stored state of a capture's metadata: its columns, read and written.

/** The capture's own metadata from its row (the columns of migration 69). */
export function storedMetadata(row) {
  return {
    title: row.title ?? null,
    description: row.description ?? null,
    notes: row.notes ?? null,
    calibration: row.calibration ?? null,
    acquisition: parse(row.acquisition_json, null),
    sensor: parse(row.sensor_json, null),
    equipment: parse(row.equipment_json, null),
    processing: parse(row.processing_json, null),
    origins: parse(row.field_origins_json, {}) || {},
  };
}

/** The columns of a stored state, as `UPDATE captures` writes them. */
export function metadataColumns(state) {
  const json = (value) =>
    value === null ||
    value === undefined ||
    (isObject(value) && !Object.keys(value).length)
      ? null
      : JSON.stringify(value);
  return {
    title: state.title ?? null,
    description: state.description ?? null,
    notes: state.notes ?? null,
    calibration: state.calibration ?? null,
    acquisition_json: Array.isArray(state.acquisition)
      ? JSON.stringify(state.acquisition)
      : null,
    sensor_json: json(state.sensor),
    equipment_json: json(state.equipment),
    processing_json: json(state.processing),
    field_origins_json: json(state.origins),
  };
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const same = (left, right) =>
  JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

/**
 * What a card of the list says of a capture's lines of « Intégrations »
 * without a second call —
 * `{ lineCount, frameCount, exposureSeconds, integrationSeconds }`, or
 * `null` without a line. `exposureSeconds` is the exposure every line
 * shares (`null` when they differ); a declared line whose poses are not
 * known counts its declared time and no frame. The figures of
 * `captureMetadata`'s own reading.
 */
export function acquisitionSummaryOf(lines) {
  if (!Array.isArray(lines) || !lines.length) return null;
  let frameCount = 0;
  let integrationSeconds = 0;
  const exposures = new Set();
  for (const line of lines) {
    const frames = Number(line.frameCount) || 0;
    const exposure = Number(line.exposureSeconds) || 0;
    const known = frames > 0 && exposure > 0;
    frameCount += frames;
    integrationSeconds += known
      ? frames * exposure
      : Math.max(0, Number(line.declaredSeconds) || 0);
    if (known) exposures.add(exposure);
  }
  return {
    lineCount: lines.length,
    frameCount,
    exposureSeconds:
      exposures.size === 1 && lines.every((line) => Number(line.frameCount) > 0)
        ? [...exposures][0]
        : null,
    integrationSeconds: Math.round(integrationSeconds * 1000) / 1000,
  };
}

/** A line the session declared that nobody corrected: a fallback only. */
const isUntouchedDeclared = (line) =>
  line.origin === "session" && !line.editedAt;

/** The key a producer's line is matched by: its filter and its exposure. */
export const lineKey = (line) =>
  `${String(line.filter ?? "")
    .trim()
    .toLowerCase()}|${Number(line.exposureSeconds)}`;

/** A night's steps as a capture's lines (they become its own on a correction). */
export const nightLines = (steps) =>
  steps.map((step) => ({
    id: step.id,
    filter: step.filter ?? null,
    frameCount: step.frameCount,
    exposureSeconds: step.exposureSeconds,
    gain: step.gain ?? null,
    origin: "night",
    // How the step came (`analysis`, `import`, `manual`), from which the
    // line's provenance is read; kept when the line becomes the capture's
    // own.
    stepOrigin: step.origin ?? null,
    editedAt: step.editedAt ?? null,
  }));

/** Read the value a field holds in a stored state (`processing.software`…). */
function valueOf(state, field) {
  if (Object.hasOwn(TEXT_FIELDS, field)) return state[field] ?? null;
  if (field === "sensor") return state.sensor ?? null;
  if (Object.hasOwn(PROCESSING_PARTS, field))
    return state.processing?.[PROCESSING_PARTS[field][0]] ?? null;
  if (Object.hasOwn(EQUIPMENT_ROLES, field))
    return state.equipment?.[EQUIPMENT_ROLES[field]] ?? null;
  return null;
}

function setValue(state, field, value) {
  if (Object.hasOwn(TEXT_FIELDS, field)) state[field] = value;
  else if (field === "sensor") state.sensor = value;
  else if (Object.hasOwn(PROCESSING_PARTS, field)) {
    const part = PROCESSING_PARTS[field][0];
    state.processing = { ...(state.processing || {}) };
    if (value === null) delete state.processing[part];
    else state.processing[part] = value;
    if (!Object.keys(state.processing).length) state.processing = null;
  } else if (Object.hasOwn(EQUIPMENT_ROLES, field)) {
    const role = EQUIPMENT_ROLES[field];
    state.equipment = { ...(state.equipment || {}) };
    if (value === null) delete state.equipment[role];
    else state.equipment[role] = value;
    if (!Object.keys(state.equipment).length) state.equipment = null;
  }
}

/**
 * What a scalar field of a stored state holds, with the origin it is read
 * under (its source and whether the owner edited it): two states with the
 * same view are the same for the conflict (the moment of a write is not a
 * change).
 */
export function metadataFieldView(state, field) {
  const origin = state.origins?.[field] ?? null;
  return {
    value: valueOf(state, field),
    source: origin?.source ?? null,
    edited: Boolean(origin?.edited),
  };
}

/**
 * The owner's change applied to a stored state (`ownerChangeInput`'s
 * answer): returns the new state. A value proposed earlier is kept aside
 * (`origins[field].proposed`) so that clearing the edited value gives it
 * back. `nightSteps`: the night's steps of the capture's targets, copied
 * when a first line is corrected. `sessionId` is not a column of this
 * state (the caller writes it).
 */
export function applyOwnerChange(
  stored,
  { field, value },
  { at, nightSteps = [] },
) {
  const state = clone(stored);
  state.origins ??= {};
  if (field === "acquisition") {
    if (value === null) {
      state.acquisition = null;
      delete state.origins.acquisition;
      return state;
    }
    const lines = Array.isArray(state.acquisition)
      ? state.acquisition
      : nightLines(nightSteps);
    const deleted = new Set(state.origins.acquisition?.deleted || []);
    if (value.op === "add") {
      lines.push({
        id: randomUUID(),
        ...value.line,
        origin: "owner",
        editedAt: at,
      });
    } else {
      const index = lines.findIndex((line) => line.id === value.lineId);
      if (index < 0)
        throw new MetadataError(
          "acquisition.line",
          null,
          "The acquisition line was not found.",
          { status: 404, code: "acquisition_line_not_found" },
        );
      if (value.op === "delete") {
        if (lines[index].origin !== "owner") deleted.add(lineKey(lines[index]));
        lines.splice(index, 1);
      } else {
        lines[index] = {
          ...lines[index],
          ...value.line,
          editedAt: at,
        };
      }
    }
    state.acquisition = lines;
    state.origins.acquisition = {
      ...(state.origins.acquisition || {}),
      source: state.origins.acquisition?.source ?? "night",
      at: state.origins.acquisition?.at ?? at,
      edited: true,
      ...(deleted.size ? { deleted: [...deleted] } : {}),
    };
    return state;
  }
  const previous = state.origins[field];
  if (value === null) {
    // Back to the source: the value a producer proposed, else the level
    // above (the night, its plan, the targets).
    if (previous?.proposed) {
      setValue(state, field, previous.proposed.value);
      state.origins[field] = {
        source: previous.proposed.source,
        at: previous.proposed.at,
        edited: false,
      };
    } else {
      setValue(state, field, null);
      delete state.origins[field];
    }
    return state;
  }
  const kept =
    previous?.proposed ??
    (previous && !previous.edited && previous.source !== "owner"
      ? {
          value: valueOf(state, field),
          source: previous.source,
          at: previous.at,
        }
      : undefined);
  setValue(state, field, value);
  state.origins[field] = {
    source: "owner",
    at,
    edited: true,
    ...(kept ? { proposed: kept } : {}),
  };
  return state;
}

/**
 * A producer's proposals applied to a stored state: `{ state, applied,
 * skipped }` — `applied` names the fields written, `skipped` lists
 * `{ field, reason }` for what was left (`edited`: the owner's value;
 * `deleted`: a line the owner deleted). Nothing is ever cleared; the same
 * proposals twice change nothing.
 */
export function applyProposals(stored, { source, fields }, { at }) {
  const state = clone(stored);
  state.origins ??= {};
  const applied = [];
  const skipped = [];
  const scalar = (field, value) => {
    const origin = state.origins[field];
    if (origin?.edited) {
      if (
        !same(origin.proposed?.value, value) ||
        origin.proposed?.source !== source
      )
        state.origins[field] = {
          ...origin,
          proposed: { value, source, at },
        };
      skipped.push({ field, reason: "edited" });
      return;
    }
    if (same(valueOf(state, field), value) && origin?.source === source) return;
    setValue(state, field, value);
    state.origins[field] = { source, at, edited: false };
    applied.push(field);
  };
  for (const field of ["title", "description", "calibration"])
    if (fields[field] !== undefined) scalar(field, fields[field]);
  if (fields.sensor !== undefined) scalar("sensor", fields.sensor);
  if (fields.processing)
    for (const [part, value] of Object.entries(fields.processing))
      scalar(`processing.${part}`, value);
  if (fields.acquisition) {
    const own = Array.isArray(state.acquisition);
    let lines = own ? state.acquisition : [];
    const deleted = new Set(state.origins.acquisition?.deleted || []);
    let changed = false;
    // A line the session declared (« 466 frames over 6 h 36 ») is a fallback
    // for a capture nothing measured: what a producer measured takes its place
    // instead of standing beside it.
    if (fields.acquisition.length && lines.some(isUntouchedDeclared)) {
      lines = lines.filter((line) => !isUntouchedDeclared(line));
      changed = true;
    }
    fields.acquisition.forEach((proposed, index) => {
      const key = lineKey(proposed);
      if (deleted.has(key)) {
        skipped.push({ field: `acquisition[${index}]`, reason: "deleted" });
        return;
      }
      const found = lines.find((line) => lineKey(line) === key);
      if (!found) {
        lines.push({
          id: randomUUID(),
          ...proposed,
          origin: source,
          editedAt: null,
        });
        changed = true;
        return;
      }
      if (found.editedAt || found.origin === "owner") {
        skipped.push({ field: `acquisition[${index}]`, reason: "edited" });
        return;
      }
      const next = { ...found, ...proposed, origin: source };
      if (!same(next, found)) {
        Object.assign(found, next);
        changed = true;
      }
    });
    if (changed) {
      state.acquisition = lines;
      state.origins.acquisition = {
        ...(state.origins.acquisition || {}),
        source,
        at,
        edited: Boolean(state.origins.acquisition?.edited),
      };
      applied.push("acquisition");
    }
  }
  return { state, applied, skipped };
}

// ---------------------------------------------------------------------------
// Writing the proposals (the device routes, the uploads, the photo).

/**
 * A producer's proposals applied to a capture's row and written through
 * the capture repository (`writeMetadata`): `{ applied, skipped }`.
 * `capture` is the row of `captures` (its metadata columns read).
 */
export async function recordProposals({
  store,
  tenantId,
  capture,
  input,
  at,
  userId = null,
}) {
  // A producer's write is one step with the owner's (the same lock), moves
  // the revision once and marks the fields it changed.
  return await withCaptureLock(capture.id, async () => {
    const row =
      (store.captureRow
        ? await store.captureRow(tenantId, capture.id)
        : null) ?? capture;
    const before = storedMetadata(row);
    const { state, applied, skipped } = applyProposals(before, input, { at });
    if (applied.length) {
      await store.writeMetadata(tenantId, row.id, metadataColumns(state));
      const fields = [];
      for (const field of applied) {
        if (field !== "acquisition") fields.push({ field });
        else
          for (const line of changedLineIds(
            before.acquisition,
            state.acquisition,
          ))
            fields.push({ field, line });
      }
      await store.touchCapture?.(tenantId, row.id, {
        fields,
        by: "producer",
        userId,
        at,
      });
    }
    return { applied, skipped };
  });
}

/**
 * A producer's title and description of an image (`{ title?,
 * description? }`, `source` the producer's): never over an image whose
 * texts the owner wrote (`edited_at`, listed in `skipped`); the same
 * proposal twice changes nothing; nothing is cleared. The texts it
 * generated in the ten languages (`generatedTitle`, `generatedDescription`)
 * are its own fields: written whatever the owner typed, each replaced whole;
 * they clear the producer's own one-language title of before (its
 * `title_source`) and, while the owner never wrote, the description.
 */
export async function recordVariantProposal({
  store,
  tenantId,
  captureId,
  imageId,
  texts,
  source,
}) {
  const stored = await store.variantRow(tenantId, captureId, imageId);
  if (!stored) return [];
  // What made the image is not a text: `recordVariantProcessing` keeps it.
  const {
    generatedTitle,
    generatedDescription,
    processing: _processing,
    ...own
  } = texts;
  if (generatedTitle || generatedDescription) {
    const fromProducer =
      source !== null && (stored.title_source ?? null) === source;
    await store.writeVariantGeneratedTexts(tenantId, captureId, imageId, {
      ...(generatedTitle ? { title: JSON.stringify(generatedTitle) } : {}),
      ...(generatedDescription
        ? { description: JSON.stringify(generatedDescription) }
        : {}),
      clearTitle: fromProducer && Boolean(generatedTitle),
      clearDescription:
        fromProducer && !stored.edited_at && Boolean(generatedDescription),
    });
  }
  const fields = Object.keys(own);
  if (!fields.length) return [];
  if (stored.edited_at)
    return fields.map((field) => ({
      field: field === "title" ? "variantTitle" : "variantDescription",
      reason: "edited",
    }));
  const latest =
    generatedTitle || generatedDescription
      ? await store.variantRow(tenantId, captureId, imageId)
      : stored;
  const title = own.title ?? latest.title ?? null;
  const description = own.description ?? latest.description ?? null;
  const titleSource = own.title ? source : (latest.title_source ?? null);
  if (
    title === (latest.title ?? null) &&
    description === (latest.description ?? null) &&
    titleSource === (latest.title_source ?? null)
  )
    return [];
  await store.writeVariantTexts(tenantId, captureId, imageId, {
    title,
    description,
    titleSource,
    editedAt: null,
  });
  return [];
}

/**
 * What made an image (`processing`: `{ software?, steps? }`), as its producer
 * proposed it: kept with the image (`capture_variants.processing_json`), whole
 * and replaced by a later proposal. The capture shows the steps of its **main**
 * image: when the image is the main one and `toCapture` is set, they are
 * proposed to the capture as well (never over what the owner wrote), the way
 * the capture's own fields are. `{ skipped }` lists what the owner's values left.
 */
export async function recordVariantProcessing({
  store,
  tenantId,
  captureId,
  imageId,
  processing,
  source,
  at,
  userId = null,
  toCapture = true,
}) {
  if (!processing || !Object.keys(processing).length || !source)
    return { skipped: [] };
  const stored = await store.variantRow(tenantId, captureId, imageId);
  if (!stored) return { skipped: [] };
  await store.writeVariantProcessing(tenantId, captureId, imageId, {
    ...processing,
    source,
  });
  if (!toCapture || Number(stored.is_main) !== 1) return { skipped: [] };
  const capture = await store.captureRow?.(tenantId, captureId);
  if (!capture) return { skipped: [] };
  const { skipped } = await recordProposals({
    store,
    tenantId,
    capture,
    input: { source, fields: { processing } },
    at,
    userId,
  });
  return { skipped };
}

/**
 * The image that has just become the main one of its capture
 * (`captures.setMainImage`): the capture shows what made *that* image, not the
 * one it had before. The steps the producer proposed for the image are
 * proposed to the capture, never over what the owner wrote; an image without
 * any (sent before they were kept, or made elsewhere) leaves the capture's
 * as they are.
 */
export async function carryProcessingOfMainImage({
  store,
  tenantId,
  captureId,
  imageId,
  at,
  userId = null,
}) {
  const image = await store.variantRow(tenantId, captureId, imageId);
  const kept = parse(image?.processing_json, null);
  if (!isObject(kept) || !PROPOSAL_SOURCES.includes(kept.source))
    return { applied: [], skipped: [] };
  const { source, ...processing } = kept;
  const capture = await store.captureRow?.(tenantId, captureId);
  if (!capture || !Object.keys(processing).length)
    return { applied: [], skipped: [] };
  return await recordProposals({
    store,
    tenantId,
    capture,
    input: { source, fields: { processing } },
    at,
    userId,
  });
}
