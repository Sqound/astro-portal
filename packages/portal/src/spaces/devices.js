import { publishChange } from "../api/change-bus.js";
import { withSerializedSqliteRetry } from "../persistence/db-transaction-retry.js";
import * as repository from "./devices-repository.js";
import { deviceName } from "./installation.js";
import { refuse } from "./refusal.js";

/**
 * The devices of a space signed in to by e-mail code (v1.md « Space
 * devices »). A private server in the `email-code` mode holds one space, its
 * owner's, and the devices that sign in to it:
 *
 * - a device registers itself at sign-in, under its name; the same
 *   installation signing in again to the space keeps its row and its name,
 *   and gets a new token;
 * - two devices of one model are told apart by their names;
 * - « Mes appareils » lists them (the caller first, PlanAstro before Astro
 *   Sync, the most recently seen first), renames and detaches them;
 * - Astro Sync (`sync`) is a device like the others.
 *
 * A server that holds several spaces adds its own rules on top of these (a
 * device that belongs to one space at a time, proofs of the platform): they
 * come through the `devices` option of `openSpacePolicy` (service.js) and
 * replace `signIn` and `detach`, and add `attach`. A private server has none
 * of them: its devices never meet another space.
 *
 * `extension`, when a composition gives one, is `{ create(context) }`
 * (see `createSpaceDevices`); `create` returns the methods that replace the
 * ones below.
 */
const iso = (value) => new Date(value).toISOString();

function uniqueViolation(error) {
  return (
    error?.code === "23505" ||
    /UNIQUE constraint failed/i.test(String(error?.message || ""))
  );
}

/**
 * A spaceDevice of space-devices.schema.json. A device paired by code (a
 * private server in the `password` mode, before it moved to `email-code`)
 * has no application of its own: it is listed as PlanAstro.
 */
export function spaceDevice(row, currentDeviceId = null) {
  return {
    id: String(row.id),
    name: String(row.label),
    application: row.application ? String(row.application) : "planner",
    platform: row.platform ? String(row.platform) : "unknown",
    current: currentDeviceId !== null && String(row.id) === currentDeviceId,
    createdAt: iso(String(row.created_at)),
    lastSeenAt: row.last_seen_at ? iso(String(row.last_seen_at)) : null,
    lastSyncAt: row.last_sync_at ? iso(String(row.last_sync_at)) : null,
    // The build and system its client header last named (`null` until it
    // sends one): what an owner reads to know which version a device runs.
    appVersion: row.app_version ? String(row.app_version) : null,
    osVersion: row.os_version ? String(row.os_version) : null,
  };
}

/** « Mes appareils »: the caller first, PlanAstro before Astro Sync, the most recently seen first. */
function listOrder(currentDeviceId) {
  const rank = (device) =>
    device.id === currentDeviceId ? 0 : device.application === "sync" ? 2 : 1;
  return (left, right) =>
    rank(left) - rank(right) ||
    String(right.lastSeenAt || "").localeCompare(
      String(left.lastSeenAt || ""),
    ) ||
    right.createdAt.localeCompare(left.createdAt);
}

export const deviceNotFound = () =>
  refuse("device_not_found", "Device not found.", 404);

/**
 * What an extension's `create` receives: `driver`, `configuration`,
 * `sender`, `auth`, `clock`, `log`, and the pieces of the core it builds on:
 *
 * - `announce(tenantId, originClientInstanceId)`: tells the space's other
 *   clients that its devices changed;
 * - `inTransaction(work)`: one transaction, retried when SQLite's single
 *   connection is busy, and once more when a unique index caught a
 *   concurrent sign-in of the same device;
 * - `registerDevice(transaction, { tenantId, userId, device, credential,
 *   now })`: the device of a validated description in the space (the same
 *   row again with the new token, or a new row), recorded in the audit
 *   trail; `{ id, name }`;
 * - `renewDevice(transaction, { live, tenantId, userId, device, credential,
 *   now })`: the `live` row again, with the new token; `{ id, name }`.
 */
