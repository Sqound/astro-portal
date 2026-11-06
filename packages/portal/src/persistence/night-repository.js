import { randomUUID } from "node:crypto";
import { createDatabaseDriver } from "./database.js";
import { applyMigrations } from "./migration-runner.js";
import { sessionRowById } from "./observation-session-repository.js";
import { listLivePlaces } from "./place-repository.js";
import { parseJson, planRowFor } from "./planner-state-repository.js";
import { publishChange } from "../api/change-bus.js";

// "Session" here is always an OBSERVATION session — the night; see the
// naming note at the top of observation-session-repository.js.

const now = () => new Date().toISOString();

/** A package-level error that route adapters map to the v1 error envelope. */
export class NightRepositoryError extends Error {
  constructor(code, message, { status = 400, ...details } = {}) {
    super(message);
    this.name = "NightRepositoryError";
    this.code = code;
    this.status = status;
    Object.assign(this, details);
  }
}

const number = (value) =>
  value === null || value === undefined || value === "" ? null : Number(value);

/**
 * One acquisition step as the contract writes it (`session.schema.json`,
 * `step`): the integration is computed (frames × exposure), never stored;
 * `edited` marks a step corrected by hand (« modifié »). Binning and sensor
 * temperature stay in the row, never shown.
 */
export function stepResourceForRow(row) {
  const frameCount = Number(row.frame_count);
  const exposureSeconds = Number(row.exposure_seconds);
  return {
    id: row.id,
    sessionId: row.session_id,
    targetId: row.target_id ?? null,
    targetHint: row.target_hint ?? null,
    filter: row.filter ?? null,
    frameCount,
    exposureSeconds,
    gain: number(row.gain),
    integrationSeconds: Math.round(frameCount * exposureSeconds * 1000) / 1000,
    origin: row.origin,
    stepKey: row.step_key ?? null,
    edited: Boolean(row.edited_at),
    editedAt: row.edited_at ?? null,
    position: Number(row.position),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The night's steps in their order. */
export async function stepRowsFor(db, sessionId) {
  return (
    await db.query(
      "SELECT * FROM acquisition_steps WHERE session_id = ? ORDER BY position, created_at, id",
      [sessionId],
    )
  ).rows;
}

async function nextPosition(db, sessionId) {
  const row = (
    await db.query(
      "SELECT COALESCE(MAX(position), 0) AS last FROM acquisition_steps WHERE session_id = ?",
      [sessionId],
    )
  ).rows[0];
  return Number(row?.last || 0) + 1;
}

const compactName = (value) =>
  String(value || "")
    .replace(/\s+/g, "")
    .toUpperCase();

/**
 * The targets of the space a report's `targetHint`s name (the FITS
 * `OBJECT` header): the hint compared with each target's designation,
 * spaces and case ignored (« M 31 » is M31). A personal target of the
 * space wins over the catalogue; a hint that names nothing stays a hint.
 * Only the catalogue the service holds now counts (`source_present = 1`,
 * as everywhere else the catalogue is read): a row a previous library left
 * behind (the curated fallback, `curated-ic1805`, retired when the
 * OpenNGC library was loaded) names no target, so that a night's step and
 * a capture of the same target (`openngc-ic1805`) agree.
 */
export async function resolveTargetHints(db, tenantId, hints) {
  const wanted = [...new Set(hints.filter(Boolean).map(compactName))].filter(
    Boolean,
  );
  const resolved = new Map();
  if (!wanted.length) return resolved;
  const rows = (
    await db.query(
      `SELECT id, designation, space_id FROM target_catalogue_entries
       WHERE ((space_id IS NULL AND source_present = 1) OR space_id = ?)
         AND REPLACE(UPPER(designation), ' ', '') IN (${wanted.map(() => "?").join(", ")})`,
      [tenantId, ...wanted],
    )
  ).rows;
  for (const row of rows) {
    const key = compactName(row.designation);
    const held = resolved.get(key);
    if (!held || (row.space_id && !held.personal))
      resolved.set(key, { id: row.id, personal: Boolean(row.space_id) });
  }
  return new Map([...resolved].map(([key, value]) => [key, value.id]));
}

/**
 * A new analysis of the night: the
 * steps the previous analysis or import proposed and nobody touched are
 * replaced by the report's; a step corrected by hand stays (« modifié »),
 * and so does a manual step. A report's step whose key is the key of a
 * step corrected by hand is not added again: the correction wins, the step
 * is never doubled. Runs inside the caller's transaction.
 *
 * -> { proposed, keptEdited }
 */
export async function replaceProposedSteps(
  tx,
  { tenantId, sessionId, steps, origin, timestamp },
) {
  await tx.run(
    `DELETE FROM acquisition_steps
     WHERE session_id = ? AND origin IN ('analysis','import') AND edited_at IS NULL`,
    [sessionId],
  );
  const edited = (
    await tx.query(
      `SELECT step_key FROM acquisition_steps
       WHERE session_id = ? AND origin IN ('analysis','import') AND edited_at IS NOT NULL`,
      [sessionId],
    )
  ).rows;
  const editedKeys = new Set(edited.map((row) => row.step_key).filter(Boolean));
  const targets = await resolveTargetHints(
    tx,
    tenantId,
    steps.map((step) => step.targetHint),
  );
  let position = await nextPosition(tx, sessionId);
  let proposed = 0;
  for (const step of steps) {
    if (editedKeys.has(step.key)) continue;
    await tx.run(
      `INSERT INTO acquisition_steps
         (id, tenant_id, session_id, target_id, target_hint, filter, frame_count,
          exposure_seconds, gain, binning, sensor_temp_c, origin, step_key,
          edited_at, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
      [
        randomUUID(),
        tenantId,
        sessionId,
        targets.get(compactName(step.targetHint)) ?? null,
        step.targetHint ?? null,
        step.filter ?? null,
        step.frameCount,
        step.exposureSeconds,
        step.gain ?? null,
        step.binning ?? null,
        step.sensorTempC ?? null,
        origin,
        step.key,
        position,
        timestamp,
        timestamp,
      ],
    );
    position += 1;
    proposed += 1;
  }
  return { proposed, keptEdited: edited.length };
}

/** Moves the night's `updated_at` forward (the `since` cursor of the list). */
export async function touchSession(tx, { tenantId, sessionId, timestamp }) {
  await tx.run(
    `UPDATE observation_sessions SET updated_at = ?
     WHERE id = ? AND tenant_id = ? AND (updated_at IS NULL OR updated_at < ?)`,
    [timestamp, sessionId, tenantId, timestamp],
  );
}

const NIGHT_COLUMNS = Object.freeze({
  title: "title",
  startedAt: "started_at",
  finishedAt: "finished_at",
  place: "place_json",
  equipment: "equipment_json",
  targetIds: "target_ids_json",
  notes: "notes",
});
const JSON_FIELDS = { place: true, equipment: true, targetIds: true };

/**
 * The persistence of the structured night (migration 67): the night's own fields on `observation_sessions`,
 * its acquisition steps, and the rows « what is online for a night » reads
 * (`../sessions/night-online.js`). Every read and write is bounded by the
 * space: a night of another space is « not found », never told apart.
 */
export async function createNightRepository({
  databasePath,
  databaseUrl,
  driver,
  dialect = driver?.dialect ?? (databaseUrl ? "postgres" : "sqlite"),
} = {}) {
  const ownsDriver = !driver;
  const db = driver || createDatabaseDriver({ databasePath, databaseUrl });
  await applyMigrations(db, dialect);

  async function sessionOrNull(tx, tenantId, sessionId) {
    return await sessionRowById(tx, { tenantId, sessionId });
  }

  /** A night of another space and a night that does not exist read the same. */
  async function requireSession(tx, tenantId, sessionId) {
    if (!(await sessionOrNull(tx, tenantId, sessionId)))
      throw new NightRepositoryError(
        "session_not_found",
        "The session was not found.",
        { status: 404 },
      );
  }

  function changed(tenantId, originClientInstanceId) {
    publishChange({ tenantId, domains: ["sessions"], originClientInstanceId });
  }

  return {
    db,

    async close() {
      if (ownsDriver) await db.close();
    },

    /**
     * What the night is read from: its row, its plan's row (null for a
     * night without a plan, or a plan gone), its steps and the stored
     * analysis (report and the device that sent it), or null when the night
     * is not in this space.
     */
    async readNight({ tenantId, sessionId }) {
      const session = await sessionOrNull(db, tenantId, sessionId);
      if (!session) return null;
      const plan = session.plan_id
        ? await planRowFor(db, tenantId, session.plan_id)
        : null;
      const steps = await stepRowsFor(db, sessionId);
      const analysis =
        (
          await db.query(
            `SELECT a.id, a.report_version, a.report_json, a.created_at,
                    a.origin_device_id, d.label AS device_name
             FROM session_analyses a
             LEFT JOIN device_tokens d ON d.id = a.origin_device_id
             WHERE a.tenant_id = ? AND a.session_id = ?`,
            [tenantId, sessionId],
          )
        ).rows[0] || null;
      // The places the space keeps: a night's place is a copy, the name shown
      // is the live place's (`shownPlaceName`).
      let places = [];
      try {
        places = (await listLivePlaces(db, tenantId)).map((place) => ({
          id: place.id,
          name: place.name,
          latitude: place.latitude,
          longitude: place.longitude,
        }));
      } catch {
        places = [];
      }
      return {
        session,
        plan,
        steps,
        places,
        analysis: analysis
          ? { ...analysis, report: parseJson(analysis.report_json, {}) }
          : null,
      };
    },

    /** The identifiers among `ids` that are equipment of the space or the platform's default equipment. */
    async knownEquipmentIds(tenantId, ids) {
      if (!ids.length) return new Set();
      const rows = (
        await db.query(
          `SELECT id FROM equipment
           WHERE id IN (${ids.map(() => "?").join(", ")})
             AND (tenant_id = ? OR scope = 'default')`,
          [...ids, tenantId],
        )
      ).rows;
      return new Set(rows.map((row) => row.id));
    },

    /** The identifiers among `ids` that are catalogue targets or personal targets of the space. */
    async knownTargetIds(tenantId, ids) {
      if (!ids.length) return new Set();
      const rows = (
        await db.query(
          `SELECT id FROM target_catalogue_entries
           WHERE id IN (${ids.map(() => "?").join(", ")})
             AND (space_id IS NULL OR space_id = ?)`,
          [...ids, tenantId],
        )
      ).rows;
      return new Set(rows.map((row) => row.id));
    },

    /**
     * Writes the night's own fields named in `changes` (already validated:
     * JSON fields as values, `null` giving the field back to the plan).
     * -> the updated row, or null when the night is not in this space.
     */
    async patchNight({
      tenantId,
      sessionId,
      changes,
      originClientInstanceId = null,
      timestamp = now(),
    }) {
      const row = await db.transaction(async (tx) => {
        const session = await sessionOrNull(tx, tenantId, sessionId);
        if (!session) return null;
        const startedAt = changes.startedAt ?? session.started_at;
        const finishedAt =
          "finishedAt" in changes ? changes.finishedAt : session.finished_at;
        if ("finishedAt" in changes && !session.finished_at)
          throw new NightRepositoryError(
            "night_not_finished",
            "The night is not finished: its end cannot be set yet.",
            { status: 409 },
          );
        if (finishedAt && Date.parse(finishedAt) < Date.parse(startedAt))
          throw new NightRepositoryError(
            "invalid_request",
            "finishedAt must not be before startedAt.",
          );
        const fields = Object.keys(changes);
        await tx.run(
          `UPDATE observation_sessions SET ${fields
            .map((field) => `${NIGHT_COLUMNS[field]} = ?`)
            .join(", ")}
           WHERE id = ? AND tenant_id = ?`,
          [
            ...fields.map((field) =>
              JSON_FIELDS[field] === true && changes[field] !== null
                ? JSON.stringify(changes[field])
                : changes[field],
            ),
            sessionId,
            tenantId,
          ],
        );
        await touchSession(tx, { tenantId, sessionId, timestamp });
        return await sessionOrNull(tx, tenantId, sessionId);
      });
      if (row) changed(tenantId, originClientInstanceId);
      return row;
    },

    /** -> the new step's row, or null when the night is not in this space. */
    async createStep({
      tenantId,
      sessionId,
      step,
      originClientInstanceId = null,
      timestamp = now(),
    }) {
      const row = await db.transaction(async (tx) => {
        if (!(await sessionOrNull(tx, tenantId, sessionId))) return null;
        const id = randomUUID();
        await tx.run(
          `INSERT INTO acquisition_steps
             (id, tenant_id, session_id, target_id, filter, frame_count,
              exposure_seconds, gain, origin, edited_at, position, created_at,
              updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', NULL, ?, ?, ?)`,
          [
            id,
            tenantId,
            sessionId,
            step.targetId ?? null,
            step.filter ?? null,
            step.frameCount,
            step.exposureSeconds,
            step.gain ?? null,
            await nextPosition(tx, sessionId),
            timestamp,
            timestamp,
          ],
        );
        await touchSession(tx, { tenantId, sessionId, timestamp });
        return (
          await tx.query("SELECT * FROM acquisition_steps WHERE id = ?", [id])
        ).rows[0];
      });
      if (row) changed(tenantId, originClientInstanceId);
      return row;
    },

    /**
     * A correction by hand: the step is marked edited (`edited_at`), and a
     * later analysis keeps it. -> the row, or null when the step is not the
     * night's (404 `session_not_found` thrown for an unknown night).
     */
    async patchStep({
      tenantId,
      sessionId,
      stepId,
      changes,
      originClientInstanceId = null,
      timestamp = now(),
    }) {
      const columns = {
        targetId: "target_id",
        filter: "filter",
        frameCount: "frame_count",
        exposureSeconds: "exposure_seconds",
        gain: "gain",
      };
      const fields = Object.keys(changes);
      const row = await db.transaction(async (tx) => {
        await requireSession(tx, tenantId, sessionId);
        const update = await tx.run(
          `UPDATE acquisition_steps SET ${fields
            .map((field) => `${columns[field]} = ?`)
            .join(", ")}, edited_at = ?, updated_at = ?
           WHERE id = ? AND session_id = ? AND tenant_id = ?`,
          [
            ...fields.map((field) => changes[field]),
            timestamp,
            timestamp,
            stepId,
            sessionId,
            tenantId,
          ],
        );
        if (update.rowCount !== 1) return null;
        await touchSession(tx, { tenantId, sessionId, timestamp });
        return (
          await tx.query("SELECT * FROM acquisition_steps WHERE id = ?", [
            stepId,
          ])
        ).rows[0];
      });
      if (row) changed(tenantId, originClientInstanceId);
      return row;
    },

    /** -> true when the step was deleted, false when it is not the night's (404 `session_not_found` thrown for an unknown night). */
    async deleteStep({
      tenantId,
      sessionId,
      stepId,
      originClientInstanceId = null,
      timestamp = now(),
    }) {
      const deleted = await db.transaction(async (tx) => {
        await requireSession(tx, tenantId, sessionId);
        const result = await tx.run(
          "DELETE FROM acquisition_steps WHERE id = ? AND session_id = ? AND tenant_id = ?",
          [stepId, sessionId, tenantId],
        );
        if (result.rowCount !== 1) return false;
        await touchSession(tx, { tenantId, sessionId, timestamp });
        return true;
      });
      if (deleted) changed(tenantId, originClientInstanceId);
      return deleted;
    },

    /**
     * The rows « what is online for a night » is built from
     * (`../sessions/night-online.js`): the night's captures with their
     * targets, every image of each (main first) with whether a sky
     * solution exists for it, and the designations of the targets named.
     */
    async onlineRows({ tenantId, sessionId }) {
      const captures = (
        await db.query(
          `SELECT id, stage, visibility, status, created_at FROM captures
           WHERE tenant_id = ? AND session_id = ?
           ORDER BY created_at, id`,
          [tenantId, sessionId],
        )
      ).rows;
      const ids = captures.map((capture) => capture.id);
      const marks = ids.map(() => "?").join(", ");
      const targets = ids.length
        ? (
            await db.query(
              `SELECT capture_id, target_id, position FROM capture_targets
               WHERE capture_id IN (${marks}) ORDER BY position`,
              ids,
            )
          ).rows
        : [];
      const images = ids.length
        ? (
            await db.query(
              `SELECT v.id, v.capture_id, v.sha256, v.byte_size, v.original_name,
                      v.source, v.is_main, v.created_at,
                      CASE WHEN s.image_id IS NULL THEN 0 ELSE 1 END AS solved
               FROM capture_variants v
               LEFT JOIN capture_sky_solutions s ON s.image_id = v.id
               WHERE v.tenant_id = ? AND v.capture_id IN (${marks})
                 AND v.role IS NULL
               ORDER BY v.is_main DESC, v.created_at, v.id`,
              [tenantId, ...ids],
            )
          ).rows
        : [];
      return { captures, targets, images };
    },

    /** Designations of the targets named, by identifier (catalogue or personal targets of the space). */
    async targetNames(tenantId, ids) {
      if (!ids.length) return new Map();
      const rows = (
        await db.query(
          `SELECT id, designation FROM target_catalogue_entries
           WHERE id IN (${ids.map(() => "?").join(", ")})
             AND (space_id IS NULL OR space_id = ?)`,
          [...ids, tenantId],
        )
      ).rows;
      return new Map(rows.map((row) => [row.id, row.designation]));
    },
  };
}
