import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import {
  assertInvalid,
  assertValid,
  registerExternalSchema,
} from "./schema-assert.mjs";
import {
  compareLines,
  journalFigures,
  journalPages,
  lineKey,
  seasonOf,
} from "./journal-reference.mjs";

// The contract of the Journal, one test per schema it touches, and the shared
// fixture of the list. Every addition is optional or a new value: nothing is removed.

const schemasDirectory = new URL("../schemas/", import.meta.url);
const fixturesDirectory = new URL("../fixtures/", import.meta.url);
const read = async (url) => JSON.parse(await readFile(url, "utf8"));
const schema = (relativePath) => read(new URL(relativePath, schemasDirectory));

const documents = {};
for (const name of [
  "journal",
  "session",
  "session-rework",
  "session-event-ingest",
  "debrief",
  "capture",
  "capture-variant",
  "manage-captures",
  "integration",
  "project",
  "plan",
]) {
  documents[name] = await schema(`api/${name}.schema.json`);
  registerExternalSchema(`${name}.schema.json`, documents[name]);
}
for (const name of await readdir(new URL("session-events/", schemasDirectory)))
  if (name.endsWith(".schema.json"))
    registerExternalSchema(
      `../session-events/${name}`,
      await schema(`session-events/${name}`),
    );
registerExternalSchema(
  "../planner/horizon-mask.schema.json",
  await schema("planner/horizon-mask.schema.json"),
);

const def = (file, name) => ({
  $defs: documents[file].$defs,
  $ref: `#/$defs/${name}`,
});

const SESSION = "4d2b7e10-8a6c-4f53-9b1d-7e0a3c5f2b84";
const PLAN = "9f1c0b4a-5d3e-4a21-9c7f-2b8e6d4a1c30";
const PROJECT = "5d0c6b1e-2f4a-4c8e-9b7d-3a1f0e6c2b90";
const CAPTURE = "2e7d9b31-4c06-4a8f-91b3-5f8c0d2a6e47";
const EVENT = "01J9ZP4Q8R6T2V0X1Y3Z5A7B9C";
const NOW = "2026-10-14T01:00:00.000Z";

test("session.schema.json: the resource gains outcome, origin, projectId, eveningDate and the rework revision, all optional", () => {
  const resource = def("session", "resource");
  const base = {
    id: SESSION,
    planId: PLAN,
    status: "finished",
    startedAt: "2026-08-09T19:40:00.000Z",
    finishedAt: "2026-08-10T02:20:00.000Z",
    createdAt: NOW,
    updatedAt: NOW,
  };
  assertValid(resource, base);
  const enriched = {
    ...base,
    outcome: "partial",
    origin: "debrief",
    projectId: PROJECT,
    eveningDate: "2026-08-09",
    reworkRevision: 2,
    reworkedAt: NOW,
  };
  assertValid(resource, enriched);
  assertValid(resource, {
    ...enriched,
    outcome: null,
    projectId: null,
    reworkedAt: null,
  });
  for (const outcome of ["executed", "partial", "abandoned"])
    assertValid(resource, { ...enriched, outcome });
  assertInvalid(resource, { ...enriched, outcome: "skipped" });
  assertValid(resource, { ...enriched, origin: "capture" });
  assertInvalid(resource, { ...enriched, origin: "phone" });
  assertInvalid(resource, { ...enriched, eveningDate: "2026-08-09T12:00:00Z" });
  assertInvalid(resource, { ...enriched, reworkRevision: -1 });
  // A creation says where it comes from, but only three paths are open to a client.
  const create = def("session", "createRequest");
  assertValid(create, { startedAt: NOW, origin: "astro-sync" });
  assertValid(create, { startedAt: NOW, origin: "execution" });
  assertValid(create, { startedAt: NOW, origin: "capture" });
  assertInvalid(create, { startedAt: NOW, origin: "import" });
  assertInvalid(create, { startedAt: NOW, origin: "debrief" });
  // The effective events carry the mark of the correction layer, never more.
  const stored = def("session-event-ingest", "storedEnvelope");
  const event = {
    eventId: EVENT,
    sessionId: SESSION,
    type: "note",
    recordedAt: NOW,
    receivedAt: NOW,
    originDeviceId: null,
    timing: "reconstructed",
    payload: { text: "Nuages" },
  };
  assertValid(stored, event);
  assertValid(stored, { ...event, rework: { added: true, targetId: "m31" } });
  assertValid(stored, { ...event, rework: { added: false, targetId: null } });
  assertInvalid(stored, { ...event, rework: { added: true } });
  // The chain of a signal modified.
  assertValid(stored, {
    ...event,
    rework: { added: true, targetId: null, replaces: EVENT },
  });
  assertValid(stored, {
    ...event,
    rework: { added: false, targetId: null, replacedBy: EVENT },
  });
  assertInvalid(stored, {
    ...event,
    rework: { added: true, targetId: null, replaces: "x" },
  });
  assertInvalid(stored, {
    ...event,
    rework: { added: true, targetId: "m31", by: "x" },
  });
});

