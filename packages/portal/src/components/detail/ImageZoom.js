"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { message } from "../../i18n.js";
import { ViewerTip } from "./ViewerTip.js";

/**
 * The zoom of the capture viewer: the shared copy is served whole, 4 096 px at
 * most, but a viewer that only showed it fitted to the window left its
 * definition impossible to judge. One component for
 * the public gallery's page and the private gallery's (`PublicCapturePage`).
 *
 * Two states and what lies between: « ajustée » (the image fitted to the
 * window, the viewer as it always was) and « 100 % » — one pixel of the file
 * for one pixel of the screen, **device** pixels, so that on a screen of
 * ratio 2 a 2 922 px image is 1 461 CSS pixels wide. Between the fit and 200 %
 * the image can be pinched or wheeled to any size.
 *
 * - a click or a tap on the image, or the round button « ⊕ » at the top-left
 *   of the viewer, goes from the fit to 100 % (at the point touched) and back;
 * - once zoomed, a drag pans (a finger, the mouse), the scroll wheel and the
 *   trackpad's two fingers pan, Ctrl + wheel (the trackpad's pinch) and two
 *   fingers zoom between the fit and 200 %, Escape and « 0 » go back to the
 *   fit, « + » and « − » zoom by steps;
 * - the zoom is a size of the image's own box, not a transform of a picture:
 *   the annotations of the sky (`PlateOverlay`, which reads that box) are
 *   laid again at each size, and the side panel, whose width changes the
 *   viewer's, only moves the window the image is looked at through (the zoom
 *   is kept, clamped to it).
 *
 * The zoom state lives in the DOM (`data-zoomed`, `data-zoom` — the percent —
 * on the viewer's image area, the size and the place of the image's box):
 * React only knows whether it is on, for the button.
 */

/** The largest zoom: 200 % of the device pixels. */
export const MAX_ZOOM = 2;
const STEP = 1.5;
// The box is back to what the stylesheet draws.
const clearBox = (canvas) => {
  canvas.style.removeProperty("width");
  canvas.style.removeProperty("height");
  canvas.style.removeProperty("transform");
};

/** A press that moves less than this (CSS pixels) is a tap. */
const TAP_SLOP = 6;
/** Below this ratio above the fit, the image is the fitted one. */
const FIT_EPSILON = 1.005;

const limit = (value, low, high) => Math.min(high, Math.max(low, value));

