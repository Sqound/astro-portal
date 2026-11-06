"use client";

import { targetImageVariant } from "portal/target-image-variants.js";
import { useState } from "react";
import { ObjectPictogram } from "portal/components/ObjectPictogram.js";
import {
  EyepieceViewImage,
  eyepieceViewCaption,
  eyepieceViewLabel,
  useEyepieceSetting,
  useEyepieceView,
} from "./EyepieceViewImage.js";

// The preview of a target in the planner's cards and in the suggestion dialog:
// its image (a link to Stellarium when the caller gives one), and where the
// image is missing or failed the pictogram of its type, never a letter or a
// planet preview.

export function TargetVisual({
  target,
  previewUrl,
  stellariumUrl,
  label,
  className = "",
  visualMode = false,
  locale = "fr",
  namedPictogram = false,
  // `false` for a thumbnail too small to hold words (a row of the suggestion
  // dialog): the image alone, the caption of the simulation and the credit said
  // once by the list, not inside every thumbnail.
  caption = true,
}) {
  const {
    url: image,
    credit,
    source,
  } = targetImageVariant(target, {
    visualMode,
    fallback: previewUrl,
  });
  const [failed, setFailed] = useState(false);
  // In visual mode, the eyepiece view in a disc inside the same square,
  // said as a simulation; today's image without a setting.
  const eyepiece = useEyepieceView(target, { visualMode, imageSource: source });
  // The page's language for the simulation's words: not every caller passes
  // `locale` to this thumbnail.
  const { locale: eyepieceLocale } = useEyepieceSetting();
  const media = (
    <img
      src={image}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
  const name = target?.title || target?.designation || "";
  // A disc at the default field (setting incomplete) claims no simulation.
  const simulated = eyepiece?.kind !== "default";
  const visual =
    image && !failed && eyepiece ? (
      <span className={`planner-target-media is-eyepiece ${className}`.trim()}>
        <EyepieceViewImage
          src={image}
          view={eyepiece}
          label={simulated ? eyepieceViewLabel(eyepieceLocale, name) : name}
          fallback={media}
          onError={() => setFailed(true)}
        />
        {caption && (simulated || credit) && (
          <span
            className="planner-target-media-credit"
            title={[simulated && eyepieceViewCaption(eyepieceLocale), credit]
              .filter(Boolean)
              .join(" ")}
          >
            {simulated ? eyepieceViewCaption(eyepieceLocale) : credit}
          </span>
        )}
      </span>
    ) : image && !failed ? (
      <span className={`planner-target-media ${className}`.trim()}>
        {media}
        {caption && credit && (
          <span className="planner-target-media-credit" title={credit}>
            {credit}
          </span>
        )}
      </span>
    ) : (
      // A real image always wins; where it is missing or failed, the
      // pictogram of the object's type, never a letter.
      <div className={`planner-target-visual ${className}`.trim()}>
        <ObjectPictogram
          target={target}
          size="73%"
          named={namedPictogram}
          locale={locale}
        />
      </div>
    );
  return stellariumUrl ? (
    <a
      className="planner-target-link"
      href={stellariumUrl}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      title={label}
    >
      {visual}
      <span className="planner-target-link-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="6.5" />
          <circle cx="12" cy="12" r="1.4" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
      </span>
    </a>
  ) : (
    visual
  );
}