test("journal.schema.json: a line, its targets, a group, the figures and the query", () => {
  const target = {
    targetId: "ic1805",
    label: "IC 1805",
    planItemId: "item-1",
    state: "planned",
    outcome: "done",
    reason: null,
    plannedSeconds: 7200,
    acquiredSeconds: 7000,
    frameCount: 70,
    filter: "Ha",
    captureId: CAPTURE,
    thumbnailUrl: `/v1/captures/${CAPTURE}/media?variant=thumbnail`,
  };
  const item = {
    sessionId: SESSION,
    planId: PLAN,
    planName: "Nuit du 9 août",
    projectId: PROJECT,
    projectName: "IC 1805",
    eveningDate: "2026-08-09",
    startedAt: "2026-08-09T19:40:00.000Z",
    finishedAt: "2026-08-10T02:20:00.000Z",
    placeName: "Col des Mélèzes",
    instrumentLabel: "Lunette 72 · Caméra couleur",
    state: "executed",
    origin: "execution",
    plannedSeconds: 7200,
    acquiredSeconds: 7000,
    frameCount: 70,
    lostReason: null,
    measured: true,
    quality: { skyBackground: 410, fwhm: 2.8, eccentricity: 0.4 },
    captureCount: 1,
    targets: [target],
    readOnly: false,
  };
  assertValid(def("journal", "item"), item);
  // `title` and `placeTimeZone` are optional and additive: an older server
  // does not send them, a newer one sends a string or `null`.
  assertValid(def("journal", "item"), {
    ...item,
    title: "Soirée à la ferme",
    placeTimeZone: "Europe/Paris",
  });
  assertValid(def("journal", "item"), {
    ...item,
    title: null,
    placeTimeZone: null,
  });
  assertInvalid(def("journal", "item"), { ...item, title: 3 });
  assertInvalid(def("journal", "item"), { ...item, placeTimeZone: 1 });
  assertValid(def("journal", "item"), {
    ...item,
    quality: null,
    measured: false,
  });
  // A past plan carried out without the application: no session yet.
  assertValid(def("journal", "item"), {
    ...item,
    sessionId: null,
    state: "to_debrief",
    origin: null,
    startedAt: null,
    finishedAt: null,
    targets: [],
  });
  // A night of a private server's catalogue: a synthetic id, read only.
  assertValid(def("journal", "item"), {
    ...item,
    sessionId: "catalogue:2025-06-01:m57",
    origin: "import",
    state: "no_plan",
    readOnly: true,
  });
  for (const state of [
    "to_debrief",
    "executed",
    "partial",
    "abandoned",
    "no_plan",
  ])
    assertValid(def("journal", "item"), { ...item, state });
  assertInvalid(def("journal", "item"), { ...item, state: "in_progress" });
  assertInvalid(def("journal", "item"), { ...item, lostReason: "boredom" });
  assertInvalid(def("journal", "item"), {
    ...item,
    quality: { skyBackground: 1, fwhm: 2 },
  });
  assertInvalid(def("journal", "item"), {
    ...item,
    targets: [{ ...target, state: "kept" }],
  });
  assertInvalid(def("journal", "item"), { ...item, extra: true });

  const group = {
    projectId: PROJECT,
    name: "IC 1805",
    targetLabel: "Nébuleuse du Cœur",
    sessionIds: [SESSION],
    acquiredSeconds: 34800,
    goalSeconds: 36000,
    planCaptureId: null,
  };
  assertValid(def("journal", "group"), group);
  assertInvalid(def("journal", "group"), { ...group, sessionIds: undefined });

  const list = {
    sessions: [item],
    groups: [group],
    years: [2026, 2025],
    instruments: ["Lunette 72 · Caméra couleur"],
    stats: { sessions: 1, acquiredSeconds: 7000, frameCount: 70 },
    nextCursor: null,
  };
  assertValid(def("journal", "list"), list);
  assertValid(def("journal", "list"), { ...list, nextCursor: "eyJvIjoxfQ" });
  assertInvalid(def("journal", "list"), { ...list, nextCursor: undefined });

  const query = def("journal", "query");
  assertValid(query, {
    year: 2026,
    instrument: "Newton 200 · Caméra mono",
    season: "summer",
    outcome: "to_debrief",
    multiNightOnly: true,
    cursor: "abc",
    limit: 50,
  });
  assertInvalid(query, { season: "monsoon" });
  assertInvalid(query, { limit: 101 });
  assertInvalid(query, { outcome: "failed" });
  // Additive: several states separated by commas.
  assertValid(query, { outcome: "executed,partial" });
  assertValid(query, { outcome: "to_debrief,executed,partial,no_plan" });
  assertInvalid(query, { outcome: "executed,failed" });
  assertInvalid(query, { outcome: "executed," });

  assertValid(def("journal", "refusal"), {
    error: { code: "invalid_request", message: "A season is one of four." },
  });
  assertInvalid(def("journal", "refusal"), {
    error: { code: "entitlement_required", message: "No." },
  });
  // The detail of a session carries the same cards.
  assertValid(def("session", "detail"), {
    session: {
      id: SESSION,
      planId: PLAN,
      status: "finished",
      startedAt: NOW,
      finishedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    },
    supplements: [],
    targets: [target],
  });
});

