// A touch (or pen) long press on an element. A mouse never counts — its click is the
// gesture — and a press that moves (a drag), gains a second finger (a pinch
// zoom) or is lifted early (a tap) fires nothing. The click the browser may
// still send when the finger leaves is swallowed, so the long press and the
// tap never both choose.
export const LONG_PRESS_DELAY = 500;
export const LONG_PRESS_TOLERANCE = 10;

export function onTouchLongPress(
  element,
  handler,
  {
    delay = LONG_PRESS_DELAY,
    tolerance = LONG_PRESS_TOLERANCE,
    ignore = () => false,
  } = {},
) {
  const fingers = new Set();
  let pending = null;
  let swallowUntil = 0;
  const cancel = () => {
    if (!pending) return;
    clearTimeout(pending.timer);
    pending = null;
  };
  const down = (event) => {
    if (event.pointerType === "mouse") return;
    fingers.add(event.pointerId);
    if (fingers.size > 1 || ignore(event)) return cancel();
    const origin = { x: event.clientX, y: event.clientY };
    pending = {
      id: event.pointerId,
      origin,
      timer: setTimeout(() => {
        pending = null;
        swallowUntil = Date.now() + 800;
        handler({ clientX: origin.x, clientY: origin.y });
      }, delay),
    };
  };
  const move = (event) => {
    if (!pending || event.pointerId !== pending.id) return;
    if (
      Math.hypot(
        event.clientX - pending.origin.x,
        event.clientY - pending.origin.y,
      ) > tolerance
    )
      cancel();
  };
  const up = (event) => {
    fingers.delete(event.pointerId);
    cancel();
  };
  const click = (event) => {
    if (Date.now() >= swallowUntil) return;
    swallowUntil = 0;
    event.stopPropagation();
    event.preventDefault();
  };
  // A long press opens the browser's context menu on some touch screens.
  const menu = (event) => {
    if (pending || Date.now() < swallowUntil) event.preventDefault();
  };
  element.addEventListener("pointerdown", down);
  element.addEventListener("pointermove", move);
  element.addEventListener("pointerup", up);
  element.addEventListener("pointercancel", up);
  element.addEventListener("click", click, true);
  element.addEventListener("contextmenu", menu);
  return () => {
    cancel();
    element.removeEventListener("pointerdown", down);
    element.removeEventListener("pointermove", move);
    element.removeEventListener("pointerup", up);
    element.removeEventListener("pointercancel", up);
    element.removeEventListener("click", click, true);
    element.removeEventListener("contextmenu", menu);
  };
}
