import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import {
  assertInvalid,
  assertValid,
  hasExternalSchema,
  registerExternalSchema,
  schemaErrors,
} from "./schema-assert.mjs";

const schemasDirectory = new URL("../schemas/", import.meta.url);
const schema = async (relativePath) =>
  JSON.parse(await readFile(new URL(relativePath, schemasDirectory), "utf8"));

// Cross-file refs resolve by the exact relative reference the schemas write.
// `debrief.schema.json` reads plan and observation-session shapes; the
// event envelope delegates each payload to the event-type registry.
for (const name of ["plan", "session", "capture"])
  registerExternalSchema(
    `${name}.schema.json`,
    await schema(`api/${name}.schema.json`),
  );

// The event-type registry is written on its own branch. Until it is merged
// these refs resolve to the empty schema, so every example below is written
// to the registry's real payload shapes and passes either way;
// `registryPresent` is what the delegation test at the bottom switches on.
const registryPresent = await (async () => {
  const directory = new URL("session-events/", schemasDirectory);
  let names;
  try {
    names = await readdir(directory);
  } catch {
    return false;
  }
  let found = false;
  for (const name of names) {
    if (!name.endsWith(".schema.json")) continue;
    registerExternalSchema(
      `../session-events/${name}`,
      JSON.parse(await readFile(new URL(name, directory), "utf8")),
    );
    found = true;
  }
  return found;
})();

const planId = "9f1c0b4a-5d3e-4a21-9c7f-2b8e6d4a1c30";
const sessionId = "4d2b7e10-8a6c-4f53-9b1d-7e0a3c5f2b84";
const supplementId = "c8a4f2d6-1b93-4e07-8f52-6d1c3a9b4e70";
const captureId = "2e7d9b31-4c06-4a8f-91b3-5f8c0d2a6e47";
const versionId = "8a25c9d2-7f0b-4b3a-9c9e-2f7e6f0b1a3d";
const deviceId = "b3f6a1c8-2d47-4e90-8c15-9a3b7d0e2f61";

// The worked example of api/v1.md, section "A worked example": a real plan as
// the two planners write one — a place the night boundaries are derived from,
// an equipment selection, and items carrying the step-4 timeline's slots in a
// payload order that is deliberately NOT chronological. `m45` was added from
// the catalogue and never placed, so it carries no slot at all.
//
// The two boundaries below are what the planner's own definition yields for
// this date and place — the descending and ascending −18° solar crossings
// searched from local civil noon in `America/Toronto`, truncated to the
// second — and are treated here as a given: this file checks the mapping that
// reads them, not the ephemeris that produces them.
const nightStartAt = "2026-09-16T00:46:37.000Z";
const nightEndAt = "2026-09-16T08:52:44.000Z";

const planPayload = {
  id: "browser-plan-1",
  date: "2026-09-15",
  name: "Autumn nebulae",
  location: {
    id: "place-home",
    version: 1,
    name: "Home",
    locality: "Sainte-Julie",
    latitude: 45.5,
    longitude: -73.6,
    elevation: "40",
    timeZone: "America/Toronto",
    horizonStatus: "unverified",
  },
  equipment: {
    mode: "imaging",
    telescopeId: "askar-50p",
    mountId: "am5",
    cameraId: "asi533mc-pro",
    filterIds: ["l-extreme"],
    restrictToEquipment: false,
  },
  minAltitude: 35,
  mountSafety: { enabled: true, meridianFlip: true },
  items: [
    {
      id: "ngc7000",
      filter: "Ha",
      startMinute: 200,
      endMinute: 320,
      durationMinutes: 120,
    },
    {
      id: "m31",
      filter: "L",
      startMinute: 45,
      endMinute: 195,
      durationMinutes: 150,
    },
    { id: "m45", filter: "L" },
  ],
};

const planResource = {
  id: planId,
  revision: 4,
  status: "active",
  nightStartAt,
  nightEndAt,
  frozenAt: null,
  updatedAt: "2026-09-15T18:42:00.000Z",
  payload: planPayload,
};

// The window the PERSON declared at debriefing: it is narrower than the
// derived night, and `m31`'s planned slot starts before it. Nothing clamps
// either into the other.
const declaredSession = {
  startedAt: "2026-09-16T01:50:00.000Z",
  finishedAt: "2026-09-16T06:20:00.000Z",
};
const decidedAt = "2026-09-16T13:20:00.000Z";

const sessionResource = {
  id: sessionId,
  planId,
  status: "finished",
  startedAt: declaredSession.startedAt,
  finishedAt: declaredSession.finishedAt,
  createdAt: decidedAt,
  updatedAt: decidedAt,
  eventCount: 7,
  supplementCount: 0,
  pendingSupplementCount: 0,
};

const eventOf = (overrides = {}) => ({
  eventId: "01J8Z9QK7R4M2N6P8S0T1V3W5X",
  type: "note",
  recordedAt: "2026-09-15T22:30:00.000Z",
  payload: { text: "Transparency improving." },
  ...overrides,
});

// ---------------------------------------------------------------------------
// A reference implementation of api/v1.md's plan-to-session mapping, written
// straight from the prose so the worked example in that document is checked
// rather than asserted. It is a test fixture, not shipped code: the portal
// implements the same rules.
// ---------------------------------------------------------------------------

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// U+001F, the unit separator api/v1.md joins the two hashed parts with.
const UNIT_SEPARATOR = String.fromCharCode(0x1f);

const base32 = (value, length) => {
  let rest = BigInt(value);
  let out = "";
  for (let index = 0; index < length; index += 1) {
    out = CROCKFORD[Number(rest % 32n)] + out;
    rest /= 32n;
  }
  return out;
};

// Time part: the ANCHOR plus the emission ordinal, never `recordedAt`.
// Tail: the first 80 bits of SHA-256(sessionId U+001F eventKey).
const eventIdFor = (anchor, ordinal, eventKey) => {
  const digest = createHash("sha256")
    .update(`${sessionId}${UNIT_SEPARATOR}${eventKey}`, "utf8")
    .digest();
  let tail = 0n;
  for (let index = 0; index < 10; index += 1)
    tail = (tail << 8n) | BigInt(digest[index]);
  return base32(Date.parse(anchor) + ordinal, 10) + base32(tail, 16);
};

const slotStart = (item) =>
  Number.isFinite(item.startMinute) && item.startMinute >= 0
    ? item.startMinute
    : null;

const slotEnd = (item) => {
  const start = slotStart(item);
  if (start === null) return null;
  if (Number.isFinite(item.endMinute) && item.endMinute >= start)
    return item.endMinute;
  if (Number.isFinite(item.durationMinutes) && item.durationMinutes > 0)
    return start + item.durationMinutes;
  return start;
};

// Slot order, then payload order; every slotless item after every placed one.
const chronological = (items) =>
  items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const a = slotStart(left.item);
      const b = slotStart(right.item);
      if (a === null && b === null) return left.index - right.index;
      if (a === null) return 1;
      if (b === null) return -1;
      return (
        a - b ||
        slotEnd(left.item) - slotEnd(right.item) ||
        left.index - right.index
      );
    });

const mapPlanToSession = (plan, request, now) => {
  const { payload, revision } = plan;
  const nightAnchor = `${payload.date}T00:00:00.000Z`;
  const anchor = plan.nightStartAt ?? nightAnchor;
  const startedAt =
    request.session?.startedAt ?? plan.nightStartAt ?? nightAnchor;
  const finishedAt =
    request.session?.finishedAt ?? plan.nightEndAt ?? startedAt;
  const atMinute = (minutes) =>
    new Date(Date.parse(plan.nightStartAt) + minutes * 60000).toISOString();
  const adjustments = request.sessionAdjustments?.targets ?? [];
  const events = [];
  chronological(payload.items).forEach(({ item }, position) => {
    const adjustment = adjustments.find((entry) => entry.targetId === item.id);
    const state =
      request.outcome === "executed"
        ? "done"
        : (adjustment?.state ?? "skipped");
    const placed = plan.nightStartAt != null && slotStart(item) !== null;
    const timing = placed ? "planned" : "reconstructed";
    const targetId = item.targetId ?? item.id;
    const body = { targetId, planItemId: item.id };
    // A skipped target is stated rather than passed over: one event, at the
    // start of the slot it would have had, with the person's reason when they
    // gave one. An unticked target under `partial` is the same event with no
    // reason at all. Ordinal 3 — the offset the group already reserved.
    if (state === "skipped") {
      events.push({
        eventId: eventIdFor(
          anchor,
          4 * position + 3,
          `plan/${revision}/target/${item.id}/skipped`,
        ),
        type: "target_skipped",
        recordedAt: placed ? atMinute(slotStart(item)) : startedAt,
        timing,
        payload: {
          ...body,
          ...(adjustment?.reason ? { reason: adjustment.reason } : {}),
          ...(adjustment?.note ? { notes: adjustment.note } : {}),
        },
      });
      return;
    }
    events.push({
      eventId: eventIdFor(
        anchor,
        4 * position,
        `plan/${revision}/target/${item.id}/started`,
      ),
      type: "target_started",
      recordedAt: placed ? atMinute(slotStart(item)) : startedAt,
      timing,
      payload: body,
    });
    events.push({
      eventId: eventIdFor(
        anchor,
        4 * position + 1,
        `plan/${revision}/target/${item.id}/finished`,
      ),
      type: "target_finished",
      recordedAt: placed ? atMinute(slotEnd(item)) : finishedAt,
      timing,
      payload: body,
    });
    if ((state === "modified" || state === "partial") && adjustment?.note)
      events.push({
        eventId: eventIdFor(
          anchor,
          4 * position + 2,
          `plan/${revision}/target/${item.id}/note`,
        ),
        type: "note",
        recordedAt: now,
        timing: "observed",
        payload: { text: adjustment.note, targetId },
      });
  });
  if (request.note)
    events.push({
      eventId: eventIdFor(
        anchor,
        4 * payload.items.length,
        `plan/${revision}/note`,
      ),
      type: "note",
      recordedAt: now,
      timing: "observed",
      payload: { text: request.note },
    });
  return { session: { startedAt, finishedAt }, events };
};