test("journal-sessions.json: the shared fixture is valid and agrees with the reference reading of the list", async () => {
  const fixture = await read(
    new URL("journal-sessions.json", fixturesDirectory),
  );
  for (const line of fixture.lines) assertValid(def("journal", "item"), line);
  for (const project of fixture.projects) {
    const { status, ...row } = project;
    assert.ok(["active", "finished"].includes(status));
    assertValid(def("journal", "group"), { ...row, sessionIds: [] });
  }
  const keys = fixture.lines.map(lineKey);
  assert.equal(new Set(keys).size, keys.length, "every line has its own key");
  assert.ok(
    fixture.lines.some((line) => line.sessionId === null),
    "a plan carried out without the application",
  );
  assert.ok(
    fixture.lines.some((line) => line.readOnly),
    "a night of a private server's catalogue",
  );
  assert.ok(
    fixture.projects.some((project) => project.status !== "finished"),
    "an unfinished plan draws no group",
  );
  const ids = fixture.cases.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const entry of fixture.cases) {
    const { pages } = journalPages(fixture, entry.query);
    const figures = journalFigures(fixture, entry.query);
    assert.deepEqual(entry.pages, pages, `${entry.id}: pages`);
    assert.deepEqual(entry.years, figures.years, `${entry.id}: years`);
    assert.deepEqual(
      entry.instruments,
      figures.instruments,
      `${entry.id}: instruments`,
    );
    assert.deepEqual(entry.stats, figures.stats, `${entry.id}: stats`);
    assertValid(def("journal", "query"), entry.query);
  }
  // The order is total and the unfiltered case lists every line once.
  const all = fixture.cases.find((entry) => entry.id === "all");
  assert.deepEqual(
    all.pages[0].lineIds,
    [...fixture.lines].sort(compareLines).map(lineKey),
  );
  assert.equal(all.pages[0].lineIds.length, fixture.lines.length);
  // The pages of a limited query join up into the unpaged list.
  const paged = fixture.cases.find((entry) => entry.id === "paging-by-four");
  assert.deepEqual(
    paged.pages.flatMap((page) => page.lineIds),
    all.pages[0].lineIds,
  );
  assert.deepEqual(
    paged.pages.map((page) => page.hasNext),
    [true, true, false],
  );
  // The seasons are the four of the shared rule, the new year crossed.
  assert.equal(seasonOf("2025-12-21"), "winter");
  assert.equal(seasonOf("2026-03-19"), "winter");
  assert.equal(seasonOf("2026-03-20"), "spring");
  assert.equal(seasonOf("2026-09-21"), "summer");
  assert.equal(seasonOf("2026-09-22"), "autumn");
});

