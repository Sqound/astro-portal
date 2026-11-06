import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { message } from "portal/i18n.js";
import { scorePlanTargets } from "planner/tonight-plan-targets.js";
import { clock } from "planner/wind-section.js";
import { shippedLocales } from "portal/locales.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// A click on a library card opens the plan's dialog: its words, the kind of
// plan, and the dialog rendered with its actions, the action fixed at the foot
// ("Modifier le plan", a secondary; the blue "Débriefer cette session" of a
// night that waits), "Autres actions" with the removing ones last and never
// "Supprimer le plan" on an executed plan; no "Exécuter" on the web.

await registerJsx();
// `WebDialog` draws through a portal (nothing on the server): a stand-in lays
// its title, body and footer out in place, as `plan-targets-web.test.mjs`.
globalThis.__createElement = createElement;
const DIALOG = `data:text/javascript,${encodeURIComponent(
  'const h = globalThis.__createElement; export const WebDialog = ({ title, children, footer, footerClassName }) => h("div", { className: "web-dialog-stand-in" }, h("h2", null, title), h("div", { className: "web-dialog-body" }, children), h("footer", { className: footerClassName }, footer));',
)}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "portal/components/dialog/WebDialog.js")
      return { url: DIALOG, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { PlanSheetDialog } =
  await import("planner/components/PlanSheetDialog.js");
// The words read "détails"' words from its component module: after JSX.
const { planDaysAgo, planSheetKind, planSheetWords } =
  await import("planner/plan-sheet-words.js");
const {
  planLibraryStatus,
  planLibraryStatusFromParameter,
  planLibraryStatusKey,
  planLibraryStatusParameter,
  planLibraryStatuses,
  planStatus,
} = await import("planner/planner.js");
const { loadPlanSessions, planSessionHref, planSessionLine } =
  await import("planner/plan-sessions.js");
const {
  noPlanFilters,
  planActionsOf,
  planDebriefWordKey,
  planFilterStatusChoices,
  planFiltersCount,
  planFiltersWithStatuses,
  planStatusPreselection,
  planStatusSelection,
  planFiltersFromAddress,
  planFiltersToAddress,
  planMainFilterOf,
  planPassesFilters,
  planStatusTags,
} = await import("planner/plan-library-filters.js");

const place = {
  id: "lac-noir",
  name: "Camping du Lac Noir",
  latitude: 45,
  longitude: -30,
  timeZone: "UTC",
};
// The afternoon of mer. 14 oct., before the night.
const now = Date.parse("2026-10-14T17:00:00Z");
const target = (id, designation, title, ra, dec, type) => ({
  id,
  designation,
  title,
  objects: [designation],
  coordinate: { ra, dec },
  coordinateUnit: "degrees",
  skyTarget: { type },
  apparentSizeArcmin: [120, 60],
});
const items = [
  {
    startMinute: 205,
    endMinute: 325,
    target: target(
      "ngc7000",
      "NGC 7000",
      "NGC 7000 — Amérique du Nord",
      314.68,
      44.33,
      "Nébuleuse en émission",
    ),
  },
  {
    startMinute: 55,
    endMinute: 175,
    target: target(
      "m31",
      "M31",
      "M31 — Galaxie d’Andromède",
      10.68,
      41.27,
      "Galaxie",
    ),
  },
];
const plan = (
  id,
  date,
  status = "pending",
  name = "Nuit d’octobre au lac",
) => ({
  id,
  name,
  status,
  date,
  location: place,
  items,
});
const tonight = plan("plan-lac", "2026-10-14");
const later = plan("plan-ngc", "2026-10-17", "pending", "NGC 7000 puis M33");
const past = plan("plan-col", "2026-10-10", "executed", "Week-end au col");
const at = (value) => clock(value, "fr", "UTC");

test("the kind of plan and the days of a past night", () => {
  assert.equal(planSheetKind(tonight, { now }), "tonight");
  assert.equal(planSheetKind(later, { now }), "later");
  assert.equal(planSheetKind(past, { now }), "past");
  assert.equal(
    planSheetKind({ ...later, status: "abandoned" }, { now }),
    "past",
  );
  assert.equal(planDaysAgo(past, { now }), 4);
  assert.equal(planDaysAgo(later, { now }), null);
  assert.equal(planDaysAgo(tonight, { now }), null);
});

test("the words of the dialog, in order: the night and its time left, the place, the astronomical night, the targets in the order of the night", () => {
  const nights = scorePlanTargets({ plan: tonight, locale: "fr" });
  const words = planSheetWords("fr", tonight, { now, clock: at, nights });
  assert.equal(words.title, "Nuit d’octobre au lac");
  assert.equal(words.state, "Planifié");
  assert.equal(words.sync, "Synchronisé");
  assert.match(words.night, /^Ce soir · mer\. 14 oct\. · commence dans /);
  assert.equal(words.place, "Camping du Lac Noir");
  assert.match(words.darkness, /^Nuit astronomique \d\d:\d\d → \d\d:\d\d$/);
  assert.equal(words.readOnly, null);
  assert.equal(
    words.heading.replaceAll("\u00a0", " "),
    "2 cibles · 4 h placées",
  );
  // M31 first: it comes first in the night.
  assert.deepEqual(
    words.rows.map((row) => row.designation),
    ["M31", "NGC 7000"],
  );
  assert.match(words.rows[0].slot, /^\d\d:\d\d → \d\d:\d\d · 2\sh$/);
  assert.match(words.rows[0].score, /^\d+$/);
  assert.equal(words.canEdit, true);
  assert.deepEqual(words.tags, ["planned"]);

  const laterWords = planSheetWords("fr", later, { now, clock: at });
  assert.equal(laterWords.night, "Sam. 17 oct. · dans 3 jours");
  const pastWords = planSheetWords("fr", past, { now, clock: at });
  assert.equal(pastWords.night, "Sam. 10 oct. · il y a 4 jours");
  assert.equal(
    pastWords.readOnly.replaceAll("\u00a0", " "),
    "Plan exécuté : consultation uniquement.",
  );
  assert.equal(pastWords.canEdit, false);
  // English and Japanese say the same.
  assert.equal(
    planSheetWords("en", later, { now, clock: at }).night,
    "Sat, Oct 17 · in 3 days",
  );
  assert.match(
    planSheetWords("ja", past, { now, clock: at }).night,
    /^10月10日\(土\) · 4日前$/,
  );
});

const planActions = (plan, facts) => planActionsOf(plan, facts);

test("the dialog: the block, the rows, « Autres actions » with « Supprimer le plan » last (red tertiary), then « Modifier le plan » (secondary) fixed at the foot; no « Exécuter »", () => {
  const markup = renderToStaticMarkup(
    createElement(PlanSheetDialog, {
      locale: "fr",
      plan: tonight,
      clock: at,
      now,
      actions: planActions(tonight, { nightAhead: true }),
      onClose() {},
    }),
  );
  assert.match(markup, /<h2>Nuit d’octobre au lac<\/h2>/);
  assert.match(markup, /class="plan-sheet-block" aria-label="Le plan"/);
  assert.match(markup, /class="plan-sheet-target-row" data-item="item-1"/);
  assert.ok(
    markup.indexOf('data-item="item-1"') < markup.indexOf('data-item="item-0"'),
    "the rows in the order of the night",
  );
  const others = markup.slice(
    markup.indexOf('class="plan-sheet-others"'),
    markup.indexOf("<footer"),
  );
  assert.match(others, /Autres actions/);
  const archive = others.indexOf('data-action="archive">Archiver le plan');
  const remove = others.indexOf(
    'class="btn-tertiary is-destructive" data-action="delete">Supprimer le plan',
  );
  assert.ok(archive > 0 && remove > archive, "the removing action comes last");
  assert.doesNotMatch(others, /data-action="execute"/, "the night is ahead");
  const footer = markup.slice(markup.indexOf("<footer"));
  assert.match(footer, /^<footer class="plan-sheet-footer">/);
  assert.match(
    footer,
    /class="btn-secondary plan-sheet-action" data-action="edit">Modifier le plan/,
  );
  assert.doesNotMatch(markup, /Exécuter le plan|Versions précédentes/);
});

// The plan's export at the end of the
// fixed bar, an icon-only tertiary of 44 px, whatever the state of the plan.
const exportButton = (markup) =>
  markup.match(/<button[^>]*data-action="export"[^>]*>/)?.[0] ?? null;

test("the bar ends with the icon-only « Exporter ce plan » (tertiary, named), after « Modifier le plan »", () => {
  const markup = renderToStaticMarkup(
    createElement(PlanSheetDialog, {
      locale: "fr",
      plan: tonight,
      clock: at,
      now,
      actions: planActions(tonight, { nightAhead: true }),
      onClose() {},
      onAction() {},
    }),
  );
  const footer = markup.slice(markup.indexOf("<footer"));
  const button = exportButton(footer);
  assert.ok(button, "the export button is in the footer");
  assert.match(button, /class="btn-tertiary plan-sheet-export"/);
  assert.match(button, /aria-label="Exporter ce plan"/);
  assert.match(button, /title="Exporter ce plan"/);
  assert.ok(
    footer.indexOf('data-action="edit"') <
      footer.indexOf('data-action="export"'),
    "the export is last",
  );
  // One primary-level action at most: "Modifier le plan" stays the only secondary.
  assert.equal((footer.match(/btn-secondary/g) || []).length, 1);
  assert.doesNotMatch(footer, /btn-primary/);
});

test("an executed, abandoned or debriefed plan keeps the export (the plan as it is), alone or beside « Débriefer »", () => {
  for (const status of ["executed", "partial", "abandoned", "archived"]) {
    const plan = { ...past, status };
    const markup = renderToStaticMarkup(
      createElement(PlanSheetDialog, {
        locale: "en",
        plan,
        clock: at,
        now,
        actions: planActions(plan, {}),
        onClose() {},
        onAction() {},
      }),
    );
    const footer = markup.slice(markup.indexOf("<footer"));
    assert.match(
      footer,
      /^<footer class="plan-sheet-footer is-alone"><button[^>]*data-action="export"/,
      status,
    );
    assert.match(exportButton(footer), /aria-label="Export this plan"/);
  }
  const waiting = {
    planId: "srv-col",
    sessionId: "ses-col",
    state: "to_debrief",
  };
  const debrief = renderToStaticMarkup(
    createElement(PlanSheetDialog, {
      locale: "fr",
      plan: past,
      clock: at,
      now,
      session: waiting,
      actions: planActions(past, { toDebrief: true, hasSession: true }),
      onClose() {},
      onAction() {},
    }),
  );
  const footer = debrief.slice(debrief.indexOf("<footer"));
  assert.ok(
    footer.indexOf('data-action="debrief"') <
      footer.indexOf('data-action="export"'),
    "« Débriefer cette session » first, the export at the end",
  );
});

test("the click calls the library with « export »; the library opens the planner's export menu for that plan (one entry, one export menu)", async () => {
  const calls = [];
  const markup = renderToStaticMarkup(
    createElement(PlanSheetDialog, {
      locale: "fr",
      plan: tonight,
      clock: at,
      now,
      actions: planActions(tonight, { nightAhead: true }),
      onClose() {},
      onAction: (action) => calls.push(action),
    }),
  );
  assert.ok(exportButton(markup));
  // The wiring, by source: the dialog's action reaches the page's own
  // `exportPlanId` (the dialog `PlanExportDialog` already serves the tool row).
  const { readFile } = await import("node:fs/promises");
  const page = await readFile(
    new URL("../src/components/PlannerPage.js", import.meta.url),
    "utf8",
  );
  assert.match(page, /else if \(action === "export"\) onExport\(plan\.id\);/);
  assert.match(page, /onExport=\{setExportPlanId\}/);
  assert.match(page, /<PlanExportDialog/);
});

test("the dialog of a plan no longer pending: no « Modifier », never « Supprimer le plan » on an executed plan; « lié à sa session » with « Voir la session »; an abandoned plan keeps « Supprimer le plan »", () => {
  const gave = {
    planId: "srv-col",
    sessionId: "ses-col",
    state: "executed",
    acquiredSeconds: 3600,
    plannedSeconds: 3600,
  };
  const executed = renderToStaticMarkup(
    createElement(PlanSheetDialog, {
      locale: "fr",
      plan: past,
      clock: at,
      now,
      session: gave,
      actions: planActions(past, { hasSession: true }),
    }),
  );
  assert.match(executed, /Plan exécuté\u00a0: consultation uniquement\./);
  assert.doesNotMatch(executed, /data-action="edit"/);
  assert.doesNotMatch(
    executed,
    /data-action="delete"/,
    "no delete on an executed plan",
  );
  assert.match(executed, /data-action="archive">Archiver le plan/);
  assert.match(
    executed,
    /plan-linked[^>]*><p>Ce plan est exécuté et lié à sa session, qui contient les captures et les données de cette nuit\.<\/p><a class="btn-secondary" data-action="see-session" href="\/fr\/sessions\/ses-col">Voir la session<\/a>/,
  );
  const abandoned = renderToStaticMarkup(
    createElement(PlanSheetDialog, {
      locale: "fr",
      plan: { ...past, status: "abandoned" },
      clock: at,
      now,
      actions: planActions({ ...past, status: "abandoned" }, {}),
    }),
  );
  assert.match(abandoned, /data-action="delete">Supprimer le plan/);
  assert.doesNotMatch(abandoned, /data-action="edit"/);
});

test("a night that waits for its debriefing wears « Exécuté » then « À débriefer », and the blue « Débriefer cette session » is fixed at the foot, the link to the session a tertiary", () => {
  const waiting = {
    planId: "srv-col",
    sessionId: "ses-col",
    state: "to_debrief",
  };
  assert.deepEqual(planStatusTags(past, { toDebrief: true }), [
    "executed",
    "toDebrief",
  ]);
  assert.deepEqual(planStatusTags({ ...past, status: "partial" }, {}), [
    "partial",
  ]);
  assert.deepEqual(planStatusTags(tonight, { toDebrief: true }), ["toDebrief"]);
  const markup = renderToStaticMarkup(
    createElement(PlanSheetDialog, {
      locale: "fr",
      plan: past,
      clock: at,
      now,
      session: waiting,
      actions: planActions(past, { toDebrief: true, hasSession: true }),
    }),
  );
  const status = markup.slice(
    markup.indexOf('class="plan-sheet-status"'),
    markup.indexOf("</p>", markup.indexOf('class="plan-sheet-status"')),
  );
  assert.ok(
    status.indexOf("Exécuté") > 0 &&
      status.indexOf("À débriefer") > status.indexOf("Exécuté"),
    "two tags, in that order",
  );
  assert.match(markup, /data-status-tone="toDebrief"/);
  assert.match(
    markup,
    /<a class="btn-secondary is-debrief plan-sheet-action" data-action="debrief" href="\/fr\/sessions\/ses-col">Débriefer cette session<\/a>/,
  );
  assert.match(
    markup,
    /<a class="btn-tertiary" data-action="see-session" href="\/fr\/sessions\/ses-col">Voir la session<\/a>/,
  );
});

test("a plan debriefed whose session was deleted says « Session manquante » and offers to make it again", async () => {
  const missing = {
    planId: "srv-col",
    sessionId: null,
    state: "missing",
    deletedSessionId: null,
  };
  const markup = renderToStaticMarkup(
    createElement(PlanSheetDialog, {
      locale: "fr",
      plan: past,
      clock: at,
      now,
      session: missing,
      actions: planActions(past, {}),
    }),
  );
  assert.match(markup, /plan-missing[^>]*><h3>Session manquante<\/h3>/);
  assert.match(
    markup,
    /data-action="recreate-session">Recréer la session à partir du plan/,
  );
  assert.doesNotMatch(markup, /see-session|Voir la session/);
  assert.equal(planSessionHref("fr", missing), null);
  assert.equal(planSessionLine("fr", missing), null);
  // The library reads it from the plans of the space (`sessionMissing`).
  const request = async (path) => ({
    ok: true,
    json: async () =>
      path.startsWith("/api/v1/plans")
        ? {
            plans: [
              {
                id: "srv-a",
                sessionMissing: true,
                deletedSessionId: "ses-gone",
                payload: { id: "plan-a" },
              },
            ],
          }
        : { sessions: [], nextCursor: null },
  });
  const sessions = await loadPlanSessions({ request });
  assert.equal(sessions.get("plan-a").state, "missing");
  assert.equal(sessions.get("plan-a").deletedSessionId, "ses-gone");
});

// The main filter, "Filtres" and the address.
test("the main filter: « À exécuter » / « Exécutés »; an abandoned plan is under « Exécutés » but hidden by default, like an archived one", () => {
  const stored = (status, date = "2026-10-10") => ({ ...past, status, date });
  assert.equal(planMainFilterOf("pending"), "to_execute");
  assert.equal(planMainFilterOf("executed"), "executed");
  assert.equal(planMainFilterOf("partial"), "executed");
  assert.equal(planMainFilterOf("abandoned"), "executed");
  assert.equal(planMainFilterOf("archived"), null);
  const listed = (plan, main, filters = noPlanFilters, toDebrief = false) =>
    planPassesFilters(plan, { toDebrief, main, filters });
  // By default: planned plans under "À exécuter", executed ones under
  // "Exécutés", neither the abandoned nor the archived ones.
  assert.equal(listed(stored("pending"), "to_execute"), true);
  assert.equal(listed(stored("pending"), "executed"), false);
  assert.equal(listed(stored("executed"), "executed"), true);
  assert.equal(listed(stored("partial"), "executed"), true);
  assert.equal(listed(stored("abandoned"), "executed"), false);
  assert.equal(listed(stored("archived"), "executed"), false);
  assert.equal(listed(stored("archived"), "to_execute"), false);
  // An executed plan that waits for its debriefing is "Exécuté", not "À exécuter".
  assert.equal(
    listed(stored("executed"), "to_execute", noPlanFilters, true),
    false,
  );
  assert.equal(
    listed(stored("executed"), "executed", noPlanFilters, true),
    true,
  );
  // The statuses of "Filtres": several at once, each ticked or not
  // (the preselection ticks all but "Abandonné" and "Archivé").
  const only = (...statuses) => ({ year: null, statuses });
  assert.equal(
    listed(stored("abandoned"), "executed", only("abandoned")),
    true,
  );
  assert.equal(
    listed(stored("executed"), "executed", only("abandoned")),
    false,
  );
  assert.equal(
    listed(stored("executed"), "executed", only("abandoned", "executed")),
    true,
  );
  assert.equal(listed(stored("archived"), "executed", only("archived")), true);
  assert.equal(
    listed(stored("archived"), "to_execute", only("archived")),
    true,
  );
  assert.equal(
    listed(stored("executed"), "executed", only("toDebrief"), true),
    true,
    "the tag « À débriefer » of an executed plan",
  );
  assert.equal(
    listed(stored("executed"), "executed", only("toDebrief")),
    false,
  );
  // Nothing ticked lists nothing.
  assert.equal(listed(stored("executed"), "executed", only()), false);
  // "Tous" ticks really everything: the abandoned and the archived plans too.
  const everything = (main) => ({
    year: null,
    statuses: planFilterStatusChoices(main),
  });
  assert.equal(
    listed(stored("abandoned"), "executed", everything("executed")),
    true,
  );
  assert.equal(
    listed(stored("archived"), "to_execute", everything("to_execute")),
    true,
  );
  assert.equal(planStatusSelection(everything("executed"), "executed"), "all");
  assert.equal(planStatusSelection(noPlanFilters, "executed"), "preselection");
  assert.equal(planStatusSelection(only("executed"), "executed"), "custom");
  assert.deepEqual(planStatusPreselection("to_execute"), [
    "planned",
    "toDebrief",
  ]);
  assert.deepEqual(planStatusPreselection("executed"), [
    "toDebrief",
    "executed",
    "partial",
  ]);
  // The calendar has no main filter: the six statuses, the plans of any main
  // filter.
  assert.deepEqual(planStatusPreselection(null), [
    "planned",
    "toDebrief",
    "executed",
    "partial",
  ]);
  assert.equal(listed(stored("pending"), null), true);
  assert.equal(listed(stored("executed"), null), true);
  assert.equal(listed(stored("abandoned"), null), false);
  assert.equal(listed(stored("abandoned"), null, only("abandoned")), true);
  assert.equal(listed(stored("archived"), null, everything(null)), true);
  // Ticking the preselection by hand is the preselection: nothing chosen.
  assert.equal(
    planFiltersWithStatuses(
      noPlanFilters,
      ["planned", "toDebrief"],
      "to_execute",
    ).statuses,
    null,
  );
  // The year: "Toutes" by default (no badge until one is chosen).
  assert.equal(
    listed(stored("executed"), "executed", { year: "2025", statuses: null }),
    false,
  );
  assert.equal(
    listed(stored("executed"), "executed", { year: "2026", statuses: null }),
    true,
  );
  // The count on "Filtres": one per badge.
  assert.equal(planFiltersCount(noPlanFilters, "executed"), 0);
  assert.equal(
    planFiltersCount({ year: "2026", statuses: ["abandoned"] }, "executed"),
    2,
  );
  assert.equal(
    planFiltersCount(
      { year: null, statuses: planFilterStatusChoices("executed") },
      "executed",
    ),
    1,
    "« Statut · Tous » is one badge",
  );
});

test("the filters live in the address (?main=executed&year=2026&status=abandoned,archived); a status alone points at its main filter", () => {
  const known = planLibraryStatuses;
  assert.deepEqual(planFiltersFromAddress("", known), {
    main: "to_execute",
    filters: { year: null, statuses: null },
  });
  const read = planFiltersFromAddress(
    "?main=executed&year=2026&status=abandoned,archived,nonsense",
    known,
  );
  assert.deepEqual(read, {
    main: "executed",
    filters: { year: "2026", statuses: ["abandoned", "archived"] },
  });
  assert.equal(
    planFiltersToAddress(read).toString(),
    "main=executed&year=2026&status=abandoned%2Carchived",
  );
  assert.equal(
    planFiltersFromAddress("?status=to-debrief", known).filters.statuses[0],
    "toDebrief",
  );
  assert.equal(
    planFiltersFromAddress("?status=abandoned", known).main,
    "executed",
  );
  assert.equal(
    planFiltersFromAddress("?status=planned", known).main,
    "to_execute",
  );
  assert.equal(
    planFiltersToAddress({
      main: "to_execute",
      filters: noPlanFilters,
    }).toString(),
    "",
  );
});

test("the actions of a plan, in the order of the ⋯ menu: the ones that keep, then the removing ones; never « Supprimer » on an executed plan; execute and abandon only once the night has begun", () => {
  const actions = (plan, facts = {}) => planActionsOf(plan, facts);
  assert.deepEqual(actions(later, { nightAhead: true }), {
    keep: ["edit"],
    remove: ["archive", "delete"],
  });
  assert.deepEqual(actions(tonight), {
    keep: ["edit", "execute", "abandon"],
    remove: ["archive", "delete"],
  });
  assert.deepEqual(actions(tonight, { toDebrief: true, hasSession: true }), {
    keep: ["execute", "abandon", "debrief"],
    remove: ["archive", "delete"],
  });
  assert.deepEqual(actions(past, { hasSession: true }), {
    keep: ["session"],
    remove: ["archive"],
  });
  assert.deepEqual(actions({ ...past, status: "abandoned" }), {
    keep: [],
    remove: ["archive", "delete"],
  });
  assert.deepEqual(actions({ ...past, status: "archived" }), {
    keep: ["restore"],
    remove: [],
  });
});

// The library's one status of a plan, the words of
// the chips and the filter kept in the address.
test("the six statuses of a plan, from its stored status and the Journal's to_debrief; `partial` is no longer read as pending", () => {
  const stored = (status) => ({ status });
  assert.equal(planStatus(stored("partial")), "partial");
  assert.equal(planLibraryStatus(stored("pending")), "planned");
  assert.equal(planLibraryStatus(stored(undefined)), "planned");
  assert.equal(planLibraryStatus(stored("executed")), "executed");
  assert.equal(planLibraryStatus(stored("partial")), "partial");
  assert.equal(planLibraryStatus(stored("abandoned")), "abandoned");
  assert.equal(planLibraryStatus(stored("archived")), "archived");
  // To debrief takes the place of everything but the archive.
  for (const status of ["pending", "executed", "partial", "abandoned"])
    assert.equal(
      planLibraryStatus(stored(status), { toDebrief: true }),
      "toDebrief",
    );
  assert.equal(
    planLibraryStatus(stored("archived"), { toDebrief: true }),
    "archived",
  );
  // The words (masculine: the plan), in French, English and Japanese.
  const words = (locale) =>
    planLibraryStatuses.map((status) =>
      message(locale, planLibraryStatusKey(status)),
    );
  assert.deepEqual(words("fr"), [
    "Planifié",
    "À débriefer",
    "Exécuté",
    "En partie",
    "Abandonné",
    "Archivé",
  ]);
  assert.deepEqual(words("en"), [
    "Planned",
    "To debrief",
    "Executed",
    "Partly",
    "Abandoned",
    "Archived",
  ]);
  assert.deepEqual(words("ja"), [
    "予定",
    "振り返り待ち",
    "実行済み",
    "一部",
    "中止",
    "アーカイブ済み",
  ]);
  // The address keeps the filter, and only a status of the list.
  for (const status of planLibraryStatuses)
    assert.equal(
      planLibraryStatusFromParameter(planLibraryStatusParameter(status)),
      status,
    );
  assert.equal(planLibraryStatusParameter("toDebrief"), "to-debrief");
  assert.equal(planLibraryStatusFromParameter("abandoned"), "abandoned");
  assert.equal(planLibraryStatusFromParameter("tous"), null);
  assert.equal(planLibraryStatusFromParameter(null), null);
});

test("the Journal is read for each plan by the planner's own id; a failing service reads as no session", async () => {
  const pages = [
    {
      sessions: [
        {
          planId: "srv-a",
          sessionId: "ses-a",
          state: "partial",
          acquiredSeconds: 7200,
          plannedSeconds: 10800,
          frameCount: 40,
        },
        {
          planId: "srv-b",
          sessionId: null,
          state: "to_debrief",
          acquiredSeconds: null,
          plannedSeconds: 3600,
          frameCount: null,
        },
      ],
      nextCursor: "next",
    },
    {
      sessions: [
        {
          planId: "srv-a",
          sessionId: "ses-old",
          state: "executed",
          acquiredSeconds: 60,
          plannedSeconds: 60,
          frameCount: 1,
        },
        {
          planId: "srv-unknown",
          sessionId: "ses-z",
          state: "executed",
          acquiredSeconds: 60,
          plannedSeconds: 60,
          frameCount: 1,
        },
      ],
      nextCursor: null,
    },
  ];
  const asked = [];
  const request = async (path) => {
    asked.push(path);
    const body = path.startsWith("/api/v1/plans")
      ? {
          plans: [
            { id: "srv-a", payload: { id: "plan-a" } },
            { id: "srv-b", payload: { id: "plan-b" } },
          ],
        }
      : pages[path.includes("cursor=next") ? 1 : 0];
    return { ok: true, json: async () => body };
  };
  const sessions = await loadPlanSessions({ request });
  assert.deepEqual([...sessions.keys()], ["plan-a", "plan-b"]);
  // The most recent line of a plan wins (the Journal lists the latest first).
  assert.equal(sessions.get("plan-a").sessionId, "ses-a");
  assert.equal(sessions.get("plan-b").state, "to_debrief");
  assert.equal(asked.length, 3);
  assert.match(asked[1], /^\/api\/v1\/journal\?limit=100$/);
  assert.match(asked[2], /cursor=next/);
  // A visitor (401) or a network that fails: no session, no throw.
  assert.equal(
    (await loadPlanSessions({ request: async () => ({ ok: false }) })).size,
    0,
  );
  assert.equal(
    (
      await loadPlanSessions({
        request: async () => {
          throw new Error("offline");
        },
      })
    ).size,
    0,
  );
});

// "Voir la session" on a past plan, nothing on a plan to come.
test("the dialog of a past plan says what its session gave and links to its page; a plan to come has neither", () => {
  const gave = {
    planId: "srv-col",
    sessionId: "ses-col",
    state: "partial",
    acquiredSeconds: 11100,
    plannedSeconds: 14400,
  };
  assert.equal(planSessionHref("fr", gave), "/fr/sessions/ses-col");
  assert.equal(
    planSessionLine("fr", gave).replaceAll("\u00a0", " "),
    "Sa session : 3 h 05 sur 4 h",
  );
  assert.equal(
    planSessionLine("en", gave).replaceAll("\u00a0", " "),
    "Its session: 3 h 5 min of 4 h",
  );
  // No planned figure: only what was acquired.
  assert.equal(
    planSessionLine("fr", { ...gave, plannedSeconds: 0 }, 0).replaceAll(
      "\u00a0",
      " ",
    ),
    "Sa session : 3 h 05 acquises",
  );
  // A night not debriefed, without a session: the debriefing's own page.
  const waiting = { planId: "srv-col", sessionId: null, state: "to_debrief" };
  assert.equal(planSessionHref("fr", waiting), "/fr/sessions/debrief/srv-col");
  assert.equal(
    planSessionLine("fr", waiting),
    "Sa session attend son débriefing.",
  );
  assert.equal(planSessionHref("fr", null), null);
  assert.equal(planSessionLine("fr", null), null);

  const words = planSheetWords("fr", past, { now, clock: at, session: gave });
  assert.equal(words.state, "Exécuté");
  assert.equal(words.sessionHref, "/fr/sessions/ses-col");
  assert.equal(words.canEdit, false);
  const markup = renderToStaticMarkup(
    createElement(PlanSheetDialog, {
      locale: "fr",
      plan: past,
      clock: at,
      now,
      session: gave,
      actions: planActions(past, { hasSession: true }),
    }),
  );
  assert.match(
    markup.replace(/[\u00a0\u202f]/g, " "),
    /class="plan-sheet-session-line">Sa session : 3 h 05 sur 4 h</,
  );
  assert.match(
    markup,
    /<a class="btn-secondary" data-action="see-session" href="\/fr\/sessions\/ses-col">Voir la session<\/a>/,
  );
  // A plan to come: no line, no link, "Modifier le plan" stays.
  const later_ = renderToStaticMarkup(
    createElement(PlanSheetDialog, {
      locale: "fr",
      plan: later,
      clock: at,
      now,
      actions: planActions(later, { nightAhead: true }),
    }),
  );
  assert.doesNotMatch(
    later_,
    /plan-sheet-session-line|see-session|Voir la session/,
  );
  assert.match(later_, /data-action="edit"/);
  // The plan to debrief names its state in the dialog, whatever its stored one.
  const toDebrief = planSheetWords(
    "fr",
    { ...later, date: "2026-10-10" },
    { now, clock: at, session: waiting },
  );
  assert.equal(toDebrief.state, "À débriefer");
  assert.equal(toDebrief.sessionHref, "/fr/sessions/debrief/srv-col");
});

test("a pending plan whose night is over and has no session reads « Marquer comme faite » at the foot, in place of « Débriefer cette session », to the same debriefing; one with a session keeps the old word", () => {
  const old = plan("plan-old", "2026-10-10", "pending", "Nuit au col");
  const declared = { planId: "srv-old", sessionId: null, state: "to_debrief" };
  const markup = renderToStaticMarkup(
    createElement(PlanSheetDialog, {
      locale: "fr",
      plan: old,
      clock: at,
      now,
      session: declared,
      actions: planActions(old, {
        toDebrief: true,
        hasSession: true,
        declared: true,
      }),
    }),
  );
  const footer = markup.slice(markup.indexOf("<footer"));
  assert.match(
    footer,
    /<a class="btn-secondary is-debrief plan-sheet-action" data-action="mark-done" href="\/fr\/sessions\/debrief\/srv-old">Marquer comme faite<\/a>/,
  );
  assert.doesNotMatch(footer, /Débriefer cette session/);
  assert.doesNotMatch(footer, /data-action="edit"/);
  // One wording for one gesture: no "Marquer comme exécuté" beside it, the
  // other states keep it.
  assert.doesNotMatch(markup, /Marquer comme exécuté/);
  assert.match(markup, /Marquer comme abandonné/);
  const keptExecute = renderToStaticMarkup(
    createElement(PlanSheetDialog, {
      locale: "fr",
      plan: old,
      clock: at,
      now,
      session: { ...declared, sessionId: "ses-old" },
      actions: planActions(old, { toDebrief: true, hasSession: true }),
    }),
  );
  assert.match(keptExecute, /Marquer comme exécuté/);
  assert.deepEqual(
    planActionsOf(old, { toDebrief: true, hasSession: true, declared: true })
      .keep,
    ["abandon", "debrief"],
  );
  assert.deepEqual(
    planActionsOf(old, { toDebrief: true, hasSession: true }).keep,
    ["execute", "abandon", "debrief"],
  );
  // The card's ⋯ menu reads the same word as the dialog.
  assert.equal(planDebriefWordKey(true), "planSheetMarkDone");
  assert.equal(planDebriefWordKey(false), "journalDebriefSession");
  // A pending plan that ran with the application (a session exists) keeps it.
  const ran = renderToStaticMarkup(
    createElement(PlanSheetDialog, {
      locale: "fr",
      plan: old,
      clock: at,
      now,
      session: { ...declared, sessionId: "ses-old" },
      actions: planActions(old, { toDebrief: true, hasSession: true }),
    }),
  );
  assert.match(ran, /data-action="debrief"[^>]*>Débriefer cette session</);
  assert.doesNotMatch(ran, /Marquer comme faite/);
  // A plan still ahead has neither.
  const ahead = renderToStaticMarkup(
    createElement(PlanSheetDialog, {
      locale: "fr",
      plan: later,
      clock: at,
      now,
      actions: planActions(later, { nightAhead: true }),
    }),
  );
  assert.doesNotMatch(ahead, /Marquer comme faite/);
});

test("« Marquer comme faite » is written in every shipped language, and is not the word of « Débriefer »", () => {
  for (const locale of shippedLocales()) {
    const word = message(locale, "planSheetMarkDone");
    assert.ok(word && word !== "planSheetMarkDone", locale);
    assert.notEqual(word, message(locale, "journalDebriefSession"), locale);
  }
  assert.equal(message("fr", "planSheetMarkDone"), "Marquer comme faite");
});
