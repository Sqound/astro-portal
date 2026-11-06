import assert from "node:assert/strict";
import test from "node:test";
import {
  chronologicalItems,
  generatedEventId,
  mapPlanToSession,
  mapSupplementAcceptance,
  slotEnd,
  slotStart,
} from "../dist/session-events/debrief-event-mapping.js";

// This file replays exactly the worked example of
// packages/astro-contracts/schemas/api/v1.md's "A worked example" section,
// reproduced with the reference implementation in
// packages/astro-contracts/tests/sessions.test.mjs. Every literal below —
// the plan, the debrief request, the expected session and the seven
// eventIds — is copied from that file so a divergence between the reference
// and this production module fails here.

const sessionId = "4d2b7e10-8a6c-4f53-9b1d-7e0a3c5f2b84";
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

const plan = { payload: planPayload, revision: 4, nightStartAt, nightEndAt };

const declaredSession = {
  startedAt: "2026-09-16T01:50:00.000Z",
  finishedAt: "2026-09-16T06:20:00.000Z",
};
const decidedAt = "2026-09-16T13:20:00.000Z";

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

test("mapPlanToSession reproduces the contract's worked example exactly: session window, seven events, ids, recordedAt, timing, chronological order", () => {
  const { session, events } = mapPlanToSession({
    sessionId,
    plan,
    request: debriefRequest,
    now: decidedAt,
  });

  assert.deepEqual(session, declaredSession);
  assert.equal(events.length, 7);
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
  // Chronological, not payload order.
  assert.deepEqual(
    events
      .filter((event) => event.type === "target_started")
      .map((event) => event.payload.targetId),
    ["m31", "ngc7000"],
  );
  assert.deepEqual(events[5].payload, {
    targetId: "m45",
    planItemId: "m45",
    reason: "weather",
  });
  assert.deepEqual(events[4].payload, {
    text: "Guiding lost after the flip, kept 40 minutes.",
    targetId: "ngc7000",
  });
  assert.deepEqual(events[6].payload, {
    text: "Clouds rolled in around 2 a.m.",
  });
  for (const event of events)
    assert.equal(event.eventId.length, 26, event.eventId);
});

test("a generated event identifier never depends on the request or the clock", () => {
  const reference = mapPlanToSession({
    sessionId,
    plan,
    request: debriefRequest,
    now: decidedAt,
  });
  const ids = (result) => result.events.map((event) => event.eventId);

  const racing = mapPlanToSession({
    sessionId,
    plan,
    request: {
      ...debriefRequest,
      session: {
        startedAt: "2026-09-16T00:55:00.000Z",
        finishedAt: "2026-09-16T08:40:00.000Z",
      },
      note: "A different sentence entirely.",
    },
    now: "2026-09-16T13:20:00.417Z",
  });
  assert.deepEqual(ids(racing), ids(reference));

  // Two racing decisions disagreeing on a skip's reason still emit the SAME
  // eventId; the union keeps the first row written.
  const web = mapPlanToSession({
    sessionId,
    plan,
    request: debriefRequest,
    now: decidedAt,
  }).events.find((event) => event.type === "target_skipped");
  const field = mapPlanToSession({
    sessionId,
    plan,
    request: {
      ...debriefRequest,
      sessionAdjustments: {
        targets: [
          { targetId: "m31", state: "done" },
          { targetId: "ngc7000", state: "done" },
          { targetId: "m45", state: "skipped", reason: "time" },
        ],
      },
    },
    now: decidedAt,
  }).events.find((event) => event.type === "target_skipped");
  assert.equal(web.eventId, field.eventId);
  assert.notEqual(web.payload.reason, field.payload.reason);
});

test("with no derivable night every target event is reconstructed", () => {
  const { location: _dropped, ...placeless } = planPayload;
  const unknownNight = {
    payload: placeless,
    revision: 4,
    nightStartAt: null,
    nightEndAt: null,
  };
  const { session, events } = mapPlanToSession({
    sessionId,
    plan: unknownNight,
    request: debriefRequest,
    now: decidedAt,
  });
  assert.deepEqual(session, declaredSession);
  for (const event of events.filter((entry) => entry.type !== "note"))
    assert.equal(event.timing, "reconstructed");
});

test("mapSupplementAcceptance adds to a skipped target and withdraws nothing", () => {
  const { events: journal } = mapPlanToSession({
    sessionId,
    plan,
    request: debriefRequest,
    now: decidedAt,
  });
  const alreadyStartedPlanItemIds = new Set(
    journal
      .filter((event) => event.type === "target_started")
      .map((event) => event.payload.planItemId),
  );
  const supplement = {
    id: "c8a4f2d6-1b93-4e07-8f52-6d1c3a9b4e70",
    createdAt: "2026-09-16T09:12:00.000Z",
    payload: planPayload,
  };
  const appended = mapSupplementAcceptance({
    sessionId,
    plan,
    alreadyStartedPlanItemIds,
    supplement,
  });
  assert.deepEqual(
    appended.map((event) => [event.eventId, event.type, event.timing]),
    [
      ["01M2MQSFR8PMM4QPXR410Y65D2", "target_started", "reconstructed"],
      ["01M2MQSFR9B6SB649FEV4FX2VH", "target_finished", "reconstructed"],
    ],
  );
  assert.ok(appended.every((event) => event.payload.targetId === "m45"));
});

test("chronologicalItems, slotStart and slotEnd match the payload's own ordering rules", () => {
  const items = planPayload.items;
  assert.equal(slotStart(items[0]), 200);
  assert.equal(slotEnd(items[0]), 320);
  assert.equal(slotStart(items[2]), null);
  assert.equal(slotEnd(items[2]), null);
  assert.deepEqual(
    chronologicalItems(items).map(({ item }) => item.id),
    ["m31", "ngc7000", "m45"],
  );
});

test("generatedEventId is a stable ULID shape", () => {
  const id = generatedEventId(
    sessionId,
    nightStartAt,
    0,
    "plan/4/target/m31/started",
  );
  assert.match(id, /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
  assert.equal(
    generatedEventId(sessionId, nightStartAt, 0, "plan/4/target/m31/started"),
    id,
  );
});
