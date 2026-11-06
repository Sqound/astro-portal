import { randomUUID } from "node:crypto";
import { referencedFramingIds } from "../persistence/plan-framing-hydration.js";
import { replacePlanFramings } from "../persistence/framing-repository.js";
import {
  cappedPlaceInstant,
  placeInstant,
} from "../persistence/place-repository.js";
import {
  canonicalJson,
  normalizedPlanFields,
  parseJson,
  replacePlanItems,
} from "../persistence/planner-state-repository.js";
import { emptyExisting, skyMeasureKey } from "./plan.js";

/**
 * « Importer mes données »: what the import reads of the portal and what it
 * writes, on the tables of the repositories it is built on —
 * `planner-state-repository.js` (plans and their items, the planner
 * document's nights, places and horizons), `framing-repository.js`
 * (framings, the plans' references to them), `equipment-reader.js`
 * (equipment), `observation-session-repository.js` and
 * `debrief-repository.js` (the nights, their events, the debriefing kept on
 * its plan), `place-sky-measure-repository.js` (the measured sky
 * backgrounds), and the multi-night plans (`projects`, read the same way by
 * the export). Every statement here runs inside the one transaction of the
 * import (`./service.js`): the repositories' own writers each open theirs,
 * and a transaction does not nest. Each row is written the way its
 * repository writes a new one, with the identifiers the file gives; a row
 * already there is never touched — the plan (`./plan.js`) never hands one
 * here.
 */

const CHUNK = 500;

function chunks(values) {
  const result = [];
  for (let index = 0; index < values.length; index += CHUNK)
    result.push(values.slice(index, index + CHUNK));
  return result;
}

/** Rows whose `column` is one of `values`, `sql` holding `{in}`. */
async function rowsIn(driver, sql, params, values) {
  const rows = [];
  for (const part of chunks(values)) {
    const placeholders = part.map(() => "?").join(", ");
    rows.push(
      ...(
        await driver.query(sql.replace("{in}", placeholders), [
          ...params,
          ...part,
        ])
      ).rows,
    );
  }
  return rows;
}

/** Splits rows `{ id, tenant_id }` into this space's and another's. */
function bySpace(rows, tenantId, into) {
  for (const row of rows)
    (row.tenant_id === tenantId ? into.space : into.other).add(row.id);
  return into;
}

/**
 * What the portal holds of the file's identifiers (`dataImportIdentifiers`),
 * as `dataImportPlan` reads it (`existing`).
 */
