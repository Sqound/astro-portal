import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { assertInvalid, assertValid } from "./schema-assert.mjs";

// Validates the event-type registry
// (packages/astro-contracts/schemas/session-events.md): the envelope and the
// eight typed payloads it names. Every "invalid" case here also appears in
// the registry document's own "Invalid:" line for that type, so the two stay
// in sync by construction.
const schemasDirectory = new URL("../schemas/session-events/", import.meta.url);
const schema = async (name) =>
  JSON.parse(
    await readFile(new URL(`${name}.schema.json`, schemasDirectory), "utf8"),
  );

test("event-envelope.schema.json accepts a well-formed event", async () => {
  const envelope = await schema("event-envelope");
  assertValid(envelope, {
    eventId: "01J8Z3K9QZ6N3S6R3E6G8H1234",
    type: "note",
    payload: { text: "Guide star lost after the meridian flip." },
    recordedAt: "2026-09-19T21:14:03.000Z",
  });
});

test("event-envelope.schema.json rejects a malformed eventId, an unregistered type, and a missing recordedAt", async () => {
  const envelope = await schema("event-envelope");
  const base = {
    eventId: "01J8Z3K9QZ6N3S6R3E6G8H1234",
    type: "note",
    payload: { text: "Guide star lost." },
    recordedAt: "2026-09-19T21:14:03.000Z",
  };
  assertInvalid(envelope, { ...base, eventId: "not-a-ulid" });
  assertInvalid(envelope, { ...base, eventId: "01j8z3k9qz6n3s6r3e6g8h1234" }); // lowercase
  assertInvalid(envelope, { ...base, type: "exposure_started" }); // not in the registry
  const { recordedAt, ...withoutRecordedAt } = base;
  assertInvalid(envelope, withoutRecordedAt);
  assertInvalid(envelope, { ...base, originDeviceId: "device-1" }); // server-assigned, never client-supplied
});

test("event-envelope.schema.json registers the types, the four kinds detected by Astro Sync and the pointing-device kinds included", async () => {
  const envelope = await schema("event-envelope");
  assert.deepEqual(envelope.properties.type.enum, [
    "note",
    "target_started",
    "target_finished",
    "target_skipped",
    "pause",
    "resume",
    "condition",
    "equipment_issue",
    "auto_time_confirmed",
    "exposure_change",
    "guiding_timeouts",
    "sensor_temperature_drift",
    "guiding_spikes",
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
    "plan_edited",
    "device_instrument",
    "guided_evening",
  ]);
  assertValid(envelope, {
    eventId: "01J8Z3K9QZ6N3S6R3E6G8H1234",
    type: "target_skipped",
    payload: { targetId: "m45", planItemId: "m45", reason: "weather" },
    recordedAt: "2026-09-19T21:14:03.000Z",
  });
  // Registry types are snake_case, registry FILES kebab-case: every name the
  // envelope lists has a schema file, and no file is left unlisted.
  const files = (await readdir(schemasDirectory))
    .filter((name) => name.endsWith(".schema.json"))
    .map((name) => name.replace(".schema.json", ""))
    .filter((name) => name !== "event-envelope");
  assert.deepEqual(
    envelope.properties.type.enum
      .map((type) => type.replaceAll("_", "-"))
      .sort(),
    files.sort(),
  );
});

test("note.schema.json accepts a field note, with or without a target", async () => {
  const note = await schema("note");
  assertValid(note, { text: "Guide star lost after the meridian flip." });
  assertValid(note, {
    text: "Bright meteor crossed the frame.",
    targetId: "m31",
  });
});

test("note.schema.json rejects an empty payload and an empty text", async () => {
  const note = await schema("note");
  assertInvalid(note, {});
  assertInvalid(note, { text: "" });
  assertInvalid(note, { text: "Fine.", extra: true });
});

test("target-started.schema.json accepts a catalogue target or a custom label", async () => {
  const targetStarted = await schema("target-started");
  assertValid(targetStarted, { targetId: "m31", planItemId: "item-7" });
  assertValid(targetStarted, {
    targetLabel: "Faint nova candidate near Cygnus",
  });
});

test("target-started.schema.json rejects an event naming no target at all", async () => {
  const targetStarted = await schema("target-started");
  assertInvalid(targetStarted, {});
  assertInvalid(targetStarted, { notes: "Starting now." });
});

test("target-started.schema.json rejects a wrong-typed targetId and an unknown field", async () => {
  const targetStarted = await schema("target-started");
  assertInvalid(targetStarted, { targetId: 123 });
  assertInvalid(targetStarted, { targetId: "m31", exposureCount: 12 });
});

test("target-finished.schema.json accepts a catalogue target or a custom label", async () => {
  const targetFinished = await schema("target-finished");
  assertValid(targetFinished, {
    targetId: "m31",
    notes: "Clouds rolled in, cut it short.",
  });
  assertValid(targetFinished, { targetLabel: "Faint nova candidate" });
});

