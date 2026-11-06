import { randomUUID } from "node:crypto";

/**
 * The link of a plan item to a multi-night plan (`planItem.projectId`) and
 * the rules every way of writing it obeys. Two routes write the link: the nights of
 * a multi-night plan (`api/project-nights.js`, `project-night-repository.js`)
 * and the plans themselves (a plan item sent with a `projectId`, by the web,
 * the phone or the API). The rules are the same, so they live here, once:
 *
 * - the right: the capability `planner.mosaic`, else
 *   `403 multi_night_not_active` naming it (a private server has no such
 *   right: it refuses too);
 * - the multi-night plan exists in the space, else `404 project_not_found`;
 * - the item is of the target of that plan, else `409 target_mismatch`;
 * - a night belongs to one multi-night plan at most: attaching moves it, and
 *   its own link (`observation_sessions.project_id`) gives way to the
 *   item's;
 * - taking the link away detaches (the integrations leave the plan); it
 *   needs the right too, and is idempotent.
 *
 * Everything here works inside the caller's transaction on the space
 * (`tenantId`).
 */

/** The capability of the gestures on a multi-night plan. */
export const MULTI_NIGHT_LINK_CAPABILITY = "planner.mosaic";

/** The refusal of a plan write in the read-only window. */
export const PLAN_READ_ONLY_MESSAGE =
  "This account's subscription has ended: plan writes are suspended; existing plans remain readable and exportable.";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const text = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/**
 * The identifiers a target of a multi-night plan answers to: its catalogue
 * target, or its framing and the catalogue target that framing was made
 * on.
 */
export function projectTargetKeys(target, framingTargetId = null) {
  const keys = new Set();
  for (const value of [target?.targetId, target?.framingId, framingTargetId])
    if (text(value)) keys.add(text(value));
  return keys;
}

/** The target identifiers one plan item answers to. */
export function planItemTargetKeys(item) {
  const keys = new Set();
  if (!item || typeof item !== "object") return keys;
  for (const value of [
    item.targetId,
    item.framingId,
    item.target?.id,
    item.target?.framingId,
    item.id,
  ])
    if (text(value)) keys.add(text(value));
  return keys;
}

export const meets = (keys, others) => [...others].some((key) => keys.has(key));

/** Whether a plan item is the target `keys` names. */
export const planItemIsTarget = (item, keys) =>
  meets(keys, planItemTargetKeys(item));

