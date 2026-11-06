"use client";

import { useState } from "react";
import { ObjectPictogram } from "portal/components/ObjectPictogram.js";
import {
  EyepieceViewImage,
  eyepieceViewCaption,
  eyepieceViewLabel,
} from "./EyepieceViewImage.js";

/**
 * The picture of a card of the catalogue, with the figure of the target's
 * type in its place when the picture cannot be loaded (a picture the portal
 * does not hold would otherwise show the browser's broken-image icon). A
 * picture that fails is the same square holding the type's pictogram, with no
 * hover enlargement and no credit -- never a broken-image box.
 *
 * `image`: `{ url, credit }` of `targetImageVariant`; `eyepiece`: the disc of
 * the visual mode, or null.
 */
export function CatalogueCardImage({
  target,
  image,
  eyepiece,
  locale,
  // The credit's longer words, in its tooltip (a constellation's drawing:
  // « Stellarium » on the picture, its author and licence on hover).
  creditTitle = null,
}) {
  const [failedUrl, setFailedUrl] = useState(null);
  const failed = failedUrl === image.url;
  const onError = () => setFailedUrl(image.url);
  if (failed)
    return (
      <span
        className="planner-target-catalogue-image-wrap is-fallback"
        data-catalogue-image-fallback=""
      >
        <span className="planner-target-catalogue-image object-pictogram-frame">
          <ObjectPictogram target={target} size="73%" locale={locale} />
        </span>
      </span>
    );
  return (
    <span className="planner-target-catalogue-image-wrap">
      {eyepiece ? (
        <EyepieceViewImage
          src={image.url}
          view={eyepiece}
          className="planner-target-catalogue-image"
          label={eyepieceViewLabel(locale, target.title)}
          onError={onError}
          fallback={
            <img
              className="planner-target-catalogue-image"
              src={image.url}
              alt=""
              loading="lazy"
              onError={onError}
            />
          }
        />
      ) : (
        <img
          className="planner-target-catalogue-image"
          src={image.url}
          alt=""
          loading="lazy"
          onError={onError}
        />
      )}
      <span className="planner-target-catalogue-image-hover" aria-hidden="true">
        {eyepiece ? (
          <>
            <EyepieceViewImage
              src={image.url}
              view={eyepiece}
              fallback={
                <img src={image.url} alt="" loading="lazy" onError={onError} />
              }
            />
            <span className="planner-eyepiece-view-caption">
              {eyepieceViewCaption(locale)}
            </span>
          </>
        ) : (
          <img src={image.url} alt="" loading="lazy" onError={onError} />
        )}
      </span>
      {(image.credit || eyepiece) && (
        <span
          className="planner-target-catalogue-image-credit"
          title={
            creditTitle ||
            [eyepiece ? eyepieceViewCaption(locale) : null, image.credit]
              .filter(Boolean)
              .join(" ")
          }
        >
          {eyepiece ? eyepieceViewCaption(locale) : image.credit}
        </span>
      )}
    </span>
  );
}
