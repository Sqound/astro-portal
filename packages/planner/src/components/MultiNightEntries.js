"use client";

import { useEffect, useId, useRef, useState } from "react";
import { WebDialog } from "portal/components/dialog/WebDialog.js";
import { HeldChip } from "../offers-slot.js";
import { multiNightCoreCopy } from "../multi-night-access.js";

// What the open planner draws of the multi-night plans itself: the switch
// of the plans library, the question "Nouveau plan" asks, and the entries
// a person whose profile holds them back still sees, with the badge
// "Planification avancée" (`multi-night-access.js`). The views and dialogs
// of a multi-night plan are the shell's, registered at `planner.projects`.

/**
 * The chip of "Planification avancée" on every paid entry (it replaces the
 * badge). `label` is what the shell registered for the offers — present where
 * they are sold, absent on a server that sells nothing, where the entry
 * carries no chip.
 */
export function MultiNightBadge({ locale, label }) {
  return label ? (
    <HeldChip offer="planning" kind="locked" locale={locale} />
  ) : null;
}

/**
 * "Une nuit | Multi-nuits", the switch of the plans library. The "Planification
 * avancée" tag sits under "Multi-nuits", inside the choice, while the purchase
 * is missing (`badge`, present where the offers are sold); nothing once owned,
 * nothing where no offers are registered.
 */
export function PlanKindSwitch({ locale, value, onChange, badge = null }) {
  const copy = multiNightCoreCopy(locale);
  return (
    <div
      className={`session-view-switch plan-kind-switch${
        value === "multi" ? " is-multi" : ""
      }`}
      role="tablist"
      aria-label={copy.switchLabel}
    >
      {[
        ["one", copy.oneNight],
        ["multi", copy.multiNight],
      ].map(([kind, label]) => (
        <button
          key={kind}
          className={value === kind ? "is-active" : ""}
          type="button"
          role="tab"
          aria-selected={value === kind}
          data-plan-kind={kind}
          onClick={() => onChange(kind)}
        >
          <span>{label}</span>
          {kind === "multi" && (
            <MultiNightBadge locale={locale} label={badge} />
          )}
        </button>
      ))}
    </div>
  );
}

/**
 * "What do you want to prepare?": what "New plan" asks when the
 * multi-night plans are shown. "A one-night plan" is chosen first (the
 * common case); `onChoose("one" | "multi")` answers "Continue".
 */
export function NewPlanChoiceDialog({ locale, badge, onClose, onChoose }) {
  const copy = multiNightCoreCopy(locale);
  const [choice, setChoice] = useState("one");
  const name = `plan-kind-${useId().replace(/[^\w-]/g, "")}`;
  const option = (kind, title, help, icon) => (
    <label
      className={`plan-kind-option${choice === kind ? " is-selected" : ""}`}
      key={kind}
    >
      <span className="plan-kind-option-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">{icon}</svg>
      </span>
      <span className="plan-kind-option-text">
        <strong>{title}</strong>
        <small>{help}</small>
        {kind === "multi" && <MultiNightBadge locale={locale} label={badge} />}
      </span>
      <input
        type="radio"
        name={name}
        value={kind}
        checked={choice === kind}
        onChange={() => setChoice(kind)}
      />
    </label>
  );
  return (
    <WebDialog
      className="plan-kind-dialog"
      closeLabel={copy.close}
      onClose={onClose}
      title={copy.entryTitle}
      footer={
        <button
          className="btn-primary"
          type="button"
          onClick={() => onChoose(choice)}
        >
          {copy.continue}
        </button>
      }
    >
      <div
        className="plan-kind-options"
        role="radiogroup"
        aria-label={copy.entryTitle}
      >
        {option(
          "one",
          copy.entryOneNight,
          copy.entryOneNightHelp,
          <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
        )}
        {option(
          "multi",
          copy.entryMulti,
          copy.entryMultiHelp,
          <>
            <path d="M12 3l8 4.5-8 4.5-8-4.5z" />
            <path d="M4 12l8 4.5 8-4.5" />
            <path d="M4 16.5L12 21l8-4.5" />
          </>,
        )}
      </div>
    </WebDialog>
  );
}

/**
 * "Suivre sur plusieurs nuits" on the open card of the night's schedule,
 * held back: the button and its badge, which say why when pressed.
 */
export function HeldFollowAction({ locale, badge, onPress }) {
  const copy = multiNightCoreCopy(locale);
  return (
    <div className="multi-night-follow is-held">
      <button className="btn-tertiary" type="button" onClick={onPress}>
        {copy.follow}
      </button>
      <MultiNightBadge locale={locale} label={badge} />
    </div>
  );
}

/**
 * "Actions du plan" (⋮): a small menu of a plan's actions. `items` are
 * `{ key, label, badge?, onSelect }`. Shared with the shell, which fills it
 * with the multi-night plan's own actions.
 */
export function PlanActionsMenu({ label, items, locale = "en" }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const menuId = `plan-actions-${useId().replace(/[^\w-]/g, "")}`;
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  if (!items.length) return null;
  return (
    <span className="plan-actions" ref={rootRef}>
      <button
        className="plan-actions-trigger"
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="5.5" r="1.4" />
          <circle cx="12" cy="12" r="1.4" />
          <circle cx="12" cy="18.5" r="1.4" />
        </svg>
      </button>
      {open && (
        <ul className="plan-actions-menu" id={menuId} role="menu">
          {items.map((item) => (
            <li key={item.key} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                <span>{item.label}</span>
                <MultiNightBadge locale={locale} label={item.badge} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
