"use client";

import { useState } from "react";
import { InfoButton } from "portal/components/dialog/InfoButton.js";
import { message } from "portal/i18n.js";
import {
  exposureFromText,
  exposureIsValid,
  exposureToText,
  lineWithExposure,
  lineWithFilter,
  lineWithGain,
} from "../acquisition-edit.js";
import { chosenDefaults } from "../acquisition-reading.js";
import { fill } from "../wind-section.js";

// The block "Prise de vue" of step 2 "Matériel" ("Prise de vue par cible"):
// three fields — Pose, Gain, Filtre — and the link "Plus de réglages ›", under
// the filters. It edits `plan.acquisitionDefaults`; the last defaults chosen
// are kept in this browser and prefill the next new plan
// (`acquisition-edit.js`). Photo mode only: in visual mode nothing is shown.
// The dialog holds the rest.

// The values of the entries that are not a gain or a filter (a native select
// holds strings; a filter is never named like these).
const auto = "__acq-auto";
const none = "__acq-none";
const other = "__acq-other";
const custom = "__acq-custom";

function CameraGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="acq-block-icon">
      <path d="M4 8h3l1.6-2.4h6.8L17 8h3v11H4z" />
      <circle cx="12" cy="13.2" r="3.4" />
    </svg>
  );
}

export function AcquisitionDefaultsBlock({
  locale,
  basis,
  editable,
  onChange,
  onOpenDialog,
}) {
  const [typed, setTyped] = useState(null);
  if (!basis || !basis.photo) return null;
  const defaults = chosenDefaults(basis.plan);
  const held = exposureToText(defaults?.exposureSeconds);
  const shown = typed ?? held;

  const commitExposure = () => {
    if (typed === null) return;
    const text = typed.trim();
    const value = text ? exposureFromText(text) : null;
    setTyped(null);
    // Not a pose: the field goes back to what the plan holds.
    if (text && !exposureIsValid(value)) return;
    if (value === (defaults?.exposureSeconds ?? null)) return;
    onChange(lineWithExposure(defaults, value));
  };

  let gainValue;
  const gainItems = [
    { value: auto, label: message(locale, "acqGainHint") },
    ...basis.gainChoices.map((choice) => ({
      value: String(choice.value),
      label: fill(
        message(
          locale,
          choice.kind === "hcg" ? "acqGainNamedHcg" : "acqGainNamedUnity",
        ),
        { value: choice.value },
      ),
    })),
  ];
  if (!defaults || !Object.hasOwn(defaults, "gain")) gainValue = auto;
  else if (
    defaults.gain !== null &&
    basis.gainChoices.some((choice) => choice.value === defaults.gain)
  )
    gainValue = String(defaults.gain);
  else {
    gainValue = custom;
    gainItems.push({
      value: custom,
      label:
        defaults.gain === null
          ? message(locale, "acqLineGainDevice")
          : String(defaults.gain),
    });
  }
  gainItems.push({ value: other, label: message(locale, "acqGainOther") });

  const offeredNames = [
    ...basis.filterNames,
    ...(basis.otherFilterNames ?? []).filter(
      (name) => !basis.filterNames.includes(name),
    ),
  ];
  const names = [
    ...offeredNames,
    ...(defaults &&
    Object.hasOwn(defaults, "filter") &&
    defaults.filter !== null &&
    !offeredNames.includes(defaults.filter)
      ? [defaults.filter]
      : []),
  ];
  const filterItems = [
    { value: auto, label: message(locale, "acqFilterHint") },
    ...names.map((name) => ({ value: name, label: name })),
    { value: none, label: message(locale, "acqFilterNoneChip") },
  ];
  const filterValue =
    !defaults || !Object.hasOwn(defaults, "filter")
      ? auto
      : defaults.filter === null
        ? none
        : defaults.filter;

  const gainChanged = (next) => {
    if (next === other) {
      onOpenDialog();
      return;
    }
    if (next === custom) return;
    onChange(
      next === auto
        ? lineWithGain(defaults, { chosen: false })
        : lineWithGain(defaults, { chosen: true, gain: Number(next) }),
    );
  };
  const filterChanged = (next) =>
    onChange(
      next === auto
        ? lineWithFilter(defaults, { chosen: false })
        : next === none
          ? lineWithFilter(defaults, { chosen: true })
          : lineWithFilter(defaults, { chosen: true, filter: next }),
    );

  return (
    <section
      className="planner-setting-group planner-equipment-group acq-defaults-block"
      data-acquisition="defaults"
      aria-label={message(locale, "acqBlockTitle")}
    >
      <div className="acq-block-heading">
        <CameraGlyph />
        <h3>{message(locale, "acqBlockTitle")}</h3>
        <InfoButton
          locale={locale}
          title={message(locale, "acqBlockTitle")}
          body={message(locale, "acqBlockInfo")}
          testId="acquisition-defaults-info"
        />
      </div>
      <p className="acq-help" data-acquisition="defaults-help">
        {message(locale, "acqBlockHelp")}
      </p>
      <div className="acq-defaults-fields">
        <label className="acq-field">
          <span>{message(locale, "acqExposureLabel")}</span>
          <span className="acq-input">
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              data-testid="acquisition-defaults-exposure"
              value={shown}
              disabled={!editable}
              placeholder={message(locale, "acqExposureHint")}
              onChange={(event) => setTyped(event.target.value)}
              onBlur={commitExposure}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitExposure();
                }
              }}
            />
            <b aria-hidden="true">{message(locale, "acqSecondsUnit")}</b>
          </span>
        </label>
        <label className="acq-field">
          <span>{message(locale, "acqGainLabel")}</span>
          <select
            data-testid="acquisition-defaults-gain"
            value={gainValue}
            disabled={!editable}
            onChange={(event) => gainChanged(event.target.value)}
          >
            {gainItems.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label className="acq-field">
          <span>{message(locale, "acqFilterLabel")}</span>
          <select
            data-testid="acquisition-defaults-filter"
            value={filterValue}
            disabled={!editable}
            onChange={(event) => filterChanged(event.target.value)}
          >
            {filterItems.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="acq-more-row">
        <button
          type="button"
          className="btn-link acq-link"
          data-testid="acquisition-defaults-more"
          disabled={!editable}
          onClick={onOpenDialog}
        >
          {message(locale, "acqMoreSettings")}
          <span aria-hidden="true"> ›</span>
        </button>
        <span className="acq-help">
          {message(locale, "acqMoreSettingsHint")}
        </span>
      </div>
    </section>
  );
}
