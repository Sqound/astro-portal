// The four levels of a button,
// from the weakest to the strongest. Each is one CSS class of
// `portal-app/styles/portal.css`; the destructive tint is a modifier of any of them.
export const BUTTON_LEVELS = ["link", "tertiary", "secondary", "primary"];

/**
 * The class list of a button whose level is chosen by data (a sheet that
 * builds its actions from a table). A button whose level is fixed writes its
 * class out (`className="btn-tertiary"`) instead, so the source says it.
 */
export function levelClass(level, { destructive = false } = {}) {
  if (!BUTTON_LEVELS.includes(level))
    throw new Error(
      `Unknown button level "${level}": expected one of ${BUTTON_LEVELS.join(", ")}.`,
    );
  return `btn-${level}${destructive ? " is-destructive" : ""}`;
}
