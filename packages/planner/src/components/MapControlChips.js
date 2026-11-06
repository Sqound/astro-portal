"use client";

import { useEffect, useId, useRef, useState } from "react";
import { message } from "portal/i18n.js";

// The map controls of stage 4 on the web: one row under "Liste | Carte" — the
// drop-down chips "Horizon ▾" (Absolue / Horizon) and "Trajet ▾" (Positions /
// Trajet), each opening a menu anchored under it, the chip "Calques ▾", which
// opens a dialog, and the settings icon, which opens "Réglages de la carte".
//
// At rest a chip has no gold fill (light text, the icon of the selected item,
// the chevron); the gold — a selected segment's look — shows only while its
// menu or dialog is open (`is-open`). "Calques" carries a small gold dot
// while a layer is on (`is-active`), never because its dialog is open. The
// chips are selectors, outside the four button levels.

const glyphPaths = {
  // The web's own glyphs of the old "Absolue | Horizon" segments.
  absolute: (
    <>
      <circle cx="12" cy="12" r="1.35" />
      <ellipse cx="12" cy="12" rx="8.3" ry="4.7" />
      <path d="M7.6 5.1c3.9 2 7.1 6.5 8.8 13.8" />
      <circle cx="19.6" cy="10.1" r="1.1" />
      <circle cx="7.2" cy="16.2" r="0.85" />
    </>
  ),
  horizon: (
    <>
      <path d="M3 18 8.6 9.5l3.2 4.1 3.1-5.3L21 18H3Z" />
      <path d="M3 18h18" />
    </>
  ),
  positions: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  path: (
    <>
      <circle cx="6" cy="18" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <path d="M8 17.5c6-1 2-8 8-9.5" />
    </>
  ),
  layers: (
    <>
      <path d="M12 4 L21 8.5 L12 13 L3 8.5 Z" />
      <path d="M3 12.5 L12 17 L21 12.5" />
      <path d="M3 16.5 L12 21 L21 16.5" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  chevron: <path d="M6 9l6 6 6-6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
};

/** One of the controls' glyphs, 24 × 24, stroked in the current colour. */
export function MapGlyph({ glyph, size = 16 }) {
  return (
    <svg
      className={`planner-map-glyph is-${glyph}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {glyphPaths[glyph]}
    </svg>
  );
}

/**
 * A drop-down chip and its menu: `items` are `{ value, label, glyph }`, the
 * one equal to `value` marked; choosing one calls `onSelect` and closes the
 * menu, as does a click outside it or Escape. `reason`, when given, greys
 * the items and says why under them.
 */
export function MapMenuChip({
  className = "",
  label,
  glyph,
  menuLabel,
  value,
  items,
  onSelect,
  reason = null,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const menuId = `planner-map-menu-${useId().replace(/[^\w-]/g, "")}`;
  useEffect(() => {
    if (!open) return undefined;
    const outside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div className="planner-map-chip-anchor" ref={rootRef}>
      <button
        type="button"
        className={`planner-map-chip ${className}${open ? " is-open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`${menuLabel}, ${label}`}
        onClick={() => setOpen((current) => !current)}
      >
        <MapGlyph glyph={glyph} />
        <span>{label}</span>
        <MapGlyph glyph="chevron" size={14} />
      </button>
      {open && (
        <div
          className="planner-map-menu"
          id={menuId}
          role="menu"
          aria-label={menuLabel}
        >
          {items.map((item) => {
            const selected = item.value === value;
            return (
              <button
                key={item.value}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className={selected ? "is-active" : ""}
                disabled={Boolean(reason)}
                onClick={() => {
                  setOpen(false);
                  onSelect(item.value);
                }}
              >
                <MapGlyph glyph={item.glyph} size={20} />
                <span>{item.label}</span>
                {selected ? (
                  <MapGlyph glyph="check" size={18} />
                ) : (
                  <span className="planner-map-menu-check" aria-hidden="true" />
                )}
              </button>
            );
          })}
          {reason && (
            <p className="planner-horizon-mode-reason" role="note">
              {reason}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * "Calques ▾": the chip that opens the layers' dialog. `open` gives it the
 * gold of an open control; `active` (a layer is on) its gold dot.
 */
export function HorizonLayersChip({ locale, open, active, onOpen }) {
  return (
    <button
      type="button"
      className={`planner-map-chip planner-horizon-layers-trigger${open ? " is-open" : ""}${active ? " is-active" : ""}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={message(locale, "horizonLayers")}
      onClick={onOpen}
    >
      <span className="planner-map-glyph-dot">
        <MapGlyph glyph="layers" />
        {active && (
          <span
            className="planner-horizon-layers-active"
            data-testid="planner-horizon-layers-active"
            aria-hidden="true"
          />
        )}
      </span>
      <span>{message(locale, "horizonLayers")}</span>
      <MapGlyph glyph="chevron" size={14} />
    </button>
  );
}

/** The round settings icon at the end of the row: never lit. */
export function MapSettingsButton({ locale, open, onOpen }) {
  const label = message(locale, "plannerMapSettings");
  return (
    <button
      type="button"
      className="planner-map-settings"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={label}
      title={label}
      onClick={onOpen}
    >
      <MapGlyph glyph="settings" size={22} />
    </button>
  );
}

/** The row itself: the chips at their content's width, the icon at its end. */
export function MapControlsRow({ children, settings = null }) {
  return (
    <div className="planner-map-controls">
      <div className="planner-map-chips">{children}</div>
      {settings}
    </div>
  );
}
