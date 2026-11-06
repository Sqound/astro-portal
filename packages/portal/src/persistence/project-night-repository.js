import { randomUUID } from "node:crypto";
import { publishChange } from "../api/change-bus.js";
import { applyMigrations } from "./migration-runner.js";
import { nightEveningDate } from "./night-evening-date.js";
import { debriefedStatusOf } from "./plan-session-flags.js";
import {
  audit,
  meets,
  planItemIsTarget,
  planItemTargetKeys,
  projectOf,
  targetKeysOf,
  text,
} from "./plan-project-links.js";
import {
  archivePlannerPayload,
  canonicalJson,
  parseJson,
  planRevision,
  replacePlanItems,
} from "./planner-state-repository.js";

/**
 * The nights of a multi-night plan: which nights of the space belong to which plan, and the
 * writes that attach a night already run — or a plan of one night — to a
 * multi-night plan of its target, or detach it. Every query is bounded by
 * the space (`tenantId`).
 *
 * **One truth.** The link stays where the plans carry it: `projectId` on
 * the plan item of the target (`plan.schema.json`, `planItem`), the field
 * the planner, the phone and the progress already read. Only a night with
 * no plan item of the target — a night run without a plan, or a target
 * met in the field — carries it itself (`observation_sessions.project_id`,
 * migration 77). A night belongs to a plan when its plan's item of the
 * target names it, or when it names it itself; attaching always clears the
 * other link, so a night belongs to one multi-night plan at most.
 *
 * **The integrations follow.** Attaching a night moves its integrations of
 * the plan's target to the plan (`project_integrations.project_id`);
 * detaching takes them out of it (NULL), and attaching again brings them
 * back.
 *
 * Whether a write is allowed (the multi-night plans of Astro Sync, never on
 * a private server) and the refusals are the service's
 * (`api/project-nights.js`).
 */

export { nightEveningDate };

const finite = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/**
 * Where a night of a multi-night plan stands (`project.schema.json`,
 * `night.state`): `upcoming` (a promise: a plan not run yet, or a session
 * still open or paused), `to_debrief` (the night is over and its debriefing
 * is still to be done: a finished session of a plan without a debriefing,
 * or a plan whose night is past and was not carried out in the
 * application), `done` (debriefed, or a finished session without a plan; a
 * plan given up or archived with no session has nothing left to do). The
 * end of a night is the one the plan holds (`night_end_at`), else the next
 * local noon at the longitude.
 */
export function nightState({ plan, night, eveningDate, longitude, atMs }) {
  // The Journal's rule (`debriefOutcomeOfPlanRow`), so that
  // a night says on the page of its multi-night plan what its line says in
  // the Journal — a plan archived after its debriefing keeps its outcome; a
  // plan given up in the field and never debriefed is still to debrief.
  const debriefed = Boolean(
    debriefedStatusOf({
      frozen_at: plan?.frozenAt ?? null,
      status: plan?.status ?? null,
      archived_from: plan?.archivedFrom ?? null,
    }),
  );
  if (night) {
    if (night.status === "open" || night.status === "paused") return "upcoming";
    if (!plan) return "done";
    return debriefed ? "done" : "to_debrief";
  }
  if (!plan) return "upcoming";
  if (debriefed || ["abandoned", "archived"].includes(plan.status))
    return "done";
  let endMs = Date.parse(plan.nightEndAt ?? "");
  if (!Number.isFinite(endMs) && eveningDate) {
    const shift = Number.isFinite(longitude) ? (longitude / 15) * 3_600_000 : 0;
    endMs = Date.parse(`${eveningDate}T12:00:00Z`) + 86_400_000 - shift;
  }
  return Number.isFinite(endMs) && endMs <= atMs ? "to_debrief" : "upcoming";
}

/**
 * Whether every night of the plan is behind it: none `upcoming` or
 * `to_debrief`, and at least one `done` (`project.allSessionsDone`).
 */
export function allSessionsDone(nights) {
  return (
    nights.some((night) => night.state === "done") &&
    nights.every((night) => night.state === "done")
  );
}

function payloadOf(row) {
  const payload = parseJson(row?.payload_json, null);
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload
    : {};
}

const itemsOf = (payload) =>
  (Array.isArray(payload?.items) ? payload.items : []).filter(
    (item) => item && typeof item === "object" && !Array.isArray(item),
  );

