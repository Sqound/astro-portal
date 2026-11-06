// After a touch on a
// date of a calendar, the page scrolls by the smallest offset that shows both
// the line of the date and the card of its plans under it. When the card fits
// with the date's line, the page moves only if one of the two is out of the
// view; when the card is taller than the place there is, the date's line stays
// visible at the top and the start of the card is shown, the rest is scrolled by
// hand. No animation when the system asks to reduce them.

/**
 * How far the page scrolls down (`+`) or up (`-`) so that a date whose line
 * starts at `cellTop` and the card that ends at `panelBottom` are seen in a
 * view that runs from `viewTop` to `viewBottom` (all in the same coordinates,
 * `margin` of air kept at both ends).
 */
export function revealDelta({
  cellTop,
  panelBottom,
  viewTop,
  viewBottom,
  margin = 8,
}) {
  // The content moves up by `delta` when the page scrolls down by `delta`.
  const least = panelBottom - (viewBottom - margin);
  const most = cellTop - (viewTop + margin);
  if (least <= most) return Math.min(Math.max(0, least), most);
  return most;
}

const insetOf = (name) => {
  const value = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(name),
  );
  return Number.isFinite(value) ? value : 0;
};

/**
 * Scrolls the page to show `cell` (the button of the date) and `panel` (its
 * card). The view is the window, less the `scroll-padding-top` the page keeps
 * for its sticky bars.
 */
export function revealSelection(cell, panel) {
  if (!cell || !panel || typeof window === "undefined") return;
  const reduced = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  )?.matches;
  const delta = revealDelta({
    cellTop: cell.getBoundingClientRect().top,
    panelBottom: panel.getBoundingClientRect().bottom,
    viewTop: insetOf("scroll-padding-top"),
    viewBottom: window.innerHeight,
  });
  if (Math.abs(delta) < 1) return;
  window.scrollBy({ top: delta, behavior: reduced ? "auto" : "smooth" });
}