test("debrief.schema.json: a target adjustment gains frames, times and removal; the request gains added targets and a reason", () => {
  const adjustment = def("debrief", "targetAdjustment");
  assertValid(adjustment, { targetId: "item-1", state: "done" });
  assertValid(adjustment, {
    targetId: "item-1",
    state: "partial",
    acquiredMinutes: 90,
    frameCount: 54,
    startedAt: "2026-08-09T20:00:00.000Z",
    finishedAt: "2026-08-09T21:30:00.000Z",
  });
  assertValid(adjustment, {
    targetId: "item-2",
    state: "skipped",
    reason: "time",
    removed: true,
  });
  assertInvalid(adjustment, {
    targetId: "item-1",
    state: "done",
    removed: "yes",
  });
  assertInvalid(adjustment, {
    targetId: "item-1",
    state: "done",
    frameCount: -1,
  });
  const request = def("debrief", "request");
  assertValid(request, { outcome: "executed" });
  assertValid(request, {
    outcome: "partial",
    sessionAdjustments: {
      targets: [{ targetId: "item-1", state: "done", frameCount: 40 }],
    },
    addedTargets: [
      {
        targetId: "m27",
        startedAt: "2026-08-09T22:00:00.000Z",
        finishedAt: "2026-08-09T23:00:00.000Z",
        acquiredMinutes: 60,
        frameCount: 30,
        filter: "Ha",
      },
    ],
  });
  // An abandoned night keeps a session, with its reason.
  assertValid(request, { outcome: "abandoned", reason: "weather" });
  assertInvalid(request, { outcome: "abandoned", reason: "boredom" });
  assertInvalid(request, {
    outcome: "executed",
    addedTargets: [{ startedAt: NOW }],
  });
  assertInvalid(request, {
    outcome: "executed",
    addedTargets: [{ targetId: "m27", plan: "x" }],
  });
  const record = def("debrief", "record");
  assertValid(record, {
    outcome: "abandoned",
    decidedAt: NOW,
    targets: [],
    reason: "weather",
  });
  assertValid(record, {
    outcome: "partial",
    decidedAt: NOW,
    targets: [
      { targetId: "item-2", state: "skipped", reason: "time", removed: true },
    ],
    addedTargets: [{ targetId: "m27", frameCount: 30 }],
  });
});

