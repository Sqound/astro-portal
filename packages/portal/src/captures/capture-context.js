/**
 * What a capture's detail is built from, read from the database: its
 * catalogue targets in their order, the observation session and the plan it
 * belongs to (each target with its object type and its catalogues, from
 * which the private gallery derives its generic tags), and the names of
 * that night's telescope and camera — every row bounded by the capture's
 * space. The owner's tab (`owner-captures.js`) and the private gallery
 * (`private-gallery/private-gallery.js`) read the same rows, and
 * `captureDetail` decides what each audience receives of them.
 */

import { combinedEveningDates } from "../persistence/combined-nights.js";
import { EQUIPMENT_KIND, selectedEquipment } from "./public-capture-view.js";

const parse = (value) => {
  if (typeof value !== "string" || !value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export async function readCaptureContext(
  db,
  tenantId,
  capture,
  // `equipmentItems` (one read per piece of equipment) only for the page
  // that draws them, not for every card of a list.
  { withEquipmentItems = false } = {},
) {
  const targetIds = (
    await db.query(
      "SELECT target_id FROM capture_targets WHERE capture_id = ? ORDER BY position",
      [capture.id],
    )
  ).rows.map((entry) => entry.target_id);
  const targets = [];
  if (targetIds.length) {
    const found = (
      await db.query(
        `SELECT id, designation, aliases_json, common_names_json, type_key,
                constellation_key, ra_hours, dec_degrees, catalogues_json
         FROM target_catalogue_entries
         WHERE id IN (${targetIds.map(() => "?").join(", ")})`,
        targetIds,
      )
    ).rows;
    for (const id of targetIds) {
      const entry = found.find((candidate) => candidate.id === id);
      targets.push(entry || { id, designation: id });
    }
  }
  const session = capture.session_id
    ? (
        await db.query(
          "SELECT id, plan_id, started_at FROM observation_sessions WHERE id = ? AND tenant_id = ?",
          [capture.session_id, tenantId],
        )
      ).rows[0] || null
    : null;
  const planId = capture.plan_id || session?.plan_id || null;
  const plan = planId
    ? (
        await db.query(
          "SELECT id, plan_date, location_json, equipment_json FROM plans WHERE id = ? AND tenant_id = ?",
          [planId, tenantId],
        )
      ).rows[0] || null
    : null;
  const selection = parse(plan?.equipment_json) || {};
  const equipmentIds = [selection.telescopeId, selection.cameraId].filter(
    (value) => typeof value === "string" && value,
  );
  // The whole equipment of the night by kind, as the public gallery's
  // detail page draws it (a lens is a telescope, a space's own rows and
  // the administration's defaults only).
  const equipmentItems = [];
  for (const id of withEquipmentItems ? selectedEquipment(selection) : []) {
    const row = (
      await db.query(
        "SELECT equipment_type, name FROM equipment WHERE id = ? AND (tenant_id = ? OR scope = 'default')",
        [id, tenantId],
      )
    ).rows[0];
    const kind = EQUIPMENT_KIND[row?.equipment_type];
    if (kind && row.name) equipmentItems.push({ kind, name: row.name });
  }
  const equipment = [];
  // The telescope's name alone, the instrument of a card of « Mon
  // espace › Captures » (« Galaxie · Askar 50P »).
  let telescope = null;
  for (const id of equipmentIds) {
    const named = (
      await db.query(
        "SELECT name FROM equipment WHERE id = ? AND tenant_id = ?",
        [id, tenantId],
      )
    ).rows[0];
    if (named?.name) {
      equipment.push(named.name);
      if (id === selection.telescopeId) telescope = named.name;
    }
  }
  return {
    targetIds,
    targets,
    session,
    plan,
    equipment,
    equipmentItems,
    telescope,
    // The evenings of the nights the image of a multi-night plan combines
    // (none for a capture of one night).
    nightDates: await combinedEveningDates(db, tenantId, capture),
  };
}