export async function existingForImport(driver, tenantId, identifiers) {
  const existing = emptyExisting();
  bySpace(
    await rowsIn(
      driver,
      "SELECT id, tenant_id FROM plans WHERE id IN ({in})",
      [],
      identifiers.planResourceIds,
    ),
    tenantId,
    existing.plans,
  );
  // The plans that fill a night or a slot of the space's offer: the same
  // selection the plan service makes before it refuses a plan beyond its
  // limit (`refuseBeyondPlanLimit`).
  existing.nightPlans = (
    await driver.query(
      "SELECT id, plan_date, status FROM plans WHERE tenant_id = ? AND status IN (?, ?, ?) AND deleted_at IS NULL AND guided_evening = 0",
      [tenantId, "pending", "executed", "partial"],
    )
  ).rows.map((row) => ({
    id: row.id,
    date: String(row.plan_date ?? "").slice(0, 10),
    status: row.status,
  }));
  for (const row of await rowsIn(
    driver,
    "SELECT client_id FROM plans WHERE tenant_id = ? AND client_id IN ({in})",
    [tenantId],
    identifiers.planClientIds,
  ))
    existing.plans.clientIds.add(row.client_id);
  // A debriefing names its plan: a plan of this space it names is « already
  // there » even when the file does not carry it.
  bySpace(
    await rowsIn(
      driver,
      "SELECT id, tenant_id FROM plans WHERE id IN ({in})",
      [],
      identifiers.sessionPlanIds,
    ),
    tenantId,
    existing.plans,
  );
  for (const row of await rowsIn(
    driver,
    "SELECT plan_id FROM observation_sessions WHERE tenant_id = ? AND plan_id IN ({in})",
    [tenantId],
    identifiers.sessionPlanIds,
  ))
    existing.plans.withSession.add(row.plan_id);
  bySpace(
    await rowsIn(
      driver,
      "SELECT id, tenant_id FROM projects WHERE id IN ({in})",
      [],
      identifiers.projectIds,
    ),
    tenantId,
    existing.projects,
  );
  // A place the space deleted (a tombstone) counts as held: the import of a
  // place never changes an id the space holds, live or deleted.
  for (const row of await rowsIn(
    driver,
    "SELECT client_id FROM known_locations WHERE tenant_id = ? AND client_id IN ({in})",
    [tenantId],
    identifiers.placeIds,
  ))
    existing.places.add(row.client_id);
  for (const row of await rowsIn(
    driver,
    "SELECT client_id FROM horizon_profiles WHERE tenant_id = ? AND client_id IN ({in})",
    [tenantId],
    identifiers.horizonProfileIds,
  ))
    existing.horizonProfiles.add(row.client_id);
  const context = parseJson(
    (
      await driver.query(
        "SELECT details_json FROM planner_contexts WHERE tenant_id = ?",
        [tenantId],
      )
    ).rows[0]?.details_json,
    {},
  );
  if (context?.schemaVersion === 2) {
    existing.unassignedHorizonContext = true;
    for (const profile of Array.isArray(context.unassignedHorizonProfiles)
      ? context.unassignedHorizonProfiles
      : [])
      if (profile?.id) existing.horizonProfiles.add(String(profile.id));
    for (const night of Array.isArray(context.nights) ? context.nights : [])
      if (night?.id) existing.nights.add(String(night.id));
  }
  // The planner's nights live in its document of version 2; a space whose
  // planner has never been saved has none yet, and the import starts it.
  existing.nightsContext =
    context?.schemaVersion === 2 || Object.keys(context || {}).length === 0;
  bySpace(
    await rowsIn(
      driver,
      "SELECT id, tenant_id FROM equipment WHERE id IN ({in})",
      [],
      identifiers.equipmentIds,
    ),
    tenantId,
    existing.equipment,
  );
  for (const row of await rowsIn(
    driver,
    "SELECT id, tenant_id, deleted_at FROM framings WHERE id IN ({in})",
    [],
    identifiers.framingIds,
  )) {
    if (row.tenant_id !== tenantId) existing.framings.other.add(row.id);
    else {
      existing.framings.space.add(row.id);
      if (!row.deleted_at) existing.framings.live.add(row.id);
    }
  }
  bySpace(
    await rowsIn(
      driver,
      "SELECT id, tenant_id FROM observation_sessions WHERE id IN ({in})",
      [],
      identifiers.sessionIds,
    ),
    tenantId,
    existing.sessions,
  );
  for (const row of await rowsIn(
    driver,
    "SELECT client_session_id FROM observation_sessions WHERE tenant_id = ? AND client_session_id IN ({in})",
    [tenantId],
    identifiers.clientSessionIds,
  ))
    existing.sessions.clientSessionIds.add(row.client_session_id);
  for (const row of await rowsIn(
    driver,
    "SELECT place_id, night FROM place_sky_measures WHERE tenant_id = ? AND place_id IN ({in})",
    [tenantId],
    identifiers.skyMeasurePlaceIds,
  ))
    existing.skyMeasures.add(skyMeasureKey(row.place_id, row.night));
  return existing;
}

/** The same lock a plan write takes: one import (or plan write) at a time
 * per space on PostgreSQL; SQLite serialises its writers by itself. */
export async function lockSpace(transaction, tenantId) {
  if (transaction.dialect === "postgres")
    await transaction.query(
      "SELECT id FROM organizations WHERE id = ? FOR UPDATE",
      [tenantId],
    );
}

