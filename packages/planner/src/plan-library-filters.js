// The filters and the actions of the plans of the web library:
// one rule for both.
//
// A main filter of two values, "À exécuter" / "Exécutés" (the list only:
// the calendar has none), and a "Filtres" button (the year — "Toutes" by
// default — and the statuses, several at once, each the badge of its status).
// **Preselection**: everything is ticked but "Abandonné" and
// "Archivé"; "Tous" ticks really everything; "Réinitialiser" comes back
// to the preselection. Executed and partial plans, debriefed or not, are
// "Exécutés"; planned ones "À exécuter". Pure: plans and a few words in,
// answers out.
import { planLibraryStatus, planStatus } from "./planner.js";

export const PLAN_MAIN_FILTERS = Object.freeze(["to_execute", "executed"]);

/** The main filter a stored status falls under; `null` for an archived plan. */
export function planMainFilterOf(status) {
  if (status === "archived") return null;
  return status === "executed" || status === "partial" || status === "abandoned"
    ? "executed"
    : "to_execute";
}

/** Whether a plan of this stored status is left out by the preselection. */
export const planHiddenByDefault = (status) =>
  status === "abandoned" || status === "archived";

/** The statuses the filters sheet offers under a main filter, in order. */
export const planFilterStatusChoices = (main) =>
  main === "executed"
    ? ["toDebrief", "executed", "partial", "abandoned", "archived"]
    : main === "to_execute"
      ? ["planned", "toDebrief", "archived"]
      : // The calendar has no main filter: the six statuses.
        [
          "planned",
          "toDebrief",
          "executed",
          "partial",
          "abandoned",
          "archived",
        ];

/** What is ticked when nothing was chosen: all but "Abandonné" and "Archivé". */
export const planStatusPreselection = (main) =>
  planFilterStatusChoices(main).filter(
    (status) => status !== "abandoned" && status !== "archived",
  );

const sameSet = (left, right) =>
  left.length === right.length && left.every((entry) => right.includes(entry));

/** The statuses ticked under a main filter (`null`: the calendar). */
export const planStatusesTicked = (filters, main) =>
  filters.statuses ?? planStatusPreselection(main);

/** `preselection`, `all` or `custom`: how the statuses stand against their choices. */
export function planStatusSelection(filters, main) {
  const ticked = planStatusesTicked(filters, main);
  if (sameSet(ticked, planStatusPreselection(main))) return "preselection";
  return sameSet(ticked, planFilterStatusChoices(main)) ? "all" : "custom";
}

/** The filters with these statuses; the preselection is kept as "nothing chosen" (`null`). */
export const planFiltersWithStatuses = (filters, statuses, main) => ({
  ...filters,
  statuses:
    statuses === null || sameSet(statuses, planStatusPreselection(main))
      ? null
      : statuses,
});

/** The states an archived plan can have had (`archivedFrom`). */
const archivedFromStates = ["executed", "partial", "abandoned"];

/**
 * The tags a plan wears: "Exécuté" then "À débriefer" for an executed
 * plan whose session waits for its debriefing; "Abandonné" (or "Exécuté",
 * "En partie") then "Archivé" for a plan archived from that state
 * (`plan.archivedFrom`, the service's, or the browser's until it answers);
 * one tag otherwise.
 */
export function planStatusTags(plan, { toDebrief = false } = {}) {
  const status = planLibraryStatus(plan, { toDebrief });
  if (status === "archived")
    return archivedFromStates.includes(plan?.archivedFrom)
      ? [plan.archivedFrom, "archived"]
      : ["archived"];
  if (status !== "toDebrief") return [status];
  const stored = planStatus(plan);
  return stored === "executed" || stored === "partial"
    ? [stored, "toDebrief"]
    : ["toDebrief"];
}

/** The filters chosen in the sheet: `{ year: "2026" | null, statuses: [...] | null }` (`null`: the preselection). */
export const noPlanFilters = Object.freeze({ year: null, statuses: null });

/**
 * How many filters differ from the default (the count on "Filtres"): one per
 * badge — the year, then "Statut · Tous" when everything is ticked, or one
 * per status ticked when the selection is neither the preselection nor all.
 * `main` `null` is the calendar, which has no year badge of its own to show
 * apart from the library's.
 */
export function planFiltersCount(filters, main = "to_execute") {
  const selection = planStatusSelection(filters, main);
  return (
    (filters.year ? 1 : 0) +
    (selection === "preselection"
      ? 0
      : selection === "all"
        ? 1
        : planStatusesTicked(filters, main).length)
  );
}

