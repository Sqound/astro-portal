import {
  stepResourceForRow,
  stepRowsFor,
} from "../persistence/night-repository.js";
import { parse } from "./capture-metadata.js";

/**
 * The steps of a night that belong to a capture's targets — what the
 * capture's « Intégrations » read while it has no line of its own, and what
 * « Synchroniser avec la session » copies. Kept apart from
 * `capture-metadata-reading.js` (which reaches the Moon's computation) so
 * that the service of the lines can be loaded without it.
 */

const compactName = (value) =>
  String(value || "")
    .replace(/\s+/g, "")
    .toUpperCase();

/** The designations and aliases of some catalogue rows, spaces and case ignored. */
async function designationsOf(db, ids) {
  const rows = (
    await db.query(
      `SELECT designation, aliases_json FROM target_catalogue_entries
       WHERE id IN (${ids.map(() => "?").join(", ")})`,
      ids,
    )
  ).rows;
  const names = new Set();
  for (const row of rows) {
    names.add(compactName(row.designation));
    for (const alias of parse(row.aliases_json, []) || [])
      if (typeof alias === "string") names.add(compactName(alias));
  }
  names.delete("");
  return names;
}

/**
 * The night's steps (as `stepResourceForRow` gives them) for the capture's
 * targets; every step of the night when the capture names no target.
 */
export async function nightStepsFor(db, sessionId, targetIds) {
  const allSteps = (await stepRowsFor(db, sessionId)).map(stepResourceForRow);
  const wanted = new Set(targetIds || []);
  const designations = wanted.size
    ? await designationsOf(db, [...wanted])
    : new Set();
  return wanted.size
    ? allSteps.filter(
        (step) =>
          (step.targetId && wanted.has(step.targetId)) ||
          // A step names its target by the hint (the FITS OBJECT, the old
          // sheet's designation) as well as by the row the hint resolved
          // to: two rows of the catalogue may share a designation, and the
          // capture's target is the one its steps name.
          (step.targetHint && designations.has(compactName(step.targetHint))),
      )
    : allSteps;
}
