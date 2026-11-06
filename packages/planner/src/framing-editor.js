// What the web planner's fullscreen framing editor puts on its map, and how a
// marker is presented -- kept free of any framework so the rules can be tested
// without a WebGL canvas.

// The targets the map draws are the ones the caller gives it, in this order:
// the plan's own (`cards`), the saved framings, and -- new with the editor's
// search -- the one target a visitor asked to see. A target with no position
// cannot be drawn, and one that appears twice is drawn once.
export function uniqueMapTargets(targets) {
  const seen = new Set();
  return targets.filter((target) => {
    if (!target?.id || seen.has(target.id)) return false;
    seen.add(target.id);
    return Boolean(target.coordinate);
  });
}

export function mapDisplayedTargets({
  cards = [],
  savedFramingTargets = [],
  highlightedTarget = null,
} = {}) {
  return uniqueMapTargets([
    ...cards.map((card) => card.target),
    ...savedFramingTargets,
    ...(highlightedTarget ? [highlightedTarget] : []),
  ]);
}

// Targets are not displayed by default: the editor's map is given no plan card,
// so it draws no catalogue marker of its own accord. The framing being edited
// is the one target it draws -- that is the framing itself, named by the
// photographer -- and the target a visitor found through the magnifier is the
// other, for as long as the visitor keeps it. The catalogue reaches the map
// separately, as the pool a framing is *named* from (`framingTargets`), and is
// never drawn.
export function framingEditorMapInputs({
  editingTarget = null,
  highlightedTarget = null,
} = {}) {
  return {
    cards: [],
    savedFramingTargets: editingTarget ? [editingTarget] : [],
    highlightedTarget: highlightedTarget || null,
  };
}

// The highlighted target is drawn with its name and its selection reticle "even
// if the display setting is not to show targets" -- it ignores both the
// markers' and the labels' display setting, which govern every other target. It
// is a mark on the sky, not a target to tap: choosing it again is the chip's
// cross, so it takes no click.
export function mapMarkerPresentation({
  targetId,
  highlightedId = null,
  selectedId = null,
  markersVisible = true,
  labelsVisible = true,
} = {}) {
  const highlighted = highlightedId != null && targetId === highlightedId;
  return {
    highlighted,
    hidden: highlighted ? false : !markersVisible,
    labelVisible: highlighted ? true : labelsVisible,
    reticle: highlighted || (selectedId != null && selectedId === targetId),
    interactive: !highlighted,
  };
}

// How long the map takes to point at a chosen target and to zoom to it. A
// visitor who prefers reduced motion (`prefers-reduced-motion`) is taken there
// at once: the engine takes a duration of 0 as a jump straight to the target
// and its field (measured in a browser, the map went from 120° to 5.1° on the
// spot), so no in-between frame crosses the sky.
export function mapMoveSeconds({ reducedMotion = false } = {}) {
  return reducedMotion ? 0 : 0.3;
}

// The button that validates the editor says what it does -- "Créer ce cadrage"
// for a new framing, "Modifier ce cadrage" for an existing one. Any mode but
// the creation one is an edit (`editFree`, `editCopy`).
export function framingEditorConfirmLabelKey(mode) {
  return mode === "create"
    ? "plannerFramingConfirmCreate"
    : "plannerFramingConfirmEdit";
}
