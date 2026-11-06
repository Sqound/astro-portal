"use client";

import { useEffect, useId, useRef, useState } from "react";

const LONG_PRESS_MS = 450;
const TOUCH_SHOWN_MS = 2000;

/**
 * The tooltip of a button of the viewer's top bar. The browser's own `title`
 * shows after about a second, too late for a bar of icons: this one shows at
 * once under the button, on the pointer's hover and on the keyboard's focus
 * (CSS only, no delay: `.viewer-tip` in `portal.css`), in the style of
 * `.capture-tooltip`, and hides when the pointer leaves, the focus leaves or
 * Escape is pressed. The button keeps its `aria-label`, points to the tooltip
 * with `aria-describedby`, and keeps a `title` — taken away while the
 * tooltip shows, so that the two never show together. A touch screen has no
 * hover: a long press (450 ms) on the button shows the tooltip for two
 * seconds and the press that follows is not a tap (CAPTURE-VIEWER-TOOLBAR-02).
 *
 * `children` receives `{ "aria-describedby", title }` to spread on the
 * button; `label` is the action, `hint` an optional grey line under it.
 */
export function ViewerTip({ label, hint = null, children }) {
  const id = useId();
  const [pointer, setPointer] = useState(false);
  const [focus, setFocus] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [touched, setTouched] = useState(false);
  const timers = useRef({ press: null, hide: null, swallow: false });
  useEffect(
    () => () => {
      clearTimeout(timers.current.press);
      clearTimeout(timers.current.hide);
    },
    [],
  );
  const cancelPress = () => {
    clearTimeout(timers.current.press);
    timers.current.press = null;
  };
  const title = hint ? `${label} — ${hint}` : label;
  return (
    <span
      className="viewer-tip"
      data-dismissed={dismissed ? "" : undefined}
      data-touch={touched ? "" : undefined}
      onPointerDown={(event) => {
        timers.current.swallow = false;
        if (event.pointerType !== "touch") return;
        cancelPress();
        timers.current.press = setTimeout(() => {
          timers.current.press = null;
          timers.current.swallow = true;
          setTouched(true);
          clearTimeout(timers.current.hide);
          timers.current.hide = setTimeout(
            () => setTouched(false),
            TOUCH_SHOWN_MS,
          );
        }, LONG_PRESS_MS);
      }}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onPointerMove={(event) => {
        if (event.pointerType === "touch" && Math.abs(event.movementX) > 8)
          cancelPress();
      }}
      onContextMenu={(event) => {
        if (timers.current.swallow || timers.current.press)
          event.preventDefault();
      }}
      onClickCapture={(event) => {
        if (!timers.current.swallow) return;
        timers.current.swallow = false;
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setPointer(true);
      }}
      onPointerLeave={() => {
        setPointer(false);
        setDismissed(false);
      }}
      onFocus={(event) => {
        if (event.target.matches?.(":focus-visible")) setFocus(true);
      }}
      onBlur={() => {
        setFocus(false);
        setDismissed(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setDismissed(true);
      }}
    >
      {children({
        "aria-describedby": id,
        title: pointer || focus ? undefined : title,
      })}
      <span role="tooltip" id={id} className="capture-tooltip viewer-tooltip">
        {label}
        {hint ? <span className="viewer-tooltip-hint">{hint}</span> : null}
      </span>
    </span>
  );
}
