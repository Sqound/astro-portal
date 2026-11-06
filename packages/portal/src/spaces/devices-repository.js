import { randomUUID } from "node:crypto";
import { assertDeviceRoom } from "../persistence/space-limits.js";
import { refuse } from "./refusal.js";

/**
 * The reads and writes of the devices of a space signed in to by e-mail
 * code, on the core's table `device_tokens` and the audit trail. Plain
 * functions taking an open driver or transaction, portable `?` placeholders,
 * ISO dates. The token of a device is never here: only its hash, computed by
 * the core.
 */

const iso = (date) => new Date(date).toISOString();
const first = (result) => result.rows[0] || null;

/** The live row of an installation in one space, for one application. */
export async function liveDeviceInSpace(
  transaction,
  { installationHash, tenantId, application },
) {
  return first(
    await transaction.query(
      `SELECT * FROM device_tokens
       WHERE installation_hash = ? AND tenant_id = ? AND application = ? AND revoked_at IS NULL
       LIMIT 1`,
      [installationHash, tenantId, application],
    ),
  );
}

/** A live device of a space, by its identifier. */
export async function deviceInSpace(driver, { tenantId, deviceId }) {
  return first(
    await driver.query(
      "SELECT * FROM device_tokens WHERE id = ? AND tenant_id = ? AND revoked_at IS NULL",
      [deviceId, tenantId],
    ),
  );
}

/** The longest device name the contract accepts. */
const DEVICE_NAME_MAX = 120;

/**
 * The name a device takes in a space whose live devices already bear
 * `taken`: `name` itself, or « name (2) », « name (3) »… — the first free
 * one (compared without case), cut to the contract's length with its suffix
 * kept. Two phones of one model both arrive named « iPhone 17 Pro »; the
 * service tells them apart whatever the client managed to do.
 */
export function distinctDeviceLabel(name, taken) {
  const base = String(name).trim();
  const used = new Set(
    [...taken].map((label) => String(label).trim().toLowerCase()),
  );
  if (!used.has(base.toLowerCase())) return name;
  for (let n = 2; n < 1000; n += 1) {
    const suffix = ` (${n})`;
    const room = DEVICE_NAME_MAX - suffix.length;
    const candidate = `${base.length > room ? base.slice(0, room).trimEnd() : base}${suffix}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return name;
}

export async function insertDevice(
  transaction,
  {
    id = randomUUID(),
    tenantId,
    userId,
    name,
    tokenHash,
    application,
    platform,
    model,
    installationHash,
    now,
  },
) {
  // The service's technical ceiling on a space's active devices (not the
  // one-space-per-phone rule of devices.js): an
  // installation this space already knows — even revoked, coming back — is
  // never refused by it.
  const known = first(
    await transaction.query(
      "SELECT id FROM device_tokens WHERE tenant_id = ? AND installation_hash = ? LIMIT 1",
      [tenantId, installationHash],
    ),
  );
  if (!known)
    await assertDeviceRoom(transaction, tenantId).catch((error) => {
      throw error?.code === "device_limit_reached"
        ? refuse(error.code, error.message, 409)
        : error;
    });
  const live = await transaction.query(
    "SELECT label FROM device_tokens WHERE tenant_id = ? AND revoked_at IS NULL",
    [tenantId],
  );
  const label = distinctDeviceLabel(
    name,
    live.rows.map((row) => row.label),
  );
  await transaction.run(
    `INSERT INTO device_tokens
       (id, tenant_id, user_id, label, token_hash, created_at, application, platform, model, installation_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      tenantId,
      userId,
      label,
      tokenHash,
      iso(now),
      application,
      platform,
      model,
      installationHash,
    ],
  );
  return { id, label };
}

/**
 * The same device signs in again: same row, same name (the one the person
 * may have chosen), a new token. The previous token stops working.
 */
export async function renewDevice(
  transaction,
  { id, tokenHash, platform, model },
) {
  const result = await transaction.run(
    `UPDATE device_tokens SET token_hash = ?, platform = ?, model = ?
     WHERE id = ? AND revoked_at IS NULL`,
    [tokenHash, platform, model, id],
  );
  return result.rowCount === 1;
}

/** Detaches a live device: its token then answers `device_detached`. */
export async function detachDevice(transaction, { id, tenantId, now }) {
  const result = await transaction.run(
    "UPDATE device_tokens SET revoked_at = ? WHERE id = ? AND tenant_id = ? AND revoked_at IS NULL",
    [iso(now), id, tenantId],
  );
  return result.rowCount === 1;
}

export async function renameDevice(driver, { tenantId, deviceId, name }) {
  const result = await driver.run(
    "UPDATE device_tokens SET label = ? WHERE id = ? AND tenant_id = ? AND revoked_at IS NULL",
    [name, deviceId, tenantId],
  );
  return result.rowCount === 1;
}

/** The live devices of a space. */
export async function devicesOfSpace(driver, tenantId) {
  return (
    await driver.query(
      `SELECT id, label, application, platform, created_at, last_seen_at, last_sync_at,
         app_version, os_version
       FROM device_tokens
       WHERE tenant_id = ? AND revoked_at IS NULL`,
      [tenantId],
    )
  ).rows;
}

export async function audit(
  transaction,
  { tenantId, userId = null, eventType, details = null, now },
) {
  await transaction.run(
    "INSERT INTO audit_events (id, tenant_id, user_id, event_type, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [
      randomUUID(),
      tenantId,
      userId,
      eventType,
      details ? JSON.stringify(details) : null,
      iso(now),
    ],
  );
}
