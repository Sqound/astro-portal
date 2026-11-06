"use client";

import { createPortal } from "react-dom";
import { message } from "portal/i18n.js";
import { equipmentConfigurationDifferences } from "portal/planner/default-configuration.js";

/** The words of each place in "Diffère de ma configuration par défaut : …". */
const DIFFERENCE_KEYS = Object.freeze({
  mode: "plannerDifferenceMode",
  telescope: "plannerDifferenceTelescope",
  camera: "plannerDifferenceCamera",
  eyepiece: "plannerDifferenceEyepiece",
  modifier: "plannerDifferenceModifier",
  filters: "plannerDifferenceFilters",
  mount: "plannerDifferenceMount",
});

/** The separator of the list of places: "," or the ideographic "、". */
export const differenceSeparator = (locale = "en") =>
  /^(ja|zh)/.test(String(locale)) ? "、" : ", ";

/**
 * What the line of stage 2 says and offers, for the tests: `sentence`
 * (null without a configuration), `restore` and `saveAs` (whether each link
 * is shown).
 */
export function defaultConfigurationLineState({
  locale,
  equipment,
  configuration,
  smartTelescopeIds = [],
}) {
  const differences = equipmentConfigurationDifferences(
    equipment,
    configuration,
    smartTelescopeIds,
  );
  const sentence =
    differences === null
      ? null
      : differences.length === 0
        ? message(locale, "plannerConfigurationSame")
        : message(locale, "plannerConfigurationDiffers").replace(
            "{parts}",
            differences
              .map((kind) => message(locale, DIFFERENCE_KEYS[kind]))
              .join(differenceSeparator(locale)),
          );
  return {
    differences,
    sentence,
    restore: Boolean(differences?.length),
    saveAs: differences === null || differences.length > 0,
  };
}

/**
 * Under the rows of a plan's stage 2, for a person signed in to a space
 * "Differs from my default configuration: …" or "Same as my default
 * configuration." alone, without a frame, and under it, on the right, "Restore
 * my default configuration" (a link) when the plan differs. "Save as default
 * configuration" is a **secondary with an icon**, the action of the zone
 *. Never automatic: each gesture
 * is confirmed by [ConfigurationNotice].
 */
export function DefaultConfigurationLine({
  locale,
  equipment,
  configuration,
  smartTelescopeIds = [],
  editable = true,
  onRestore,
  onSaveAs,
}) {
  if (!editable) return null;
  const line = defaultConfigurationLineState({
    locale,
    equipment,
    configuration,
    smartTelescopeIds,
  });
  return (
    <div className="planner-default-configuration" data-r70="line">
      {line.sentence ? (
        <p className="planner-default-configuration-sentence">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v6" />
            <path d="M12 7.5h.01" />
          </svg>
          <span>{line.sentence}</span>
        </p>
      ) : null}
      {line.restore || line.saveAs ? (
        <div className="planner-default-configuration-actions">
          {line.restore ? (
            <button
              type="button"
              className="btn-link planner-default-configuration-restore"
              onClick={onRestore}
            >
              {message(locale, "plannerConfigurationRestore")}
            </button>
          ) : null}
          {line.saveAs ? (
            <button
              type="button"
              className="btn-secondary planner-default-configuration-save"
              onClick={onSaveAs}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 4h11l3 3v13H5z" />
                <path d="M8 4v5h7V4" />
                <path d="M8 20v-6h8v6" />
              </svg>
              {message(locale, "plannerConfigurationSaveAs")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A transient notice: the sentence of what was done and "Annuler", no dialog;
 * it goes by itself after eight seconds (its timer is the page's). A notice has
 * no primary: "Annuler" is a link.
 */
export function ConfigurationNotice({ locale, notice, onUndo }) {
  if (!notice || typeof document === "undefined") return null;
  return createPortal(
    <aside
      className="planner-add-notice planner-configuration-notice"
      key={notice.id}
      role="status"
      aria-live="polite"
    >
      <span>{notice.text}</span>
      <span className="planner-capability-notice-actions">
        <button className="btn-link" type="button" onClick={onUndo}>
          {message(locale, "plannerConfigurationUndo")}
        </button>
      </span>
    </aside>,
    document.body,
  );
}
