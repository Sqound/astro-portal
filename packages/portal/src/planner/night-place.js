// The rule « une nuit = un lieu ».
//
// For a given night every plan has the same place. A plan counts when it is
// still to plan (pending, its night not closed by a device) and is not the one
// running on this device; a plan that ran, was abandoned or put away keeps the
// place it was observed at and takes no part. « The same night » is the same
// date (the service's projection has no night identifier).
//
// The service's `409 plan_night_place_conflict` refusal is the same rule.
import {
  nightIdFor,
  normalizePlace,
  placeFingerprint,
  selectPlannerPlan,
} from "./state.js";

// What a device records on a plan it ran or put away (`payload.closedAs`).
const closedAsStatuses = ["executed", "partial", "abandoned", "archived"];

export function planCountsForNightPlace(plan, { runningPlanId = null } = {}) {
  if ((plan.status ?? "pending") !== "pending") return false;
  if (closedAsStatuses.includes(plan.closedAs)) return false;
  return !runningPlanId || plan.id !== runningPlanId;
}

const hasPlace = (place) => placeFingerprint(place) !== "null";

// The night of `date` at `place`: the one already there (a night minted with
// a random id keeps it), else the stable id both apps derive from the two.
function nightIdAt(state, date, place) {
  const key = placeFingerprint(place);
  const existing = (state.nights || []).find(
    (night) => night.date === date && placeFingerprint(night.location) === key,
  );
  return existing?.id ?? nightIdFor(date, place);
}

function nightsById(state) {
  return new Map((state.nights || []).map((night) => [night.id, night]));
}

const placeOfPlan = (plan, nights) =>
  nights.get(plan.nightId)?.location ?? plan.location ?? null;
const dateOfPlan = (plan, nights) =>
  nights.get(plan.nightId)?.date ?? plan.date ?? null;

/**
 * The conflict of `state`'s active night, or `null`: the active night (its
 * date, its place) when pending plans of the same date are at another place.
 * `{ date, chosenPlace, plansPlace, otherPlanIds, tabPlanIds }`: the plans at
 * `plansPlace` are named by the band; `tabPlanIds` are every plan of the date
 * that counts, in document order (the closed tabs).
 */
export function nightPlaceConflict(state, { runningPlanId = null } = {}) {
  const nights = nightsById(state);
  const active = nights.get(state.activeNightId);
  if (!active || !hasPlace(active.location)) return null;
  const chosenKey = placeFingerprint(active.location);
  const counting = (state.plans || []).filter(
    (plan) =>
      planCountsForNightPlace(plan, { runningPlanId }) &&
      dateOfPlan(plan, nights) === active.date,
  );
  const others = counting.filter((plan) => {
    const place = placeOfPlan(plan, nights);
    return hasPlace(place) && placeFingerprint(place) !== chosenKey;
  });
  if (!others.length) return null;
  const plansPlace = placeOfPlan(others[0], nights);
  const plansKey = placeFingerprint(plansPlace);
  return {
    date: active.date,
    chosenPlace: active.location,
    plansPlace,
    otherPlanIds: others
      .filter(
        (plan) => placeFingerprint(placeOfPlan(plan, nights)) === plansKey,
      )
      .map((plan) => plan.id),
    tabPlanIds: counting.map((plan) => plan.id),
  };
}

/** The ids of the plans `unifyNightPlace` would move to `place`. */
export function plansMovedToPlace(state, place, { runningPlanId = null } = {}) {
  const target = normalizePlace(place);
  if (!target) return [];
  const nights = nightsById(state);
  const date = nights.get(state.activeNightId)?.date;
  const targetKey = placeFingerprint(target);
  return (state.plans || [])
    .filter(
      (plan) =>
        planCountsForNightPlace(plan, { runningPlanId }) &&
        dateOfPlan(plan, nights) === date &&
        placeFingerprint(placeOfPlan(plan, nights)) !== targetKey,
    )
    .map((plan) => plan.id);
}

/**
 * `state` with every plan still to plan of the active date moved to `place`
 * (« Utiliser … », « Revenir à … »): the night of that date and place (minted
 * with the stable id both apps derive, or the one already there) becomes the
 * active night, the plans keep their content and their targets are flagged for
 * review when the place moved under them. Nights of the date left without a
 * plan are dropped; a night that holds plans that ran stays.
 */