export function createSpaceDevices({
  driver,
  configuration,
  sender,
  auth,
  extension = null,
  clock = () => new Date(),
  log = (message) => console.error(`[Astro Portal] ${message}`),
}) {
  async function inTransaction(work) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await withSerializedSqliteRetry(driver, work);
      } catch (error) {
        if (attempt < 2 && uniqueViolation(error)) continue;
        throw error;
      }
    }
  }

  const announce = (tenantId, originClientInstanceId = null) => {
    try {
      publishChange({ tenantId, domains: ["devices"], originClientInstanceId });
    } catch (error) {
      log(`device.change_signal_failed: ${error?.message || "error"}`);
    }
  };

  async function renewDevice(
    transaction,
    { live, tenantId, userId, device, credential, now },
  ) {
    if (
      !(await repository.renewDevice(transaction, {
        id: String(live.id),
        tokenHash: credential.tokenHash,
        platform: device.platform,
        model: device.model,
      }))
    )
      return null;
    await repository.audit(transaction, {
      tenantId,
      userId,
      eventType: "device.signed_in",
      details: {
        deviceId: String(live.id),
        application: device.application,
        again: true,
      },
      now,
    });
    return { id: String(live.id), name: String(live.label) };
  }

  async function registerDevice(
    transaction,
    { tenantId, userId, device, credential, now },
  ) {
    const live = await repository.liveDeviceInSpace(transaction, {
      installationHash: device.installationHash,
      tenantId,
      application: device.application,
    });
    const renewed = live
      ? await renewDevice(transaction, {
          live,
          tenantId,
          userId,
          device,
          credential,
          now,
        })
      : null;
    if (renewed) return renewed;
    const created = await repository.insertDevice(transaction, {
      tenantId,
      userId,
      name: device.name,
      tokenHash: credential.tokenHash,
      application: device.application,
      platform: device.platform,
      model: device.model,
      installationHash: device.installationHash,
      now,
    });
    await repository.audit(transaction, {
      tenantId,
      userId,
      eventType: "device.signed_in",
      details: { deviceId: created.id, application: device.application },
      now,
    });
    return { id: created.id, name: created.label };
  }

  const core = {
    /**
     * The device of a verification (`client: app`), once the address is
     * proven and the space opened. Returns `{ device, deviceToken }`.
     */
    async signIn({ tenantId, userId, device, originClientInstanceId = null }) {
      const now = clock();
      const credential = auth.newDeviceCredential();
      const registered = await inTransaction((transaction) =>
        registerDevice(transaction, {
          tenantId,
          userId,
          device,
          credential,
          now,
        }),
      );
      announce(tenantId, originClientInstanceId);
      return { device: registered, deviceToken: credential.deviceToken };
    },

    /** GET /v1/devices: the live devices of the space. */
    async list({ tenantId, currentDeviceId = null }) {
      const devices = (await repository.devicesOfSpace(driver, tenantId)).map(
        (row) => spaceDevice(row, currentDeviceId),
      );
      return { devices: devices.sort(listOrder(currentDeviceId)) };
    },

    /** PATCH /v1/devices/{deviceId}: the pencil beside a device. */
    async rename({
      tenantId,
      deviceId,
      name: typedName,
      currentDeviceId = null,
      originClientInstanceId = null,
    }) {
      const name = deviceName(typedName);
      if (!name)
        throw refuse(
          "invalid_request",
          "A device name has 1 to 120 characters.",
          400,
        );
      if (
        !(await repository.renameDevice(driver, { tenantId, deviceId, name }))
      )
        throw deviceNotFound();
      const row = await repository.deviceInSpace(driver, {
        tenantId,
        deviceId,
      });
      if (!row) throw deviceNotFound();
      await repository.audit(driver, {
        tenantId,
        eventType: "device.renamed",
        details: { deviceId },
        now: clock(),
      });
      announce(tenantId, originClientInstanceId);
      return spaceDevice(row, currentDeviceId);
    },

    /**
     * DELETE /v1/devices/{deviceId}. `byDeviceId` is the device making the
     * call (a bearer), `null` for a web session.
     */
    async detach({
      tenantId,
      deviceId,
      byDeviceId = null,
      originClientInstanceId = null,
    }) {
      const now = clock();
      const found = await repository.deviceInSpace(driver, {
        tenantId,
        deviceId,
      });
      if (!found) throw deviceNotFound();
      await inTransaction(async (transaction) => {
        const row = await repository.deviceInSpace(transaction, {
          tenantId,
          deviceId,
        });
        if (!row) throw deviceNotFound();
        if (
          !(await repository.detachDevice(transaction, {
            id: deviceId,
            tenantId,
            now,
          }))
        )
          throw deviceNotFound();
        await repository.audit(transaction, {
          tenantId,
          userId: String(row.user_id),
          eventType: "device.detached",
          details: {
            deviceId,
            reason:
              byDeviceId !== null && byDeviceId === String(found.id)
                ? "itself"
                : "from_elsewhere",
          },
          now,
        });
      });
      announce(tenantId, originClientInstanceId);
    },
  };

  if (!extension) return core;
  return {
    ...core,
    ...extension.create({
      driver,
      configuration,
      sender,
      auth,
      clock,
      log,
      announce,
      inTransaction,
      registerDevice,
      renewDevice,
    }),
  };
}
