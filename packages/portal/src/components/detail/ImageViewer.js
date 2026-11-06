"use client";

import { useEffect, useRef, useState } from "react";
import { formatCaptureDate } from "portal/format.js";
import { magnitudes, PlateOverlay } from "../plate-solving/PlateOverlay.js";
import { usePlateSolve } from "../../hooks/usePlateSolve.js";
import { decimalComma, message } from "portal/i18n.js";
import {
  ImagePagination,
  ProgressionPlaybackStatus,
} from "./ProgressionPlayer.js";

const Icon = ({ children }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    {children}
  </svg>
);

export function ImageViewer({
  target,
  asset,
  assets,
  onSelect,
  playing,
  progressionMode,
  onExitProgression,
  locale = "en",
}) {
  const imageRef = useRef(null),
    canvasRef = useRef(null),
    [magnitude, setMagnitude] = useState(5.5),
    [dimensions, setDimensions] = useState("");
  const plate = usePlateSolve(target, asset);
  useEffect(() => plate.clear(), [asset.assetId]);
  useEffect(() => {
    const active = plate.state === "ready";
    document.body.classList.toggle("plate-solving-mobile-active", active);
    return () => document.body.classList.remove("plate-solving-mobile-active");
  }, [plate.state]);
  const index = assets.findIndex((item) => item.assetId === asset.assetId);
  const instrument =
    asset.kind === "sky-map"
      ? message(locale, "stellariumMap")
      : asset.legendLabel ||
        asset.pipelineName ||
        (asset.renderFamily
          ? asset.variant
          : target.equipment?.Télescope?.split(" - ")[0] ||
            target.equipment?.Instrument);
  const stellariumSource = target.stellarium?.source || target.objects?.[0],
    fov = target.stellarium?.fov || 3.34;
  return (
    <section
      className={`image-area${plate.state === "ready" ? " is-plate-solving" : ""}${progressionMode ? " is-progression" : ""}`}
    >
      <div className="viewer-bar">
        <a
          className="close"
          href={`/${locale}`}
          aria-label={message(locale, "backToGallery")}
        >
          <Icon>
            <path d="M6 6 18 18M18 6 6 18" />
          </Icon>
        </a>
        {asset.imageUrl &&
          target.category !== "Soleil" &&
          asset.kind !== "sky-map" && (
            <button
              className={`plate-solve ${plate.state === "running" ? "is-loading" : plate.state === "ready" ? "is-active" : plate.state === "failed" ? "is-failed" : ""}`}
              disabled={plate.state === "running"}
              onClick={plate.toggle}
              aria-label={message(locale, "toggleSkyAnnotations")}
            >
              <Icon>
                <circle cx="12" cy="12" r="5.5" />
                <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" />
              </Icon>
            </button>
          )}
        {stellariumSource && (
          <button
            className="stellarium-link"
            onClick={() =>
              window.open(
                `https://stellarium-web.org/skysource/${encodeURIComponent(stellariumSource)}?fov=${fov}`,
                "_blank",
                "noopener,noreferrer",
              )
            }
            aria-label={message(locale, "openStellarium")}
          >
            <Icon>
              <circle cx="12" cy="12" r="7.5" />
              <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22" />
            </Icon>
          </button>
        )}
        {asset.imageUrl && (
          <a
            className="image-fullscreen"
            href={`/${locale}/full/${encodeURIComponent(target.id)}/${encodeURIComponent(asset.assetId)}`}
            aria-label={message(locale, "showImageOnly")}
          >
            <Icon>
              <path d="M8.5 3.5h-5v5M15.5 3.5h5v5M20.5 15.5v5h-5M3.5 15.5v5h5" />
            </Icon>
          </a>
        )}
      </div>
      {plate.state === "ready" && (
        <select
          className="plate-magnitude"
          value={magnitude}
          onChange={(event) => setMagnitude(+event.target.value)}
          aria-label={message(locale, "limitingMagnitude")}
        >
          {magnitudes.map((value) => (
            <option key={value} value={value}>
              {value === 99
                ? message(locale, "allCatalogStars")
                : `${message(locale, "starsUpTo")} ${String(value).replace(".", decimalComma(locale) ? "," : ".")} mag`}
            </option>
          ))}
        </select>
      )}
      <button
        className="asset-nav asset-nav-prev"
        disabled={index <= 0}
        onClick={() => onSelect(assets[index - 1].assetId)}
        aria-label={message(locale, "previousVersion")}
      >
        <Icon>
          <path d="m14.5 5-7 7 7 7" />
        </Icon>
      </button>
      <button
        className="asset-nav asset-nav-next"
        disabled={index >= assets.length - 1}
        onClick={() => onSelect(assets[index + 1].assetId)}
        aria-label={message(locale, "nextVersion")}
      >
        <Icon>
          <path d="m9.5 5 7 7-7 7" />
        </Icon>
      </button>
      <div className="image-frame">
        <div className="image-canvas" ref={canvasRef}>
          {playing && asset.kind === "progression" && (
            <ProgressionPlaybackStatus
              label={asset.progressionLabel}
              locale={locale}
            />
          )}
          {asset.imageUrl ? (
            <img
              ref={imageRef}
              src={asset.imageUrl}
              alt={`${target.title} — ${asset.variant}`}
              onLoad={(event) =>
                setDimensions(
                  `${event.currentTarget.naturalWidth} × ${event.currentTarget.naturalHeight} px`,
                )
              }
            />
          ) : (
            <p>{message(locale, "noImage")}</p>
          )}
          {plate.state === "ready" && (
            <PlateOverlay
              annotations={plate.annotations}
              target={target}
              imageRef={imageRef}
              canvasRef={canvasRef}
              magnitude={magnitude}
              locale={locale}
            />
          )}
        </div>
        <div className="image-legend">
          {[asset.date && formatCaptureDate(asset.date), instrument, dimensions]
            .filter(Boolean)
            .join(" · ")}
        </div>
        <ImagePagination
          ids={assets.map((item) => item.assetId)}
          activeId={asset.assetId}
          label={`${message(locale, "version")} ${index + 1} ${message(locale, "of")} ${assets.length}`}
          progression={progressionMode}
          onExit={onExitProgression}
          locale={locale}
        />
      </div>
    </section>
  );
}
