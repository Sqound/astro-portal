// (3): "Cette nuit" hands the planner the night it shows — its date and
// its place — and whether the person asked for a new plan. The planner
// opens on that night, at that place, not on the night it remembered from another
// visit; "Nouveau plan" then makes the plan and selects its tab.
//
// The handoff lives in this tab's `sessionStorage` for one opening only: read
// once, removed at once. It never leaves the browser.
import {
  chooseDateAtPlace,
  nightBesideFinishedPlans,
} from "portal/planner/night-place.js";
import {
  choosePlannerDate,
  normalizePlace,
  placeFingerprint,
} from "portal/planner/state.js";

const openingKey = "planner.opening.v1";

const sessionStore = () => {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
};

/** Keeps `{date, place, newPlan}` for the planner's next opening. */
export function rememberPlannerOpening(
  { date, place = null, newPlan = false },
  storage = sessionStore(),
) {
  try {
    storage?.setItem(
      openingKey,
      JSON.stringify({ date, place, newPlan: Boolean(newPlan) }),
    );
  } catch {
    // A browser that keeps nothing: the planner opens as it would have.
  }
}

/** The opening "Cette nuit" asked for, once; `null` without one. */
export function takePlannerOpening(storage = sessionStore()) {
  try {
    const raw = storage?.getItem(openingKey);
    storage?.removeItem(openingKey);
    const value = raw ? JSON.parse(raw) : null;
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(String(value.date))) return null;
    return {
      date: value.date,
      place: value.place ?? null,
      newPlan: value.newPlan === true,
    };
  } catch {
    return null;
  }
}

/**
 * `state` opened on the night `date` at `place`, without starting a plan
 * (`seed: false`). Rule "une nuit = un lieu": a date whose plans still to plan
 * are at another place opens the night of `place`, empty — the band then says
 * what the date holds; plans that ran at another place do not count (they keep
 * the place they were observed at: the night of `place` stands beside theirs);
 * a night of that date that holds no plan — one the page made in memory for
 * the remembered date at the last place — no longer takes the place.
 */
export function plannerOpeningState(state, { date, place }, newPlan) {
  const at = normalizePlace(place);
  if (!at) return choosePlannerDate(state, date, { ...newPlan, seed: false });
  const held = chooseDateAtPlace(state, date, at);
  if (held) return held;
  const fingerprint = placeFingerprint(at);
  const holdsPlans = (night) =>
    state.plans.some((plan) => plan.nightId === night.id);
  const elsewhere = (night) =>
    night.date === date && placeFingerprint(night.location) !== fingerprint;
  return choosePlannerDate(
    nightBesideFinishedPlans(
      {
        ...state,
        location: at,
        nights: state.nights.filter(
          (night) => !elsewhere(night) || holdsPlans(night),
        ),
      },
      date,
      at,
    ),
    date,
    { ...newPlan, seed: false },
  );
}
