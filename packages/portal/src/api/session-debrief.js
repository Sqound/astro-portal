import { createDatabaseDriver } from "../persistence/database.js";
import { applyMigrations } from "../persistence/migration-runner.js";
import { debriefSummary } from "../debrief-summary.js";
import { guidingLossesFromReport } from "../guiding-losses.js";
import { debriefRecordForPlanRow } from "../persistence/debrief-repository.js";
import {
  parseJson,
  planRowFor,
} from "../persistence/planner-state-repository.js";
import {
  effectiveEventResources,
  parseLayer,
} from "../journal/session-rework-layer.js";
import {
  eventResourceForRow,
  sessionRowById,
} from "../persistence/observation-session-repository.js";

// "Session" here is always an OBSERVATION session; see the naming note at
// the top of persistence/observation-session-repository.js.

/**
 * What GET /v1/sessions/{id} adds to a session's detail for the summary of
 * its night: `debrief`, the debriefing stored with the plan
 * (debrief.schema.json's `record`, null for a direct session or a plan not
 * debriefed yet), and `debriefSummary`, the summary of the night
 * (`../debrief-summary.js`) computed from the plan's items, the whole
 * journal and that debriefing.
 *
 * And the guiding losses (`../guiding-losses.js`), read from the night's
 * analysis when the service holds one, whoever reads (reading an analysis is
 * never gated; a capability gates its creation). Otherwise `guidingLosses` is
 * null, `guidingLossesReason` says why (`no_analysis`), and the summary has no
 * guiding line (`guidingIncluded: false`).
 *
 * Additive: the summary reads the plan's `launchedSchedule` and the kind of
 * night (`equipment.mode`), and returns each target's passages and the
 * unconfirmed automatic time. A session with no plan (« Observation libre »)
 * is a visual night, its targets all observed outside any plan.
 *
 * Framework-free, on the pattern of the other v1 services; read-only.
 *
 * Methods:
 * - read({ tenantId, userId, sessionId }) -> { debrief, debriefSummary,
 *     guidingLosses, guidingLossesReason } | null when the session does not
 *     exist in this tenant.
 * - summaryInput({ tenantId, userId, sessionId }) -> the input of the
 *  summary (the web debriefing computes it again as the
 *     person corrects the targets) | null.
 */
export async function createSessionDebriefService({
  databasePath,
  databaseUrl,
  driver,
  dialect = driver?.dialect ?? (databaseUrl ? "postgres" : "sqlite"),
} = {}) {
  const ownsDriver = !driver;
  const db = driver || createDatabaseDriver({ databasePath, databaseUrl });
  await applyMigrations(db, dialect);

  /**
   * `{ guidingLosses, guidingLossesReason }` for one session: read from the
   * night's analysis whenever it has one (reading an analysis already present
   * is open, without a capability; `analysis.logs` gates its creation only).
   */
  async function guidingFor({ tenantId, sessionId }) {
    const row = (
      await db.query(
        `SELECT report_json FROM session_analyses
         WHERE tenant_id = ? AND session_id = ?`,
        [tenantId, sessionId],
      )
    ).rows[0];
    if (!row)
      return { guidingLosses: null, guidingLossesReason: "no_analysis" };
    return {
      guidingLosses: guidingLossesFromReport(parseJson(row.report_json, {})),
      guidingLossesReason: null,
    };
  }

  /** The session, its plan's debriefing and the input of its summary. */
  async function inputFor({ tenantId, userId, sessionId }) {
    const session = await sessionRowById(db, { tenantId, sessionId });
    if (!session) return null;
    const plan = session.plan_id
      ? await planRowFor(db, tenantId, session.plan_id)
      : null;
    const debrief = debriefRecordForPlanRow(plan);
    // The journal read through the session's rework: the summary follows the
    // pauses and the notes a rework added.
    const events = effectiveEventResources(
      (
        await db.query(
          `SELECT * FROM session_events WHERE session_id = ?
           ORDER BY recorded_at, event_id`,
          [sessionId],
        )
      ).rows.map(eventResourceForRow),
      parseLayer(session.rework_json),
      sessionId,
    );
    const payload = plan ? parseJson(plan.payload_json, {}) : {};
    const finishedAt = session.finished_at || plan?.night_end_at || null;
    const guiding = await guidingFor({ tenantId, sessionId });
    return {
      debrief,
      guiding,
      input: {
        nightStartAt: plan?.night_start_at || null,
        window: finishedAt
          ? { start: session.started_at, end: finishedAt }
          : null,
        planItems: Array.isArray(payload?.items) ? payload.items : [],
        events,
        adjustments: debrief ? debrief.targets : null,
        outcome: debrief ? debrief.outcome : null,
        guidingLosses: guiding.guidingLosses,
        // The plan as launched and the kind of night (the plan's
        // `equipment.mode`, the field the execution screen reads to move on
        // by hand or by itself).
        launchedSchedule: Array.isArray(payload?.launchedSchedule)
          ? payload.launchedSchedule
          : null,
        // A session with no plan is an « Observation libre » — a visual
        // night by nature, with nothing planned.
        kind:
          !session.plan_id || payload?.equipment?.mode === "visual"
            ? "visual"
            : "imaging",
      },
    };
  }

  return {
    async close() {
      if (ownsDriver) await db.close();
    },

    /**
     * The input of the summary of a session's night: what
     * `../debrief-summary.js` reads, with the debriefing stored so far.
     * Null when the session does not exist in this tenant. The web
     * debriefing screen takes it to compute the summary again as the person
     * corrects the targets, as the device does from its own journal.
     */
    async summaryInput({ tenantId, userId = null, sessionId }) {
      return (await inputFor({ tenantId, userId, sessionId }))?.input ?? null;
    },

    async read({ tenantId, userId = null, sessionId }) {
      const found = await inputFor({ tenantId, userId, sessionId });
      if (!found) return null;
      return {
        debrief: found.debrief,
        guidingLosses: found.guiding.guidingLosses,
        guidingLossesReason: found.guiding.guidingLossesReason,
        debriefSummary: debriefSummary(found.input),
      };
    },
  };
}