test("session-rework.schema.json: the whole target list, added events, moves and removals; the refusals", () => {
  const request = def("session-rework", "request");
  const body = {
    targets: [
      {
        targetId: "ic1805",
        state: "planned",
        startedAt: NOW,
        finishedAt: NOW,
        frameCount: 70,
        filter: "Ha",
        reason: null,
      },
      { targetId: "m52", state: "removed", reason: "time" },
      { targetId: "m27", state: "added" },
    ],
    addedEvents: [
      {
        type: "note",
        at: NOW,
        targetId: "ic1805",
        payload: { text: "Mise au point reprise." },
      },
      {
        type: "pause",
        at: NOW,
        until: "2026-10-14T01:30:00.000Z",
        targetId: null,
        payload: { cause: "clouds" },
      },
      { type: "condition", at: NOW, payload: { sky: "hazy" } },
      {
        type: "equipment_issue",
        at: NOW,
        payload: { description: "Câble d'alimentation." },
      },
    ],
    eventMoves: [
      { eventId: EVENT, targetId: "m27" },
      { eventId: EVENT, targetId: null },
    ],
    eventRemovals: [EVENT],
  };
  assertValid(request, body);
  assertValid(request, { eventRemovals: [EVENT] });
  assertInvalid(request, {
    ...body,
    targets: [{ targetId: "m27", state: "kept" }],
  });
  // Only the four gestures of the night can be added after the fact.
  assertInvalid(request, {
    addedEvents: [{ type: "target_started", at: NOW, payload: {} }],
  });
  assertInvalid(request, {
    addedEvents: [{ type: "note", at: NOW, payload: { text: "" } }],
  });
  assertInvalid(request, {
    addedEvents: [{ type: "note", payload: { text: "x" } }],
  });
  assertInvalid(request, { eventMoves: [{ eventId: EVENT }] });
  // A signal modified keeps the form of an added event.
  assertValid(request, {
    eventReplacements: [
      {
        eventId: EVENT,
        event: {
          type: "pause",
          at: NOW,
          until: "2026-10-14T01:30:00.000Z",
          targetId: "m27",
          payload: { cause: "wind" },
        },
      },
    ],
  });
  assertInvalid(request, { eventReplacements: [{ eventId: EVENT }] });
  assertInvalid(request, {
    eventReplacements: [
      { eventId: EVENT, event: { type: "note", payload: { text: "x" } } },
    ],
  });
  assertInvalid(request, {
    eventReplacements: [
      {
        eventId: "not-an-event",
        event: { type: "note", at: NOW, payload: { text: "x" } },
      },
    ],
  });
  assertInvalid(request, { eventRemovals: ["not-an-event"] });
  assertInvalid(request, { revision: 3 });
  // Stale revision: the current session comes back with the refusal.
  const refusal = def("session-rework", "refusal");
  const session = {
    id: SESSION,
    planId: PLAN,
    status: "finished",
    startedAt: NOW,
    finishedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    reworkRevision: 3,
    reworkedAt: NOW,
  };
  assertValid(refusal, {
    error: {
      code: "session_rework_conflict",
      message: "The session was reworked meanwhile.",
    },
    session,
  });
  for (const code of [
    "invalid_request",
    "invalid_if_match",
    "precondition_required",
    "session_not_found",
    "event_not_found",
    "night_not_finished",
    "event_not_removable",
    "event_already_replaced",
    "event_not_replaceable",
    "target_not_found",
    "entitlement_read_only",
  ])
    assertValid(refusal, { error: { code, message: "Refused." } });
  // The details sit beside `error`, and a replacement names the event that
  // shows.
  assertValid(refusal, {
    error: { code: "event_already_replaced", message: "Replaced." },
    eventId: EVENT,
    replacedBy: EVENT,
  });
  assertInvalid(refusal, {
    error: { code: "capability_required", message: "No." },
  });
  // The answer is the session detail.
  assertValid(def("session-rework", "response"), {
    session,
    supplements: [],
    targets: [],
  });
});

test("capture.schema.json: replacement, the link to a session, the answers of an upload", () => {
  const capture = {
    id: CAPTURE,
    sessionId: SESSION,
    planId: PLAN,
    targetIds: ["ic1805"],
    originalName: "ic1805.jpg",
    sha256: "a".repeat(64),
    byteSize: 1024,
    status: "uploaded",
    visibility: "private",
    createdAt: NOW,
  };
  assertValid(def("capture", "capture"), capture);
  assertValid(def("capture", "capture"), {
    ...capture,
    replacedAt: NOW,
    replacedSource: "phone",
    mainImageSource: "astro-sync",
  });
  assertValid(def("capture", "capture"), {
    ...capture,
    replacedAt: null,
    replacedSource: null,
  });
  assertInvalid(def("capture", "capture"), {
    ...capture,
    replacedSource: "dropbox",
  });
  assertInvalid(def("capture", "capture"), {
    ...capture,
    replacedAt: "yesterday",
  });
  assertValid(def("capture", "uploadResponse"), {
    capture,
    deduplicated: false,
    replaced: true,
  });
  assertValid(def("capture", "uploadResponse"), {
    capture,
    deduplicated: false,
  });
  assertInvalid(def("capture", "uploadResponse"), {
    capture,
    deduplicated: false,
    replaced: "yes",
  });
  const finalize = {
    uploadId: PLAN,
    offset: 1024,
    byteSize: 1024,
    chunkSize: 512,
    completed: true,
    captureId: CAPTURE,
    capture,
    deduplicated: false,
    replaced: false,
  };
  assertValid(def("capture", "uploadFinalizeResponse"), finalize);
  assertInvalid(def("capture", "uploadFinalizeResponse"), {
    ...finalize,
    replaced: 1,
  });
});

