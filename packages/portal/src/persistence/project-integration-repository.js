import { randomUUID } from "node:crypto";
import { publishChange } from "../api/change-bus.js";
import { createSessionDebriefService } from "../api/session-debrief.js";
import { declaredFiguresOfTarget } from "../debrief-declared.js";
import { createJournalRepository } from "../journal/journal-repository.js";
import { layerIsEmpty, parseLayer } from "../journal/session-rework-layer.js";
import { applyMigrations } from "./migration-runner.js";
import { nightEveningDate } from "./project-night-repository.js";
import { parseJson } from "./planner-state-repository.js";
import { planCaptureFieldsOf } from "./plan-capture-fields.js";
import { meets, projectOf, text } from "./plan-project-links.js";
import { captureSessionLiveSql } from "./capture-session-visibility.js";

/**
 * The integrations of the multi-night plans (`project_integrations`,
 * migration 76) and the image
 * of a plan (`captures.project_id`, `captures.plan_json`). One row per
 * night, target and family of frames, the line Astro Sync sends after it
 * integrated a night: metadata only, never a file. Every query is bounded
 * by the space (`tenantId`).
 *
 * The repository reads and writes; whether a write is allowed (the
 * multi-night plans of Astro Sync, never on a private server) and whether
 * a line belongs to its night are the service's
 * (`api/project-integrations.js`).
 */

const finite = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const integer = (value) => {
  const number = finite(value);
  return number === null ? null : Math.trunc(number);
};

/**
 * The family of an integration written once, the key of its row with its
 * night and its target: the filter as written (`null` is « Sans filtre »),
 * the exposure, the gain, the binning and the temperature.
 */
export function familyKeyOf({
  filter = null,
  exposureSeconds,
  gain = null,
  binning = null,
  temperatureC = null,
}) {
  return JSON.stringify([
    filter ?? null,
    Number(exposureSeconds),
    gain ?? null,
    binning ?? null,
    temperatureC ?? null,
  ]);
}

/** One stored row as the contract writes it (`integration.schema.json`). */
export function integrationResourceForRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    nightId: row.night_id,
    targetId: row.target_id,
    filter: row.filter ?? null,
    // Who wrote the line, and the night as the Journal names it
    // (`sessionId`, the same value as `nightId`).
    source: row.source === "declared" ? "declared" : "measured",
    sessionId: row.night_id,
    exposureSeconds: finite(row.exposure_seconds),
    gain: integer(row.gain),
    binning: integer(row.binning),
    temperatureC: finite(row.temperature_c),
    frameCount: integer(row.frame_count),
    totalSeconds: finite(row.total_seconds) ?? 0,
    eveningDate: row.evening_date,
    sensor: row.sensor ?? null,
    computerLabel: row.computer_label ?? null,
    installationId: row.installation_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * The integrations added up by filter, in the order the filters first
 * appear (the integrations come the earliest night first): frames, seconds
 * and the number of nights each filter was taken on.
 */
export function totalsByFilterOf(integrations) {
  const totals = new Map();
  for (const integration of integrations) {
    const key = integration.filter ?? null;
    const total = totals.get(key) ?? {
      filter: key,
      frameCount: 0,
      totalSeconds: 0,
      declaredSeconds: 0,
      measuredSeconds: 0,
      nights: new Set(),
    };
    total.frameCount += integration.frameCount;
    total.totalSeconds += integration.totalSeconds;
    // What is still declared and what Astro Sync measured; the two add up
    // to the total.
    if (integration.source === "declared")
      total.declaredSeconds += integration.totalSeconds;
    else total.measuredSeconds += integration.totalSeconds;
    total.nights.add(integration.nightId);
    totals.set(key, total);
  }
  return [...totals.values()].map(
    ({ nights, totalSeconds, declaredSeconds, measuredSeconds, ...total }) => ({
      ...total,
      totalSeconds: Math.round(totalSeconds * 1000) / 1000,
      declaredSeconds: Math.round(declaredSeconds * 1000) / 1000,
      measuredSeconds: Math.round(measuredSeconds * 1000) / 1000,
      nightCount: nights.size,
    }),
  );
}

