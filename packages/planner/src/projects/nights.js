// Attaching existing nights to a multi-night plan, pure parts: which line of
// the list is which night, what a tick sends, what the summary counts, and the
// search of a multi-night plan by its target's names or its own. The service's
// lines (`night` of `project.schema.json`) are never reshaped.

/** The id a line goes by: its night of the journal, else its plan of one night. */
export const nightKey = (line) => line?.sessionId ?? line?.planId ?? null;

/** A candidate already in another multi-night plan is shown, never ticked. */
export const nightTickable = (line) => !line?.projectId;

/** Every tickable candidate ticked in advance. */
export const initialTicks = (lines) =>
  new Set((lines || []).filter(nightTickable).map(nightKey));

/** The body of an attachment: a night by its `sessionId`, else its plan by `planId`. */
export function nightsBody(lines) {
  const sessionIds = [];
  const planIds = [];
  for (const line of lines || []) {
    if (line.sessionId) sessionIds.push(line.sessionId);
    else if (line.planId) planIds.push(line.planId);
  }
  return {
    ...(sessionIds.length ? { sessionIds } : {}),
    ...(planIds.length ? { planIds } : {}),
  };
}

/** The lines of `lines` whose key is in `ticked`, in the list's order. */
export const tickedLines = (lines, ticked) =>
  (lines || []).filter(
    (line) => nightTickable(line) && ticked.has(nightKey(line)),
  );

/** `{ ticked, total, seconds }`: how many tickable lines are ticked, the Astro Sync seconds. */
export function nightsSummary(lines, ticked) {
  const tickable = (lines || []).filter(nightTickable);
  const chosen = tickable.filter((line) => ticked.has(nightKey(line)));
  return {
    ticked: chosen.length,
    total: tickable.length,
    seconds: chosen.reduce(
      (sum, line) => sum + (Number(line.integrationSeconds) || 0),
      0,
    ),
  };
}

/** What a night is detached by: its id (`DELETE …/nights/{nightId}`). */
export const detachId = nightKey;

/** Lowercase, without accents or spaces' variety: what a search compares. */
export const searchText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[  ]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * Whether the search `query` finds the multi-night plan `project`: in its
 * target's designation, its common name or its own name.
 * An empty query finds nothing.
 */
export function projectMatches(project, query) {
  const wanted = searchText(query);
  if (!wanted) return false;
  return [project?.name, project?.target?.name, project?.target?.commonName]
    .map(searchText)
    .some((value) => value.includes(wanted));
}

/** The name a multi-night plan is shown under: its target's designation. */
export const projectLabel = (project) =>
  project?.target?.name || project?.name || "";

/**
 * The extra lines of "Nuits du plan": the nights of the service that carry
 * their link themselves (`link: "night"`) and are not among the plan's
 * nights the planner already draws from its plans' items. A night attached
 * through its plan item (`link: "plan"`) is the planner's plan; the service
 * and the planner both name it, once.
 */
export const ownLinkNights = (nights) =>
  (nights || []).filter((line) => line?.link === "night");

/**
 * The page of a multi-night plan in two parts: "À venir" (the promise) and
 * "Sessions faites" (each opens its session's page). `serviceNights` are the
 * service's (`nights[].state`: `upcoming`, `to_debrief`, `done`),
 * `plannerNights` the planner's own nights of the plan (`state`: `planned`,
 * `undebriefed`, `done`, `partial`, `lost`), met by the date of the night.
 *
 * Returns `{ upcoming, done }`, each a list of rows in date order:
 *   `{ kind: "plan", planner }`            a plan of the planner not run yet;
 *   `{ kind: "service", night }`           an upcoming night the planner does not hold;
 *   `{ kind: "session", night, planner }`  a night run (done or to debrief);
 *   `{ kind: "planner", planner }`         a night only the planner knows, already past.
 * A session attached afterwards (no plan item) is a `session` row like the others.
 */
export function splitProjectNights({ plannerNights, serviceNights }) {
  const planner = (plannerNights || []).filter((night) => night?.date);
  const service = (serviceNights || []).filter(Boolean);
  const plannerByDate = new Map(planner.map((night) => [night.date, night]));
  const serviceDates = new Set(service.map((night) => night.eveningDate));
  const byDate = (left, right) =>
    String(left.date ?? "").localeCompare(String(right.date ?? ""));
  const upcoming = [];
  const done = [];
  for (const night of service) {
    const met = plannerByDate.get(night.eveningDate) ?? null;
    if (night.state === "upcoming") {
      upcoming.push(
        met && met.state === "planned"
          ? { kind: "plan", date: night.eveningDate, planner: met }
          : { kind: "service", date: night.eveningDate, night },
      );
    } else
      done.push({
        kind: "session",
        date: night.eveningDate,
        night,
        planner: met,
      });
  }
  // What only the planner knows: a plan not in the service yet, or a night the
  // service does not list.
  for (const night of planner) {
    if (serviceDates.has(night.date)) continue;
    if (night.state === "planned")
      upcoming.push({ kind: "plan", date: night.date, planner: night });
    else done.push({ kind: "planner", date: night.date, planner: night });
  }
  return { upcoming: upcoming.sort(byDate), done: done.sort(byDate) };
}

/** The page "Voir la session" opens for a night run: its session, else its plan's debriefing. */
export function nightSessionHref(locale, night) {
  if (night?.sessionId)
    return `/${locale}/sessions/${encodeURIComponent(night.sessionId)}`;
  if (night?.planId)
    return `/${locale}/sessions/debrief/${encodeURIComponent(night.planId)}`;
  return null;
}
