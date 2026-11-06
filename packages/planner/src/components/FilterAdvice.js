"use client";

import { filterAdviceSentence, filterAdviceTitle } from "../filters-section.js";

// "Conseil pour ce soir":
// what the Moon asks of the filters tonight, worded from the keys of
// `filterAdviceForNight`. It names a family, never a brand, and draws nothing
// when the night or the Moon is not known.
export function FilterAdvice({ locale, advice, tonight = true, timeZone }) {
  if (!advice?.length) return null;
  return (
    <aside
      className="planner-filter-advice"
      aria-labelledby="planner-filter-advice-title"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 18h6" />
        <path d="M10 21h4" />
        <path d="M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z" />
      </svg>
      <div>
        <h3 id="planner-filter-advice-title">
          {filterAdviceTitle(locale, tonight)}
        </h3>
        {advice.map((item, index) => (
          <p
            key={`${item.key}-${item.from}`}
            className={index ? "is-secondary" : ""}
          >
            {filterAdviceSentence({ locale, item, timeZone })}
          </p>
        ))}
      </div>
    </aside>
  );
}
