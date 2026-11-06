"use client";

import { useEffect, useRef, useState } from "react";
import { decimalComma, message } from "portal/i18n.js";
import { useSkyAnnotations } from "../../hooks/useSkyAnnotations.js";
import { magnitudes, PlateOverlay } from "./PlateOverlay.js";
import { ViewerTip } from "../detail/ViewerTip.js";

/**
 * The viewer of a capture's page with its sky annotations, shared by the
 * public gallery's page and the private gallery's: the round button of the
 * viewer — « Afficher les annotations du ciel » — shown only for an image that
 * has a sky solution (the gallery's view carries `skySolution` only then, and
 * only while the owner's switch is on), the magnitude selector and the overlay
 * once they are shown. Nothing here names a solution, a plate solving or Astro
 * Sync: a visitor reads « annotations du ciel ».
 *
 * `solution` is the shown image's `skySolution` (or `null`), `imageKey` the
 * image's id (the annotations are dropped when another image is shown),
 * `target` what the overlay needs to find the capture's own target
 * (`{ title, objects }`). `children` is the image itself: it receives
 * `{ imageRef, canvasRef, overlay }`.
 */
export function useCaptureAnnotations({ solution, imageKey }) {
  const [magnitude, setMagnitude] = useState(5.5);
  // The selector is a real one: the page asks the server for the batch of
  // stars of its threshold (`useSkyAnnotations`).
  const plate = useSkyAnnotations(solution?.annotations ?? null, magnitude);
  const clear = plate.clear;
  useEffect(() => {
    clear();
    // The annotations belong to one image: another one starts without.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageKey]);
  const active = plate.state === "ready";
  useEffect(() => {
    document.body.classList.toggle("plate-solving-mobile-active", active);
    return () => document.body.classList.remove("plate-solving-mobile-active");
  }, [active]);
  return {
    plate,
    magnitude,
    setMagnitude,
    active,
    // False when the server has no star catalogue: no selector, a sentence.
    starsAvailable: plate.starsAvailable,
  };
}

/**
 * The round button (`.plate-solve`): shows or hides the annotations. Its name
 * follows its state — « Afficher les annotations du ciel », then « Masquer
 * les annotations du ciel » — in the tooltip and for a screen reader; the
 * short label under the icon (a phone) stays « Annotations ».
 */
export function SkyAnnotationsButton({ plate, locale = "en" }) {
  const shown = plate.state === "ready";
  const name = message(
    locale,
    shown ? "hideSkyAnnotations" : "toggleSkyAnnotations",
  );
  return (
    <ViewerTip label={name}>
      {(tip) => (
        <button
          type="button"
          className={`plate-solve ${plate.state === "running" ? "is-loading" : shown ? "is-active" : plate.state === "failed" ? "is-failed" : ""}`}
          disabled={plate.state === "running"}
          onClick={plate.toggle}
          aria-label={name}
          {...tip}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="5.5" />
            <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" />
          </svg>
        </button>
      )}
    </ViewerTip>
  );
}

/**
 * « Étoiles jusqu'à 6,5 mag »: the faintest star drawn. `unavailable` (the
 * server has no star catalogue: `starsAvailable` false) replaces the selector,
 * which would change nothing, by « Étoiles indisponibles sur ce serveur ».
 */
export function MagnitudeSelect({
  value,
  onChange,
  locale = "en",
  unavailable = false,
}) {
  if (unavailable)
    return (
      <p className="plate-magnitude is-unavailable" role="status">
        {message(locale, "starsUnavailable")}
      </p>
    );
  return (
    <select
      className="plate-magnitude"
      value={value}
      onChange={(event) => onChange(+event.target.value)}
      aria-label={message(locale, "limitingMagnitude")}
    >
      {magnitudes.map((option) => (
        <option key={option} value={option}>
          {option === 99
            ? message(locale, "allCatalogStars")
            : `${message(locale, "starsUpTo")} ${String(option).replace(".", decimalComma(locale) ? "," : ".")} mag`}
        </option>
      ))}
    </select>
  );
}

/**
 * The image of a capture's page, with its overlay once the annotations are
 * shown. `children` is the `<img>`, given `imageRef`.
 */
export function AnnotatedImage({
  controls,
  target,
  locale = "en",
  className = "image-canvas",
  // The viewer's zoom (`ImageZoom.js`) sizes and moves this box, so it holds
  // its ref.
  canvasRef: givenCanvasRef = null,
  children,
}) {
  const imageRef = useRef(null);
  const ownCanvasRef = useRef(null);
  const canvasRef = givenCanvasRef ?? ownCanvasRef;
  return (
    <div className={className} ref={canvasRef}>
      {children(imageRef)}
      {controls.active && (
        <PlateOverlay
          annotations={controls.plate.annotations}
          target={target}
          imageRef={imageRef}
          canvasRef={canvasRef}
          magnitude={controls.magnitude}
          locale={locale}
        />
      )}
    </div>
  );
}

/**
 * What the overlay needs of a capture's first target: its designations, so
 * that the annotation of the capture's own target is the primary one.
 */
export function annotationTarget(capture, title) {
  const first = capture?.targets?.[0] ?? null;
  return {
    title,
    objects: first ? [first.designation, ...(first.aliases || [])] : [],
    localizedAliases: [],
  };
}
