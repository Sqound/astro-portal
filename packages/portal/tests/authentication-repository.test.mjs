import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createAuthenticationRepository } from "../dist/persistence/authentication-repository.js";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { subscribe } from "../dist/api/change-bus.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { PostgresDriver } from "../dist/persistence/postgres-driver.js";

async function exercise(repository, driver) {
  const owner = {
    email: "owner@example.test",
    passwordHash: "scrypt$test",
    organizationName: "Test observatory",
    recoveryCodeHashes: ["recovery-1"],
  };
  assert.equal(await repository.findOwner(), null);
  const account = await repository.createOwnerAccount(owner);
  assert.equal(await repository.countUsers(), 1);
  // The installation happens once.
  await assert.rejects(
    repository.createOwnerAccount({ ...owner, email: "other@example.test" }),
    /Bootstrap is already closed/,
  );
  assert.equal(await repository.countUsers(), 1);
  assert.equal((await repository.findOwner()).email, owner.email);
  assert.equal((await repository.findOwner()).tenant_id, account.tenantId);
  assert.equal(
    (await repository.findOwnerByEmail(owner.email)).id,
    account.userId,
  );
  assert.equal(await repository.findOwnerByEmail("other@example.test"), null);
  await repository.setPasswordHash(account.userId, "scrypt$replaced");
  assert.equal(
    (await repository.findOwnerByEmail(owner.email)).password_hash,
    "scrypt$replaced",
  );
  assert.equal(
    (await repository.findMembership(account.userId)).tenant_id,
    account.tenantId,
  );
  assert.equal(
    await repository.consumeRecoveryCode(account.userId, "recovery-1"),
    true,
  );
  assert.equal(
    await repository.consumeRecoveryCode(account.userId, "recovery-1"),
    false,
  );
  await repository.createSession({
    tenantId: account.tenantId,
    userId: account.userId,
    tokenHash: "token",
    csrfHash: "csrf",
    expiresAt: "2099-01-01T00:00:00.000Z",
  });
  assert.equal((await repository.findSession("token")).email, owner.email);
  await repository.deleteSession("token");
  assert.equal(await repository.findSession("token"), null);

  const pairing = {
    code: "ABCDEFGH",
    tenantId: account.tenantId,
    userId: account.userId,
    createdAt: "2026-09-14T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
  // Claiming a pairing and revoking a device each emit `devices` for the
  // tenant, once, on the actual change only.
  const changeEvents = [];
  const unsubscribeChanges = subscribe(account.tenantId, (event) =>
    changeEvents.push(event),
  );

  assert.equal(await repository.createDevicePairing(pairing), true);
  assert.equal(await repository.createDevicePairing(pairing), false);
  const device = await repository.claimDevicePairing({
    code: pairing.code,
    label: "Test phone",
    tokenHash: "device-token-hash",
    deviceId: "device-1",
    claimedAt: "2026-09-14T00:01:00.000Z",
    originClientInstanceId: "instance-writer",
  });
  assert.equal(device.tenant_id, account.tenantId);
  assert.equal(device.user_id, account.userId);
  assert.equal(changeEvents.length, 1);
  assert.deepEqual(changeEvents[0].domains, ["devices"]);
  assert.equal(changeEvents[0].originClientInstanceId, "instance-writer");
  assert.equal(
    await repository.claimDevicePairing({
      code: pairing.code,
      label: "Second claim",
      tokenHash: "other-device-token-hash",
    }),
    null,
  );
  // The code was already claimed: nothing happened, no second event.
  assert.equal(changeEvents.length, 1);
  assert.equal(
    (await repository.findActiveDeviceToken("device-token-hash")).id,
    device.id,
  );
  assert.equal(
    (
      await repository.touchDeviceToken(device.id, {
        synchronize: true,
        timestamp: "2026-09-14T00:02:00.000Z",
      })
    ).rowCount,
    1,
  );
  assert.deepEqual(await repository.listDevices(account.tenantId), [
    {
      id: device.id,
      label: "Test phone",
      created_at: device.created_at,
      last_seen_at: "2026-09-14T00:02:00.000Z",
      last_sync_at: "2026-09-14T00:02:00.000Z",
      revoked_at: null,
    },
  ]);
  // The build and system the device's client header names ride on the same
  // touch; a request that names none keeps them.
  const versions = async () =>
    (
      await driver.query(
        "SELECT app_version, os_version FROM device_tokens WHERE id = ?",
        [device.id],
      )
    ).rows[0];
  assert.deepEqual(await versions(), { app_version: null, os_version: null });
  await repository.touchDeviceToken(device.id, {
    client: { appVersion: "1.0.4+126", osVersion: "iOS 18.1" },
  });
  assert.deepEqual(await versions(), {
    app_version: "1.0.4+126",
    os_version: "iOS 18.1",
  });
  await repository.touchDeviceToken(device.id);
  await repository.touchDeviceToken(device.id, {
    synchronize: true,
    client: { appVersion: "1.0.5+130", osVersion: null },
  });
  assert.deepEqual(await versions(), {
    app_version: "1.0.5+130",
    os_version: "iOS 18.1",
  });
  assert.ok(
    (
      await repository.revokeDevice({
        tenantId: account.tenantId,
        deviceId: device.id,
      })
    ).revoked_at,
  );
  assert.equal(changeEvents.length, 2);
  assert.deepEqual(changeEvents[1].domains, ["devices"]);
  assert.equal(
    await repository.findActiveDeviceToken("device-token-hash"),
    null,
  );
  assert.deepEqual(await repository.listDevices(account.tenantId), []);
  assert.equal(
    await repository.revokeDevice({
      tenantId: account.tenantId,
      deviceId: device.id,
    }),
    null,
  );
  // Already revoked: nothing happened, no third event.
  assert.equal(changeEvents.length, 2);
  unsubscribeChanges();
  assert.equal(
    (
      await repository.touchDeviceToken(device.id, {
        timestamp: "2026-09-14T00:03:00.000Z",
      })
    ).rowCount,
    0,
  );

  assert.equal(
    await repository.createDevicePairing({
      code: "JKMNPQRS",
      tenantId: account.tenantId,
      userId: account.userId,
      createdAt: "2020-01-01T00:00:00.000Z",
      expiresAt: "2020-01-01T00:05:00.000Z",
    }),
    true,
  );
  assert.equal(
    await repository.claimDevicePairing({
      code: "JKMNPQRS",
      label: "Expired phone",
      tokenHash: "expired-device-token-hash",
    }),
    null,
  );
  assert.equal(
    await repository.createDevicePairing({
      code: "TVWXYZ12",
      tenantId: account.tenantId,
      userId: account.userId,
      createdAt: "2026-09-14T00:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z",
    }),
    true,
  );
  const membershipDevice = await repository.claimDevicePairing({
    code: "TVWXYZ12",
    label: "Membership test phone",
    tokenHash: "membership-device-token-hash",
  });
  assert.ok(
    await repository.findActiveDeviceToken("membership-device-token-hash"),
  );
  await driver.run("UPDATE users SET disabled_at = ? WHERE id = ?", [
    "2026-09-14T00:04:00.000Z",
    account.userId,
  ]);
  assert.equal(
    await repository.findActiveDeviceToken("membership-device-token-hash"),
    null,
  );
  await driver.run("UPDATE users SET disabled_at = NULL WHERE id = ?", [
    account.userId,
  ]);
  assert.ok(
    await repository.findActiveDeviceToken("membership-device-token-hash"),
  );
  await driver.run(
    "DELETE FROM memberships WHERE tenant_id = ? AND user_id = ?",
    [account.tenantId, account.userId],
  );
  assert.equal(
    await repository.findActiveDeviceToken("membership-device-token-hash"),
    null,
  );
  assert.equal(
    (await repository.touchDeviceToken(membershipDevice.id)).rowCount,
    0,
  );
}

test("authentication repository works on scratch SQLite", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-auth-repository-"));
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  try {
    await applyMigrations(driver, "sqlite");
    await exercise(await createAuthenticationRepository({ driver }), driver);
  } finally {
    await driver.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test(
  "authentication repository works on dedicated PostgreSQL",
  { skip: !process.env.ASTRO_PORTAL_TEST_DATABASE_URL },
  async () => {
    const databaseUrl = process.env.ASTRO_PORTAL_TEST_DATABASE_URL;
    if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(databaseUrl))
      throw new Error(
        "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
      );
    const reset = async () => {
      const driver = PostgresDriver.open(databaseUrl);
      try {
        await driver.run("DROP SCHEMA public CASCADE");
        await driver.run("CREATE SCHEMA public");
      } finally {
        await driver.close();
      }
    };
    let driver;
    try {
      await reset();
      driver = createDatabaseDriver({ databaseUrl });
      await applyMigrations(driver, "postgres");
      await exercise(
        await createAuthenticationRepository({ driver, dialect: "postgres" }),
        driver,
      );
    } finally {
      if (driver) await driver.close();
      await reset();
    }
  },
);