test("manage-captures.schema.json: detaching a session, the provenance of a line, the synchronisation, the intermediate capture", () => {
  // `sessionId: null` detaches; a string still attaches another session.
  const change = def("manage-captures", "metadataChange");
  assertValid(change, { sessionId: null });
  assertValid(change, { sessionId: SESSION });
  assertInvalid(change, { sessionId: "" });
  assertInvalid(change, { sessionId: null, title: "x" });
  const line = {
    id: "line-1",
    filter: "Ha",
    frameCount: 54,
    exposureSeconds: 300,
    gain: 100,
    integrationSeconds: 16200,
    origin: "session",
    provenance: "declared",
    editedAt: null,
    edited: false,
  };
  const lineDef = def("manage-captures", "acquisitionLine");
  assertValid(lineDef, line);
  for (const provenance of ["declared", "measured", "manual"])
    assertValid(lineDef, { ...line, provenance });
  assertInvalid(lineDef, { ...line, provenance: "guessed" });
  assertInvalid(lineDef, { ...line, origin: "phone" });
  // A line of an earlier answer has no provenance and still validates.
  const { provenance, ...older } = line;
  assert.equal(provenance, "declared");
  assertValid(lineDef, { ...older, origin: "owner" });
  // A declared line whose frames are not known.
  assertValid(lineDef, {
    ...line,
    frameCount: 0,
    exposureSeconds: 0,
    integrationSeconds: 5400,
  });
  // The provenance is read only: a writer cannot send it.
  assertInvalid(def("capture", "proposedAcquisitionLine"), {
    frameCount: 54,
    exposureSeconds: 300,
    provenance: "declared",
  });
  // The answer of « Synchroniser avec la session ».
  const detailed = {
    targets: [{ id: "ic1805", designation: "IC 1805", name: null }],
    night: "2026-08-09",
    addedAt: NOW,
    fileName: "ic1805.jpg",
    byteSize: 1024,
    equipment: [],
    skyQuality: null,
    place: null,
  };
  const intermediate = {
    projectId: PROJECT,
    projectName: "IC 1805",
    sessionsDone: [
      { eveningDate: "2026-08-09", sessionId: SESSION, planId: PLAN },
    ],
    sessionsPlanned: [
      { eveningDate: "2026-08-20", sessionId: null, planId: PLAN },
    ],
  };
  assertValid(def("manage-captures", "detail"), detailed);
  assertValid(def("manage-captures", "detail"), { ...detailed, intermediate });
  assertValid(def("manage-captures", "detail"), {
    ...detailed,
    intermediate: null,
  });
  assertInvalid(def("manage-captures", "detail"), {
    ...detailed,
    intermediate: {
      ...intermediate,
      sessionsDone: [{ eveningDate: "2026-08-09" }],
    },
  });
  assertValid(def("manage-captures", "refusal"), {
    error: {
      code: "capture_without_session",
      message: "This capture has no session.",
    },
  });
});

