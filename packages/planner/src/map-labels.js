// Deterministic, surface-agnostic label placement for the planner's two
// maps.
//
// The web had no label collision-avoidance pass. Neither the absolute map --
// where every marker's name is a `<span>` pinned under its ring -- nor the
// horizon plot, where they are SVG `<text>` nodes, did anything about two names
// landing on the same pixels; at a 120 degree field the running planner stacks
// four hundred overlapping pairs across ninety-nine markers.
//
// A label asks for a
// preferred rectangle and a set of fallbacks; the requests are ranked; each
// takes the first of its candidates that is inside the canvas and clear of
// everything already placed; one with no free candidate is dropped, and only
// its text disappears -- the marker is always drawn.
//
// Nothing here knows about pixels, SVG user units, DOM nodes or projections.
// Each map measures its own labels and decides its own preferred offsets (the
// absolute map centres a chip under the ring, the horizon plot writes to the
// upper right of the dot), then asks this for the arrangement. That is what
// keeps the rule testable without a browser, and identical on both maps.

/**
 * Which label wins when two of them land on the same pixels. Declaration
 * order *is* the priority order: a request earlier in this list is placed
 * first and can block a later one from taking an overlapping rectangle.
 *
 * - `selected`: the single selected marker on a map -- never displaced.
 * - `emphasized`: a marker already in the active plan.
 * - `normal`: every other plotted marker.
 * - `ambient`: background naming -- the first to be dropped.
 */
export const mapLabelPriorities = [
  "selected",
  "emphasized",
  "normal",
  "ambient",
];

/**
 * The clearance kept between two placed labels, so they read as separate
 * words instead of merely not overlapping.
 */
export const mapLabelClearance = 2;

function priorityRank(priority) {
  const index = mapLabelPriorities.indexOf(priority);
  // An unknown rank sorts last rather than first: a caller's typo must never
  // silently outrank the selected marker.
  return index === -1 ? mapLabelPriorities.length : index;
}

function rect(x, y, width, height) {
  return { x, y, width, height, right: x + width, bottom: y + height };
}