export async function createProjectNightRepository({
  driver,
  dialect = driver?.dialect,
  now = () => new Date().toISOString(),
} = {}) {
  if (!driver)
    throw new Error("The project nights repository needs a database driver.");
  await applyMigrations(driver, dialect === "postgres" ? "postgres" : "sqlite");

  /**
   * Everything the nights of the space are told from, read once: the
   * plans (not deleted), the nights with the targets they met (their own
   * list, their steps, their journal) and the integrations.
   */
  async function snapshot(db, tenantId) {
    const plans = (
      await db.query(
        "SELECT id, name, plan_date, status, archived_from, revision, frozen_at, night_end_at, payload_json FROM plans WHERE tenant_id = ? AND deleted_at IS NULL",
        [tenantId],
      )
    ).rows.map((row) => ({
      id: row.id,
      name: row.name ?? null,
      date: row.plan_date ?? null,
      status: row.status ?? null,
      frozenAt: row.frozen_at ?? null,
      archivedFrom: row.archived_from ?? null,
      nightEndAt: row.night_end_at ?? null,
      items: itemsOf(payloadOf(row)),
    }));
    const sessions = (
      await db.query(
        `SELECT id, plan_id, status, started_at, finished_at, place_json,
                target_ids_json, rework_json, project_id
         FROM observation_sessions WHERE tenant_id = ? AND deleted_at IS NULL`,
        [tenantId],
      )
    ).rows;
    const met = new Map(sessions.map((row) => [row.id, new Set()]));
    const meet = (sessionId, targetId) => {
      if (text(targetId)) met.get(sessionId)?.add(text(targetId));
    };
    for (const row of sessions) {
      for (const id of parseJson(row.target_ids_json, null) ?? [])
        meet(row.id, id);
      // A target the person added by a rework (« Ajouter … à la session »)
      // is one the night holds: the night joins its multi-night plan too.
      for (const target of parseJson(row.rework_json, null)?.targets ?? [])
        if (target?.state !== "removed") meet(row.id, target?.targetId);
    }
    for (const row of (
      await db.query(
        "SELECT DISTINCT session_id, target_id FROM acquisition_steps WHERE tenant_id = ? AND target_id IS NOT NULL",
        [tenantId],
      )
    ).rows)
      meet(row.session_id, row.target_id);
    for (const row of (
      await db.query(
        `SELECT e.session_id, e.payload FROM session_events e
         JOIN observation_sessions s ON s.id = e.session_id
         WHERE s.tenant_id = ? AND s.deleted_at IS NULL AND e.type IN ('target_started', 'target_finished')`,
        [tenantId],
      )
    ).rows)
      meet(row.session_id, parseJson(row.payload, null)?.targetId);
    const integrations = (
      await db.query(
        "SELECT night_id, target_id, project_id, total_seconds FROM project_integrations WHERE tenant_id = ?",
        [tenantId],
      )
    ).rows;
    for (const row of integrations) meet(row.night_id, row.target_id);
    const plansById = new Map(plans.map((plan) => [plan.id, plan]));
    const nights = sessions.map((row) => {
      const plan = row.plan_id ? (plansById.get(row.plan_id) ?? null) : null;
      const targets = met.get(row.id);
      for (const item of plan?.items ?? [])
        for (const key of planItemTargetKeys(item)) targets.add(key);
      return {
        id: row.id,
        planId: plan?.id ?? null,
        status: row.status,
        startedAt: row.started_at,
        finishedAt: row.finished_at ?? null,
        longitude: finite(parseJson(row.place_json, null)?.longitude),
        projectId: row.project_id ?? null,
        targets,
      };
    });
    return {
      plans,
      plansById,
      nights,
      nightsById: new Map(nights.map((night) => [night.id, night])),
      nightByPlanId: new Map(
        nights.filter((night) => night.planId).map((n) => [n.planId, n]),
      ),
      integrations,
    };
  }

  /**
   * The multi-night plan a night or a plan belongs to, read from `state`:
   * its plan's item of `keys` (any item naming a plan when `keys` is
   * `null`), else the night's own link.
   */
  function linkOf(state, { plan, night }, keys = null) {
    for (const item of plan?.items ?? [])
      if (text(item.projectId) && (!keys || planItemIsTarget(item, keys)))
        return { projectId: item.projectId, link: "plan" };
    if (night?.projectId) return { projectId: night.projectId, link: "night" };
    return null;
  }

  /** One line of `nights[]` / `candidates[]` (`project.schema.json`, `night`). */
  function lineOf(state, project, { plan, night }, link) {
    const integrations = night
      ? state.integrations.filter(
          (row) => row.night_id === night.id && row.project_id === project.id,
        )
      : [];
    const longitude = Number.isFinite(night?.longitude)
      ? night.longitude
      : finite(project.place?.longitude);
    const eveningDate = nightEveningDate({
      planDate: plan?.date ?? null,
      startedAt: night?.startedAt ?? null,
      longitude,
    });
    return {
      sessionId: night?.id ?? null,
      planId: plan?.id ?? null,
      planName: plan?.name ?? null,
      eveningDate,
      sessionStatus: night?.status ?? null,
      link,
      state: nightState({
        plan,
        night,
        eveningDate,
        longitude,
        atMs: Date.parse(now()),
      }),
      integrationCount: integrations.length,
      integrationSeconds:
        Math.round(
          integrations.reduce(
            (sum, row) => sum + (finite(row.total_seconds) ?? 0),
            0,
          ) * 1000,
        ) / 1000,
    };
  }

  const byNight = (left, right) =>
    String(left.eveningDate ?? "").localeCompare(
      String(right.eveningDate ?? ""),
    ) ||
    String(left.sessionId ?? left.planId).localeCompare(
      String(right.sessionId ?? right.planId),
    );

  /**
   * The nights of `project` and, with `candidates`, the nights and plans of
   * one night of its target that are not among them (each with the other
   * multi-night plan it belongs to, or `null`).
   */
  function nightsOf(state, project, { candidates = false } = {}) {
    const nights = [];
    const others = [];
    const seenPlans = new Set();
    for (const plan of state.plans) {
      const night = state.nightByPlanId.get(plan.id) ?? null;
      // A plan follows the multi-night plan when any of its items names it
      // (`itemFollows` of the planner), whatever that item's target.
      const link = plan.items.some((item) => item.projectId === project.id)
        ? "plan"
        : night?.projectId === project.id
          ? "night"
          : null;
      const isTarget =
        plan.items.some((item) => planItemIsTarget(item, project.keys)) ||
        meets(project.keys, night?.targets ?? new Set());
      seenPlans.add(plan.id);
      if (link) nights.push(lineOf(state, project, { plan, night }, link));
      else if (candidates && isTarget)
        others.push({
          ...lineOf(state, project, { plan, night }, null),
          projectId:
            linkOf(state, { plan, night }, project.keys)?.projectId ??
            linkOf(state, { plan, night })?.projectId ??
            null,
        });
    }
    for (const night of state.nights) {
      if (night.planId && seenPlans.has(night.planId)) continue;
      if (night.projectId === project.id)
        nights.push(lineOf(state, project, { plan: null, night }, "night"));
      else if (candidates && meets(project.keys, night.targets))
        others.push({
          ...lineOf(state, project, { plan: null, night }, null),
          projectId: night.projectId,
        });
    }
    return {
      nights: nights.sort(byNight),
      ...(candidates ? { candidates: others.sort(byNight) } : {}),
    };
  }

  /** The plan with its items rewritten by `change`, revision + 1, archived first. */
  async function rewritePlan(tx, tenantId, planId, change, timestamp) {
    const row = (
      await tx.query(
        "SELECT * FROM plans WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
        [planId, tenantId],
      )
    ).rows[0];
    if (!row) return false;
    const payload = payloadOf(row);
    const items = itemsOf(payload);
    const next = items.map(change);
    if (canonicalJson(next) === canonicalJson(items)) return false;
    const payloadJson = canonicalJson({ ...payload, items: next });
    await archivePlannerPayload(tx, {
      tenantId,
      plan: row,
      payloadJson: row.payload_json,
      timestamp,
    });
    const updated = await tx.run(
      "UPDATE plans SET payload_json = ?, revision = ?, updated_at = ? WHERE id = ? AND tenant_id = ? AND revision = ?",
      [
        payloadJson,
        planRevision(row.revision) + 1,
        timestamp,
        planId,
        tenantId,
        row.revision,
      ],
    );
    if (!updated.rowCount)
      throw Object.assign(new Error("The plan changed meanwhile."), {
        code: "plan_changed",
      });
    await replacePlanItems(tx, { tenantId, planId, items: next, timestamp });
    return true;
  }

  const withProject = (projectId, keys) => (item) =>
    planItemIsTarget(item, keys) ? { ...item, projectId } : item;

  const withoutProject = (projectId) => (item) => {
    if (item.projectId !== projectId) return item;
    const { projectId: _projectId, ...rest } = item;
    return rest;
  };

  async function lockSpace(tx, tenantId) {
    if (tx.dialect === "postgres")
      await tx.query("SELECT id FROM organizations WHERE id = ? FOR UPDATE", [
        tenantId,
      ]);
  }

  function changed(tenantId, domains, originClientInstanceId) {
    if (domains.size)
      publishChange({
        tenantId,
        domains: [...domains],
        originClientInstanceId,
      });
  }

  return {
    projectOf: (tenantId, projectId) => projectOf(driver, tenantId, projectId),
    targetKeysOf: (tenantId, target) => targetKeysOf(driver, tenantId, target),

    /** `{ nights }`, or `{ nights, candidates }`, of the plan `project`. */
    async nights(tenantId, project, options = {}) {
      return nightsOf(await snapshot(driver, tenantId), project, options);
    },

    /**
     * The candidates of a target that has no multi-night plan yet (« À
     * partir de plans déjà existants »): the nights of the journal and the
     * plans of one night of `target`, each with the multi-night plan it
     * already belongs to (or `null`), the earliest first. A night's
     * integrations of the target are counted whichever plan they follow.
     */
    async candidatesOf(tenantId, target) {
      const keys = await targetKeysOf(driver, tenantId, target);
      if (!keys.size) return null;
      const state = await snapshot(driver, tenantId);
      // No multi-night plan owns the lines: every night of the target is a
      // candidate, and its integrations of the target count as its own.
      const project = { id: Symbol("no-multi-night-plan"), keys, place: null };
      const { candidates } = nightsOf(state, project, { candidates: true });
      const counted = (line) => {
        const own = state.integrations.filter(
          (row) =>
            row.night_id === line.sessionId && keys.has(String(row.target_id)),
        );
        return {
          ...line,
          integrationCount: own.length,
          integrationSeconds:
            Math.round(
              own.reduce(
                (sum, row) => sum + (finite(row.total_seconds) ?? 0),
                0,
              ) * 1000,
            ) / 1000,
        };
      };
      return candidates.map(counted);
    },

    /**
     * `detail.intermediate`: the multi-night plan a capture's session
     * belongs to when that plan is **not finished** — the plan whose target
     * is one of the capture's (the first, else), its name and its nights as
     * `{ eveningDate, sessionId, planId }`, the earliest first:
     * `sessionsDone` (`done`) and `sessionsPlanned` (`upcoming`,
     * `to_debrief`). `null` for a session of no multi-night plan and for a
     * finished one.
     */
    async intermediateOf(tenantId, sessionId, targetIds = []) {
      // Cheap first: most sessions belong to no multi-night plan, and the
      // snapshot reads the whole space.
      const held = (
        await driver.query(
          "SELECT plan_id, project_id FROM observation_sessions WHERE id = ? AND tenant_id = ?",
          [String(sessionId ?? ""), tenantId],
        )
      ).rows[0];
      if (!held) return null;
      if (!held.project_id) {
        const planned = held.plan_id
          ? (
              await driver.query(
                "SELECT payload_json FROM plans WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
                [held.plan_id, tenantId],
              )
            ).rows[0]
          : null;
        if (!itemsOf(payloadOf(planned)).some((item) => text(item.projectId)))
          return null;
      }
      const state = await snapshot(driver, tenantId);
      const night = state.nightsById.get(sessionId);
      if (!night) return null;
      const plan = night.planId ? state.plansById.get(night.planId) : null;
      const ids = [];
      for (const item of plan?.items ?? [])
        if (text(item.projectId) && !ids.includes(item.projectId))
          ids.push(item.projectId);
      if (night.projectId && !ids.includes(night.projectId))
        ids.push(night.projectId);
      const wanted = new Set(targetIds.map(text).filter(Boolean));
      const candidates = [];
      for (const id of ids) {
        const candidate = await projectOf(driver, tenantId, id);
        if (candidate) candidates.push(candidate);
      }
      const chosen =
        candidates.find((candidate) => meets(candidate.keys, wanted)) ??
        candidates[0] ??
        null;
      if (!chosen || chosen.status === "finished") return null;
      const { nights } = nightsOf(state, chosen);
      // What the plan gathered each night — the measured seconds of Astro
      // Sync, else the declared ones; `null` for a night that gathered none
      // (and for one still to come).
      const gathered = new Map();
      for (const row of (
        await driver.query(
          `SELECT night_id, source, total_seconds FROM project_integrations
           WHERE tenant_id = ? AND project_id = ?`,
          [tenantId, chosen.id],
        )
      ).rows) {
        const entry = gathered.get(row.night_id) ?? {
          measured: null,
          declared: null,
        };
        const key = row.source === "declared" ? "declared" : "measured";
        entry[key] = (entry[key] ?? 0) + (Number(row.total_seconds) || 0);
        gathered.set(row.night_id, entry);
      }
      const acquiredSeconds = (entry) => {
        const figures = entry.sessionId ? gathered.get(entry.sessionId) : null;
        const seconds = figures ? (figures.measured ?? figures.declared) : null;
        return seconds === null ? null : Math.round(seconds * 1000) / 1000;
      };
      const line = (entry) => ({
        eveningDate: entry.eveningDate ?? null,
        sessionId: entry.sessionId ?? null,
        planId: entry.planId ?? null,
        acquiredSeconds: acquiredSeconds(entry),
      });
      return {
        projectId: chosen.id,
        projectName: chosen.target?.name ?? chosen.target?.targetId ?? "",
        sessionsDone: nights.filter((n) => n.state === "done").map(line),
        sessionsPlanned: nights.filter((n) => n.state !== "done").map(line),
      };
    },

    /** The multi-night plans a night or a plan of one night belongs to. */
    async projectIdsOf(tenantId, { sessionId = null, planId = null }) {
      const state = await snapshot(driver, tenantId);
      const ids = new Set();
      const add = (plan, night) => {
        for (const item of plan?.items ?? [])
          if (text(item.projectId)) ids.add(item.projectId);
        if (night?.projectId) ids.add(night.projectId);
      };
      if (sessionId) {
        const night = state.nightsById.get(sessionId);
        if (night) add(state.plansById.get(night.planId), night);
      }
      if (planId) {
        const plan = state.plansById.get(planId);
        if (plan) add(plan, state.nightByPlanId.get(planId));
      }
      return ids;
    },

    /**
     * What attaching would do, checked and nothing written: for each night
     * and each plan, how it is linked (`plan` or `night`), or the refusal
     * `{ refusal: "session_not_found" | "plan_not_found" | "target_mismatch",
     * sessionId?, planId? }` of the first that cannot be.
     */
    async attachPlan(tenantId, keys, { sessionIds = [], planIds = [] }) {
      const state = await snapshot(driver, tenantId);
      return planAttachment(state, keys, { sessionIds, planIds });
    },

    /**
     * Attaches the nights and plans to `project` in one transaction, after
     * checking them all again; their integrations of the target follow.
     */
    async attach({
      tenantId,
      userId,
      project,
      sessionIds = [],
      planIds = [],
      originClientInstanceId = null,
    }) {
      const at = now();
      const domains = new Set();
      const result = await driver.transaction(async (tx) => {
        await lockSpace(tx, tenantId);
        const state = await snapshot(tx, tenantId);
        const plan = planAttachment(state, project.keys, {
          sessionIds,
          planIds,
        });
        if (plan.refusal) return plan;
        for (const step of plan.steps) {
          if (step.planId && step.link === "plan") {
            if (
              await rewritePlan(
                tx,
                tenantId,
                step.planId,
                withProject(project.id, project.keys),
                at,
              )
            )
              domains.add("plans");
          }
          if (step.sessionId) {
            // A night of several targets sits in several multi-night plans:
            // its own link is cleared only when it was this plan's.
            const held = state.nightsById.get(step.sessionId);
            const heldId = held?.projectId ?? null;
            const own =
              step.link === "night"
                ? project.id
                : heldId === project.id
                  ? null
                  : heldId;
            if (heldId !== own) {
              await tx.run(
                "UPDATE observation_sessions SET project_id = ?, updated_at = ? WHERE id = ? AND tenant_id = ?",
                [own, at, step.sessionId, tenantId],
              );
              domains.add("sessions");
            }
            const keys = [...project.keys];
            const moved = await tx.run(
              `UPDATE project_integrations SET project_id = ?, updated_at = ?
               WHERE tenant_id = ? AND night_id = ?
                 AND (project_id IS NULL OR project_id <> ?)
                 AND target_id IN (${keys.map(() => "?").join(", ")})`,
              [project.id, at, tenantId, step.sessionId, project.id, ...keys],
            );
            if (moved.rowCount) domains.add("projects");
          }
        }
        await audit(tx, {
          tenantId,
          userId,
          eventType: "project.nights_attached",
          details: { projectId: project.id, sessionIds, planIds },
          at,
        });
        domains.add("projects");
        return {
          ok: true,
          sessionIds: [
            ...new Set(
              plan.steps.map((step) => step.sessionId).filter(Boolean),
            ),
          ],
        };
      });
      if (result.refusal) return result;
      changed(tenantId, domains, originClientInstanceId);
      return { ok: true, sessionIds: result.sessionIds };
    },

    /**
     * Detaches a night (`nightId` a night of the space) or a plan of one
     * night (`nightId` a plan of the space) from `project`; its
     * integrations of the plan leave it. `{ refusal: "night_not_found" }`
     * when the space holds neither; detaching a night that is not attached
     * changes nothing.
     */
    async detach({
      tenantId,
      userId,
      project,
      nightId,
      originClientInstanceId = null,
    }) {
      const at = now();
      const domains = new Set();
      const result = await driver.transaction(async (tx) => {
        await lockSpace(tx, tenantId);
        const state = await snapshot(tx, tenantId);
        let night = state.nightsById.get(nightId) ?? null;
        let plan = null;
        if (night)
          plan = night.planId ? state.plansById.get(night.planId) : null;
        else {
          plan = state.plansById.get(nightId) ?? null;
          if (!plan) return { refusal: "night_not_found" };
          night = state.nightByPlanId.get(plan.id) ?? null;
        }
        if (
          plan &&
          (await rewritePlan(
            tx,
            tenantId,
            plan.id,
            withoutProject(project.id),
            at,
          ))
        )
          domains.add("plans");
        if (night?.projectId === project.id) {
          await tx.run(
            "UPDATE observation_sessions SET project_id = NULL, updated_at = ? WHERE id = ? AND tenant_id = ?",
            [at, night.id, tenantId],
          );
          domains.add("sessions");
        }
        if (night) {
          const out = await tx.run(
            "UPDATE project_integrations SET project_id = NULL, updated_at = ? WHERE tenant_id = ? AND night_id = ? AND project_id = ?",
            [at, tenantId, night.id, project.id],
          );
          if (out.rowCount) domains.add("projects");
        }
        if (domains.size) {
          await audit(tx, {
            tenantId,
            userId,
            eventType: "project.night_detached",
            details: {
              projectId: project.id,
              sessionId: night?.id ?? null,
              planId: plan?.id ?? null,
            },
            at,
          });
          domains.add("projects");
        }
        return { ok: true };
      });
      if (result.refusal) return result;
      changed(tenantId, domains, originClientInstanceId);
      return { ok: true };
    },
  };
}