const stamp = (value, fallback) =>
  typeof value === "string" && value ? value : fallback;
const revisionOf = (value) => {
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision >= 1 ? revision : 1;
};

async function writeFramings(tx, { tenantId, userId, framings, timestamp }) {
  for (const { id, framing, archive, ra, dec, name } of framings) {
    const payload = framing.payload;
    const catalogueTargetId =
      typeof payload?.catalogueTargetId === "string" &&
      payload.catalogueTargetId.trim()
        ? payload.catalogueTargetId.trim()
        : null;
    // The column follows the payload's position angle, `0` without one.
    const angle = Number(payload?.angleDegrees);
    const angleDegrees =
      Number.isFinite(angle) && angle >= 0 && angle < 360 ? angle : 0;
    await tx.run(
      `INSERT INTO framings (id, tenant_id, created_by_user_id, origin_device_id, name, revision, catalogue_target_id, center_ra, center_dec, angle_degrees, payload_json, archived_at, deleted_at, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      [
        id,
        tenantId,
        userId || null,
        name,
        revisionOf(framing.revision),
        catalogueTargetId,
        ra,
        dec,
        angleDegrees,
        canonicalJson(payload),
        archive ? timestamp : stamp(framing.archivedAt, null),
        stamp(framing.createdAt, timestamp),
        stamp(framing.updatedAt, timestamp),
      ],
    );
  }
}

async function writePlans(tx, { tenantId, userId, plans, timestamp }) {
  for (const { resourceId, payload, status, debrief, archive } of plans) {
    const planId = resourceId || randomUUID();
    const fields = normalizedPlanFields(payload);
    const targets = debrief?.targets?.length
      ? JSON.stringify(debrief.targets)
      : null;
    await tx.run(
      `INSERT INTO plans (id, tenant_id, created_by_user_id, client_id, plan_date, name, location_json, equipment_json, min_altitude, settings_json, status, archived_at, created_at, updated_at, revision, payload_json, night_start_at, night_end_at, night_bounds_resolved_at, frozen_at, debrief_targets_json, guided_evening)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
      [
        planId,
        tenantId,
        userId,
        fields.clientId,
        fields.planDate,
        fields.name,
        fields.locationJson,
        fields.equipmentJson,
        fields.minAltitude,
        fields.settingsJson,
        archive ? "archived" : debrief?.outcome || status,
        archive ? timestamp : stamp(payload.archivedAt, null),
        timestamp,
        timestamp,
        fields.payloadJson,
        fields.nightStartAt,
        fields.nightEndAt,
        timestamp,
        debrief?.decidedAt || null,
        targets,
        fields.guidedEvening,
      ],
    );
    await replacePlanItems(tx, {
      tenantId,
      planId,
      items: fields.items,
      timestamp,
    });
    await replacePlanFramings(tx, {
      tenantId,
      planId,
      framingIds: referencedFramingIds(fields.items),
    });
  }
}

async function writeProjects(tx, { tenantId, projects, timestamp }) {
  for (const { id, project, archive } of projects) {
    const {
      id: _id,
      revision,
      status,
      createdAt,
      updatedAt,
      ...payload
    } = project;
    await tx.run(
      "INSERT INTO projects (id, tenant_id, revision, status, payload_json, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)",
      [
        id,
        tenantId,
        revisionOf(revision),
        archive ? "archived" : String(status),
        canonicalJson(payload),
        stamp(createdAt, timestamp),
        stamp(updatedAt, timestamp),
      ],
    );
  }
}

