import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import {
  pastNightCandidates,
  pastNightDebriefHref,
  pastNightDebriefWords,
  pastNightKey,
  pastNightPlansDue,
  planDatesOf,
  planNightIsOver,
  serverPlanIdFor,
} from "planner/past-night-debrief.js";

// Web side: a plan saved whose night is already over offers its
// debriefing in a dialog "Plan d’une nuit passée".

await registerJsx();
const { PastNightDebriefActions } =
  await import("planner/components/PastNightDebriefDialog.js");

const location = {
  id: "paris",
  name: "Paris",
  latitude: "48.8566",
  longitude: "2.3522",
  timeZone: "Europe/Paris",
};
const plan = (id, date, extra = {}) => ({
  id,
  date,
  name: id,
  location,
  status: "pending",
  items: [],
  ...extra,
});
// The evening of 2026-09-22 in Paris: dusk about 19:00 UTC, dawn about 04:30
// UTC the next morning.
const inTheNight = Date.parse("2026-09-23T00:30:00Z");
const nextNoon = Date.parse("2026-09-23T12:00:00Z");
// The French typography writes a no-break space before ":"; the test reads
// plain spaces.
const plain = (text) => text.replaceAll("\u00a0", " ");
const locales = [
  "fr",
  "en",
  "de",
  "es",
  "it",
  "ja",
  "pt-BR",
  "ru",
  "zh-Hans",
  "zh-Hant",
];

test("the night is over once the place's night has ended, never while it is in progress", () => {
  assert.equal(
    planNightIsOver({ date: "2020-03-10", location, now: nextNoon }),
    true,
  );
  assert.equal(
    planNightIsOver({ date: "2099-03-10", location, now: nextNoon }),
    false,
  );
  assert.equal(
    planNightIsOver({ date: "2026-09-22", location, now: inTheNight }),
    false,
  );
  assert.equal(
    planNightIsOver({ date: "2026-09-22", location, now: nextNoon }),
    true,
  );
  assert.equal(planNightIsOver({ date: null, location, now: nextNoon }), false);
  assert.equal(
    planNightIsOver({ date: "demain", location, now: nextNoon }),
    false,
  );
});

test("a save offers the plans it created or re-dated, not the others", () => {
  const before = planDatesOf([
    plan("a", "2026-09-30"),
    plan("b", "2026-10-02"),
  ]);
  const after = [
    plan("a", "2026-09-30"),
    plan("b", "2026-09-10"), // moved into the past
    plan("c", "2026-09-01"), // created
  ];
  assert.deepEqual(pastNightCandidates({ previous: before, plans: after }), [
    "b",
    "c",
  ]);
  // The page has not settled a first document yet: nothing is known.
  assert.deepEqual(pastNightCandidates({ previous: null, plans: after }), []);
});

test("only the plans still to be carried out whose night is over, once", () => {
  const plans = [
    plan("past", "2026-09-10"),
    plan("future", "2099-01-01"),
    plan("tonight", "2026-09-22"),
    plan("done", "2026-09-10", { status: "executed" }),
    plan("seen", "2026-09-11"),
  ];
  const offered = new Set([pastNightKey(plans[4])]);
  const due = (now) =>
    pastNightPlansDue({
      plans,
      ids: plans.map((candidate) => candidate.id),
      now,
      offered,
    }).map((candidate) => candidate.id);
  assert.deepEqual(due(inTheNight), ["past"], "the night in progress is not");
  assert.deepEqual(due(nextNoon), ["past", "tonight"]);
  // A plan whose date changes again is offered again, one that stays is not.
  assert.equal(
    pastNightKey(plans[0]) === pastNightKey(plan("past", "2026-09-11")),
    false,
  );
});

test("the dialog speaks in the ten languages, the sentence stopping at the Journal without a space", () => {
  const french = pastNightDebriefWords("fr");
  assert.equal(french.title, "Plan d’une nuit passée");
  assert.equal(
    plain(french.body),
    "Cette nuit est déjà passée. Débriefez-la maintenant pour en faire une session : elle apparaîtra dans votre Journal, dans Astro Sync et dans votre espace web.",
  );
  assert.equal(
    plain(pastNightDebriefWords("fr", { hasSpace: false }).body),
    "Cette nuit est déjà passée. Débriefez-la maintenant pour en faire une session dans votre Journal.",
  );
  assert.equal(french.now, "Débriefer maintenant");
  assert.equal(french.later, "Plus tard");
  for (const locale of locales) {
    const full = pastNightDebriefWords(locale);
    const short = pastNightDebriefWords(locale, { hasSpace: false });
    for (const [name, value] of Object.entries({ ...full, short: short.body }))
      assert.ok(
        value && !/^debriefOffer/.test(value),
        `${locale}.${name} is written`,
      );
    assert.notEqual(full.body, short.body, `${locale}: two sentences`);
    assert.ok(
      /Astro Sync/.test(full.body) && !/Astro Sync/.test(short.body),
      `${locale}: Astro Sync only in the full sentence`,
    );
  }
  // The words of the interface.
  for (const text of Object.values(french))
    assert.doesNotMatch(text, /séance|session en cours|journal des nuits/i);
});

test("« Plus tard » (secondary) then « Débriefer maintenant » (primary, a link to the debriefing)", () => {
  const html = renderToStaticMarkup(
    createElement(PastNightDebriefActions, {
      locale: "fr",
      href: pastNightDebriefHref("fr", "plan 1"),
      onClose() {},
    }),
  );
  const later = html.indexOf("btn-secondary");
  const now = html.indexOf("btn-primary");
  assert.ok(later !== -1 && now > later, "the primary comes last");
  assert.match(html, /<button[^>]*btn-secondary[^>]*>Plus tard<\/button>/);
  assert.match(
    html,
    /<a[^>]*btn-primary[^>]*href="\/fr\/sessions\/debrief\/plan%201"[^>]*>Débriefer maintenant<\/a>/,
  );
});

test("the service's id of the plan is the one the debriefing opens on; a visitor has none", async () => {
  const request = async () => ({
    ok: true,
    json: async () => ({
      plans: [
        { id: "srv-1", payload: { id: "other" } },
        { id: "srv-2", payload: { id: "browser-plan" } },
      ],
    }),
  });
  assert.equal(await serverPlanIdFor("browser-plan", { request }), "srv-2");
  assert.equal(await serverPlanIdFor("unknown", { request }), null);
  assert.equal(
    await serverPlanIdFor("browser-plan", {
      request: async () => ({ ok: false }),
    }),
    null,
  );
  assert.equal(
    await serverPlanIdFor("browser-plan", {
      request: async () => {
        throw new Error("offline");
      },
    }),
    null,
  );
});