// The supplement acceptance of api/v1.md, "Late field data: session
// supplements": the same pair the mapping produces, under the supplement's own
// keys and anchored on its `createdAt`, for every item of its payload that no
// `target_started` of this session already names. A `target_skipped` is not a
// `target_started`, so it neither suppresses the pair nor is withdrawn by it.
const acceptSupplement = (plan, journal, supplement) => {
  const alreadyStarted = new Set(
    journal
      .filter((event) => event.type === "target_started")
      .map((event) => event.payload.planItemId ?? event.payload.targetId),
  );
  const atMinute = (minutes) =>
    new Date(Date.parse(plan.nightStartAt) + minutes * 60000).toISOString();
  const events = [];
  chronological(supplement.payload.items).forEach(({ item }, position) => {
    if (alreadyStarted.has(item.id)) return;
    const placed = plan.nightStartAt != null && slotStart(item) !== null;
    const body = { targetId: item.targetId ?? item.id, planItemId: item.id };
    for (const [offset, suffix, type, minute] of [
      [0, "started", "target_started", slotStart(item)],
      [1, "finished", "target_finished", slotEnd(item)],
    ])
      events.push({
        eventId: eventIdFor(
          supplement.createdAt,
          4 * position + offset,
          `supplement/${supplement.id}/target/${item.id}/${suffix}`,
        ),
        type,
        recordedAt: placed ? atMinute(minute) : supplement.createdAt,
        timing: placed ? "planned" : "reconstructed",
        payload: body,
      });
  });
  return events;
};

const debriefRequest = {
  outcome: "partial",
  baseVersion: "current",
  session: declaredSession,
  sessionAdjustments: {
    targets: [
      { targetId: "m31", state: "done" },
      {
        targetId: "ngc7000",
        state: "modified",
        note: "Guiding lost after the flip, kept 40 minutes.",
      },
      { targetId: "m45", state: "skipped", reason: "weather" },
    ],
  },
  note: "Clouds rolled in around 2 a.m.",
};

test("session.schema.json accepts the create request, the create response and a resource", async () => {
  const session = await schema("api/session.schema.json");
  assertValid(session, { planId, startedAt: "2026-09-15T20:10:00.000Z" });
  assertValid(session, {
    planId: null,
    startedAt: "2026-09-15T20:10:00.000Z",
    clientSessionId: "01J8Z9QK7R4M2N6P8S0T1V3W5X",
  });
  assertValid(session, { session: sessionResource, created: true });
  assertValid(session, sessionResource);
  assertValid(session, {
    sessions: [sessionResource],
    nextSince: "2026-09-16T09:12:00.000Z",
    hasMore: false,
  });
  assertValid(session, {});
  assertValid(session, { finishedAt: "2026-09-16T04:05:00.000Z" });
});

test("session.schema.json rejects a client-sent tenant, an unknown status and a non-UUID plan", async () => {
  const session = await schema("api/session.schema.json");
  assertInvalid(session, {
    planId,
    startedAt: "2026-09-15T20:10:00.000Z",
    tenantId: "tenant-1",
  });
  assertInvalid(session, { ...sessionResource, status: "closed" });
  assertInvalid(session, { startedAt: "not-a-timestamp" });
  // A session resource without its server clocks is not a session resource.
  assertInvalid(session, { id: sessionId, planId, status: "open" });
});

// Several plans in one execution. The
// sessions launched together share `executionId`; each says its `piloting`.
// Both are optional, so a session of a single plan is unchanged.
test("session.schema.json carries the execution and the piloting of a session", async () => {
  const session = await schema("api/session.schema.json");
  const executionId = "01J8Z9QK7R4M2N6P8S0T1V3R52";
  assertValid(session, {
    planId,
    startedAt: "2026-10-14T20:00:00.000Z",
    executionId,
    piloting: "assisted",
  });
  for (const piloting of ["mount", "smart_telescope", "assisted", "free"])
    assertValid(session, { ...sessionResource, executionId, piloting });
  assertValid(session, {
    ...sessionResource,
    executionId: null,
    piloting: null,
  });
  assertValid(session, sessionResource);
  assertInvalid(session, {
    planId,
    startedAt: "2026-10-14T20:00:00.000Z",
    piloting: "two_phones",
  });
  assertInvalid(session, { ...sessionResource, executionId: "execution-1" });
});

// The mode of a night changed in « Nuit en cours ».
// `PATCH /v1/sessions/{id}` takes one of the four values and nothing else.
test("session.schema.json carries the piloting request of a session", async () => {
  const session = await schema("api/session.schema.json");
  for (const piloting of ["mount", "smart_telescope", "assisted", "free"])
    assertValid(session, { piloting });
  assertInvalid(session, { piloting: "two_phones" });
  assertInvalid(session, { piloting: null });
  assertInvalid(session, { piloting: "free", executionId: "x" });
});

// How the night was closed. Optional on the
// finish request and on the resource, so a session that never said is unchanged.
test("session.schema.json carries how a night was closed", async () => {
  const session = await schema("api/session.schema.json");
  for (const closedBy of ["automatic", "manual"]) {
    assertValid(session, { ...sessionResource, closedBy });
    assertValid(session, { finishedAt: "2026-10-14T05:51:00.000Z", closedBy });
  }
  assertValid(session, { ...sessionResource, closedBy: null });
  assertValid(session, { finishedAt: "2026-10-14T05:51:00.000Z" });
  assertValid(session, sessionResource);
  assertInvalid(session, { ...sessionResource, closedBy: "by_hand" });
  assertInvalid(session, {
    finishedAt: "2026-10-14T05:51:00.000Z",
    closedBy: "",
  });
});

test("session.schema.json accepts a proposed supplement and both decisions", async () => {
  const session = await schema("api/session.schema.json");
  const supplement = {
    id: supplementId,
    sessionId,
    planId,
    status: "proposed",
    payload: planPayload,
    originDeviceId: deviceId,
    deviceLabel: "Field phone",
    createdAt: "2026-09-16T09:12:00.000Z",
    decidedAt: null,
    eventIds: [],
  };
  assertValid(session, supplement);
  assertValid(session, { decision: "accept" });
  assertValid(session, { decision: "dismiss" });
  assertValid(session, {
    supplement: {
      ...supplement,
      status: "accepted",
      decidedAt: "2026-09-16T10:00:00.000Z",
      eventIds: ["01J8Z9QK7R4M2N6P8S0T1V3W5X"],
    },
    eventsCreated: 1,
    replayed: false,
  });
  // The replay of the same decision creates nothing and is not an error.
  assertValid(session, {
    supplement: {
      ...supplement,
      status: "accepted",
      decidedAt: "2026-09-16T10:00:00.000Z",
      eventIds: ["01J8Z9QK7R4M2N6P8S0T1V3W5X"],
    },
    eventsCreated: 0,
    replayed: true,
  });
});

test("session.schema.json rejects an unknown supplement status or decision", async () => {
  const session = await schema("api/session.schema.json");
  assertInvalid(session, { decision: "accept-later" });
  assertInvalid(session, {
    id: supplementId,
    sessionId,
    status: "merged",
    payload: {},
    createdAt: "2026-09-16T09:12:00.000Z",
  });
});