export async function createProjectIntegrationRepository({
  driver,
  dialect = driver?.dialect,
  now = () => new Date().toISOString(),
  idGenerator = randomUUID,
} = {}) {
  if (!driver)
    throw new Error("The integrations repository needs a database driver.");
  await applyMigrations(driver, dialect === "postgres" ? "postgres" : "sqlite");

  return {
    /**
     * The multi-night plans a night belongs to: the plan item of its plan
     * that names one, and the link the night carries itself.
     */
    async projectIdsOfNight(tenantId, nightId) {
      const session = (
        await driver.query(
          "SELECT plan_id, project_id FROM observation_sessions WHERE id = ? AND tenant_id = ?",
          [String(nightId ?? ""), tenantId],
        )
      ).rows[0];
      const ids = new Set();
      if (!session) return ids;
      if (session.project_id) ids.add(session.project_id);
      if (session.plan_id) {
        const plan = (
          await driver.query(
            "SELECT payload_json FROM plans WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
            [session.plan_id, tenantId],
          )
        ).rows[0];
        const items = parseJson(plan?.payload_json, null)?.items;
        for (const item of Array.isArray(items) ? items : [])
          if (text(item?.projectId)) ids.add(item.projectId);
      }
      return ids;
    },

    /** The identifiers the target of a multi-night plan answers to. */
    async keysOf(tenantId, projectId) {
      return (await projectOf(driver, tenantId, projectId))?.keys ?? new Set();
    },

    /** See `writeDeclaredIntegrationsForSession`. */
    writeDeclaredIntegrationsForSession: (tenantId, sessionId) =>
      writeDeclaredIntegrationsForSession(driver, tenantId, sessionId, {
        now,
        idGenerator,
      }),

    /** The project of the space (its stored fields), or `null`. */
    async project(tenantId, projectId) {
      const row = (
        await driver.query(
          "SELECT id, payload_json FROM projects WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
          [String(projectId ?? ""), tenantId],
        )
      ).rows[0];
      if (!row) return null;
      let fields;
      try {
        fields = JSON.parse(row.payload_json);
      } catch {
        fields = {};
      }
      return { id: row.id, ...fields };
    },

    /**
     * The night (the observation session) of the space with what dates it:
     * its plan's date and its start, or `null`.
     */
    async night(tenantId, nightId) {
      const row = (
        await driver.query(
          `SELECT s.id, s.started_at, s.place_json, p.plan_date
           FROM observation_sessions s LEFT JOIN plans p ON p.id = s.plan_id
           WHERE s.id = ? AND s.tenant_id = ? AND s.deleted_at IS NULL`,
          [String(nightId ?? ""), tenantId],
        )
      ).rows[0];
      if (!row) return null;
      let place = null;
      try {
        place = JSON.parse(row.place_json || "null");
      } catch {
        place = null;
      }
      return {
        id: row.id,
        startedAt: row.started_at,
        planDate: row.plan_date ?? null,
        longitude: finite(place?.longitude),
      };
    },

    /** Every integration of the plan, the earliest night first. */
    async list(tenantId, projectId) {
      return (
        await driver.query(
          `SELECT * FROM project_integrations
           WHERE tenant_id = ? AND project_id = ?
           ORDER BY evening_date, filter, exposure_seconds, created_at, id`,
          [tenantId, String(projectId ?? "")],
        )
      ).rows.map(integrationResourceForRow);
    },

    /**
     * Adds or replaces the lines, in one transaction: a line is keyed by
     * its night, its target and its family; sending it again replaces its
     * figures (and moves it to this plan), never adds a second row.
     *
     * `replace` lists the `{ nightId, targetId }` sets the lines are sent
     * **complete** for: in the same transaction, the measured lines this
     * plan holds for such a set whose family is not among `lines` are
     * removed. Answers the nights that lost a line.
     */
    async upsert(
      tenantId,
      projectId,
      lines,
      { keys = null, replace = [] } = {},
    ) {
      const at = now();
      const retiredNights = new Set();
      await driver.transaction(async (tx) => {
        for (const line of lines) {
          // The measured lines of a night and a target replace the line the
          // session declared for them (the target under any of the plan's
          // keys: its catalogue object or its framing).
          const targets = keys?.has(line.targetId)
            ? [...new Set([line.targetId, ...keys])]
            : [line.targetId];
          await tx.run(
            `DELETE FROM project_integrations
             WHERE tenant_id = ? AND night_id = ? AND source = 'declared'
               AND target_id IN (${targets.map(() => "?").join(", ")})`,
            [tenantId, line.nightId, ...targets],
          );
          const familyKey = familyKeyOf(line);
          const totalSeconds =
            Math.round(line.frameCount * line.exposureSeconds * 1000) / 1000;
          const held = (
            await tx.query(
              `SELECT id FROM project_integrations
               WHERE tenant_id = ? AND night_id = ? AND target_id = ? AND family_key = ?`,
              [tenantId, line.nightId, line.targetId, familyKey],
            )
          ).rows[0];
          const values = [
            projectId,
            line.filter ?? null,
            line.exposureSeconds,
            line.gain ?? null,
            line.binning ?? null,
            line.temperatureC ?? null,
            line.frameCount,
            totalSeconds,
            line.eveningDate,
            line.sensor ?? null,
            line.computerLabel ?? null,
            line.installationId ?? null,
          ];
          if (held)
            await tx.run(
              `UPDATE project_integrations
               SET project_id = ?, filter = ?, exposure_seconds = ?, gain = ?,
                   binning = ?, temperature_c = ?, frame_count = ?,
                   total_seconds = ?, evening_date = ?, sensor = ?,
                   computer_label = ?, installation_id = ?, source = 'measured',
                   updated_at = ?
               WHERE id = ? AND tenant_id = ?`,
              [...values, at, held.id, tenantId],
            );
          else
            await tx.run(
              `INSERT INTO project_integrations
                 (id, tenant_id, night_id, target_id, family_key, project_id,
                  filter, exposure_seconds, gain, binning, temperature_c,
                  frame_count, total_seconds, evening_date, sensor,
                  computer_label, installation_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                idGenerator(),
                tenantId,
                line.nightId,
                line.targetId,
                familyKey,
                ...values,
                at,
                at,
              ],
            );
        }
        for (const set of replace) {
          const sent = new Set(
            lines
              .filter(
                (line) =>
                  line.nightId === set.nightId &&
                  line.targetId === set.targetId,
              )
              .map(familyKeyOf),
          );
          // Only the plan's own measured lines: a declared line is the
          // service's (it is recomputed from the debriefing), and a line
          // another plan holds is that plan's.
          const held = (
            await tx.query(
              `SELECT id, family_key FROM project_integrations
               WHERE tenant_id = ? AND project_id = ? AND night_id = ?
                 AND target_id = ? AND source <> 'declared'`,
              [tenantId, projectId, set.nightId, set.targetId],
            )
          ).rows;
          for (const row of held) {
            if (sent.has(row.family_key)) continue;
            await tx.run(
              "DELETE FROM project_integrations WHERE id = ? AND tenant_id = ?",
              [row.id, tenantId],
            );
            retiredNights.add(set.nightId);
          }
        }
      });
      return { retiredNights: [...retiredNights] };
    },

    /**
     * The image of the plan: the newest capture of the space attached to
     * the plan (role `plan`), with the nights it combines, its totals by
     * filter and its render, and how many the space holds.
     */
    async planCapture(tenantId, projectId) {
      const { rows } = await driver.query(
        `SELECT id, created_at, plan_json FROM captures
         WHERE tenant_id = ? AND project_id = ?
           AND ${captureSessionLiveSql()}
         ORDER BY created_at DESC, id DESC`,
        [tenantId, String(projectId ?? "")],
      );
      const newest = rows[0];
      return {
        planCapture: newest
          ? {
              id: newest.id,
              createdAt: newest.created_at,
              ...planCaptureFieldsOf(newest.plan_json),
            }
          : null,
        planCaptureCount: rows.length,
      };
    },
  };
}

/** The figures of a target as a rework left them (`session.targets`' entries). */
export function declaredFiguresOfEffectiveTarget(entries) {
  if (!entries.length) return null;
  const seconds = entries.reduce(
    (sum, entry) => sum + entry.acquiredSeconds,
    0,
  );
  const frameCount = entries.reduce(
    (sum, entry) =>
      sum + (Number.isSafeInteger(entry.frameCount) ? entry.frameCount : 0),
    0,
  );
  const filter = entries.find(
    (entry) => typeof entry.filter === "string" && entry.filter.trim(),
  )?.filter;
  return {
    seconds,
    frameCount,
    exposureSeconds:
      frameCount > 0 ? Math.round((seconds / frameCount) * 1000) / 1000 : 0,
    filter: filter ? filter.trim().slice(0, 40) : null,
  };
}

/**
 * The declared integration lines of a night: for a **finished** night attached
 * to a multi-night plan — through the plan item of its target or through the
 * night itself — whose debriefing says it was carried out (`executed`,
 * `partial`), or which has no plan (« Observation libre », `done` for the
 * plan's page), one line `source: "declared"` per target of the multi-night
 * plan that was observed (family key `declared`, `filter` null unless the
 * debriefing names one; the seconds the debriefing declares, the frames when
 * it gives them). Sending the measured lines of Astro Sync for the same night
 * and target replaces the declared line (`upsert`), and a declared line never
 * comes back for a night and target that has measured lines.
 *
 * The lines are **recomputed**: calling it again after the debriefing or a
 * rework changed what the night declares rewrites the lines to the new figures
 * and removes the ones the night no longer declares. A night attached to no
 * multi-night plan is left alone (a detached night takes its lines with it:
 * they stay with `project_id` NULL).
 *
 * `driver` is a database driver, **not a transaction** (the debriefing
 * decision, the rework: call it once their transaction is committed, as they
 * publish their change). Answers `{ written, removed, projectIds }`.
 */
export async function writeDeclaredIntegrationsForSession(
  driver,
  tenantId,
  sessionId,
  { now = () => new Date().toISOString(), idGenerator = randomUUID } = {},
) {
  const dialect = driver.dialect === "postgres" ? "postgres" : "sqlite";
  await applyMigrations(driver, dialect);
  const none = { written: 0, removed: 0, projectIds: [] };
  const session = (
    await driver.query(
      `SELECT * FROM observation_sessions WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [String(sessionId ?? ""), tenantId],
    )
  ).rows[0];
  if (!session) return none;
  const plan = session.plan_id
    ? ((
        await driver.query(
          `SELECT plan_date, status, frozen_at, payload_json FROM plans
           WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
          [session.plan_id, tenantId],
        )
      ).rows[0] ?? null)
    : null;
  const projectIds = [];
  const items = parseJson(plan?.payload_json, null)?.items;
  for (const item of Array.isArray(items) ? items : [])
    if (text(item?.projectId) && !projectIds.includes(item.projectId))
      projectIds.push(item.projectId);
  if (session.project_id && !projectIds.includes(session.project_id))
    projectIds.push(session.project_id);
  const projects = [];
  for (const id of projectIds) {
    const project = await projectOf(driver, tenantId, id);
    if (project) projects.push(project);
  }
  if (!projects.length) return none;

  // Whether the night says it was carried out: a finished session whose plan
  // was debriefed `executed` or `partial`, or that has no plan.
  const carriedOut =
    session.status === "finished" &&
    (!plan ||
      (plan.frozen_at && ["executed", "partial"].includes(plan.status)));
  const read = carriedOut
    ? await (
        await createSessionDebriefService({ driver, dialect })
      ).read({ tenantId, sessionId: session.id })
    : null;
  const place = parseJson(session.place_json, null);
  // A reworked session declares what the rework made of it (the targets it
  // kept, the times and frames it set): the Journal's own reading of the
  // session, not the debriefing alone.
  const effective =
    read && !layerIsEmpty(parseLayer(session.rework_json))
      ? (
          await (
            await createJournalRepository({ driver, dialect })
          ).targetsOfRow({ tenantId, row: session, executor: driver })
        ).targets.filter(
          (entry) =>
            entry.state !== "removed" &&
            Number.isFinite(entry.acquiredSeconds) &&
            entry.acquiredSeconds > 0,
        )
      : null;

  const measured = (
    await driver.query(
      `SELECT target_id FROM project_integrations
       WHERE tenant_id = ? AND night_id = ? AND source <> 'declared'`,
      [tenantId, session.id],
    )
  ).rows.map((row) => row.target_id);
  const wanted = [];
  for (const project of projects) {
    if (!read) break;
    const targets = new Set(
      (effective ?? read.debriefSummary?.perTarget ?? [])
        .map((entry) => entry.targetId)
        .filter((id) => meets(project.keys, [id])),
    );
    for (const targetId of targets) {
      if (measured.includes(targetId) || meets(project.keys, measured))
        continue;
      const figures = effective
        ? declaredFiguresOfEffectiveTarget(
            effective.filter((entry) => entry.targetId === targetId),
          )
        : declaredFiguresOfTarget(
            { debrief: read.debrief, summary: read.debriefSummary },
            targetId,
          );
      if (!figures) continue;
      const longitude = Number(place?.longitude ?? project.place?.longitude);
      wanted.push({
        projectId: project.id,
        targetId,
        ...figures,
        eveningDate: nightEveningDate({
          planDate: plan?.plan_date ?? null,
          startedAt: session.started_at,
          longitude: Number.isFinite(longitude) ? longitude : null,
        }),
      });
    }
  }

  const at = now();
  const result = await driver.transaction(async (tx) => {
    const held = (
      await tx.query(
        `SELECT * FROM project_integrations
         WHERE tenant_id = ? AND night_id = ? AND source = 'declared'`,
        [tenantId, session.id],
      )
    ).rows;
    let written = 0;
    for (const line of wanted) {
      const row = held.find(
        (candidate) => candidate.target_id === line.targetId,
      );
      const values = [
        line.projectId,
        line.filter,
        line.exposureSeconds,
        line.frameCount,
        line.seconds,
        line.eveningDate ?? "",
      ];
      if (row) {
        row.kept = true;
        const same =
          row.project_id === line.projectId &&
          (row.filter ?? null) === line.filter &&
          Number(row.exposure_seconds) === line.exposureSeconds &&
          Number(row.frame_count) === line.frameCount &&
          Number(row.total_seconds) === line.seconds &&
          row.evening_date === (line.eveningDate ?? "");
        if (same) continue;
        await tx.run(
          `UPDATE project_integrations
           SET project_id = ?, filter = ?, exposure_seconds = ?, frame_count = ?,
               total_seconds = ?, evening_date = ?, updated_at = ?
           WHERE id = ? AND tenant_id = ?`,
          [...values, at, row.id, tenantId],
        );
      } else
        await tx.run(
          `INSERT INTO project_integrations
             (id, tenant_id, night_id, target_id, family_key, project_id,
              filter, exposure_seconds, frame_count, total_seconds,
              evening_date, source, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'declared', ?, ?, ?, ?, ?, ?, 'declared', ?, ?)`,
          [
            idGenerator(),
            tenantId,
            session.id,
            line.targetId,
            ...values,
            at,
            at,
          ],
        );
      written += 1;
    }
    let removed = 0;
    for (const row of held)
      if (!row.kept) {
        await tx.run(
          "DELETE FROM project_integrations WHERE id = ? AND tenant_id = ?",
          [row.id, tenantId],
        );
        removed += 1;
      }
    return { written, removed };
  });
  if (result.written || result.removed)
    publishChange({ tenantId, domains: ["projects"] });
  return { ...result, projectIds: projects.map((project) => project.id) };
}
