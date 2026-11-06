// Where the page must land when the observer asks to see the schedule they
// have just added a target to ("Voir la frise", `.planner-add-notice`).
//
// On a narrow screen the action used to bring the observer *below* the timeline: the
// added row was aligned against the top of the screen, so stage 4's own heading
// and the timeline's hour axis were scrolled away and all that remained was one
// bar with stage 5's heading under it. The rule is:
//
//   - stage 4's heading parked at the top of the visible area, below any
//     sticky header, whenever the added row is fully visible from there;
//   - otherwise the added row itself becomes the anchor, a third of the way
//     down the visible area rather than against its top edge.
//
// The calculation is kept out of the component so it can be exercised without
// a DOM: the component only measures and scrolls.

const finite = (value) => typeof value === "number" && Number.isFinite(value);

/**
 * @param {object} measurements every length in CSS pixels.
 * @param {number} measurements.stageTop stage 4's top, in document
 *   coordinates (`scrollY + getBoundingClientRect().top`).
 * @param {number} measurements.stageInset where inside the viewport the
 *   stage's own top should land -- the stage's `scroll-margin-top`, which on
 *   this page already accounts for the sticky portal header.
 * @param {number} measurements.headerHeight the sticky header overlaying the
 *   top of the viewport: the visible area begins below it.
 * @param {number|null} [measurements.rowTop] the added row's top, in document
 *   coordinates, or null when no particular row is being revealed.
 * @param {number} [measurements.rowHeight] that row's height.
 * @param {number} measurements.viewportHeight
 * @param {number} measurements.maxScroll the document's last scroll offset.
 * @returns {number|null} the scroll offset to land on, or null when the
 *   measurements are unusable.
 */
export function scheduleRevealOffset({
  stageTop,
  stageInset = 0,
  headerHeight = 0,
  rowTop = null,
  rowHeight = 0,
  viewportHeight,
  maxScroll,
}) {
  if (!finite(stageTop) || !finite(viewportHeight) || viewportHeight <= 0)
    return null;
  const limit = finite(maxScroll) ? Math.max(0, maxScroll) : 0;
  const inset = finite(stageInset) ? Math.max(0, stageInset) : 0;
  const header = finite(headerHeight)
    ? Math.min(Math.max(0, headerHeight), viewportHeight)
    : 0;
  // The stage's heading against the top of the visible area.
  const stageDestination = stageTop - inset;
  let destination = stageDestination;
  if (finite(rowTop)) {
    const height = finite(rowHeight) ? Math.max(0, rowHeight) : 0;
    // Everything from the heading down to the end of the added row fits:
    // keep the heading parked and the row is visible with the timeline
    // around it, which is the whole point of the action.
    const rowBottomInViewport = rowTop + height - stageDestination;
    if (rowBottomInViewport > viewportHeight)
      destination = rowTop - header - (viewportHeight - header) / 3;
  }
  return Math.min(limit, Math.max(0, destination));
}
