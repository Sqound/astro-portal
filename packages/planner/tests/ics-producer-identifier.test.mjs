import assert from "node:assert/strict";
import test from "node:test";
import { planCalendarIcs, weatherReminderIcs } from "planner/export.js";

// The calendar files named the product's former name in their producer
// identifier. A calendar file that leaves the app is public: it names the
// publisher and the product, never a former name. The event UID keeps its
// historical prefix on purpose: a calendar de-duplicates on the UID, and
// changing it would duplicate every event already exported.

const plan = { id: "plan-1", name: "Autumn", date: "2026-10-18", items: [] };
const night = {
  start: "2026-10-18T19:00:00.000Z",
  end: "2026-10-19T04:00:00.000Z",
};

test("the calendar event names the publisher and the product", () => {
  const ics = planCalendarIcs({ plan, night, targets: [] });
  assert.match(
    ics,
    /\r\nPRODID:-\/\/Sqound\/\/PlanAstro Observation planner\/\/EN\r\n/,
  );
  assert.doesNotMatch(ics, /PRODID:[^\r]*Astro Portal/);
  assert.match(ics, /\r\nUID:astro-portal-plan-1\r\n/);
});

test("the weather reminder names the publisher and the product", () => {
  const ics = weatherReminderIcs({ plan, night });
  assert.match(
    ics,
    /\r\nPRODID:-\/\/Sqound\/\/PlanAstro Weather reminder\/\/EN\r\n/,
  );
  assert.doesNotMatch(ics, /PRODID:[^\r]*Astro Portal/);
});
