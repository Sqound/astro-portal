import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The production-code counterpart of
 * packages/astro-contracts/tests/schema-assert.mjs, trimmed to exactly the
 * JSON Schema (2020-12 subset) keywords the nine session-event payload
 * schemas actually use: type, required, properties/additionalProperties,
 * enum, minLength/maxLength, pattern, minimum/maximum, allOf, anyOf, and
 * (`plan_edited`'s three lists) items/minItems/maxItems. None of
 * `packages/astro-contracts/schemas/session-events/*.schema.json` uses $ref,
 * oneOf or const, so this module deliberately does not implement them.
 *
 * astro-contracts exports no validator of its own (packages/astro-contracts/src/index.ts
 * re-exports only ./capabilities.js), and schema-assert.mjs lives under that
 * package's tests/ and must not be imported from production code (it is not
 * even part of the package's build output). This is therefore the smallest
 * validator this route can use while still treating the registry's schema
 * FILES as the single source of truth for a payload's shape: a change to a
 * bound or an enum in the registry takes effect here without a second edit,
 * the same reasoning session-event-ingest.schema.json itself gives for
 * dispatching to these files rather than re-describing them.
 *
 * The ULID pattern and the nine-type enum are the one exception: they are
 * restated below as plain constants rather than read from
 * event-envelope.schema.json at request time, because a submitted event's
 * envelope (eventId/type/recordedAt) is validated field-by-field so the
 * caller can classify a failure into one of the registry's five rejection
 * codes (unknown_event_type/invalid_event_id/invalid_recorded_at), which a
 * single generic schema match cannot do. A test in this package pins both
 * constants against the schema file's own values, so any drift between them
 * fails loudly rather than silently, exactly as session-event-ingest.schema.json
 * says of its own restated envelope.
 */

// Snake_case registry type -> kebab-case schema file
// (packages/astro-contracts/schemas/session-events.md, "Schema files").
const SCHEMA_FILE_BY_TYPE = {
  note: "note",
  target_started: "target-started",
  target_finished: "target-finished",
  target_skipped: "target-skipped",
  pause: "pause",
  resume: "resume",
  condition: "condition",
  equipment_issue: "equipment-issue",
  // The observer confirms the time the clock counted in automatic advance
  // mode (the target events' own `auto: true`).
  auto_time_confirmed: "auto-time-confirmed",
  // The four kinds Astro Sync detects.
  exposure_change: "exposure-change",
  guiding_timeouts: "guiding-timeouts",
  sensor_temperature_drift: "sensor-temperature-drift",
  guiding_spikes: "guiding-spikes",
  // The events of the night's mount, a smart
  // telescope in mode expérimental and the pointing helps are kept in the
  // session. `mount_*` — the mount link (a smart telescope in mode simplifié
  // included); `device_*` — a smart telescope's own link; all additive.
  mount_connected: "mount-connected",
  mount_goto: "mount-goto",
  mount_stop: "mount-stop",
  mount_link_lost: "mount-link-lost",
  mount_link_back: "mount-link-back",
  mount_disconnected: "mount-disconnected",
  mount_parked: "mount-parked",
  mount_aligned: "mount-aligned",
  pointing_help: "pointing-help",
  device_connected: "device-connected",
  device_goto: "device-goto",
  device_stop: "device-stop",
  device_parked: "device-parked",
  device_link_lost: "device-link-lost",
  device_link_back: "device-link-back",
  // A plan changed while the night ran — the targets added, removed or
  // moved, with the slots the change gave them.
  plan_edited: "plan-edited",
  // A sample of what a smart telescope says of itself (filter, hygrometer,
  // heater, battery, frames kept and rejected), every 5 min and at each
  // change (SMART-SCOPE-INSTRUMENT-PANEL-01).
  device_instrument: "device-instrument",
  // GUIDED-EVENING-04: a guided evening that ran under the night ended —
  // its route, way of observing, steps seen, duration (versioned).
  guided_evening: "guided-evening",
};

export const SESSION_EVENT_TYPES = Object.freeze(
  Object.keys(SCHEMA_FILE_BY_TYPE),
);

/**
 * The `source` of a stored event (session-event-ingest.schema.json
 * $defs.source), set by the service from the caller's credential and never
 * accepted from a client: `astro-sync` for a device of the application
 * Astro Sync (`application: "sync"` in the device registry, the rule the
 * captures' source already follows), `declared` for anything else (the
 * phone, the web, a debriefing).
 */
export const EVENT_SOURCES = Object.freeze(["declared", "astro-sync"]);

export function eventSourceForApplication(application) {
  return application === "sync" ? "astro-sync" : "declared";
}

// event-envelope.schema.json's own eventId.pattern.
export const EVENT_ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

// packages/portal and packages/astro-contracts are always siblings on disk
// — a fixed structural relationship, unlike the runtime
// DATA directories (static-data, the sky-quality raster) that
// ASTRO_PORTAL_SERVICE_DIR/ASTRO_PORTAL_STATIC_DATA_DIR relocate for a
// deployment. Resolving against this module's own URL therefore works
// regardless of the process's current working directory — including
// `npm test -w portal`, whose cwd is packages/portal itself, not the repo
// root a cwd-relative lookup would assume.
//
// Built with `dirname(fileURLToPath(...))` + `join`, not `new URL(relative,
// import.meta.url)`: that literal-string form is the idiom bundlers (Next's
// Turbopack and webpack alike) pattern-match to inline a referenced asset,
// and a *directory* target — this one has no file extension and a trailing
// slash — is not a module either can resolve, so any Next.js route that
// imports this file transitively (observation-sessions.js -> every
// GET/POST /v1/sessions* route) failed to bundle at all: `Module
// not found: Can't resolve '../../../astro-contracts/schemas/session-events/'`.
// That broke every session route the moment the app was served through
// `next dev`/`next build` rather than run through plain `node --test`, which
// is the only way this had been exercised until the UI was built on it.
// (packages/portal/tests/session-event-registry.test.mjs pins this exact
// directory against a Turbopack-style static scan.)
export function defaultSessionEventSchemaDirectory() {
  return join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "astro-contracts",
    "schemas",
    "session-events",
  );
}

