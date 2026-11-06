import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  defaultSessionEventSchemaDirectory,
  EVENT_ID_PATTERN,
  EVENT_SOURCES,
  eventSourceForApplication,
  isKnownEventType,
  isValidEventId,
  isValidRecordedAt,
  payloadSchemaErrors,
  SESSION_EVENT_TYPES,
} from "../dist/session-events/registry.js";

// Every case here also appears in the registry document's own examples
// (packages/astro-contracts/schemas/session-events.md) and in that package's
// packages/astro-contracts/tests/session-events.test.mjs, which validates the
// same eight schema files with a *different* minimal JSON Schema evaluator
// (schema-assert.mjs) that this production module must not import. Running
// the same fixtures against both proves the two evaluators agree without
// coupling this package to the other's test-only code.

// The module's own path resolution (independent of process.cwd(), which
// `npm test -w portal` sets to packages/portal rather than the repo root).
const contractsSchemaDirectory = defaultSessionEventSchemaDirectory();

function contractSchema(fileBaseName) {
  return JSON.parse(
    readFileSync(
      join(contractsSchemaDirectory, `${fileBaseName}.schema.json`),
      "utf8",
    ),
  );
}

test("SESSION_EVENT_TYPES and EVENT_ID_PATTERN are pinned to the registry's own envelope schema", () => {
  const envelope = contractSchema("event-envelope");
  assert.deepEqual([...SESSION_EVENT_TYPES], envelope.properties.type.enum);
  assert.equal(EVENT_ID_PATTERN.source, envelope.properties.eventId.pattern);
});

test("isKnownEventType accepts exactly the registered types", () => {
  for (const type of SESSION_EVENT_TYPES)
    assert.equal(isKnownEventType(type), true);
  assert.equal(isKnownEventType("exposure_started"), false);
  assert.equal(isKnownEventType(""), false);
  assert.equal(isKnownEventType(undefined), false);
});

test("isValidEventId accepts a well-formed ULID and rejects a malformed or lowercase one", () => {
  assert.equal(isValidEventId("01J8Z3K9QZ6N3S6R3E6G8H1234"), true);
  assert.equal(isValidEventId("not-a-ulid"), false);
  assert.equal(isValidEventId("01j8z3k9qz6n3s6r3e6g8h1234"), false); // lowercase
  assert.equal(isValidEventId("01J8Z3K9QZ6N3S6R3E6G8H123"), false); // 25 chars
  assert.equal(isValidEventId(undefined), false);
});

test("isValidRecordedAt accepts an ISO date-time and rejects a malformed string, never for implausibility", () => {
  assert.equal(isValidRecordedAt("2026-09-19T21:14:03.000Z"), true);
  // recordedAt is never rejected for being an unlikely instant — only for
  // failing to parse as a date-time at all.
  assert.equal(isValidRecordedAt("1970-01-01T00:00:00.000Z"), true);
  assert.equal(isValidRecordedAt("2099-01-01T00:00:00.000Z"), true);
  assert.equal(isValidRecordedAt("not-a-date"), false);
  assert.equal(isValidRecordedAt(undefined), false);
  assert.equal(isValidRecordedAt(12345), false);
});

test("note: accepts a field note with or without a target, rejects an empty payload, an empty text and an unknown field", () => {
  assert.deepEqual(
    payloadSchemaErrors("note", {
      text: "Guide star lost after the meridian flip.",
    }),
    [],
  );
  assert.deepEqual(
    payloadSchemaErrors("note", {
      text: "Bright meteor crossed the frame.",
      targetId: "m31",
    }),
    [],
  );
  assert.ok(payloadSchemaErrors("note", {}).length);
  assert.ok(payloadSchemaErrors("note", { text: "" }).length);
  assert.ok(payloadSchemaErrors("note", { text: "Fine.", extra: true }).length);
});

test("note: accepts appStopped { from, to } without text", () => {
  assert.deepEqual(
    payloadSchemaErrors("note", {
      appStopped: {
        from: "2026-10-02T21:12:00.000Z",
        to: "2026-10-02T21:40:00.000Z",
      },
    }),
    [],
  );
  assert.deepEqual(
    payloadSchemaErrors("note", {
      appStopped: {
        from: "2026-10-02T23:12:00+02:00",
        to: "2026-10-02T23:40:00+02:00",
      },
    }),
    [],
  );
});

