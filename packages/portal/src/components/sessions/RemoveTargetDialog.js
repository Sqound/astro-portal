"use client";

import { useState } from "react";
import { message } from "portal/i18n.js";
import { WebDialog } from "../dialog/WebDialog.js";
import { SKIP_REASONS } from "./debrief-decision.js";
import { say } from "./night-detail-view.js";
import { clockValue } from "./debrief-moment.js";

// The reason of a target that was not observed, and the question asked before
// a target is taken out of a session: shared by the debriefing and « Remanier
// la session ».

const REASON_CHIPS = SKIP_REASONS;
const reasonKey = (reason) =>
  `debriefReason${reason[0].toUpperCase()}${reason.slice(1)}`;

export function ReasonChips({ locale, value, onChange }) {
  return (
    <span className="debrief-reasons" role="group">
      {REASON_CHIPS.map((reason) => (
        <button
          key={reason}
          type="button"
          className={`debrief-chip${value === reason ? " is-selected" : ""}`}
          aria-pressed={value === reason}
          onClick={() => onChange(value === reason ? "" : reason)}
        >
          {message(locale, reasonKey(reason))}
        </button>
      ))}
    </span>
  );
}

/**
 * « Retirer {cible} de la session ? »: the target stays on the frise, hatched,
 * with its reason — the promise not kept is part of the night.
 */
export function RemoveTargetDialog({
  locale,
  label,
  slot,
  initialReason = "",
  timeZone = "UTC",
  onCancel,
  onConfirm,
}) {
  const [chosen, setChosen] = useState(initialReason);
  return (
    <WebDialog
      className="info-dialog"
      bodyClassName="info-dialog-body"
      closeLabel={message(locale, "infoClose")}
      closeOnBackdrop
      focusTitle
      title={say(locale, "debriefMomentRemoveTitle", { target: label })}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn-tertiary" onClick={onCancel}>
            {message(locale, "nightPageCancel")}
          </button>
          <button
            type="button"
            className="btn-tertiary is-destructive"
            onClick={() => onConfirm(chosen)}
          >
            {say(locale, "debriefMomentRemoveConfirm", { target: label })}
          </button>
        </>
      }
    >
      <p className="info-dialog-text">
        {say(locale, "debriefMomentRemoveBody", {
          target: label,
          start: slot ? clockValue(slot.start, timeZone) : "—",
          end: slot ? clockValue(slot.end, timeZone) : "—",
        })}
      </p>
      <p className="night-card-line">
        {message(locale, "debriefTargetReasonLabel")}
      </p>
      <ReasonChips locale={locale} value={chosen} onChange={setChosen} />
    </WebDialog>
  );
}