function schemaDirectory() {
  const override = process.env.ASTRO_PORTAL_SESSION_EVENT_SCHEMA_DIR;
  return override ? resolve(override) : defaultSessionEventSchemaDirectory();
}

let cachedPayloadSchemas = null;

function payloadSchemas() {
  if (!cachedPayloadSchemas) {
    const directory = schemaDirectory();
    cachedPayloadSchemas = {};
    for (const [type, file] of Object.entries(SCHEMA_FILE_BY_TYPE))
      cachedPayloadSchemas[type] = JSON.parse(
        readFileSync(join(directory, `${file}.schema.json`), "utf8"),
      );
  }
  return cachedPayloadSchemas;
}

/** Test-only escape hatch: forces a reload after a schema file changes on disk. */
export function resetSessionEventSchemaCache() {
  cachedPayloadSchemas = null;
}

export function isKnownEventType(type) {
  return typeof type === "string" && SESSION_EVENT_TYPES.includes(type);
}

export function isValidEventId(value) {
  return typeof value === "string" && EVENT_ID_PATTERN.test(value);
}

// recordedAt is the device clock and is never rejected for implausibility
// (api/v1.md, "Clocks, ordering and pagination") — only for not being a
// parseable ISO 8601 date-time at all, exactly the event-envelope schema's
// own format: "date-time" keyword.
export function isValidRecordedAt(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

// --- minimal JSON Schema (2020-12 subset) evaluator ---

function matchesType(value, type) {
  switch (type) {
    case "object":
      return (
        value !== null && typeof value === "object" && !Array.isArray(value)
      );
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    default:
      return true;
  }
}

function schemaErrors(schema, value, path = "$") {
  const errors = [];
  const fail = (message) => errors.push(`${path}: ${message}`);

  if (schema.allOf)
    for (const branch of schema.allOf)
      errors.push(...schemaErrors(branch, value, path));
  if (schema.anyOf) {
    const matched = schema.anyOf.some(
      (branch) => schemaErrors(branch, value, path).length === 0,
    );
    if (!matched) fail("must match at least one anyOf branch");
  }

  if (schema.enum && !schema.enum.includes(value))
    fail(`must be one of ${JSON.stringify(schema.enum)}`);

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => matchesType(value, type))) {
      fail(`must be of type ${types.join("|")}`);
      return errors;
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required || [])
      if (!(key in value)) fail(`missing required property "${key}"`);
    const declared = new Set(Object.keys(schema.properties || {}));
    if (schema.additionalProperties === false)
      for (const key of Object.keys(value))
        if (!declared.has(key)) fail(`unexpected property "${key}"`);
    for (const [key, subschema] of Object.entries(schema.properties || {}))
      if (key in value)
        errors.push(...schemaErrors(subschema, value[key], `${path}.${key}`));
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems)
      fail(`must have at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems)
      fail(`must have at most ${schema.maxItems} items`);
    if (schema.items)
      value.forEach((item, index) =>
        errors.push(...schemaErrors(schema.items, item, `${path}[${index}]`)),
      );
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum)
      fail(`must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum)
      fail(`must be <= ${schema.maximum}`);
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength)
      fail(`must have length >= ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength)
      fail(`must have length <= ${schema.maxLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value))
      fail(`must match pattern ${schema.pattern}`);
  }

  return errors;
}

/**
 * Validates a session event's `payload` against its `type`'s registered
 * schema. `type` must already be known (isKnownEventType) — this throws
 * otherwise, since the caller is expected to have classified that case as
 * `unknown_event_type` first.
 */
export function payloadSchemaErrors(type, payload) {
  const schema = payloadSchemas()[type];
  if (!schema) throw new Error(`Unknown session-event type "${type}".`);
  const errors = schemaErrors(schema, payload);
  if (!errors.length && GROUPED_TYPES.has(type)) {
    // A group spans from `firstAt` to `lastAt`: a span that runs
    // backwards is no group.
    if (Date.parse(payload.lastAt) < Date.parse(payload.firstAt))
      errors.push("$.lastAt: must not be before firstAt");
  }
  return errors;
}

// The two detected kinds that are one event per GROUP of close findings.
const GROUPED_TYPES = new Set(["guiding_timeouts", "guiding_spikes"]);
