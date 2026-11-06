// The mount's events are kept in the session, and
// the web page of a session and the debriefing say them: « M110 pointée par
// GoTo à 21:57 », « Monture arrêtée à 23:40 », « Liaison perdue 2 min ».
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { messages } from "../dist/i18n.js";
import { debriefSummary } from "../dist/debrief-summary.js";
import * as model from "../dist/components/sessions/session-page-model.js";
import * as view from "../dist/components/sessions/session-page-view.js";
import { sessionDeviceLines } from "../dist/components/sessions/session-device-lines.js";
import {
  DEVICE_EVENT_TYPES,
  isDeviceEventType,
} from "../dist/session-events/device-event-types.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const loadJsxModule = (path) => import(`portal/${path}`);

let counter = 0;
const event = (type, at, payload = {}) => ({
  eventId: `01J8Z3K9QZ6N3S6R3E6G8H${String(++counter).padStart(4, "0")}`,
  sessionId: "s1",
  type,
  recordedAt: `2026-10-02T${at}:00.000Z`,
  receivedAt: `2026-10-02T${at}:00.000Z`,
  timing: "observed",
  payload,
});

const journal = [
  event("mount_connected", "21:30", { protocol: "LX200", mountName: "OnStep" }),
  event("target_started", "21:55", { targetId: "m110" }),
  event("mount_goto", "21:55", {
    outcome: "sent",
    targetId: "m110",
    targetLabel: "M110",
  }),
  event("mount_goto", "21:57", {
    outcome: "arrived",
    targetId: "m110",
    targetLabel: "M110",
    gapDegrees: 0.2,
  }),
  event("mount_link_lost", "22:10"),
  event("mount_link_back", "22:12"),
  event("mount_goto", "22:30", {
    outcome: "refused",
    targetLabel: "Saturne",
    refusedBy: "safety",
    reason: "horizon",
  }),
  event("mount_goto", "22:40", { outcome: "sent", targetLabel: "M31" }),
  event("mount_stop", "23:40", { cause: "person" }),
  event("mount_parked", "23:50", { outcome: "requested" }),
  event("mount_parked", "23:52", { outcome: "parked" }),
  event("pointing_help", "23:00", {
    method: "mount",
    outcome: "centred",
    targetLabel: "M110",
  }),
  event("mount_aligned", "22:50", { outcome: "synced", targetLabel: "M110" }),
  event("target_finished", "23:30", { targetId: "m110" }),
];

test("one line per fact: a GoTo answered replaces its « sent », an unanswered one stays, a lost link carries its length", () => {
  const lines = sessionDeviceLines(journal);
  assert.deepEqual(
    lines.map((line) => line.kind),
    [
      "connected",
      "gotoArrived",
      "linkLost",
      "gotoRefused",
      "gotoSent",
      "aligned",
      "helpCentred",
      "stopped",
      "parked",
    ],
  );
  const arrived = lines.find((line) => line.kind === "gotoArrived");
  assert.equal(arrived.target, "M110");
  assert.equal(arrived.gapDegrees, 0.2);
  assert.equal(arrived.at, Date.parse("2026-10-02T21:57:00.000Z"));
  assert.equal(
    lines.find((line) => line.kind === "linkLost").lostForMs,
    120000,
  );
  // The GoTo to M31 never ended: its « sent » stays, STOP interrupted it.
  assert.equal(lines.find((line) => line.kind === "gotoSent").target, "M31");
});

test("a link lost and never back stays lost; a park never answered stays requested", () => {
  const lines = sessionDeviceLines([
    event("device_link_lost", "22:10"),
    event("mount_parked", "23:50", { outcome: "requested" }),
  ]);
  assert.deepEqual(
    lines.map((line) => [line.kind, line.source, line.lostForMs]),
    [
      ["linkLost", "telescope", null],
      ["parkRequested", "mount", null],
    ],
  );
});

test("a link closed by the person is a line of its own, never a lost link; a return after it pairs with nothing", () => {
  const lines = sessionDeviceLines([
    event("mount_connected", "21:05"),
    event("mount_disconnected", "22:00"),
    event("mount_connected", "22:05"),
    event("mount_link_lost", "22:30"),
    event("mount_disconnected", "22:40"),
    event("mount_link_back", "22:50"),
  ]);
  assert.deepEqual(
    lines.map((line) => [line.kind, line.lostForMs]),
    [
      ["connected", null],
      ["disconnected", null],
      ["connected", null],
      ["linkLost", null],
      ["disconnected", null],
    ],
  );
  assert.equal(
    view.deviceLineText(lines[1], "fr"),
    "Monture déconnectée par vous à 22:00",
  );
  assert.ok(!view.deviceLineText(lines[1], "fr").includes("Liaison perdue"));
});

