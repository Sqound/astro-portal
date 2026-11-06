"use client";

/**
 * The app's horizon glyph (the mountain of "Horizon" in the sky map).
 * Decorative: the words beside it say the rest.
 */
export function HorizonGlyph() {
  return (
    <svg
      className="planner-horizon-glyph"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 19l6-10 4 6 3-4 5 8z" />
    </svg>
  );
}

/**
 * "Aucun horizon": where a place has no horizon drawn, nothing to see, so the
 * link "Voir l’horizon de ce lieu" gives way to this state badge — a grey
 * pill with a thin grey edge, never gold, so that it is not read as the link.
 * It is not a button (`role="status"`, nothing to click): "Éditer ce lieu"
 * stays the one way to draw a horizon. Outside the four button levels.
 */
export function PlannerHorizonBadge({ label }) {
  return (
    <span className="planner-horizon-badge" role="status">
      <HorizonGlyph />
      {label}
    </span>
  );
}
