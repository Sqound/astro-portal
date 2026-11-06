/** The space kept between the menu and the trigger, and the window's edges. */
const GAP = 2;
const MARGIN = 8;

/**
 * Where the open menu stands, in the window's coordinates: right edge on the
 * trigger's, under it — or over it when it does not fit below and there is more
 * room above — kept inside the window; when neither side holds the whole menu
 * its height is cut (`maxHeight`) and the menu scrolls.
 */
export function menuPlacement(trigger, size, view) {
  const room = {
    below: view.height - trigger.bottom - GAP - MARGIN,
    above: trigger.top - GAP - MARGIN,
  };
  const above = size.height > room.below && room.above > room.below;
  const available = Math.max(0, above ? room.above : room.below);
  const height = Math.min(size.height, available);
  const width = Math.min(size.width, view.width - 2 * MARGIN);
  const left = Math.max(
    MARGIN,
    Math.min(trigger.right - width, view.width - MARGIN - width),
  );
  const top = above ? trigger.top - GAP - height : trigger.bottom + GAP;
  return {
    top,
    left,
    maxHeight: size.height > available ? available : null,
    above,
  };
}