function parseJson(value, fallback) {
  try {
    return typeof value === "string" ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

/** The keys of a target, its framing's catalogue target included. */
export async function targetKeysOf(db, tenantId, target) {
  let framingTargetId = null;
  if (text(target?.framingId)) {
    const framing = (
      await db.query(
        "SELECT catalogue_target_id FROM framings WHERE id = ? AND tenant_id = ?",
        [text(target.framingId), tenantId],
      )
    ).rows[0];
    framingTargetId = framing?.catalogue_target_id ?? null;
  }
  return projectTargetKeys(target, framingTargetId);
}

/** The multi-night plan of the space with the keys of its target, or `null`. */
export async function projectOf(db, tenantId, projectId) {
  const row = (
    await db.query(
      "SELECT id, status, payload_json FROM projects WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
      [String(projectId ?? ""), tenantId],
    )
  ).rows[0];
  if (!row) return null;
  const payload = parseJson(row.payload_json, null);
  const fields =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload
      : {};
  return {
    id: row.id,
    status: row.status,
    target: fields.target ?? null,
    place: fields.place ?? null,
    keys: await targetKeysOf(db, tenantId, fields.target),
  };
}

export async function audit(tx, { tenantId, userId, eventType, details, at }) {
  await tx.run(
    "INSERT INTO audit_events (id, tenant_id, user_id, event_type, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [
      randomUUID(),
      tenantId,
      userId ?? null,
      eventType,
      JSON.stringify(details),
      at,
    ],
  );
}

// ——— What a plan write changes ———

const itemsList = (items) =>
  (Array.isArray(items) ? items : []).filter(
    (item) => item && typeof item === "object" && !Array.isArray(item),
  );

/**
 * The links a plan write changes, item by item (by item `id`): `attached`
 * for a link that appears or changes (moving to another multi-night plan
 * included), `detached` for a link taken away from an item that stays. An
 * item that disappears from the plan, and a link that does not change,
 * change nothing here.
 */
export function projectLinkChanges(previousItems, nextItems) {
  const before = new Map();
  for (const item of itemsList(previousItems))
    if (text(item.id) && text(item.projectId))
      before.set(text(item.id), text(item.projectId));
  const attached = [];
  const detached = [];
  for (const item of itemsList(nextItems)) {
    const id = text(item.id);
    if (!id) continue;
    const projectId = text(item.projectId);
    const was = before.get(id) ?? null;
    if (projectId && projectId !== was)
      attached.push({ item, projectId, previousProjectId: was });
    else if (!projectId && was) detached.push({ itemId: id, projectId: was });
  }
  return { attached, detached };
}

/** The plan document without any `projectId` on its items, canonical. */
export function withoutProjectLinks(payload, canonicalJson) {
  const items = itemsList(payload?.items).map((item) => {
    const { projectId: _projectId, ...rest } = item;
    return rest;
  });
  return canonicalJson({ ...(payload || {}), items });
}

const refusal = (code, message, status, details = {}) => ({
  refusal: { code, message, status, ...details },
});

// ——— The rules ———

/**
 * Checks, and writes nothing, the links a plan write changes.
 *
 * - `projectLinks` is the caller's right: `{ allowed, readOnly }`. `allowed`:
 *   the right to attach nights is held (and, in the read-only window, still
 *   held: `isWriteRefused`). `readOnly`: the read-only window is open, in
 *   which only the links may change.
 * - `restUnchanged`: whether the plan is the same apart from the links
 *   (asked only in the read-only window).
 *
 * Answers `{ links }` (to hand to `followPlanProjectLinks` once the write
 * has succeeded), `{ links: null }` when no link changes, or `{ refusal }`
 * (`code`, `message`, `status` and the details of the error body).
 */
export async function checkPlanProjectLinks(
  tx,
  { tenantId, projectLinks, previousItems, nextItems, restUnchanged = true },
) {
  const changes = projectLinkChanges(previousItems, nextItems);
  const changed = changes.attached.length + changes.detached.length > 0;
  if (projectLinks.readOnly && (!changed || !restUnchanged))
    return refusal("entitlement_read_only", PLAN_READ_ONLY_MESSAGE, 403);
  if (!changed) return { links: null };
  if (!projectLinks.allowed)
    return refusal(
      "multi_night_not_active",
      "Attaching nights to a multi-night plan needs a right this space does not hold: the plan keeps the links it has, none is written.",
      403,
      { capability: MULTI_NIGHT_LINK_CAPABILITY },
    );
  const attached = [];
  const projects = new Map();
  for (const { item, projectId } of changes.attached) {
    const project = uuidPattern.test(projectId)
      ? (projects.get(projectId.toLowerCase()) ??
        (await projectOf(tx, tenantId, projectId.toLowerCase())))
      : null;
    if (!project)
      return refusal(
        "project_not_found",
        "The multi-night plan was not found.",
        404,
        { projectId, planItemId: text(item.id) },
      );
    projects.set(project.id, project);
    if (!planItemIsTarget(item, project.keys))
      return refusal(
        "target_mismatch",
        "This plan item is not of the target of the multi-night plan.",
        409,
        { projectId, planItemId: text(item.id) },
      );
    attached.push({ project, itemId: text(item.id) });
  }
  return {
    links: { attached, detached: changes.detached },
  };
}

/**
 * What the links a successful plan write set carry along, in the same
 * transaction (what `POST /v1/projects/{id}/nights` and its `DELETE` do for
 * the same gesture): the night of the plan gives up its own link to another
 * multi-night plan (one plan at most), its integrations of the target follow
 * the plan, and a detached item's leave it. Answers the change domains to
 * signal after the commit.
 */
export async function followPlanProjectLinks(
  tx,
  { tenantId, userId, planId, links, at },
) {
  const domains = new Set();
  if (!links) return domains;
  const nights = (
    await tx.query(
      "SELECT id, project_id FROM observation_sessions WHERE tenant_id = ? AND plan_id = ?",
      [tenantId, planId],
    )
  ).rows;
  for (const { project, itemId } of links.attached) {
    for (const night of nights) {
      if (night.project_id) {
        await tx.run(
          "UPDATE observation_sessions SET project_id = NULL, updated_at = ? WHERE id = ? AND tenant_id = ?",
          [at, night.id, tenantId],
        );
        night.project_id = null;
        domains.add("sessions");
      }
      const keys = [...project.keys];
      if (keys.length) {
        const moved = await tx.run(
          `UPDATE project_integrations SET project_id = ?, updated_at = ?
           WHERE tenant_id = ? AND night_id = ?
             AND (project_id IS NULL OR project_id <> ?)
             AND target_id IN (${keys.map(() => "?").join(", ")})`,
          [project.id, at, tenantId, night.id, project.id, ...keys],
        );
        if (moved.rowCount) domains.add("projects");
      }
    }
    await audit(tx, {
      tenantId,
      userId,
      eventType: "project.nights_attached",
      details: { projectId: project.id, planIds: [planId], planItemId: itemId },
      at,
    });
    domains.add("projects");
  }
  for (const { projectId, itemId } of links.detached) {
    for (const night of nights)
      await tx.run(
        "UPDATE project_integrations SET project_id = NULL, updated_at = ? WHERE tenant_id = ? AND night_id = ? AND project_id = ?",
        [at, tenantId, night.id, projectId],
      );
    await audit(tx, {
      tenantId,
      userId,
      eventType: "project.night_detached",
      details: { projectId, planId, planItemId: itemId },
      at,
    });
    domains.add("projects");
  }
  return domains;
}