test("session-event-ingest.schema.json accepts a batch and the shapes of every registry type", async () => {
  const ingest = await schema("api/session-event-ingest.schema.json");
  assertValid(ingest, { events: [eventOf()] });
  assertValid(ingest, {
    events: [
      eventOf({
        type: "target_started",
        payload: { targetId: "m31", planItemId: "m31" },
      }),
      eventOf({
        eventId: "01J8Z9QK7R4M2N6P8S0T1V3W5Y",
        type: "target_finished",
        payload: { targetId: "m31", planItemId: "m31" },
      }),
      eventOf({
        eventId: "01J8Z9QK7R4M2N6P8S0T1V3W5Z",
        type: "target_skipped",
        payload: { targetId: "m45", planItemId: "m45", reason: "weather" },
      }),
      eventOf({
        eventId: "01J8Z9QK7R4M2N6P8S0T1V3W60",
        type: "pause",
        payload: { reason: "Meridian flip" },
      }),
      eventOf({
        eventId: "01J8Z9QK7R4M2N6P8S0T1V3W61",
        type: "resume",
        payload: {},
      }),
      eventOf({
        eventId: "01J8Z9QK7R4M2N6P8S0T1V3W62",
        type: "condition",
        payload: { sky: "mostly_clear", seeing: 3 },
      }),
      eventOf({
        eventId: "01J8Z9QK7R4M2N6P8S0T1V3W63",
        type: "equipment_issue",
        payload: { description: "Dew on the corrector.", severity: "minor" },
      }),
    ],
  });
});

test("session-event-ingest.schema.json refuses an unknown type, a non-ULID id and an oversized batch", async () => {
  const ingest = await schema("api/session-event-ingest.schema.json");
  assertInvalid(ingest, { events: [eventOf({ type: "target_aborted" })] });
  // Crockford base32 excludes I, L, O and U; a UUID is not an event id.
  assertInvalid(ingest, { events: [eventOf({ eventId: sessionId })] });
  assertInvalid(ingest, {
    events: [eventOf({ eventId: "01J8Z9QK7R4M2N6P8S0T1V3WIL" })],
  });
  assertInvalid(ingest, { events: [] });
  assertInvalid(ingest, {
    events: Array.from({ length: 501 }, () => eventOf()),
  });
  // A client never states the origin device: it is derived from the credential.
  assertInvalid(ingest, {
    events: [eventOf({ originDeviceId: deviceId })],
  });
});

test("session-event-ingest.schema.json accounts for every event of a replayed batch", async () => {
  const ingest = await schema("api/session-event-ingest.schema.json");
  const first = {
    sessionId,
    receivedAt: "2026-09-16T09:12:00.000Z",
    accepted: ["01J8Z9QK7R4M2N6P8S0T1V3W5X", "01J8Z9QK7R4M2N6P8S0T1V3W5Y"],
    duplicate: [],
    rejected: [],
    counts: { accepted: 2, duplicate: 0, rejected: 0 },
    clockSkewMs: -1200,
    sessionStatus: "open",
    sessionUpdatedAt: "2026-09-16T09:12:00.000Z",
  };
  assertValid(ingest, first);
  // The same batch sent again: one copy, nothing rejected, nothing lost.
  const replay = {
    ...first,
    receivedAt: "2026-09-16T09:14:00.000Z",
    accepted: [],
    duplicate: first.accepted,
    counts: { accepted: 0, duplicate: 2, rejected: 0 },
  };
  assertValid(ingest, replay);
  assert.equal(
    replay.accepted.length + replay.duplicate.length + replay.rejected.length,
    first.counts.accepted,
  );
  // A poisoned event is reported on its own; the rest of the batch is kept.
  assertValid(ingest, {
    sessionId,
    receivedAt: "2026-09-16T09:12:00.000Z",
    accepted: ["01J8Z9QK7R4M2N6P8S0T1V3W5X"],
    duplicate: [],
    rejected: [
      {
        eventId: "01J8Z9QK7R4M2N6P8S0T1V3W5Y",
        code: "unknown_event_type",
        message: "This event type is not in the registry.",
      },
    ],
    counts: { accepted: 1, duplicate: 0, rejected: 1 },
  });
});

test("session-event-ingest.schema.json rejects an unlisted rejection reason and an unaccounted response", async () => {
  const ingest = await schema("api/session-event-ingest.schema.json");
  assertInvalid(ingest, {
    sessionId,
    receivedAt: "2026-09-16T09:12:00.000Z",
    accepted: [],
    duplicate: [],
    rejected: [
      {
        eventId: "01J8Z9QK7R4M2N6P8S0T1V3W5Y",
        code: "because_i_said_so",
        message: "No.",
      },
    ],
    counts: { accepted: 0, duplicate: 0, rejected: 1 },
  });
  assertInvalid(ingest, {
    sessionId,
    receivedAt: "2026-09-16T09:12:00.000Z",
    accepted: [],
    duplicate: [],
    rejected: [],
  });
});

test("session-event-ingest.schema.json accepts a stored event and a page of them", async () => {
  const ingest = await schema("api/session-event-ingest.schema.json");
  const stored = {
    eventId: "01J8Z9QK7R4M2N6P8S0T1V3W5X",
    sessionId,
    type: "condition",
    recordedAt: "2026-09-15T22:30:00.000Z",
    receivedAt: "2026-09-16T09:12:00.000Z",
    originDeviceId: deviceId,
    payload: { seeing: 4, notes: "Steady." },
  };
  assertValid(ingest, stored);
  assertValid(ingest, {
    sessionId,
    events: [stored, { ...stored, originDeviceId: null }],
    nextSince: "2026-09-16T09:12:00.000Z",
    hasMore: false,
  });
  // A stored event always carries both clocks and an explicit origin.
  assertInvalid(ingest, { ...stored, receivedAt: undefined });
});

test("debrief.schema.json accepts a queue entry with one stale device and no divergence", async () => {
  const debrief = await schema("api/debrief.schema.json");
  assertValid(debrief, {
    generatedAt: "2026-09-16T09:00:00.000Z",
    entries: [
      {
        planId,
        nightEndAt,
        plan: planResource,
        setAsideVersionId: null,
        staleDevices: [
          {
            deviceId,
            label: "Field phone",
            lastSyncAt: "2026-09-15T18:42:00.000Z",
          },
        ],
        sessionId: null,
        openSession: null,
      },
    ],
  });
  // A device that never synchronized at all is stale too.
  assertValid(debrief, {
    generatedAt: "2026-09-16T09:00:00.000Z",
    entries: [
      {
        planId,
        nightEndAt,
        plan: planResource,
        staleDevices: [{ label: "Field phone", lastSyncAt: null }],
      },
    ],
  });
  // An empty queue is the normal state and is not an error.
  assertValid(debrief, {
    generatedAt: "2026-09-16T09:00:00.000Z",
    entries: [],
  });
});

test("debrief.schema.json carries both versions, field first, when one was set aside", async () => {
  const debrief = await schema("api/debrief.schema.json");
  const entry = {
    planId,
    nightEndAt,
    plan: planResource,
    setAsideVersionId: versionId,
    versions: [
      {
        base: "set_aside",
        origin: "field",
        versionId,
        revision: 4,
        createdAt: "2026-09-16T02:10:00.000Z",
        deviceLabel: "Field phone",
        payload: {
          ...planPayload,
          items: [{ id: "ngc7000", filter: "Ha" }],
        },
      },
      {
        base: "current",
        origin: "web",
        versionId: null,
        revision: 4,
        createdAt: "2026-09-15T18:42:00.000Z",
        deviceLabel: null,
        payload: planPayload,
      },
    ],
    staleDevices: [],
    sessionId: null,
    openSession: null,
  };
  assertValid(debrief, {
    generatedAt: "2026-09-16T09:00:00.000Z",
    entries: [entry],
  });
  assert.equal(entry.versions[0].origin, "field");
  assert.equal(entry.versions[0].base, "set_aside");
  // Exactly two readings, never a merge assistant and never a third copy.
  assertInvalid(debrief, {
    generatedAt: "2026-09-16T09:00:00.000Z",
    entries: [{ ...entry, versions: [entry.versions[0]] }],
  });
  assertInvalid(debrief, {
    generatedAt: "2026-09-16T09:00:00.000Z",
    entries: [
      {
        ...entry,
        versions: [...entry.versions, { ...entry.versions[1], revision: 3 }],
      },
    ],
  });
});

test("debrief.schema.json marks an entry whose session is still open on a device", async () => {
  const debrief = await schema("api/debrief.schema.json");
  assertValid(debrief, {
    generatedAt: "2026-09-16T09:00:00.000Z",
    entries: [
      {
        planId,
        nightEndAt,
        plan: planResource,
        staleDevices: [],
        sessionId,
        openSession: { sessionId, status: "paused" },
      },
    ],
  });
  // `finished` is not an open session; it never suppresses the prompt.
  assertInvalid(debrief, {
    generatedAt: "2026-09-16T09:00:00.000Z",
    entries: [
      {
        planId,
        nightEndAt,
        plan: planResource,
        staleDevices: [],
        openSession: { sessionId, status: "finished" },
      },
    ],
  });
});

