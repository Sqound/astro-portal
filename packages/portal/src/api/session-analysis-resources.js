import { resolveWriteAccess, staticProfile } from "../capabilities/provider.js";
import { OPEN_SOURCE_PROFILE } from "../capabilities/profiles.js";
import {
  createSessionAnalysisRepository,
  SessionAnalysisRepositoryError,
} from "../persistence/session-analysis-repository.js";
import { canonicalJson } from "../persistence/planner-state-repository.js";
import { reportSchemaErrors } from "./session-analysis-report-schema.js";

/**
 * The night's analysis:
 * the report (v3 since w61, v2 before) Astro Sync builds from the night's
 * logs and frames, or the import of the old nights builds
 * (`session-analysis.schema.json`). A v3 holds its guiding reduced to one
 * point per 10 s (`guidingTrace`, checked in order) and is refused above
 * 2 MB (413 `analysis_too_large`); a v2 already stored is served as it is. One
 * analysis per night: `create` REPLACES the night's analysis and the steps
 * it proposed that nobody corrected (a step corrected by hand stays,
 * marked); a report holding nothing is refused (422 `analysis_empty`), so a
 * night's measures are never wiped by an empty sending. `remove` deletes
 * the analysis. Reading is never gated by a capability; creating needs
 * `analysis.logs` and no read-only window.
 */
export class SessionAnalysisError extends Error {
  constructor(code, message, { status = 400, ...details } = {}) {
    super(message);
    this.name = "SessionAnalysisError";
    this.code = code;
    this.status = status;
    this.body = { error: { code, message }, ...details };
    Object.assign(this, details);
  }
}

function apiError(error) {
  if (error instanceof SessionAnalysisError) return error;
  if (error instanceof SessionAnalysisRepositoryError) {
    const {
      code,
      message,
      status,
      name: _name,
      stack: _stack,
      ...details
    } = error;
    return new SessionAnalysisError(code, message, { status, ...details });
  }
  return new SessionAnalysisError(
    "session_analysis_unavailable",
    "Session analysis storage is unavailable.",
    { status: 503 },
  );
}

function requiredIdentifier(value, label) {
  const result = String(value || "").trim();
  if (!result)
    throw new SessionAnalysisError("invalid_request", `${label} is required.`);
  return result;
}

/** Whether a report holds nothing a night could show (never replace an analysis by an empty one). */
export function isEmptyReport(report) {
  const none = (value) => !Array.isArray(value) || value.length === 0;
  return (
    none(report.acquisitionSteps) &&
    none(report.quality) &&
    none(report.guiding) &&
    none(report.guidingTrace?.points) &&
    none(report.guidingSeries) &&
    none(report.timeline?.events)
  );
}

/**
 * The largest report v3 kept, in bytes of its canonical JSON: a night of
 * twelve hours at one point per 10 s is about 0.8 MB. A report v2 (raw
 * samples, up to 4 MB a night) stays under the route's own limit.
 */
export const MAX_REPORT_V3_BYTES = 2 * 1024 * 1024;

/**
 * Why a report v3's trace is refused: its points not in order or closer
 * than `intervalSeconds` (« at most one point per 10 s »), a window holding
 * more samples left out than samples. `null` when it holds.
 */
export function traceError(report) {
  const trace = report?.guidingTrace;
  if (!trace) return null;
  let last = -Infinity;
  for (const point of trace.points) {
    if (point.t < last + trace.intervalSeconds)
      return "guidingTrace.points must be in order, at most one per intervalSeconds.";
    if (point.out > point.n)
      return "guidingTrace.points[].out cannot exceed n.";
    last = point.t;
  }
  return null;
}

async function requireSession(repository, tenantId, sessionId) {
  if (!(await repository.sessionExists(tenantId, sessionId)))
    throw new SessionAnalysisError(
      "session_not_found",
      "The session was not found.",
      { status: 404 },
    );
}

/**
 * Methods:
 * - create({ tenantId, userId, sessionId, report, originDeviceId? }) ->
 *     { analysis, replaced, steps: { proposed, keptEdited } }
 * - get({ tenantId, sessionId }) -> the analysis resource (report
 *     included), or 404 `analysis_not_found`
 * - remove({ tenantId, sessionId }) -> undefined, or 404 `analysis_not_found`
 */
