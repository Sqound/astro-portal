import {
  currentBootId,
  replaySince,
  subscribe,
} from "portal/api/change-bus.js";
import { v1Json } from "../../../../lib/v1/response.js";
import { eitherV1Access } from "../../../../lib/v1/access.js";

/**
 * `GET /v1/changes`: the reactive change signal's only HTTP surface. It carries
 * no business data — see `packages/astro-contracts/schemas/api/
 * change-signal.schema.json` — and is never required for the app to work; it
 * only makes the existing synchronization run sooner.
 */

// Overridable only so that a test need not wait a real 25 s to prove a
// revoked device or expired session closes the stream; unset, it is 25 s.
const HEARTBEAT_INTERVAL_MS = Number(
  process.env.ASTRO_PORTAL_CHANGES_HEARTBEAT_MS || 25_000,
);
const MAX_CONNECTIONS_PER_DEVICE = 2;
const MAX_CONNECTIONS_PER_SESSION = 4;
// Overridable only so that a test need not open 200 real connections to
// prove the global cap answers `503`; unset, it is 200.
const MAX_CONNECTIONS_PER_PROCESS = Number(
  process.env.ASTRO_PORTAL_CHANGES_MAX_CONNECTIONS || 200,
);
// A space's own share of the process's streams. Its
// devices and web sessions together hold at most this many; past it the
// OLDEST stream of the same space is closed (the carrier rule below), so
// one space can never take the whole process-wide ceiling from the others.
// A person with a phone, Astro Sync and a few browser tabs stays well
// under it.
const MAX_CONNECTIONS_PER_SPACE = Number(
  process.env.ASTRO_PORTAL_CHANGES_MAX_CONNECTIONS_PER_SPACE || 16,
);

// Per-process connection accounting. A carrier ("2 per device", "4 per web
// session") is either a device or a session, never both on the same
// connection, since `eitherV1Access` authenticates one credential style
// per request.
/** @type {Map<string, Set<{ openedAt: number, close: () => void }>>} */
const connectionsByDevice = new Map();
/** @type {Map<string, Set<{ openedAt: number, close: () => void }>>} */
const connectionsBySession = new Map();
/** @type {Map<string, Set<{ openedAt: number, close: () => void }>>} */
const connectionsBySpace = new Map();
let totalConnections = 0;

function registerConnection(byCarrier, carrierId, connection) {
  let set = byCarrier.get(carrierId);
  if (!set) {
    set = new Set();
    byCarrier.set(carrierId, set);
  }
  set.add(connection);
  return set;
}

function unregisterConnection(byCarrier, carrierId, connection) {
  const set = byCarrier.get(carrierId);
  if (!set) return;
  set.delete(connection);
  if (set.size === 0) byCarrier.delete(carrierId);
}

function oldestOf(set) {
  let oldest = null;
  for (const candidate of set)
    if (!oldest || candidate.openedAt < oldest.openedAt) oldest = candidate;
  return oldest;
}

function capacityExceededResponse() {
  return v1Json(
    {
      error: {
        code: "changes_capacity_exceeded",
        message: "Too many active change streams. Try again shortly.",
      },
    },
    { status: 503, headers: { "Retry-After": "5" } },
  );
}

