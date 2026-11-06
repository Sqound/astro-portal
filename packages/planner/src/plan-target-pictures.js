// The pictures of a plan's targets, for the rows of the plan's dialog: the same
// thumbnail as the target's card in the catalogue (`GET /api/target-library`,
// read by the targets' ids), the pictogram of its type where the catalogue has
// no picture. A plan keeps a compact snapshot of each target (`frozenPlanTarget`)
// without any image address, and a plan written on the phone may keep only the
// target's id: the rows showed the pictogram of every target (PORTAL-SYNC-LOOP-01).

/** The catalogue ids of a plan's targets, in order, each once. */
export function planTargetIds(plan) {
  const ids = [];
  for (const item of Array.isArray(plan?.items) ? plan.items : []) {
    const id = item?.target?.id ?? item?.id;
    if (typeof id === "string" && id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * The ids of the targets the cards of several plans draw: the first `perPlan`
 * of each plan, each once, so one request serves the whole list.
 */
export function plansTargetIds(plans, perPlan = Infinity) {
  const ids = [];
  for (const plan of Array.isArray(plans) ? plans : [])
    for (const id of planTargetIds({
      items: (Array.isArray(plan?.items) ? plan.items : []).slice(0, perPlan),
    }))
      if (!ids.includes(id)) ids.push(id);
  return ids;
}

/**
 * The catalogue's rows of `ids`, `Map<id, row>`. Nothing is thrown: a network
 * that fails, or an id the catalogue does not hold, leaves the pictogram.
 */
export async function loadPlanTargetPictures({
  locale,
  ids,
  request = (url, init) => fetch(url, init),
  signal,
}) {
  const rows = new Map();
  if (!ids?.length) return rows;
  try {
    const parameters = new URLSearchParams({
      locale,
      targetIds: ids.join(","),
      limit: String(ids.length),
    });
    const response = await request(`/api/target-library?${parameters}`, {
      signal,
    });
    if (!response.ok) return rows;
    const body = await response.json();
    for (const row of body?.targets ?? [])
      if (row?.id && ids.includes(row.id)) rows.set(row.id, row);
  } catch {
    // The pictogram stays.
  }
  return rows;
}

/**
 * The target a row draws: the plan's own snapshot, with the catalogue's row as
 * the knowledge its picture is read from (`targetImageVariant`) — never in
 * place of what the plan says of the target. A row with no snapshot (a target
 * the phone keeps by its id) draws the catalogue's row.
 */
export function targetWithPicture(target, row) {
  if (!row) return target;
  if (!target) return row;
  if (target.knowledge || target.featured?.imageUrl) return target;
  return { ...target, knowledge: row };
}
