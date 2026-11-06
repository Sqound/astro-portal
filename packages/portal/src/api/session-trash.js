import { createJournalRepository } from "../journal/journal-repository.js";
import { createSessionTrashRepository } from "../persistence/session-trash-repository.js";
import {
  SESSION_GRACE_DAYS,
  daysRemainingOf,
} from "../sessions/session-grace.js";

// "Session" here is always an OBSERVATION session; see the naming note at the
// top of persistence/observation-session-repository.js.

/** The stable application error for thin HTTP adapters (`body` is the v1 envelope). */
export class SessionTrashError extends Error {
  constructor(code, message, { status = 400, ...details } = {}) {
    super(message);
    this.name = "SessionTrashError";
    this.code = code;
    this.status = status;
    this.body = { error: { code, message }, ...details };
  }
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const notFound = () =>
  new SessionTrashError("session_not_found", "The session was not found.", {
    status: 404,
  });

function identifiers({ tenantId, sessionId }) {
  const tenant = String(tenantId || "").trim();
  if (!tenant)
    throw new SessionTrashError("invalid_request", "Tenant id is required.");
  const session = String(sessionId || "").trim();
  if (!UUID.test(session))
    throw new SessionTrashError(
      "invalid_request",
      "Session id must be a UUID.",
    );
  return { tenantId: tenant, sessionId: session };
}

/**
 * Framework-free service of the deleted sessions.
 * **Rights**: a space's credentials are its owner's (the only role a space
 * has), so the routes ask for a device or a web session of the space and
 * nothing more; a phone with no space has no session here and deletes on its
 * own device. A deletion is a voluntary clean-up, never held by a right: it
 * answers in the read-only window too.
 *
 * - remove({ tenantId, userId, sessionId }) -> `{ session, graceDays,
 *   daysRemaining }` (the session carries `deletedAt` and `purgeAt`)
 * - restore({ tenantId, userId, sessionId }) -> `{ session }`
 * - list({ tenantId }) -> `{ entries, graceDays }` (each entry `{ session,
 *   deletedAt, purgeAt, daysRemaining }`, `session` a Journal line)
 * - erase({ tenantId, userId, sessionId }) -> `{ sessionId, erased }`: only a
 *   session already deleted; the captures go first (`removeCapture`, which
 *   removes their files), then the rows; the answer counts what went
 * - purgeExpired({ at }) -> `{ sessions, captures, failed }`: the maintenance, every
 *   hour, erasing the sessions deleted more than `SESSION_GRACE_DAYS` ago
 */
export async function createSessionTrashService({
  repository = null,
  journalRepository = null,
  databasePath,
  databaseUrl,
  driver,
  dialect,
  removeCapture = async () => {},
  // What a composition keeps about a night (`sessions.erasure`), handed to
  // the repository this service creates.
  complement = null,
  now = () => new Date().toISOString(),
} = {}) {
  const store =
    repository ||
    (await createSessionTrashRepository({
      databasePath,
      databaseUrl,
      driver,
      dialect,
      complement,
    }));
  const journal =
    journalRepository ||
    (await createJournalRepository({
      databasePath,
      databaseUrl,
      driver,
      dialect,
    }));

  async function eraseOne({ tenantId, userId = null, sessionId }) {
    const prepared = await store.prepareErasure({ tenantId, sessionId });
    if (prepared.kind === "missing") throw notFound();
    if (prepared.kind === "not_deleted")
      throw new SessionTrashError(
        "session_not_deleted",
        "Only a deleted session is erased: delete it first.",
        { status: 409 },
      );
    for (const captureId of prepared.captureIds)
      try {
        await removeCapture({ tenantId, captureId });
      } catch (error) {
        // Already gone (a retry after a partial erasure): nothing to remove.
        if (error?.code !== "capture_not_found") throw error;
      }
    const erased = await store.eraseDeleted({
      tenantId,
      userId,
      sessionId,
      timestamp: now(),
    });
    if (erased.kind !== "ok") throw notFound();
    // The captures were counted before they went; the rows after.
    return {
      sessionId,
      erased: { ...erased.footprint, captures: prepared.captureIds.length },
    };
  }

  return {
    async close() {
      await store.close?.();
      await journal.close?.();
    },

    async remove({
      tenantId,
      userId = null,
      sessionId,
      originClientInstanceId = null,
    }) {
      const ids = identifiers({ tenantId, sessionId });
      const at = now();
      const result = await store.softDelete({
        ...ids,
        userId,
        originClientInstanceId,
        timestamp: at,
      });
      if (result.kind === "missing") throw notFound();
      if (result.kind === "not_finished")
        throw new SessionTrashError(
          "session_not_finished",
          "A night in progress is not deleted: finish it first.",
          { status: 409 },
        );
      return {
        session: result.session,
        graceDays: SESSION_GRACE_DAYS,
        daysRemaining: daysRemainingOf(result.session.deletedAt, at),
      };
    },

    async restore({
      tenantId,
      userId = null,
      sessionId,
      originClientInstanceId = null,
    }) {
      const result = await store.restore({
        ...identifiers({ tenantId, sessionId }),
        userId,
        originClientInstanceId,
        timestamp: now(),
      });
      if (result.kind === "missing") throw notFound();
      if (result.kind === "plan_taken")
        throw new SessionTrashError(
          "session_plan_taken",
          "This plan has another session since: a plan holds one session.",
          { status: 409, sessionId: result.sessionId },
        );
      return { session: result.session };
    },

    async list({ tenantId }) {
      const tenant = String(tenantId || "").trim();
      if (!tenant)
        throw new SessionTrashError(
          "invalid_request",
          "Tenant id is required.",
        );
      return await journal.deletedList({ tenantId: tenant, timestamp: now() });
    },

    async erase({ tenantId, userId = null, sessionId }) {
      return await eraseOne({
        ...identifiers({ tenantId, sessionId }),
        userId,
      });
    },

    async purgeExpired({ at = now() } = {}) {
      const expired = await store.expired({ at });
      let sessions = 0;
      let captures = 0;
      let failed = 0;
      for (const { tenantId, sessionId } of expired)
        try {
          const result = await eraseOne({ tenantId, sessionId });
          sessions += 1;
          captures += result.erased.captures;
        } catch {
          // One session that will not go does not hold the others: the next
          // sweep tries it again.
          failed += 1;
        }
      return { sessions, captures, failed };
    },
  };
}
