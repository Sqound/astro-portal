// A capture always has its session (web half): the add box goes from Nuit ›
// Cible › Image to Image › Rangement. The night and the place come from the
// file's EXIF (the night by the rule of the places without a time zone: a
// photo taken before local noon belongs to the night before), the target from
// the file's name; a session that exists for the night is proposed first; the
// primary creates the session (origin `capture`: create, finish, patch the
// night) or joins the existing one, then sends; several files are gathered by
// night; the free space's number of captures is counted before anything is
// created; « Hors plan » is gone.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { shippedLocales } from "astro-contracts/locales";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const {
  NEAR_PLACE_KM,
  captureCountFits,
  currentPlace,
  fileCaptures,
  groupEntries,
  groupMode,
  nightOfPhoto,
  primaryLabel,
  readFileDetails,
  targetOf,
  tonightAt,
  wallClockInstant,
} = await import("portal/components/manage/capture-filing.js");
const { createCaptureSession, guessTarget, newUlid } =
  await import("portal/components/manage/captures-client.js");
const { AddStepBody, FilingBody, addStepParts, fileFailureWords } =
  await import("portal/components/manage/CaptureAddDialog.js");
const { capturesCopy, capturesCopyFor } =
  await import("portal/components/manage/captures-copy.js");
const { uploadRefusalWords } =
  await import("portal/components/manage/CapturesTab.js");
const { exifOf } = await import("portal/components/manage/photo-exif.js");
const { nightEveningDate } =
  await import("portal/persistence/night-evening-date.js");

const fr = capturesCopyFor("fr");
const plain = (text) => String(text).replace(/ /g, " ");
const textOf = (markup) =>
  plain(
    markup
      .replace(/<[^>]+>/g, " ")
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " "),
  );
const has = (text, ...sentences) => {
  for (const sentence of sentences)
    assert.ok(
      text.includes(sentence),
      `« ${sentence} » missing from: ${text.slice(0, 1200)}`,
    );
};
const lacks = (text, ...sentences) => {
  for (const sentence of sentences)
    assert.ok(!text.includes(sentence), `« ${sentence} » should be absent`);
};

// Col de Turini, a saved place; the default one is the person's current place.
const places = [
  { name: "Col de Turini", latitude: 43.99, longitude: 7.38, default: true },
  { name: "Plateau des Cimes", latitude: 45.5, longitude: 6.2 },
];
const NOW = new Date("2026-10-21T18:00:00.000Z");

/** The bytes of a little-endian TIFF carrying a date and a position. */
function tiff({ stamp, latitude, longitude }) {
  const bytes = new Uint8Array(512);
  const view = new DataView(bytes.buffer);
  bytes.set([0x49, 0x49], 0);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  const entry = (at, tag, type, count, value) => {
    view.setUint16(at, tag, true);
    view.setUint16(at + 2, type, true);
    view.setUint32(at + 4, count, true);
    view.setUint32(at + 8, value, true);
  };
  view.setUint16(8, 2, true);
  entry(10, 0x8769, 4, 1, 100);
  entry(22, 0x8825, 4, 1, 200);
  view.setUint16(100, 1, true);
  entry(102, 0x9003, 2, 20, 300);
  `${stamp}\0`.split("").forEach((c, i) => (bytes[300 + i] = c.charCodeAt(0)));
  view.setUint16(200, 4, true);
  entry(202, 0x0001, 2, 2, "N".charCodeAt(0));
  entry(214, 0x0002, 5, 3, 340);
  entry(226, 0x0003, 2, 2, "E".charCodeAt(0));
  entry(238, 0x0004, 5, 3, 370);
  const parts = (degrees) => {
    const whole = Math.floor(degrees);
    const minutes = Math.floor((degrees - whole) * 60);
    const seconds = Math.round(((degrees - whole) * 60 - minutes) * 60 * 100);
    return [whole, 1, minutes, 1, seconds, 100];
  };
  [...parts(latitude), ...parts(longitude)].forEach((value, index) => {
    view.setUint32(
      index < 6 ? 340 + index * 4 : 370 + (index - 6) * 4,
      value,
      true,
    );
  });
  return bytes.buffer;
}

const exifOfTurini = (stamp) =>
  exifOf(tiff({ stamp, latitude: 43.99, longitude: 7.38 }));
const NO_EXIF = { date: null, time: null, latitude: null, longitude: null };

const entryOf = (name, exif, { guess = null, now = NOW } = {}) => ({
  file: new File([Buffer.from(name)], name),
  sha256: name.padEnd(64, "0"),
  exif,
  guess,
  ...readFileDetails({ exif, places, now }),
});
const M31 = { id: "m31", designation: "M31", name: "Galaxie d’Andromède" };
const M45 = { id: "m45", designation: "M45", name: "Les Pléiades" };

