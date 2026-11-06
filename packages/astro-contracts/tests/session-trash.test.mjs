import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import {
  assertInvalid,
  assertValid,
  registerExternalSchema,
} from "./schema-assert.mjs";

// The contract of the deleted sessions, of the plan that says its session is
// missing, of the archive of a plan that is history, and of the one count of
// the sessions to debrief. Every addition is optional or a new shape: nothing
// is removed or renamed. The service's own answers are replayed against these
// shapes by the recorded exchanges (`session-delete`, `journal-deleted`,
// `plan-session-missing`, `plan-session-recreated`, `plan-archived`,
// `plan-unarchived`, `session-restore`, `session-erase`).

const schemasDirectory = new URL("../schemas/", import.meta.url);
const read = async (url) => JSON.parse(await readFile(url, "utf8"));
const documents = {};
for (const name of ["journal", "session", "plan", "debrief"]) {
  documents[name] = await read(
    new URL(`api/${name}.schema.json`, schemasDirectory),
  );
  registerExternalSchema(`${name}.schema.json`, documents[name]);
}
for (const name of await readdir(new URL("session-events/", schemasDirectory)))
  if (name.endsWith(".schema.json"))
    registerExternalSchema(
      `../session-events/${name}`,
      await read(new URL(`session-events/${name}`, schemasDirectory)),
    );
registerExternalSchema(
  "../planner/horizon-mask.schema.json",
  await read(new URL("planner/horizon-mask.schema.json", schemasDirectory)),
);
const def = (file, name) => ({
  $defs: documents[file].$defs,
  $ref: `#/$defs/${name}`,
});

const SESSION = "4d2b7e10-8a6c-4f53-9b1d-7e0a3c5f2b84";
const PLAN = "9f1c0b4a-5d3e-4a21-9c7f-2b8e6d4a1c30";
const DELETED = "2026-10-14T12:30:00.000Z";
const PURGE = "2026-11-13T12:30:00.000Z";

const session = {
  id: SESSION,
  planId: PLAN,
  status: "finished",
  startedAt: "2026-10-04T19:10:00.000Z",
  finishedAt: "2026-10-05T03:40:00.000Z",
  createdAt: "2026-10-04T19:10:00.000Z",
  updatedAt: DELETED,
};
const planResource = {
  id: PLAN,
  revision: 2,
  status: "executed",
  payload: {
    id: "browser-1",
    date: "2026-10-04",
    name: "Nuit du 4 octobre",
    items: [],
  },
  updatedAt: DELETED,
};
const line = {
  sessionId: SESSION,
  planId: PLAN,
  planName: "Nuit du 4 octobre",
  projectId: null,
  projectName: null,
  eveningDate: "2026-10-04",
  startedAt: "2026-10-04T19:10:00.000Z",
  finishedAt: "2026-10-05T03:40:00.000Z",
  placeName: "Col des Étoiles",
  instrumentLabel: null,
  state: "executed",
  origin: "execution",
  plannedSeconds: 7200,
  acquiredSeconds: 7000,
  frameCount: 70,
  lostReason: null,
  measured: false,
  quality: null,
  captureCount: 2,
  targets: [],
  readOnly: false,
};

test("session.schema.json: a deleted session carries deletedAt and purgeAt, a live one neither; the answers of the deletion, the restoration and the erasure", () => {
  assertValid(def("session", "resource"), session);
  assertValid(def("session", "resource"), {
    ...session,
    deletedAt: DELETED,
    purgeAt: PURGE,
  });
  assertInvalid(def("session", "resource"), { ...session, deletedAt: "soon" });

  const deleted = { ...session, deletedAt: DELETED, purgeAt: PURGE };
  const answer = { session: deleted, graceDays: 30, daysRemaining: 30 };
  assertValid(def("session", "deleteResponse"), answer);
  assertInvalid(def("session", "deleteResponse"), {
    ...answer,
    graceDays: undefined,
  });
  assertInvalid(def("session", "deleteResponse"), {
    ...answer,
    daysRemaining: -1,
  });
  assertValid(def("session", "restoreResponse"), { session });
  assertInvalid(def("session", "restoreResponse"), { session, extra: 1 });

  const erased = {
    captures: 2,
    events: 14,
    supplements: 0,
    analyses: 1,
    steps: 3,
    packageImports: 0,
    deviceJournalLines: 40,
    integrations: 1,
  };
  assertValid(def("session", "erasure"), { sessionId: SESSION, erased });
  assertInvalid(def("session", "erasure"), {
    sessionId: SESSION,
    erased: { ...erased, captures: undefined },
  });
  assertInvalid(def("session", "erasure"), { sessionId: SESSION });
});

