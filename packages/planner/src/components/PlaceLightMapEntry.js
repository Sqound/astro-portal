"use client";

import { createContext, useContext } from "react";
import { message } from "portal/i18n.js";
import { lightMapFocusOf } from "../places-light-map-access.js";

import { HeldChip } from "../offers-slot.js";

// The ways into "Carte de la pollution lumineuse" from a place on the web:
// the link at the end of the card "Qualité du ciel" of the place fiche, and the
// secondary "Voir sur la carte" at the top of its ⓘ dialog, under the three
// values. The "Lieux" view gives them through this context: what the map
// is to this person (`places-light-map-access.js`: `open`, `heldBack`, or
// nothing at all where no offers are registered and on the open core) and how to open
// it centred on a place. Without the context, nothing is drawn.

export const PlaceLightMapContext = createContext(null);

// `{ name, latitude, longitude }` of a place, or `null`: pure, in
// `places-light-map-access.js` (the place's details of "Cette nuit" use it).
export { lightMapFocusOf };

/** The card's one link, at its end under a hairline. */
export function PlaceLightMapLink({ locale, place }) {
  const lightMap = useContext(PlaceLightMapContext);
  const focus = lightMapFocusOf(place);
  if (!lightMap || lightMap.access === "absent" || !focus) return null;
  return (
    <p className="places-sky-map-link" data-light-map-entry={lightMap.access}>
      <button
        type="button"
        className="btn-link"
        onClick={() => lightMap.open(focus)}
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14" />
        </svg>
        {message(locale, "lightMapSeeOnMapLink")}
      </button>
      {lightMap.access === "heldBack" && (
        <HeldChip offer="planning" kind="locked" locale={locale} />
      )}
    </p>
  );
}

/** The ⓘ dialog's secondary, under the three values. */
export function PlaceLightMapButton({ locale, place }) {
  const lightMap = useContext(PlaceLightMapContext);
  const focus = lightMapFocusOf(place);
  if (!lightMap || lightMap.access === "absent" || !focus) return null;
  return (
    <p className="sky-brightness-map">
      <button
        type="button"
        className="btn-secondary"
        data-light-map-entry={lightMap.access}
        onClick={() => lightMap.open(focus)}
      >
        {message(locale, "lightMapSeeOnMapButton")}
      </button>
    </p>
  );
}