// ——— the night and the place of a photo ———

test("the night of a photo: before local noon it belongs to the night before; the rule reads the longitude, never a time zone", () => {
  const night = (time, date = "2026-10-21", longitude = 7.38) =>
    nightOfPhoto({ date, time, longitude });
  assert.equal(night("02:10"), "2026-10-20");
  assert.equal(night("11:59"), "2026-10-20");
  assert.equal(night("12:00"), "2026-10-21");
  assert.equal(night("23:41"), "2026-10-21");
  assert.equal(night("23:41", "2026-10-20"), "2026-10-20");
  // The wall-clock time is taken at the place: the instant follows the
  // longitude (local mean time), and the evening date of that instant is
  // the very night the rule gives — west and east of Greenwich alike.
  for (const longitude of [-120, -30, 0, 7.38, 139.7]) {
    const startedAt = wallClockInstant("2026-10-21", "02:10", longitude);
    assert.equal(
      nightEveningDate({ planDate: null, startedAt, longitude }),
      "2026-10-20",
      String(longitude),
    );
  }
  assert.equal(
    wallClockInstant("2026-10-21", "12:00", 0),
    "2026-10-21T12:00:00.000Z",
  );
  assert.equal(
    wallClockInstant("2026-10-21", "12:00", 15),
    "2026-10-21T11:00:00.000Z",
  );
  // No time zone anywhere in the helpers of the box.
  const source = readFileSync(
    new URL("../src/components/manage/capture-filing.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""),
    /getTimezoneOffset|timeZone|toLocale|Intl\./,
  );
  // Tonight is read at the place's longitude as well.
  assert.equal(tonightAt("2026-10-21T01:00:00.000Z", 7.38), "2026-10-20");
  assert.equal(tonightAt("2026-10-21T18:00:00.000Z", 7.38), "2026-10-21");
});

test("EXIF-derived night and place: « Nuit du 20 octobre · D’après la photo », the saved place nearest to the photo; a photo of 02:10 is the night before", () => {
  const evening = readFileDetails({
    exif: exifOfTurini("2026:10:20 23:41:00"),
    places,
    now: NOW,
  });
  assert.equal(evening.night.date, "2026-10-20");
  assert.equal(evening.night.from, "photo");
  assert.equal(evening.night.photoDate, "2026-10-20");
  assert.equal(evening.night.time, "23:41");
  assert.equal(evening.place.name, "Col de Turini");
  assert.equal(evening.place.from, "saved");
  const morning = readFileDetails({
    exif: exifOfTurini("2026:10:21 02:10:00"),
    places,
    now: NOW,
  });
  assert.equal(morning.night.date, "2026-10-20");
  assert.equal(morning.night.time, "02:10");
  // A position far from every saved place names no saved place: the
  // coordinates stand in, to be corrected.
  const far = readFileDetails({
    exif: exifOf(
      tiff({ stamp: "2026:10:20 23:41:00", latitude: 10, longitude: 20 }),
    ),
    places,
    now: NOW,
  });
  assert.equal(far.place.from, "photo");
  assert.equal(far.place.latitude.toFixed(0), "10");
  assert.ok(NEAR_PLACE_KM <= 10);
});

test("no EXIF (HEIC, PNG, stripped): tonight is proposed, as an assumed night, the place is the person's current place; none known, none", () => {
  const details = readFileDetails({ exif: NO_EXIF, places, now: NOW });
  assert.deepEqual(details.night, { date: "2026-10-21", from: "tonight" });
  assert.equal(details.place.name, "Col de Turini");
  assert.equal(details.place.from, "current");
  assert.equal(currentPlace(places).name, "Col de Turini");
  assert.equal(
    currentPlace([{ name: "Autre", latitude: 1, longitude: 1 }]).name,
    "Autre",
  );
  assert.equal(
    readFileDetails({ exif: NO_EXIF, places: [], now: NOW }).place,
    null,
  );
});

// ——— the groups ———

test("several files: one night, one place, one session with a target line per file; several nights, several sessions; an existing session of the night is proposed", () => {
  const a = entryOf("a.jpg", exifOfTurini("2026:10:20 22:00:00"), {
    guess: M31,
  });
  const b = entryOf("b.jpg", exifOfTurini("2026:10:21 01:00:00"), {
    guess: M45,
  });
  const c = entryOf("c.jpg", exifOfTurini("2026:10:18 23:00:00"));
  const sameNight = groupEntries({ entries: [a, b] });
  assert.equal(sameNight.length, 1);
  assert.deepEqual(sameNight[0].entries, [0, 1]);
  assert.equal(sameNight[0].night.date, "2026-10-20");
  const manyNights = groupEntries({ entries: [a, c, b] });
  assert.equal(manyNights.length, 2);
  assert.deepEqual(
    manyNights.map((group) => group.entries),
    [[0, 2], [1]],
  );
  // Another place the same night is another session.
  const elsewhere = { ...b, placeOverride: { ...places[1], from: "choice" } };
  assert.equal(groupEntries({ entries: [a, elsewhere] }).length, 2);

  const nights = [
    {
      sessionId: "s-18",
      night: "2026-10-18",
      place: "Col de Turini",
      targets: [],
    },
    {
      sessionId: "s-20",
      night: "2026-10-20",
      place: "Col de Turini",
      targets: [{ id: "m31" }],
    },
  ];
  const proposed = groupEntries({ entries: [a, c], nights });
  assert.deepEqual(
    proposed.map((group) => group.existing?.sessionId),
    ["s-20", "s-18"],
  );
  assert.equal(groupMode(proposed[0], {}), "attach");
  assert.equal(
    groupMode(proposed[0], { [proposed[0].key]: "create" }),
    "create",
  );
  assert.equal(groupMode(groupEntries({ entries: [a] })[0], {}), "create");
  // « Choisir une session existante »: every file goes to the chosen session.
  const pinned = groupEntries({ entries: [a, c], nights, pinned: nights[1] });
  assert.equal(pinned.length, 1);
  assert.equal(pinned[0].existing.sessionId, "s-20");
  // The target is the person's choice, else the guess from the file's name.
  assert.equal(targetOf(a).id, "m31");
  assert.equal(targetOf({ ...a, target: null }), null);
  assert.equal(targetOf({ ...a, target: M45 }).id, "m45");
});

test("the primary says what happens: create, attach to the night of …, create {n} sessions, file and send, create without an image", () => {
  const dayOf = (night) => `le ${night}`;
  const a = entryOf("a.jpg", exifOfTurini("2026:10:20 22:00:00"));
  const c = entryOf("c.jpg", exifOfTurini("2026:10:18 23:00:00"));
  const label = (groups, choices = {}, withFiles = true) =>
    plain(primaryLabel({ copy: fr, groups, choices, withFiles, dayOf }));
  const one = groupEntries({ entries: [a] });
  assert.equal(label(one), "Créer la session et envoyer");
  const nights = [
    {
      sessionId: "s-20",
      night: "2026-10-20",
      place: "Col de Turini",
      targets: [],
    },
  ];
  const attach = groupEntries({ entries: [a], nights });
  assert.equal(
    label(attach),
    "Rattacher à la nuit du le 2026-10-20 et envoyer",
  );
  assert.equal(
    label(attach, { [attach[0].key]: "create" }),
    "Créer la session et envoyer",
  );
  const two = groupEntries({ entries: [a, c] });
  assert.equal(label(two), "Créer 2 sessions et envoyer");
  const mixed = groupEntries({ entries: [a, c], nights });
  assert.equal(label(mixed), "Ranger et envoyer");
  assert.equal(label(one, {}, false), "Créer la capture sans image");
});

test("the free space's three captures are counted before any session is created", () => {
  const free = { captureCount: 3, captureCountLimit: 3 };
  assert.deepEqual(captureCountFits({ storage: free, adding: 1 }).outcome, {
    kind: "refused",
    code: "capture_limit_reached",
    storage: free,
  });
  assert.equal(
    captureCountFits({ storage: { ...free, captureCount: 2 }, adding: 2 }).ok,
    false,
  );
  assert.equal(
    captureCountFits({ storage: { ...free, captureCount: 1 }, adding: 2 }).ok,
    true,
  );
  // A space without a number of captures, or no storage known: never refused here.
  assert.equal(
    captureCountFits({ storage: { captureCount: 90 }, adding: 5 }).ok,
    true,
  );
  assert.equal(captureCountFits({ storage: null, adding: 5 }).ok, true);
});

// ——— the gesture ———

/** A service that answers like the real one and keeps a record of what it was asked. */
function fakeService({ failUpload = null, sessionsBefore = 0 } = {}) {
  const calls = [];
  let sessions = sessionsBefore;
  const answer = (status, body) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  const fetcher = async (path, init = {}) => {
    const method = init.method ?? "GET";
    const url = String(path);
    let body = null;
    if (typeof init.body === "string") body = JSON.parse(init.body);
    else if (init.body instanceof FormData)
      body = JSON.parse(await init.body.get("metadata").text());
    calls.push({ method, path: url.split("?")[0], body });
    if (url.startsWith("/api/v1/target-index")) {
      const asked = new URL(url, "http://x").searchParams.get("q");
      const rows =
        asked.replace(/\W/g, "").toLowerCase() === "m31"
          ? [["m31", "M 31", "Galaxie d’Andromède", []]]
          : [];
      return answer(200, {
        fields: ["id", "designation", "name", "aliases"],
        rows,
      });
    }
    if (url === "/api/v1/sessions" && method === "POST") {
      sessions += 1;
      return answer(201, {
        session: { id: `session-${sessions}` },
        created: true,
      });
    }
    if (/\/finish$/.test(url)) return answer(200, { session: {} });
    if (/\/night$/.test(url)) return answer(200, { session: {}, night: {} });
    if (url === "/api/v1/targets/personal")
      return answer(201, { target: { id: "personal-1", name: body.name } });
    if (url === "/api/v1/uploads") {
      if (failUpload) return answer(409, { error: { code: failUpload } });
      return answer(201, { capture: { id: `capture-${calls.length}` } });
    }
    if (url.startsWith("/api/v1/manage/captures") && method === "POST")
      return answer(201, { capture: { id: "definition" } });
    return answer(404, { error: { code: "not_found" } });
  };
  return { fetcher, calls };
}
const writes = (calls) =>
  calls
    .filter((call) => call.method !== "GET")
    .map(
      (call) =>
        `${call.method} ${call.path.replace(/session-\d+/, "session-N")}`,
    );
const run = (service, entries, options = {}) =>
  fileCaptures({
    fetcher: service.fetcher,
    csrf: "csrf",
    locale: "fr",
    entries,
    groups: groupEntries({
      entries,
      nights: options.nights ?? [],
      pinned: options.pinned ?? null,
    }),
    ...options,
  });

test("create and send: the session is created (origin capture), finished, its night patched with the place (no time zone) and the target, then the file is sent with the session's id", async () => {
  const service = fakeService();
  const entry = entryOf("M31-final.jpg", exifOfTurini("2026:10:20 23:41:00"), {
    guess: M31,
  });
  const answer = await run(service, [entry]);
  assert.equal(answer.kind, "ok");
  assert.deepEqual(writes(service.calls), [
    "POST /api/v1/sessions",
    "POST /api/v1/sessions/session-N/finish",
    "PATCH /api/v1/sessions/session-N/night",
    "POST /api/v1/uploads",
  ]);
  const [create, finish, night, upload] = service.calls.filter(
    (call) => call.method !== "GET",
  );
  assert.equal(create.body.origin, "capture");
  assert.match(create.body.clientSessionId, /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
  // The session starts at the photo's own instant, in the night of the 20th.
  assert.equal(
    nightEveningDate({
      planDate: null,
      startedAt: create.body.startedAt,
      longitude: 7.38,
    }),
    "2026-10-20",
  );
  assert.equal(finish.body.finishedAt, create.body.startedAt);
  assert.deepEqual(night.body, {
    place: { name: "Col de Turini", latitude: 43.99, longitude: 7.38 },
    targetIds: ["m31"],
  });
  assert.equal(upload.body.sessionId, "session-1");
  assert.deepEqual(upload.body.targetIds, ["m31"]);
  assert.equal(upload.body.stage, "draft");
});

test("attach to the existing night: no session is created, the file is sent with the session's id", async () => {
  const service = fakeService();
  const entry = entryOf("M31-final.jpg", exifOfTurini("2026:10:20 23:41:00"), {
    guess: M31,
  });
  const nights = [
    {
      sessionId: "s-20",
      night: "2026-10-20",
      place: "Col de Turini",
      targets: [],
    },
  ];
  const answer = await run(service, [entry], { nights });
  assert.equal(answer.kind, "ok");
  assert.deepEqual(writes(service.calls), ["POST /api/v1/uploads"]);
  assert.equal(service.calls.at(-1).body.sessionId, "s-20");
  // « Créer une nouvelle session » instead: the chain runs.
  const other = fakeService();
  const groups = groupEntries({ entries: [entry], nights });
  const created = await fileCaptures({
    fetcher: other.fetcher,
    csrf: "c",
    locale: "fr",
    entries: [entry],
    groups,
    choices: { [groups[0].key]: "create" },
  });
  assert.equal(created.kind, "ok");
  assert.equal(writes(other.calls)[0], "POST /api/v1/sessions");
});

test("a session without a target: « Cible : à préciser » — the night is patched with no target and the file is sent without one", async () => {
  const service = fakeService();
  const entry = entryOf("IMG_2042.jpg", exifOfTurini("2026:10:20 23:41:00"));
  assert.equal(targetOf(entry), null);
  const answer = await run(service, [entry]);
  assert.equal(answer.kind, "ok");
  const calls = service.calls.filter((call) => call.method !== "GET");
  assert.deepEqual(calls[2].body.targetIds, []);
  assert.equal("targetIds" in calls[3].body, false);
  assert.equal(calls[3].body.sessionId, "session-1");
});

test("no EXIF: the night chosen or tonight, the current place; a capture without an image becomes a definition of the new session", async () => {
  const service = fakeService();
  const entry = {
    file: null,
    sha256: null,
    exif: NO_EXIF,
    guess: null,
    ...readFileDetails({ exif: NO_EXIF, places, now: NOW }),
    nightOverride: "2026-10-19",
  };
  const answer = await run(service, [entry]);
  assert.equal(answer.kind, "ok");
  assert.deepEqual(writes(service.calls), [
    "POST /api/v1/sessions",
    "POST /api/v1/sessions/session-N/finish",
    "PATCH /api/v1/sessions/session-N/night",
    "POST /api/v1/manage/captures",
  ]);
  const create = service.calls.find((call) => call.path === "/api/v1/sessions");
  assert.equal(
    nightEveningDate({
      planDate: null,
      startedAt: create.body.startedAt,
      longitude: 7.38,
    }),
    "2026-10-19",
  );
  assert.equal(service.calls.at(-1).body.sessionId, "session-1");
});

test("several files of one night: ONE session with the targets of each file, each file sent with its own target", async () => {
  const service = fakeService();
  const entries = [
    entryOf("a.jpg", exifOfTurini("2026:10:20 22:00:00"), { guess: M31 }),
    entryOf("b.jpg", exifOfTurini("2026:10:21 01:00:00"), { guess: M45 }),
  ];
  const answer = await run(service, entries);
  assert.equal(answer.kind, "ok");
  assert.deepEqual(writes(service.calls), [
    "POST /api/v1/sessions",
    "POST /api/v1/sessions/session-N/finish",
    "PATCH /api/v1/sessions/session-N/night",
    "POST /api/v1/uploads",
    "POST /api/v1/uploads",
  ]);
  const calls = service.calls.filter((call) => call.method !== "GET");
  assert.deepEqual(calls[2].body.targetIds, ["m31", "m45"]);
  assert.deepEqual(calls[3].body.targetIds, ["m31"]);
  assert.deepEqual(calls[4].body.targetIds, ["m45"]);
  assert.equal(calls[3].body.sessionId, calls[4].body.sessionId);
  // From the first photo to the last.
  assert.notEqual(calls[0].body.startedAt, calls[1].body?.finishedAt);
  assert.ok(calls[1].body.finishedAt > calls[0].body.startedAt);
});

test("several nights: one session per night, each file sent with its own session; a retry builds none twice", async () => {
  const service = fakeService({ failUpload: "file_too_large" });
  const entries = [
    entryOf("a.jpg", exifOfTurini("2026:10:20 22:00:00"), { guess: M31 }),
    entryOf("c.jpg", exifOfTurini("2026:10:18 23:00:00"), { guess: M45 }),
  ];
  const created = new Map();
  const uploaded = new Set();
  const failed = await run(service, entries, { created, uploaded });
  assert.equal(failed.kind, "refused");
  assert.equal(failed.step, "upload");
  assert.equal(created.size, 1);
  // The service accepts the next try: the session of the first night exists.
  const retry = fakeService({ sessionsBefore: 1 });
  const answer = await run(retry, entries, { created, uploaded });
  assert.equal(answer.kind, "ok");
  assert.equal(
    writes(retry.calls).filter((line) => line === "POST /api/v1/sessions")
      .length,
    1,
    "only the second night's session is built",
  );
  assert.equal(created.size, 2);
  const sessions = retry.calls
    .filter((call) => call.path === "/api/v1/uploads")
    .map((call) => call.body.sessionId);
  assert.equal(sessions.length, 2);
  assert.notEqual(sessions[0], sessions[1]);
});

test("a target that is not in the catalogue is created first, with the night's place and date", async () => {
  const service = fakeService();
  const entry = {
    ...entryOf("Cygne.jpg", exifOfTurini("2026:10:20 23:41:00")),
    target: {
      new: true,
      id: null,
      designation: "Cygne grand champ",
      name: null,
    },
  };
  const answer = await run(service, [entry]);
  assert.equal(answer.kind, "ok");
  const personal = service.calls.find(
    (call) => call.path === "/api/v1/targets/personal",
  );
  assert.deepEqual(personal.body, {
    name: "Cygne grand champ",
    label: "Grand champ",
    placeName: "Col de Turini",
    date: "2026-10-20",
  });
  const night = service.calls.find((call) => call.path.endsWith("/night"));
  assert.deepEqual(night.body.targetIds, ["personal-1"]);
});

test("the night of a capture is built with the service's own calls and answers the kind of the one that failed", async () => {
  const answer = (status, body) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  const failing = (failure) => async (path) =>
    path.endsWith(failure)
      ? answer(500, {})
      : answer(201, { session: { id: "s" } });
  const input = {
    startedAt: "2026-10-20T21:00:00.000Z",
    clientSessionId: newUlid(),
    csrf: "c",
  };
  assert.equal(
    (await createCaptureSession(failing("/finish"), input)).kind,
    "failed",
  );
  assert.equal(
    (await createCaptureSession(failing("/night"), input)).kind,
    "failed",
  );
  assert.equal(
    (await createCaptureSession(failing("/sessions"), input)).kind,
    "failed",
  );
  assert.match(newUlid(), /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
});

test("the target a file name names: an exact match of the catalogue only", async () => {
  const service = fakeService();
  const found = await guessTarget(service.fetcher, {
    name: "M31 final",
    locale: "fr",
  });
  assert.deepEqual(found, {
    id: "m31",
    designation: "M 31",
    name: "Galaxie d’Andromède",
  });
  assert.equal(
    await guessTarget(service.fetcher, { name: "IMG 2042", locale: "fr" }),
    null,
  );
  assert.equal(
    await guessTarget(service.fetcher, { name: "", locale: "fr" }),
    null,
  );
});

// ——— what the box draws ———

const nights = [
  {
    sessionId: "s-20",
    night: "2026-10-20",
    place: "Col de Turini",
    targets: [{ id: "m31", designation: "M31" }],
  },
];
const stateOf = (files, changes = {}) => ({
  step: "filing",
  files,
  choices: {},
  pinned: null,
  edit: null,
  notice: null,
  busy: false,
  ...changes,
});
const filing = (files, { nights: offered = [], state = {} } = {}) => {
  const current = stateOf(files, state);
  const { title, body, footer } = addStepParts({
    state: current,
    patch: () => {},
    copy: fr,
    locale: "fr",
    nights: offered,
    places,
  });
  return renderToStaticMarkup(
    createElement(
      "div",
      null,
      createElement("h2", null, title),
      createElement(AddStepBody, {
        copy: fr,
        step: "filing",
        notice: null,
        body,
        filing: true,
      }),
      createElement("footer", null, footer),
    ),
  );
};

test("Rangement: the file with « Changer », the three lines each with « Modifier », « Retour » a link, one primary « Créer la session et envoyer »", () => {
  const markup = filing([
    entryOf("M31-final.jpg", exifOfTurini("2026:10:20 23:41:00"), {
      guess: M31,
    }),
  ]);
  const text = textOf(markup);
  has(
    text,
    "Image",
    "Rangement",
    "M31-final.jpg",
    "Changer",
    "Cette capture sera rangée dans une session",
    "Nuit du 20 octobre",
    "D’après la photo · 20 oct., 23:41",
    "Lieu : Col de Turini",
    "Lieu enregistré le plus proche de la photo.",
    "Cible : M31 · Galaxie d’Andromède",
    "D’après le nom du fichier",
    "Elle sera ajoutée en brouillon, privée.",
    "Retour",
    "Créer la session et envoyer",
  );
  lacks(text, "Hors plan", "Choisir une session existante", "Rattacher");
  assert.equal((markup.match(/>Modifier</g) ?? []).length, 3);
  assert.equal((markup.match(/class="btn-primary"/g) ?? []).length, 1);
  assert.match(markup, /class="btn-primary"[^>]*>Créer la session et envoyer/);
  assert.match(markup, /class="btn-link"[^>]*>Retour/);
  assert.match(markup, /class="btn-link"[^>]*>Modifier/);
});

test("Rangement with a session of that night: « Rattacher à la nuit du 20 octobre ? » first, the primary becomes « Rattacher … et envoyer », « Choisir une session existante » is a tertiary", () => {
  const markup = filing(
    [
      entryOf("M31-final.jpg", exifOfTurini("2026:10:20 23:41:00"), {
        guess: M31,
      }),
    ],
    { nights },
  );
  const text = textOf(markup);
  has(
    text,
    "Cette nuit a déjà une session",
    "Rattacher à la nuit du 20 octobre ?",
    "Rattacher à la session du 20 octobre",
    "Col de Turini · 1 cible observée",
    "Créer une nouvelle session",
    "Choisir une session existante",
    "Rattacher à la nuit du 20 octobre et envoyer",
  );
  lacks(text, "Créer la session et envoyer");
  assert.match(
    markup,
    /class="btn-tertiary"[^>]*>Choisir une session existante/,
  );
  assert.match(
    markup,
    /class="btn-primary"[^>]*>Rattacher à la nuit du 20 octobre et envoyer/,
  );
  assert.equal((markup.match(/class="btn-primary"/g) ?? []).length, 1);
  // Choosing to create instead changes the primary back.
  const created = filing(
    [
      entryOf("M31-final.jpg", exifOfTurini("2026:10:20 23:41:00"), {
        guess: M31,
      }),
    ],
    {
      nights,
      state: {
        choices: {
          [groupEntries({
            entries: [
              entryOf("M31-final.jpg", exifOfTurini("2026:10:20 23:41:00")),
            ],
            nights,
          })[0].key]: "create",
        },
      },
    },
  );
  has(textOf(created), "Créer la session et envoyer");
});

test("Rangement without EXIF: the night it assumes, said as assumed, the current place, « Cible : à préciser »; no « Hors plan »", () => {
  const markup = filing([entryOf("M31-final.png", NO_EXIF)]);
  const text = textOf(markup);
  has(
    text,
    "supposée",
    "Cette image ne porte ni date ni position : changez la nuit si c’est une autre.",
    "Lieu : Col de Turini",
    "Lieu courant",
    "Cible : à préciser",
    "Créer la session et envoyer",
  );
  lacks(text, "Hors plan", "D’après la photo");
});

test("Rangement of several files: one night is one session with a target line per file; several nights, « Créer 2 sessions et envoyer »", () => {
  const sameNight = filing([
    entryOf("a.jpg", exifOfTurini("2026:10:20 22:00:00"), { guess: M31 }),
    entryOf("b.jpg", exifOfTurini("2026:10:21 01:00:00"), { guess: M45 }),
  ]);
  const text = textOf(sameNight);
  has(
    text,
    "Ces captures seront rangées dans leurs sessions",
    "Cible : M31 · Galaxie d’Andromède",
    "Cible : M45 · Les Pléiades",
    "a.jpg",
    "b.jpg",
    "Créer la session et envoyer",
  );
  assert.equal((text.match(/Nuit du 20 octobre/g) ?? []).length, 1);
  assert.equal((text.match(/Cible :/g) ?? []).length, 2);
  const nightsApart = filing([
    entryOf("a.jpg", exifOfTurini("2026:10:20 22:00:00"), { guess: M31 }),
    entryOf("c.jpg", exifOfTurini("2026:10:18 23:00:00")),
  ]);
  const apart = textOf(nightsApart);
  has(
    apart,
    "Nuit du 20 octobre",
    "Nuit du 18 octobre",
    "Créer 2 sessions et envoyer",
  );
  assert.equal((apart.match(/Nuit du /g) ?? []).length, 2);
});

test("« Rangement » editors: the night's date input, the place's saved places, the existing sessions to choose from", () => {
  const files = [
    entryOf("a.jpg", exifOfTurini("2026:10:20 22:00:00"), { guess: M31 }),
  ];
  const key = groupEntries({ entries: files })[0].key;
  const nightEditor = renderToStaticMarkup(
    createElement(FilingBody, {
      state: stateOf(files, { edit: { kind: "night", key } }),
      patch: () => {},
      copy: fr,
      locale: "fr",
      places,
    }),
  );
  assert.match(nightEditor, /<input[^>]*type="date"[^>]*value="2026-10-20"/);
  const placeEditor = renderToStaticMarkup(
    createElement(FilingBody, {
      state: stateOf(files, { edit: { kind: "place", key } }),
      patch: () => {},
      copy: fr,
      locale: "fr",
      places,
    }),
  );
  assert.match(placeEditor, /<option[^>]*>Col de Turini<\/option>/);
  assert.match(placeEditor, /<option[^>]*>Plateau des Cimes<\/option>/);
  const picker = textOf(
    renderToStaticMarkup(
      createElement(FilingBody, {
        state: stateOf(files, { edit: { kind: "session" } }),
        patch: () => {},
        copy: fr,
        locale: "fr",
        nights,
        places,
      }),
    ),
  );
  has(
    picker,
    "Choisir une session existante",
    "Col de Turini · 1 cible observée",
  );
});

// ——— A preselected session decides night, place and target ———

const gamsberg = {
  sessionId: "s-gam",
  night: "2026-10-21",
  place: "Gamsberg Research Station",
  targets: [{ id: "m31", designation: "M31", name: "Galaxie d’Andromède" }],
};
const several = {
  sessionId: "s-two",
  night: "2026-10-21",
  place: "Kitt Peak",
  targets: [
    { id: "m31", designation: "M31", name: "Galaxie d’Andromède" },
    { id: "m45", designation: "M45", name: "Les Pléiades" },
  ],
};

test("a file with no EXIF joins the preselected session of tonight, and the three lines are the session's, not the file's", () => {
  // No EXIF: tonight (21 Oct), the person's current place (Col de Turini).
  const files = [entryOf("IMG_2042.png", NO_EXIF)];
  const text = textOf(filing(files, { nights: [gamsberg] }));
  has(
    text,
    "Rattacher à la session du 21 octobre",
    "Nuit du 21 octobre",
    "Lieu : Gamsberg Research Station",
    "Cible : M31 · Galaxie d’Andromède",
  );
  lacks(text, "supposée", "Col de Turini", "Lieu courant", "à préciser");
  // The night and the place are the session's: nothing to edit on them.
  const markup = filing(files, { nights: [gamsberg] });
  assert.equal((markup.match(/>Modifier</g) ?? []).length, 1);
});

test("the lines follow the person's choice — a new session brings the file's own lines back, another session its own", () => {
  const files = [entryOf("IMG_2042.png", NO_EXIF)];
  const key = groupEntries({ entries: files, nights: [gamsberg] })[0].key;
  const created = textOf(
    filing(files, {
      nights: [gamsberg],
      state: { choices: { [key]: "create" } },
    }),
  );
  has(created, "supposée", "Lieu : Col de Turini", "Cible : à préciser");
  lacks(created, "Lieu : Gamsberg");
  // « Choisir une session existante »: the pinned session decides.
  const pinned = textOf(
    filing(files, { nights: [gamsberg, several], state: { pinned: several } }),
  );
  has(pinned, "Lieu : Kitt Peak", "Nuit du 21 octobre");
  lacks(pinned, "Gamsberg", "Col de Turini");
  // Two targets observed and none named by the file: the person says which.
  has(pinned, "Cible : à préciser");
  // A file whose name names one of them keeps it.
  const named = textOf(
    filing([entryOf("M45.png", NO_EXIF, { guess: M45 })], {
      nights: [several],
    }),
  );
  has(named, "Cible : M45 · Les Pléiades");
});

test("what is sent is what the lines say — the session's target, the session's place for a new personal target", async () => {
  const service = fakeService();
  const entry = entryOf("IMG_2042.png", NO_EXIF);
  const answer = await run(service, [entry], { nights: [gamsberg] });
  assert.equal(answer.kind, "ok");
  assert.deepEqual(writes(service.calls), ["POST /api/v1/uploads"]);
  const upload = service.calls.at(-1).body;
  assert.equal(upload.sessionId, "s-gam");
  assert.deepEqual(upload.targetIds, ["m31"]);
  // Two observed targets and none chosen: sent with none.
  const other = fakeService();
  await run(other, [entryOf("IMG_2043.png", NO_EXIF)], { nights: [several] });
  assert.equal(other.calls.at(-1).body.targetIds, undefined);
});

// ——— the words ———

const NEW_KEYS = [
  "stepFiling",
  "filingChange",
  "filingEdit",
  "filingTitle",
  "filingFromPhoto",
  "filingNoExif",
  "filingNightAssumed",
  "filingPlace",
  "filingPlaceCurrent",
  "filingPlacePhoto",
  "filingTarget",
  "filingTargetNone",
  "filingTargetFromFile",
  "filingTargetClear",
  "filingNewTargetUse",
  "filingExistsTitle",
  "filingAttachAsk",
  "filingAttachChoice",
  "filingCreateChoice",
  "filingCreateAndSend",
  "filingCreateManyAndSend",
  "filingAttachAndSend",
  "filingSendAll",
  "filingPickExisting",
];

test("the words of « Rangement » exist in every shipped language, written in it; « Hors plan » and its night-first steps are gone from all of them", () => {
  const locales = shippedLocales();
  assert.ok(locales.length >= 10);
  const english = capturesCopyFor("en");
  const sample = (copy, key) => {
    const value = copy[key];
    if (typeof value !== "function") return value;
    return key === "filingTitle" ? `${value(1)}|${value(2)}` : value("A", "B");
  };
  for (const locale of locales) {
    const copy = capturesCopyFor(locale);
    for (const key of NEW_KEYS) {
      const text = String(sample(copy, key));
      assert.ok(text.length > 0, `${locale}.${key}`);
      // « Target » is the Italian word as well; nothing else is shared.
      const shared =
        ["filingChange", "filingEdit"].includes(key) ||
        (locale === "it" && key === "filingTarget");
      if (locale !== "en" && !shared)
        assert.notEqual(text, String(sample(english, key)), `${locale}.${key}`);
    }
    for (const gone of ["outsidePlan", "outsidePlanLine", "whichNight"])
      assert.equal(gone in capturesCopy[locale], false, `${locale}.${gone}`);
    // « Créer {n} sessions et envoyer » carries the number.
    assert.ok(copy.filingCreateManyAndSend(3).includes("3"), locale);
    assert.ok(copy.filingAttachAndSend("20 oct.").includes("20 oct."), locale);
  }
  assert.equal(
    plain(fr.filingCreateManyAndSend(3)),
    "Créer 3 sessions et envoyer",
  );
  assert.equal(
    capturesCopyFor("ru").filingCreateManyAndSend(2),
    "Создать 2 сеанса и отправить",
  );
  assert.equal(
    capturesCopyFor("ru").filingCreateManyAndSend(5),
    "Создать 5 сеансов и отправить",
  );
});
