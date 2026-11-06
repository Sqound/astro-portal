import { createHash } from "node:crypto";
import { requireDebriefService } from "./debrief-service.js";
import { requireSessionReworkService } from "./journal-service.js";
import { requireObservationSessionService } from "./observation-session-service.js";
import { requirePlaceResourceService } from "./place-resource-service.js";
import { requirePlanResourceService } from "./plan-resource-service.js";
import { requireProjectNightService } from "./project-night-service.js";
import { requireProjectResourceService } from "./project-resource-service.js";
import { sessionDetailBody } from "./session-detail.js";

// "Session" here is always an OBSERVATION session; see the naming note at the
// top of packages/portal/src/persistence/observation-session-repository.js.

/**
 * `POST /v1/sessions/bulk` (`session-bulk.schema.json`): what Astro Sync's «
 * Détecter les sessions » found and the person ticked, written in one call. Each
 * night goes through the service's own gestures, in the order a person would
 * make them, so that every rule they keep holds here too:
 *
 * 1. the places to create (`PUT /v1/places/{id}`);
 * 2. per night, its plan of one night: **created** (rebuilt from the frames),
 *    **reused** (a plan planned that night and never executed, same target)
 *    or **replaced** (a plan planned that night for another target: its
 *    payload becomes what is detected), then its session (`origin:
 *    "astro-sync"`, « Importée »), finished, debriefed `executed`
 *    (« Exécutée », debriefable again later), and its targets' times and
 *    figures set by a rework (the frames' times, never the plan's slots);
 * 3. a session that already exists that night receives the targets it does
 *    not hold through the rework route (« Ajouter … à la session »), nothing
 *    else;
 * 4. the multi-night plans, born `finished` (« Terminé ») with the goal =
 *    the total acquired, their nights attached.
 *
 * **Idempotent**: every identifier the call creates is derived from the
 * space, the client's `importId` and the element's `ref`, and each gesture
 * replays (an existing plan, session, debriefing, rework, project or link
 * is read back, never written twice); the same body sent again answers the
 * same result, `replayed: true` on what was already there.
 *
 * **Partial**: an element refused for its own reason (« un plan par nuit »,
 * the plan limit, a target unknown to the space, a capability) is answered
 * `skipped` with the refusal's code; the others are written. Only a body
 * that cannot be read is refused whole (`400 invalid_request`, nothing
 * written).
 *
 * « Un plan par nuit » (a space without `planner.multiple`): a night whose
 * date already holds a plan receives no new plan (`one_plan_per_night`); a
 * reused or replaced plan stays the one plan of its night.
 */

const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const REF_PATTERN = /^[A-Za-z0-9._:-]{1,120}$/;
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const UNIT_SEPARATOR = String.fromCharCode(0x1f);
const LIMITS = { places: 20, sessions: 200, targets: 32, multiNight: 50 };
const PLAN_ACTIONS = new Set(["create", "reuse", "replace"]);
const DEFAULT_CONSTRAINTS = Object.freeze({
  minAltitude: 30,
  moonSeparationMinimum: 30,
  moonSeparationMinimumByFilter: {},
});

export class SessionBulkError extends Error {
  constructor(message) {
    super(message);
    this.name = "SessionBulkError";
    this.code = "invalid_request";
    this.status = 400;
    this.body = { error: { code: this.code, message } };
  }
}

const invalid = (message) => new SessionBulkError(message);

function digest(parts) {
  return createHash("sha256").update(parts.join(UNIT_SEPARATOR)).digest();
}

/** A UUID (version 5 layout) that the same parts always give. */
export function derivedUuid(...parts) {
  const bytes = digest(parts);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** A ULID-shaped identifier that the same parts always give. */
export function derivedUlid(...parts) {
  const bytes = digest(parts);
  let value = 0n;
  for (let index = 0; index < 17; index += 1)
    value = (value << 8n) | BigInt(bytes[index]);
  let out = "";
  for (let index = 0; index < 26; index += 1) {
    out = CROCKFORD[Number(value % 32n)] + out;
    value /= 32n;
  }
  // The first character of a ULID is 0 to 7 (48 bits of time).
  return CROCKFORD[CROCKFORD.indexOf(out[0]) % 8] + out.slice(1);
}

const plain = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function text(value, label, { max = 300, optional = false } = {}) {
  if ((value === undefined || value === null || value === "") && optional)
    return null;
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw invalid(`${label} is a text of 1 to ${max} characters.`);
  return value.trim();
}

function instant(value, label) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)))
    throw invalid(`${label} must be an ISO 8601 date-time.`);
  return new Date(Date.parse(value)).toISOString();
}

