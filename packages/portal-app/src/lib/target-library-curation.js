import { targetLookupKey, targetLookupKeys } from "portal/target-library.js";
import {
  defaultTargetSelection,
  targetSelectionVersion,
} from "astro-core/target-selection.js";

// The default editorial selections are a data file,
// `packages/astro-core/sky-data/target-selection.json` (TARGET-SELECTIONS-
// TAGS-01): « Essentielles » and « Étendues », disjoint, each target with its
// modes (`visual`, `photo`). The rule for adding a target is in
// docs/STATIC_DATA.md. The memberships are stored in the database and remain
// editable in Administration.

export const targetCurationVersion = targetSelectionVersion;

function byLookupKey(targets) {
  const lookup = new Map();
  for (const target of targets) {
    for (const key of targetLookupKeys(target)) {
      if (!lookup.has(key)) lookup.set(key, target);
    }
  }
  return lookup;
}

/**
 * Returns the default editorial selection of `targets`, not an
 * observing-site constraint: `best` (« Essentielles ») and `extended`
 * (« Étendues »), two disjoint sets of identifiers, and the `modes` of each
 * of their targets. A target of the file is found by its identifier, else
 * by its designation (a catalogue that numbers it otherwise); a target the
 * catalogue does not hold is left out. The administrator can change every
 * resulting membership afterwards.
 */
export function targetCurationForTargets(targets) {
  const source = Array.isArray(targets) ? targets : [];
  const byId = new Map(source.map((target) => [target.id, target]));
  let lookup = null;
  const best = new Set();
  const extended = new Set();
  const modes = new Map();
  for (const entry of defaultTargetSelection()) {
    let target = byId.get(entry.id);
    if (!target) {
      lookup ??= byLookupKey(source);
      target = lookup.get(targetLookupKey(entry.designation));
    }
    if (!target || best.has(target.id) || extended.has(target.id)) continue;
    (entry.tier === "essential" ? best : extended).add(target.id);
    modes.set(target.id, entry.modes);
  }
  return {
    version: targetCurationVersion,
    best,
    extended,
    modes,
    counts: { best: best.size, extended: extended.size },
  };
}
