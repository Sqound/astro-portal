// The plans made in a browser without a space, when the person signs in to a
// space from that browser:
//
//  1. an empty space takes the browser's plans, places included, without
//     asking; 2. a space that already holds something is asked; 3. the plans
//     beyond what the profile allows stay in the browser, visible, marked "non
//     synchronisé"; 4. what is taken leaves the browser; 5. nothing is lost:
//     a plan is never in the browser and in the space at once, and a cut in
//     the middle resumes without a duplicate.
//
// This module holds the rules and the shapes, with no storage and no network
// (`browser-plans-sync.js` does the taking, `PlannerPage.js` the screen).
//
// Two stores, never mixed. The BROWSER's own store is the key the planner has
// always used (`astro-portal:planner:v1`): the plans of a person who has no
// space here. The SPACE's copy (`astro-portal:planner:space:v1`) is what the
// planner keeps of a space for the observing site with no reception: the
// space's own plans, the address it belongs to, whether it holds edits the
// space has not received, and the answer the person gave to the question.
import { planStatus } from "./planner.js";
import { pendingPlanSlots, planCreationGate } from "./capability-gates.js";
import { selectPlannerPlan } from "portal/planner/state.js";

export const spaceReplicaStorageKey = "astro-portal:planner:space:v1";

// ——— Plans held in the browser, on the screen of a signed-in person ———

/**
 * A plan that stays in the browser while the person is signed in carries this
 * mark in memory: `"limit"` (the profile allows no more synchronized plans),
 * `"waiting"` (the space could not take it yet). The mark is never written
 * anywhere: the browser's store, the space's copy and the service all get the
 * plan without it.
 */
export const BROWSER_PLAN_MARK = "notSynced";

export const isBrowserPlan = (plan) => Boolean(plan && plan[BROWSER_PLAN_MARK]);

export const markBrowserPlan = (plan, reason) => ({
  ...plan,
  [BROWSER_PLAN_MARK]: reason,
});

export function unmarkedPlan(plan) {
  const { [BROWSER_PLAN_MARK]: _mark, ...rest } = plan || {};
  return rest;
}

export const spacePlansOf = (plans) =>
  (plans || []).filter((plan) => !isBrowserPlan(plan));

export const browserPlansOf = (plans) =>
  (plans || []).filter((plan) => isBrowserPlan(plan));

/** The most recent first: the later night, then the plan made last. */
export function mostRecentFirst(plans) {
  return (plans || [])
    .map((plan, index) => ({ plan, index }))
    .sort(
      (left, right) =>
        String(right.plan.date || "").localeCompare(
          String(left.plan.date || ""),
        ) || right.index - left.index,
    )
    .map(({ plan }) => plan);
}

// ——— What goes, what stays ———

/**
 * The plans of the browser sorted for a space that holds `spacePlans`:
 *
 *  - `already`: the plan is in the space (same id): it was taken before a cut,
 *    or it is the copy of that space this browser used to keep. It leaves the
 *    browser and is never sent again;
 *  - `carry`: goes to the space: every plan that is not pending (history takes
 *    no place), and the most recent pending ones while the profile has room;
 *  - `beyond`: stays in the browser, marked.
 */
export function planBrowserCarry({ browserPlans, spacePlans, capabilities }) {
  const inSpace = new Set((spacePlans || []).map((plan) => plan.id));
  const already = browserPlans.filter((plan) => inSpace.has(plan.id));
  const candidates = browserPlans.filter((plan) => !inSpace.has(plan.id));
  const slots = pendingPlanSlots({ capabilities, plans: spacePlans });
  const fitting = new Set();
  // The browser's plans that were run go to the space as they are and take
  // their night ("un plan par nuit"), without filling the guard.
  const accepted = [
    ...(spacePlans || []),
    ...candidates.filter((plan) => planStatus(plan) !== "pending"),
  ];
  for (const plan of mostRecentFirst(
    candidates.filter((plan) => planStatus(plan) === "pending"),
  )) {
    if (
      !planCreationGate({
        capabilities,
        plans: accepted,
        date: plan.date,
        signedIn: true,
      }).allowed
    )
      continue;
    fitting.add(plan.id);
    accepted.push(plan);
  }
  const carry = candidates.filter(
    (plan) => planStatus(plan) !== "pending" || fitting.has(plan.id),
  );
  const carried = new Set(carry.map((plan) => plan.id));
  const beyond = candidates.filter((plan) => !carried.has(plan.id));
  return { already, candidates, carry, beyond, slots };
}

/**
 * The document sent to the space for `plans`: their nights, and the places and
 * horizons the browser knows (they go with the plans). `PUT /api/plans` in
 * `import` mode only fills what the space lacks, never deletes or replaces.
 * `activeHorizonProfileId` is only given when the space has none of its own.
 */