function sameRect(left, right) {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

function overlaps(left, right) {
  return (
    left.x < right.right &&
    right.x < left.right &&
    left.y < right.bottom &&
    right.y < left.bottom
  );
}

function inflate(value, amount) {
  return rect(
    value.x - amount,
    value.y - amount,
    value.width + amount * 2,
    value.height + amount * 2,
  );
}

/**
 * The rectangle a request would take if nothing were in its way.
 *
 * @param {object} request see {@link layOutMapLabels}.
 * @returns {{x: number, y: number, width: number, height: number, right: number, bottom: number}}
 */
export function preferredLabelRect(request) {
  return rect(
    request.origin.x + request.offset.x,
    request.origin.y + request.offset.y,
    request.size.width,
    request.size.height,
  );
}

/**
 * The preferred position first, then right, left, above and below -- the
 * order a lower-priority label walks when the preferred one is taken.
 *
 * @param {object} request see {@link layOutMapLabels}.
 * @returns {Array<{x: number, y: number, width: number, height: number, right: number, bottom: number}>}
 */
export function labelCandidateRects(request) {
  const { origin, offset, size, gap } = request;
  const preferred = preferredLabelRect(request);
  const alternatives = [
    rect(origin.x + gap, origin.y + offset.y, size.width, size.height),
    rect(
      origin.x - gap - size.width,
      origin.y + offset.y,
      size.width,
      size.height,
    ),
    rect(
      origin.x - size.width / 2,
      origin.y - gap - size.height,
      size.width,
      size.height,
    ),
    rect(origin.x - size.width / 2, origin.y + gap, size.width, size.height),
  ];
  return [
    preferred,
    ...alternatives.filter((candidate) => !sameRect(candidate, preferred)),
  ];
}

/**
 * Places `requests` without ever letting two labels overlap.
 *
 * The requests are ranked by priority and, within one rank, by their key, so
 * the result depends only on the inputs and never on the order they were
 * collected in. Each label takes the first of its candidate positions that is
 * both inside `canvas` and clear of everything already placed; a label with no
 * free candidate is left out entirely -- its marker is still drawn, only the
 * text disappears.
 *
 * @param {object} options
 * @param {Array<{key: string, text: string, origin: {x: number, y: number},
 *   size: {width: number, height: number}, priority: string,
 *   offset: {x: number, y: number}, gap: number}>} options.requests
 *   `origin` is the point the label belongs to (a marker's projected centre),
 *   `offset` its preferred top-left relative to that point, and `gap` the
 *   clearance the fallback positions keep from it.
 * @param {{width: number, height: number}} options.canvas
 * @param {number} [options.clearance]
 * @returns {Array<{key: string, text: string, priority: string,
 *   rect: {x: number, y: number, width: number, height: number}}>}
 */
export function layOutMapLabels({
  requests,
  canvas,
  clearance = mapLabelClearance,
}) {
  const ordered = [...requests].sort((left, right) => {
    const byPriority =
      priorityRank(left.priority) - priorityRank(right.priority);
    if (byPriority !== 0) return byPriority;
    return left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
  });
  const taken = [];
  const placed = [];
  for (const request of ordered) {
    if (!request.text) continue;
    for (const candidate of labelCandidateRects(request)) {
      if (
        candidate.x < 0 ||
        candidate.y < 0 ||
        candidate.right > canvas.width ||
        candidate.bottom > canvas.height
      )
        continue;
      const guarded = inflate(candidate, clearance);
      if (taken.some((rectangle) => overlaps(guarded, rectangle))) continue;
      taken.push(candidate);
      placed.push({
        key: request.key,
        text: request.text,
        priority: request.priority,
        rect: candidate,
      });
      break;
    }
  }
  return placed;
}

/**
 * A label's rank from what the map knows about its marker.
 *
 * @param {object} [state]
 * @param {boolean} [state.selected]
 * @param {boolean} [state.inPlan]
 * @returns {string}
 */
export function mapLabelPriority({ selected = false, inPlan = false } = {}) {
  if (selected) return "selected";
  return inPlan ? "emphasized" : "normal";
}

/**
 * A usable width for a label the caller cannot measure -- the horizon plot's
 * SVG `<text>`, which has no laid-out box until it is in the document.
 *
 * `advance` is the mean advance width of one character at the font size in
 * question, expressed in the caller's own units. The estimate is deliberately
 * a plain product: it has to be the same number on the server's first render
 * and in the browser, or the plot would jump on hydration.
 *
 * @param {string} text
 * @param {number} advance
 * @returns {number}
 */
export function estimatedLabelWidth(text, advance) {
  return String(text ?? "").length * advance;
}

/**
 * How many of the best-rated targets besides the selected one and the plan's
 * own the "Positions" map names: ten, the count of "Cette nuit"'s
 * suggestions.
 */
export const positionLabelBestCount = 10;

/**
 * The size, in pixels, below which a name of the "Positions" map is never
 * written: the floor the horizon map gives its hours.
 */
export const positionLabelFontSize = 11;

/**
 * Which targets the "Positions" map names: the selected target, the plan's
 * targets and the `limit` best-rated others of the shown list, by the night
 * score of their card (the higher share of its own maximum first, a card
 * without a score last, equal scores in the list's own order). The rest keep
 * their dot and carry their name in its `<title>`. The rating is the
 * night's, not the instant's, so the set does not change while the time
 * slider moves.
 *
 * @param {object} options
 * @param {Array<{target: {id: string}}>} options.cards the shown list.
 * @param {string|null} [options.selectedTargetId]
 * @param {Set<string>|null} [options.planIds] the plan's targets.
 * @param {Map<string, {total: number, max: number}>|null} [options.scores]
 * @param {number} [options.limit]
 * @returns {Set<string>}
 */
export function positionLabelTargetIds({
  cards,
  selectedTargetId = null,
  planIds = null,
  scores = null,
  limit = positionLabelBestCount,
}) {
  const named = new Set();
  const others = [];
  cards.forEach((card, index) => {
    const id = card?.target?.id;
    if (id === undefined || id === null) return;
    if (id === selectedTargetId || planIds?.has(id)) named.add(id);
    else others.push({ id, index, score: scores?.get?.(id) || null });
  });
  const scored = (entry) => entry.score && entry.score.max > 0;
  others.sort((left, right) => {
    if (!scored(left) || !scored(right))
      return scored(left) === scored(right)
        ? left.index - right.index
        : scored(left)
          ? -1
          : 1;
    const byShare =
      right.score.total * left.score.max - left.score.total * right.score.max;
    return byShare || left.index - right.index;
  });
  for (const entry of others.slice(0, Math.max(0, limit))) named.add(entry.id);
  return named;
}

/**
 * A name's width in pixels at `fontSize`: a mean advance of 0.62 em for the
 * Latin, Cyrillic and Greek letters, one em for the characters of the Han,
 * kana and Hangul scripts. A plain sum, the same number on the server and in
 * the browser, so the plot does not jump on hydration.
 *
 * @param {string} text
 * @param {number} fontSize
 * @returns {number}
 */
export function positionLabelWidth(text, fontSize = positionLabelFontSize) {
  let width = 0;
  for (const character of String(text ?? "")) {
    width += character.codePointAt(0) >= 0x2e80 ? 1 : 0.62;
  }
  return width * fontSize;
}