function count(value, label) {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0)
    throw invalid(`${label} is a whole number.`);
  return value;
}

function exposure(value, label) {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > 86400
  )
    throw invalid(`${label} is more than 0 s and at most a day.`);
  return value;
}

function coordinate(value, bound, label) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    Math.abs(value) > bound
  )
    throw invalid(`${label} is a number from -${bound} to ${bound}.`);
  return value;
}

function list(value, label, limit) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > limit)
    throw invalid(`${label} is a list of at most ${limit} entries.`);
  return value;
}

function ref(value, label, seen) {
  if (typeof value !== "string" || !REF_PATTERN.test(value))
    throw invalid(`${label} is 1 to 120 letters, digits, « . _ : - ».`);
  if (seen.has(value)) throw invalid(`${label} « ${value} » is repeated.`);
  seen.add(value);
  return value;
}

function validatedTarget(entry, label) {
  if (!plain(entry)) throw invalid(`${label} must be an object.`);
  const startedAt = instant(entry.startedAt, `${label}.startedAt`);
  const finishedAt = instant(entry.finishedAt, `${label}.finishedAt`);
  if (Date.parse(finishedAt) <= Date.parse(startedAt))
    throw invalid(`${label}.finishedAt must be after startedAt.`);
  return {
    targetId: text(entry.targetId, `${label}.targetId`, { max: 200 }),
    designation: text(entry.designation, `${label}.designation`),
    name: text(entry.name, `${label}.name`, { optional: true }),
    startedAt,
    finishedAt,
    frameCount: count(entry.frameCount, `${label}.frameCount`),
    exposureSeconds: exposure(
      entry.exposureSeconds,
      `${label}.exposureSeconds`,
    ),
    filter: text(entry.filter, `${label}.filter`, { max: 40, optional: true }),
  };
}