test("debrief.schema.json accepts the three outcomes and a partial adjustment set", async () => {
  const debrief = await schema("api/debrief.schema.json");
  assertValid(debrief, { outcome: "executed" });
  assertValid(debrief, { outcome: "abandoned" });
  assertValid(debrief, {
    outcome: "partial",
    baseVersion: "set_aside",
    setAsideVersionId: versionId,
    session: {
      startedAt: "2026-09-15T20:10:00.000Z",
      finishedAt: "2026-09-16T04:05:00.000Z",
    },
    sessionAdjustments: {
      targets: [
        { targetId: "m31", state: "done" },
        { targetId: "ngc7000", state: "skipped" },
      ],
    },
    note: "Clouds rolled in around 2 a.m.",
  });
  assertValid(debrief, {
    outcome: "partial",
    baseVersion: "current",
    sessionAdjustments: {
      targets: [{ targetId: "m31", state: "modified", note: "Refocused." }],
    },
  });
});

test("debrief.schema.json takes an optional reason and note for a skipped target", async () => {
  const debrief = await schema("api/debrief.schema.json");
  const skip = (extra) => ({
    outcome: "partial",
    baseVersion: "current",
    sessionAdjustments: {
      targets: [{ targetId: "ngc7000", state: "skipped", ...extra }],
    },
  });
  // Both optional: a skip with nothing said is the commonest answer of all.
  assertValid(debrief, skip({}));
  for (const reason of ["weather", "equipment", "time", "visibility", "other"])
    assertValid(debrief, skip({ reason }));
  assertValid(debrief, skip({ reason: "time", note: "Ran out of night." }));
  // The journal's own field name is not this one: the adjustment says `note`
  // and the mapping puts it in the registry's `notes`.
  assertInvalid(debrief, skip({ notes: "Ran out of night." }));
  // The same closed list as the registry's target_skipped payload.
  assertInvalid(debrief, skip({ reason: "clouds" }));
  assertInvalid(debrief, skip({ reason: "moon" }));
  const registry = await schema("session-events/target-skipped.schema.json");
  assert.deepEqual(
    debrief.$defs.skipReason.enum,
    registry.properties.reason.enum,
    "the debrief's reason list drifted from the registry's",
  );
  // A skipped target's note becomes the registry's `notes`, bounded at 300 —
  // not the 500 a `modified` target's own note event may use.
  assertValid(debrief, skip({ note: "x".repeat(300) }));
  assertInvalid(debrief, skip({ note: "x".repeat(301) }));
  assertValid(debrief, {
    outcome: "partial",
    baseVersion: "current",
    sessionAdjustments: {
      targets: [
        { targetId: "m31", state: "modified", note: "x".repeat(500) },
        { targetId: "ngc7000", state: "done" },
      ],
    },
  });
  assertInvalid(debrief, {
    outcome: "partial",
    sessionAdjustments: {
      targets: [{ targetId: "m31", state: "modified", note: "x".repeat(501) }],
    },
  });
});

test("debrief.schema.json rejects an unknown outcome, base version or target state", async () => {
  const debrief = await schema("api/debrief.schema.json");
  assertInvalid(debrief, { outcome: "mostly" });
  assertInvalid(debrief, { outcome: "executed", baseVersion: "field" });
  assertInvalid(debrief, {
    outcome: "partial",
    sessionAdjustments: {
      targets: [{ targetId: "m31", state: "half-done" }],
    },
  });
  assertInvalid(debrief, {
    outcome: "partial",
    sessionAdjustments: { targets: [{ state: "done" }] },
  });
  // The registry's target_finished carries no verdict and its target payloads
  // carry no filter, so the debriefing has no filter to adjust either.
  assertInvalid(debrief, {
    outcome: "partial",
    sessionAdjustments: {
      targets: [{ targetId: "m31", state: "modified", filter: "Ha" }],
    },
  });
});

test("debrief.schema.json makes a replayed debriefing observable and empty", async () => {
  const debrief = await schema("api/debrief.schema.json");
  const frozenPlan = {
    ...planResource,
    status: "partial",
    frozenAt: "2026-09-16T09:20:00.000Z",
    revision: 5,
  };
  const first = {
    plan: frozenPlan,
    session: sessionResource,
    outcome: "partial",
    decidedAt: "2026-09-16T09:20:00.000Z",
    createdSession: true,
    eventsCreated: 3,
    replayed: false,
  };
  assertValid(debrief, first);
  // The second call: same plan, same session, nothing created.
  const replay = {
    ...first,
    createdSession: false,
    eventsCreated: 0,
    replayed: true,
  };
  assertValid(debrief, replay);
  assert.equal(replay.session.id, first.session.id);
  assert.equal(replay.decidedAt, first.decidedAt);
  // `abandoned` is the one outcome that may carry no session at all.
  assertValid(debrief, {
    ...first,
    plan: { ...frozenPlan, status: "abandoned" },
    outcome: "abandoned",
    session: null,
    createdSession: false,
    eventsCreated: 0,
  });
  assertInvalid(debrief, { ...first, replayed: undefined });
});

test("plan.schema.json names the supplement a frozen-plan write was stored as", async () => {
  const plan = await schema("api/plan.schema.json");
  // The stale write is unchanged: the submission becomes a set_aside
  // version and the response names it.
  assertValid(plan, {
    error: { code: "plan_conflict", message: "The plan changed elsewhere." },
    serverRevision: 5,
    serverPayload: planPayload,
    versionId,
  });
  // The same write against a FROZEN plan that already has a session becomes
  // a proposed supplement instead. Nothing is discarded.
  assertValid(plan, {
    error: { code: "plan_frozen", message: "This plan was already debriefed." },
    serverRevision: 5,
    serverPayload: planPayload,
    supplementId,
    sessionId,
  });
  // A frozen plan with no session keeps the bare body: still additive.
  assertValid(plan, {
    error: {
      code: "plan_frozen",
      message: "This non-active plan is read-only.",
    },
    serverRevision: 5,
    serverPayload: planPayload,
  });
  assertInvalid(plan, {
    error: { code: "plan_frozen", message: "This plan was already debriefed." },
    serverRevision: 5,
    serverPayload: planPayload,
    supplementId: 42,
  });
  // The conflict body stays closed: a supplement is named, never inlined
  // under an invented key.
  assertInvalid(plan, {
    error: { code: "plan_frozen", message: "This plan was already debriefed." },
    serverRevision: 5,
    serverPayload: planPayload,
    supplement: { id: supplementId },
  });
});

test("plan.schema.json accepts the additive version origin used by the debrief queue", async () => {
  // Reached through the same cross-file reference `debrief.schema.json` uses.
  const planVersion = { $ref: "plan.schema.json#/$defs/version" };
  const version = {
    versionId,
    revision: 4,
    state: "set_aside",
    createdAt: "2026-09-16T02:10:00.000Z",
    purgeAfter: "2026-12-15T02:10:00.000Z",
    payload: planPayload,
  };
  // An earlier producer omits both new fields and still validates.
  assertValid(planVersion, version);
  assertValid(planVersion, {
    ...version,
    origin: "field",
    deviceLabel: "Field phone",
  });
  assertValid(planVersion, { ...version, origin: "web", deviceLabel: null });
  assertInvalid(planVersion, { ...version, origin: "desktop" });
});

test("capture.schema.json accepts an upload, its replay and the My Captures list", async () => {
  const capture = await schema("api/capture.schema.json");
  const sha256 =
    "3b1f0d6c9a8e4725d0c1b2a39f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c";
  const metadata = {
    sessionId,
    planId,
    targetIds: ["m31"],
    originalName: "m31-final.jpg",
    sha256,
    byteSize: 4194304,
    contentType: "image/jpeg",
  };
  assertValid(capture, metadata);
  // The tolerated singular alias, still accepted on its own.
  const { targetIds: _targetIds, ...metadataWithoutTargetIds } = metadata;
  assertValid(capture, { ...metadataWithoutTargetIds, targetId: "m31" });
  // Both together: the server unions them; the schema only requires each
  // shape to be independently well-formed.
  assertValid(capture, { ...metadata, targetId: "ngc224" });
  const record = {
    id: captureId,
    sessionId,
    planId,
    targetIds: ["m31"],
    originalName: "m31-final.jpg",
    sha256,
    byteSize: 4194304,
    status: "uploaded",
    visibility: "private",
    contentType: "image/jpeg",
    createdAt: "2026-09-16T11:00:00.000Z",
  };
  assertValid(capture, {
    capture: record,
    deduplicated: false,
    storage: {
      usedBytes: 4194304,
      quotaBytes: 5368709120,
      maxFileBytes: 52428800,
    },
  });
  // The same bytes sent again with one more target: one capture, two
  // targets, and the response says one was added.
  const withSecondTarget = { ...record, targetIds: ["m31", "ngc224"] };
  assertValid(capture, {
    capture: withSecondTarget,
    deduplicated: true,
    targetsAdded: 1,
  });
  // Sent again unchanged: nothing was added.
  assertValid(capture, {
    capture: withSecondTarget,
    deduplicated: true,
    targetsAdded: 0,
  });
  assertValid(capture, {
    captures: [withSecondTarget],
    nextSince: "2026-09-16T11:00:00.000Z",
    hasMore: false,
    storage: {
      usedBytes: 4194304,
      quotaBytes: 5368709120,
      maxFileBytes: 52428800,
    },
  });
  assertValid(capture, { captures: [] });
});

