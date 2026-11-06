"use client";

import { useState } from "react";
import { WebDialog } from "portal/components/dialog/WebDialog.js";
import { message } from "portal/i18n.js";
import { itemWithAcquisitionLine, lineRefusal } from "../acquisition-edit.js";
import { draftOf, emptyDraft, lineOf, problems } from "../acquisition-draft.js";
import {
  acquisitionAdvisedFilterText,
  acquisitionFramesNoFitText,
  acquisitionFramesOverSlotText,
  acquisitionMissingFilterText,
  acquisitionNumber,
  acquisitionSuggestedExposureText,
  acquisitionSuggestedGainText,
} from "../acquisition-words.js";
import { fill } from "../wind-section.js";

// The dialog "Paramètres de la pose" ("Prise de vue par cible"): ONE dialog,
// opened from a target (the card of the plan's target, the interval editor, the
// plan's dialog) or from the plan (step 2 and the plan's dialog).
//
// Pose (seconds; empty = suggested, with what the rule proposes and why), Gain
// (the named values of the camera's profile as chips, "Autre valeur", empty =
// the device's own setting), Filtre ("Conseillé par cible", the plan's filters,
// "Sans filtre"), "Plus de réglages" folded (Binning, Poses par cible, a count
// that does not fit the slot is warned and the slot never moves), tertiary
// « Revenir aux suggestions », primary « Utiliser pour cette cible » /
// « Utiliser pour tout le plan ». One line per target at this tier. Read-only
// (« Figé au lancement »): the values as they were frozen, no primary,
// nothing to revert.
//
// Buttons: one primary and one tertiary at the foot
// (the strongest on the right), a link that unfolds the rest; the choices of a
// group are `filter-choice` selectors (outside the four levels).

/**
 * What the dialog needs, whatever opens it.
 *
 * @typedef {object} AcquisitionDialogModel
 * @property {"target" | "plan"} scope a target or the plan.
 * @property {object} basis the `acquisitionBasisOf` of the plan.
 * @property {object | null} item the plan item the dialog is about (target scope), or
 *   the item the suggestions are quoted for (plan scope: the first target); `null`
 *   for a plan with none.
 * @property {string} targetName the name quoted in "Conseillé pour M31".
 * @property {string} subtitle the line under the title.
 * @property {object | null} initial what the person chose already: the
 *   item's first line (target scope), the plan's defaults (plan scope); in the read-only
 *   dialog, the frozen values.
 * @property {(line: object | null) => void | Promise<void>} onUse called with
 *   the line to keep (`null` for "revenir aux suggestions").
 * @property {boolean} [readOnly] nothing to change.
 * @property {boolean} [frozen] the values were frozen at the launch.
 */

