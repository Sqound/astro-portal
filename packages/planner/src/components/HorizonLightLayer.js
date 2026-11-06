"use client";

import { useEffect, useState } from "react";
import { LoadingState } from "portal/components/LoadingState.js";
import { message } from "portal/i18n.js";
import { WebDialog } from "portal/components/dialog/WebDialog.js";
import {
  horizonLightLayerPixels,
  horizonLightLegendGradient,
  horizonLightStrongestDirection,
} from "../horizon-light-layer.js";

// The horizon map's layers on the web: the dialog "Calques" that the chip
// "Calques ▾" opens (`MapControlChips.js`) and the light-pollution layer
// itself, drawn inside the plot's SVG as its first element, under the mask, the
// grid, the path and the targets. The layer is an image computed in the browser
// from the grid of `GET /v1/sky-quality/direction` (`horizonLightLayerPixels`):
// smooth, without the seams of hundreds of translucent cells. Nothing is drawn
// before hydration.

/** The light-pollution layer, as an `<image>` of the plot's user space. */
export function HorizonLightLayerImage({ grid, projection, rotation }) {
  const circular = projection === "circular";
  const [href, setHref] = useState(null);
  useEffect(() => {
    if (!grid || typeof document === "undefined") {
      setHref(null);
      return;
    }
    const { width, height, pixels } = horizonLightLayerPixels(grid, {
      projection,
      rotation,
      // Twice the user space: the browser's smoothing does the rest.
      width: circular ? 400 : 720,
      height: circular ? 400 : 180,
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext?.("2d");
    if (!context) return;
    context.putImageData(new ImageData(pixels, width, height), 0, 0);
    setHref(canvas.toDataURL("image/png"));
  }, [grid, projection, rotation, circular]);
  if (!href) return null;
  return (
    <image
      className="planner-horizon-light-layer"
      href={href}
      x="0"
      y="0"
      width={circular ? 200 : 360}
      height={circular ? 200 : 90}
      preserveAspectRatio="none"
      aria-hidden="true"
    />
  );
}

/** The plot's spoken description of the layer, or "" when nothing is tinted. */
export function horizonLightDescription(locale, grid) {
  const point = horizonLightStrongestDirection(grid);
  if (!point) return "";
  return message(locale, "horizonLayerStrongest").replace(
    "{toward}",
    message(locale, `horizonLayerToward${point}`),
  );
}

function LayerSwitch({ label, detail, on, disabled, onChange, children }) {
  return (
    <li>
      <button
        type="button"
        role="switch"
        className={`planner-horizon-layer-switch${on ? " is-active" : ""}`}
        aria-checked={on}
        disabled={disabled}
        onClick={() => onChange(!on)}
      >
        <span className="planner-horizon-layer-text">
          {label}
          {detail}
        </span>
        <span className="planner-horizon-layer-track" aria-hidden="true">
          <span />
        </span>
      </button>
      {children}
    </li>
  );
}

/**
 * The dialog "Calques": the horizon mask of the place, the light pollution
 * by direction (an estimate) with its legend, the reason in one line under a
 * greyed switch. A click outside or the cross "Fermer les calques" closes
 * it. `light` is `horizonLightLayerState`'s answer.
 */
export function HorizonLayersPanel({
  locale,
  onClose,
  maskOn,
  maskLabel,
  onMaskChange,
  light,
  onLightChange,
}) {
  return (
    <WebDialog
      className="planner-horizon-layers"
      closeLabel={message(locale, "horizonLayersClose")}
      closeOnBackdrop
      onClose={onClose}
      title={message(locale, "horizonLayers")}
      titleAs="h3"
    >
      <ul>
        <LayerSwitch
          label={message(locale, "horizonLayerMask")}
          detail={
            <small>{maskLabel || message(locale, "targetPathNoMask")}</small>
          }
          on={Boolean(maskLabel) && maskOn}
          disabled={!maskLabel}
          onChange={onMaskChange}
        />
        <LayerSwitch
          label={message(locale, "horizonLayerLightPollution")}
          detail={
            <small className="planner-horizon-layer-estimate">
              {message(locale, "horizonLayerEstimate")}
            </small>
          }
          on={light.enabled}
          disabled={!light.available}
          onChange={onLightChange}
        >
          {!light.available ? (
            <p className="planner-horizon-layer-reason" role="note">
              {message(locale, "horizonLayerUnavailable")}
            </p>
          ) : light.enabled ? (
            <div className="planner-horizon-layer-legend">
              <div
                aria-hidden="true"
                style={{ background: horizonLightLegendGradient }}
              />
              <p>
                <span>{message(locale, "horizonLayerDarker")}</span>
                <span>{message(locale, "horizonLayerBrighter")}</span>
              </p>
              {light.loading && (
                <LoadingState
                  layout="inline"
                  className="planner-horizon-layer-reason"
                >
                  {message(locale, "horizonLayerLoading")}
                </LoadingState>
              )}
            </div>
          ) : null}
        </LayerSwitch>
      </ul>
    </WebDialog>
  );
}