test("note: rejects a malformed appStopped interval", () => {
  for (const appStopped of [
    { from: "2026-10-02T21:12:00.000Z" },
    { to: "2026-10-02T21:40:00.000Z" },
    { from: "23:12", to: "23:40" },
    { from: "not-a-date", to: "2026-10-02T21:40:00.000Z" },
    { from: 1727903520000, to: 1727905200000 },
    {
      from: "2026-10-02T21:12:00.000Z",
      to: "2026-10-02T21:40:00.000Z",
      minutes: 28,
    },
    "2026-10-02T21:12:00.000Z",
  ])
    assert.ok(
      payloadSchemaErrors("note", { appStopped }).length,
      JSON.stringify(appStopped),
    );
});

test("target_started: accepts a catalogue target or a custom label, rejects naming no target, a wrong-typed field and an unknown field", () => {
  assert.deepEqual(
    payloadSchemaErrors("target_started", {
      targetId: "m31",
      planItemId: "item-7",
    }),
    [],
  );
  assert.deepEqual(
    payloadSchemaErrors("target_started", {
      targetLabel: "Faint nova candidate near Cygnus",
    }),
    [],
  );
  assert.ok(payloadSchemaErrors("target_started", {}).length);
  assert.ok(
    payloadSchemaErrors("target_started", { notes: "Starting now." }).length,
  );
  assert.ok(payloadSchemaErrors("target_started", { targetId: 123 }).length);
  assert.ok(
    payloadSchemaErrors("target_started", {
      targetId: "m31",
      exposureCount: 12,
    }).length,
  );
});

test("target_finished: accepts a catalogue target or a custom label, rejects naming no target and an unknown field", () => {
  assert.deepEqual(
    payloadSchemaErrors("target_finished", {
      targetId: "m31",
      notes: "Clouds rolled in, cut it short.",
    }),
    [],
  );
  assert.deepEqual(
    payloadSchemaErrors("target_finished", {
      targetLabel: "Faint nova candidate",
    }),
    [],
  );
  assert.ok(payloadSchemaErrors("target_finished", {}).length);
  assert.ok(
    payloadSchemaErrors("target_finished", { planItemId: "item-7" }).length,
  );
  assert.ok(
    payloadSchemaErrors("target_finished", {
      targetId: "m31",
      outcome: "completed",
    }).length,
  );
});

test("target_skipped: accepts a reason, a free label and no reason at all, rejects naming no target, an unclosed reason and an out-of-bound notes", () => {
  assert.deepEqual(
    payloadSchemaErrors("target_skipped", {
      targetId: "m45",
      planItemId: "m45",
      reason: "weather",
    }),
    [],
  );
  assert.deepEqual(
    payloadSchemaErrors("target_skipped", {
      targetId: "ngc7000",
      reason: "other",
      notes: "Neighbour's floodlight.",
    }),
    [],
  );
  assert.deepEqual(
    payloadSchemaErrors("target_skipped", { targetId: "m45" }),
    [],
  );
  assert.deepEqual(
    payloadSchemaErrors("target_skipped", {
      targetLabel: "Faint nova candidate",
    }),
    [],
  );
  for (const reason of ["weather", "equipment", "time", "visibility", "other"])
    assert.deepEqual(
      payloadSchemaErrors("target_skipped", { targetId: "m45", reason }),
      [],
    );
  assert.ok(payloadSchemaErrors("target_skipped", {}).length);
  assert.ok(
    payloadSchemaErrors("target_skipped", { reason: "weather" }).length,
  );
  assert.ok(
    payloadSchemaErrors("target_skipped", { targetId: "m45", reason: "clouds" })
      .length,
  );
  assert.ok(
    payloadSchemaErrors("target_skipped", { targetId: "m45", reason: "moon" })
      .length,
  );
  assert.ok(
    payloadSchemaErrors("target_skipped", {
      targetId: "m45",
      notes: "x".repeat(301),
    }).length,
  );
  assert.ok(
    payloadSchemaErrors("target_skipped", { targetId: "m45", state: "skipped" })
      .length,
  );
});