async function writePlaces(tx, { tenantId, writes, timestamp }) {
  // A place of the archive keeps the instant of its last edit (the rule
  // of the most recent edit reads it), capped at the clock + 5 minutes;
  // the service's own fields of an exported place are not data.
  for (const { id, place } of writes.places) {
    const {
      usage: _usage,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      editedAt,
      ...details
    } = place;
    const instant = placeInstant(editedAt);
    await tx.run(
      "INSERT INTO known_locations (id, tenant_id, client_id, details_json, created_at, updated_at, edited_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        randomUUID(),
        tenantId,
        id,
        JSON.stringify(details),
        timestamp,
        timestamp,
        instant ? cappedPlaceInstant(instant, timestamp) : timestamp,
      ],
    );
  }
  for (const { id, profile } of writes.horizonProfiles)
    await tx.run(
      "INSERT INTO horizon_profiles (id, tenant_id, client_id, details_json, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)",
      [
        randomUUID(),
        tenantId,
        id,
        JSON.stringify(profile),
        timestamp,
        timestamp,
      ],
    );
  if (writes.unassignedHorizonProfiles.length) {
    // Added to the planner document's horizons without a place, after the
    // ones it holds; none of them is replaced.
    const context = parseJson(
      (
        await tx.query(
          "SELECT details_json FROM planner_contexts WHERE tenant_id = ?",
          [tenantId],
        )
      ).rows[0]?.details_json,
      {},
    );
    const held = Array.isArray(context.unassignedHorizonProfiles)
      ? context.unassignedHorizonProfiles
      : [];
    await tx.run(
      "UPDATE planner_contexts SET details_json = ?, updated_at = ? WHERE tenant_id = ?",
      [
        JSON.stringify({
          ...context,
          unassignedHorizonProfiles: [
            ...held,
            ...writes.unassignedHorizonProfiles.map(({ profile }) => profile),
          ],
        }),
        timestamp,
        tenantId,
      ],
    );
  }
}

/**
 * The planner's nights, added to its document after the ones it holds;
 * none of them is replaced. A space whose planner was never saved gets the
 * document of version 2 these nights need (no active night, no date: the
 * planner chooses them when it opens).
 */
async function writeNights(tx, { tenantId, nights, timestamp }) {
  if (!nights.length) return;
  const context = parseJson(
    (
      await tx.query(
        "SELECT details_json FROM planner_contexts WHERE tenant_id = ?",
        [tenantId],
      )
    ).rows[0]?.details_json,
    {},
  );
  const held = Array.isArray(context.nights) ? context.nights : [];
  const document =
    context.schemaVersion === 2
      ? context
      : {
          schemaVersion: 2,
          sync: null,
          nights: [],
          activeNightId: null,
          activePlanId: null,
          date: null,
          unassignedHorizonProfiles: [],
        };
  await tx.run(
    "INSERT INTO planner_contexts (tenant_id, details_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(tenant_id) DO UPDATE SET details_json = excluded.details_json, updated_at = excluded.updated_at",
    [
      tenantId,
      JSON.stringify({
        ...document,
        nights: [...held, ...nights.map(({ night }) => night)],
      }),
      timestamp,
    ],
  );
}

async function writeEquipment(tx, { tenantId, equipment, timestamp }) {
  const nextOrder = new Map();
  for (const { id, item, type, name } of equipment) {
    if (!nextOrder.has(type))
      nextOrder.set(
        type,
        Number(
          (
            await tx.query(
              "SELECT COALESCE(MAX(preference_order), -1) + 1 AS next_order FROM equipment WHERE tenant_id = ? AND equipment_type = ?",
              [tenantId, type],
            )
          ).rows[0].next_order,
        ),
      );
    const order = nextOrder.get(type);
    nextOrder.set(type, order + 1);
    const object = (value) =>
      value && typeof value === "object" && !Array.isArray(value) ? value : {};
    await tx.run(
      "INSERT INTO equipment (id, tenant_id, equipment_type, name, manufacturer, model, is_binoculars, specifications_json, planner_json, notes, created_at, updated_at, archived_at, preference_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        id,
        tenantId,
        type,
        name,
        String(item.manufacturer || "").trim() || null,
        String(item.model || "").trim() || null,
        item.isBinoculars ? 1 : 0,
        JSON.stringify(object(item.specifications)),
        JSON.stringify(object(item.planner)),
        String(item.notes || "").trim() || null,
        stamp(item.createdAt, timestamp),
        stamp(item.updatedAt, timestamp),
        stamp(item.archivedAt, null),
        order,
      ],
    );
  }
}