test("target-finished.schema.json rejects an event naming no target at all", async () => {
  const targetFinished = await schema("target-finished");
  assertInvalid(targetFinished, {});
  assertInvalid(targetFinished, { planItemId: "item-7" });
});

test("target-finished.schema.json rejects an unknown field", async () => {
  const targetFinished = await schema("target-finished");
  assertInvalid(targetFinished, { targetId: "m31", outcome: "completed" });
});

test("target-skipped.schema.json accepts a reason, a free label and no reason at all", async () => {
  const targetSkipped = await schema("target-skipped");
  assertValid(targetSkipped, {
    targetId: "m45",
    planItemId: "m45",
    reason: "weather",
  });
  assertValid(targetSkipped, {
    targetId: "ngc7000",
    reason: "other",
    notes: "Neighbour's floodlight.",
  });
  // A target left unticked in a partial debriefing carries no reason: "did
  // not say" is a legitimate answer and the commonest one.
  assertValid(targetSkipped, { targetId: "m45" });
  assertValid(targetSkipped, { targetLabel: "Faint nova candidate" });
  for (const reason of ["weather", "equipment", "time", "visibility", "other"])
    assertValid(targetSkipped, { targetId: "m45", reason });
});

test("target-skipped.schema.json rejects an event naming no target at all", async () => {
  const targetSkipped = await schema("target-skipped");
  assertInvalid(targetSkipped, {});
  assertInvalid(targetSkipped, { reason: "weather" });
});

test("target-skipped.schema.json keeps the reason list closed and the payload closed", async () => {
  const targetSkipped = await schema("target-skipped");
  assertInvalid(targetSkipped, { targetId: "m45", reason: "clouds" });
  assertInvalid(targetSkipped, { targetId: "m45", reason: "moon" });
  assertInvalid(targetSkipped, { targetId: "m45", reason: "" });
  // Not a verdict on quality, and not a state field: the done/modified
  // classification stays in the debrief, never in the journal.
  assertInvalid(targetSkipped, { targetId: "m45", state: "skipped" });
  assertInvalid(targetSkipped, { targetId: "m45", outcome: "skipped" });
  assertInvalid(targetSkipped, { targetId: "m45", notes: "x".repeat(301) });
  assert.deepEqual(targetSkipped.properties.reason.enum, [
    "weather",
    "equipment",
    "time",
    "visibility",
    "other",
  ]);
});

test("target-skipped.schema.json mirrors target-started's identification fields", async () => {
  const targetSkipped = await schema("target-skipped");
  const targetStarted = await schema("target-started");
  for (const field of ["targetId", "targetLabel", "planItemId"])
    assert.deepEqual(
      { ...targetSkipped.properties[field], description: undefined },
      { ...targetStarted.properties[field], description: undefined },
    );
  // The same allOf/anyOf workaround, so the two behave identically under the
  // package's own validator and under a real one.
  assert.deepEqual(targetSkipped.allOf, targetStarted.allOf);
  assert.equal(targetSkipped.additionalProperties, false);
});

test("pause.schema.json accepts an empty payload and an optional reason", async () => {
  const pause = await schema("pause");
  assertValid(pause, {});
  assertValid(pause, { reason: "Meridian flip." });
});

test("pause.schema.json rejects a wrong-typed reason and an unknown field", async () => {
  const pause = await schema("pause");
  assertInvalid(pause, { reason: 12 });
  assertInvalid(pause, { note: "Wrong field name." });
});

test("resume.schema.json accepts an empty payload and an optional note", async () => {
  const resume = await schema("resume");
  assertValid(resume, {});
  assertValid(resume, { note: "Sky cleared up." });
});

test("resume.schema.json rejects a wrong-typed note", async () => {
  const resume = await schema("resume");
  assertInvalid(resume, { note: null });
});

test("resume.schema.json accepts what the phone's resume sheet writes: the policy and the real pause duration", async () => {
  const resume = await schema("resume");
  assertValid(resume, { policy: "crop", pauseDurationMinutes: 25 });
  assertValid(resume, { policy: "shift", pauseDurationMinutes: 7.5 });
  assertValid(resume, {
    note: "Sky cleared up.",
    policy: "shift",
    pauseDurationMinutes: 0,
  });
  assertValid(resume, { policy: "crop" });
  assertValid(resume, { pauseDurationMinutes: 12 });
});

test("resume.schema.json rejects an unknown policy, a negative or non-numeric duration and any other field", async () => {
  const resume = await schema("resume");
  assertInvalid(resume, { policy: "stretch" });
  assertInvalid(resume, { policy: null });
  assertInvalid(resume, { pauseDurationMinutes: -1 });
  assertInvalid(resume, { pauseDurationMinutes: "25" });
  assertInvalid(resume, { pauseDurationMinutes: null });
  assertInvalid(resume, { duration: 25 });
});

