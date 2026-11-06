function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

/**
 * Keeps a floating panel inside the visible viewport while preserving its
 * trigger as the visual anchor. The returned height is a maximum: callers can
 * make overflowing editorial content scroll instead of letting it escape the
 * screen.
 */
export function floatingPopoverPosition({
  anchor,
  viewport,
  popover,
  gap = 8,
  margin = 12,
}) {
  const leftBoundary = viewport.left + margin;
  const rightBoundary = viewport.left + viewport.width - margin;
  const topBoundary = viewport.top + margin;
  const bottomBoundary = viewport.top + viewport.height - margin;
  const width = Math.max(
    0,
    Math.min(popover.width, rightBoundary - leftBoundary),
  );
  const height = Math.max(0, popover.height);
  const belowTop = anchor.bottom + gap;
  const aboveBottom = anchor.top - gap;
  const roomBelow = Math.max(0, bottomBoundary - belowTop);
  const roomAbove = Math.max(0, aboveBottom - topBoundary);
  const belowFits = height <= roomBelow;
  const aboveFits = height <= roomAbove;
  const placement =
    belowFits || (!aboveFits && roomBelow >= roomAbove) ? "below" : "above";
  const availableHeight = placement === "below" ? roomBelow : roomAbove;
  const maxHeight = Math.max(0, Math.min(height, availableHeight));
  const renderedHeight = Math.min(height, maxHeight);
  const top =
    placement === "below"
      ? belowTop
      : Math.max(topBoundary, aboveBottom - renderedHeight);
  const left = clamp(anchor.right - width, leftBoundary, rightBoundary - width);

  return { left, top, width, maxHeight, placement };
}
