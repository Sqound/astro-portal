"use client";

import { message } from "portal/i18n.js";

/**
 * The small display selector of the stage-5 frise: two icons, no text — "intervals"
 * (three staggered bars, the default) and "numbers" (three cells) — at the
 * right of the totals line, the same strip as the three icons of "Votre plan
 * de ce soir" (`.plan-target-view`: 12 px group, 8 px choices of 40 × 36, the
 * chosen one in the secondary look). In "numbers" the blocks of the one row
 * keep their real extent and carry the order number of the night in place of
 * their name.
 *
 * Not stored, in the plan or in the browser: the page opens on "intervals".
 */
export const scheduleDisplayChoices = Object.freeze(["intervals", "numbers"]);

const glyphs = {
  intervals: (
    <>
      <rect x="3" y="5" width="9" height="3.6" rx="1.4" />
      <rect x="8" y="10.2" width="9" height="3.6" rx="1.4" />
      <rect x="13" y="15.4" width="8" height="3.6" rx="1.4" />
    </>
  ),
  numbers: (
    <>
      <rect x="2.6" y="8" width="5.2" height="8" rx="1.6" />
      <rect x="9.4" y="8" width="5.2" height="8" rx="1.6" />
      <rect x="16.2" y="8" width="5.2" height="8" rx="1.6" />
    </>
  ),
};

const keys = {
  intervals: "plannerScheduleDisplayIntervals",
  numbers: "plannerScheduleDisplayNumbers",
};

export function ScheduleDisplaySwitch({ locale, value, onChange }) {
  return (
    <div
      role="radiogroup"
      aria-label={message(locale, "plannerScheduleDisplayLabel")}
      className="plan-target-view planner-schedule-display"
    >
      {scheduleDisplayChoices.map((choice) => (
        <button
          key={choice}
          type="button"
          role="radio"
          aria-checked={value === choice}
          aria-label={message(locale, keys[choice])}
          title={message(locale, keys[choice])}
          data-display={choice}
          className={value === choice ? "is-active" : undefined}
          onClick={() => onChange(choice)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {glyphs[choice]}
          </svg>
        </button>
      ))}
    </div>
  );
}