test("the events of the devices are no report of the page, no movement of the window and no time of the summary", () => {
  const reports = model.sessionReports({
    events: journal,
    windowEnd: "2026-10-03T00:00:00.000Z",
  });
  assert.deepEqual(reports, []);
  for (const type of DEVICE_EVENT_TYPES)
    assert.equal(isDeviceEventType(type), true);
  assert.equal(isDeviceEventType("note"), false);
  const only = debriefSummary({
    nightStartAt: "2026-10-02T21:30:00.000Z",
    window: { start: "2026-10-02T21:30:00.000Z" },
    planItems: [
      { id: "m110", targetId: "m110", startMinute: 25, endMinute: 125 },
    ],
    events: [
      event("target_started", "21:55", {
        targetId: "m110",
        planItemId: "m110",
      }),
      event("note", "22:55", { text: "Wind." }),
      event("mount_stop", "23:40", { cause: "person" }),
      event("mount_link_lost", "23:50"),
    ],
  });
  const passage = only.perTarget[0].passages[0];
  assert.equal(passage.end, "2026-10-02T22:55:00.000Z");
});

test("the sentences, in French as the phone writes them", () => {
  const sentences = sessionDeviceLines(journal).map((line) =>
    view.deviceLineText(line, "fr"),
  );
  assert.deepEqual(sentences, [
    "Monture connectée à 21:30",
    "M110 pointée par GoTo à 21:57 (écart 0,2°)",
    "Liaison perdue 2\u00a0min (dès 22:10)",
    "GoTo Saturne refusé à 22:30",
    "GoTo M31 envoyé à 22:40",
    "Monture synchronisée sur M110 à 22:50",
    "Aide au pointage : M110 centrée à 23:00",
    "Monture arrêtée à 23:40",
    "Monture parquée à 23:52",
  ]);
});

test("the hours are the place's when its zone is known, UTC otherwise", () => {
  const [line] = sessionDeviceLines([event("mount_stop", "23:40")]);
  assert.equal(view.deviceLineText(line, "fr"), "Monture arrêtée à 23:40");
  assert.equal(
    view.deviceLineText(line, "fr", "Asia/Tokyo"),
    "Monture arrêtée à 08:40",
  );
});

test("a smart telescope in mode expérimental is a telescope, a night end is said, an unnamed target is « la cible »", () => {
  const lines = sessionDeviceLines([
    event("device_connected", "21:30", { family: "origin" }),
    event("device_goto", "21:40", { outcome: "sent" }),
    event("device_stop", "23:40", { cause: "night_end" }),
  ]);
  assert.deepEqual(
    lines.map((line) => view.deviceLineText(line, "fr")),
    [
      "Télescope connecté à 21:30",
      "GoTo la cible envoyé à 21:40",
      "Télescope arrêté à 23:40, à la fin de la nuit",
    ],
  );
});

test("every language says every line: no key is missing, no placeholder is left", () => {
  const lines = sessionDeviceLines([
    ...journal,
    event("device_connected", "21:31", { family: "origin" }),
    event("device_stop", "23:41", { cause: "night_end" }),
    event("device_parked", "23:42", { outcome: "parked" }),
    event("pointing_help", "23:01", { method: "manual", outcome: "centred" }),
    event("pointing_help", "23:02", { method: "mount", outcome: "failed" }),
    event("pointing_help", "23:03", { method: "mount", outcome: "refused" }),
    event("pointing_help", "23:04", { method: "mount", outcome: "stopped" }),
    event("pointing_help", "23:05", { method: "mount", outcome: "lost" }),
    event("mount_aligned", "23:06", { outcome: "refused" }),
    event("mount_parked", "23:07", { outcome: "refused" }),
    event("mount_disconnected", "23:08"),
  ]);
  for (const locale of Object.keys(messages)) {
    for (const line of lines) {
      const text = view.deviceLineText(line, locale);
      assert.ok(text.length > 0, `${locale} ${line.kind}`);
      assert.ok(!/[{}]/u.test(text), `${locale} ${line.kind}: ${text}`);
      assert.ok(!text.includes("undefined"), `${locale} ${line.kind}: ${text}`);
    }
    assert.ok(messages[locale].sessionDevicesTitle, locale);
  }
});

test("the section is drawn with a title and one line per fact, and nothing for a night that kept none", async () => {
  const { SessionDevices } = await loadJsxModule(
    "components/sessions/SessionDevices.js",
  );
  const html = renderToStaticMarkup(
    createElement(SessionDevices, {
      locale: "fr",
      lines: sessionDeviceLines(journal),
    }),
  );
  assert.match(html, /Monture et pointage/u);
  assert.match(html, /M110 pointée par GoTo à 21:57/u);
  assert.match(html, /Liaison perdue 2\u00a0min/u);
  assert.match(html, /Monture arrêtée à 23:40/u);
  assert.equal(
    renderToStaticMarkup(
      createElement(SessionDevices, { locale: "fr", lines: [] }),
    ),
    "",
  );
});

test("the journal list of the page names such an event and says its sentence", async () => {
  const page = await loadJsxModule("components/sessions/SessionDetailPage.js");
  const stop = event("mount_stop", "23:40", { cause: "person" });
  assert.equal(page.eventTypeLabel("mount_stop", "fr"), "Monture et pointage");
  assert.equal(page.eventDetail(stop, "fr"), "Monture arrêtée à 23:40");
});
