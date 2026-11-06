import { requirePlanResourceService } from "./plan-resource-service.js";
import { requireObservationSessionService } from "./observation-session-service.js";
import {
  catalogueNightsOfPrivateServer,
  requireJournalService,
} from "./journal-service.js";
import { ObservationSessionError } from "portal/api/observation-sessions.js";
import { isSyntheticSessionId } from "./synthetic-session.js";
import { sessionDebriefFields } from "./session-debrief-service.js";
import { nightFields } from "./night-service.js";

/**
 * The read-through plan projection api/v1.md's "Equipment on a session"
 * describes: `equipment` is the frozen plan payload's own `equipment`
 * object, echoed verbatim and resolved at request time, never copied onto
 * the session. Null for a direct session or when the linked plan cannot be
 * resolved (soft-deleted; should not otherwise happen given the foreign
 * key) — a session read must never fail over its own plan's projection.
 */
function planProjection(plan) {
  if (!plan) return null;
  return {
    planId: plan.id,
    status: plan.status,
    revision: plan.revision,
    frozenAt: plan.frozenAt,
    nightStartAt: plan.nightStartAt,
    nightEndAt: plan.nightEndAt,
    equipment: plan.payload?.equipment ?? null,
  };
}

/**
 * The detail of a catalogue night of a private server:
 * the read-only session `GET /v1/journal` lists under an opaque identifier,
 * with its targets. It has no plan, no event and no supplement, and nothing
 * writes to it (`409 session_read_only` on every other route).
 * `404 session_not_found` when the operator's catalogue has no such night left
 * unmatched (and where spaces are open, which has no catalogue nights).
 */
async function catalogueSessionDetail({
  tenantId,
  sessionId,
  catalogueNights,
}) {
  const line = await (
    await requireJournalService()
  ).catalogueSession({
    tenantId,
    sessionId,
    catalogueNights:
      catalogueNights ?? (await catalogueNightsOfPrivateServer()),
  });
  if (!line)
    throw new ObservationSessionError(
      "session_not_found",
      "The session was not found.",
      { status: 404 },
    );
  const startedAt = line.startedAt ?? `${line.eveningDate}T00:00:00.000Z`;
  return {
    session: {
      id: line.sessionId,
      planId: null,
      status: "finished",
      startedAt,
      finishedAt: line.finishedAt,
      createdAt: startedAt,
      updatedAt: startedAt,
      clientSessionId: null,
      eventCount: 0,
      supplementCount: 0,
      pendingSupplementCount: 0,
      outcome: null,
      origin: "import",
      projectId: null,
      eveningDate: line.eveningDate,
      reworkRevision: 0,
      reworkedAt: null,
      readOnly: true,
    },
    supplements: [],
    events: {
      sessionId: line.sessionId,
      events: [],
      nextSince: null,
      hasMore: false,
    },
    plan: null,
    debrief: null,
    debriefSummary: null,
    guidingLosses: null,
    guidingLossesReason: "no_analysis",
    targets: line.targets,
    readOnly: true,
  };
}

/**
 * The body of `GET /v1/sessions/{id}` (`session.schema.json`, `detail`), also
 * the answer of `PUT /v1/sessions/{id}/rework`: one session with its
 * supplements, the first page of its **effective** events (the journal read
 * through its rework), the plan projection, the stored debriefing and the
 * summary of its night, the structured night and, for the Journal, its `targets` in the order of the
 * night. Never gated by a capability. `includeReplaced` (`?includeReplaced=true`) keeps the signals a rework replaced in the events,
 * marked `rework.replacedBy`. Throws the session service's errors
 * (`session_not_found`).
 */
export async function sessionDetailBody({
  tenantId,
  userId,
  sessionId,
  catalogueNights = null,
  includeReplaced = false,
}) {
  if (isSyntheticSessionId(sessionId))
    return await catalogueSessionDetail({
      tenantId,
      sessionId,
      catalogueNights,
    });
  const detail = await (
    await requireObservationSessionService()
  ).get({ tenantId, sessionId, includeReplaced });
  let plan = null;
  if (detail.session.planId) {
    try {
      plan = planProjection(
        await (
          await requirePlanResourceService()
        ).get({ tenantId, planId: detail.session.planId }),
      );
    } catch {
      plan = null;
    }
  }
  // Additive: the stored debriefing and the summary of the night
  // (`portal/api/session-debrief.js`).
  const summary = await sessionDebriefFields({ tenantId, userId, sessionId });
  const night = await nightFields({ tenantId, sessionId });
  let targets = [];
  try {
    targets =
      (await (
        await requireJournalService()
      ).targets({
        tenantId,
        sessionId,
      })) ?? [];
  } catch {
    // A session's detail never fails over its targets.
    targets = [];
  }
  return { ...detail, plan, ...summary, ...night, targets, readOnly: false };
}
