import { randomUUID } from "node:crypto";
import { createDatabaseDriver } from "./database.js";
import { applyMigrations } from "./migration-runner.js";
import { assertDeviceRoom } from "./space-limits.js";
import { publishChange } from "../api/change-bus.js";
import { withSerializedSqliteRetry } from "./db-transaction-retry.js";

const now = () => new Date().toISOString();

/** How often, at most, a space's last activity is written. */
export const SPACE_ACTIVITY_STEP_MS = 60 * 60_000;

/**
 * The space's last activity, `organizations.last_activity_at`, set to `at` unless it
 * already says a moment less than an hour before it — one write an hour
 * at most, whatever the number of requests. Whether a row was written.
 */
export async function touchSpaceActivity(driver, tenantId, at = new Date()) {
  if (!tenantId) return false;
  const moment = new Date(at);
  const stamp = moment.toISOString();
  const threshold = new Date(
    moment.getTime() - SPACE_ACTIVITY_STEP_MS,
  ).toISOString();
  const written = await driver.run(
    `UPDATE organizations SET last_activity_at = ?
     WHERE id = ? AND (last_activity_at IS NULL OR last_activity_at <= ?)`,
    [stamp, String(tenantId), threshold],
  );
  return written.rowCount === 1;
}

async function audit(
  driver,
  { tenantId = null, userId = null, eventType, details = null },
) {
  await driver.run(
    "INSERT INTO audit_events (id, tenant_id, user_id, event_type, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [
      randomUUID(),
      tenantId,
      userId,
      eventType,
      details ? JSON.stringify(details) : null,
      now(),
    ],
  );
}

/**
 * The one account of a private server, written at its installation
 * (docs/PRIVATE_NOTEBOOK_AUTH.md, « Installing »), inside the caller's
 * transaction: its organisation, its person (with a password hash in the
 * `password` mode, none in the `email-code` mode), the owner membership,
 * and the digests of its recovery codes. Refused once any person exists:
 * the installation happens once.
 */
export async function insertOwnerAccount(
  transaction,
  {
    email,
    passwordHash = null,
    organizationName,
    recoveryCodeHashes,
    language = null,
  },
) {
  if (
    Number(
      (await transaction.query("SELECT COUNT(*) AS count FROM users")).rows[0]
        .count,
    ) > 0
  )
    throw new Error("Bootstrap is already closed.");
  const tenantId = randomUUID();
  const userId = randomUUID();
  const timestamp = now();
  await transaction.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    [tenantId, organizationName, timestamp],
  );
  await transaction.run(
    "INSERT INTO users (id, email, password_hash, created_at, language) VALUES (?, ?, ?, ?, ?)",
    [userId, email, passwordHash, timestamp, language],
  );
  await transaction.run(
    "INSERT INTO memberships (id, tenant_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)",
    [randomUUID(), tenantId, userId, "owner", timestamp],
  );
  for (const codeHash of recoveryCodeHashes)
    await transaction.run(
      "INSERT INTO recovery_codes (id, user_id, code_hash, created_at) VALUES (?, ?, ?, ?)",
      [randomUUID(), userId, codeHash, timestamp],
    );
  await audit(transaction, {
    tenantId,
    userId,
    eventType: "bootstrap.completed",
  });
  return { tenantId, userId };
}

