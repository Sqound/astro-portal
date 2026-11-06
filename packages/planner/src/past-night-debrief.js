// Offering the debriefing, web side: a plan saved whose night is already over
// -- created in the past, or its date moved into the past, never the night in
// progress -- offers its debriefing at once, in a dialog "Plan d’une nuit
// passée": "Débriefer maintenant" (primary) opens the debriefing of the plan,
// "Plus tard" (secondary) closes, the plan staying "À débriefer".
//
// The planner has no "save" gesture: it saves by itself after each edit
// (`PlannerPage.js`, the 700 ms effect). What is read here is therefore
// "what that save has just written": the page keeps the date of each plan as
// the last settled document held it ([planDatesOf]), and a save that finds a
// plan absent from it, or dated otherwise, asks [pastNightCandidates].
import { message } from "portal/i18n.js";
import { requestJson } from "portal/components/sessions/portal-fetch.js";
import { planStatus } from "./planner.js";
import { planTimeLeft } from "./plan-time-left.js";
import { planSessionHref } from "./plan-sessions.js";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Whether the night of a plan is already over at `now` (epoch ms): the night
 * the place is in has not begun to end, or it has ended. `false` for a date
 * that is not one -- nothing is offered about a night nobody knows.
 */
export function planNightIsOver({
  date,
  location = null,
  darkness,
  now = Date.now(),
} = {}) {
  if (typeof date !== "string" || !datePattern.test(date)) return false;
  return planTimeLeft({ date, location, darkness, now }) === null;
}

/** `Map<planId, date>` of the plans of a document. */
export function planDatesOf(plans = []) {
  return new Map(
    plans
      .filter((plan) => plan?.id)
      .map((plan) => [String(plan.id), plan.date ?? null]),
  );
}

/**
 * The ids of the plans of `plans` a save has created or re-dated: absent from
 * `previous` (a [planDatesOf] map), or with another date. Without a
 * `previous` (the page has not settled a first document yet) nothing is
 * known, so nothing is a candidate.
 */
export function pastNightCandidates({ previous, plans = [] }) {
  if (!previous) return [];
  return plans
    .filter(
      (plan) =>
        plan?.id &&
        (!previous.has(String(plan.id)) ||
          previous.get(String(plan.id)) !== (plan.date ?? null)),
    )
    .map((plan) => String(plan.id));
}

/**
 * The plans among `ids` that are still to be carried out (`pending`), whose
 * night is over at `now`, and that were not offered already (`offered`, a set
 * of `id:date` keys the caller keeps) -- the first of them is the one the
 * dialog opens on.
 */
export function pastNightPlansDue({
  plans = [],
  ids = [],
  now = Date.now(),
  offered = new Set(),
}) {
  const wanted = new Set(ids);
  return plans.filter(
    (plan) =>
      wanted.has(String(plan?.id)) &&
      planStatus(plan) === "pending" &&
      !offered.has(pastNightKey(plan)) &&
      planNightIsOver({
        date: plan.date,
        location: plan.location,
        darkness: plan.darkness,
        now,
      }),
  );
}

/** The key under which a plan with this date was offered. */
export const pastNightKey = (plan) => `${plan?.id}:${plan?.date}`;

/**
 * The service's id of the plan the planner holds under its own id: the
 * debriefing is the service's. `null` when the plan is not in the space (a
 * visitor, a network that fails): nothing is offered then.
 */
export async function serverPlanIdFor(
  plannerPlanId,
  { request = requestJson } = {},
) {
  try {
    const response = await request("/api/v1/plans");
    if (!response.ok) return null;
    const plans = (await response.json())?.plans ?? [];
    const found = plans.find((plan) => plan?.payload?.id === plannerPlanId);
    return found?.id ?? null;
  } catch {
    return null;
  }
}

/** The page of the debriefing of the plan the service knows as `serverPlanId`. */
export const pastNightDebriefHref = (locale, serverPlanId) =>
  planSessionHref(locale, { planId: serverPlanId });

/**
 * The words of the dialog. The full sentence speaks of Astro Sync and of the
 * web space; for someone without a space it stops at the Journal.
 */
export function pastNightDebriefWords(locale, { hasSpace = true } = {}) {
  return {
    title: message(locale, "debriefOfferPastNightTitle"),
    body: message(
      locale,
      hasSpace
        ? "debriefOfferPastNightBody"
        : "debriefOfferPastNightBodyNoSpace",
    ),
    now: message(locale, "debriefOfferNow"),
    later: message(locale, "debriefOfferLater"),
  };
}
