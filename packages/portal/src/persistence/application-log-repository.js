import { randomUUID } from "node:crypto";
import { createDatabaseDriver } from "./database.js";
import { withSerializedSqliteRetry } from "./db-transaction-retry.js";
import { applyMigrations } from "./migration-runner.js";

const now = () => new Date().toISOString();

/** The sources of a line: the web front, the service, the phone. */
export const APPLICATION_LOG_SOURCES = Object.freeze([
  "client",
  "server",
  "mobile",
]);

/** How long the lines of every source are kept (the hourly purge). */
export const APPLICATION_LOG_RETENTION_DAYS = 30;
/** The most entries one diagnostic token sends in any rolling 24 hours. */
export const MOBILE_LOG_DAILY_LIMIT = 500;

const DAY_MS = 24 * 60 * 60 * 1000;

function cleanText(value, fallback, maximum) {
  const text = String(value || "")
    // Control characters, and the invisible ones that change the reading
    // direction or hide text, never reach the administration's display.
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, "")
    .trim()
    .slice(0, maximum);
  return text || fallback;
}

function level(value) {
  return ["debug", "info", "warning", "error"].includes(value) ? value : "info";
}

function source(value) {
  return APPLICATION_LOG_SOURCES.includes(value) ? value : "server";
}

/**
 * The start of an event's name the administration filters on: the
 * characters of an event (`app-log-batch.js`), 80 at most; anything else
 * is no filter.
 */
export function appLogEventPrefix(value) {
  if (typeof value !== "string") return null;
  const prefix = value.trim();
  return /^[a-z][A-Za-z0-9_.-]{0,79}$/.test(prefix) ? prefix : null;
}

function recordFromRow(row) {
  if (!row) return null;
  try {
    return {
      id: row.id,
      tenantId: row.tenant_id || null,
      level: level(row.level),
      source: source(row.source),
      event: row.event_type,
      message: row.message,
      context: row.context_json ? JSON.parse(row.context_json) : null,
      createdAt: row.created_at,
      // A phone's line is anonymous: its token only.
      ...(row.source === "mobile"
        ? { diagnosticToken: row.diagnostic_token || null }
        : {}),
    };
  } catch {
    return null;
  }
}

/** A small independent repository lets logging migrate before the larger
 * private-notebook aggregate. It shares the same driver and migration runner. */