async function writeSessions(tx, { tenantId, sessions, timestamp }) {
  for (const { id, planId, clientSessionId, session } of sessions) {
    const createdAt = stamp(session.createdAt, session.startedAt);
    await tx.run(
      `INSERT INTO observation_sessions (id, tenant_id, plan_id, client_session_id, started_at, finished_at, status, created_at, updated_at, origin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'import')`,
      [
        id,
        tenantId,
        planId,
        clientSessionId,
        session.startedAt,
        stamp(session.finishedAt, null),
        session.status,
        createdAt,
        stamp(session.updatedAt, createdAt),
      ],
    );
    // The device that sent an event belongs to the portal it came from: here
    // it is no device (`origin_device_id` NULL), the event itself is kept.
    for (const event of session.events)
      await tx.run(
        `INSERT INTO session_events (event_id, session_id, type, payload, recorded_at, received_at, origin_device_id, timing, source)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
         ON CONFLICT (session_id, event_id) DO NOTHING`,
        [
          event.eventId,
          id,
          event.type,
          JSON.stringify(event.payload ?? {}),
          event.recordedAt,
          stamp(event.receivedAt, timestamp),
          stamp(event.timing, null),
          event.source === "astro-sync" || event.source === "declared"
            ? event.source
            : null,
        ],
      );
  }
}

async function writeSkyMeasures(tx, { tenantId, skyMeasures, timestamp }) {
  for (const { placeId, measure } of skyMeasures)
    await tx.run(
      `INSERT INTO place_sky_measures (id, tenant_id, place_id, night, sqm, pose_count, method_version, observed_at, session_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        tenantId,
        placeId,
        measure.night,
        Number(measure.sqm),
        measure.poseCount,
        measure.methodVersion,
        measure.observedAt,
        stamp(measure.sessionId, null),
        timestamp,
        stamp(measure.updatedAt, timestamp),
      ],
    );
}

/**
 * Writes the plan's `writes` inside `tx`, framings before the plans that
 * name them and plans before their nights, then the audit line. Answers the
 * change-signal domains it touched.
 */
export async function writeDataImport(
  tx,
  { tenantId, userId, writes, timestamp, counts },
) {
  await writeFramings(tx, {
    tenantId,
    userId,
    framings: writes.framings,
    timestamp,
  });
  await writePlans(tx, { tenantId, userId, plans: writes.plans, timestamp });
  await writeProjects(tx, { tenantId, projects: writes.projects, timestamp });
  await writePlaces(tx, { tenantId, writes, timestamp });
  await writeNights(tx, { tenantId, nights: writes.nights, timestamp });
  await writeEquipment(tx, {
    tenantId,
    equipment: writes.equipment,
    timestamp,
  });
  await writeSessions(tx, { tenantId, sessions: writes.sessions, timestamp });
  await writeSkyMeasures(tx, {
    tenantId,
    skyMeasures: writes.skyMeasures,
    timestamp,
  });
  await tx.run(
    "INSERT INTO audit_events (id, tenant_id, user_id, event_type, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [
      randomUUID(),
      tenantId,
      userId || null,
      "data.imported",
      JSON.stringify(counts),
      timestamp,
    ],
  );
  const domains = [];
  if (writes.plans.length || writes.nights.length) domains.push("plans");
  if (writes.plans.some((plan) => plan.debrief)) domains.push("debrief");
  if (writes.projects.length) domains.push("projects");
  if (
    writes.places.length ||
    writes.horizonProfiles.length ||
    writes.unassignedHorizonProfiles.length ||
    writes.skyMeasures.length
  )
    domains.push("places");
  if (writes.framings.length) domains.push("framings");
  if (writes.equipment.length) domains.push("equipment");
  if (writes.sessions.length) domains.push("sessions");
  return domains;
}