test("integration.schema.json: a line says who wrote it and for which session; the totals say what is declared", () => {
  const integration = {
    id: SESSION,
    projectId: PROJECT,
    nightId: SESSION,
    targetId: "ic1805",
    filter: "Ha",
    exposureSeconds: 300,
    gain: null,
    binning: null,
    temperatureC: null,
    frameCount: 12,
    totalSeconds: 3600,
    eveningDate: "2026-08-09",
    sensor: null,
    computerLabel: null,
    installationId: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
  const lineDef = def("integration", "integration");
  assertValid(lineDef, integration);
  assertValid(lineDef, {
    ...integration,
    source: "measured",
    sessionId: SESSION,
  });
  // A declared line of a debriefing that gave only minutes.
  assertValid(lineDef, {
    ...integration,
    source: "declared",
    sessionId: SESSION,
    filter: null,
    frameCount: 0,
    exposureSeconds: 0,
    totalSeconds: 5400,
  });
  assertInvalid(lineDef, { ...integration, source: "guessed" });
  // Astro Sync still writes measured lines with at least one frame.
  assertInvalid(def("integration", "write"), {
    nightId: SESSION,
    targetId: "ic1805",
    filter: "Ha",
    exposureSeconds: 300,
    frameCount: 0,
    eveningDate: "2026-08-09",
  });
  assertInvalid(def("integration", "write"), {
    nightId: SESSION,
    targetId: "ic1805",
    filter: "Ha",
    exposureSeconds: 300,
    frameCount: 1,
    eveningDate: "2026-08-09",
    source: "declared",
  });
  const body = {
    projectId: PROJECT,
    integrations: [{ ...integration, source: "declared", sessionId: SESSION }],
    totalsByFilter: [
      {
        filter: "Ha",
        frameCount: 12,
        totalSeconds: 3600,
        nightCount: 1,
        declaredSeconds: 3600,
        measuredSeconds: 0,
      },
    ],
    totalSeconds: 3600,
    declaredSeconds: 3600,
    measuredSeconds: 0,
    nightCount: 1,
  };
  assertValid(documents.integration, body);
  assertInvalid(documents.integration, { ...body, declaredSeconds: -1 });
  assertValid(documents.integration, {
    error: {
      code: "integration_night_not_in_project",
      message: "This night is not one of the plan's.",
    },
    nightId: SESSION,
  });
});

test("project.schema.json: a night says where it stands, the plan whether all its sessions are done", () => {
  const night = {
    sessionId: SESSION,
    planId: PLAN,
    planName: "Nuit du 9 août",
    eveningDate: "2026-08-09",
    sessionStatus: "finished",
    link: "plan",
    integrationCount: 1,
    integrationSeconds: 3600,
  };
  assertValid(def("project", "night"), night);
  for (const state of ["upcoming", "to_debrief", "done"])
    assertValid(def("project", "night"), { ...night, state });
  assertInvalid(def("project", "night"), { ...night, state: "late" });
  const resource = {
    id: PROJECT,
    revision: 1,
    status: "finished",
    target: { targetId: "ic1805", name: "IC 1805" },
    goalMinutes: 600,
    place: { name: "Col des Mélèzes", latitude: 45, longitude: -30 },
    equipment: {},
    constraints: {
      minAltitude: 30,
      moonSeparationMinimum: 25,
      moonSeparationMinimumByFilter: {},
    },
    createdAt: NOW,
    updatedAt: NOW,
  };
  assertValid(def("project", "resource"), resource);
  assertValid(def("project", "resource"), {
    ...resource,
    nights: [{ ...night, state: "done" }],
    allSessionsDone: true,
  });
  assertInvalid(def("project", "resource"), {
    ...resource,
    allSessionsDone: "yes",
  });
});

test("the times and the exposure of a target, the events of a debriefing, the read-only night, the computer of a measured line — all optional, all additive", () => {
  const targetDef = def("journal", "target");
  const target = {
    targetId: "ic1805",
    label: "IC 1805",
    planItemId: "item-1",
    state: "planned",
    outcome: "done",
    reason: null,
    plannedSeconds: 7200,
    acquiredSeconds: 7000,
    frameCount: 70,
    filter: "Ha",
    captureId: null,
    thumbnailUrl: null,
  };
  assertValid(targetDef, target);
  assertValid(targetDef, {
    ...target,
    startedAt: "2026-08-09T20:00:00.000Z",
    finishedAt: null,
    exposureSeconds: 0.5,
    exposureFamilies: 3,
    imageUrl: "/gallery/m57.jpg",
  });
  assertInvalid(targetDef, { ...target, exposureSeconds: 0 });
  assertInvalid(targetDef, { ...target, exposureFamilies: 0 });
  assertInvalid(targetDef, { ...target, startedAt: "yesterday" });

  const entry = def("session-rework", "target");
  assertValid(entry, {
    targetId: "m31",
    state: "planned",
    exposureSeconds: 180,
  });
  assertValid(entry, {
    targetId: "m31",
    state: "planned",
    exposureSeconds: null,
  });
  assertInvalid(entry, {
    targetId: "m31",
    state: "planned",
    exposureSeconds: 0,
  });
  assertInvalid(entry, {
    targetId: "m31",
    state: "planned",
    exposureSeconds: 86401,
  });

  const adjustment = def("debrief", "targetAdjustment");
  assertValid(adjustment, {
    targetId: "i",
    state: "done",
    exposureSeconds: 120,
  });
  assertInvalid(adjustment, {
    targetId: "i",
    state: "done",
    exposureSeconds: -1,
  });
  assertValid(def("debrief", "addedTarget"), {
    targetId: "m27",
    exposureSeconds: 90,
  });
  const request = def("debrief", "request");
  assertValid(request, {
    outcome: "partial",
    addedEvents: [
      {
        type: "pause",
        at: "2026-08-09T21:00:00.000Z",
        until: "2026-08-09T21:20:00.000Z",
        targetId: "m31",
        payload: { cause: "clouds" },
      },
      {
        type: "note",
        at: "2026-08-09T22:00:00.000Z",
        payload: { text: "Brume" },
      },
    ],
    eventMoves: [{ eventId: EVENT, targetId: null }],
  });
  assertInvalid(request, {
    outcome: "partial",
    addedEvents: [{ type: "target_started", at: NOW, payload: {} }],
  });
  assertInvalid(request, {
    outcome: "partial",
    eventMoves: [{ eventId: "not-an-event", targetId: null }],
  });
  assertValid(def("debrief", "record"), {
    outcome: "partial",
    decidedAt: NOW,
    targets: [{ targetId: "i", state: "done", exposureSeconds: 120 }],
  });

  // A catalogue night of a private server: read only, on the resource and the detail.
  assertValid(def("session", "resource"), {
    id: "catalogue:2026-10-04:m57",
    planId: null,
    status: "finished",
    startedAt: NOW,
    finishedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    origin: "import",
    readOnly: true,
  });
  assertInvalid(def("session", "resource"), {
    id: SESSION,
    planId: null,
    status: "finished",
    startedAt: NOW,
    finishedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    readOnly: false,
  });
  const resource = {
    id: SESSION,
    planId: null,
    status: "finished",
    startedAt: NOW,
    finishedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  };
  assertValid(def("session", "detail"), {
    session: resource,
    supplements: [],
    readOnly: false,
  });
  assertInvalid(def("session", "detail"), {
    session: resource,
    supplements: [],
    readOnly: "yes",
  });

  // The computer of a measured line, proposed by a producer and read back.
  const proposed = def("capture", "proposedAcquisitionLine");
  assertValid(proposed, {
    filter: "Ha",
    frameCount: 30,
    exposureSeconds: 180,
    gain: 100,
    computerLabel: "Ordinateur du bureau",
  });
  assertValid(proposed, {
    frameCount: 30,
    exposureSeconds: 180,
    computerLabel: null,
  });
  assertInvalid(proposed, {
    frameCount: 30,
    exposureSeconds: 180,
    computerLabel: "c".repeat(81),
  });
  const line = def("manage-captures", "acquisitionLine");
  const read = {
    id: "line-1",
    filter: "Ha",
    frameCount: 30,
    exposureSeconds: 180,
    gain: 100,
    integrationSeconds: 5400,
    origin: "astro-sync",
    provenance: "measured",
    editedAt: null,
    edited: false,
  };
  assertValid(line, read);
  assertValid(line, { ...read, computerLabel: "Ordinateur du bureau" });
  assertValid(line, { ...read, computerLabel: null });
  assertInvalid(line, { ...read, computerLabel: 7 });
});
