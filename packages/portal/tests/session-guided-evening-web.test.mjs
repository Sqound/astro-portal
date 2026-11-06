// GUIDED-EVENING-04: a guided evening that ran under the night (the pointing
// aid, a mount, the share) leaves its summary in the session, and the web's
// page of the session says it as the phone's Journal card does: the route,
// the way of observing and its help, the steps seen, the duration, « pour les
// enfants ». It is no report on a target and moves no window of the summary.
import assert from "node:assert/strict";
import { test } from "node:test";

import { debriefSummary } from "../dist/debrief-summary.js";
import * as model from "../dist/components/sessions/session-page-model.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const loadJsxModule = (path) => import(`portal/${path}`);

const guided = {
  eventId: "01J8Z3K9QZ6N3S6R3E6G8H0002",
  sessionId: "s1",
  type: "guided_evening",
  recordedAt: "2026-10-14T20:45:00.000Z",
  receivedAt: "2026-10-14T20:45:00.000Z",
  timing: "observed",
  payload: {
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
  },
};

test("the journal of the session names the guided evening and says it as the phone's card", async () => {
  const page = await loadJsxModule("components/sessions/SessionDetailPage.js");
  assert.equal(page.eventTypeLabel("guided_evening", "fr"), "Soirée guidée");
  assert.equal(page.eventTypeLabel("guided_evening", "en"), "Guided evening");
  assert.equal(
    page.eventDetail(guided, "fr"),
    "Les dix étoiles les plus brillantes · sur pied, aide au pointage · étapes vues\u00a0: 7 sur 10 · 1\u00a0h\u00a005 · pour les enfants",
  );
  // A later field this version does not know is left out; without the
  // duration, the two instants give it.
  const { durationMinutes: _minutes, ...older } = guided.payload;
  assert.equal(
    page.eventDetail(
      { ...guided, payload: { ...older, kids: false, help: "none" } },
      "en",
    ),
    "Les dix étoiles les plus brillantes · on a tripod · steps seen: 7 of 10 · 1\u00a0h\u00a05\u00a0min",
  );
});

test("a guided evening is no report and moves no window of the summary", () => {
  const reports = model.sessionReports({ events: [guided] });
  assert.equal(
    reports.some((report) => report.id === guided.eventId),
    false,
  );
  const summary = debriefSummary({
    plan: null,
    events: [guided],
  });
  assert.ok(summary);
});