export async function createSessionAnalysisService({
  repository = null,
  databasePath,
  databaseUrl,
  driver,
  dialect,
  entitlementProvider = null,
  capabilities = OPEN_SOURCE_PROFILE,
} = {}) {
  const store =
    repository ||
    (await createSessionAnalysisRepository({
      databasePath,
      databaseUrl,
      driver,
      dialect,
    }));
  const provider = entitlementProvider || staticProfile(capabilities);

  /**
   * `analysis.logs` gates creating an analysis only (contract checkpoint,
   * "Session analyses" § Capability): reads stay open regardless, on the
   * same doctrine `api/v1.md`'s "Uploads and captures" already states for
   * sessions/events/debriefing — an analysis already recorded stays fully
   * readable even if the account's capability later changes.
   */
  async function requireEntitled(userId) {
    const granted = await provider.capabilitiesFor(userId);
    if (!granted?.["analysis.logs"])
      throw new SessionAnalysisError(
        "analysis_not_entitled",
        "This account cannot upload local-analysis reports.",
        { status: 403 },
      );
  }

  /**
   * The read-only write gate: uploading a new analysis is a new envoi of
   * content exactly like an upload or a plan write, so it honours the
   * read-only window on the same doctrine as
   * `plan-resources.js`/`framing-resources.js`/`upload-resources.js`.
   * Reads stay open regardless ("reads never gated").
   */
  async function requireWriteAccess(userId) {
    const access = await resolveWriteAccess(provider, userId);
    if (access.readOnly)
      throw new SessionAnalysisError(
        "entitlement_read_only",
        "This account's subscription has ended: analysis uploads are suspended; existing analyses remain readable and exportable.",
        { status: 403 },
      );
  }

  return {
    async close() {
      await store.close?.();
    },

    async create({
      tenantId,
      userId,
      sessionId,
      report,
      originDeviceId = null,
      originClientInstanceId = null,
    }) {
      try {
        const normalizedTenantId = requiredIdentifier(tenantId, "Tenant id");
        requiredIdentifier(userId, "User id");
        const normalizedSessionId = requiredIdentifier(sessionId, "Session id");
        await requireWriteAccess(userId);
        await requireEntitled(userId);
        await requireSession(store, normalizedTenantId, normalizedSessionId);
        if (
          report === null ||
          typeof report !== "object" ||
          Array.isArray(report)
        )
          throw new SessionAnalysisError(
            "invalid_request",
            "A JSON report object is required.",
          );
        const errors = reportSchemaErrors(report);
        if (errors.length)
          throw new SessionAnalysisError(
            "invalid_request",
            `The report does not match session-analysis.schema.json: ${errors[0]}`,
          );
        const traceProblem = traceError(report);
        if (traceProblem)
          throw new SessionAnalysisError("invalid_request", traceProblem);
        const reportJson = canonicalJson(report);
        if (
          report.reportVersion >= 3 &&
          Buffer.byteLength(reportJson, "utf8") > MAX_REPORT_V3_BYTES
        )
          throw new SessionAnalysisError(
            "analysis_too_large",
            "The report is larger than a night's reduced guiding and poses can be (2 MB): it was not kept.",
            { status: 413 },
          );
        if (isEmptyReport(report))
          throw new SessionAnalysisError(
            "analysis_empty",
            "The report holds no step, no measure, no guiding and no event: the night's analysis is kept.",
            { status: 422 },
          );
        const keys = report.acquisitionSteps.map((step) => step.key);
        if (new Set(keys).size !== keys.length)
          throw new SessionAnalysisError(
            "invalid_request",
            "Each acquisition step of the report needs its own key.",
          );
        return await store.replace({
          tenantId: normalizedTenantId,
          sessionId: normalizedSessionId,
          reportVersion: report.reportVersion,
          // Re-canonicalized rather than trusting the caller's own byte
          // layout verbatim: two structurally identical reports (whatever
          // key order or whitespace the producer sent) are then also
          // byte-identical in storage, matching astro-sync-core's own
          // canonical_json rendering.
          reportJson,
          steps: report.acquisitionSteps,
          stepOrigin: report.producer === "import" ? "import" : "analysis",
          originDeviceId: originDeviceId || null,
          originClientInstanceId: originClientInstanceId || null,
        });
      } catch (error) {
        throw apiError(error);
      }
    },

    async get({ tenantId, sessionId }) {
      try {
        const normalizedTenantId = requiredIdentifier(tenantId, "Tenant id");
        const normalizedSessionId = requiredIdentifier(sessionId, "Session id");
        await requireSession(store, normalizedTenantId, normalizedSessionId);
        const resource = await store.get(
          normalizedTenantId,
          normalizedSessionId,
        );
        if (!resource)
          throw new SessionAnalysisError(
            "analysis_not_found",
            "This night has no analysis.",
            { status: 404 },
          );
        return resource;
      } catch (error) {
        throw apiError(error);
      }
    },

    async remove({ tenantId, sessionId, originClientInstanceId = null }) {
      try {
        const normalizedTenantId = requiredIdentifier(tenantId, "Tenant id");
        const normalizedSessionId = requiredIdentifier(sessionId, "Session id");
        await requireSession(store, normalizedTenantId, normalizedSessionId);
        const removed = await store.remove({
          tenantId: normalizedTenantId,
          sessionId: normalizedSessionId,
          originClientInstanceId: originClientInstanceId || null,
        });
        if (!removed)
          throw new SessionAnalysisError(
            "analysis_not_found",
            "This night has no analysis.",
            { status: 404 },
          );
      } catch (error) {
        throw apiError(error);
      }
    },
  };
}