export function buildCarryDocument({
  browser,
  plans,
  activeHorizonProfileId = null,
}) {
  const carried = plans.map((plan) => {
    // A plan new to the space has no revision of its own yet.
    const { revision: _revision, ...rest } = unmarkedPlan(plan);
    return rest;
  });
  const nightIds = new Set(carried.map((plan) => plan.nightId));
  const active = mostRecentFirst(carried)[0];
  return {
    schemaVersion: 2,
    date: active.date,
    plans: carried,
    nights: (browser.nights || []).filter((night) => nightIds.has(night.id)),
    activeNightId: active.nightId,
    activePlanId: active.id,
    knownLocations: browser.knownLocations || [],
    horizonProfiles: browser.horizonProfiles || [],
    activeHorizonProfileId,
    unassignedHorizonProfiles: browser.unassignedHorizonProfiles || [],
  };
}

/**
 * What the browser keeps once the plans `ids` have left: the rest, or nothing
 * (`null`) when no plan is left — the places and horizons went with the plans.
 */
export function browserDocumentWithout(browser, ids) {
  const leaving = new Set(ids);
  const plans = (browser?.plans || []).filter((plan) => !leaving.has(plan.id));
  if (!plans.length) return null;
  const used = new Set(plans.map((plan) => plan.nightId));
  return {
    ...browser,
    plans,
    nights: (browser.nights || []).filter((night) => used.has(night.id)),
  };
}

// ——— The document on the screen, and its two halves ———

/**
 * The document of the screen has two halves: what belongs to the space, and
 * the plans marked as held in the browser. `space` is what the space's copy and
 * the service get, `browser` (or `null`) what goes back to the browser's store.
 * The space never learns of a night only browser plans use, and never points
 * at a plan or a night it does not hold.
 */
export function splitPlannerDocument(document) {
  const held = browserPlansOf(document?.plans);
  if (!held.length) return { space: document, browser: null };
  const plans = spacePlansOf(document.plans);
  const nights = document.nights || [];
  const spaceNightIds = new Set(plans.map((plan) => plan.nightId));
  const browserNightIds = new Set(held.map((plan) => plan.nightId));
  const spaceNights = nights.filter(
    (night) => spaceNightIds.has(night.id) || !browserNightIds.has(night.id),
  );
  let space = { ...document, plans, nights: spaceNights };
  const selectionIsTheSpaces =
    plans.some((plan) => plan.id === document.activePlanId) ||
    (!document.activePlanId &&
      spaceNights.some((night) => night.id === document.activeNightId));
  if (!selectionIsTheSpaces) {
    const chosen =
      mostRecentFirst(
        plans.filter((plan) => planStatus(plan) === "pending"),
      )[0] ||
      mostRecentFirst(plans)[0] ||
      null;
    space = selectPlannerPlan(
      {
        ...space,
        activePlanId: chosen?.id ?? null,
        activeNightId: chosen?.nightId ?? spaceNights[0]?.id ?? null,
      },
      chosen?.id ?? null,
    );
  }
  return {
    space,
    browser: {
      plans: held.map(unmarkedPlan),
      nights: nights.filter((night) => browserNightIds.has(night.id)),
    },
  };
}

/**
 * The screen's document: the space's, and the browser's plans (`held`: its
 * `plans` and `nights`) marked. `reasonFor` is a mark, or a function of the
 * plan that gives it.
 */
export function mergeBrowserPlans(space, held, reasonFor) {
  if (!held?.plans?.length) return space;
  const reason = typeof reasonFor === "function" ? reasonFor : () => reasonFor;
  const known = new Set((space.nights || []).map((night) => night.id));
  return {
    ...space,
    plans: [
      ...spacePlansOf(space.plans),
      ...held.plans.map((plan) => markBrowserPlan(plan, reason(plan))),
    ],
    nights: [
      ...(space.nights || []),
      ...(held.nights || []).filter((night) => !known.has(night.id)),
    ],
  };
}

/**
 * What the browser's store holds after an edit made on the screen of a
 * signed-in person: the browser's own document (its places and horizons stay)
 * with the plans as edited, or `null` once none is left.
 */
export function browserDocumentAfterEdit(held, { plans, nights }) {
  if (!plans.length) return null;
  return { ...(held || {}), plans, nights };
}

// ——— The space's copy ———

/** What was read from a storage, or `null` (nothing, or unreadable). */
export function readSpaceReplica(storage) {
  try {
    const record = JSON.parse(storage.getItem(spaceReplicaStorageKey));
    return record?.version === 1 &&
      typeof record.email === "string" &&
      record.document &&
      typeof record.document === "object"
      ? record
      : null;
  } catch {
    return null;
  }
}

/**
 * `held`: which plans of the browser were on the screen beside the space's,
 * and why (`{ [planId]: "limit" | "waiting" }`), so that they are there again
 * when the observing site has no reception and the space cannot be asked.
 */
export function writeSpaceReplica(
  storage,
  { email, document, dirty = false, answer = null, held = null },
) {
  storage.setItem(
    spaceReplicaStorageKey,
    JSON.stringify({ version: 1, email, document, dirty, answer, held }),
  );
}

export const clearSpaceReplica = (storage) =>
  storage.removeItem(spaceReplicaStorageKey);

/** The same address: the space of an address is the same whatever its case. */
export const sameSpace = (left, right) =>
  typeof left === "string" &&
  typeof right === "string" &&
  left.trim().toLowerCase() === right.trim().toLowerCase();
