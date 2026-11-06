import { randomUUID } from "node:crypto";
import { Client as PostgresClient } from "pg";
import { CHANGE_SIGNAL_DOMAINS } from "astro-contracts/change-signal";

/**
 * The in-process reactive change bus. Every domain write, on every
 * `packages/portal/src/api/*.js` / `src/persistence/*-repository.js` write
 * path, calls `publishChange` here **after its own transaction has
 * committed** — never from inside the transaction, and never on a path that
 * throws or returns a refusal (`missing`/`frozen`/`conflict`/…): no data ever
 * rides this channel, and the rule extends to the timing too — an emission
 * before commit would announce a state that might still be rolled back.
 *
 * This module owns exactly the accounting the contract
 * (`packages/astro-contracts/schemas/api/v1.md`, "Reactive change signal")
 * describes: a `<boot>:<n>` cursor per tenant, a 256-event ring buffer per
 * tenant for `Last-Event-ID` replay, and per-tenant isolation (`subscribe` only
 * ever sees events for the tenant it names). It carries no SSE framing and
 * opens no HTTP route — that is the SSE route's job — and relays nothing
 * between processes — that is the `LISTEN`/`NOTIFY` bridge's job, which is
 * expected to call this same module's `publishChange`/`subscribe` locally on
 * each process once it has decoded a `NOTIFY` payload from another process.
 *
 * `originClientInstanceId`, when a write carried the `X-Astro-Client-
 * Instance` header, rides the in-memory event object returned to `subscribe`
 * listeners (never the outgoing SSE JSON, which stays exactly
 * `{ cursor, domains }`/`{ cursor }`): the future SSE route decides, per
 * connection, whether to withhold an event from the instance that produced
 * it. A write with no header is treated as authored by no instance, so its
 * event reaches everyone — including the writer's own other tabs/devices.
 */

const BUFFER_LIMIT = 256;

// Identifies this server process's lifetime. A fresh process never reuses a
// prior boot's cursors, so a client presenting an old boot's Last-Event-ID
// is unambiguously told to resync rather than risk a coincidental sequence
// match against a different process's history.
const BOOT_ID = randomUUID();

const DOMAIN_SET = new Set(CHANGE_SIGNAL_DOMAINS);

/** @type {Map<string, { nextSeq: number, buffer: Array<{seq: number, cursor: string, domains: string[], originClientInstanceId: string|null}>, listeners: Set<(event: object) => void> }>} */
const tenants = new Map();

function tenantState(tenantId, { create = true } = {}) {
  let state = tenants.get(tenantId);
  if (!state && create) {
    state = { nextSeq: 0, buffer: [], listeners: new Set() };
    tenants.set(tenantId, state);
  }
  return state;
}

function cursorFor(seq) {
  return `${BOOT_ID}:${seq}`;
}

/**
 * A well-formed placeholder cursor for the SSE route to attach to an
 * immediate `resync` frame it sends a reconnecting client whose
 * `Last-Event-ID` is unknown (a different boot, or past the retained window)
 * — this module never hands out a cursor for an event that was not actually
 * recorded, so seq `0` here is a sentinel, not a claim that event 0
 * happened: whatever the client echoes back next either matches a real event
 * once one exists, or (as now) resolves to another resync via `replaySince`,
 * never a wrong partial replay.
 */
export function currentBootId() {
  return BOOT_ID;
}

/**
 * Publishes one change event for a tenant. `domains` must be a non-empty
 * subset of the closed contract list; anything else is a programming error
 * in the caller (a new domain is a contract change, not a silent addition
 * here) and throws rather than emitting a malformed event.
 *
 * Returns the event that was recorded (mainly useful to tests and to 6b.7's
 * `NOTIFY` bridge, which needs the cursor to include in its payload).
 */