test("capture.schema.json rejects an unknown visibility, a bad digest, a zero-byte file and a singular targetId on the resource", async () => {
  const capture = await schema("api/capture.schema.json");
  const sha256 =
    "3b1f0d6c9a8e4725d0c1b2a39f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c";
  const record = {
    id: captureId,
    sessionId: null,
    planId: null,
    targetIds: [],
    originalName: "m31-final.jpg",
    sha256,
    byteSize: 4194304,
    status: "uploaded",
    visibility: "private",
    createdAt: "2026-09-16T11:00:00.000Z",
  };
  assertValid(capture, record);
  assertInvalid(capture, { ...record, visibility: "unlisted" });
  assertInvalid(capture, { ...record, status: "published" });
  assertInvalid(capture, { ...record, sha256: sha256.toUpperCase() });
  assertInvalid(capture, { ...record, sha256: `sha256:${sha256}` });
  assertInvalid(capture, { ...record, byteSize: 0 });
  // A capture never carries a URL a stranger could follow.
  assertInvalid(capture, {
    ...record,
    url: "https://example.invalid/m31-final.jpg",
  });
  // The resource never carries the retired singular field.
  assertInvalid(capture, { ...record, targetId: "m31" });
  // More than sixteen targets, or a duplicate, is not a valid capture.
  assertInvalid(capture, {
    ...record,
    targetIds: Array.from({ length: 17 }, (_, index) => `t${index}`),
  });
  assertInvalid(capture, { ...record, targetIds: ["m31", "m31"] });
});

test("capture.schema.json states the capability refusal a zero quota produces", async () => {
  const capture = await schema("api/capture.schema.json");
  // The open-source / free profile: quota zero means none, not unlimited.
  assertValid(capture, {
    error: {
      code: "storage_quota_reached",
      message: "Hosted media storage is not available for this account.",
    },
    storage: { usedBytes: 0, quotaBytes: 0, maxFileBytes: 0 },
  });
  assertValid(capture, {
    error: {
      code: "file_too_large",
      message: "This file exceeds the per-file limit.",
    },
    storage: {
      usedBytes: 1024,
      quotaBytes: 5368709120,
      maxFileBytes: 52428800,
    },
  });
  // The refusal never names an offer, a tier or a product.
  assertInvalid(capture, {
    error: { code: "upgrade_required", message: "Subscribe to upload." },
  });
});

test("capture.schema.json states the refusal of a fourth capture and the two counts of the storage object", async () => {
  const capture = await schema("api/capture.schema.json");
  assertValid(capture, {
    error: {
      code: "capture_limit_reached",
      message: "This space holds as many captures as its profile allows.",
    },
    storage: {
      usedBytes: 3145728,
      quotaBytes: 78643200,
      maxFileBytes: 26214400,
      captureCount: 3,
      captureCountLimit: 3,
    },
  });
  // The two counts are additive: an earlier answer without them still validates.
  assertValid(capture, {
    error: { code: "capture_limit_reached", message: "Full." },
    storage: { usedBytes: 0, quotaBytes: 0, maxFileBytes: 0 },
  });
  // The unlimited sentinel is an integer like the others.
  assertValid(capture, {
    error: { code: "capture_limit_reached", message: "Full." },
    storage: {
      usedBytes: 0,
      quotaBytes: 0,
      maxFileBytes: 0,
      captureCount: 5,
      captureCountLimit: Number.MAX_SAFE_INTEGER,
    },
  });
  assertInvalid(capture, {
    error: { code: "capture_limit_reached", message: "Full." },
    storage: {
      usedBytes: 0,
      quotaBytes: 0,
      maxFileBytes: 0,
      captureCount: -1,
      captureCountLimit: 3,
    },
  });
  assertInvalid(capture, {
    error: { code: "capture_public_unavailable", message: "No." },
    storage: { usedBytes: 0, quotaBytes: 0, maxFileBytes: 0 },
  });
});

test("capture.schema.json accepts the resumable protocol's create/PUT/GET envelope", async () => {
  const capture = await schema("api/capture.schema.json");
  const uploadId = "8a25c9d2-7f0b-4b3a-9c9e-2f7e6f0b1a3d";
  // A brand new, in-progress session: no captureId yet, an expiry that
  // matters.
  assertValid(capture, {
    uploadId,
    offset: 0,
    byteSize: 4194304,
    chunkSize: 8388608,
    completed: false,
    expiresAt: "2026-09-23T20:00:00.000Z",
  });
  // Mid-transfer, after one PUT.
  assertValid(capture, {
    uploadId,
    offset: 2097152,
    byteSize: 4194304,
    chunkSize: 8388608,
    completed: false,
    expiresAt: "2026-09-23T20:00:00.000Z",
  });
  // Already a finalized capture (the create step's own idempotent replay,
  // or GET after finalize): `completed: true`, a `captureId`, and
  // `expiresAt: null` — a completed session is not subject to the 72-hour
  // expiry.
  assertValid(capture, {
    uploadId,
    offset: 4194304,
    byteSize: 4194304,
    chunkSize: 8388608,
    completed: true,
    expiresAt: null,
    captureId,
  });
  // The bare envelope never carries the finalize response's own fields.
  assertInvalid(capture, {
    uploadId,
    offset: 0,
    byteSize: 4194304,
    chunkSize: 8388608,
    completed: false,
    capture: { id: captureId },
  });
  // `completed: true` with no `expiresAt` field at all is still a
  // recognizably malformed instance under THIS branch's own strictness
  // only in that `expiresAt`, if present, must be `null` once completed —
  // but omitting it entirely is fine, since it was never required.
  assertValid(capture, {
    uploadId,
    offset: 4194304,
    byteSize: 4194304,
    chunkSize: 8388608,
    completed: true,
    captureId,
  });
});

test("capture.schema.json accepts finalize's response and rejects the errors the resumable protocol adds", async () => {
  const capture = await schema("api/capture.schema.json");
  const uploadId = "8a25c9d2-7f0b-4b3a-9c9e-2f7e6f0b1a3d";
  const sha256 =
    "3b1f0d6c9a8e4725d0c1b2a39f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c";
  const record = {
    id: captureId,
    sessionId: null,
    planId: null,
    targetIds: [],
    originalName: "m31-final.jpg",
    sha256,
    byteSize: 4194304,
    status: "uploaded",
    visibility: "private",
    createdAt: "2026-09-16T11:00:00.000Z",
  };
  assertValid(capture, {
    uploadId,
    offset: 4194304,
    byteSize: 4194304,
    chunkSize: 8388608,
    completed: true,
    expiresAt: null,
    captureId,
    capture: record,
    deduplicated: false,
  });
  // Finalizing bytes that were already a capture (the resumable create step
  // deduplicated onto an existing one, targets unioned).
  assertValid(capture, {
    uploadId,
    offset: 4194304,
    byteSize: 4194304,
    chunkSize: 8388608,
    completed: true,
    expiresAt: null,
    captureId,
    capture: { ...record, targetIds: ["m31"] },
    deduplicated: true,
    targetsAdded: 1,
  });
  // finalize never answers `completed: false` — that is what `PUT`/`GET`
  // are for.
  assertInvalid(capture, {
    uploadId,
    offset: 4194304,
    byteSize: 4194304,
    chunkSize: 8388608,
    completed: false,
    captureId,
    capture: record,
    deduplicated: false,
  });

  // The resumable protocol's own structured refusals.
  assertValid(capture, {
    error: {
      code: "upload_offset_mismatch",
      message:
        "This chunk's Upload-Offset does not match the upload's current offset.",
    },
    offset: 2097152,
  });
  assertValid(capture, {
    error: {
      code: "upload_hash_mismatch",
      message: "The assembled bytes do not hash to the declared sha256.",
    },
    offset: 0,
  });
  assertValid(capture, {
    error: {
      code: "upload_incomplete",
      message: "This upload has not yet received all of its declared bytes.",
    },
    offset: 2097152,
  });
  // `upload_not_found` never carries an offset — there is no session left
  // to report one for.
  assertValid(capture, {
    error: { code: "upload_not_found", message: "The upload was not found." },
  });
  // Distinct from the capability refusal's own codes: neither vocabulary
  // accepts the other's.
  assertInvalid(capture, {
    error: {
      code: "storage_quota_reached",
      message: "Hosted media storage is not available for this account.",
    },
    offset: 0,
  });
  assertInvalid(capture, {
    error: { code: "upload_offset_mismatch", message: "…" },
    storage: { usedBytes: 0, quotaBytes: 0, maxFileBytes: 0 },
  });
});