/**
 * Whether a plan is listed under a main filter and filters: the plans of the
 * main filter that wear one of the statuses ticked, and every archived plan
 * when "Archivé" is ticked. `main` `null`: the calendar — every plan of the
 * year, whatever its main filter, that wears a status ticked.
 */
export function planPassesFilters(plan, { toDebrief, main, filters }) {
  if (filters.year && !String(plan?.date ?? "").startsWith(filters.year))
    return false;
  const ticked = planStatusesTicked(filters, main);
  const stored = planStatus(plan);
  const own = planMainFilterOf(stored);
  if (own === null) return ticked.includes("archived");
  if (main !== null && own !== main) return false;
  return planStatusTags(plan, { toDebrief }).some((tag) =>
    ticked.includes(tag),
  );
}

/** The main filter a list of statuses points at when the address names none. */
export function mainFilterForStatuses(statuses) {
  const own = statuses.filter((status) => status !== "archived");
  return own.length &&
    own.every((status) => ["executed", "partial", "abandoned"].includes(status))
    ? "executed"
    : "to_execute";
}

// ——— The address (`?main=executed&year=2026&status=abandoned,archived`) ———

export function planFiltersFromAddress(search, knownStatuses) {
  const params = new URLSearchParams(search);
  const named = params.has("status");
  const statuses = (params.get("status") ?? "")
    .split(",")
    .map((word) => word.replace(/-([a-z])/g, (_, c) => c.toUpperCase()))
    .filter((word) => knownStatuses.includes(word));
  const year = /^\d{4}$/.test(params.get("year") ?? "")
    ? params.get("year")
    : null;
  const main = PLAN_MAIN_FILTERS.includes(params.get("main"))
    ? params.get("main")
    : mainFilterForStatuses(statuses);
  return {
    main,
    filters: planFiltersWithStatuses(
      { year, statuses: null },
      named ? [...new Set(statuses)] : null,
      main,
    ),
  };
}

export function planFiltersToAddress({ main, filters }) {
  const params = new URLSearchParams();
  if (main === "executed") params.set("main", "executed");
  if (filters.year) params.set("year", filters.year);
  if (filters.statuses)
    params.set(
      "status",
      filters.statuses
        .map((status) => status.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`))
        .join(","),
    );
  return params;
}

// ——— The actions of a card (the ⋯ menu) ———

/**
 * The message key of the "debrief" action: "Marquer comme faite" for a night
 * done without the application and declared afterwards, "Débriefer cette
 * session" for a night run in the application. The plan's dialog and the
 * card's ⋯ menu read the same key.
 */
export const planDebriefWordKey = (declared = false) =>
  declared ? "planSheetMarkDone" : "journalDebriefSession";

/**
 * The actions a plan offers, in the order of the menu: the ones that keep
 * first, then — after a separator — the ones that remove. A plan is edited while it is planned and
 * its debriefing is not waiting; marked executed or abandoned once its night
 * has begun; archived at any time but once archived; restored when
 * archived; deleted while it is still an intention (planned or abandoned) and
 * **never once executed**. `debrief` leads to the debriefing
 * of a night that waits for it; `session` to the session of a plan carried out.
 */
export function planActionsOf(
  plan,
  {
    toDebrief = false,
    nightAhead = false,
    hasSession = false,
    // The plan's night runs on another device. It is not edited, executed,
    // abandoned or archived from here while it runs; "Supprimer" stays on
    // the menu so that the refusal is read in words, not met as an error.
    running = false,
    // A night done without the application, declared afterwards (pending,
    // waiting for its debriefing, no session): "Marquer comme faite" is
    // its action, "Marquer comme exécuté" is not offered beside it.
    declared = false,
  } = {},
) {
  if (running && planStatus(plan) === "pending")
    return { keep: [], remove: ["delete"] };
  const stored = planStatus(plan);
  const pending = stored === "pending";
  const keep = [];
  if (pending && !toDebrief) keep.push("edit");
  if (pending && !nightAhead) {
    if (!declared) keep.push("execute");
    keep.push("abandon");
  }
  if (toDebrief) keep.push("debrief");
  if (hasSession && !toDebrief) keep.push("session");
  if (stored === "archived") keep.push("restore");
  const remove = [];
  if (stored !== "archived") remove.push("archive");
  if (pending || stored === "abandoned") remove.push("delete");
  return { keep, remove };
}