test("pause: accepts an empty payload and an optional reason, rejects a wrong-typed reason and an unknown field", () => {
  assert.deepEqual(payloadSchemaErrors("pause", {}), []);
  assert.deepEqual(
    payloadSchemaErrors("pause", { reason: "Meridian flip." }),
    [],
  );
  assert.ok(payloadSchemaErrors("pause", { reason: 12 }).length);
  assert.ok(payloadSchemaErrors("pause", { note: "Wrong field name." }).length);
});

test("resume: accepts an empty payload and an optional note, rejects a wrong-typed note", () => {
  assert.deepEqual(payloadSchemaErrors("resume", {}), []);
  assert.deepEqual(
    payloadSchemaErrors("resume", { note: "Sky cleared up." }),
    [],
  );
  assert.ok(payloadSchemaErrors("resume", { note: null }).length);
});

test("condition: accepts a single tapped field, rejects an empty payload, an out-of-range scale and an unknown sky value", () => {
  assert.deepEqual(payloadSchemaErrors("condition", { sky: "clear" }), []);
  assert.deepEqual(payloadSchemaErrors("condition", { seeing: 4 }), []);
  assert.deepEqual(
    payloadSchemaErrors("condition", { notes: "Hazy near the horizon." }),
    [],
  );
  assert.deepEqual(
    payloadSchemaErrors("condition", {
      sky: "partly_cloudy",
      seeing: 3,
      transparency: 2,
    }),
    [],
  );
  // The execution screen's sky sheet records « Voilé » and « Nuageux » so.
  assert.deepEqual(payloadSchemaErrors("condition", { sky: "hazy" }), []);
  assert.deepEqual(payloadSchemaErrors("condition", { sky: "cloudy" }), []);
  assert.ok(payloadSchemaErrors("condition", {}).length);
  assert.ok(payloadSchemaErrors("condition", { seeing: 6 }).length);
  assert.ok(payloadSchemaErrors("condition", { seeing: 0 }).length);
  assert.ok(payloadSchemaErrors("condition", { sky: "sunny" }).length);
  assert.ok(
    payloadSchemaErrors("condition", { sky: "clear", windKph: 12 }).length,
  );
});

test("equipment_issue: accepts a description alone and with equipment/severity, rejects a missing description and an unknown severity", () => {
  assert.deepEqual(
    payloadSchemaErrors("equipment_issue", {
      description: "Dew on the corrector plate.",
    }),
    [],
  );
  assert.deepEqual(
    payloadSchemaErrors("equipment_issue", {
      description: "Guiding lost, RMS spiking.",
      equipmentId: "scope-1",
      severity: "blocking",
    }),
    [],
  );
  assert.ok(payloadSchemaErrors("equipment_issue", {}).length);
  assert.ok(
    payloadSchemaErrors("equipment_issue", { severity: "blocking" }).length,
  );
  assert.ok(
    payloadSchemaErrors("equipment_issue", {
      description: "Mount stalled.",
      severity: "critical",
    }).length,
  );
});

test("payloadSchemaErrors throws for a type outside the registry", () => {
  assert.throws(() => payloadSchemaErrors("exposure_started", {}));
});

// Automatic or manual move to the next target.

test("the registry pins thirty-one types, the four kinds detected by Astro Sync, the fifteen pointing-device kinds, plan_edited, device_instrument, then guided_evening last", () => {
  assert.equal(SESSION_EVENT_TYPES.length, 31);
  assert.deepEqual(SESSION_EVENT_TYPES.slice(9, 13), [
    "exposure_change",
    "guiding_timeouts",
    "sensor_temperature_drift",
    "guiding_spikes",
  ]);
  assert.deepEqual(SESSION_EVENT_TYPES.slice(13, 28), [
    "mount_connected",
    "mount_goto",
    "mount_stop",
    "mount_link_lost",
    "mount_link_back",
    "mount_disconnected",
    "mount_parked",
    "mount_aligned",
    "pointing_help",
    "device_connected",
    "device_goto",
    "device_stop",
    "device_parked",
    "device_link_lost",
    "device_link_back",
  ]);
  assert.equal(SESSION_EVENT_TYPES[28], "plan_edited");
  // SMART-SCOPE-INSTRUMENT-PANEL-01: the instrument's samples, additive.
  assert.equal(SESSION_EVENT_TYPES[29], "device_instrument");
  // GUIDED-EVENING-04: the guided evening's summary, additive.
  assert.equal(SESSION_EVENT_TYPES[30], "guided_evening");
  assert.equal(isKnownEventType("auto_time_confirmed"), true);
});

