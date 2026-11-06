"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { message } from "portal/i18n.js";
import { skyPictureKindOf } from "portal/sky-pictures.js";
import {
  eyepieceDiscLayout,
  eyepieceDiscShading,
  eyepieceViewOrDefault,
  paintEyepiecePixels,
} from "../eyepiece-view.js";

// The eyepiece view on the web: in visual mode, the target's picture drawn
// in a disc for the plan's telescope, eyepiece and the place's sky
// (`eyepiece-view.js`). The planner page provides the setting
// (`EyepieceViewContext`); every thumbnail that resolves its image with
// `targetImageVariant` in visual mode asks `useEyepieceView` for it. No
// setting or a solar-system target draws the disc at a default field (the
// colour photo is for a photo plan only); an image that cannot be read
// keeps today's image.
//
// A simulation of a target with an id draws its field image
// (`view.fieldImage`, the survey cut by the portal at the eyepiece's true
// field: the whole disc is sky) instead of the thumbnail when the portal
// serves it. The thumbnail is drawn first if it comes first, fading into
// the sky's level at its border (`softEdge`), and the field image replaces
// it when it arrives, like any image loading; a field image that does not
// come leaves the thumbnail.

/**
 * `{ setting, visual, locale }`: the plan's eyepiece setting
 * (`eyepieceViewSetting`, `null` when the plan is not visual or a value is
 * missing), whether the plan is visual (`equipment.mode`), and the page's
 * language, for the words of the simulation.
 */
export const EyepieceViewContext = createContext({
  setting: null,
  visual: false,
  locale: "fr",
});

/** The page's eyepiece setting and language. */
export function useEyepieceSetting() {
  return useContext(EyepieceViewContext);
}

/**
 * What the thumbnail of `target` shows in visual mode: `null` for a photo
 * plan's image, else the disc (`eyepieceViewOrDefault`) for the page's
 * setting, at a default field when it is incomplete.
 */
export function useEyepieceView(target, { visualMode, imageSource } = {}) {
  const { setting } = useContext(EyepieceViewContext);
  // The sky picture of a bright star or a constellation is a map, the same
  // in both modes: never in the eyepiece's disc.
  if (skyPictureKindOf(target)) return null;
  return eyepieceViewOrDefault(target, setting, { visualMode, imageSource });
}

/** The words of the simulation, and the thumbnail's accessible name. */
export function eyepieceViewCaption(locale) {
  return message(locale, "plannerEyepieceViewCaption");
}

export function eyepieceViewLabel(locale, name) {
  return message(locale, "plannerEyepieceViewLabel").replace(
    "{name}",
    name || "",
  );
}

// The side, in pixels, the source is processed at: the same working size on
// every thumbnail, so the background ring and the knee read the same image
// whatever the card's size.
const workingSide = 256;
const processed = new Map();
const processedLimit = 48;

// How long a thumbnail that came first waits for the field image before it
// is drawn: a field image already in the browser's cache replaces nothing.
const fieldGraceMs = 250;

// A smaller image than the field fades into the sky's level at its border.
const softEdgeOf = (render) => render.discFieldRatio > 1;

function processedKey(src, render) {
  return `${src}|${render.cutoff}|${render.gain}|${render.softness}|${render.skyFill ?? ""}|${softEdgeOf(render)}`;
}

// The image drawn through the render once per source and render, kept for
// the next card that shows it (a list re-renders often; the pixels do not
// change).
function processSource(image, src, render) {
  const key = processedKey(src, render);
  const kept = processed.get(key);
  if (kept) return kept;
  const canvas = document.createElement("canvas");
  canvas.width = workingSide;
  canvas.height = workingSide;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, workingSide, workingSide);
  const pixels = context.getImageData(0, 0, workingSide, workingSide);
  const background = paintEyepiecePixels(
    pixels.data,
    workingSide,
    workingSide,
    render,
    pixels.data,
    { softEdge: softEdgeOf(render) },
  );
  context.putImageData(pixels, 0, 0);
  const result = { canvas, background };
  processed.set(key, result);
  if (processed.size > processedLimit)
    processed.delete(processed.keys().next().value);
  return result;
}

function drawDisc(canvas, source, render) {
  const side = Math.max(
    1,
    Math.round(canvas.clientWidth * (window.devicePixelRatio || 1)),
  );
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, side, side);
  context.save();
  context.beginPath();
  context.arc(side / 2, side / 2, side / 2, 0, Math.PI * 2);
  context.clip();
  const sky = Number.isFinite(render.skyFill) ? render.skyFill : null;
  const grey = sky ?? source.background;
  context.fillStyle = `rgb(${grey}, ${grey}, ${grey})`;
  context.fillRect(0, 0, side, side);
  const layout = eyepieceDiscLayout(render.discFieldRatio);
  context.imageSmoothingQuality = "high";
  context.drawImage(
    source.canvas,
    layout.offset * side,
    layout.offset * side,
    layout.side * side,
    layout.side * side,
  );
  // A disc at the sky's level: the vignette and the field stop's ring.
  if (sky !== null) {
    const shading = context.createRadialGradient(
      side / 2,
      side / 2,
      0,
      side / 2,
      side / 2,
      side / 2,
    );
    for (const stop of eyepieceDiscShading())
      shading.addColorStop(stop.offset, `rgba(0, 0, 0, ${stop.alpha})`);
    context.fillStyle = shading;
    context.fillRect(0, 0, side, side);
  }
  context.restore();
}