export function publishChange({
  tenantId,
  domains,
  originClientInstanceId = null,
}) {
  const normalizedTenantId = String(tenantId || "").trim();
  if (!normalizedTenantId)
    throw new Error("publishChange requires a tenantId.");
  if (!Array.isArray(domains) || domains.length === 0)
    throw new Error("publishChange requires a non-empty domains array.");
  const normalizedDomains = [...new Set(domains)];
  for (const domain of normalizedDomains)
    if (!DOMAIN_SET.has(domain))
      throw new Error(`publishChange was given an unknown domain: ${domain}.`);
  const normalizedOrigin = originClientInstanceId
    ? String(originClientInstanceId)
    : null;

  const event = deliverLocally(
    normalizedTenantId,
    normalizedDomains,
    normalizedOrigin,
  );
  notifyPostgres(normalizedTenantId, normalizedDomains, normalizedOrigin);
  return event;
}

/**
 * Records one `change` event in a tenant's buffer and delivers it to that
 * tenant's local listeners. Shared by `publishChange` (a write on THIS process)
 * and, for the cross-process bridge, the `LISTEN` bridge's notification handler
 * (a write on ANOTHER process sharing the same PostgreSQL database) — the
 * latter never re-enters `publishChange` itself, since that would also
 * re-`NOTIFY`, bouncing every cross-process write back and forth forever.
 */
function deliverLocally(tenantId, domains, originClientInstanceId) {
  const state = tenantState(tenantId);
  const seq = state.nextSeq++;
  const event = {
    seq,
    cursor: cursorFor(seq),
    domains,
    originClientInstanceId,
  };
  state.buffer.push(event);
  if (state.buffer.length > BUFFER_LIMIT) state.buffer.shift();

  // Copy the listener set before iterating: a listener disconnecting
  // (unsubscribing) in reaction to its own delivery must not perturb this
  // publish's own iteration.
  for (const listener of [...state.listeners]) {
    listener({
      kind: "change",
      cursor: event.cursor,
      domains: event.domains,
      originClientInstanceId: event.originClientInstanceId,
    });
  }
  return event;
}

/**
 * Records a `resync` marker in a tenant's buffer (so a later `Last-Event-ID`
 * lookup lands on it and correctly still says "resync", never a silent
 * gap) and delivers it live to that tenant's subscribers. Used only by the
 * PostgreSQL bridge after a `LISTEN` reconnect: notifications may have been
 * dropped while disconnected, so every tenant with local subscribers is told
 * to re-read everything, never resolved automatically.
 */
function deliverResyncLocally(tenantId) {
  const state = tenantState(tenantId);
  const seq = state.nextSeq++;
  const event = {
    seq,
    cursor: cursorFor(seq),
    domains: null,
    originClientInstanceId: null,
    resync: true,
  };
  state.buffer.push(event);
  if (state.buffer.length > BUFFER_LIMIT) state.buffer.shift();
  for (const listener of [...state.listeners]) {
    listener({ kind: "resync", cursor: event.cursor });
  }
  return event;
}

/**
 * Subscribes to every future event published for `tenantId`. `listener` is
 * called with `{ kind: "change", cursor, domains, originClientInstanceId }`
 * or, after a PostgreSQL `LISTEN` reconnect, with
 * `{ kind: "resync", cursor }` — never for another tenant's events, and
 * never replayed history (use `replaySince` for that). Returns an
 * unsubscribe function.
 */
export function subscribe(tenantId, listener) {
  const normalizedTenantId = String(tenantId || "").trim();
  if (!normalizedTenantId) throw new Error("subscribe requires a tenantId.");
  if (typeof listener !== "function")
    throw new Error("subscribe requires a listener function.");
  const state = tenantState(normalizedTenantId);
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
  };
}

function parseCursor(cursor) {
  const match = /^(.+):(0|[1-9][0-9]*)$/.exec(String(cursor || ""));
  if (!match) return null;
  return { boot: match[1], seq: Number(match[2]) };
}

/**
 * Replays every event a tenant's buffer holds strictly after `cursor`, for
 * a reconnecting client's `Last-Event-ID`. `cursor` from a different
 * server boot, or older than the retained 256-event window, or not (yet)
 * known at all, always answers `{ resync: true }` rather than a (possibly
 * wrong) partial replay — never a guess. A missing/empty cursor (first
 * connection) answers the tenant's whole current buffer, which a fresh
 * connection is free to ignore (it is about to do a full synchronization
 * anyway).
 */