// The four kinds Astro Sync detects.

test("the four detected kinds accept their structured payload and an optional description", () => {
  const first = "2026-08-14T23:44:10Z";
  const last = "2026-08-15T05:44:02Z";
  assert.deepEqual(
    payloadSchemaErrors("exposure_change", {
      fromSeconds: 120,
      toSeconds: 180,
    }),
    [],
  );
  assert.deepEqual(
    payloadSchemaErrors("guiding_timeouts", {
      count: 11,
      firstAt: first,
      lastAt: last,
      description: "11 attentes de guidage dépassées",
    }),
    [],
  );
  assert.deepEqual(
    payloadSchemaErrors("sensor_temperature_drift", {
      fromCelsius: -10,
      toCelsius: -6,
    }),
    [],
  );
  assert.deepEqual(
    payloadSchemaErrors("guiding_spikes", {
      count: 3,
      maxArcSeconds: 9,
      firstAt: first,
      lastAt: last,
    }),
    [],
  );
});

test("the four detected kinds refuse a missing field, a wrong figure and an unknown field", () => {
  assert.ok(payloadSchemaErrors("exposure_change", { toSeconds: 180 }).length);
  assert.ok(
    payloadSchemaErrors("exposure_change", { fromSeconds: 0, toSeconds: 180 })
      .length,
  );
  assert.ok(
    payloadSchemaErrors("sensor_temperature_drift", { fromCelsius: -10 })
      .length,
  );
  assert.ok(
    payloadSchemaErrors("guiding_timeouts", {
      count: 0,
      firstAt: "2026-08-14T23:44:10Z",
      lastAt: "2026-08-14T23:44:10Z",
    }).length,
  );
  assert.ok(
    payloadSchemaErrors("guiding_spikes", {
      count: 3,
      maxArcSeconds: 9,
      firstAt: "2026-08-14T23:44:10Z",
      lastAt: "2026-08-14T23:44:10Z",
      severity: "high",
    }).length,
  );
});

test("a group whose span runs backwards is no group", () => {
  const backwards = {
    count: 2,
    firstAt: "2026-08-15T03:00:00Z",
    lastAt: "2026-08-15T02:00:00Z",
  };
  assert.deepEqual(payloadSchemaErrors("guiding_timeouts", backwards), [
    "$.lastAt: must not be before firstAt",
  ]);
  assert.deepEqual(
    payloadSchemaErrors("guiding_spikes", { ...backwards, maxArcSeconds: 5 }),
    ["$.lastAt: must not be before firstAt"],
  );
});

test("eventSourceForApplication: astro-sync for the application sync only", () => {
  assert.equal(eventSourceForApplication("sync"), "astro-sync");
  for (const application of ["planner", null, undefined, "", "Sync"])
    assert.equal(eventSourceForApplication(application), "declared");
  assert.deepEqual([...EVENT_SOURCES], ["declared", "astro-sync"]);
});

test("target_started: accepts auto: true and advance auto/manual, rejects auto: false and an unknown advance", () => {
  assert.deepEqual(
    payloadSchemaErrors("target_started", {
      targetId: "m33",
      planItemId: "m33",
      auto: true,
      advance: "auto",
    }),
    [],
  );
  assert.deepEqual(
    payloadSchemaErrors("target_started", {
      targetId: "m33",
      advance: "manual",
    }),
    [],
  );
  assert.ok(
    payloadSchemaErrors("target_started", { targetId: "m33", auto: false })
      .length,
  );
  assert.ok(
    payloadSchemaErrors("target_started", { targetId: "m33", advance: "clock" })
      .length,
  );
});