export function AcquisitionDialog({ locale, model, onClose }) {
  const { basis, item, scope, readOnly = false, frozen = false } = model;
  const target = scope === "target";
  const [draft, setDraft] = useState(() => draftOf(model.initial, basis));
  const [moreOpen, setMoreOpen] = useState(
    () => model.initial?.binning != null || model.initial?.frameCount != null,
  );
  const [busy, setBusy] = useState(false);
  const patch = (change) => setDraft((current) => ({ ...current, ...change }));
  const bad = problems(draft);
  const valid = !bad.exposure && !bad.gain && !bad.frames;

  const suggestion = item ? basis.suggestion(item) : null;
  const suggestedExposure = acquisitionSuggestedExposureText(
    locale,
    suggestion,
  );
  const suggestedGain = acquisitionSuggestedGainText(locale, suggestion);
  const advisedFilter = acquisitionAdvisedFilterText(locale, suggestion);
  const advisedName =
    suggestion?.first.filter.source === "suggested"
      ? (suggestion.first.filter.value ?? null)
      : null;
  const suggestedSeconds = suggestion?.first.exposureSeconds.value ?? null;

  // The basis with the plan's default frame count left out: what the slot
  // itself holds, whatever the plan asked for.
  const slotBasis = (() => {
    const { acquisitionDefaults, ...rest } = basis.plan;
    if (!acquisitionDefaults) return basis;
    const { frameCount: _frames, ...kept } = acquisitionDefaults;
    return basis.withPlan({ ...rest, acquisitionDefaults: kept });
  })();
  const preview = (withFrames = true) =>
    target && item
      ? slotBasis.read(
          itemWithAcquisitionLine(item, lineOf(draft, { withFrames })),
        )
      : null;
  const reading = preview();
  const framesHelp = (() => {
    if (!reading) return null;
    const line = reading.first;
    const count = line.frameCount.value;
    if (!line.frameCount.chosen) {
      if (count === null || reading.slotSeconds === null) return null;
      return acquisitionFramesOverSlotText(locale, count, reading.slotSeconds);
    }
    if (!line.fitsSlot)
      return acquisitionFramesNoFitText(
        locale,
        count,
        preview(false)?.first.frameCount.value ?? 0,
      );
    return null;
  })();
  const framesWarn = Boolean(reading && !reading.first.fitsSlot);

  const use = async () => {
    const line = lineOf(draft);
    if (line && lineRefusal(line)) return;
    setBusy(true);
    try {
      await model.onUse(line);
    } finally {
      setBusy(false);
    }
    onClose();
  };

  // The plan's own filters first (the ones ticked at step 2 and the
  // telescope's built-in ones), then, after a thin rule, the other filters
  // the plan offers, quieter; a chosen name that is in neither stays with
  // the first.
  const otherNames = (basis.otherFilterNames ?? []).filter(
    (name) => !basis.filterNames.includes(name),
  );
  const names = [
    ...new Set([
      ...basis.filterNames,
      ...(draft.filter === "named" &&
      draft.filterName &&
      !otherNames.includes(draft.filterName)
        ? [draft.filterName]
        : []),
    ]),
  ];
  const builtInNames = basis.builtInFilterNames ?? [];
  const filterChip = (name, quiet) =>
    choice(
      `filter-${name}`,
      // The advised filter is marked; the others stay selectable whatever
      // the target. A built-in filter carries the tag "intégré".
      <>
        {name === advisedName
          ? fill(message(locale, "acqFilterNamedAdvised"), { name })
          : name}
        {builtInNames.includes(name) ? (
          <span className="acq-filter-tag" data-built-in-tag>
            {message(locale, "filterTagBuiltIn")}
          </span>
        ) : null}
      </>,
      draft.filter === "named" && draft.filterName === name,
      () => patch({ filter: "named", filterName: name }),
      { "data-filter": name, ...(quiet ? { "data-quiet": "" } : {}) },
    );
  const choice = (key, label, selected, onClick, extra = {}) => (
    <button
      key={key}
      type="button"
      className={`filter-choice${selected ? " is-selected" : ""}${
        extra["data-quiet"] === undefined ? "" : " is-quiet"
      }`}
      aria-pressed={selected}
      disabled={readOnly}
      onClick={onClick}
      {...extra}
    >
      {label}
    </button>
  );
  const help = (text, id) =>
    text ? (
      <p className="acq-help" data-acquisition={id}>
        {text}
      </p>
    ) : null;

  const footer = readOnly ? null : (
    <>
      <button
        type="button"
        className="btn-tertiary"
        data-testid="acquisition-revert"
        onClick={() => {
          setDraft({ ...emptyDraft });
        }}
      >
        {message(locale, "acqRevert")}
      </button>
      <button
        type="button"
        className="btn-primary"
        data-testid="acquisition-use"
        disabled={!valid || busy}
        onClick={use}
      >
        {message(locale, target ? "acqUseTarget" : "acqUsePlan")}
      </button>
    </>
  );

  return (
    <WebDialog
      className="acq-dialog"
      bodyClassName="acq-dialog-body"
      closeLabel={message(locale, "infoClose")}
      title={message(locale, "acqSheetTitle")}
      onClose={onClose}
      footer={footer}
      footerClassName="acq-dialog-footer"
    >
      <p className="acq-dialog-subtitle" data-acquisition="subtitle">
        {model.subtitle}
      </p>
      {frozen ? (
        <p className="acq-frozen-note" data-acquisition="frozen-note">
          {message(locale, "acqFrozenAtLaunch")}
        </p>
      ) : null}

      <section
        className="acq-group"
        aria-label={message(locale, "acqExposureLabel")}
      >
        <h3>{message(locale, "acqExposureLabel")}</h3>
        <label className="acq-field">
          <span>{message(locale, "acqExposureFieldLabel")}</span>
          <span className="acq-input">
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              data-testid="acquisition-exposure"
              value={draft.exposure}
              disabled={readOnly}
              aria-invalid={bad.exposure || undefined}
              placeholder={
                suggestedSeconds === null || readOnly
                  ? undefined
                  : fill(message(locale, "acqExposureFieldHint"), {
                      value: acquisitionNumber(locale, suggestedSeconds),
                    })
              }
              onChange={(event) => patch({ exposure: event.target.value })}
            />
            <b aria-hidden="true">{message(locale, "acqSecondsUnit")}</b>
          </span>
        </label>
        {readOnly
          ? null
          : help(
              suggestedExposure === null
                ? message(locale, "acqNothingSuggested")
                : fill(message(locale, "acqSuggestedExposureHelp"), {
                    text: suggestedExposure,
                  }),
              "exposure-help",
            )}
      </section>

      <section
        className="acq-group"
        aria-label={message(locale, "acqGainLabel")}
      >
        <h3>{message(locale, "acqGainLabel")}</h3>
        <div className="filter-choices" role="group">
          {basis.gainChoices.map((entry) =>
            choice(
              `gain-${entry.kind}`,
              fill(
                message(
                  locale,
                  entry.kind === "hcg"
                    ? "acqGainNamedHcg"
                    : "acqGainNamedUnity",
                ),
                { value: entry.value },
              ),
              draft.gainNamed === entry.value && !draft.gainOther,
              () =>
                patch({
                  gainNamed:
                    draft.gainNamed === entry.value ? null : entry.value,
                  gainOther: false,
                  gain: "",
                }),
              { "data-testid": `acquisition-gain-${entry.kind}` },
            ),
          )}
          {choice(
            "gain-other",
            message(locale, "acqGainOther"),
            draft.gainOther,
            () =>
              patch({
                gainOther: !draft.gainOther,
                gainNamed: null,
                gain: draft.gainOther ? "" : draft.gain,
              }),
            { "data-testid": "acquisition-gain-other" },
          )}
        </div>
        {draft.gainOther ? (
          <label className="acq-field">
            <span>{message(locale, "acqGainFieldLabel")}</span>
            <span className="acq-input">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                data-testid="acquisition-gain-field"
                value={draft.gain}
                disabled={readOnly}
                aria-invalid={bad.gain || undefined}
                onChange={(event) => patch({ gain: event.target.value })}
              />
            </span>
          </label>
        ) : null}
        {readOnly
          ? null
          : help(
              draft.gainOther
                ? message(locale, "acqGainOtherHint")
                : suggestedGain === null
                  ? message(locale, "acqNothingSuggested")
                  : fill(message(locale, "acqSuggestedGainHelp"), {
                      text: suggestedGain,
                    }),
              "gain-help",
            )}
      </section>

      <section
        className="acq-group"
        aria-label={message(locale, "acqFilterLabel")}
      >
        <h3>{message(locale, "acqFilterLabel")}</h3>
        <div className="filter-choices" role="group">
          {choice(
            "filter-advised",
            message(locale, "acqFilterAdvisedChip"),
            draft.filter === "advised",
            () => patch({ filter: "advised", filterName: null }),
            { "data-testid": "acquisition-filter-advised" },
          )}
          {names.map((name) => filterChip(name, false))}
          {otherNames.length ? (
            <span
              className="filter-choices-rule"
              role="separator"
              data-filter-rule
            />
          ) : null}
          {otherNames.map((name) => filterChip(name, true))}
          {choice(
            "filter-none",
            message(locale, "acqFilterNoneChip"),
            draft.filter === "none",
            () => patch({ filter: "none", filterName: null }),
            { "data-testid": "acquisition-filter-none" },
          )}
        </div>
        {readOnly
          ? null
          : help(
              advisedFilter !== null
                ? fill(message(locale, "acqAdvisedFilterHelp"), {
                    target: model.targetName,
                    text: advisedFilter,
                  })
                : (acquisitionMissingFilterText(locale, suggestion) ??
                    fill(message(locale, "acqAdvisedFilterNone"), {
                      target: model.targetName,
                    })),
              "filter-help",
            )}
        {readOnly
          ? null
          : help(
              basis.ownFiltersOnlyName
                ? fill(message(locale, "acqFilterOwnLine"), {
                    name: basis.ownFiltersOnlyName,
                  })
                : message(locale, "acqFilterPoolLine"),
              "filter-pool-help",
            )}
      </section>

      <button
        type="button"
        className="btn-link acq-more"
        data-testid="acquisition-more"
        aria-expanded={moreOpen}
        onClick={() => setMoreOpen((open) => !open)}
      >
        {message(locale, "acqMoreSettings")}
        <span aria-hidden="true">{moreOpen ? " ⌃" : " ›"}</span>
      </button>
      {moreOpen ? (
        <section className="acq-group acq-more-group">
          <div className="acq-binning">
            <span>{message(locale, "acqBinningLabel")}</span>
            <div className="filter-choices" role="group">
              {[1, 2].map((binning) =>
                choice(
                  `binning-${binning}`,
                  `${binning} × ${binning}`,
                  draft.binning === binning,
                  () =>
                    patch({
                      binning: draft.binning === binning ? null : binning,
                    }),
                  { "data-testid": `acquisition-binning-${binning}` },
                ),
              )}
            </div>
          </div>
          <label className="acq-field">
            <span>{message(locale, "acqFramesLabel")}</span>
            <span className="acq-input">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                data-testid="acquisition-frames"
                value={draft.frames}
                disabled={readOnly}
                aria-invalid={bad.frames || undefined}
                placeholder={message(locale, "acqFramesHint")}
                onChange={(event) => patch({ frames: event.target.value })}
              />
            </span>
          </label>
          {framesHelp ? (
            <p
              className={`acq-help${framesWarn ? " is-warning" : ""}`}
              data-acquisition="frames-help"
              role={framesWarn ? "status" : undefined}
            >
              {framesHelp}
            </p>
          ) : null}
          {/* Dithering and offset are settings of the device or of its
              software, not per-target values: said here so the dialog does not
              look as if it lacked them by mistake. */}
          <p className="acq-help" data-acquisition="more-note">
            {message(locale, "acqMoreNote")}
          </p>
        </section>
      ) : null}
    </WebDialog>
  );
}
