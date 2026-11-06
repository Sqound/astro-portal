"use client";

import { taxonomyLabel } from "astro-core/catalog-taxonomy.js";
import { targetImageVariant } from "../target-image-variants.js";
import { useState } from "react";
import {
  objectPictogramKey,
  objectTypeOf,
} from "astro-core/object-pictograms.js";

// The pictogram of an object's type:
// ten figures on one 48-unit grid, a 1.8 unit stroke and a light fill.
// The figure is chosen by `objectPictogramKey` (astro-core, held by the
// fixture `object-pictogram.json`); a type the taxonomy does not hold, and no
// type, draw the star. A real thumbnail always wins: callers draw the
// pictogram only where the image is missing or failed.
//
// Colour: the gold of the surface, or the text colour of the pill it stands
// in (`color` of the parent). Red mode: `html[data-night-mode="on"]` removes
// the light fill (`[data-light-fill]`), the stroke stays.

const accent = "currentColor";

// The loading star, still: the outline of its four long branches and four
// short ones at 45 degrees (`AstroStarPainter` at morph 1, a little smaller
// so the stroke fits the 48 grid), one closed path.
const starFigurePath =
  "M22.61 21.58Q23.8 15.96 24 2.16Q24.2 15.96 25.39 21.58Q28.14 19.69 32.71 15.29Q28.31 19.86 26.42 22.61Q32.04 23.8 45.84 24Q32.04 24.2 26.42 25.39Q28.31 28.14 32.71 32.71Q28.14 28.31 25.39 26.42Q24.2 32.04 24 45.84Q23.8 32.04 22.61 26.42Q19.86 28.31 15.29 32.71Q19.69 28.14 21.58 25.39Q15.96 24.2 2.16 24Q15.96 23.8 21.58 22.61Q19.69 19.86 15.29 15.29Q19.86 19.69 22.61 21.58Z";

const figures = {
  galaxy: () => (
    <>
      <g transform="rotate(-28 24 24)">
        <ellipse
          cx="24"
          cy="24"
          rx="19"
          ry="7.5"
          fill={accent}
          fillOpacity=".14"
          stroke={accent}
          strokeWidth="1.8"
          data-light-fill=""
        />
        <ellipse
          cx="24"
          cy="24"
          rx="9"
          ry="3.6"
          fill={accent}
          fillOpacity=".35"
          stroke="none"
          data-light-fill=""
        />
      </g>
      <circle cx="24" cy="24" r="2.2" fill={accent} stroke="none" />
    </>
  ),
  "open-cluster": () => (
    <g fill={accent} stroke="none">
      <circle cx="14" cy="14" r="2.4" />
      <circle cx="26" cy="10" r="1.8" />
      <circle cx="35" cy="17" r="2.6" />
      <circle cx="20" cy="24" r="2" />
      <circle cx="31" cy="30" r="2.2" />
      <circle cx="13" cy="33" r="1.8" />
      <circle cx="24" cy="38" r="2.4" />
      <circle cx="38" cy="36" r="1.4" />
    </g>
  ),
  "globular-cluster": () => (
    <>
      <circle
        cx="24"
        cy="24"
        r="18"
        fill="none"
        stroke={accent}
        strokeOpacity=".45"
        strokeDasharray="2 3"
      />
      <g fill={accent} stroke="none">
        <circle cx="24" cy="24" r="6" fillOpacity=".5" data-light-fill="" />
        <circle cx="18" cy="20" r="1.5" />
        <circle cx="29" cy="19" r="1.5" />
        <circle cx="21" cy="29" r="1.5" />
        <circle cx="30" cy="28" r="1.5" />
        <circle cx="24" cy="15" r="1.2" />
        <circle cx="14" cy="26" r="1.2" />
        <circle cx="34" cy="24" r="1.2" />
        <circle cx="24" cy="33" r="1.2" />
        <circle cx="24" cy="24" r="2" />
      </g>
    </>
  ),
  "emission-nebula": () => (
    <>
      <path
        d="M12 28c-5-6 0-15 8-14 3-6 12-6 15 0 7 0 10 8 4 13-2 6-10 8-14 4-5 3-11 1-13-3z"
        fill={accent}
        fillOpacity=".28"
        stroke={accent}
        strokeWidth="1.8"
        data-light-fill=""
      />
      <g fill={accent} stroke="none">
        <circle cx="20" cy="22" r="1.4" />
        <circle cx="30" cy="26" r="1.4" />
        <circle cx="26" cy="19" r="1" />
      </g>
    </>
  ),
  "planetary-nebula": () => (
    <>
      <circle
        cx="24"
        cy="24"
        r="13"
        fill="none"
        stroke={accent}
        strokeWidth="3.2"
      />
      <circle
        cx="24"
        cy="24"
        r="19"
        fill="none"
        stroke={accent}
        strokeOpacity=".4"
        strokeDasharray="2 3"
      />
      <circle cx="24" cy="24" r="2.4" fill={accent} stroke="none" />
    </>
  ),
  "dark-nebula": () => (
    <>
      <g fill={accent} stroke="none">
        <circle cx="8" cy="10" r="1.2" />
        <circle cx="40" cy="12" r="1.4" />
        <circle cx="10" cy="38" r="1.4" />
        <circle cx="38" cy="40" r="1.2" />
        <circle cx="24" cy="6" r="1" />
        <circle cx="43" cy="26" r="1" />
        <circle cx="5" cy="24" r="1" />
      </g>
      <path
        d="M14 16c6-6 16-4 19 3 3 7-2 15-10 15-9 0-14-11-9-18z"
        fill="#05070a"
        stroke={accent}
        strokeWidth="1.8"
        strokeDasharray="4 3"
        data-light-fill=""
      />
    </>
  ),
  planet: () => (
    <>
      <circle
        cx="24"
        cy="24"
        r="9"
        fill={accent}
        fillOpacity=".35"
        stroke={accent}
        strokeWidth="1.8"
        data-light-fill=""
      />
      <ellipse
        cx="24"
        cy="24"
        rx="19"
        ry="5.5"
        fill="none"
        stroke={accent}
        strokeWidth="1.8"
        transform="rotate(-20 24 24)"
      />
    </>
  ),
  moon: () => (
    <path
      d="M32 8a17 17 0 1 0 8 29A14 14 0 0 1 32 8z"
      fill={accent}
      fillOpacity=".3"
      stroke={accent}
      strokeWidth="1.8"
      data-light-fill=""
    />
  ),
  comet: () => (
    <>
      <circle
        cx="34"
        cy="14"
        r="5"
        fill={accent}
        fillOpacity=".5"
        stroke={accent}
        strokeWidth="1.8"
        data-light-fill=""
      />
      <path
        d="M30 18C22 24 14 32 6 40M32 19C28 28 22 36 15 44M36 19C36 28 34 36 30 44"
        fill="none"
        stroke={accent}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeOpacity=".8"
      />
    </>
  ),
  star: () => (
    <path
      d={starFigurePath}
      fill={accent}
      fillOpacity=".28"
      stroke={accent}
      strokeWidth="1.8"
      data-light-fill=""
    />
  ),
};

