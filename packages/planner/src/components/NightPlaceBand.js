"use client";

import { message } from "portal/i18n.js";
import { localizedPlanName } from "../quick-plan-messages.js";

// "Une nuit = un lieu": the band the planner shows when the date it holds has
// plans still to plan at another place than the one chosen, and the closed tabs
// under it.
//
// A warning (amber), never the red of what erases, with two choices of equal
// weight, both tertiary. The page under it is `inert` (the planner draws it so) until one
// of the two is taken; each opens the distance dialog of the place change
// before any plan moves.

const placeName = (place) =>
  String(place?.name || place?.locality || "").trim();

const planName = (locale, plan) =>
  plan.name
    ? localizedPlanName(locale, plan.name, plan.date)
    : message(locale, "plannerUntitledPlan");

const fill = (text, values) =>
  Object.entries(values).reduce(
    (line, [key, value]) => line.replaceAll(`{${key}}`, value),
    text,
  );

export function NightPlaceBand({ locale, conflict, plans, onChoose }) {
  const byId = new Map(plans.map((plan) => [plan.id, plan]));
  const names = conflict.otherPlanIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((plan) => planName(locale, plan));
  const chosen = placeName(conflict.chosenPlace);
  const kept = placeName(conflict.plansPlace);
  // The sentence carries its names and its place in bold: split on the values.
  const sentence = message(
    locale,
    names.length === 1
      ? "plannerNightPlaceBandOne"
      : "plannerNightPlaceBandMany",
  );
  const parts = sentence.split(/(\{names\}|\{place\})/);
  return (
    <>
      <section
        className="planner-night-place-band"
        data-testid="night-place-band"
        role="status"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3.6 2.8 19.4h18.4L12 3.6Z" />
          <path d="M12 10v4.2M12 16.9v.3" />
        </svg>
        <div>
          <p className="planner-night-place-band-title">
            {parts.map((part, index) =>
              part === "{names}" ? (
                <strong key={index}>{names.join(", ")}</strong>
              ) : part === "{place}" ? (
                <strong key={index}>{kept}</strong>
              ) : (
                part
              ),
            )}
          </p>
          <p className="planner-night-place-band-note">
            {message(locale, "plannerNightPlaceBandNote")}
          </p>
          <div className="planner-night-place-band-actions">
            <button
              type="button"
              className="btn-tertiary"
              data-testid="night-place-use"
              onClick={() => onChoose("use")}
            >
              {fill(message(locale, "plannerNightPlaceUse"), { place: chosen })}
            </button>
            <button
              type="button"
              className="btn-tertiary"
              data-testid="night-place-return"
              onClick={() => onChoose("return")}
            >
              {fill(message(locale, "plannerNightPlaceReturn"), {
                place: kept,
              })}
            </button>
          </div>
        </div>
      </section>
      <ul
        className="planner-night-place-tabs"
        data-testid="night-place-locked-tabs"
      >
        {conflict.tabPlanIds
          .map((id) => byId.get(id))
          .filter(Boolean)
          .map((plan) => (
            <li
              key={plan.id}
              data-testid={`night-place-locked-tab-${plan.id}`}
              aria-label={fill(message(locale, "plannerNightPlaceTabClosed"), {
                plan: planName(locale, plan),
                place: placeName(plan.location),
              })}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
              <span>
                {planName(locale, plan)} · {placeName(plan.location)}
              </span>
            </li>
          ))}
      </ul>
    </>
  );
}