test("condition.schema.json accepts a single tapped field", async () => {
  const condition = await schema("condition");
  assertValid(condition, { sky: "clear" });
  assertValid(condition, { seeing: 4 });
  assertValid(condition, { notes: "Hazy near the horizon." });
  assertValid(condition, { sky: "partly_cloudy", seeing: 3, transparency: 2 });
});

// 43a: the execution screen's sky sheet offers « Clair », « Voilé » and
// « Nuageux » and records them as `sky: clear | hazy | cloudy`; the schema
// refused the last two, so the event was rejected at sync.
test("condition.schema.json accepts every sky state the execution screen's sheet records, hazy and cloudy included", async () => {
  const condition = await schema("condition");
  const ingest = JSON.parse(
    await readFile(
      new URL(
        "../schemas/api/session-event-ingest.schema.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.deepEqual(condition.properties.sky.enum, [
    "clear",
    "mostly_clear",
    "partly_cloudy",
    "mostly_cloudy",
    "overcast",
    "fog",
    "hazy",
    "cloudy",
  ]);
  for (const sky of ["clear", "hazy", "cloudy"]) {
    assertValid(condition, { sky });
    const envelope = {
      eventId: "01J8Z3K9QZ6N3S6R3E6G8H1234",
      type: "condition",
      payload: { sky },
      recordedAt: "2026-09-19T21:14:03.000Z",
    };
    assertValid(await schema("event-envelope"), envelope);
    // The ingest contract dispatches the payload by type to this schema.
    const branch = ingest.$defs.eventPayloadByType.oneOf.find(
      (candidate) => candidate.properties.type.const === "condition",
    );
    assert.equal(
      branch.properties.payload.$ref,
      "../session-events/condition.schema.json",
    );
  }
});

test("condition.schema.json rejects an empty payload, an out-of-range scale, and an unknown sky value", async () => {
  const condition = await schema("condition");
  assertInvalid(condition, {});
  assertInvalid(condition, { seeing: 6 });
  assertInvalid(condition, { seeing: 0 });
  assertInvalid(condition, { sky: "sunny" });
});

test("condition.schema.json rejects an unknown field even when a valid field is also present", async () => {
  const condition = await schema("condition");
  assertInvalid(condition, { sky: "clear", windKph: 12 });
});

test("equipment-issue.schema.json accepts a description alone, and with equipment and severity", async () => {
  const equipmentIssue = await schema("equipment-issue");
  assertValid(equipmentIssue, { description: "Dew on the corrector plate." });
  assertValid(equipmentIssue, {
    description: "Guiding lost, RMS spiking.",
    equipmentId: "scope-1",
    severity: "blocking",
  });
});

test("equipment-issue.schema.json rejects a missing description and an unknown severity", async () => {
  const equipmentIssue = await schema("equipment-issue");
  assertInvalid(equipmentIssue, {});
  assertInvalid(equipmentIssue, { severity: "blocking" });
  assertInvalid(equipmentIssue, {
    description: "Mount stalled.",
    severity: "critical",
  });
});

test("every session-event schema declares a 2020-12 $schema and a stable $id", async () => {
  const names = [
    "event-envelope",
    "note",
    "target-started",
    "target-finished",
    "target-skipped",
    "pause",
    "resume",
    "condition",
    "equipment-issue",
  ];
  for (const name of names) {
    const document = await schema(name);
    assert.equal(
      document.$schema,
      "https://json-schema.org/draft/2020-12/schema",
    );
    assert.equal(
      document.$id,
      `https://astroportal.invalid/schemas/session-events/${name}.schema.json`,
    );
  }
});

const PAUSE_CAUSES = [
  "clouds",
  "wind",
  "dew",
  "guiding",
  "meridian_flip",
  "equipment",
  // The eighth cause.
  "fatigue",
  "other",
];

test("pause.schema.json accepts each of the eight causes, and the one-tap pause stays valid", async () => {
  const pause = await schema("pause");
  assertValid(pause, {});
  for (const cause of PAUSE_CAUSES) assertValid(pause, { cause });
  assertValid(pause, { cause: "wind", reason: "Gusts on the ridge." });
  assert.deepEqual(pause.properties.cause.enum, PAUSE_CAUSES);
});

test("pause.schema.json refuses a cause outside the closed list", async () => {
  const pause = await schema("pause");
  assertInvalid(pause, { cause: "rain" });
  assertInvalid(pause, { cause: "weather" });
  assertInvalid(pause, { cause: "" });
});

test("note.schema.json carries a pause-cause correction without text, and keeps the same list as pause", async () => {
  const note = await schema("note");
  const pause = await schema("pause");
  assertValid(note, {
    pauseCause: { pauseEventId: "01J8Z3K9QZ6N3S6R3E6G8H1234", cause: "wind" },
  });
  assertValid(note, {
    text: "Gusts.",
    pauseCause: { pauseEventId: "01J8Z3K9QZ6N3S6R3E6G8H1234", cause: "dew" },
  });
  assertInvalid(note, { pauseCause: { cause: "wind" } });
  assertInvalid(note, {
    pauseCause: { pauseEventId: "not-a-ulid", cause: "wind" },
  });
  assertInvalid(note, {
    pauseCause: { pauseEventId: "01J8Z3K9QZ6N3S6R3E6G8H1234", cause: "rain" },
  });
  assertInvalid(note, {
    pauseCause: {
      pauseEventId: "01J8Z3K9QZ6N3S6R3E6G8H1234",
      cause: "wind",
      minutes: 5,
    },
  });
  assert.deepEqual(
    note.properties.pauseCause.properties.cause.enum,
    pause.properties.cause.enum,
  );
});

test("note.schema.json carries the stretch the application did not run, without text", async () => {
  const note = await schema("note");
  assertValid(note, {
    appStopped: {
      from: "2026-10-02T21:12:00.000Z",
      to: "2026-10-02T21:40:00.000Z",
    },
  });
  assertValid(note, {
    appStopped: {
      from: "2026-10-02T23:12:00+02:00",
      to: "2026-10-02T23:40:00.123+02:00",
    },
  });
  assertValid(note, {
    text: "Phone restarted.",
    appStopped: {
      from: "2026-10-02T21:12:00.000Z",
      to: "2026-10-02T21:40:00.000Z",
    },
  });
});

test("note.schema.json refuses a malformed appStopped interval", async () => {
  const note = await schema("note");
  assertInvalid(note, { appStopped: { from: "2026-10-02T21:12:00.000Z" } });
  assertInvalid(note, { appStopped: { to: "2026-10-02T21:40:00.000Z" } });
  assertInvalid(note, { appStopped: { from: "23:12", to: "23:40" } });
  assertInvalid(note, {
    appStopped: { from: "2026-10-02", to: "2026-10-02T21:40:00.000Z" },
  });
  assertInvalid(note, {
    appStopped: { from: 1727903520000, to: 1727905200000 },
  });
  assertInvalid(note, {
    appStopped: {
      from: "2026-10-02T21:12:00.000Z",
      to: "2026-10-02T21:40:00.000Z",
      minutes: 28,
    },
  });
  assertInvalid(note, { appStopped: "2026-10-02T21:12:00.000Z" });
});

test("condition.schema.json accepts a sky cause alone and refuses one outside clouds, wind, dew", async () => {
  const condition = await schema("condition");
  for (const cause of ["clouds", "wind", "dew"])
    assertValid(condition, { cause });
  assertValid(condition, { sky: "overcast", cause: "clouds" });
  assertInvalid(condition, { cause: "guiding" });
  assertInvalid(condition, { cause: "fog" });
});

// The automatic or manual move to the next target: the additive
// `auto` and `advance` fields of the target events, and the ninth type,
// `auto_time_confirmed`.

test("target-started.schema.json accepts a clock-written start (auto, advance) and a gesture's manual start", async () => {
  const targetStarted = await schema("target-started");
  assertValid(targetStarted, {
    targetId: "m33",
    planItemId: "m33",
    auto: true,
    advance: "auto",
  });
  assertValid(targetStarted, { targetId: "m33", advance: "manual" });
  assertValid(targetStarted, { targetLabel: "Comète", advance: "auto" });
});

test("target-started.schema.json refuses auto other than true and an advance outside auto/manual", async () => {
  const targetStarted = await schema("target-started");
  assertInvalid(targetStarted, { targetId: "m33", auto: false });
  assertInvalid(targetStarted, { targetId: "m33", auto: "true" });
  assertInvalid(targetStarted, { targetId: "m33", advance: "clock" });
  assertInvalid(targetStarted, { targetId: "m33", advance: true });
  // `auto` names no target on its own.
  assertInvalid(targetStarted, { auto: true, advance: "auto" });
});

test("target-finished.schema.json accepts auto: true, refuses auto: false and advance (a start-only field)", async () => {
  const targetFinished = await schema("target-finished");
  assertValid(targetFinished, {
    targetId: "m31",
    planItemId: "m31",
    auto: true,
  });
  assertInvalid(targetFinished, { targetId: "m31", auto: false });
  assertInvalid(targetFinished, { targetId: "m31", advance: "auto" });
});

test("auto-time-confirmed.schema.json names one target like the target events, and nothing else", async () => {
  const confirmed = await schema("auto-time-confirmed");
  assertValid(confirmed, { targetId: "m31", planItemId: "m31" });
  assertValid(confirmed, { targetLabel: "Comète" });
  assertInvalid(confirmed, {});
  assertInvalid(confirmed, { planItemId: "m31" });
  assertInvalid(confirmed, { targetId: "m31", minutes: 90 });
  assertInvalid(confirmed, { targetId: "m31", auto: true });
  const envelope = await schema("event-envelope");
  assertValid(envelope, {
    eventId: "01J8Z3K9QZ6N3S6R3E6G8H1234",
    type: "auto_time_confirmed",
    payload: { targetId: "m31", planItemId: "m31" },
    recordedAt: "2026-10-02T23:40:00.000Z",
  });
});

test("the ingest contract's own event-type list and payload dispatch name auto_time_confirmed", async () => {
  const ingest = JSON.parse(
    await readFile(
      new URL(
        "../schemas/api/session-event-ingest.schema.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const envelope = await schema("event-envelope");
  assert.deepEqual(ingest.$defs.eventType.enum, envelope.properties.type.enum);
  const dispatched = ingest.$defs.eventPayloadByType.oneOf.map(
    (branch) => branch.properties.type.const,
  );
  assert.deepEqual(dispatched, envelope.properties.type.enum);
  const branch = ingest.$defs.eventPayloadByType.oneOf.find(
    (candidate) => candidate.properties.type.const === "auto_time_confirmed",
  );
  assert.equal(
    branch.properties.payload.$ref,
    "../session-events/auto-time-confirmed.schema.json",
  );
});

// The four kinds detected by Astro
// Sync, and the additive `source` of a stored event.
const at = (time) => `2026-08-15T${time}Z`;

test("exposure_change carries both exposures, in seconds, and an optional sentence", async () => {
  const payload = await schema("exposure-change");
  assertValid(payload, { fromSeconds: 120, toSeconds: 180 });
  assertValid(payload, {
    fromSeconds: 0.5,
    toSeconds: 180,
    description: "Durée de pose changée : de 0,5 s à 180 s",
  });
  assertInvalid(payload, { toSeconds: 180 });
  assertInvalid(payload, { fromSeconds: 120 });
  assertInvalid(payload, { fromSeconds: 0, toSeconds: 180 });
  assertInvalid(payload, { fromSeconds: "120", toSeconds: 180 });
  assertInvalid(payload, { fromSeconds: 120, toSeconds: 180, filter: "L" });
  assertInvalid(payload, { fromSeconds: 120, toSeconds: 180, description: "" });
});

test("guiding_timeouts and guiding_spikes are one group each: a count and a span", async () => {
  const timeouts = await schema("guiding-timeouts");
  assertValid(timeouts, {
    count: 11,
    firstAt: at("23:44:10"),
    lastAt: at("05:44:02.500"),
  });
  assertInvalid(timeouts, {
    count: 0,
    firstAt: at("23:44:10"),
    lastAt: at("23:44:10"),
  });
  assertInvalid(timeouts, {
    count: 1.5,
    firstAt: at("23:44:10"),
    lastAt: at("23:44:10"),
  });
  assertInvalid(timeouts, { count: 3 });
  assertInvalid(timeouts, { count: 3, firstAt: "23:44", lastAt: "05:44" });
  const spikes = await schema("guiding-spikes");
  assertValid(spikes, {
    count: 3,
    maxArcSeconds: 9,
    firstAt: at("02:10:00"),
    lastAt: at("03:08:00"),
  });
  assertInvalid(spikes, {
    count: 3,
    firstAt: at("02:10:00"),
    lastAt: at("03:08:00"),
  });
  assertInvalid(spikes, {
    count: 3,
    maxArcSeconds: -1,
    firstAt: at("02:10:00"),
    lastAt: at("03:08:00"),
  });
});

test("sensor_temperature_drift carries two temperatures in degrees Celsius", async () => {
  const payload = await schema("sensor-temperature-drift");
  assertValid(payload, { fromCelsius: -10, toCelsius: -6 });
  assertValid(payload, { fromCelsius: -10.1, toCelsius: -9.8 });
  assertInvalid(payload, { fromCelsius: -10 });
  assertInvalid(payload, { fromCelsius: -10, toCelsius: "-6" });
  assertInvalid(payload, { fromCelsius: -400, toCelsius: -6 });
});

test("the four detected kinds go through the envelope and the ingest dispatch, each to its own file", async () => {
  const envelope = await schema("event-envelope");
  const ingest = JSON.parse(
    await readFile(
      new URL(
        "../schemas/api/session-event-ingest.schema.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (const [type, file, payload] of [
    [
      "exposure_change",
      "exposure-change",
      { fromSeconds: 120, toSeconds: 180 },
    ],
    [
      "guiding_timeouts",
      "guiding-timeouts",
      { count: 2, firstAt: at("01:00:00"), lastAt: at("01:10:00") },
    ],
    [
      "sensor_temperature_drift",
      "sensor-temperature-drift",
      { fromCelsius: -10, toCelsius: -6 },
    ],
    [
      "guiding_spikes",
      "guiding-spikes",
      {
        count: 1,
        maxArcSeconds: 5,
        firstAt: at("02:10:00"),
        lastAt: at("02:10:00"),
      },
    ],
  ]) {
    assertValid(envelope, {
      eventId: "01J8Z3K9QZ6N3S6R3E6G8H1234",
      type,
      payload,
      recordedAt: at("01:00:00.000"),
    });
    const branch = ingest.$defs.eventPayloadByType.oneOf.find(
      (candidate) => candidate.properties.type.const === type,
    );
    assert.equal(
      branch.properties.payload.$ref,
      `../session-events/${file}.schema.json`,
    );
    assertValid(await schema(file), payload);
  }
});

test("a stored event may carry the server-set source, declared or astro-sync, and the envelope never accepts it", async () => {
  const ingest = JSON.parse(
    await readFile(
      new URL(
        "../schemas/api/session-event-ingest.schema.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.deepEqual(ingest.$defs.source.enum, ["declared", "astro-sync"]);
  assert.equal(
    ingest.$defs.storedEnvelope.properties.source.$ref,
    "#/$defs/source",
  );
  assert.ok(!ingest.$defs.storedEnvelope.required.includes("source"));
  const envelope = await schema("event-envelope");
  assertInvalid(envelope, {
    eventId: "01J8Z3K9QZ6N3S6R3E6G8H1234",
    type: "guiding_spikes",
    payload: {
      count: 1,
      maxArcSeconds: 5,
      firstAt: at("02:10:00"),
      lastAt: at("02:10:00"),
    },
    recordedAt: at("02:10:00.000"),
    source: "astro-sync",
  });
});

// The mount's events are kept in the session.
// Additive: every field but the ones marked required is optional.
test("the pointing-device kinds accept an event with no optional field and refuse a position, a missing outcome and an unknown word", async () => {
  const bare = [
    ["mount_connected", "mount-connected"],
    ["mount_stop", "mount-stop"],
    ["mount_link_lost", "mount-link-lost"],
    ["mount_link_back", "mount-link-back"],
    ["mount_disconnected", "mount-disconnected"],
    ["device_connected", "device-connected"],
    ["device_stop", "device-stop"],
    ["device_link_lost", "device-link-lost"],
    ["device_link_back", "device-link-back"],
  ];
  for (const [, file] of bare) {
    const payload = await schema(file);
    assertValid(payload, {});
    assertInvalid(payload, { raHours: 0.7 }); // a position is never written
  }
  const goto = await schema("mount-goto");
  assertValid(goto, { outcome: "sent" });
  assertValid(goto, {
    outcome: "arrived",
    targetId: "m110",
    targetLabel: "M110",
    gapDegrees: 0.2,
  });
  assertValid(goto, {
    outcome: "refused",
    targetLabel: "Saturne",
    refusedBy: "safety",
    reason: "below_horizon",
  });
  assertInvalid(goto, { targetId: "m110" }); // no outcome
  assertInvalid(goto, { outcome: "done" });
  assertInvalid(goto, { outcome: "arrived", gapDegrees: -1 });
  assertInvalid(goto, { outcome: "arrived", gapDegrees: 181 });
  assertInvalid(goto, { outcome: "refused", refusedBy: "nobody" });
  const parked = await schema("mount-parked");
  for (const outcome of ["requested", "parked", "refused"])
    assertValid(parked, { outcome });
  assertInvalid(parked, {});
  assertInvalid(parked, { outcome: "unparked" });
  const aligned = await schema("mount-aligned");
  assertValid(aligned, { outcome: "synced", targetId: "m110" });
  assertValid(aligned, { outcome: "refused", refusedBy: "mount" });
  assertInvalid(aligned, { targetId: "m110" });
  const stop = await schema("mount-stop");
  assertValid(stop, { cause: "person", protocol: "LX200" });
  assertValid(stop, { cause: "night_end" });
  assertInvalid(stop, { cause: "weather" });
  const help = await schema("pointing-help");
  assertValid(help, { method: "mount", outcome: "centred", rounds: 2 });
  assertValid(help, { method: "manual", outcome: "centred", gapDegrees: 0.3 });
  assertInvalid(help, { method: "mount" });
  assertInvalid(help, { outcome: "centred" });
  assertInvalid(help, { method: "gps", outcome: "centred" });
  assertInvalid(help, { method: "mount", outcome: "centred", rounds: 1.5 });
  // MOUNT-POINTING-CAP-01: the decision on a turn over 3 degrees.
  assertValid(help, {
    method: "mount",
    outcome: "failed",
    turnAskedDegrees: 12,
    turnAnswer: "declined",
  });
  assertValid(help, {
    method: "mount",
    outcome: "centred",
    turnAskedDegrees: 3.4,
    turnAnswer: "continued",
  });
  assertInvalid(help, {
    method: "mount",
    outcome: "failed",
    turnAnswer: "maybe",
  });
  assertValid(help, {
    method: "mount",
    outcome: "centred",
    rounds: 2,
    gapDegrees: 0.02,
    sensor: "camera",
  });
  assertInvalid(help, { method: "mount", outcome: "centred", sensor: "gyro" });
  assertInvalid(help, {
    method: "mount",
    outcome: "failed",
    turnAskedDegrees: -1,
  });
  const deviceGoto = await schema("device-goto");
  assertValid(deviceGoto, { outcome: "sent", family: "origin" });
  assertInvalid(deviceGoto, { family: "origin" });
  const deviceParked = await schema("device-parked");
  assertValid(deviceParked, { outcome: "requested" });
  assertInvalid(deviceParked, { outcome: "parked" }); // only requested or refused
});

test("the pointing-device kinds go through the envelope and the ingest dispatch, each to its own file", async () => {
  const envelope = await schema("event-envelope");
  const ingest = JSON.parse(
    await readFile(
      new URL(
        "../schemas/api/session-event-ingest.schema.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.deepEqual(ingest.$defs.eventType.enum, envelope.properties.type.enum);
  const types = envelope.properties.type.enum.slice(13, 27);
  assert.equal(types.length, 14);
  for (const type of types) {
    const file = type.replaceAll("_", "-");
    const branch = ingest.$defs.eventPayloadByType.oneOf.find(
      (candidate) => candidate.properties.type.const === type,
    );
    assert.equal(
      branch.properties.payload.$ref,
      `../session-events/${file}.schema.json`,
    );
    const required = (await schema(file)).required ?? [];
    const payload = Object.fromEntries(
      required.map((key) => [
        key,
        key === "method" ? "mount" : key === "outcome" ? "sent" : "x",
      ]),
    );
    if (file === "device-parked") payload.outcome = "requested";
    if (file === "mount-parked") payload.outcome = "requested";
    if (file === "mount-aligned") payload.outcome = "synced";
    if (file === "pointing-help") payload.outcome = "centred";
    assertValid(envelope, {
      eventId: "01J8Z3K9QZ6N3S6R3E6G8H1234",
      type,
      payload,
      recordedAt: at("01:00:00.000"),
    });
    assertValid(await schema(file), payload);
  }
});

test("plan-edited.schema.json accepts an add with its slot, a move with its new hours and a removal, and nothing else", async () => {
  const edited = await schema("plan-edited");
  assertValid(edited, {
    origin: "add",
    added: [
      { targetId: "m45", planItemId: "m45", startMinute: 294, endMinute: 354 },
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
  });
  assertValid(edited, { origin: "undo", removed: [{ targetLabel: "M45" }] });
  assertValid(edited, {
    moved: [{ targetId: "m41", startMinute: 0, endMinute: 20 }],
  });
  assertInvalid(edited, {}); // nothing changed
  assertInvalid(edited, { added: [] });
  assertInvalid(edited, { added: [{ targetId: "m45" }] }); // no slot
  assertInvalid(edited, {
    added: [{ startMinute: 10, endMinute: 20 }], // neither targetId nor targetLabel
  });
  assertInvalid(edited, { removed: [{ planItemId: "m45" }] });
  assertInvalid(edited, { origin: "web", removed: [{ targetId: "m45" }] });
  assertInvalid(edited, {
    added: [{ targetId: "m45", startMinute: -1, endMinute: 20 }],
  });
  assertInvalid(edited, {
    removed: [{ targetId: "m45" }],
    plan: { items: [] }, // the plan itself is never written
  });
});

test("plan_edited goes through the envelope and the ingest dispatch, to its own file", async () => {
  const envelope = await schema("event-envelope");
  const ingest = JSON.parse(
    await readFile(
      new URL(
        "../schemas/api/session-event-ingest.schema.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const branch = ingest.$defs.eventPayloadByType.oneOf.find(
    (candidate) => candidate.properties.type.const === "plan_edited",
  );
  assert.equal(
    branch.properties.payload.$ref,
    "../session-events/plan-edited.schema.json",
  );
  assertValid(envelope, {
    eventId: "01J8Z3K9QZ6N3S6R3E6G8H1234",
    type: "plan_edited",
    payload: {
      origin: "add",
      added: [{ targetId: "m45", startMinute: 294, endMinute: 354 }],
    },
    recordedAt: at("01:00:00.000"),
  });
});

// SMART-SCOPE-INSTRUMENT-PANEL-01 (contract revision 2026-11-03): a sample of
// what a smart telescope says of itself, every 5 minutes and at each change.
test("device_instrument accepts a sample with at least one reading and refuses a position, the device's raw filter word and a sentence for a cause", async () => {
  const instrument = await schema("device-instrument");
  assertValid(instrument, {
    family: "vespera",
    reason: "change",
    targetLabel: "IC 1805",
    captureId: "observation-253",
    filter: "dual_band",
    humidity: 81,
    temperature: 12,
    dewPointDepression: 4,
    heater: "on",
    battery: 74,
    framesTaken: 13,
    framesStacked: 9,
    framesRejected: 4,
    rejections: [{ cause: "StackingRoundnessError", count: 4 }],
  });
  assertValid(instrument, { filter: "other", filterLabel: "IR" });
  assertValid(instrument, { heater: "off" });
  assertValid(instrument, {
    family: "vespera",
    origin: "rebuilt",
    endedAt: "2026-11-02T21:12:00.000Z",
    targetLabel: "M45",
    pointingFailures: 6,
    pointingAbandoned: true,
  });
  assertValid(instrument, {
    family: "seestar",
    filter: "light_pollution",
    boardTemperature: 41,
    overheated: true,
    framesRejected: 2,
    rejections: [{ cause: "star_trails", count: 1 }],
  });
  assertInvalid(instrument, {}); // no reading
  assertInvalid(instrument, { family: "vespera" }); // no reading
  assertInvalid(instrument, { filter: "DUAL" }); // the device's word goes in filterLabel
  assertInvalid(instrument, { humidity: 81, ra: 40.5 }); // a position is never written
  assertInvalid(instrument, { humidity: 120 });
  assertInvalid(instrument, { battery: 74.5 });
  assertInvalid(instrument, {
    framesRejected: 4,
    rejections: [{ cause: "étoiles non rondes", count: 4 }],
  }); // a cause is a machine word, never a sentence
  assertInvalid(instrument, { heater: "LOW_DD" });
  assertInvalid(instrument, { origin: "guessed", battery: 50 });
});

test("device_instrument goes through the envelope and the ingest dispatch, to its own file", async () => {
  const envelope = await schema("event-envelope");
  const ingest = JSON.parse(
    await readFile(
      new URL(
        "../schemas/api/session-event-ingest.schema.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const branch = ingest.$defs.eventPayloadByType.oneOf.find(
    (candidate) => candidate.properties.type.const === "device_instrument",
  );
  assert.equal(
    branch.properties.payload.$ref,
    "../session-events/device-instrument.schema.json",
  );
  assertValid(envelope, {
    eventId: "01J8Z3K9QZ6N3S6R3E6G8H1234",
    type: "device_instrument",
    payload: { family: "vespera", filter: "none", heater: "off" },
    recordedAt: "2026-11-02T21:46:00.000Z",
  });
});

test("an envelope of the revision before device_instrument refuses it: a reader that predates it must tolerate it, never validate it", async () => {
  // The registry's rule: « A reader MUST tolerate a type it does not know ».
  // The previous revision's envelope is this one without the new type.
  const envelope = await schema("event-envelope");
  const before = structuredClone(envelope);
  before.properties.type.enum = before.properties.type.enum.filter(
    (type) => type !== "device_instrument",
  );
  assertInvalid(before, {
    eventId: "01J8Z3K9QZ6N3S6R3E6G8H1234",
    type: "device_instrument",
    payload: { battery: 74 },
    recordedAt: "2026-11-02T21:46:00.000Z",
  });
  const registry = await readFile(
    new URL("../schemas/session-events.md", import.meta.url),
    "utf8",
  );
  assert.match(registry, /## The instrument kind/);
  assert.match(registry, /predates it stores it or ignores it/);
});

// GUIDED-EVENING-04: a guided evening that ran under the night ended.

const guidedEvening = {
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

test("guided-evening.schema.json accepts the evening's summary, versioned, and nothing personal", async () => {
  const evening = await schema("guided-evening");
  assertValid(evening, guidedEvening);
  // The optional fields left out.
  assertValid(evening, {
    version: 1,
    evening: "season-constellations",
    mode: "naked",
    stepsSeen: 0,
    stepCount: 8,
    startedAt: "2026-10-14T19:40:00Z",
    finishedAt: "2026-10-14T19:41:00Z",
  });
  assertInvalid(evening, {});
  const { version: _version, ...noVersion } = guidedEvening;
  assertInvalid(evening, noVersion);
  assertInvalid(evening, { ...guidedEvening, mode: "telescope" });
  assertInvalid(evening, { ...guidedEvening, help: "both" });
  assertInvalid(evening, { ...guidedEvening, stepCount: 0 });
  assertInvalid(evening, { ...guidedEvening, stepsSeen: -1 });
  assertInvalid(evening, { ...guidedEvening, startedAt: "19:40" });
  assertInvalid(evening, { ...guidedEvening, evening: "Les dix étoiles" });
  // Nothing personal is ever written.
  assertInvalid(evening, {
    ...guidedEvening,
    placeName: "Camping du Lac Noir",
  });
});

test("guided_evening goes through the envelope and the ingest dispatch, to its own file", async () => {
  const envelope = await schema("event-envelope");
  const ingest = JSON.parse(
    await readFile(
      new URL(
        "../schemas/api/session-event-ingest.schema.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.deepEqual(ingest.$defs.eventType.enum, envelope.properties.type.enum);
  const branch = ingest.$defs.eventPayloadByType.oneOf.find(
    (candidate) => candidate.properties.type.const === "guided_evening",
  );
  assert.equal(
    branch.properties.payload.$ref,
    "../session-events/guided-evening.schema.json",
  );
  assertValid(envelope, {
    eventId: "01J8Z3K9QZ6N3S6R3E6G8H1234",
    type: "guided_evening",
    payload: guidedEvening,
    recordedAt: at("20:45:00.000"),
  });
});
