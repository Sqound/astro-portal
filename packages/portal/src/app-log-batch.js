/**
 * A batch of the application's error logs (`POST /api/v1/app-logs`, contract
 * `packages/astro-contracts/schemas/api/app-log-batch.schema.json`):
 * checked against the contract and cleaned before the service keeps it.
 *
 * {@link validateAppLogBatch} returns `{ token, entries }` (the batch carries the
 * installation's diagnostic token, a random UUID that is nobody's identifier), every text cleaned of
 * control and invisible characters (as the web's client logs are) and cut to
 * its limit, or throws an error whose `code` is `invalid_request`. It does
 * not judge what a text says: {@link findUnsafeAppLogEntry}
 * (`app-log-redaction.js`) does.
 */

/** The most entries one batch carries. */
export const APP_LOG_BATCH_LIMIT = 20;
/**
 * The largest body the route reads (256 KiB, for the entries that
 * carry the phone's rolling debug trail).
 */
export const APP_LOG_BODY_LIMIT_BYTES = 256 * 1024;
/** The most breadcrumbs one entry carries. */
export const APP_LOG_BREADCRUMB_LIMIT = 30;

/** The most lines of the rolling debug trail one entry carries. */
export const APP_LOG_DEBUG_TRAIL_LIMIT = 200;

/**
 * The event of an entry that carries a device incident (`incident`): what a
 * smart telescope or a mount refused or did not do, with the exchanges around
 * it, sent by the application under its diagnostics switch.
 */
export const APP_LOG_INCIDENT_EVENT = "device.incident";
/** The most exchange lines one incident carries. */
export const APP_LOG_INCIDENT_LINE_LIMIT = 90;
export const APP_LOG_INCIDENT_KINDS = Object.freeze(["telescope", "mount"]);
export const APP_LOG_INCIDENT_LINKS = Object.freeze([
  "telescopeWifi",
  "network",
  "ethernet",
  "bluetooth",
  "bridge",
]);
export const APP_LOG_INCIDENT_ACTIONS = Object.freeze([
  "pointing",
  "stacking",
  "schedule",
  "init",
  "eviction",
  "busy",
  "plan",
  "client",
  "connect",
  "sync",
  "goTo",
  "move",
  "park",
  "home",
  "tracking",
  "linkLost",
  "silence",
  "stop",
  "other",
]);
export const APP_LOG_INCIDENT_OUTCOMES = Object.freeze([
  "answer",
  "silence",
  "error",
  "refused",
]);
export const APP_LOG_INCIDENT_LINE_PARTS = Object.freeze([
  "head",
  "before",
  "after",
]);
export const APP_LOG_INCIDENT_LINE_KINDS = Object.freeze([
  "sent",
  "answer",
  "event",
  "state",
  "link",
  "error",
  "note",
  "stub",
]);
const INCIDENT_FAMILY = /^[a-z0-9_-]{1,24}$/;
const INCIDENT_CAUSE = /^[a-z0-9][a-z0-9_.:-]{0,119}$/;

export const APP_LOG_LEVELS = Object.freeze(["info", "warning", "error"]);
export const APP_LOG_PLATFORMS = Object.freeze(["ios", "android"]);
export const APP_LOG_NETWORKS = Object.freeze([
  "wifi",
  "wifiWithoutInternet",
  "cellular",
  "cellularWithoutInternet",
  "ethernet",
  "none",
  "other",
]);
export const APP_LOG_BREADCRUMB_KINDS = Object.freeze([
  "navigation",
  "action",
  "launch",
  "device",
  "debug",
]);

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT = /^[a-z][A-Za-z0-9_.-]{0,79}$/;
const INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

export function invalidAppLogBatch(message) {
  return Object.assign(new Error(message), { code: "invalid_request" });
}

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Control and direction-changing characters never reach the display. */
function clean(value, maximum) {
  return String(value)
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, " ")
    .replace(/[​-‏‪-‮⁠-⁩﻿]/g, "")
    .trim()
    .slice(0, maximum);
}

function text(value, name, maximum, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw invalidAppLogBatch(`${name} is required.`);
    return null;
  }
  if (typeof value !== "string")
    throw invalidAppLogBatch(`${name} must be a string.`);
  const cleaned = clean(value, maximum);
  if (required && !cleaned) throw invalidAppLogBatch(`${name} is required.`);
  return cleaned || null;
}

function instant(value, name) {
  if (typeof value !== "string" || !INSTANT.test(value))
    throw invalidAppLogBatch(`${name} must be an ISO 8601 instant.`);
  const time = Date.parse(value);
  if (!Number.isFinite(time))
    throw invalidAppLogBatch(`${name} must be an ISO 8601 instant.`);
  return new Date(time).toISOString();
}

