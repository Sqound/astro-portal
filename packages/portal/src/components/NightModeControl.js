"use client";

import { useEffect, useId, useRef, useState } from "react";
import { message } from "portal/i18n.js";
import {
  applyNightMode,
  nightModeDefaultRelativeLuminance,
  nightModeIntensityPercent,
  nightModeIntensityPreferenceKey,
  nightModeMaxRelativeLuminance,
  nightModeMinRelativeLuminance,
  nightModePreferenceKey,
  readNightMode,
  writeNightModeEnabled,
  writeNightModeIntensity,
} from "portal/night-mode.js";

// The red night mode's control: an icon button of the header (a
// moon, outlined off, filled on) opens a small popover under it: « Affichage »
// with the Jour / Nuit pair, then « Luminosité du mode nuit » and the
// brightness slider, which only works in night mode. Choosing Jour or Nuit
// closes the popover; so do a click outside, Escape and leaving it with the
// keyboard; Escape and a choice give the focus back to the icon.
//
// The setting is this browser's (`localStorage`, never
// synchronised); the filter itself is the root element's (`NightModeFilterDefs`
// and the style sheet), so the popover is filtered with everything else. A
// storage that refuses leaves day mode on load; a choice made in a page whose
// storage refuses still works until the page is left.
const options = (locale) => [
  { night: false, label: message(locale, "nightModeDayOption") },
  { night: true, label: message(locale, "nightModeNightOption") },
];

export function NightModeControl({ locale = "en", onOpen }) {
  const [enabled, setEnabled] = useState(false);
  const [intensity, setIntensity] = useState(nightModeDefaultRelativeLuminance);
  const [open, setOpen] = useState(false);
  const container = useRef(null);
  const trigger = useRef(null);
  const selected = useRef(null);
  const identifier = useId();
  const displayLabelId = `${identifier}-display`;
  const brightnessLabelId = `${identifier}-brightness`;
  const percent = nightModeIntensityPercent(intensity);

  // What this browser kept; and another tab's choice, through `storage`.
  useEffect(() => {
    const follow = () => {
      const current = readNightMode();
      setEnabled(current.enabled);
      setIntensity(current.intensity);
      applyNightMode(current);
    };
    follow();
    const onStorage = (event) => {
      if (
        event.key === null ||
        event.key === nightModePreferenceKey ||
        event.key === nightModeIntensityPreferenceKey
      )
        follow();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Opening puts the focus on the choice in force; closing by a click outside
  // or by Escape, and leaving the popover by the keyboard.
  useEffect(() => {
    if (!open) return undefined;
    selected.current?.focus({ preventScroll: true });
    const onPointerDown = (event) => {
      if (!container.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const choose = (night) => {
    setEnabled(night);
    writeNightModeEnabled(night);
    applyNightMode({ enabled: night, intensity });
    setOpen(false);
    trigger.current?.focus();
  };
  const slide = (value) => {
    setIntensity(value);
    writeNightModeIntensity(value);
    applyNightMode({ enabled, intensity: value });
  };

  const title = message(locale, "nightModeToggle");
  return (
    <div
      className="night-mode-control"
      ref={container}
      onBlur={(event) => {
        if (
          open &&
          event.relatedTarget &&
          !container.current?.contains(event.relatedTarget)
        )
          setOpen(false);
      }}
    >
      <button
        type="button"
        ref={trigger}
        className={`night-mode-trigger${enabled ? " is-on" : ""}`}
        aria-label={title}
        title={title}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open) onOpen?.();
          setOpen((current) => !current);
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M20.2 14.6A8.4 8.4 0 0 1 9.4 3.8a8.4 8.4 0 1 0 10.8 10.8Z"
            fill={enabled ? "currentColor" : "none"}
          />
        </svg>
      </button>
      {open && (
        <div className="night-mode-popover" role="dialog" aria-label={title}>
          <p className="night-mode-label" id={displayLabelId}>
            {message(locale, "nightModeDisplayLabel")}
          </p>
          <div
            className="night-mode-options"
            role="group"
            aria-labelledby={displayLabelId}
          >
            {options(locale).map(({ night, label }) => (
              <button
                key={String(night)}
                type="button"
                ref={night === enabled ? selected : undefined}
                className={`night-mode-option${night === enabled ? " is-selected" : ""}`}
                aria-pressed={night === enabled}
                onClick={() => choose(night)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="night-mode-label" id={brightnessLabelId}>
            {message(locale, "nightModeBrightnessLabel")}
          </p>
          <input
            className="night-mode-slider"
            type="range"
            min={nightModeMinRelativeLuminance}
            max={nightModeMaxRelativeLuminance}
            step="0.0005"
            value={intensity}
            disabled={!enabled}
            aria-label={message(locale, "nightModeIntensityLabel")}
            aria-valuetext={message(locale, "nightModeIntensityValue").replace(
              "{percent}",
              String(percent),
            )}
            onChange={(event) => slide(Number(event.target.value))}
          />
        </div>
      )}
    </div>
  );
}