/** The body, read whole before anything is written. */
export function validatedBulkRequest(body) {
  if (!plain(body)) throw invalid("A JSON bulk creation is required.");
  if (typeof body.importId !== "string" || !ULID_PATTERN.test(body.importId))
    throw invalid("importId must be a 26-character Crockford base32 ULID.");
  const placeRefs = new Set();
  const places = list(body.places, "places", LIMITS.places).map((p, i) => {
    const label = `places[${i}]`;
    if (!plain(p)) throw invalid(`${label} must be an object.`);
    return {
      ref: ref(p.ref, `${label}.ref`, placeRefs),
      name: text(p.name, `${label}.name`, { max: 100 }),
      latitude: coordinate(p.latitude, 90, `${label}.latitude`),
      longitude: coordinate(p.longitude, 180, `${label}.longitude`),
      timeZone: text(p.timeZone, `${label}.timeZone`, {
        max: 100,
        optional: true,
      }),
    };
  });
  const sessionRefs = new Set();
  const sessions = list(body.sessions, "sessions", LIMITS.sessions).map(
    (s, i) => {
      const label = `sessions[${i}]`;
      if (!plain(s)) throw invalid(`${label} must be an object.`);
      const sessionId =
        s.sessionId === undefined || s.sessionId === null ? null : s.sessionId;
      if (sessionId !== null && !UUID_PATTERN.test(sessionId))
        throw invalid(`${label}.sessionId must be a UUID.`);
      if (
        typeof s.eveningDate !== "string" ||
        !DATE_PATTERN.test(s.eveningDate)
      )
        throw invalid(`${label}.eveningDate is a date AAAA-MM-JJ.`);
      const startedAt = instant(s.startedAt, `${label}.startedAt`);
      const finishedAt = instant(s.finishedAt, `${label}.finishedAt`);
      if (Date.parse(finishedAt) <= Date.parse(startedAt))
        throw invalid(`${label}.finishedAt must be after startedAt.`);
      let place = null;
      if (s.place !== undefined && s.place !== null) {
        if (!plain(s.place)) throw invalid(`${label}.place must be an object.`);
        if (typeof s.place.ref === "string") {
          if (!placeRefs.has(s.place.ref))
            throw invalid(`${label}.place.ref names no entry of places.`);
          place = { ref: s.place.ref };
        } else
          place = {
            placeId: text(s.place.placeId, `${label}.place.placeId`, {
              max: 120,
            }),
          };
      }
      let plan = null;
      if (sessionId === null) {
        if (!plain(s.plan) || !PLAN_ACTIONS.has(s.plan.action))
          throw invalid(`${label}.plan.action is create, reuse or replace.`);
        const planId = s.plan.action === "create" ? null : s.plan.planId;
        if (planId !== null && !UUID_PATTERN.test(planId ?? ""))
          throw invalid(`${label}.plan.planId must be a UUID.`);
        plan = {
          action: s.plan.action,
          planId,
          name: text(s.plan.name, `${label}.plan.name`, { optional: true }),
        };
      }
      const targets = list(s.targets, `${label}.targets`, LIMITS.targets).map(
        (t, j) => validatedTarget(t, `${label}.targets[${j}]`),
      );
      if (sessionId === null && !targets.length)
        throw invalid(`${label}.targets holds at least one target.`);
      return {
        ref: ref(s.ref, `${label}.ref`, sessionRefs),
        sessionId,
        eveningDate: s.eveningDate,
        startedAt,
        finishedAt,
        place,
        equipment: plain(s.equipment) ? s.equipment : null,
        plan,
        targets,
      };
    },
  );
  const multiRefs = new Set();
  const multiNight = list(body.multiNight, "multiNight", LIMITS.multiNight).map(
    (m, i) => {
      const label = `multiNight[${i}]`;
      if (!plain(m)) throw invalid(`${label} must be an object.`);
      const nights = list(m.sessionRefs, `${label}.sessionRefs`, 50);
      if (nights.length < 2)
        throw invalid(`${label}.sessionRefs names two nights at least.`);
      for (const night of nights)
        if (!sessionRefs.has(night))
          throw invalid(`${label}.sessionRefs names no entry of sessions.`);
      const goal = m.goalSeconds;
      if (typeof goal !== "number" || !Number.isFinite(goal) || goal <= 0)
        throw invalid(`${label}.goalSeconds is a duration in seconds.`);
      return {
        ref: ref(m.ref, `${label}.ref`, multiRefs),
        targetId: text(m.targetId, `${label}.targetId`, { max: 200 }),
        designation: text(m.designation, `${label}.designation`),
        name: text(m.name, `${label}.name`, { optional: true }),
        sessionRefs: [...new Set(nights)],
        goalSeconds: goal,
      };
    },
  );
  return { importId: body.importId, places, sessions, multiNight };
}

/** The refusal of one element: its code, never the whole call's. */
function refusalOf(error) {
  const code = error?.body?.error?.code ?? error?.code;
  return typeof code === "string" && code ? code : "storage_unavailable";
}

async function orNull(promise) {
  try {
    return await promise;
  } catch (error) {
    if (error?.status === 404) return null;
    throw error;
  }
}

const minutesOf = (target) =>
  Math.max(
    1,
    Math.round(
      (Date.parse(target.finishedAt) - Date.parse(target.startedAt)) / 60000,
    ),
  );

/** The plan of one night rebuilt from the frames (its slots are the times). */
function planPayload({ clientId, session, location, marker, name }) {
  const designations = [...new Set(session.targets.map((t) => t.designation))];
  return {
    id: clientId,
    date: session.eveningDate,
    name: name ?? designations.join(" · "),
    ...(location ? { location } : {}),
    ...(session.equipment ? { equipment: session.equipment } : {}),
    astroSyncImport: marker,
    items: session.targets.map((target) => ({
      id: target.targetId,
      targetId: target.targetId,
      target: {
        id: target.targetId,
        designation: target.designation,
        ...(target.name ? { name: target.name } : {}),
      },
      durationMinutes: minutesOf(target),
      ...(target.filter ? { filter: target.filter } : {}),
    })),
  };
}

/** A rework target carrying the frames' times and figures. */
function reworkTargetOf(target, state) {
  return {
    targetId: target.targetId,
    state,
    startedAt: target.startedAt,
    finishedAt: target.finishedAt,
    frameCount: target.frameCount,
    filter: target.filter,
    exposureSeconds: target.exposureSeconds,
  };
}

