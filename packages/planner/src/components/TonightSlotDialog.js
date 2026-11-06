"use client";

import { useEffect, useRef, useState } from "react";
import { WebDialog } from "portal/components/dialog/WebDialog.js";
import { message } from "portal/i18n.js";
import { fill } from "../wind-section.js";
import { durationText } from "portal/written-forms.js";
import { NightSpanTimeline } from "./NightSpanTimeline.js";
import { nightBestPart } from "../night-best-part.js";
import { tonightSnappedSlot } from "../tonight-slot.js";

// "Créneau de la nuit" on the web's "Cette nuit": the slot editor of the
// planner (`NightSpanTimeline.js`, its draft held here) in a dialog. Nothing
// is written before the primary "Use this slot for the night", which
// is disabled while nothing differs; "Annuler" is a link. In every opening
// (the card's icon, "Choisir le créneau de la nuit") it has the tertiary
// "Utiliser la meilleure partie estimée de la nuit", its
// sub-line "19:00–01:00 · 6 h": both handles glide to the best part (a CSS
// transition, none under `prefers-reduced-motion`), the frame flashes, and
// "Plage placée de 19:00 à 01:00" is said in a live region; disabled with
// its reason when there is none.
const same = (a, b) =>
  !a || !b
    ? !a && !b
    : Date.parse(a.start) === Date.parse(b.start) &&
      Date.parse(a.end) === Date.parse(b.end);

export function TonightSlotDialog({
  locale,
  sky,
  hourly,
  date,
  darknessLabel,
  utcOffsetMinutes = 0,
  clock,
  current = null,
  preselect = null,
  ideal = null,
  planName = null,
  onApply,
  onClose,
}) {
  const [draft, setDraft] = useState(() => preselect || current || null);
  const [placed, setPlaced] = useState(null);
  const [gliding, setGliding] = useState(false);
  const glide = useRef(null);
  useEffect(() => () => clearTimeout(glide.current), []);
  const best = nightBestPart({
    hours: hourly,
    darkStart: sky?.darkStart,
    darkEnd: sky?.darkEnd,
  });
  const bestSlot =
    best.start && best.end
      ? tonightSnappedSlot(sky, { start: best.start, end: best.end })
      : null;
  const placeBest = () => {
    if (!bestSlot) return;
    setGliding(true);
    setDraft(bestSlot);
    setPlaced(
      fill(message(locale, "tonightSlotBestPartPlaced"), {
        start: clock(bestSlot.start),
        end: clock(bestSlot.end),
      }),
    );
    clearTimeout(glide.current);
    glide.current = setTimeout(() => setGliding(false), 900);
  };
  const changed = !same(draft, current);
  const range = (slot) =>
    fill(message(locale, "tonightSlotRange"), {
      start: clock(slot.start),
      end: clock(slot.end),
    });
  return (
    <WebDialog
      className="tonight-slot-dialog"
      closeLabel={message(locale, "infoClose")}
      closeOnBackdrop
      focusTitle
      title={message(locale, "tonightSlotSheetTitle")}
      ariaLabel={message(locale, "tonightSlotSheetTitle")}
      onClose={onClose}
      footer={
        <div className="tonight-slot-dialog-actions">
          <button
            type="button"
            className="btn-link"
            data-testid="tonight-slot-cancel"
            onClick={onClose}
          >
            {message(locale, "plannerCancel")}
          </button>
          <button
            type="button"
            className="btn-primary"
            data-testid="tonight-slot-apply"
            disabled={!changed}
            onClick={() => onApply(draft)}
          >
            {message(locale, "tonightSlotApply")}
          </button>
        </div>
      }
    >
      <div
        className="tonight-slot-dialog-body"
        data-testid="tonight-slot-dialog"
      >
        <div
          className={`tonight-slot-chart${gliding ? " is-gliding" : ""}`}
          data-testid="tonight-slot-chart"
        >
          <NightSpanTimeline
            locale={locale}
            night={sky}
            hourly={hourly}
            date={date}
            darknessLabel={darknessLabel}
            editable
            utcOffsetMinutes={utcOffsetMinutes}
            clock={clock}
            value={draft}
            onDraft={setDraft}
          />
        </div>
        <BestPartButton
          locale={locale}
          range={
            bestSlot
              ? `${range(bestSlot)} · ${durationLabel(bestSlot, locale)}`
              : null
          }
          block={bestSlot ? null : best.block || "none"}
          disabled={!bestSlot || same(draft, bestSlot)}
          onClick={placeBest}
        />
        <p className="sr-only" role="status" data-testid="tonight-slot-placed">
          {placed}
        </p>
        {planName ? (
          <p className="tonight-muted" data-testid="tonight-slot-plan">
            {fill(message(locale, "tonightSlotAppliedToPlan"), {
              plan: planName,
            })}
          </p>
        ) : null}
      </div>
    </WebDialog>
  );
}

function durationLabel(slot, locale) {
  return durationText(
    Math.round((Date.parse(slot.end) - Date.parse(slot.start)) / 60000),
    locale,
  );
}

/**
 * "Utiliser la meilleure partie estimée de la nuit", a tertiary with its
 * sub-line; disabled (dotted edge, a dash) with its reason under it.
 */
export function BestPartButton({ locale, range, block, disabled, onClick }) {
  const reasons = {
    whole: "tonightSlotBestPartWhole",
    none: "tonightSlotBestPartNone",
    noForecast: "tonightSlotBestPartNoForecast",
  };
  return (
    <div className="tonight-slot-best">
      <button
        type="button"
        className={`btn-tertiary tonight-slot-best-part${block ? " is-blocked" : ""}`}
        data-testid="tonight-slot-best-part"
        disabled={disabled}
        onClick={onClick}
      >
        <span>{message(locale, "tonightSlotBestPart")}</span>
        <small>{block ? "—" : range}</small>
      </button>
      {block ? (
        <p
          className="tonight-muted"
          data-testid="tonight-slot-best-part-reason"
        >
          {message(locale, reasons[block])}
        </p>
      ) : null}
    </div>
  );
}