test("journal.schema.json: the deleted sessions, each the line it was with its dates; the one count of the sessions to debrief", () => {
  const entry = {
    session: line,
    deletedAt: DELETED,
    purgeAt: PURGE,
    daysRemaining: 12,
  };
  assertValid(def("journal", "deletedEntry"), entry);
  assertInvalid(def("journal", "deletedEntry"), {
    ...entry,
    daysRemaining: undefined,
  });
  assertInvalid(def("journal", "deletedEntry"), { ...entry, extra: true });
  assertValid(def("journal", "deletedList"), {
    entries: [entry],
    graceDays: 30,
  });
  assertValid(def("journal", "deletedList"), { entries: [], graceDays: 30 });
  assertInvalid(def("journal", "deletedList"), { entries: [entry] });

  const list = {
    sessions: [line],
    groups: [],
    years: [2026],
    instruments: [],
    stats: { sessions: 1, acquiredSeconds: 7000, frameCount: 70 },
    nextCursor: null,
  };
  // Optional: an earlier service's answer still validates.
  assertValid(def("journal", "list"), list);
  assertValid(def("journal", "list"), { ...list, toDebriefCount: 3 });
  assertInvalid(def("journal", "list"), { ...list, toDebriefCount: -1 });
  assertInvalid(def("journal", "list"), { ...list, toDebriefCount: "3" });
});

test("plan.schema.json: the plan of a deleted session says its session is missing; the archive and the new session", () => {
  assertValid(def("plan", "resource"), planResource);
  assertValid(def("plan", "resource"), {
    ...planResource,
    sessionMissing: true,
    deletedSessionId: SESSION,
  });
  assertValid(def("plan", "resource"), {
    ...planResource,
    sessionMissing: true,
  });
  assertInvalid(def("plan", "resource"), {
    ...planResource,
    sessionMissing: false,
  });
  assertInvalid(def("plan", "resource"), {
    ...planResource,
    deletedSessionId: 42,
  });

  assertValid(def("plan", "archiveResponse"), {
    plan: { ...planResource, status: "archived" },
  });
  assertInvalid(def("plan", "archiveResponse"), {});
  // The state an archived plan had before its archive: « Abandonné » then
  // « Archivé ». Additive and read-only; `null` outside an archive, and a
  // service that predates it sends nothing.
  for (const archivedFrom of ["executed", "partial", "abandoned", null])
    assertValid(def("plan", "archiveResponse"), {
      plan: { ...planResource, status: "archived", archivedFrom },
    });
  assertValid(def("plan", "resource"), { ...planResource, archivedFrom: null });
  for (const archivedFrom of ["archived", "active", "pending", "", 3])
    assertInvalid(def("plan", "resource"), { ...planResource, archivedFrom });
  // A device writes it beside `closedAs: "archived"`.
  assertValid(def("plan", "payload"), {
    ...planResource.payload,
    closedAs: "archived",
    archivedFrom: "abandoned",
  });
  assertInvalid(def("plan", "payload"), {
    ...planResource.payload,
    closedAs: "archived",
    archivedFrom: "pending",
  });
  assertValid(def("plan", "recreateSessionResponse"), {
    plan: {
      ...planResource,
      status: "active",
      payload: { ...planResource.payload, closedAs: "executed" },
    },
    session: { ...session, origin: "debrief", outcome: null },
  });
  assertInvalid(def("plan", "recreateSessionResponse"), { plan: planResource });
});