export async function createApplicationLogRepository({
  databasePath,
  databaseUrl,
  driver,
  dialect = driver?.dialect ?? (databaseUrl ? "postgres" : "sqlite"),
} = {}) {
  const ownsDriver = !driver;
  const db = driver || createDatabaseDriver({ databasePath, databaseUrl });
  await applyMigrations(db, dialect);

  return {
    async close() {
      if (ownsDriver) await db.close();
    },
    async recordAppLog({
      tenantId = null,
      level: requestedLevel = "info",
      source: requestedSource = "server",
      event,
      message,
      context = null,
    } = {}) {
      const entry = {
        id: randomUUID(),
        tenantId: tenantId ? String(tenantId) : null,
        level: level(requestedLevel),
        source: source(requestedSource),
        event: cleanText(event, "application.event", 120),
        message: cleanText(message, "Application event", 1200),
        context: context && typeof context === "object" ? context : null,
        createdAt: now(),
      };
      await db.run(
        `INSERT INTO application_logs (
          id, tenant_id, level, source, event_type, message, context_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.id,
          entry.tenantId,
          entry.level,
          entry.source,
          entry.event,
          entry.message,
          entry.context ? JSON.stringify(entry.context) : null,
          entry.createdAt,
        ],
      );
      return entry;
    },
    /**
     * Keeps the entries of the application's error logs an installation sent
     * (`validateAppLogBatch`, already checked by `findUnsafeAppLogEntry`),
     * under its diagnostic token alone (no space, no device),
     * source `mobile`, in one transaction: the entries older than {@link APPLICATION_LOG_RETENTION_DAYS}
     * days go first; an entry whose id the table holds is a duplicate (a
     * batch sent again after a lost answer); past
     * {@link MOBILE_LOG_DAILY_LIMIT} entries of the token in 24 hours,
     * nothing is written: `{ status: "limited", retryAfterSeconds }`.
     */
    async recordMobileLogs({
      token,
      entries,
      now: at = new Date(),
      dailyLimit = MOBILE_LOG_DAILY_LIMIT,
    }) {
      if (!token) throw new Error("A diagnostic token is required.");
      const receivedAt = at.toISOString();
      return await withSerializedSqliteRetry(db, async (transaction) => {
        if (dialect === "postgres")
          await transaction.run("SELECT pg_advisory_xact_lock(hashtext(?))", [
            `app-logs:${token}`,
          ]);
        await transaction.run(
          "DELETE FROM application_logs WHERE source = 'mobile' AND created_at < ?",
          [
            new Date(
              at.getTime() - APPLICATION_LOG_RETENTION_DAYS * DAY_MS,
            ).toISOString(),
          ],
        );
        const ids = [...new Set(entries.map((entry) => entry.id))];
        const held = new Set(
          (
            await transaction.query(
              `SELECT id FROM application_logs WHERE id IN (${ids.map(() => "?").join(", ")})`,
              ids,
            )
          ).rows.map((row) => row.id),
        );
        const fresh = [];
        for (const entry of entries)
          if (!held.has(entry.id)) {
            held.add(entry.id);
            fresh.push(entry);
          }
        const duplicates = entries.length - fresh.length;
        if (!fresh.length)
          return { status: "recorded", received: 0, duplicates };
        const windowStart = new Date(at.getTime() - DAY_MS).toISOString();
        const recent = Number(
          (
            await transaction.query(
              `SELECT COUNT(*) AS count FROM application_logs
               WHERE source = 'mobile' AND diagnostic_token = ? AND created_at > ?`,
              [token, windowStart],
            )
          ).rows[0]?.count || 0,
        );
        if (recent + fresh.length > dailyLimit) {
          const over = recent + fresh.length - dailyLimit;
          const oldest = (
            await transaction.query(
              `SELECT created_at FROM application_logs
               WHERE source = 'mobile' AND diagnostic_token = ? AND created_at > ?
               ORDER BY created_at ASC LIMIT 1 OFFSET ${Math.max(0, over - 1)}`,
              [token, windowStart],
            )
          ).rows[0]?.created_at;
          const frees = oldest ? Date.parse(oldest) + DAY_MS : at.getTime();
          return {
            status: "limited",
            retryAfterSeconds: Math.max(
              1,
              Math.ceil((frees - at.getTime()) / 1000),
            ),
          };
        }
        for (const entry of fresh)
          await transaction.run(
            `INSERT INTO application_logs (
              id, diagnostic_token, level, source, event_type, message, context_json, created_at
            ) VALUES (?, ?, ?, 'mobile', ?, ?, ?, ?)`,
            [
              entry.id,
              String(token),
              level(entry.level),
              entry.event,
              entry.message,
              JSON.stringify({
                at: entry.at,
                ...(entry.stack ? { stack: entry.stack } : {}),
                diagnostic: entry.diagnostic,
                breadcrumbs: entry.breadcrumbs,
                ...(entry.debugTrail ? { debugTrail: entry.debugTrail } : {}),
                // A device incident (`device.incident`): its header and its
                // exchange lines, read in « Journaux » with the entry.
                ...(entry.incident ? { incident: entry.incident } : {}),
              }),
              receivedAt,
            ],
          );
        return { status: "recorded", received: fresh.length, duplicates };
      });
    },
    /**
     * The hourly purge: the lines past their days, whatever their source —
     * the phones' error logs, the service's own lines and the browsers'.
     */
    async purgeExpiredLogs({ now: at = new Date() } = {}) {
      const result = await db.run(
        "DELETE FROM application_logs WHERE created_at < ?",
        [
          new Date(
            at.getTime() - APPLICATION_LOG_RETENTION_DAYS * DAY_MS,
          ).toISOString(),
        ],
      );
      return Number(result?.changes ?? result?.rowCount ?? 0);
    },
    /**
     * The administration's read (« Journaux »): newest first, at most 500,
     * filtered by level, source, the start of the event (`event`, a prefix:
     * `probe.` reads the plate-solving probe's entries; a value
     * that is not an event's name is ignored), by diagnostic `token` (the
     * lines of one installation, a token the person handed over; it filters `mobile` lines only) and — the search by the address
     * of a person, for the other sources — the space whose owner holds
     * `address` (no space: nothing). A `mobile` line carries its token and
     * nothing that names a space or a device.
     */
    async listAppLogs({
      limit = 200,
      level: requestedLevel,
      source: requestedSource,
      event: requestedEvent,
      address,
      token,
    } = {}) {
      const values = [];
      const clauses = [];
      const event = appLogEventPrefix(requestedEvent);
      if (event) {
        // The same on SQLite and PostgreSQL (LIKE differs in case and in
        // its `_`); the length is a checked whole number.
        clauses.push(`substr(l.event_type, 1, ${event.length}) = ?`);
        values.push(event);
      }
      if (["debug", "info", "warning", "error"].includes(requestedLevel)) {
        clauses.push("l.level = ?");
        values.push(requestedLevel);
      }
      if (APPLICATION_LOG_SOURCES.includes(requestedSource)) {
        clauses.push("l.source = ?");
        values.push(requestedSource);
      }
      const searched = typeof address === "string" ? address.trim() : "";
      // A phone's line names no space: the address is for the other sources.
      if (searched && requestedSource !== "mobile") {
        clauses.push(`l.tenant_id IN (SELECT m.tenant_id FROM memberships m
          JOIN users u ON u.id = m.user_id WHERE lower(u.email) = lower(?))`);
        values.push(searched.slice(0, 320));
      }
      const searchedToken = typeof token === "string" ? token.trim() : "";
      if (searchedToken) {
        clauses.push("l.source = 'mobile' AND l.diagnostic_token = ?");
        values.push(searchedToken.toLowerCase().slice(0, 64));
      }
      const safeLimit = Math.max(1, Math.min(500, Number(limit) || 200));
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      const rows = (
        await db.query(
          `SELECT l.* FROM application_logs l ${where}
           ORDER BY l.created_at DESC, l.id DESC LIMIT ?`,
          [...values, safeLimit],
        )
      ).rows;
      return rows.map(recordFromRow).filter(Boolean);
    },
  };
}
