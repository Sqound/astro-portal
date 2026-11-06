"use client";

import { useEffect, useState } from "react";
import { message } from "portal/i18n.js";
import { BrandLoader } from "../BrandLoader.js";

/**
 * The images of a capture in its gallery page, drawn like the catalogue's
 * viewer (`ImageViewer.js`): an arrow on each side of the image area, the
 * dots under the image (`ImagePagination`, `ProgressionPlayer.js`), and a
 * dark band under the image that names the image shown and carries its
 * description. The arrows stop at
 * the first and the last image, as in the catalogue.
 *
 * `images` come from `shownImages` (`captures/image-names.js`): the main
 * image first, then the public variants — and, in the owner's private
 * gallery, the others too, each with `private: true` and the badge
 * « privée » in the band (`CaptureImageBand`'s `privateLabel`).
 */

const Chevron = ({ d }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d={d} />
  </svg>
);

/** « Image 2 sur 4 ». */
export const imagePositionLabel = (index, count, locale = "en") =>
  message(locale, "imagePosition")
    .replace("{index}", String(index + 1))
    .replace("{count}", String(count));

export function CaptureImageArrows({ images, index, onSelect, locale = "en" }) {
  if (images.length < 2) return null;
  return (
    <>
      <button
        type="button"
        className="asset-nav asset-nav-prev"
        disabled={index <= 0}
        onClick={() => onSelect(images[index - 1].id)}
        aria-label={message(locale, "imagePrevious")}
        title={message(locale, "imagePrevious")}
      >
        <Chevron d="m14.5 5-7 7 7 7" />
      </button>
      <button
        type="button"
        className="asset-nav asset-nav-next"
        disabled={index >= images.length - 1}
        onClick={() => onSelect(images[index + 1].id)}
        aria-label={message(locale, "imageNext")}
        title={message(locale, "imageNext")}
      >
        <Chevron d="m9.5 5 7 7-7 7" />
      </button>
    </>
  );
}

/**
 * The dark band under the image: the image's name (only when the capture
 * shows several) and the caption (the month · the pixel size), in small type.
 * The image's description is in the details panel, never here. The band is as
 * wide as the image and never widens the frame, so the image stays centred
 * whatever the text.
 */
export function CaptureImageBand({
  name = null,
  caption,
  privateLabel = null,
}) {
  if (!name && !caption) return null;
  return (
    <div className="capture-image-band">
      <div className="image-legend">
        {name ? <strong className="capture-image-name">{name}</strong> : null}
        {name && privateLabel ? (
          <>
            {" "}
            <span className="capture-image-private" data-testid="image-private">
              {privateLabel}
            </span>
          </>
        ) : null}
        {name && caption ? " · " : null}
        {caption}
      </div>
    </div>
  );
}

/**
 * The image a page draws while another one loads: `src` is the image asked
 * for, `drawn` the one on screen. When `src` changes the old image is hidden
 * and `loading` is true until the new one is decoded; then `drawn` becomes
 * `src`, and the browser paints it at once from its cache. A failed image
 * ends the wait too (the browser then shows its broken image, as before).
 */
export function useImageSwap(src) {
  const [drawn, setDrawn] = useState(src);
  useEffect(() => {
    if (!src) return;
    if (!drawn) {
      setDrawn(src);
      return;
    }
    if (src === drawn) return;
    let current = true;
    const done = () => {
      if (current) setDrawn(src);
    };
    const probe = new Image();
    probe.decoding = "async";
    probe.src = src;
    if (typeof probe.decode === "function") probe.decode().then(done, done);
    else {
      probe.onload = done;
      probe.onerror = done;
    }
    return () => {
      current = false;
    };
  }, [src, drawn]);
  return imageSwapState(src, drawn);
}

/**
 * What the page draws for the image asked for (`src`) and the one on screen
 * (`drawn`): the image to keep in the `<img>` and whether the star stands
 * in its place. Pure, so that a test reads it.
 */
export function imageSwapState(src, drawn) {
  if (!src || !drawn || src === drawn)
    return { drawn: src || drawn || null, loading: false };
  return { drawn, loading: true };
}

/** The star of the portal over the image's place while it loads. */
export function CaptureImageLoading({ locale = "en" }) {
  return (
    <span className="capture-image-loading" role="status">
      <BrandLoader className="capture-image-loader" size={56} />
      <span className="visually-hidden">{message(locale, "imageLoading")}</span>
    </span>
  );
}