export function useImageZoom({ imageKey, enabled = true }) {
  const areaRef = useRef(null);
  const canvasRef = useRef(null);
  const [zoomed, setZoomed] = useState(false);
  const [canZoom, setCanZoom] = useState(false);
  const api = useRef(null);

  useEffect(() => {
    const area = areaRef.current;
    const canvas = canvasRef.current;
    if (!enabled || !area || !canvas) return undefined;
    // `s` is the scale in device pixels (1: one pixel of the file for one of
    // the screen), `x` and `y` the place of the image's box in the area.
    const view = { zoomed: false, s: 1, x: 0, y: 0, fit: null };
    const pointers = new Map();
    let pinch = null;
    let pinched = false;

    const image = () => canvas.querySelector("img");
    const natural = () => {
      const picture = image();
      return picture?.naturalWidth
        ? { width: picture.naturalWidth, height: picture.naturalHeight }
        : null;
    };
    const ratio = () => window.devicePixelRatio || 1;
    const areaBox = () => area.getBoundingClientRect();

    const paint = () => {
      const size = natural();
      if (!view.zoomed || !size) {
        area.removeAttribute("data-zoomed");
        area.removeAttribute("data-zoom");
        clearBox(canvas);
        return;
      }
      area.setAttribute("data-zoomed", "true");
      area.setAttribute("data-zoom", String(Math.round(view.s * 100)));
      canvas.style.width = `${(size.width * view.s) / ratio()}px`;
      canvas.style.height = `${(size.height * view.s) / ratio()}px`;
      canvas.style.transform = `translate(${view.x}px, ${view.y}px)`;
    };

    const clampPlace = () => {
      const size = natural();
      if (!size) return;
      const width = (size.width * view.s) / ratio();
      const height = (size.height * view.s) / ratio();
      const roomX = area.clientWidth;
      const roomY = area.clientHeight;
      view.x =
        width <= roomX ? (roomX - width) / 2 : limit(view.x, roomX - width, 0);
      view.y =
        height <= roomY
          ? (roomY - height) / 2
          : limit(view.y, roomY - height, 0);
    };

    // Where the fitted image lies in the area, read from the layout itself
    // (the stylesheet decides the fit, not this file): the zoom is lifted
    // for the measure and put back before anything is drawn.
    const measureFit = () => {
      const size = natural();
      if (!size) return null;
      const wasZoomed = area.hasAttribute("data-zoomed");
      if (wasZoomed) {
        area.removeAttribute("data-zoomed");
        clearBox(canvas);
      }
      const box = areaBox();
      const at = canvas.getBoundingClientRect();
      if (wasZoomed) paint();
      if (!at.width) return null;
      return {
        left: at.left - box.left,
        top: at.top - box.top,
        width: at.width,
        height: at.height,
        // The scale of the fitted image, in device pixels.
        scale: (at.width * ratio()) / size.width,
      };
    };

    const refreshFit = () => {
      view.fit = measureFit();
      setCanZoom(Boolean(view.fit) && view.fit.scale < 1 / FIT_EPSILON);
      return view.fit;
    };

    const exit = () => {
      if (!view.zoomed) return;
      view.zoomed = false;
      paint();
      setZoomed(false);
    };

    // Puts the image at scale `s` with its box at (x, y), or back to the fit
    // when `s` is the fit's.
    const place = (s, x, y) => {
      const fit = view.fit;
      if (!fit) return;
      const scale = limit(s, fit.scale, Math.max(MAX_ZOOM, fit.scale));
      if (scale <= fit.scale * FIT_EPSILON) {
        exit();
        return;
      }
      view.zoomed = true;
      view.s = scale;
      view.x = x;
      view.y = y;
      clampPlace();
      paint();
      setZoomed(true);
    };

    // Where the image lies now: its scale and the place of its box.
    const base = () =>
      view.zoomed
        ? { s: view.s, x: view.x, y: view.y }
        : { s: view.fit.scale, x: view.fit.left, y: view.fit.top };

    // The point of the image under `before` goes to `after` at scale `s`.
    const zoomTo = (s, before, after = before, from = base()) => {
      const k = s / from.s;
      place(
        s,
        after.x - (before.x - from.x) * k,
        after.y - (before.y - from.y) * k,
      );
    };

    const centre = () =>
      view.zoomed || !view.fit
        ? { x: area.clientWidth / 2, y: area.clientHeight / 2 }
        : {
            x: view.fit.left + view.fit.width / 2,
            y: view.fit.top + view.fit.height / 2,
          };

    const ready = () => {
      if (!natural()) return false;
      if (!view.zoomed || !view.fit) refreshFit();
      return Boolean(view.fit) && view.fit.scale < 1 / FIT_EPSILON;
    };

    /** Fit ⇄ 100 %, about `at` (the point touched, else the middle). */
    const toggle = (at = centre()) => {
      if (view.zoomed) exit();
      else if (ready()) zoomTo(1, at);
    };
    const step = (factor, at = centre()) => {
      if (!ready()) return;
      zoomTo(base().s * factor, at);
    };

    const local = (event) => {
      const box = areaBox();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    };

    const onPointerDown = (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (event.target.closest("button, a, select, input, label")) return;
      if (!natural()) return;
      const onImage = canvas.contains(event.target);
      if (!onImage && !view.zoomed && pointers.size === 0) return;
      pointers.set(event.pointerId, {
        ...local(event),
        start: local(event),
        last: local(event),
        at: Date.now(),
        onImage,
        moved: false,
      });
      try {
        area.setPointerCapture(event.pointerId);
      } catch {
        // The pointer is already gone.
      }
      if (pointers.size === 2 && ready()) {
        const [first, second] = [...pointers.values()];
        pinch = {
          from: base(),
          distance: Math.hypot(first.x - second.x, first.y - second.y) || 1,
          middle: {
            x: (first.x + second.x) / 2,
            y: (first.y + second.y) / 2,
          },
        };
        pinched = true;
      }
    };

    const onPointerMove = (event) => {
      const pointer = pointers.get(event.pointerId);
      if (!pointer) return;
      const now = local(event);
      pointer.x = now.x;
      pointer.y = now.y;
      if (pinch && pointers.size >= 2) {
        const [first, second] = [...pointers.values()];
        const distance = Math.hypot(first.x - second.x, first.y - second.y);
        const middle = {
          x: (first.x + second.x) / 2,
          y: (first.y + second.y) / 2,
        };
        zoomTo(
          pinch.from.s * (distance / pinch.distance),
          pinch.middle,
          middle,
          pinch.from,
        );
        return;
      }
      if (pointers.size !== 1) return;
      if (
        !pointer.moved &&
        Math.hypot(now.x - pointer.start.x, now.y - pointer.start.y) > TAP_SLOP
      ) {
        pointer.moved = true;
        area.setAttribute("data-dragging", "true");
      }
      if (pointer.moved && view.zoomed) {
        view.x += now.x - pointer.last.x;
        view.y += now.y - pointer.last.y;
        clampPlace();
        paint();
      }
      if (pointer.moved) pointer.last = now;
    };

    const onPointerEnd = (event) => {
      const pointer = pointers.get(event.pointerId);
      if (!pointer) return;
      pointers.delete(event.pointerId);
      try {
        area.releasePointerCapture(event.pointerId);
      } catch {
        // Already released.
      }
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) {
        area.removeAttribute("data-dragging");
        const tap =
          event.type === "pointerup" &&
          !pinched &&
          !pointer.moved &&
          pointer.onImage &&
          Date.now() - pointer.at < 800;
        pinched = false;
        if (tap) toggle(pointer);
      }
    };

    const onWheel = (event) => {
      if (event.target.closest("select")) return;
      if (!natural()) return;
      const scale = event.deltaMode === 1 ? 16 : 1;
      if (event.ctrlKey || event.metaKey) {
        // The trackpad's pinch arrives as a wheel with Ctrl; so does the
        // mouse wheel held with Ctrl.
        event.preventDefault();
        if (!ready()) return;
        const delta = limit(event.deltaY * scale, -60, 60);
        zoomTo(base().s * Math.exp(-delta * 0.01), local(event));
      } else if (view.zoomed) {
        event.preventDefault();
        view.x -= event.deltaX * scale;
        view.y -= event.deltaY * scale;
        clampPlace();
        paint();
      }
    };

    const onKeyDown = (event) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.target.closest?.("input, textarea, select, [contenteditable]")
      )
        return;
      if (event.key === "Escape" || event.key === "0") {
        if (!view.zoomed) return;
        event.preventDefault();
        exit();
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        step(STEP);
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        step(1 / STEP);
      }
    };

    // The window changed (the side panel folded, the phone turned, the
    // browser zoomed): the fit is measured again and the image, if zoomed,
    // kept inside it.
    const onResize = () => {
      const fit = refreshFit();
      if (!view.zoomed) return;
      if (!fit) return exit();
      view.s = limit(view.s, fit.scale, Math.max(MAX_ZOOM, fit.scale));
      if (view.s <= fit.scale * FIT_EPSILON) return exit();
      clampPlace();
      paint();
    };

    area.addEventListener("pointerdown", onPointerDown);
    area.addEventListener("pointermove", onPointerMove);
    area.addEventListener("pointerup", onPointerEnd);
    area.addEventListener("pointercancel", onPointerEnd);
    area.addEventListener("wheel", onWheel, { passive: false });
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    // `load` does not bubble: heard on the way down.
    canvas.addEventListener("load", onResize, true);
    const observer = new ResizeObserver(onResize);
    observer.observe(area);
    if (image()?.complete) onResize();
    api.current = { toggle: () => toggle(), exit };
    return () => {
      api.current = null;
      area.removeEventListener("pointerdown", onPointerDown);
      area.removeEventListener("pointermove", onPointerMove);
      area.removeEventListener("pointerup", onPointerEnd);
      area.removeEventListener("pointercancel", onPointerEnd);
      area.removeEventListener("wheel", onWheel);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("load", onResize, true);
      observer.disconnect();
      view.zoomed = false;
      paint();
      setZoomed(false);
    };
    // Another image starts at the fit: the effect is set up again.
  }, [enabled, imageKey]);

  const toggle = useCallback(() => api.current?.toggle(), []);
  return { areaRef, canvasRef, zoomed, canZoom, toggle };
}

/**
 * The round button « ⊕ » of the viewer: fit ⇄ 100 %. The name
 * (« Zoom 100 % » / « Ajuster ») is the tooltip's, the `aria-label`'s and the
 * `title`'s; no label under the icon.
 */
export function ImageZoomButton({ zoom, locale = "en" }) {
  if (!zoom.canZoom && !zoom.zoomed) return null;
  const name = message(locale, zoom.zoomed ? "zoomFit" : "zoomActualSize");
  return (
    <ViewerTip label={name}>
      {(tip) => (
        <button
          type="button"
          className={`image-zoom${zoom.zoomed ? " is-active" : ""}`}
          onClick={zoom.toggle}
          aria-pressed={zoom.zoomed}
          aria-label={name}
          {...tip}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="7.5" />
            {zoom.zoomed ? (
              <path d="M8.5 12h7" />
            ) : (
              <path d="M12 8.5v7M8.5 12h7" />
            )}
          </svg>
        </button>
      )}
    </ViewerTip>
  );
}
