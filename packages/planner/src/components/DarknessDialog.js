"use client";

// "Changer le seuil d’obscurité" on the web's "Cette nuit": the `tune` icon top
// right of the night card opens, in a dialog, the planner's own "Seuil
// d’obscurité" group — the three thresholds, their effect on tonight, the note
// that nights already carried out keep their windows. A choice writes the same
// preference as the planner (`writeDarknessPreference`) and the same plans
// (`applyDarknessToPlans`), through the page's `onChoose`; the card follows.

import { useMemo, useState } from "react";
import { WebDialog } from "portal/components/dialog/WebDialog.js";
import { durationText } from "portal/written-forms.js";
import { message } from "portal/i18n.js";
import { darknessChoices, darknessEffects } from "../darkness-setting.js";
import { clock } from "../wind-section.js";

/** The `tune` glyph (three sliders), 20 px on a 44 px target. */
function TuneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  );
}

/**
 * The icon and its dialog. `darkness` is the threshold the card shows;
 * `place` and `date` the night of the effect rows; `onChoose(value)` writes
 * the choice.
 */
export function DarknessSettingButton({
  locale,
  darkness,
  place,
  date,
  timeZone,
  onChoose,
}) {
  const [open, setOpen] = useState(false);
  const label = message(locale, "tonightDarknessOpen");
  const close = message(locale, "infoClose");
  const effects = useMemo(
    () => (open ? darknessEffects({ date, location: place }) : null),
    [open, date, place],
  );
  return (
    <>
      <button
        type="button"
        className="tonight-night-threshold"
        aria-label={label}
        title={label}
        onClick={() => setOpen(true)}
      >
        <TuneIcon />
      </button>
      {open ? (
        <WebDialog
          className="info-dialog tonight-darkness-dialog"
          bodyClassName="info-dialog-body"
          closeLabel={close}
          closeOnBackdrop
          title={message(locale, "plannerDarknessTitle")}
          onClose={() => setOpen(false)}
          footer={
            <button
              type="button"
              className="btn-tertiary"
              onClick={() => setOpen(false)}
            >
              {close}
            </button>
          }
        >
          <p className="planner-darkness-description">
            {message(locale, "plannerDarknessDescription")}
          </p>
          <div
            className="planner-darkness-options"
            role="radiogroup"
            aria-label={message(locale, "plannerDarknessTitle")}
          >
            {darknessChoices.map((choice) => (
              <label
                className={darkness === choice.darkness ? "is-selected" : ""}
                key={choice.darkness}
              >
                <input
                  type="radio"
                  name="tonight-darkness"
                  value={choice.darkness}
                  checked={darkness === choice.darkness}
                  onChange={() => onChoose(choice.darkness)}
                />
                <span>
                  <strong>{message(locale, choice.label)}</strong>
                  <span>
                    {message(locale, "plannerDarknessSun").replace(
                      "{altitude}",
                      String(choice.altitude),
                    )}
                  </span>
                  <small>{message(locale, choice.hint)}</small>
                </span>
              </label>
            ))}
          </div>
          <section
            className="planner-darkness-effect"
            aria-labelledby="tonight-darkness-effect-title"
          >
            <h3 id="tonight-darkness-effect-title">
              {message(locale, "plannerDarknessEffectTonight")}
            </h3>
            {effects ? (
              <ul>
                {effects.map((row) => (
                  <li key={row.darkness}>
                    <strong>
                      {message(
                        locale,
                        darknessChoices.find(
                          (choice) => choice.darkness === row.darkness,
                        ).short,
                      )}
                    </strong>
                    <span>{durationText(row.minutes, locale)}</span>
                    <span>
                      {clock(row.start, locale, timeZone)} →{" "}
                      {clock(row.end, locale, timeZone)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{message(locale, "plannerDarknessNoPlace")}</p>
            )}
          </section>
          <small className="planner-darkness-note" role="note">
            {message(locale, "plannerDarknessExecutedNote")}
          </small>
        </WebDialog>
      ) : null}
    </>
  );
}