function oneOf(value, name, allowed, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw invalidAppLogBatch(`${name} is required.`);
    return null;
  }
  if (!allowed.includes(value))
    throw invalidAppLogBatch(`${name} must be one of ${allowed.join(", ")}.`);
  return value;
}

function diagnostic(value) {
  if (!isObject(value)) throw invalidAppLogBatch("diagnostic is required.");
  return {
    platform: oneOf(value.platform, "diagnostic.platform", APP_LOG_PLATFORMS, {
      required: true,
    }),
    osVersion: text(value.osVersion, "diagnostic.osVersion", 80),
    appVersion: text(value.appVersion, "diagnostic.appVersion", 40),
    appBuild: text(value.appBuild, "diagnostic.appBuild", 20),
    model: text(value.model, "diagnostic.model", 80),
    locale: text(value.locale, "diagnostic.locale", 35),
    screen: text(value.screen, "diagnostic.screen", 120),
    route: text(value.route, "diagnostic.route", 200),
    network: oneOf(value.network, "diagnostic.network", APP_LOG_NETWORKS),
  };
}

function fields(value) {
  if (value === undefined || value === null) return {};
  if (!isObject(value))
    throw invalidAppLogBatch("A breadcrumb's fields must be an object.");
  const kept = {};
  for (const [key, entry] of Object.entries(value).slice(0, 12)) {
    const name = clean(key, 40);
    if (!name) continue;
    if (entry === null || typeof entry === "boolean") kept[name] = entry;
    else if (typeof entry === "number" && Number.isFinite(entry))
      kept[name] = entry;
    else if (typeof entry === "string") kept[name] = clean(entry, 120);
    else
      throw invalidAppLogBatch(
        "A breadcrumb's fields hold strings, numbers, booleans or null.",
      );
  }
  return kept;
}

/** A whole number at least `minimum`, or `null` when absent. */
function integer(value, name, { minimum = 0, required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw invalidAppLogBatch(`${name} is required.`);
    return null;
  }
  if (!Number.isSafeInteger(value) || value < minimum)
    throw invalidAppLogBatch(
      `${name} must be a whole number of ${minimum} or more.`,
    );
  return value;
}

function pattern(value, name, expression) {
  if (typeof value !== "string" || !expression.test(value))
    throw invalidAppLogBatch(`${name} is a short code (${expression}).`);
  return value;
}

/** One exchange line of an incident (`incident.lines`). */
function incidentLine(value) {
  if (!isObject(value))
    throw invalidAppLogBatch("A line of an incident must be an object.");
  if (value.cause !== undefined && typeof value.cause !== "boolean")
    throw invalidAppLogBatch("incident.lines.cause must be true or false.");
  return {
    seq: integer(value.seq, "incident.lines.seq", { required: true }),
    at: instant(value.at, "incident.lines.at"),
    part: oneOf(
      value.part,
      "incident.lines.part",
      APP_LOG_INCIDENT_LINE_PARTS,
      {
        required: true,
      },
    ),
    channel: text(value.channel, "incident.lines.channel", 24, {
      required: true,
    }),
    kind: oneOf(
      value.kind,
      "incident.lines.kind",
      APP_LOG_INCIDENT_LINE_KINDS,
      {
        required: true,
      },
    ),
    name: text(value.name, "incident.lines.name", 120, { required: true }),
    code: text(value.code, "incident.lines.code", 40),
    ms: integer(value.ms, "incident.lines.ms"),
    repeat: integer(value.repeat, "incident.lines.repeat", { minimum: 1 }) ?? 1,
    cause: value.cause === true,
    fields: fields(value.fields),
  };
}

/**
 * The device incident an entry `device.incident` carries: its header, flat
 * (the device, the command and its answer, the cause), and up to 90 exchange
 * lines. A member the contract does not name is dropped, as an entry's are.
 */
