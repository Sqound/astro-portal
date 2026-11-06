// Which of several overlapping targets a repeated click at the same point
// selects, and how a click ranks them in the first place.
//
// Measured on the running planner at a 120 degree field: 376 pairs of
// markers overlap, and every one of them is decided by nothing but DOM
// order -- `.planner-night-map-target` buttons have no `z-index`, so the
// later sibling is painted on top and takes the click. `NGC 7000` always
// won over `IC 5070`, `M45` over `NGC 1432`, `IC 410` over `IC 405`, and a
// second click at the same place merely toggled the same target off again.
// The one underneath was unreachable.
//
// This is a state machine behind both maps, plus the ranking half of
// `skyMapMarkerCandidatesAtPoint`, which is what makes the *first* click land
// on the smallest ring containing the point rather than on whichever element
// happens to be drawn last.
//
// The two halves stay separate: each map builds its own best-first candidate list its own way (the
// absolute map ranks rings by area, the horizon plot ranks dots by distance)
// and only asks the cycle which one of them a click actually lands on.

/**
 * How close two clicks must land, in CSS pixels, to count as "the same point"
 * and advance a cycle rather than restart it (a tap that lands at the same
 * place (± 12 dp) as the previous one continues the cycle).
 */
export const mapTapCycleTolerancePx = 12;

/**
 * How far outside its own ring a marker still answers a click, in CSS
 * pixels -- the web's reading of `skyMapMinimumTapToleranceDp`. A ring can
 * be ten pixels across at a wide field, which is smaller than a fingertip
 * and only a little larger than a pointer's own aiming error.
 */
export const mapMarkerTapTolerancePx = 22;

/**
 * How far from a horizon plot dot a click still counts, in CSS pixels --
 * `horizonTargetTapToleranceDp`. Converted into the plot's own units by its
 * caller, which is the only place that knows the viewBox scale.
 */
export const horizonTargetTapTolerancePx = 16;

function distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

/**
 * Every marker a click at `point` could select, best first: the smallest
 * ring wins, a tie goes to whichever centre sits closer, and a tie on *that*
 * keeps the order the markers were given in, so the ranking depends only on
 * its inputs.
 *
 * A marker qualifies when the point is inside its drawn ring, or within
 * `tolerance` of its centre -- so a target too small to aim at is still
 * reachable, and a large one answers anywhere inside the ellipse it draws
 * rather than only near its edge.
 *
 * @param {object} options
 * @param {{x: number, y: number}} options.point in the same space as the
 *   markers' own centres.
 * @param {Array<{id: unknown, centre: {x: number, y: number},
 *   radius: {x: number, y: number}}>} options.markers
 * @param {number} [options.tolerance]
 * @returns {unknown[]} the qualifying markers' ids, best first.
 */
export function mapMarkerCandidatesAtPoint({
  point,
  markers,
  tolerance = mapMarkerTapTolerancePx,
}) {
  const qualifying = [];
  markers.forEach((marker, order) => {
    const radiusX = Math.max(0.5, marker.radius.x);
    const radiusY = Math.max(0.5, marker.radius.y);
    const normalisedX = (point.x - marker.centre.x) / radiusX;
    const normalisedY = (point.y - marker.centre.y) / radiusY;
    const insideRing = normalisedX ** 2 + normalisedY ** 2 <= 1;
    const centreDistance = distance(point, marker.centre);
    if (!insideRing && centreDistance > tolerance) return;
    qualifying.push({
      id: marker.id,
      area: radiusX * radiusY,
      distance: centreDistance,
      order,
    });
  });
  qualifying.sort(
    (left, right) =>
      left.area - right.area ||
      left.distance - right.distance ||
      left.order - right.order,
  );
  return qualifying.map((entry) => entry.id);
}

/**
 * Every plot target a click at `point` could select, nearest first.
 *
 * Everything within `tolerance` qualifies; when nothing does, the single
 * nearest target is offered anyway, which is what the horizon plot's own
 * "nearest wins" selection has always done.
 *
 * @param {object} options
 * @param {{x: number, y: number}} options.point in plot units.
 * @param {Array<{id: unknown, x: number, y: number}>} options.targets
 * @param {number} options.tolerance in plot units.
 * @returns {unknown[]}
 */
export function horizonTargetCandidatesAtPoint({
  point,
  targets,
  tolerance = horizonTargetTapTolerancePx,
}) {
  if (!targets.length) return [];
  const ranked = targets
    .map((target, order) => ({
      id: target.id,
      distance: (target.x - point.x) ** 2 + (target.y - point.y) ** 2,
      order,
    }))
    .sort(
      (left, right) =>
        left.distance - right.distance || left.order - right.order,
    );
  const near = ranked
    .filter((entry) => entry.distance <= tolerance * tolerance)
    .map((entry) => entry.id);
  return near.length ? near : [ranked[0].id];
}

/**
 * The cycling decision alone: which of an ordered, best-first candidate list
 * a repeated click at the same screen point should select next.
 *
 * A click advances the cycle only when all of the following still hold
 * compared to the previous call:
 *
 *  - the position is within `mapTapCycleTolerancePx` of the previous one;
 *  - `viewSignature` -- whatever the caller uses to mean "the camera has not
 *    moved" (the absolute map's centre and field of view; the plot's
 *    projection, rotation and sample index) -- is unchanged;
 *  - `currentSelection` is exactly what this cycle itself produced last
 *    time, so a selection made elsewhere (a recommendation card, "centre on
 *    selection", …) is never silently walked past.
 *
 * Any of those failing -- including the very first click -- restarts at the
 * candidates' own first entry. A single candidate therefore always cycles
 * back to itself: this never deselects on its own, and the maps' existing
 * `toggledTargetId` is left to turn a repeated identical selection into a
 * deselect exactly as it already did.
 *
 * @returns {{resolve: (options: {position: {x: number, y: number},
 *   candidates: unknown[], currentSelection: unknown,
 *   viewSignature?: unknown}) => unknown, hasMemory: () => boolean}}
 */
export function createMapTapCycle() {
  let position = null;
  let viewSignature;
  let selection;

  return {
    resolve({
      position: point,
      candidates,
      currentSelection,
      viewSignature: signature,
    }) {
      if (!candidates.length) {
        // A click nowhere near anything stays a deliberate deselect, and the
        // "last clicked point" memory is cleared so the next one -- wherever
        // it lands -- starts a fresh cycle rather than resuming a stale one.
        position = null;
        viewSignature = undefined;
        selection = undefined;
        return null;
      }
      const sameSpot =
        position !== null &&
        distance(point, position) <= mapTapCycleTolerancePx &&
        viewSignature === signature &&
        selection === currentSelection &&
        candidates.includes(currentSelection);
      const next = sameSpot
        ? candidates[
            (candidates.indexOf(currentSelection) + 1) % candidates.length
          ]
        : candidates[0];
      position = point;
      viewSignature = signature;
      selection = next;
      return next;
    },
    /** Whether a "last clicked point" is currently held -- for tests. */
    hasMemory() {
      return position !== null;
    },
  };
}