export function unifyNightPlace(state, place, { runningPlanId = null } = {}) {
  const target = normalizePlace(place);
  if (!target) throw new Error("Valid place coordinates are required.");
  delete target.kind;
  const nights = nightsById(state);
  const date = nights.get(state.activeNightId)?.date ?? state.date;
  const nightId = nightIdAt(state, date, target);
  const moving = new Set(plansMovedToPlace(state, target, { runningPlanId }));
  const plans = (state.plans || []).map((plan) =>
    moving.has(plan.id)
      ? {
          ...plan,
          nightId,
          location: structuredClone(target),
          locationReview: Boolean(plan.locationReview || plan.items?.length),
        }
      : plan,
  );
  const inhabited = new Set(plans.map((plan) => plan.nightId));
  const kept = [];
  for (const night of state.nights || []) {
    if (night.id === nightId)
      kept.push({ ...night, location: structuredClone(target) });
    else if (night.date !== date || inhabited.has(night.id)) kept.push(night);
  }
  if (!kept.some((night) => night.id === nightId))
    kept.push({ id: nightId, date, location: structuredClone(target) });
  const own = plans.filter((plan) => plan.nightId === nightId);
  const selected = own.some((plan) => plan.id === state.activePlanId)
    ? state.activePlanId
    : (own[0]?.id ?? null);
  return selectPlannerPlan(
    {
      ...state,
      activeNightId: nightId,
      date,
      location: structuredClone(target),
      nights: kept,
      plans,
    },
    selected,
  );
}

/**
 * `state` on `date` at `place` when that date has plans still to plan at
 * another place: the planner opens the night of the chosen place — empty, in
 * memory only, no plan is made — and `nightPlaceConflict` then says what the
 * date holds. `null` when the date holds no such plan (the usual way to choose
 * a date applies) or `place` is not usable.
 */
export function chooseDateAtPlace(
  state,
  date,
  place,
  { runningPlanId = null } = {},
) {
  const target = normalizePlace(place);
  if (!target) return null;
  delete target.kind;
  const nights = nightsById(state);
  const targetKey = placeFingerprint(target);
  const elsewhere = (state.plans || []).some(
    (plan) =>
      planCountsForNightPlace(plan, { runningPlanId }) &&
      dateOfPlan(plan, nights) === date &&
      hasPlace(placeOfPlan(plan, nights)) &&
      placeFingerprint(placeOfPlan(plan, nights)) !== targetKey,
  );
  if (!elsewhere) return null;
  const nightId = nightIdAt(state, date, target);
  const next = {
    ...state,
    date,
    activeNightId: nightId,
    location: structuredClone(target),
    nights: nights.has(nightId)
      ? state.nights
      : [
          ...state.nights,
          { id: nightId, date, location: structuredClone(target) },
        ],
  };
  const own = (state.plans || []).find((plan) => plan.nightId === nightId);
  return selectPlannerPlan(next, own?.id ?? null);
}

/**
 * `state` with a night at `place` on `date` when the date holds plans, none of
 * them to plan, at other places and no night yet at `place`: the plan made for
 * the chosen place gets a night of its own beside the finished plans' (the
 * shared rule would join the night of the date by its date alone).
 */
export function nightBesideFinishedPlans(state, date, place) {
  const target = normalizePlace(place);
  if (!target) return state;
  delete target.kind;
  const targetKey = placeFingerprint(target);
  if (
    state.nights.some(
      (night) =>
        night.date === date && placeFingerprint(night.location) === targetKey,
    )
  )
    return state;
  const nights = nightsById(state);
  const finishedElsewhere = (state.plans || []).some(
    (plan) =>
      dateOfPlan(plan, nights) === date && hasPlace(placeOfPlan(plan, nights)),
  );
  if (!finishedElsewhere) return state;
  return {
    ...state,
    nights: [
      ...state.nights,
      {
        id: nightIdFor(date, target),
        date,
        location: structuredClone(target),
      },
    ],
  };
}

/**
 * `state` with the nights of one date and one place merged into one (the plans
 * of each keep their content): a place chosen where the date already has a
 * night leaves one night, not two. The active night is kept.
 */
export function mergeNightsAtSamePlace(state) {
  const keeper = new Map();
  const replaced = new Map();
  for (const night of state.nights || []) {
    const key = `${night.date}|${placeFingerprint(night.location)}`;
    const first = keeper.get(key);
    if (first === undefined) keeper.set(key, night.id);
    else if (night.id === state.activeNightId) {
      replaced.set(first, night.id);
      keeper.set(key, night.id);
    } else replaced.set(night.id, first);
  }
  if (!replaced.size) return state;
  const resolve = (id) => {
    let current = id;
    while (replaced.has(current)) current = replaced.get(current);
    return current;
  };
  return {
    ...state,
    nights: state.nights.filter((night) => !replaced.has(night.id)),
    plans: state.plans.map((plan) =>
      replaced.has(plan.nightId)
        ? { ...plan, nightId: resolve(plan.nightId) }
        : plan,
    ),
  };
}
