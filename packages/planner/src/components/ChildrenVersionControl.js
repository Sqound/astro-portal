"use client";

import { useSyncExternalStore } from "react";
import { message } from "portal/i18n.js";
import {
  childrenVersionServerSnapshot,
  childrenVersionSnapshot,
  hasChildrenVersion,
  subscribeChildrenVersion,
  writeChildrenVersion,
} from "portal/children-version.js";

// "Pour les enfants" on a target sheet of the web: a tertiary button (icon +
// word) that switches the text of the sheet to the target's
// children's version, and, for a target that has none yet, the thin line
// "Children's version coming soon" under it. The choice is remembered in this
// browser and shared by every sheet.

/** The device's choice, re-read when a sheet changes it. */
export function useChildrenVersion() {
  return useSyncExternalStore(
    subscribeChildrenVersion,
    childrenVersionSnapshot,
    childrenVersionServerSnapshot,
  );
}

/**
 * The control and its line. `knowledge` is the target's knowledge as the
 * sheet read it (nothing is drawn while it is not loaded).
 */
export function ChildrenVersionControl({ knowledge, locale, className = "" }) {
  const on = useChildrenVersion();
  if (!knowledge) return null;
  return (
    <div className={`children-version ${className}`.trim()}>
      <button
        type="button"
        className="btn-tertiary children-version-switch"
        aria-pressed={on}
        onClick={() => writeChildrenVersion(!on)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5.5 19.5c.6-3.6 3.1-5.5 6.5-5.5s5.9 1.9 6.5 5.5" />
          {on ? <path d="M9.4 7.8l1.7 1.6 3.5-3.5" /> : null}
        </svg>
        {message(locale, "targetChildrenVersion")}
      </button>
      {hasChildrenVersion(knowledge) ? null : (
        <p className="children-version-soon">
          {message(locale, "targetChildrenVersionSoon")}
        </p>
      )}
    </div>
  );
}