function incident(value) {
  if (!isObject(value)) throw invalidAppLogBatch("incident must be an object.");
  if (typeof value.id !== "string" || !UUID.test(value.id))
    throw invalidAppLogBatch("incident.id must be a UUID.");
  if (
    value.verified !== undefined &&
    value.verified !== null &&
    typeof value.verified !== "boolean"
  )
    throw invalidAppLogBatch("incident.verified must be true, false or null.");
  const lines =
    value.lines === undefined || value.lines === null ? [] : value.lines;
  if (!Array.isArray(lines) || lines.length > APP_LOG_INCIDENT_LINE_LIMIT)
    throw invalidAppLogBatch(
      `incident.lines holds ${APP_LOG_INCIDENT_LINE_LIMIT} lines at most.`,
    );
  return {
    id: value.id.toLowerCase(),
    kind: oneOf(value.kind, "incident.kind", APP_LOG_INCIDENT_KINDS, {
      required: true,
    }),
    family: pattern(value.family, "incident.family", INCIDENT_FAMILY),
    model: text(value.model, "incident.model", 80),
    firmware: text(value.firmware, "incident.firmware", 40),
    makerApp: text(value.makerApp, "incident.makerApp", 40),
    linkKind: oneOf(
      value.linkKind,
      "incident.linkKind",
      APP_LOG_INCIDENT_LINKS,
    ),
    verified: typeof value.verified === "boolean" ? value.verified : null,
    action: oneOf(value.action, "incident.action", APP_LOG_INCIDENT_ACTIONS, {
      required: true,
    }),
    command: text(value.command, "incident.command", 120),
    params: fields(value.params),
    variant: text(value.variant, "incident.variant", 80),
    step: text(value.step, "incident.step", 80),
    attempt: integer(value.attempt, "incident.attempt"),
    attempts: integer(value.attempts, "incident.attempts"),
    durationMs: integer(value.durationMs, "incident.durationMs"),
    code: text(value.code, "incident.code", 80),
    answer: text(value.answer, "incident.answer", 500),
    elapsedMs: integer(value.elapsedMs, "incident.elapsedMs"),
    outcome: oneOf(
      value.outcome,
      "incident.outcome",
      APP_LOG_INCIDENT_OUTCOMES,
    ),
    cause: pattern(value.cause, "incident.cause", INCIDENT_CAUSE),
    before: text(value.before, "incident.before", 200),
    after: text(value.after, "incident.after", 200),
    occurrences: integer(value.occurrences, "incident.occurrences", {
      minimum: 1,
      required: true,
    }),
    connectedMs: integer(value.connectedMs, "incident.connectedMs"),
    sealedAt: instant(value.sealedAt, "incident.sealedAt"),
    lines: lines.map(incidentLine),
  };
}

function breadcrumbs(
  value,
  { name = "breadcrumbs", limit = APP_LOG_BREADCRUMB_LIMIT } = {},
) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > limit)
    throw invalidAppLogBatch(`${name} holds ${limit} entries at most.`);
  return value.map((crumb) => {
    if (!isObject(crumb))
      throw invalidAppLogBatch("A breadcrumb must be an object.");
    return {
      at: instant(crumb.at, "breadcrumb.at"),
      kind: oneOf(crumb.kind, "breadcrumb.kind", APP_LOG_BREADCRUMB_KINDS, {
        required: true,
      }),
      name: text(crumb.name, "breadcrumb.name", 80, { required: true }),
      fields: fields(crumb.fields),
    };
  });
}

function entry(value) {
  if (!isObject(value)) throw invalidAppLogBatch("An entry must be an object.");
  if (typeof value.id !== "string" || !UUID.test(value.id))
    throw invalidAppLogBatch("An entry's id must be a UUID.");
  if (typeof value.event !== "string" || !EVENT.test(value.event))
    throw invalidAppLogBatch("An entry's event is a short dotted name.");
  return {
    id: value.id.toLowerCase(),
    at: instant(value.at, "at"),
    level: oneOf(value.level, "level", APP_LOG_LEVELS, { required: true }),
    event: value.event,
    message: text(value.message, "message", 1200, { required: true }),
    stack: text(value.stack, "stack", 6000),
    diagnostic: diagnostic(value.diagnostic),
    breadcrumbs: breadcrumbs(value.breadcrumbs),
    // The last minutes of the phone's local debug log, joined to an
    // error or a problem report; absent from an entry without one.
    ...(value.debugTrail === undefined || value.debugTrail === null
      ? {}
      : {
          debugTrail: breadcrumbs(value.debugTrail, {
            name: "debugTrail",
            limit: APP_LOG_DEBUG_TRAIL_LIMIT,
          }),
        }),
    // A device incident (`device.incident` only): its header and its
    // exchange lines; absent from every other entry.
    ...incidentOf(value),
  };
}

function incidentOf(value) {
  if (value.incident === undefined || value.incident === null) return {};
  if (value.event !== APP_LOG_INCIDENT_EVENT)
    throw invalidAppLogBatch(
      `Only an entry ${APP_LOG_INCIDENT_EVENT} carries an incident.`,
    );
  return { incident: incident(value.incident) };
}

/**
 * @param {unknown} body The JSON body of `POST /api/v1/app-logs`.
 * @returns {{ token: string, entries: object[] }} The diagnostic token and
 * the entries, checked and cleaned.
 */
export function validateAppLogBatch(body) {
  if (!isObject(body) || !Array.isArray(body.entries))
    throw invalidAppLogBatch("A batch { token, entries } is required.");
  if (typeof body.token !== "string" || !UUID.test(body.token))
    throw invalidAppLogBatch("A batch's token must be a UUID.");
  if (body.entries.length < 1 || body.entries.length > APP_LOG_BATCH_LIMIT)
    throw invalidAppLogBatch(
      `A batch holds 1 to ${APP_LOG_BATCH_LIMIT} entries.`,
    );
  return { token: body.token.toLowerCase(), entries: body.entries.map(entry) };
}