test("target_finished: accepts auto: true, rejects auto: false and a start-only advance", () => {
  assert.deepEqual(
    payloadSchemaErrors("target_finished", { targetId: "m31", auto: true }),
    [],
  );
  assert.ok(
    payloadSchemaErrors("target_finished", { targetId: "m31", auto: false })
      .length,
  );
  assert.ok(
    payloadSchemaErrors("target_finished", {
      targetId: "m31",
      advance: "auto",
    }).length,
  );
});

test("auto_time_confirmed: accepts a target id or label with a plan item, rejects no target and an unknown field", () => {
  assert.deepEqual(
    payloadSchemaErrors("auto_time_confirmed", {
      targetId: "m31",
      planItemId: "m31",
    }),
    [],
  );
  assert.deepEqual(
    payloadSchemaErrors("auto_time_confirmed", { targetLabel: "Comète" }),
    [],
  );
  assert.ok(payloadSchemaErrors("auto_time_confirmed", {}).length);
  assert.ok(
    payloadSchemaErrors("auto_time_confirmed", { planItemId: "m31" }).length,
  );
  assert.ok(
    payloadSchemaErrors("auto_time_confirmed", {
      targetId: "m31",
      minutes: 90,
    }).length,
  );
});

// The mount's events are kept in the session.

test("the pointing-device kinds are accepted with their payload and an unknown word or a position is refused", () => {
  assert.deepEqual(payloadSchemaErrors("mount_connected", {}), []);
  assert.deepEqual(
    payloadSchemaErrors("mount_connected", {
      protocol: "LX200",
      mountName: "OnStep",
    }),
    [],
  );
  assert.deepEqual(
    payloadSchemaErrors("mount_goto", {
      outcome: "arrived",
      targetId: "m110",
      targetLabel: "M110",
      gapDegrees: 0.2,
    }),
    [],
  );
  assert.deepEqual(
    payloadSchemaErrors("mount_goto", {
      outcome: "refused",
      refusedBy: "safety",
      reason: "below_horizon",
    }),
    [],
  );
  assert.notDeepEqual(
    payloadSchemaErrors("mount_goto", { targetId: "m110" }),
    [],
  );
  assert.notDeepEqual(
    payloadSchemaErrors("mount_goto", { outcome: "done" }),
    [],
  );
  assert.notDeepEqual(
    payloadSchemaErrors("mount_goto", { outcome: "sent", raHours: 0.7 }),
    [],
  );
  assert.deepEqual(
    payloadSchemaErrors("mount_stop", { cause: "night_end" }),
    [],
  );
  assert.deepEqual(payloadSchemaErrors("mount_link_lost", {}), []);
  assert.deepEqual(payloadSchemaErrors("mount_link_back", {}), []);
  assert.deepEqual(payloadSchemaErrors("mount_disconnected", {}), []);
  assert.deepEqual(
    payloadSchemaErrors("mount_disconnected", { protocol: "SynScan" }),
    [],
  );
  assert.notDeepEqual(
    payloadSchemaErrors("mount_disconnected", { raHours: 0.7 }),
    [],
  );
  assert.deepEqual(
    payloadSchemaErrors("mount_parked", { outcome: "parked" }),
    [],
  );
  assert.notDeepEqual(payloadSchemaErrors("mount_parked", {}), []);
  assert.deepEqual(
    payloadSchemaErrors("mount_aligned", {
      outcome: "synced",
      targetId: "m110",
    }),
    [],
  );
  assert.deepEqual(
    payloadSchemaErrors("pointing_help", {
      method: "mount",
      outcome: "centred",
      gapDegrees: 0.1,
      rounds: 2,
    }),
    [],
  );
  assert.notDeepEqual(
    payloadSchemaErrors("pointing_help", { method: "mount" }),
    [],
  );
  assert.deepEqual(
    payloadSchemaErrors("device_connected", {
      family: "origin",
      model: "Origin",
    }),
    [],
  );
  assert.deepEqual(
    payloadSchemaErrors("device_goto", { outcome: "sent", targetLabel: "M31" }),
    [],
  );
  assert.deepEqual(payloadSchemaErrors("device_stop", { cause: "person" }), []);
  assert.deepEqual(
    payloadSchemaErrors("device_parked", { outcome: "requested" }),
    [],
  );
  assert.notDeepEqual(
    payloadSchemaErrors("device_parked", { outcome: "parked" }),
    [],
  );
  assert.deepEqual(payloadSchemaErrors("device_link_lost", {}), []);
  assert.deepEqual(payloadSchemaErrors("device_link_back", {}), []);
});