export async function createSessionsInBulk({
  tenantId,
  userId,
  deviceId = null,
  originClientInstanceId = null,
  body,
}) {
  const request = validatedBulkRequest(body);
  const { importId } = request;
  const plans = await requirePlanResourceService();
  const sessions = await requireObservationSessionService();
  const debrief = await requireDebriefService();
  const rework = await requireSessionReworkService();
  const places = await requirePlaceResourceService();
  const capabilities = (await plans.capabilitiesFor(userId)) ?? {};
  const severalPlansPerNight = capabilities["planner.multiple"] !== false;
  const origin = { originClientInstanceId };
  const derived = (...parts) => [tenantId, importId, ...parts];

  // 1. The places to create.
  const placeResults = [];
  const placeIdOfRef = new Map();
  for (const place of request.places) {
    const placeId = `astro-sync-${derivedUuid(...derived("place", place.ref)).slice(0, 23)}`;
    try {
      const held = await orNull(places.get({ tenantId, placeId }));
      if (!held)
        await places.write({
          tenantId,
          userId,
          placeId,
          body: {
            name: place.name,
            latitude: place.latitude,
            longitude: place.longitude,
            ...(place.timeZone ? { timeZone: place.timeZone } : {}),
            editedAt: new Date().toISOString(),
          },
          ...origin,
        });
      placeIdOfRef.set(place.ref, placeId);
      placeResults.push({ ref: place.ref, placeId, created: !held });
    } catch (error) {
      placeResults.push({
        ref: place.ref,
        placeId: null,
        created: false,
        reason: refusalOf(error),
      });
    }
  }

  const locationCache = new Map();
  async function locationOf(place) {
    if (!place) return null;
    const placeId = place.ref ? placeIdOfRef.get(place.ref) : place.placeId;
    if (!placeId) return null;
    if (!locationCache.has(placeId)) {
      const held = await orNull(places.get({ tenantId, placeId }));
      const row = held?.place ?? held;
      locationCache.set(
        placeId,
        row
          ? {
              id: placeId,
              name: row.name,
              latitude: row.latitude,
              longitude: row.longitude,
              ...(row.timeZone ? { timeZone: row.timeZone } : {}),
            }
          : null,
      );
    }
    return locationCache.get(placeId);
  }

  let datesTaken = null;
  async function dateTaken(date, exceptPlanId) {
    if (!datesTaken) {
      datesTaken = new Map();
      for (const plan of (await plans.list({ tenantId })).plans ?? []) {
        // The internal plan of a guided evening is no plan of the night.
        if (plan.payload?.guidedEvening === true) continue;
        const day = String(plan.payload?.date ?? "").slice(0, 10);
        if (!datesTaken.has(day)) datesTaken.set(day, new Set());
        datesTaken.get(day).add(plan.id);
      }
    }
    return [...(datesTaken.get(date) ?? [])].some((id) => id !== exceptPlanId);
  }

  async function detailOf(sessionId) {
    return await sessionDetailBody({ tenantId, userId, sessionId });
  }

  // 2. A night with no session: its plan, its session, its debriefing, its
  // targets' times.
  async function importNight(night) {
    const marker = { importId, ref: night.ref };
    const location = await locationOf(night.place);
    let planId;
    let planAction;
    let replayed = false;
    if (night.plan.action === "create") {
      planId = derivedUuid(...derived("plan", night.ref));
      planAction = "created";
      const held = await orNull(plans.get({ tenantId, planId }));
      if (held) replayed = true;
      else {
        if (!severalPlansPerNight && (await dateTaken(night.eveningDate, null)))
          return {
            action: "skipped",
            planAction: "none",
            planId: null,
            reason: "one_plan_per_night",
          };
        await plans.write({
          tenantId,
          userId,
          planId,
          ifMatch: '"0"',
          payload: planPayload({
            clientId: `astro-sync-${planId}`,
            session: night,
            location,
            marker,
            name: night.plan.name,
          }),
          originDeviceId: deviceId,
          ...origin,
        });
        if (datesTaken) {
          if (!datesTaken.has(night.eveningDate))
            datesTaken.set(night.eveningDate, new Set());
          datesTaken.get(night.eveningDate).add(planId);
        }
      }
    } else {
      planId = night.plan.planId;
      planAction = night.plan.action === "reuse" ? "reused" : "replaced";
      const held = await plans.get({ tenantId, planId });
      const ours =
        held.payload?.astroSyncImport?.importId === importId &&
        held.payload?.astroSyncImport?.ref === night.ref;
      // A plan closed by a device (`closedAs`) is not planned any more.
      if (held.status !== "active" || (held.payload?.closedAs && !ours)) {
        // Frozen: by this import before (a replay), else not ours to use.
        if (!ours)
          return {
            action: "skipped",
            planAction: "none",
            planId,
            reason: "plan_not_pending",
          };
        replayed = true;
      } else if (ours) replayed = true;
      else
        // The plan carries the import's mark (a replay knows it), and a
        // replaced plan becomes what is detected; a reused one keeps its own.
        await plans.write({
          tenantId,
          userId,
          planId,
          ifMatch: `"${held.revision}"`,
          payload:
            night.plan.action === "replace"
              ? planPayload({
                  clientId: held.payload?.id ?? `astro-sync-${planId}`,
                  session: night,
                  location: location ?? held.payload?.location ?? null,
                  marker,
                  name: night.plan.name,
                })
              : { ...held.payload, astroSyncImport: marker },
          originDeviceId: deviceId,
          ...origin,
        });
    }

    const created = await sessions.create({
      tenantId,
      planId,
      startedAt: night.startedAt,
      clientSessionId: derivedUlid(...derived("session", night.ref)),
      origin: "astro-sync",
      originDeviceId: deviceId,
      // The same content sent again after its night went to the trash:
      // the session comes back (its plan was replaced, `plans.write`).
      reviveDeleted: true,
      ...origin,
    });
    const sessionId = created.resource.id;
    // A session brought back from the trash is no replay: it was written.
    if (!created.created && !created.revived) replayed = true;
    await sessions.finish({
      tenantId,
      sessionId,
      finishedAt: night.finishedAt,
      closedBy: "manual",
      ...origin,
    });
    await debrief.decide({
      tenantId,
      userId,
      planId,
      body: {
        outcome: "executed",
        baseVersion: "current",
        session: { startedAt: night.startedAt, finishedAt: night.finishedAt },
      },
      originDeviceId: deviceId,
      ...origin,
    });
    const detail = await detailOf(sessionId);
    if (Number(detail.session?.reworkRevision ?? 0) === 0) {
      const byId = new Map(night.targets.map((t) => [t.targetId, t]));
      const held = (detail.targets ?? []).map((target) =>
        byId.has(target.targetId)
          ? reworkTargetOf(byId.get(target.targetId), target.state)
          : // A target of a reused plan the frames did not take.
            { targetId: target.targetId, state: "removed" },
      );
      const heldIds = new Set(held.map((t) => t.targetId));
      const added = night.targets
        .filter((t) => !heldIds.has(t.targetId))
        .map((t) => reworkTargetOf(t, "added"));
      await rework.rework({
        tenantId,
        userId,
        sessionId,
        ifMatch: '"0"',
        body: { targets: [...held, ...added] },
        ...origin,
      });
    }
    return {
      action: "created",
      planAction,
      planId,
      sessionId,
      addedTargets: [],
      replayed,
    };
  }

  // 3. A session that already exists: the targets it does not hold.
  async function updateNight(night) {
    const detail = await detailOf(night.sessionId);
    const heldIds = new Set((detail.targets ?? []).map((t) => t.targetId));
    const toAdd = night.targets.filter((t) => !heldIds.has(t.targetId));
    if (toAdd.length) {
      await rework.rework({
        tenantId,
        userId,
        sessionId: night.sessionId,
        ifMatch: `"${Number(detail.session?.reworkRevision ?? 0)}"`,
        body: {
          targets: [
            ...(detail.targets ?? []).map((t) => ({
              targetId: t.targetId,
              state: t.state,
            })),
            ...toAdd.map((t) => reworkTargetOf(t, "added")),
          ],
        },
        ...origin,
      });
    }
    return {
      action: night.targets.length ? "updated" : "attached",
      planAction: "none",
      planId: detail.session?.planId ?? null,
      sessionId: night.sessionId,
      addedTargets: night.targets.map((t) => t.targetId),
      replayed: night.targets.length > 0 && toAdd.length === 0,
    };
  }

  const sessionResults = [];
  const sessionIdOfRef = new Map();
  const nightOfRef = new Map();
  for (const night of request.sessions) {
    nightOfRef.set(night.ref, night);
    try {
      const result = night.sessionId
        ? await updateNight(night)
        : await importNight(night);
      if (result.sessionId) sessionIdOfRef.set(night.ref, result.sessionId);
      sessionResults.push({
        ref: night.ref,
        sessionId: result.sessionId ?? null,
        planId: result.planId ?? null,
        action: result.action,
        planAction: result.planAction,
        addedTargets: result.addedTargets ?? [],
        replayed: Boolean(result.replayed),
        ...(result.reason ? { reason: result.reason } : {}),
      });
    } catch (error) {
      sessionResults.push({
        ref: night.ref,
        sessionId: null,
        planId: null,
        action: "skipped",
        planAction: "none",
        addedTargets: [],
        replayed: false,
        reason: refusalOf(error),
      });
    }
  }

  // 4. The multi-night plans, born « Terminé ».
  const multiResults = [];
  for (const group of request.multiNight) {
    const sessionIds = group.sessionRefs
      .map((night) => sessionIdOfRef.get(night))
      .filter(Boolean);
    const skipped = (reason) =>
      multiResults.push({
        ref: group.ref,
        projectId: null,
        sessionIds: [],
        action: "skipped",
        replayed: false,
        reason,
      });
    if (capabilities["planner.mosaic"] !== true) {
      skipped("capability_required");
      continue;
    }
    if (sessionIds.length < 2) {
      skipped("nights_missing");
      continue;
    }
    const projectId = derivedUuid(...derived("project", group.ref));
    try {
      // Every night is checked before anything is written (the rule of
      // `POST /v1/projects`): a night whose plan holds another target
      // (`target_mismatch`) stays out, and fewer than two left create none.
      const nights = await requireProjectNightService();
      const target = { targetId: group.targetId, name: group.designation };
      const kept = [];
      let refusal = null;
      for (const sessionId of sessionIds) {
        try {
          await nights.checkSources({
            tenantId,
            target,
            sessionIds: [sessionId],
            planIds: [],
          });
          kept.push(sessionId);
        } catch (error) {
          refusal ??= refusalOf(error);
        }
      }
      if (kept.length < 2) {
        skipped(refusal ?? "nights_missing");
        continue;
      }
      const projects = await requireProjectResourceService();
      const held = await orNull(projects.get({ tenantId, projectId }));
      if (!held) {
        const first = nightOfRef.get(group.sessionRefs[0]);
        const location = await locationOf(first?.place);
        await projects.write({
          tenantId,
          userId,
          projectId,
          ifMatch: '"0"',
          body: {
            status: "finished",
            target: {
              targetId: group.targetId,
              name: group.designation,
              ...(group.name ? { commonName: group.name } : {}),
            },
            goalMinutes: Math.min(
              6000,
              Math.max(30, Math.round(group.goalSeconds / 60)),
            ),
            place: location
              ? {
                  name: location.name,
                  latitude: location.latitude,
                  longitude: location.longitude,
                  ...(location.timeZone ? { timeZone: location.timeZone } : {}),
                }
              : { name: group.designation, latitude: 0, longitude: 0 },
            equipment: first?.equipment ?? {},
            constraints: DEFAULT_CONSTRAINTS,
          },
          originDeviceId: deviceId,
          ...origin,
        });
      }
      await nights.attach({
        tenantId,
        userId,
        projectId,
        body: { sessionIds: kept },
        ...origin,
      });
      multiResults.push({
        ref: group.ref,
        projectId,
        sessionIds: kept,
        action: "created",
        replayed: Boolean(held),
      });
    } catch (error) {
      skipped(refusalOf(error));
    }
  }

  const all = [...sessionResults, ...multiResults];
  return {
    importId,
    replayed:
      all.length > 0 &&
      // A night only attached writes nothing either time.
      all.every(
        (entry) =>
          entry.replayed ||
          entry.action === "skipped" ||
          entry.action === "attached",
      ) &&
      all.some((entry) => entry.replayed),
    places: placeResults,
    sessions: sessionResults,
    multiNight: multiResults,
  };
}
