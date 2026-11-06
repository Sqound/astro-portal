// "Tous les plans" with its multi-night plans: the nights of a multi-night plan stand in one
// group, never twice. Under "À exécuter" the group stands at the date of its
// next night, under "Exécutés" at its most recent one; a plan with nights of
// both kinds is in both lists, each time with the nights of that list only and
// a count for the others; the status filters sort the nights, not the plan, and
// a count says how many they leave out. Pure: no page, no clock.

/** The multi-night plan a night follows, `null` for a plan of one night. */
export function planProjectId(plan) {
  const item = (Array.isArray(plan?.items) ? plan.items : []).find(
    (entry) => typeof entry?.projectId === "string" && entry.projectId,
  );
  return item ? item.projectId : null;
}

/**
 * The entries of the list, the newest first as the library writes them:
 * `{ kind: "plan", plan }` or `{ kind: "group", projectId, nights,
 * otherList, hidden }`. `passes(plan, main)` says whether a plan passes the
 * filters under the main filter `main`; `mainOf(plan)` the main filter a
 * plan falls under (`null`: archived). A group stands at its next night
 * under "À exécuter" (the earliest of its nights shown), at its most
 * recent under "Exécutés".
 */
export function planLibraryEntries({ plans, main, passes, mainOf }) {
  const other = main === "executed" ? "to_execute" : "executed";
  const entries = [];
  const byProject = new Map();
  for (const plan of plans) {
    const projectId = planProjectId(plan);
    if (projectId) {
      if (!byProject.has(projectId)) byProject.set(projectId, []);
      byProject.get(projectId).push(plan);
    } else if (passes(plan, main))
      entries.push({ kind: "plan", plan, date: plan.date });
  }
  for (const [projectId, all] of byProject) {
    const nights = all
      .filter((plan) => passes(plan, main))
      .sort((left, right) => right.date.localeCompare(left.date));
    if (!nights.length) continue;
    const ofThisList = all.filter((plan) => mainOf(plan) === main).length;
    entries.push({
      kind: "group",
      projectId,
      nights,
      otherList: all.filter((plan) => passes(plan, other)).length,
      hidden: Math.max(0, ofThisList - nights.length),
      date: main === "executed" ? nights[0].date : nights.at(-1).date,
    });
  }
  return entries
    .sort((left, right) => right.date.localeCompare(left.date))
    .map(({ date, ...entry }) => entry);
}