function sseFrame(kind, cursor, data) {
  return `id: ${cursor}\nevent: ${kind}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request) {
  // Either a device bearer or a web session cookie, exactly like every
  // other route both credential styles may call — but `synchronize: false`
  // so opening this channel never updates a device's `last_sync_at` (the
  // debriefing "unsynchronized device" warning must stay honest: watching
  // for signals is not the same as having pulled anything).
  const access = await eitherV1Access(request, { synchronize: false });
  if (access.response) return access.response;

  if (totalConnections >= MAX_CONNECTIONS_PER_PROCESS)
    return capacityExceededResponse();

  const { tenantId, deviceId, session } = access;
  const sessionId = session ? session.id : null;
  const requestUrl = new URL(request.url);
  const clientInstanceId = requestUrl.searchParams.get("client") || null;
  const lastEventId = request.headers.get("last-event-id");

  const encoder = new TextEncoder();
  const connection = { openedAt: Date.now(), close: () => {} };
  let streamController = null;
  let heartbeatTimer = null;
  let unsubscribe = null;
  let closed = false;

  function enqueue(text) {
    if (closed || !streamController) return;
    try {
      streamController.enqueue(encoder.encode(text));
    } catch {
      cleanup();
    }
  }

  function deliver(event) {
    // Never echo a signal back to the client instance that produced it
    // (`originClientInstanceId`); every other instance on the account,
    // including a second tab or a second device, still gets it. A `resync`
    // (no `originClientInstanceId` at all) always reaches everyone.
    if (
      event.kind === "change" &&
      clientInstanceId &&
      event.originClientInstanceId === clientInstanceId
    )
      return;
    if (event.kind === "resync") {
      enqueue(sseFrame("resync", event.cursor, { cursor: event.cursor }));
    } else {
      enqueue(
        sseFrame("change", event.cursor, {
          cursor: event.cursor,
          domains: event.domains,
        }),
      );
    }
  }

  function cleanup() {
    if (closed) return;
    closed = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (unsubscribe) unsubscribe();
    totalConnections -= 1;
    if (deviceId)
      unregisterConnection(connectionsByDevice, deviceId, connection);
    if (sessionId)
      unregisterConnection(connectionsBySession, sessionId, connection);
    unregisterConnection(connectionsBySpace, tenantId, connection);
    try {
      streamController?.close();
    } catch {
      // Already closed by the client disconnecting: nothing left to do.
    }
  }
  connection.close = cleanup;

  async function revalidateAndPing() {
    try {
      // A revoked device or an expired/disabled session must close the
      // stream, not silently keep ticking.
      const revalidation = await eitherV1Access(request, {
        synchronize: false,
      });
      if (revalidation.response) {
        cleanup();
        return;
      }
      enqueue(": ping\n\n");
    } catch {
      cleanup();
    }
  }

  const stream = new ReadableStream({
    start(controller) {
      streamController = controller;
      totalConnections += 1;

      // Limits: over the cap, the OLDEST connection of the same carrier is
      // closed — never a refusal, which would only make a reconnecting
      // client loop.
      if (deviceId) {
        const set = registerConnection(
          connectionsByDevice,
          deviceId,
          connection,
        );
        if (set.size > MAX_CONNECTIONS_PER_DEVICE) {
          const oldest = oldestOf(set);
          if (oldest && oldest !== connection) oldest.close();
        }
      }
      if (sessionId) {
        const set = registerConnection(
          connectionsBySession,
          sessionId,
          connection,
        );
        if (set.size > MAX_CONNECTIONS_PER_SESSION) {
          const oldest = oldestOf(set);
          if (oldest && oldest !== connection) oldest.close();
        }
      }
      const spaceSet = registerConnection(
        connectionsBySpace,
        tenantId,
        connection,
      );
      while (spaceSet.size > MAX_CONNECTIONS_PER_SPACE) {
        const oldest = oldestOf(spaceSet);
        if (!oldest || oldest === connection) break;
        oldest.close();
      }

      enqueue("retry: 5000\n\n");

      if (lastEventId) {
        const replay = replaySince(tenantId, lastEventId);
        if (replay.resync) {
          const cursor = `${currentBootId()}:0`;
          enqueue(sseFrame("resync", cursor, { cursor }));
        } else {
          for (const event of replay.events)
            enqueue(
              "domains" in event
                ? sseFrame("change", event.cursor, event)
                : sseFrame("resync", event.cursor, event),
            );
        }
      }

      unsubscribe = subscribe(tenantId, deliver);

      heartbeatTimer = setInterval(revalidateAndPing, HEARTBEAT_INTERVAL_MS);
      heartbeatTimer.unref?.();
    },
    cancel() {
      cleanup();
    },
  });

  request.signal.addEventListener("abort", cleanup);

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
