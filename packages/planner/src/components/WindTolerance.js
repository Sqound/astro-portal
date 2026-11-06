"use client";

import { useEffect, useState } from "react";
import { message } from "portal/i18n.js";
import { WebDialog } from "portal/components/dialog/WebDialog.js";
import { windToleranceRule, windTolerancePresets } from "../wind.js";
import { windSectionLabels, windTonightLine } from "../wind-section.js";

// "Tolérance au vent": a row of the planner's stage 3 "Contraintes", after the
// Moon separation — the setting ("Standard · 20 / 30 km/h"), tonight's line,
// the mount it is kept for — that opens a dialog holding the section word for
// word: the sentence, the mount, the four presets as one segmented choice, the
// limits of the chosen one (two whole numbers in "Personnalisé") and the line
// on tonight's gusts against them, then "Fermer". The tolerance is kept for the
// plan's mount in this browser and copied into the plans that can still take it
// (`chooseWindTolerance` in PlannerPage).

function LimitInput({ label, value, onCommit }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const number = Number(draft);
    if (!Number.isFinite(number) || draft.trim() === "") {
      setDraft(String(value));
      return;
    }
    const next = Math.min(
      windToleranceRule.maximumKmh,
      Math.max(windToleranceRule.minimumKmh, Math.round(number)),
    );
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };
  return (
    <label className="planner-wind-input">
      <span>{label}</span>
      <span>
        <input
          type="number"
          inputMode="numeric"
          min={windToleranceRule.minimumKmh}
          max={windToleranceRule.maximumKmh}
          step={windToleranceRule.stepKmh}
          value={draft}
          aria-label={label}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
          }}
        />
        <span aria-hidden="true">km/h</span>
      </span>
    </label>
  );
}

function TonightLine({ line }) {
  return (
    <p className={`planner-wind-tonight is-${line.tone}`} role="status">
      {line.tone !== "calm" && (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3.5l9.5 16.5h-19z" />
          <path d="M12 10v4.5" />
          <path d="M12 17.5h.01" />
        </svg>
      )}
      <span>{line.text}</span>
    </p>
  );
}

// The row of stage 3. A button: a touch opens the dialog.
export function WindToleranceRow({
  locale,
  tolerance,
  mountName = null,
  assessment = null,
  tonight = true,
  timeZone,
  onOpen,
}) {
  const labels = windSectionLabels({ locale, tolerance, mountName });
  const line = windTonightLine({ locale, assessment, tonight, timeZone });
  return (
    <button
      type="button"
      className="planner-wind-row"
      data-testid="planner-wind-row"
      onClick={onOpen}
    >
      <svg
        className="planner-wind-row-glyph"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M3 9h11a3 3 0 1 0-3-3" />
        <path d="M3 14h15a3 3 0 1 1-3 3" />
      </svg>
      <span className="planner-wind-row-text">
        <span className="planner-wind-row-title">
          {message(locale, "plannerWindTitle")}
        </span>
        <span className="planner-wind-row-value">{labels.value}</span>
        <TonightLine line={line} />
        <span className="planner-wind-row-mount">{labels.forMount}</span>
      </span>
      <svg
        className="planner-wind-row-chevron"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
}

// The dialog: its title, the section, "Fermer" (tertiary, as the ⓘ
// dialogs).
export function WindToleranceDialog({ locale, closeLabel, onClose, ...props }) {
  return (
    <WebDialog
      className="planner-wind-dialog"
      closeLabel={closeLabel}
      closeOnBackdrop
      onClose={onClose}
      title={message(locale, "plannerWindTitle")}
      titleAs="h3"
      footer={
        <button className="btn-tertiary" type="button" onClick={onClose}>
          {message(locale, "infoClose")}
        </button>
      }
    >
      <WindTolerance locale={locale} {...props} />
    </WebDialog>
  );
}

export function WindTolerance({
  locale,
  tolerance,
  mountName = null,
  assessment = null,
  tonight = true,
  timeZone,
  onChoose,
}) {
  const preset = tolerance?.preset || "standard";
  const custom = preset === "custom";
  const labels = windSectionLabels({ locale, tolerance, mountName });
  const line = windTonightLine({ locale, assessment, tonight, timeZone });
  const choose = (next) => {
    if (next === preset) return;
    onChoose?.(
      next === "custom"
        ? {
            preset: "custom",
            sustainedKmh: tolerance?.sustainedKmh,
            gustKmh: tolerance?.gustKmh,
          }
        : { preset: next },
    );
  };
  return (
    <div className="planner-wind-group">
      <p className="planner-wind-description">
        {message(locale, "plannerWindDescription")}
      </p>
      <p className="planner-wind-mount">{labels.mount}</p>
      <div
        className="planner-wind-presets"
        role="radiogroup"
        aria-label={message(locale, "plannerWindTitle")}
      >
        {windTolerancePresets.map((entry) => (
          <label
            key={entry.preset}
            className={entry.preset === preset ? "is-selected" : ""}
          >
            <input
              type="radio"
              name="planner-wind-tolerance"
              value={entry.preset}
              checked={entry.preset === preset}
              // The dialog starts on the chosen preset, not the first one.
              data-autofocus={entry.preset === preset ? "" : undefined}
              onChange={() => choose(entry.preset)}
            />
            <span>{message(locale, entry.label)}</span>
          </label>
        ))}
      </div>
      <section className="planner-wind-limits" aria-label={labels.limitsOf}>
        <p>{labels.limitsOf}</p>
        {custom ? (
          <div className="planner-wind-values">
            <LimitInput
              label={message(locale, "plannerWindSustained")}
              value={tolerance.sustainedKmh}
              onCommit={(value) =>
                onChoose?.({
                  preset: "custom",
                  sustainedKmh: value,
                  gustKmh: tolerance.gustKmh,
                })
              }
            />
            <LimitInput
              label={message(locale, "plannerWindGusts")}
              value={tolerance.gustKmh}
              onCommit={(value) =>
                onChoose?.({
                  preset: "custom",
                  sustainedKmh: tolerance.sustainedKmh,
                  gustKmh: value,
                })
              }
            />
          </div>
        ) : (
          <dl className="planner-wind-values">
            <div>
              <dt>{message(locale, "plannerWindSustained")}</dt>
              <dd>{labels.sustained}</dd>
            </div>
            <div>
              <dt>{message(locale, "plannerWindGusts")}</dt>
              <dd>{labels.gust}</dd>
            </div>
          </dl>
        )}
        <TonightLine line={line} />
      </section>
    </div>
  );
}