test("the event registry is delegated by kebab-case file, one branch per type", async () => {
  const ingest = await schema("api/session-event-ingest.schema.json");
  const dispatch = ingest.$defs.eventPayloadByType.oneOf;
  assert.equal(dispatch.length, 31); // The four kinds detected by Astro Sync, the fifteen pointing-device kinds, plan_edited, device_instrument, guided_evening
  for (const branch of dispatch) {
    // Registry types are snake_case; registry FILES are kebab-case.
    assert.equal(
      branch.properties.payload.$ref,
      `../session-events/${branch.properties.type.const.replaceAll("_", "-")}.schema.json`,
    );
  }
  assert.deepEqual(
    dispatch.map((branch) => branch.properties.type.const).sort(),
    ingest.$defs.eventType.enum.slice().sort(),
  );
  // The submitted event is pinned to the registry's own envelope as well as
  // to this contract's restatement of it, so the two cannot drift apart.
  assert.deepEqual(
    ingest.$defs.submittedEvent.allOf.map((branch) => branch.$ref),
    [
      "../session-events/event-envelope.schema.json",
      "#/$defs/submittedEnvelope",
      "#/$defs/eventPayloadByType",
    ],
  );
  // And the two type lists are the same list, in the same order: a type added
  // to one file and forgotten in the other would silently become a submitted
  // event nothing could store, so it fails here instead.
  const envelope = await schema("session-events/event-envelope.schema.json");
  assert.deepEqual(
    ingest.$defs.eventType.enum,
    envelope.properties.type.enum,
    "session-event-ingest and the registry envelope list different types",
  );
  assert.ok(ingest.$defs.eventType.enum.includes("target_skipped"));
});

test("a foreign event payload is refused as soon as the registry is merged", async () => {
  const ingest = await schema("api/session-event-ingest.schema.json");
  const nonsense = {
    events: [eventOf({ payload: { this: "is not a note payload" } })],
  };
  if (registryPresent) {
    assert.ok(hasExternalSchema("../session-events/note.schema.json"));
    assertInvalid(ingest, nonsense);
  } else {
    // Unmerged: the delegated payload is simply unconstrained here, and every
    // example in this file is already written to the registry's real shapes.
    assert.ok(!hasExternalSchema("../session-events/note.schema.json"));
    assertValid(ingest, nonsense);
  }
});

test("plan.schema.json accepts a real plan payload: slots, place and equipment", async () => {
  const plan = await schema("api/plan.schema.json");
  assertValid(plan, planResource);
  assertValid(plan, { payload: planPayload });
  // The minimal item and a plan with no place at all stay valid: the
  // slots are described, never required.
  assertValid(plan, {
    payload: {
      id: "browser-plan-1",
      date: "2026-09-15",
      name: "Autumn nebulae",
      items: [{ id: "m31", filter: "L" }],
    },
  });
  // A zero-length slot is a real value a catalogue-sourced add produces.
  assertValid(plan, {
    payload: {
      ...planPayload,
      items: [{ id: "m45", startMinute: 0, endMinute: 0, durationMinutes: 0 }],
    },
  });
  assertInvalid(plan, {
    payload: { ...planPayload, items: [{ id: "m31", startMinute: -5 }] },
  });
  assertInvalid(plan, {
    payload: { ...planPayload, items: [{ id: "m31", startMinute: "45" }] },
  });
});

test("plan.schema.json adds nightStartAt without breaking an earlier resource", async () => {
  const plan = await schema("api/plan.schema.json");
  // A portal predating the derivation omits both and still validates.
  const { nightStartAt: _unused, ...phaseFour } = planResource;
  assertValid(plan, { ...phaseFour, nightEndAt: null });
  // Both null together is how "the night could not be derived" is stated.
  assertValid(plan, {
    ...planResource,
    nightStartAt: null,
    nightEndAt: null,
  });
  assertInvalid(plan, { ...planResource, nightStartAt: "the evening" });
  assertInvalid(plan, { ...planResource, nightStartAt: 1789519597000 });
});

test("the plan-to-session mapping reproduces the worked example of v1.md", () => {
  const { session, events } = mapPlanToSession(
    planResource,
    debriefRequest,
    decidedAt,
  );
  // The person's declared window is the session's; nothing widens it to the
  // derived night and nothing narrows the night to it.
  assert.deepEqual(session, declaredSession);
  assert.equal(events.length, sessionResource.eventCount);
  assert.deepEqual(
    events.map((event) => [
      event.eventId,
      event.type,
      event.recordedAt,
      event.timing,
    ]),
    [
      [
        "01M2KTW3E8Y14VK0GHW4D4X5FK",
        "target_started",
        "2026-09-16T01:31:37.000Z",
        "planned",
      ],
      [
        "01M2KTW3E9WA4FM883DWFG7T4P",
        "target_finished",
        "2026-09-16T04:01:37.000Z",
        "planned",
      ],
      [
        "01M2KTW3ECC6Q61KMJCECWEY4T",
        "target_started",
        "2026-09-16T04:06:37.000Z",
        "planned",
      ],
      [
        "01M2KTW3EDTEEYHQ9KZKFK9SWJ",
        "target_finished",
        "2026-09-16T06:06:37.000Z",
        "planned",
      ],
      ["01M2KTW3EESN9NT3BEWM2DP6W9", "note", decidedAt, "observed"],
      [
        "01M2KTW3EKBG7YHZEY4VGAJGZG",
        "target_skipped",
        declaredSession.startedAt,
        "reconstructed",
      ],
      ["01M2KTW3EMT4EB3V04ZNDNCRSV", "note", decidedAt, "observed"],
    ],
  );
  // Chronological, not payload order: `m31` (minute 45) precedes `ngc7000`
  // (minute 200) although the payload lists `ngc7000` first.
  assert.deepEqual(
    events
      .filter((event) => event.type === "target_started")
      .map((event) => event.payload.targetId),
    ["m31", "ngc7000"],
  );
  // The slotless `m45` was skipped for the weather, and the journal says so
  // instead of staying silent about it.
  assert.deepEqual(events[5].payload, {
    targetId: "m45",
    planItemId: "m45",
    reason: "weather",
  });
  // `m31` was planned 18 minutes before the person says their night began,
  // and the mapping neither clamps it nor drops it.
  assert.ok(Date.parse(events[0].recordedAt) < Date.parse(session.startedAt));
});

test("a skipped target is recorded, with its reason, its slot or its fallback", () => {
  const skipOf = (result) =>
    result.events.find((event) => event.type === "target_skipped");

  // A skipped target with a slot takes the START of that slot and is
  // `planned`; nothing pretends a clock measured the decision.
  const placed = mapPlanToSession(
    planResource,
    {
      ...debriefRequest,
      sessionAdjustments: {
        targets: [
          { targetId: "m31", state: "skipped", reason: "visibility" },
          { targetId: "ngc7000", state: "done" },
          { targetId: "m45", state: "done" },
        ],
      },
    },
    decidedAt,
  );
  assert.deepEqual(
    [skipOf(placed).eventId, skipOf(placed).recordedAt, skipOf(placed).timing],
    ["01M2KTW3EBR5YT8GN1MF5KD630", "2026-09-16T01:31:37.000Z", "planned"],
  );
  assert.deepEqual(skipOf(placed).payload, {
    targetId: "m31",
    planItemId: "m31",
    reason: "visibility",
  });

  // A target left UNTICKED under `partial` is treated as skipped and produces
  // the same event under the same identifier, with no reason: the identifier
  // states which fact is recorded, the payload how much the person said.
  const unticked = mapPlanToSession(
    planResource,
    {
      ...debriefRequest,
      sessionAdjustments: {
        targets: [
          { targetId: "m31", state: "done" },
          { targetId: "ngc7000", state: "done" },
        ],
      },
    },
    decidedAt,
  );
  assert.equal(skipOf(unticked).eventId, "01M2KTW3EKBG7YHZEY4VGAJGZG");
  assert.deepEqual(skipOf(unticked).payload, {
    targetId: "m45",
    planItemId: "m45",
  });
  assert.equal(skipOf(unticked).timing, "reconstructed");

  // The person's sentence rides along in the registry's own `notes`.
  const withNote = mapPlanToSession(
    planResource,
    {
      ...debriefRequest,
      sessionAdjustments: {
        targets: [
          { targetId: "m31", state: "done" },
          { targetId: "ngc7000", state: "done" },
          {
            targetId: "m45",
            state: "skipped",
            reason: "time",
            note: "Ran out of night after the flip.",
          },
        ],
      },
    },
    decidedAt,
  );
  assert.deepEqual(skipOf(withNote).payload, {
    targetId: "m45",
    planItemId: "m45",
    reason: "time",
    notes: "Ran out of night after the flip.",
  });

  // `executed` reads no adjustments and therefore skips nothing at all; every
  // item emits its started/finished pair.
  const executed = mapPlanToSession(
    planResource,
    { outcome: "executed", session: declaredSession },
    decidedAt,
  );
  assert.equal(skipOf(executed), undefined);
  assert.deepEqual(
    executed.events.map((event) => event.type),
    [
      "target_started",
      "target_finished",
      "target_started",
      "target_finished",
      "target_started",
      "target_finished",
    ],
  );
});

