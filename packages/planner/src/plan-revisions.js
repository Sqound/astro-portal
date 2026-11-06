// The revision of a plan is the service's: it counts the writes of the plan
// that were accepted. A save carries the revision the copy was read at, and the
// service refuses to overwrite a plan whose revision has moved on (another
// device wrote it meanwhile).
//
// The web writes the plans of a space one save after another, a second one
// often before the page has had time to settle the first. A save that went out
// with the revision the page was READ at, rather than the one the service gave
// it back, was a stale write from the service's point of view: the web's own
// save set aside the web's own copy, and the page announced "modifié ailleurs"
// with two identical versions. These are the pure rules by which the page
// keeps what the service said; `PlannerPage.js` applies them.

/** The revision of each plan of a document the service served, by plan id. */
export function revisionsOf(document) {
  const revisions = new Map();
  for (const plan of Array.isArray(document?.plans) ? document.plans : []) {
    const revision = Number(plan?.revision);
    if (plan?.id && Number.isInteger(revision) && revision > 0)
      revisions.set(plan.id, revision);
  }
  return revisions;
}

/**
 * The document with the revision the service last gave for each of its plans,
 * wherever the copy holds an older one (or none): `known` is a Map
 * (plan id → revision). Another device's write is still a conflict: the
 * revision known here is the last one THIS page was told, so a plan the
 * service moved on meanwhile still differs from it. A plan the service has not
 * given a revision for is left as it is; the document itself when nothing
 * changes.
 */
export function rebaseOnRevisions(document, known) {
  if (!known?.size || !Array.isArray(document?.plans)) return document;
  let changed = false;
  const plans = document.plans.map((plan) => {
    const revision = known.get(plan?.id);
    if (!revision || Number(plan.revision || 0) >= revision) return plan;
    changed = true;
    return { ...plan, revision };
  });
  return changed ? { ...document, plans } : document;
}

// ——— A plan nobody touched is written as the service served it ———
//
// The screen's copy of a plan carries the web's own defaults (a minimum
// altitude, a view, a moon separation…) that a plan made by another client does not
// have. Written back, that copy is a change of the plan — one revision more,
// one version more — though its person has changed nothing. So the page
// keeps, for each plan, what the service served and what the screen made of
// it; a plan still equal to what the screen made of it goes out as it was
// served, and the service sees nothing to write.

/** A plan's content without its revision, as a string to compare. */
export function planContentKey(plan) {
  const { revision: _revision, ...content } = plan || {};
  return JSON.stringify(content);
}

/**
 * What the service served (`served`: a document) and what the screen made of
 * each plan (`shown`: the screen's plans), as the entries
 * `{ raw, shown }` by plan id that `servedFormOfUntouchedPlans` reads.
 */
export function servedPlanEntries(served, shown) {
  const entries = new Map();
  const raw = new Map(
    (Array.isArray(served?.plans) ? served.plans : []).map((plan) => [
      plan?.id,
      plan,
    ]),
  );
  for (const plan of Array.isArray(shown?.plans) ? shown.plans : [])
    if (plan?.id && raw.has(plan.id))
      entries.set(plan.id, {
        raw: raw.get(plan.id),
        shown: planContentKey(plan),
      });
  return entries;
}

// The states of a plan that is history: the service never rewrites one by a
// save that leaves it in the same state (`savePlannerState`), whatever else
// the copy carries.
const historyStatuses = new Set([
  "executed",
  "partial",
  "abandoned",
  "archived",
]);
const statusOf = (plan) =>
  historyStatuses.has(plan?.status) ? plan.status : "pending";

/**
 * Whether the screen's copy of a plan is, for the service, the plan it served:
 * untouched since it was served, or history (executed, partial, abandoned,
 * archived) left in the same state — the snapshot of a target or a default the
 * page added to an executed plan is not a change the service would take.
 */
function servedAsIs(plan, entry) {
  if (!entry) return false;
  if (planContentKey(plan) === entry.shown) return true;
  const status = statusOf(entry.raw);
  return status !== "pending" && statusOf(plan) === status;
}

/** The document, each plan nobody touched replaced by the form it was served in. */
export function servedFormOfUntouchedPlans(document, entries) {
  if (!entries?.size || !Array.isArray(document?.plans)) return document;
  let changed = false;
  const plans = document.plans.map((plan) => {
    const entry = entries.get(plan?.id);
    if (!servedAsIs(plan, entry)) return plan;
    changed = true;
    // A plan another client wrote is served without the night the document
    // keeps it in: it goes out in the night the screen put it in, the
    // document naming no night it does not hold.
    return entry.raw?.nightId || !plan.nightId
      ? entry.raw
      : { ...entry.raw, nightId: plan.nightId };
  });
  return changed ? { ...document, plans } : document;
}

/**
 * What a save of `document` would change at the service, as a string to
 * compare: the document as it would go out (each plan the service would take
 * as served in its served form), without the revisions (the base of a write,
 * not its content) nor the sync stamp. Two copies of the space that only
 * differ by what the page made of the served plans give the same key, so the
 * page writes nothing — it used to rewrite them at every reading of the space.
 */
export function spaceContentKey(document, entries) {
  const out = servedFormOfUntouchedPlans(document, entries);
  const { sync: _sync, ...content } = out || {};
  return JSON.stringify({
    ...content,
    plans: Array.isArray(out?.plans)
      ? out.plans.map((plan) => {
          const { revision: _revision, ...rest } = plan || {};
          return rest;
        })
      : out?.plans,
  });
}