/**
 * How each night and plan would be attached to a plan of target `keys`:
 * through its plan's item of the target (`plan`) when it has one, else by
 * the night itself (`night`) when the night met the target; a plan of one
 * night only through its item. The first that cannot be is the refusal.
 */
export function planAttachment(state, keys, { sessionIds = [], planIds = [] }) {
  const steps = [];
  const planned = new Set();
  for (const sessionId of sessionIds) {
    const night = state.nightsById.get(sessionId);
    if (!night) return { refusal: "session_not_found", sessionId };
    const plan = night.planId ? state.plansById.get(night.planId) : null;
    if (plan?.items.some((item) => planItemIsTarget(item, keys))) {
      planned.add(plan.id);
      steps.push({ sessionId, planId: plan.id, link: "plan" });
    } else if (meets(keys, night.targets))
      steps.push({ sessionId, planId: plan?.id ?? null, link: "night" });
    else return { refusal: "target_mismatch", sessionId };
  }
  for (const planId of planIds) {
    if (planned.has(planId)) continue;
    const plan = state.plansById.get(planId);
    if (!plan) return { refusal: "plan_not_found", planId };
    if (!plan.items.some((item) => planItemIsTarget(item, keys)))
      return { refusal: "target_mismatch", planId };
    planned.add(planId);
    const night = state.nightByPlanId.get(planId) ?? null;
    steps.push({ sessionId: night?.id ?? null, planId, link: "plan" });
  }
  return { steps };
}
