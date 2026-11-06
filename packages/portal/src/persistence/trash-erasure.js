/**
 * The erasure of a plan or of a multi-night plan (`projects`) of the trash,
 * inside a transaction the caller holds: the path of « Supprimer
 * définitivement » (`plan-trash-repository.js`), and of a creation whose
 * identifier names a row in the trash (the identifiers Astro Sync derives
 * from what it sends: a second sending after a deletion replaces the row
 * instead of colliding with it). It imports no repository.
 */

/**
 * Erases one plan in `tx`: its items, framings and versions; a night run
 * from it (its session, live or in the trash) and a capture that names it
 * keep what they are and lose the plan.
 */
export async function erasePlanRows(tx, { tenantId, planId }) {
  await tx.run("DELETE FROM plan_items WHERE plan_id = ?", [planId]);
  const framings = await tx.run("DELETE FROM plan_framings WHERE plan_id = ?", [
    planId,
  ]);
  await tx.run(
    "DELETE FROM plan_versions WHERE tenant_id = ? AND plan_id = ?",
    [tenantId, planId],
  );
  const sessions = await tx.run(
    "UPDATE observation_sessions SET plan_id = NULL WHERE tenant_id = ? AND plan_id = ?",
    [tenantId, planId],
  );
  await tx.run(
    "UPDATE captures SET plan_id = NULL WHERE tenant_id = ? AND plan_id = ?",
    [tenantId, planId],
  );
  await tx.run(
    "UPDATE upload_sessions SET plan_id = NULL WHERE tenant_id = ? AND plan_id = ?",
    [tenantId, planId],
  );
  await tx.run("DELETE FROM plans WHERE id = ? AND tenant_id = ?", [
    planId,
    tenantId,
  ]);
  return {
    framings: framings.rowCount > 0,
    sessions: sessions.rowCount > 0,
  };
}

/** The ids of the plans a multi-night plan took to the trash with it. */
function trashedPlanIdsOf(row) {
  try {
    const plans = JSON.parse(row?.trash_json ?? "null")?.plans;
    return Array.isArray(plans)
      ? plans.filter((id) => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

/**
 * Erases one multi-night plan in `tx` (`row`, its stored row): the plans
 * that went to the trash with it and are still there go with it; its image
 * stays in the captures, and its nights in the Journal, without it.
 * Answers `{ plansErased }`.
 */
export async function eraseProjectRows(tx, { tenantId, row }) {
  let plansErased = 0;
  for (const planId of trashedPlanIdsOf(row)) {
    const trashed = (
      await tx.query(
        `SELECT id FROM plans WHERE id = ? AND tenant_id = ?
           AND deleted_at IS NOT NULL AND purge_at IS NOT NULL`,
        [planId, tenantId],
      )
    ).rows[0];
    if (!trashed) continue;
    await erasePlanRows(tx, { tenantId, planId });
    plansErased += 1;
  }
  await tx.run(
    "DELETE FROM project_integrations WHERE tenant_id = ? AND project_id = ?",
    [tenantId, row.id],
  );
  await tx.run(
    "UPDATE captures SET project_id = NULL WHERE tenant_id = ? AND project_id = ?",
    [tenantId, row.id],
  );
  await tx.run(
    "UPDATE observation_sessions SET project_id = NULL WHERE tenant_id = ? AND project_id = ?",
    [tenantId, row.id],
  );
  await tx.run("DELETE FROM projects WHERE id = ? AND tenant_id = ?", [
    row.id,
    tenantId,
  ]);
  return { plansErased };
}