export function replaySince(tenantId, cursor) {
  const normalizedTenantId = String(tenantId || "").trim();
  if (!normalizedTenantId) throw new Error("replaySince requires a tenantId.");
  const state = tenantState(normalizedTenantId, { create: false });
  if (!cursor)
    return {
      resync: false,
      events: (state?.buffer || []).map(toWireEvent),
    };
  const parsed = parseCursor(cursor);
  if (!parsed || parsed.boot !== BOOT_ID) return { resync: true };
  if (!state) return { resync: true };
  const index = state.buffer.findIndex((event) => event.seq === parsed.seq);
  if (index === -1) return { resync: true };
  return {
    resync: false,
    events: state.buffer.slice(index + 1).map(toWireEvent),
  };
}

function toWireEvent(event) {
  return event.resync
    ? { cursor: event.cursor }
    : { cursor: event.cursor, domains: event.domains };
}

/**
 * Test-only reset: clears every tenant's cursor and buffer state. Never
 * called from production code — a real process's `BOOT_ID` already
 * guarantees a fresh cursor space per run.
 */
export function _resetForTests() {
  tenants.clear();
}

/**
 * Test-only: delivers a `resync` marker for `tenantId` exactly as the
 * PostgreSQL bridge does after a `LISTEN` reconnect, without needing a
 * real PostgreSQL connection. Production code never calls this directly
 * — only `startPostgresBridge`'s own reconnect handling does.
 */
export function _deliverResyncForTests(tenantId) {
  return deliverResyncLocally(String(tenantId || "").trim());
}

// --- PostgreSQL LISTEN/NOTIFY bridge ---------------------------
//
// SQLite is mono-process (the plan's own premise): the in-memory bus above
// is the whole story there, and nothing below is ever reached. Under
// PostgreSQL, several server processes can share one database, so a write
// on process A must still reach process B's local subscribers. `database.ts`
// calls `startPostgresBridge` exactly once per process, and only when the
// driver it just built reports `dialect === "postgres"` — this module never
// re-derives that from the connection string itself.

const NOTIFY_CHANNEL = "astro_changes";
const NOTIFY_PAYLOAD_LIMIT_BYTES = 8000;
const RECONNECT_INITIAL_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30_000;

/** @type {{ emitterId: string, client: import("pg").Client | null, stopped: boolean, connected: boolean, backoffMs: number, timer: NodeJS.Timeout | null, everConnected: boolean, ready: Promise<void> } | null} */
let postgresBridge = null;

/**
 * Starts (idempotently) this process's dedicated `LISTEN astro_changes`
 * connection, kept deliberately outside any pooled connection (a pool may
 * recycle or time out a connection mid-`LISTEN` without warning). Safe to
 * call more than once — later calls are no-ops as long as the bridge is
 * still running. Never called for SQLite; see the module note above.
 */
export function startPostgresBridge({ databaseUrl }) {
  if (!databaseUrl)
    throw new Error("startPostgresBridge requires a databaseUrl.");
  if (postgresBridge && !postgresBridge.stopped) return postgresBridge.ready;
  const bridge = {
    emitterId: BOOT_ID,
    client: null,
    stopped: false,
    connected: false,
    backoffMs: RECONNECT_INITIAL_DELAY_MS,
    timer: null,
    everConnected: false,
    ready: Promise.resolve(),
  };
  postgresBridge = bridge;
  bridge.ready = connectPostgresBridge(bridge, databaseUrl);
  return bridge.ready;
}

async function connectPostgresBridge(bridge, databaseUrl) {
  if (bridge.stopped) return;
  const client = new PostgresClient({ connectionString: databaseUrl });
  bridge.client = client;
  client.on("notification", (message) => {
    if (bridge.stopped) return;
    handleNotification(bridge, message?.payload);
  });
  // A raw 'error' must never crash the process; reconnection is driven by
  // 'end' below, which node-postgres always emits once the connection is
  // actually gone (after an error, or a clean server-side close).
  client.on("error", () => {});
  client.on("end", () => {
    if (bridge.stopped || postgresBridge !== bridge) return;
    bridge.client = null;
    bridge.connected = false;
    scheduleReconnect(bridge, databaseUrl);
  });
  try {
    await client.connect();
    await client.query(`LISTEN ${NOTIFY_CHANNEL}`);
    bridge.backoffMs = RECONNECT_INITIAL_DELAY_MS;
    bridge.connected = true;
    // A reconnect (as opposed to the very first connection) may have missed
    // NOTIFYs while disconnected: every tenant with local subscribers is
    // told to resync rather than risk a silent gap.
    if (bridge.everConnected) resyncEverySubscribedTenant();
    bridge.everConnected = true;
  } catch {
    bridge.client = null;
    bridge.connected = false;
    scheduleReconnect(bridge, databaseUrl);
  }
}