// A plan changed during the night.

test("plan_edited accepts an add with its slot, a move and a removal, and rejects what the contract rejects", () => {
  assert.deepEqual(
    payloadSchemaErrors("plan_edited", {
      origin: "add",
      added: [
        {
          targetId: "m45",
          planItemId: "m45",
          startMinute: 294,
          endMinute: 354,
        },
      ],
      moved: [
        {
          targetId: "ngc253",
          fromStartMinute: 254,
          fromEndMinute: 274,
          startMinute: 314,
          endMinute: 334,
        },
      ],
    }),
    [],
  );
  assert.deepEqual(
    payloadSchemaErrors("plan_edited", {
      origin: "undo",
      removed: [{ targetLabel: "M45" }],
    }),
    [],
  );
  for (const payload of [
    {},
    { added: [] },
    { added: [{ targetId: "m45" }] },
    { added: [{ startMinute: 1, endMinute: 2 }] },
    { removed: [{ planItemId: "m45" }] },
    { origin: "web", removed: [{ targetId: "m45" }] },
    { removed: [{ targetId: "m45" }], plan: {} },
    {
      added: [{ targetId: "m45", startMinute: "late", endMinute: 20 }],
    },
  ])
    assert.notDeepEqual(
      payloadSchemaErrors("plan_edited", payload),
      [],
      JSON.stringify(payload),
    );
});

// SMART-SCOPE-INSTRUMENT-PANEL-01: the service validates a sample of the
// instrument against its own schema file, like any other type.
test("device_instrument: a sample with a reading is accepted; none, a position or a raw filter word is refused", () => {
  assert.deepEqual(
    payloadSchemaErrors("device_instrument", {
      family: "vespera",
      filter: "dual_band",
      humidity: 81,
      heater: "on",
      battery: 74,
      framesRejected: 4,
      rejections: [{ cause: "StackingRoundnessError", count: 4 }],
    }),
    [],
  );
  assert.notDeepEqual(payloadSchemaErrors("device_instrument", {}), []);
  assert.notDeepEqual(
    payloadSchemaErrors("device_instrument", { family: "vespera" }),
    [],
  );
  assert.notDeepEqual(
    payloadSchemaErrors("device_instrument", { battery: 74, ra: 40.5 }),
    [],
  );
  assert.notDeepEqual(
    payloadSchemaErrors("device_instrument", { filter: "DUAL" }),
    [],
  );
});

// GUIDED-EVENING-04: a guided evening that ran under the night ended.

test("guided_evening accepts the evening's summary and rejects what the contract rejects", () => {
  const summary = {
    version: 1,
    evening: "brightest-stars-tonight",
    title: "Les dix étoiles les plus brillantes",
    mode: "tripod",
    help: "aim",
    stepsSeen: 7,
    stepCount: 10,
    startedAt: "2026-10-14T19:40:00.000Z",
    finishedAt: "2026-10-14T20:45:00.000Z",
    durationMinutes: 65,
    kids: true,
  };
  assert.equal(isKnownEventType("guided_evening"), true);
  assert.deepEqual(payloadSchemaErrors("guided_evening", summary), []);
  for (const payload of [
    {},
    { ...summary, mode: "telescope" },
    { ...summary, stepCount: 0 },
    { ...summary, placeName: "Camping du Lac Noir" },
    { ...summary, version: undefined },
  ])
    assert.notDeepEqual(
      payloadSchemaErrors(
        "guided_evening",
        JSON.parse(JSON.stringify(payload)),
      ),
      [],
      JSON.stringify(payload),
    );
});