test("an accepted supplement adds to a skipped target and withdraws nothing", () => {
  const { events: journal } = mapPlanToSession(
    planResource,
    debriefRequest,
    decidedAt,
  );
  const skip = journal.find((event) => event.type === "target_skipped");
  assert.equal(skip.payload.targetId, "m45");

  // The field device's own reading of the same plan, submitted late: `m45`
  // was observed after all. `m31` and `ngc7000` are already named by a
  // `target_started`, so only `m45` produces anything.
  const supplement = {
    id: supplementId,
    createdAt: "2026-09-16T09:12:00.000Z",
    payload: planPayload,
  };
  const appended = acceptSupplement(planResource, journal, supplement);
  assert.deepEqual(
    appended.map((event) => [event.eventId, event.type, event.timing]),
    [
      ["01M2MQSFR8PMM4QPXR410Y65D2", "target_started", "reconstructed"],
      ["01M2MQSFR9B6SB649FEV4FX2VH", "target_finished", "reconstructed"],
    ],
  );
  assert.ok(appended.every((event) => event.payload.targetId === "m45"));

  // The skip line is untouched: nothing removes it, and the journal holds all
  // three statements about `m45`. Append-only has no exception for a
  // correction — the interface shows both, ordered by arrival.
  const merged = [...journal, ...appended];
  assert.equal(merged.length, journal.length + 2);
  assert.deepEqual(
    merged.find((event) => event.type === "target_skipped"),
    skip,
  );
  assert.deepEqual(
    merged
      .filter((event) => event.payload.targetId === "m45")
      .map((event) => event.type),
    ["target_skipped", "target_started", "target_finished"],
  );

  // A PLACED target skipped at debriefing and supplemented afterwards puts
  // the skip and the late `target_started` at the same instant — the slot's
  // start — so `receivedAt` then `eventId`, never `recordedAt`, is what
  // orders them.
  const skippedM31 = mapPlanToSession(
    planResource,
    {
      ...debriefRequest,
      sessionAdjustments: {
        targets: [
          { targetId: "m31", state: "skipped", reason: "visibility" },
          { targetId: "ngc7000", state: "done" },
          { targetId: "m45", state: "done" },
        ],
      },
    },
    decidedAt,
  ).events;
  const lateM31 = acceptSupplement(planResource, skippedM31, supplement);
  assert.equal(
    lateM31.find((event) => event.type === "target_started").recordedAt,
    skippedM31.find((event) => event.type === "target_skipped").recordedAt,
  );
  assert.notEqual(
    lateM31.find((event) => event.type === "target_started").eventId,
    skippedM31.find((event) => event.type === "target_skipped").eventId,
  );
});

test("a skipped target's identifier survives two racing debriefings", () => {
  const skipId = (reason, note, now) =>
    mapPlanToSession(
      planResource,
      {
        ...debriefRequest,
        session:
          reason === "time"
            ? {
                startedAt: "2026-09-16T00:55:00.000Z",
                finishedAt: "2026-09-16T08:40:00.000Z",
              }
            : declaredSession,
        sessionAdjustments: {
          targets: [
            { targetId: "m31", state: "done" },
            { targetId: "ngc7000", state: "done" },
            { targetId: "m45", state: "skipped", reason, note },
          ],
        },
      },
      now,
    ).events.find((event) => event.type === "target_skipped");

  const web = skipId("weather", undefined, decidedAt);
  const field = skipId("time", "Ran out of night.", "2026-09-16T13:20:00.417Z");

  // Same night, same target, two different stated reasons: ONE identifier, so
  // the primary key (sessionId, eventId) absorbs the race and the journal
  // never holds the same skip twice.
  assert.equal(web.eventId, field.eventId);
  assert.equal(web.eventId, "01M2KTW3EKBG7YHZEY4VGAJGZG");
  // The payloads genuinely differ, and that is the assumed consequence: the
  // union keeps the FIRST row written and drops the second as a duplicate,
  // reason and note included. Neither is merged into the other.
  assert.notDeepEqual(web.payload, field.payload);
  assert.equal(web.payload.reason, "weather");
  assert.equal(field.payload.reason, "time");
  // The declared window differs too, and the skip's own instant with it —
  // more request data that never reaches the identifier.
  assert.notEqual(web.recordedAt, field.recordedAt);
});

test("a generated event identifier never depends on the request or the clock", () => {
  const reference = mapPlanToSession(planResource, debriefRequest, decidedAt);
  const identifiers = (result) => result.events.map((event) => event.eventId);

  // A second surface answering the same night at the same moment: another
  // declared window, another instant, another free note. Every identifier the
  // two decisions have in common is byte-identical, so the primary key
  // (sessionId, eventId) absorbs the race instead of duplicating the journal.
  const racing = mapPlanToSession(
    planResource,
    {
      ...debriefRequest,
      session: {
        startedAt: "2026-09-16T00:55:00.000Z",
        finishedAt: "2026-09-16T08:40:00.000Z",
      },
      note: "A different sentence entirely.",
    },
    "2026-09-16T13:20:00.417Z",
  );
  assert.deepEqual(identifiers(racing), identifiers(reference));
  // The timestamps legitimately differ; the union keeps the first stored row.
  assert.notDeepEqual(
    racing.events.map((event) => event.recordedAt),
    reference.events.map((event) => event.recordedAt),
  );

  // Different adjustments change WHICH events are emitted, never what an
  // emitted one is called: the ordinal is computed over every item of the
  // payload, ticked or not. Ticking only `ngc7000` now leaves `m31` skipped
  // at its own offset 3 — a different fact about `m31`, not a renamed event.
  const fewer = mapPlanToSession(
    planResource,
    {
      ...debriefRequest,
      sessionAdjustments: { targets: [{ targetId: "ngc7000", state: "done" }] },
      note: undefined,
    },
    decidedAt,
  );
  assert.deepEqual(identifiers(fewer), [
    "01M2KTW3EBR5YT8GN1MF5KD630",
    "01M2KTW3ECC6Q61KMJCECWEY4T",
    "01M2KTW3EDTEEYHQ9KZKFK9SWJ",
    "01M2KTW3EKBG7YHZEY4VGAJGZG",
  ]);
  // Everything the two decisions state in common is byte-identical...
  for (const id of [
    "01M2KTW3ECC6Q61KMJCECWEY4T",
    "01M2KTW3EDTEEYHQ9KZKFK9SWJ",
    "01M2KTW3EKBG7YHZEY4VGAJGZG",
  ]) {
    assert.ok(identifiers(reference).includes(id));
    assert.ok(identifiers(fewer).includes(id));
  }
  // ...and the one identifier only this decision emits belongs to `m31`'s own
  // reserved group, so it renames nothing the reference already named.
  assert.ok(!identifiers(reference).includes("01M2KTW3EBR5YT8GN1MF5KD630"));

  // The revision is part of every key: a debriefing based on a restored
  // set-aside version describes another intention and names other events.
  const restored = mapPlanToSession(
    { ...planResource, revision: 5 },
    debriefRequest,
    decidedAt,
  );
  for (const id of identifiers(restored))
    assert.ok(!identifiers(reference).includes(id));
});