// The disc at the sky's level, nothing in it: while the field image is
// awaited, or when it did not come and there is no thumbnail to stand in.
function drawEmptyDisc(canvas, render) {
  const side = Math.max(
    1,
    Math.round(canvas.clientWidth * (window.devicePixelRatio || 1)),
  );
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, side, side);
  context.save();
  context.beginPath();
  context.arc(side / 2, side / 2, side / 2, 0, Math.PI * 2);
  context.clip();
  const grey = Number.isFinite(render.skyFill) ? render.skyFill : 12;
  context.fillStyle = `rgb(${grey}, ${grey}, ${grey})`;
  context.fillRect(0, 0, side, side);
  const shading = context.createRadialGradient(
    side / 2,
    side / 2,
    0,
    side / 2,
    side / 2,
    side / 2,
  );
  for (const stop of eyepieceDiscShading())
    shading.addColorStop(stop.offset, `rgba(0, 0, 0, ${stop.alpha})`);
  context.fillStyle = shading;
  context.fillRect(0, 0, side, side);
  context.restore();
}

/**
 * The disc. `view` is `useEyepieceView`'s answer; `fallback` is today's
 * image, shown when the source cannot be read (a failed load, a picture
 * from another origin the canvas may not read). With `fieldFirst` (the
 * target sheet's « Prévisualiser »), the thumbnail is asked for only when
 * the field image did not come, the empty disc standing meanwhile; without
 * a thumbnail (`src` empty) the empty disc stays.
 */
export function EyepieceViewImage({
  src,
  view,
  label,
  className = "",
  fallback = null,
  onError,
  onDrawn,
  // Told when the field image does not come (the thumbnail may still be
  // drawn): « Prévisualiser » says it when the browser is offline.
  onFieldError,
  // Told once the disc is final for this source: drawn from the field image or
  // the thumbnail, left empty, or given up for the `fallback`. « Prévisualiser »
  // shows its loading icon until then (TARGET-STATS-SKY-PLACE-01).
  onSettled,
  fieldFirst = false,
}) {
  const canvasRef = useRef(null);
  const [state, setState] = useState("waiting");
  const [drawnSource, setDrawnSource] = useState(null);
  const render = view.render;
  const fieldSrc = view.fieldImage?.path || null;
  const fieldRender = fieldSrc
    ? { ...render, discFieldRatio: view.fieldImage.discFieldRatio }
    : null;
  const renderKey = `${processedKey(src, render)}|${fieldSrc ?? ""}|${fieldFirst}`;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let cancelled = false;
    let fieldDrawn = false;
    let fieldSettled = !fieldSrc;
    let thumbnailFailed = false;
    let graceTimer = null;
    const draw = (image, imageSrc, imageRender, kind) => {
      if (cancelled) return;
      try {
        drawDisc(
          canvas,
          processSource(image, imageSrc, imageRender),
          imageRender,
        );
        setState("drawn");
        setDrawnSource(kind);
        onDrawn?.();
        onSettled?.();
      } catch {
        // A canvas tainted by a foreign image cannot be read: the image as
        // it is, never an unprocessed picture in the disc.
        if (kind === "thumbnail") {
          setState("unreadable");
          onSettled?.();
        }
      }
    };
    const fail = () => {
      if (cancelled || fieldDrawn || !thumbnailFailed || !fieldSettled) return;
      setState("failed");
      onError?.();
      onSettled?.();
    };
    const request = (imageSrc, onload, onerror) => {
      const image = new Image();
      image.decoding = "async";
      image.crossOrigin = "anonymous";
      image.referrerPolicy = "no-referrer";
      image.onload = () => onload(image);
      image.onerror = onerror;
      image.src = imageSrc;
    };
    const loadThumbnail = () => {
      if (!src && fieldFirst) {
        // Nothing to stand in: the empty disc stays.
        if (!cancelled) {
          drawEmptyDisc(canvas, fieldRender ?? render);
          setState("empty");
          onSettled?.();
        }
        return;
      }
      request(
        src,
        (image) => {
          const drawThumbnail = () => {
            if (!fieldDrawn) draw(image, src, render, "thumbnail");
          };
          if (fieldSettled) drawThumbnail();
          else graceTimer = setTimeout(drawThumbnail, fieldGraceMs);
        },
        () => {
          thumbnailFailed = true;
          fail();
        },
      );
    };
    const awaitField = fieldFirst && Boolean(fieldSrc);
    const load = () => {
      if (awaitField) drawEmptyDisc(canvas, fieldRender);
      else loadThumbnail();
      if (fieldSrc)
        request(
          fieldSrc,
          (image) => {
            fieldSettled = true;
            clearTimeout(graceTimer);
            fieldDrawn = true;
            draw(image, fieldSrc, fieldRender, "field");
          },
          () => {
            fieldSettled = true;
            if (!cancelled) onFieldError?.();
            if (awaitField) loadThumbnail();
            fail();
          },
        );
    };
    // A view off screen computes nothing: the source is loaded and drawn
    // when the disc comes near the viewport.
    if (typeof IntersectionObserver !== "function") {
      load();
      return () => {
        cancelled = true;
        clearTimeout(graceTimer);
      };
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        load();
      },
      { rootMargin: "200px" },
    );
    observer.observe(canvas);
    return () => {
      cancelled = true;
      clearTimeout(graceTimer);
      observer.disconnect();
    };
    // The render's numbers are in `renderKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderKey]);

  if (state === "unreadable" || state === "failed") return fallback;
  return (
    <canvas
      ref={canvasRef}
      className={`planner-eyepiece-view ${className}`.trim()}
      role="img"
      aria-label={label}
      data-eyepiece-view={view.kind}
      data-eyepiece-state={state}
      data-eyepiece-cutoff={render.cutoff.toFixed(3)}
      data-eyepiece-gain={render.gain.toFixed(3)}
      data-eyepiece-disc-ratio={render.discFieldRatio.toFixed(3)}
      data-eyepiece-source={drawnSource ?? undefined}
    />
  );
}