function scheduleReconnect(bridge, databaseUrl) {
  if (bridge.stopped) return;
  const delay = bridge.backoffMs;
  bridge.backoffMs = Math.min(bridge.backoffMs * 2, RECONNECT_MAX_DELAY_MS);
  bridge.timer = setTimeout(() => {
    bridge.ready = connectPostgresBridge(bridge, databaseUrl);
  }, delay);
  bridge.timer.unref?.();
}

function handleNotification(bridge, rawPayload) {
  let payload;
  try {
    payload = JSON.parse(String(rawPayload || ""));
  } catch {
    return; // Malformed payload (a future/older version's shape): ignore.
  }
  if (!payload || typeof payload !== "object") return;
  if (payload.emitterId === bridge.emitterId) return; // our own emission
  const tenantId = String(payload.tenantId || "").trim();
  if (!tenantId) return;
  if (!Array.isArray(payload.domains) || payload.domains.length === 0) return;
  const domains = payload.domains.filter((domain) => DOMAIN_SET.has(domain));
  if (domains.length === 0) return;
  const originClientInstanceId = payload.originClientInstanceId
    ? String(payload.originClientInstanceId)
    : null;
  deliverLocally(tenantId, domains, originClientInstanceId);
}

function resyncEverySubscribedTenant() {
  for (const tenantId of tenants.keys()) deliverResyncLocally(tenantId);
}

/**
 * Sends this event over `NOTIFY astro_changes` for every OTHER process
 * sharing the database to relay locally, via `pg_notify` (never a
 * string-interpolated `NOTIFY channel, 'payload'`, which would need its own
 * SQL-escaping). No-op when no bridge is running (SQLite, or PostgreSQL
 * before/between connections — a missed relay here is exactly what the
 * post-reconnect `resync` above exists to repair). The payload carries only
 * accounting, never business data, and is always far under PostgreSQL's own
 * 8000-byte `NOTIFY` limit.
 */
function notifyPostgres(tenantId, domains, originClientInstanceId) {
  const bridge = postgresBridge;
  if (!bridge || bridge.stopped || !bridge.client) return;
  const payload = JSON.stringify({
    emitterId: bridge.emitterId,
    tenantId,
    domains,
    originClientInstanceId,
  });
  if (Buffer.byteLength(payload, "utf8") > NOTIFY_PAYLOAD_LIMIT_BYTES) return;
  bridge.client
    .query("SELECT pg_notify($1, $2)", [NOTIFY_CHANNEL, payload])
    .catch(() => {
      // A publish must never throw because the cross-process relay hiccuped:
      // this process's own local subscribers already got the event above.
    });
}

/** Stops the bridge and closes its connection. Test/shutdown use only. */
export async function stopPostgresBridge() {
  const bridge = postgresBridge;
  if (!bridge) return;
  postgresBridge = null;
  bridge.stopped = true;
  if (bridge.timer) clearTimeout(bridge.timer);
  if (bridge.client) {
    try {
      await bridge.client.end();
    } catch {
      // Best-effort close.
    }
  }
}

/**
 * Test-only: is this process's PostgreSQL bridge currently `LISTEN`ing?
 * Tests poll this instead of racing the connection themselves.
 */
export function _postgresBridgeConnectedForTests() {
  return Boolean(postgresBridge && postgresBridge.connected);
}

/**
 * Test-only: forcibly drops the bridge's live connection to simulate a
 * network cut, without touching `stopped` — the bridge's own reconnect
 * logic must take it from here exactly as it would for a real outage.
 */
export function _simulateDisconnectForTests() {
  if (postgresBridge?.client) postgresBridge.client.end().catch(() => {});
}