/** Security-critical private identity data on the shared async driver. */
export async function createAuthenticationRepository({
  databasePath,
  databaseUrl,
  driver,
  dialect = driver?.dialect ?? (databaseUrl ? "postgres" : "sqlite"),
} = {}) {
  const ownsDriver = !driver;
  const db = driver || createDatabaseDriver({ databasePath, databaseUrl });
  await applyMigrations(db, dialect);
  return {
    /** The driver the counters of the sign-in are kept on (throttles). */
    driver: db,
    async close() {
      if (ownsDriver) await db.close();
    },
    async countUsers() {
      return Number(
        (await db.query("SELECT COUNT(*) AS count FROM users")).rows[0].count,
      );
    },
    /**
     * The owner of a private server with the address `email`: active, with
     * the owner membership. `null` for any other address.
     */
    async findOwnerByEmail(email) {
      return (
        (
          await db.query(
            `SELECT users.*, memberships.tenant_id AS tenant_id FROM users
             JOIN memberships ON memberships.user_id = users.id
             WHERE users.email = ? AND users.disabled_at IS NULL
               AND memberships.role = 'owner'
             ORDER BY memberships.created_at
             LIMIT 1`,
            [email],
          )
        ).rows[0] || null
      );
    },
    /** The owner of a private server, whatever their address; `null` before its installation. */
    async findOwner() {
      return (
        (
          await db.query(
            `SELECT users.*, memberships.tenant_id AS tenant_id FROM users
             JOIN memberships ON memberships.user_id = users.id
             WHERE users.disabled_at IS NULL AND memberships.role = 'owner'
             ORDER BY memberships.created_at
             LIMIT 1`,
          )
        ).rows[0] || null
      );
    },
    async findMembership(userId) {
      return (
        (
          await db.query(
            "SELECT * FROM memberships WHERE user_id = ? ORDER BY created_at LIMIT 1",
            [userId],
          )
        ).rows[0] || null
      );
    },
    /** insertOwnerAccount, in a transaction of its own. */
    async createOwnerAccount(account) {
      return await withSerializedSqliteRetry(db, (transaction) =>
        insertOwnerAccount(transaction, account),
      );
    },
    async setPasswordHash(userId, passwordHash) {
      await db.run("UPDATE users SET password_hash = ? WHERE id = ?", [
        passwordHash,
        userId,
      ]);
      await audit(db, { userId, eventType: "auth.password_set" });
    },
    async consumeRecoveryCode(userId, codeHash) {
      return (
        (
          await db.run(
            "UPDATE recovery_codes SET used_at = ? WHERE user_id = ? AND code_hash = ? AND used_at IS NULL",
            [now(), userId, codeHash],
          )
        ).rowCount === 1
      );
    },
    async createSession({ tenantId, userId, tokenHash, csrfHash, expiresAt }) {
      const id = randomUUID();
      const timestamp = now();
      await db.run(
        "INSERT INTO sessions (id, tenant_id, user_id, token_hash, csrf_hash, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          id,
          tenantId,
          userId,
          tokenHash,
          csrfHash,
          expiresAt,
          timestamp,
          timestamp,
        ],
      );
      return id;
    },
    async findSession(tokenHash) {
      return (
        (
          await db.query(
            "SELECT sessions.*, users.email, users.disabled_at FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?",
            [tokenHash, now()],
          )
        ).rows[0] || null
      );
    },
    async touchSession(id) {
      await db.run("UPDATE sessions SET last_seen_at = ? WHERE id = ?", [
        now(),
        id,
      ]);
    },
    /**
     * The space's last activity (`organizations.last_activity_at`, migration
     * 97), written only when the one stored is an hour old or more. Whether a
     * row was written.
     */
    async touchSpaceActivity(tenantId, at = new Date()) {
      return await touchSpaceActivity(db, tenantId, at);
    },
    async deleteSession(tokenHash) {
      await db.run("DELETE FROM sessions WHERE token_hash = ?", [tokenHash]);
    },
    /**
     * Tenant-scoped read of a pairing challenge's own claimed state, for the
     * account page's own "did my phone finish pairing yet" poll. Returns
     * `null` for a code outside this tenant or never issued at all, so the
     * HTTP layer can answer a flat `404` without distinguishing the two —
     * neither is information a poller should be able to tell apart.
     */
    async findDevicePairingStatus({ code, tenantId }) {
      const pairing = (
        await db.query(
          "SELECT claimed_at FROM device_pairings WHERE code = ? AND tenant_id = ?",
          [code, tenantId],
        )
      ).rows[0];
      if (!pairing) return null;
      return { claimed: pairing.claimed_at != null };
    },
    /**
     * Stores a short-lived pairing challenge. The code itself is deliberately
     * never copied to an audit event: it is a one-time bearer secret until it
     * expires or is claimed. `false` means another live challenge happened to
     * use the same (random) code, so the caller can generate another one.
     */
    async createDevicePairing({
      code,
      tenantId,
      userId,
      expiresAt,
      createdAt = now(),
    }) {
      const inserted = await db.run(
        "INSERT INTO device_pairings (code, tenant_id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (code) DO NOTHING",
        [code, tenantId, userId, createdAt, expiresAt],
      );
      if (inserted.rowCount !== 1) return false;
      await audit(db, {
        tenantId,
        userId,
        eventType: "device.pairing_created",
        details: { expiresAt },
      });
      return true;
    },
    /**
     * Claims exactly one live pairing and creates its token record in the same
     * top-level transaction. The conditional update is the concurrency gate:
     * simultaneous claims cannot both turn into credentials.
     */
    async claimDevicePairing({
      code,
      label,
      tokenHash,
      deviceId = randomUUID(),
      claimedAt = now(),
      originClientInstanceId = null,
    }) {
      const result = await db.transaction(async (transaction) => {
        const claimed = await transaction.run(
          "UPDATE device_pairings SET claimed_at = ? WHERE code = ? AND claimed_at IS NULL AND expires_at > ?",
          [claimedAt, code, claimedAt],
        );
        if (claimed.rowCount !== 1) return null;
        const pairing = (
          await transaction.query(
            "SELECT tenant_id, user_id FROM device_pairings WHERE code = ?",
            [code],
          )
        ).rows[0];
        // The conditional update above and the lookup share one transaction;
        // reaching this branch without the pairing would indicate corruption,
        // not a normal expired/reused-code result.
        if (!pairing) throw new Error("Claimed device pairing was not found.");
        await assertDeviceRoom(transaction, pairing.tenant_id);
        await transaction.run(
          "INSERT INTO device_tokens (id, tenant_id, user_id, label, token_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          [
            deviceId,
            pairing.tenant_id,
            pairing.user_id,
            label,
            tokenHash,
            claimedAt,
          ],
        );
        await audit(transaction, {
          tenantId: pairing.tenant_id,
          userId: pairing.user_id,
          eventType: "device.claimed",
          details: { deviceId, label },
        });
        return {
          id: deviceId,
          tenant_id: pairing.tenant_id,
          user_id: pairing.user_id,
          label,
          token_hash: tokenHash,
          created_at: claimedAt,
          last_seen_at: null,
          last_sync_at: null,
          revoked_at: null,
        };
      });
      // `null` means the code was expired/reused/never issued: nothing was
      // claimed, nothing to signal.
      if (result)
        publishChange({
          tenantId: result.tenant_id,
          domains: ["devices"],
          originClientInstanceId,
        });
      return result;
    },
    /**
     * Registers a device and its token for a person already proven by the
     * caller (the sign-in by e-mail code). It is the
     * `device_tokens` half of `claimDevicePairing` without the pairing
     * challenge; the token itself is never stored, only its hash.
     */
    async createDeviceToken({
      tenantId,
      userId,
      label,
      tokenHash,
      deviceId = randomUUID(),
      createdAt = now(),
      originClientInstanceId = null,
      details = null,
    }) {
      await withSerializedSqliteRetry(db, async (transaction) => {
        await assertDeviceRoom(transaction, tenantId);
        await transaction.run(
          "INSERT INTO device_tokens (id, tenant_id, user_id, label, token_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          [deviceId, tenantId, userId, label, tokenHash, createdAt],
        );
        await audit(transaction, {
          tenantId,
          userId,
          eventType: "device.signed_in",
          details: { deviceId, label, ...(details || {}) },
        });
      });
      publishChange({ tenantId, domains: ["devices"], originClientInstanceId });
      return { id: deviceId, label, created_at: createdAt };
    },
    /**
     * A bearer credential is usable only while both its own record and its
     * originating identity remain active in the recorded tenant. Memberships
     * currently have no disabled column, so an extant matching membership is
     * the durable active-membership condition.
     */
    async findActiveDeviceToken(tokenHash) {
      return (
        (
          await db.query(
            `SELECT device_tokens.* FROM device_tokens
             JOIN users ON users.id = device_tokens.user_id
             WHERE device_tokens.token_hash = ?
               AND device_tokens.revoked_at IS NULL
               AND users.disabled_at IS NULL
               AND EXISTS (
                 SELECT 1 FROM memberships
                 WHERE memberships.tenant_id = device_tokens.tenant_id
                   AND memberships.user_id = device_tokens.user_id
               )
             LIMIT 1`,
            [tokenHash],
          )
        ).rows[0] || null
      );
    },
    /**
     * Whether a token belongs to a device that was detached (`revoked_at`
     * set). A token replaced by a newer sign-in of the same device is not
     * detached: its hash is no longer anywhere, and it is simply unknown.
     */
    async isDetachedDeviceToken(tokenHash) {
      return Boolean(
        (
          await db.query(
            "SELECT 1 AS detached FROM device_tokens WHERE token_hash = ? AND revoked_at IS NOT NULL LIMIT 1",
            [tokenHash],
          )
        ).rows[0],
      );
    },
    /**
     * The device's request is seen: `last_seen_at` (and `last_sync_at` with
     * `synchronize`), and the version and system its client header named
     * (`client`, from `api/client-identity.js`), each kept as it was when the
     * request did not name it. One statement whatever the client says: the
     * stamp is written on every request anyway (its row count is the gate
     * against a revocation in between), so the version costs no write.
     */
    async touchDeviceToken(
      id,
      { synchronize = false, timestamp = now(), client = null } = {},
    ) {
      const activeIdentity = `
        AND EXISTS (
          SELECT 1 FROM users
          WHERE users.id = device_tokens.user_id
            AND users.disabled_at IS NULL
        )
        AND EXISTS (
          SELECT 1 FROM memberships
          WHERE memberships.tenant_id = device_tokens.tenant_id
            AND memberships.user_id = device_tokens.user_id
        )`;
      const versions = [client?.appVersion ?? null, client?.osVersion ?? null];
      const setVersions = `app_version = COALESCE(?, app_version),
        os_version = COALESCE(?, os_version)`;
      if (synchronize)
        return await db.run(
          `UPDATE device_tokens SET last_seen_at = ?, last_sync_at = ?, ${setVersions}
           WHERE id = ? AND revoked_at IS NULL ${activeIdentity}`,
          [timestamp, timestamp, ...versions, id],
        );
      return await db.run(
        `UPDATE device_tokens SET last_seen_at = ?, ${setVersions}
         WHERE id = ? AND revoked_at IS NULL ${activeIdentity}`,
        [timestamp, ...versions, id],
      );
    },
    async listDevices(tenantId) {
      return (
        await db.query(
          `SELECT id, label, created_at, last_seen_at, last_sync_at, revoked_at
           FROM device_tokens
           WHERE tenant_id = ? AND revoked_at IS NULL
           ORDER BY created_at DESC, id DESC`,
          [tenantId],
        )
      ).rows;
    },
    /**
     * Revocation is tenant-scoped. A missing or already-revoked device returns
     * `null`, allowing the HTTP layer to retain its 404 contract. The token
     * hash remains internal and is never returned by this method's
     * caller-facing shape.
     */
    async revokeDevice({
      tenantId,
      deviceId,
      revokedAt = now(),
      originClientInstanceId = null,
    }) {
      const result = await db.transaction(async (transaction) => {
        const device = (
          await transaction.query(
            "SELECT * FROM device_tokens WHERE id = ? AND tenant_id = ?",
            [deviceId, tenantId],
          )
        ).rows[0];
        if (!device || device.revoked_at) return null;
        const revoked = await transaction.run(
          "UPDATE device_tokens SET revoked_at = ? WHERE id = ? AND tenant_id = ? AND revoked_at IS NULL",
          [revokedAt, deviceId, tenantId],
        );
        if (revoked.rowCount !== 1) return null;
        await audit(transaction, {
          tenantId,
          userId: device.user_id,
          eventType: "device.revoked",
          details: { deviceId },
        });
        return { ...device, revoked_at: revokedAt };
      });
      if (result)
        publishChange({
          tenantId,
          domains: ["devices"],
          originClientInstanceId,
        });
      return result;
    },
    audit: async (entry) => await audit(db, entry),
  };
}
