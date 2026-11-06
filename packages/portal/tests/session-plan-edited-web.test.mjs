// A plan changed while the night ran is an event of the session, and the web
// journal says it: « Ajoutées au plan : M45 (02:54 → 03:54) », « Déplacées :
// NGC 253 (03:14 → 03:34) ». It is no report on a target and moves no window
// of the summary.
import assert from "node:assert/strict";
import { test } from "node:test";

import { debriefSummary } from "../dist/debrief-summary.js";
import * as model from "../dist/components/sessions/session-page-model.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const loadJsxModule = (path) => import(`portal/${path}`);

const edited = {
  eventId: "01J8Z3K9QZ6N3S6R3E6G8H0001",
  sessionId: "s1",
  type: "plan_edited",
  recordedAt: "2026-10-02T21:50:00.000Z",
  receivedAt: "2026-10-02T21:50:00.000Z",
  timing: "observed",
  payload: {
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
  },
};

test("the journal list names the event and says the added and the moved targets with their hours", async () => {
  const page = await loadJsxModule("components/sessions/SessionDetailPage.js");
  assert.equal(page.eventTypeLabel("plan_edited", "fr"), "Plan modifié");
  assert.equal(page.eventTypeLabel("plan_edited", "en"), "Plan changed");
  // The plan's night starts at 22:00 (UTC): minute 294 is 02:54 the day after.
  const start = Date.parse("2026-10-02T22:00:00.000Z");
  const hourAt = (minute) =>
    new Date(start + minute * 60000).toISOString().slice(11, 16);
  const titleOf = (id) => ({ m45: "M45", ngc253: "NGC 253" })[id] ?? id;
  assert.equal(
    page.eventDetail(edited, "fr", titleOf, hourAt),
    "Ajoutées au plan : M45 (02:54 → 03:54) — Déplacées : NGC 253 (03:14 → 03:34)",
  );
  assert.equal(
    page.eventDetail(edited, "en", titleOf, hourAt),
    "Added to the plan: M45 (02:54 → 03:54) — Moved: NGC 253 (03:14 → 03:34)",
  );
  // Without the plan's night the names stand alone, never a wrong hour.
  assert.equal(
    page.eventDetail(edited, "en", titleOf),
    "Added to the plan: M45 — Moved: NGC 253",
  );
  assert.equal(
    page.eventDetail(
      {
        ...edited,
        payload: { origin: "undo", removed: [{ targetLabel: "M45" }] },
      },
      "en",
    ),
    "Removed from the plan: M45",
  );
});

test("a plan_edited event is no report of the page and no time of the summary", () => {
  assert.deepEqual(
    model.sessionReports({
      events: [edited],
      windowEnd: "2026-10-03T00:00:00.000Z",
    }),
    [],
  );
  const input = {
    nightStartAt: "2026-10-02T21:30:00.000Z",
    window: { start: "2026-10-02T21:30:00.000Z" },
    planItems: [
      { id: "m110", targetId: "m110", startMinute: 25, endMinute: 125 },
    ],
  };
  const started = {
    eventId: "01J8Z3K9QZ6N3S6R3E6G8H0002",
    sessionId: "s1",
    type: "target_started",
    recordedAt: "2026-10-02T21:55:00.000Z",
    receivedAt: "2026-10-02T21:55:00.000Z",
    timing: "observed",
    payload: { targetId: "m110" },
  };
  assert.deepEqual(
    debriefSummary({ ...input, events: [started, edited] }),
    debriefSummary({ ...input, events: [started] }),
  );
});
