// The main filter of the list of plans, « À exécuter » / « Exécutés »: one rule for the
// service, the web and the phone. Pure: a plan resource in, a name out.

/** The values of the main filter, and `archived` for what neither holds. */
export const PLAN_MAIN_FILTERS = Object.freeze([
  "to_execute",
  "executed",
  "archived",
]);

/**
 * The values `GET /v1/plans?filter=` takes: the main filter plus `abandoned`,
 * which lists the plans the default view of « Exécutés » leaves out, the way `archived` lists the archived ones.
 */
export const PLAN_LIST_FILTERS = Object.freeze([
  ...PLAN_MAIN_FILTERS,
  "abandoned",
]);

/**
 * The state a plan reads on every surface: the resource `status` when the
 * service froze the plan (a debriefing, the web planner, an archive), else
 * the closure a device recorded (`payload.closedAs`, api/v1.md, « A finished
 * night is carried by the plan »), else `active`.
 */
export function planEffectiveState(resource) {
  const status = resource?.status ?? "active";
  if (status !== "active") return status;
  const closedAs = resource?.payload?.closedAs;
  return ["executed", "partial", "abandoned", "archived"].includes(closedAs)
    ? closedAs
    : "active";
}

/**
 * The filter a plan falls under:
 *
 * - `executed`: executed and partial plans, **debriefed or not** (a plan
 *   executed that waits for its debriefing is here, not in `to_execute`), and
 *   abandoned plans (a night given up is
 *   « Exécuté » in the filter's sense, it is over); an abandoned plan is
 *   **not shown by default**, see `planShownByDefault`;
 * - `to_execute`: planned (active) plans, the plans no night has carried out;
 * - `archived`: archived plans, which no main filter lists; they appear only
 *   through « Statut · Archivé ».
 */
export function planMainFilterOf(resource) {
  const state = planEffectiveState(resource);
  if (state === "archived") return "archived";
  return state === "executed" || state === "partial" || state === "abandoned"
    ? "executed"
    : "to_execute";
}

/**
 * Whether the default view of the main filter shows the plan: an abandoned
 * plan and an archived plan are shown only when asked for, through
 * « Statut · Abandonné » and « Statut · Archivé » (service:
 * `?filter=abandoned` and `?filter=archived`).
 */
export function planShownByDefault(resource) {
  const state = planEffectiveState(resource);
  return state !== "abandoned" && state !== "archived";
}

/**
 * The plans `GET /v1/plans?filter=<value>` answers. `to_execute` and
 * `executed` are the default views of the two main values (abandoned and
 * archived plans left out); `abandoned` and `archived` list those plans.
 */
export function planMatchesListFilter(resource, filter) {
  const state = planEffectiveState(resource);
  if (filter === "abandoned") return state === "abandoned";
  if (filter === "archived") return state === "archived";
  return planShownByDefault(resource) && planMainFilterOf(resource) === filter;
}