/** The pictogram keys the component can draw (the ten figures). */
export const objectPictogramFigureKeys = Object.keys(figures);

/**
 * The accessible name of a target's pictogram where it stands alone: the
 * type's word in the reader's language; an unrecognised type its own text; no
 * type, none (the figure is decorative).
 */
export function objectPictogramName(target, locale) {
  const type = objectTypeOf(target).trim();
  if (!type) return "";
  return taxonomyLabel(type, locale);
}

/**
 * One figure of `size` pixels. `target` is a target (or a type text);
 * `pictogramKey` a figure's key directly. Without `named`, the figure is
 * decorative (`aria-hidden`): its row writes the type itself.
 */
export function ObjectPictogram({
  target,
  pictogramKey,
  size = 32,
  named = false,
  locale = "fr",
  className = "",
}) {
  const key = pictogramKey || objectPictogramKey(target);
  const Figure = figures[key] || figures.star;
  const name = named ? objectPictogramName(target, locale) : "";
  return (
    <svg
      className={`object-pictogram ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      data-object-pictogram={figures[key] ? key : "star"}
      {...(name
        ? { role: "img", "aria-label": name }
        : { "aria-hidden": "true" })}
    >
      <Figure />
    </svg>
  );
}

/**
 * The tile of a row (`ObjectPictograms` frame 3): the target's thumbnail when
 * it has one, the figure of its type in its place when the image is missing
 * or failed (never a grey box). The tile is 44 pixels, its figure 32 of them;
 * `named` gives the figure the type's word where the row does not write the
 * type. With `onOpen`, a real image is a button named `openLabel` that hands
 * `{ url, credit }` to `onOpen` (the target's full-screen photo); the
 * pictogram opens nothing.
 */
export function TargetTile({
  target,
  className = "",
  named = false,
  locale = "fr",
  visualMode = false,
  previewUrl,
  onOpen,
  openLabel,
}) {
  const { url, credit } = targetImageVariant(target, {
    visualMode,
    fallback: previewUrl,
  });
  const [failed, setFailed] = useState(false);
  const classes = `object-pictogram-frame ${className}`.trim();
  const image = url && !failed && (
    <img
      src={url}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
  // A real photo opens the target's full-screen
  // photo when the caller gives `onOpen`; the pictogram opens nothing (there
  // is nothing more to look at).
  if (image && onOpen)
    return (
      <button
        type="button"
        className={`${classes} has-image target-photo-open`}
        aria-label={openLabel}
        title={openLabel}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpen({ url, credit });
        }}
      >
        {image}
      </button>
    );
  if (image) return <span className={`${classes} has-image`}>{image}</span>;
  return (
    <span className={classes}>
      <ObjectPictogram
        target={target}
        named={named}
        locale={locale}
        size="73%"
      />
    </span>
  );
}

/**
 * An image of a row with the pictogram of the target's type in its place when
 * the image is missing or fails (`ObjectPictograms`, G-5 and the journal's
 * rows): a real image always wins, never a broken-image box. `target` carries
 * the catalogue type (`typeKey`); without one the figure is the star.
 */
export function ImageOrPictogram({
  src,
  target,
  locale = "fr",
  named = true,
  className = "",
}) {
  const [failed, setFailed] = useState(false);
  if (src && !failed)
    return (
      <img
        src={src}
        alt=""
        className={className || undefined}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  return (
    <span
      className={`object-pictogram-frame ${className}`.trim()}
      data-pictogram-frame=""
    >
      <ObjectPictogram
        target={target}
        named={named}
        locale={locale}
        size="73%"
      />
    </span>
  );
}