test("with no derivable night every target event is reconstructed, not planned", () => {
  const { location: _dropped, ...placeless } = planPayload;
  const unknownNight = {
    ...planResource,
    nightStartAt: null,
    nightEndAt: null,
    payload: placeless,
  };
  const { session, events } = mapPlanToSession(
    unknownNight,
    debriefRequest,
    decidedAt,
  );
  assert.deepEqual(session, declaredSession);
  for (const event of events.filter((entry) => entry.type !== "note"))
    assert.equal(event.timing, "reconstructed");
  // The slots are unusable without an origin, so both targets fall back to the
  // session window — and the hash tails are nevertheless the same events.
  assert.deepEqual(
    events.slice(0, 4).map((event) => event.recordedAt),
    [
      declaredSession.startedAt,
      declaredSession.finishedAt,
      declaredSession.startedAt,
      declaredSession.finishedAt,
    ],
  );
  assert.deepEqual(
    events.map((event) => event.eventId.slice(10)),
    mapPlanToSession(planResource, debriefRequest, decidedAt).events.map(
      (event) => event.eventId.slice(10),
    ),
  );
  // With no declared window at all the session falls back to the night-of
  // anchor rather than to a single instant repeated twice.
  const bare = mapPlanToSession(
    unknownNight,
    { outcome: "executed" },
    decidedAt,
  );
  assert.deepEqual(bare.session, {
    startedAt: "2026-09-15T00:00:00.000Z",
    finishedAt: "2026-09-15T00:00:00.000Z",
  });
});

test("every generated identifier is a ULID both session schemas accept", async () => {
  const ingest = await schema("api/session-event-ingest.schema.json");
  const session = await schema("api/session.schema.json");
  const { events } = mapPlanToSession(planResource, debriefRequest, decidedAt);
  assert.equal(
    new Set(events.map((event) => event.eventId)).size,
    events.length,
  );
  for (const event of events) {
    assert.match(event.eventId, /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
    assertValid(ingest, {
      ...event,
      sessionId,
      receivedAt: decidedAt,
      originDeviceId: null,
    });
  }
  // A supplement lists exactly those identifiers back.
  assertValid(session, {
    supplement: {
      id: supplementId,
      sessionId,
      planId,
      status: "accepted",
      payload: planPayload,
      originDeviceId: deviceId,
      deviceLabel: "Field phone",
      createdAt: "2026-09-16T09:12:00.000Z",
      decidedAt: "2026-09-16T10:00:00.000Z",
      eventIds: events.map((event) => event.eventId),
    },
    eventsCreated: events.length,
    replayed: false,
  });
});

test("session-event-ingest.schema.json marks a stored event planned, reconstructed or observed", async () => {
  const ingest = await schema("api/session-event-ingest.schema.json");
  const stored = {
    eventId: "01M2KTW3E8Y14VK0GHW4D4X5FK",
    sessionId,
    type: "target_started",
    recordedAt: "2026-09-16T01:31:37.000Z",
    receivedAt: decidedAt,
    originDeviceId: null,
    payload: { targetId: "m31", planItemId: "m31" },
  };
  for (const timing of ["observed", "planned", "reconstructed"])
    assertValid(ingest, { ...stored, timing });
  // A portal predating the field simply omits it.
  assertValid(ingest, stored);
  assertInvalid(ingest, { ...stored, timing: "estimated" });
  // It is derived, never claimed: a client cannot send it, exactly as it
  // cannot send `originDeviceId`. The registry's submitted envelope is
  // untouched, so an earlier device keeps sending what it already sent.
  assertInvalid(ingest, { events: [eventOf({ timing: "observed" })] });
});

test("session.schema.json reads the night's equipment back through the frozen plan", async () => {
  const session = await schema("api/session.schema.json");
  const detail = {
    session: sessionResource,
    supplements: [],
    plan: {
      planId,
      status: "partial",
      revision: 4,
      frozenAt: decidedAt,
      nightStartAt,
      nightEndAt,
      equipment: planPayload.equipment,
    },
  };
  assertValid(session, detail);
  // The equipment is the frozen plan's own object, never a rewritten copy.
  assert.deepEqual(detail.plan.equipment, planPayload.equipment);
  // A direct session has no plan and therefore no equipment to show.
  assertValid(session, {
    session: { ...sessionResource, planId: null },
    supplements: [],
    plan: null,
  });
  // The projection stays closed: no payload is smuggled in beside it.
  assertInvalid(session, {
    ...detail,
    plan: { ...detail.plan, payload: planPayload },
  });
});

test("debrief.schema.json carries the night start the slots are counted from", async () => {
  const debrief = await schema("api/debrief.schema.json");
  assertValid(debrief, {
    generatedAt: "2026-09-16T09:00:00.000Z",
    entries: [
      {
        planId,
        nightStartAt,
        nightEndAt,
        plan: planResource,
        staleDevices: [],
        sessionId: null,
        openSession: null,
      },
    ],
  });
  // A plan whose night could not be derived never reaches the queue, so the
  // entry's own nightEndAt is never null.
  assertInvalid(debrief, {
    generatedAt: "2026-09-16T09:00:00.000Z",
    entries: [
      {
        planId,
        nightStartAt: null,
        nightEndAt: null,
        plan: planResource,
        staleDevices: [],
      },
    ],
  });
});

test("every session schema declares a 2020-12 $schema and a stable $id", async () => {
  const paths = [
    "api/session.schema.json",
    "api/session-event-ingest.schema.json",
    "api/debrief.schema.json",
    "api/capture.schema.json",
  ];
  for (const path of paths) {
    const document = await schema(path);
    assert.equal(
      document.$schema,
      "https://json-schema.org/draft/2020-12/schema",
    );
    assert.ok(document.$id?.startsWith("https://astroportal.invalid/schemas/"));
    assert.ok(document.description?.length > 0);
  }
});

test("debrief.schema.json accepts a partial target and declared acquired minutes", async () => {
  const debrief = await schema("api/debrief.schema.json");
  assertValid(debrief, {
    outcome: "partial",
    sessionAdjustments: {
      targets: [
        { targetId: "ngc7000", state: "done", acquiredMinutes: 120 },
        { targetId: "ic1396", state: "partial", acquiredMinutes: 85 },
        { targetId: "m31", state: "modified", acquiredMinutes: 0 },
        { targetId: "m45", state: "skipped", reason: "weather" },
        { targetId: "m33", state: "partial", note: "x".repeat(500) },
      ],
    },
  });
  for (const acquiredMinutes of [-1, 12.5, "85", null])
    assertInvalid(debrief, {
      outcome: "partial",
      sessionAdjustments: {
        targets: [{ targetId: "ic1396", state: "partial", acquiredMinutes }],
      },
    });
});

test("debrief.schema.json's record carries the stored per-target adjustments and nothing else", async () => {
  const debrief = await schema("api/debrief.schema.json");
  const record = {
    outcome: "partial",
    decidedAt: "2026-10-11T08:00:00.000Z",
    targets: [
      { targetId: "ngc7000", state: "done", acquiredMinutes: 120 },
      { targetId: "ic1396", state: "partial", acquiredMinutes: 85 },
      { targetId: "m45", state: "skipped", reason: "weather" },
    ],
  };
  assertValid(debrief, record);
  assertValid(debrief, { ...record, outcome: "executed", targets: [] });
  // Notes are journal events, never part of the stored record.
  assertInvalid(debrief, {
    ...record,
    targets: [{ targetId: "m31", state: "modified", note: "Refocused." }],
  });
  assertInvalid(debrief, { ...record, score: 7 });
});

test("debrief.schema.json's summary describes every recorded debrief-summary fixture result", async () => {
  const debrief = await schema("api/debrief.schema.json");
  const fixture = JSON.parse(
    await readFile(
      new URL("../fixtures/debrief-summary.json", import.meta.url),
      "utf8",
    ),
  );
  assert.ok(fixture.cases.length >= 10);
  for (const entry of fixture.cases)
    assert.deepEqual(
      schemaErrors({ $ref: "#/$defs/summary" }, entry.result, debrief),
      [],
      entry.id,
    );
  // Never a score nor an overall mark: the shape is closed.
  assertInvalid(debrief, { ...fixture.cases[0].result, score: 7 });
});

// « Reprendre la nuit ».
test("the reopen request takes an optional instant and nothing else; « fatigue » is a pause cause of the note and of the summary", async () => {
  const session = await schema("api/session.schema.json");
  const reopen = { $ref: "#/$defs/reopenRequest" };
  assert.deepEqual(schemaErrors(reopen, {}, session), []);
  assert.deepEqual(
    schemaErrors(reopen, { reopenedAt: "2026-10-13T00:06:00.000Z" }, session),
    [],
  );
  assert.notDeepEqual(
    schemaErrors(reopen, { finishedAt: "2026-10-13T00:06:00.000Z" }, session),
    [],
  );
  const note = await schema("session-events/note.schema.json");
  assertValid(note, {
    text: "Une sieste dans la voiture",
    pauseCause: {
      pauseEventId: "01JA2REPR1SE00000000000004",
      cause: "fatigue",
    },
  });
  const debrief = await schema("api/debrief.schema.json");
  assert.ok(debrief.$defs.lossCause.enum.includes("fatigue"));
});
