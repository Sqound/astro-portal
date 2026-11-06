import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { subscribe } from "../dist/api/change-bus.js";
import { createFileSender, readFakeMailbox } from "../dist/mail/file.js";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { PostgresDriver } from "../dist/persistence/postgres-driver.js";
import { privateSpaceSignInConfiguration } from "../dist/spaces/private.js";
import {
  SignInRefusal,
  closedSpacePolicy,
  createSpaceSignIn,
} from "../dist/spaces/service.js";

// The devices of the space of a private server (v1.md « Space devices »):
// one space, its owner's, and the devices that sign in to it by e-mail code.
// A device registers itself under its name, signs in again to the same row
// with a new token, is listed, renamed and detached; Astro Sync is a device
// like the others. No platform proof is read: a proof sent with the device
// changes nothing, and the sign-in of a phone never meets another space.
// SQLite, and PostgreSQL when ASTRO_PORTAL_TEST_DATABASE_URL is set.

const postgresTestDatabaseUrl =
  process.env.ASTRO_PORTAL_TEST_DATABASE_URL || null;
const OWNER = "vous@exemple.fr";
const START = Date.parse("2026-09-29T21:14:00.000Z");
const MINUTE = 60_000;
const PHONE = "uwiNSxC6OIQqqkmdEeoVUB6dUVpI1kds";
const OTHER_PHONE = "Zk3pQ9vTt1LmWx8YcRb4NeHs7DfGa2Ju";
const SYNC = "syncMacBookInstallation0123456789";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

async function resetPostgresSchema(databaseUrl) {
  const driver = PostgresDriver.open(databaseUrl);
  try {
    await driver.run("DROP SCHEMA public CASCADE");
    await driver.run("CREATE SCHEMA public");
  } finally {
    await driver.close();
  }
}

/** The same scenario on a scratch SQLite and, when configured, PostgreSQL. */
function privateTest(name, scenario) {
  async function run(driver, dialect) {
    const directory = await mkdtemp(join(tmpdir(), "astro-private-devices-"));
    try {
      await applyMigrations(driver, dialect);
      await driver.run(
        "INSERT INTO organizations (id, name, created_at) VALUES ('t', ?, 'x')",
        [OWNER],
      );
      await driver.run(
        "INSERT INTO users (id, email, password_hash, created_at) VALUES ('u', ?, NULL, 'x')",
        [OWNER],
      );
      await driver.run(
        "INSERT INTO memberships (id, tenant_id, user_id, role, created_at) VALUES ('m', 't', 'u', 'owner', 'x')",
      );
      await scenario(await setUp(driver, directory));
    } finally {
      await driver.close();
      await rm(directory, { recursive: true, force: true });
    }
  }
  test(`${name} [SQLite]`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "astro-private-db-"));
    try {
      await run(
        createDatabaseDriver({
          databasePath: join(directory, "portal.sqlite"),
        }),
        "sqlite",
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  test(
    `${name} [PostgreSQL]`,
    {
      skip: postgresTestDatabaseUrl
        ? false
        : "ASTRO_PORTAL_TEST_DATABASE_URL is not set",
    },
    async () => {
      if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(postgresTestDatabaseUrl))
        throw new Error(
          "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
        );
      await resetPostgresSchema(postgresTestDatabaseUrl);
      try {
        await run(
          createDatabaseDriver({ databaseUrl: postgresTestDatabaseUrl }),
          "postgres",
        );
      } finally {
        await resetPostgresSchema(postgresTestDatabaseUrl);
      }
    },
  );
}

async function setUp(driver, directory) {
  const configuration = privateSpaceSignInConfiguration(
    {
      ASTRO_PORTAL_PUBLIC_URL: "http://portal.example.test",
      ASTRO_PORTAL_SIGN_IN_KEY: Buffer.alloc(32, 7).toString("base64"),
      ASTRO_PORTAL_MAIL_SENDER: "file",
      ASTRO_PORTAL_CLIENT_IP_HEADER: "socket",
    },
    { runtimeDir: directory },
  );
  const clock = { now: START };
  const sender = createFileSender({
    directory: configuration.mailFileDir,
    clock: () => new Date(clock.now),
  });
  const auth = {
    async openSession({ userId }) {
      return { cookies: [`astro_portal_session=for-${userId}; Path=/`] };
    },
    newDeviceCredential() {
      const deviceToken = randomBytes(32).toString("base64url");
      return { deviceToken, tokenHash: sha256(deviceToken) };
    },
  };
  const logs = [];
  const spaces = createSpaceSignIn({
    driver,
    configuration,
    sender,
    auth,
    policy: closedSpacePolicy(),
    clock: () => new Date(clock.now),
    log: (message) => logs.push(message),
  });
  let origin = 0;
  const context = {
    driver,
    spaces,
    clock,
    logs,
    advance: (ms) => {
      clock.now += ms;
    },
    async signIn(device) {
      // A code is not sent twice within the minute.
      clock.now += 61_000;
      origin += 1;
      await spaces.requestCode({
        email: OWNER,
        language: "fr",
        origin: `origin-${origin}`,
      });
      const messages = (
        await readFakeMailbox(configuration.mailFileDir)
      ).filter((message) => message.to === OWNER && message.code);
      return await spaces.verify({
        email: OWNER,
        code: messages[messages.length - 1].code,
        client: "app",
        device,
        origin: `origin-${origin}`,
      });
    },
    async liveRows() {
      return (
        await driver.query(
          "SELECT * FROM device_tokens WHERE revoked_at IS NULL ORDER BY created_at, id",
        )
      ).rows;
    },
    async audit(type) {
      return (
        await driver.query(
          "SELECT details_json FROM audit_events WHERE event_type = ? ORDER BY created_at",
          [type],
        )
      ).rows.map((row) => JSON.parse(row.details_json));
    },
  };
  return context;
}

const phone = (installationId, extra = {}) => ({
  application: "planner",
  installationId,
  name: "iPhone 16 Pro",
  platform: "ios",
  model: "iPhone17,1",
  ...extra,
});

const astroSync = (installationId, extra = {}) => ({
  application: "sync",
  installationId,
  name: "Astro Sync — MacBook Pro",
  platform: "macos",
  ...extra,
});

async function refusal(promise) {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof SignInRefusal, error.stack);
    return { code: error.code, status: error.status, ...error.extra };
  }
  assert.fail("expected a refusal");
}

privateTest(
  "a phone registers under its name; signing in again keeps its row and its name with a new token",
  async (context) => {
    const first = await context.signIn(phone(PHONE));
    assert.equal(first.space.id, "t");
    assert.deepEqual(first.device.name, "iPhone 16 Pro");
    assert.ok(first.deviceToken);
    const [row, ...others] = await context.liveRows();
    assert.equal(others.length, 0);
    assert.equal(row.id, first.device.id);
    assert.equal(row.application, "planner");
    assert.equal(row.platform, "ios");
    assert.equal(row.model, "iPhone17,1");
    assert.equal(row.token_hash, sha256(first.deviceToken));
    assert.equal(row.tenant_id, "t");
    assert.equal(row.user_id, "u");

    await context.spaces.renameDevice({
      tenantId: "t",
      deviceId: first.device.id,
      name: "iPhone de terrain",
    });
    context.advance(2 * MINUTE);
    const again = await context.signIn(phone(PHONE, { model: "iPhone17,2" }));
    assert.deepEqual(again.device, {
      id: first.device.id,
      name: "iPhone de terrain",
    });
    assert.notEqual(again.deviceToken, first.deviceToken);
    const [renewed, ...rest] = await context.liveRows();
    assert.equal(rest.length, 0, "one row, not one per sign-in");
    assert.equal(renewed.token_hash, sha256(again.deviceToken));
    assert.equal(renewed.model, "iPhone17,2");
    assert.deepEqual(
      (await context.audit("device.signed_in")).map((details) => ({
        application: details.application,
        again: details.again === true,
      })),
      [
        { application: "planner", again: false },
        { application: "planner", again: true },
      ],
    );
  },
);

privateTest(
  "two phones of one model are told apart by their names",
  async (context) => {
    const one = await context.signIn(phone(PHONE));
    context.advance(MINUTE);
    const two = await context.signIn(phone(OTHER_PHONE));
    assert.equal(one.device.name, "iPhone 16 Pro");
    assert.equal(two.device.name, "iPhone 16 Pro (2)");
    assert.notEqual(one.device.id, two.device.id);
  },
);

privateTest(
  "Astro Sync signs in like a device: once, then again with a new token",
  async (context) => {
    const first = await context.signIn(astroSync(SYNC));
    context.advance(MINUTE);
    const again = await context.signIn(astroSync(SYNC));
    assert.equal(again.device.id, first.device.id);
    assert.notEqual(again.deviceToken, first.deviceToken);
    const rows = await context.liveRows();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].application, "sync");
    assert.equal(rows[0].token_hash, sha256(again.deviceToken));
  },
);

privateTest(
  "a platform proof sent with the device is not read: the sign-in is the same",
  async (context) => {
    const attestation = ["an", "attestation"].join("-");
    const proven = await context.signIn(
      phone(PHONE, {
        proof: { kind: "platform-attestation", token: attestation },
      }),
    );
    const bare = await context.signIn(phone(OTHER_PHONE));
    assert.ok(proven.deviceToken);
    assert.ok(bare.deviceToken);
    assert.equal((await context.liveRows()).length, 2);
    assert.deepEqual(context.logs, []);
  },
);

privateTest(
  "the list puts the caller first, PlanAstro before Astro Sync",
  async (context) => {
    const sync = await context.signIn(astroSync(SYNC));
    context.advance(MINUTE);
    const first = await context.signIn(phone(PHONE));
    context.advance(MINUTE);
    const second = await context.signIn(phone(OTHER_PHONE));
    const list = await context.spaces.listDevices({
      tenantId: "t",
      currentDeviceId: second.device.id,
    });
    assert.deepEqual(
      list.devices.map((device) => device.id),
      [second.device.id, first.device.id, sync.device.id],
    );
    assert.deepEqual(
      list.devices.map((device) => device.current),
      [true, false, false],
    );
    assert.deepEqual(
      list.devices.map((device) => device.application),
      ["planner", "planner", "sync"],
    );
    assert.equal(list.devices[2].platform, "macos");
    assert.ok(Date.parse(list.devices[0].createdAt) > 0);
  },
);

privateTest(
  "a device is renamed and detached, and each change is announced and recorded",
  async (context) => {
    const events = [];
    const unsubscribe = subscribe("t", (event) => events.push(event));
    try {
      const one = await context.signIn(phone(PHONE));
      const two = await context.signIn(phone(OTHER_PHONE));
      const renamed = await context.spaces.renameDevice({
        tenantId: "t",
        deviceId: two.device.id,
        name: "  Le téléphone de la lunette  ",
        currentDeviceId: one.device.id,
      });
      assert.equal(renamed.name, "Le téléphone de la lunette");
      assert.equal(renamed.current, false);
      assert.equal(
        (
          await refusal(
            context.spaces.renameDevice({
              tenantId: "t",
              deviceId: two.device.id,
              name: "   ",
            }),
          )
        ).code,
        "invalid_request",
      );
      assert.equal(
        (
          await refusal(
            context.spaces.renameDevice({
              tenantId: "t",
              deviceId: "no-such-device",
              name: "x",
            }),
          )
        ).code,
        "device_not_found",
      );

      await context.spaces.detachDevice({
        tenantId: "t",
        deviceId: two.device.id,
        byDeviceId: one.device.id,
      });
      assert.deepEqual(
        (await context.liveRows()).map((row) => row.id),
        [one.device.id],
      );
      assert.equal(
        (
          await refusal(
            context.spaces.detachDevice({
              tenantId: "t",
              deviceId: two.device.id,
            }),
          )
        ).code,
        "device_not_found",
      );
      assert.ok(events.length >= 4);
      assert.ok(events.every((event) => event.domains.includes("devices")));
      assert.deepEqual(
        (await context.audit("device.renamed")).map((d) => d.deviceId),
        [two.device.id],
      );
      assert.deepEqual(
        (await context.audit("device.detached")).map((d) => d.deviceId),
        [two.device.id],
      );
    } finally {
      unsubscribe();
    }
  },
);

privateTest(
  "a device that detached itself signs in again to the same space",
  async (context) => {
    const first = await context.signIn(phone(PHONE));
    await context.spaces.detachDevice({
      tenantId: "t",
      deviceId: first.device.id,
      byDeviceId: first.device.id,
    });
    assert.deepEqual(await context.liveRows(), []);
    context.advance(MINUTE);
    const back = await context.signIn(phone(PHONE));
    assert.notEqual(back.device.id, first.device.id);
    assert.equal((await context.liveRows()).length, 1);
  },
);

privateTest(
  "the ceiling of devices of a space refuses a new installation, never a known one",
  async (context) => {
    const previous = process.env.ASTRO_PORTAL_MAX_DEVICES_PER_SPACE;
    process.env.ASTRO_PORTAL_MAX_DEVICES_PER_SPACE = "2";
    try {
      await context.signIn(phone(PHONE));
      context.advance(MINUTE);
      await context.signIn(astroSync(SYNC));
      context.advance(MINUTE);
      const refused = await refusal(context.signIn(phone(OTHER_PHONE)));
      assert.equal(refused.code, "device_limit_reached");
      assert.equal(refused.status, 409);
      context.advance(MINUTE);
      assert.ok((await context.signIn(phone(PHONE))).deviceToken);
    } finally {
      if (previous === undefined)
        delete process.env.ASTRO_PORTAL_MAX_DEVICES_PER_SPACE;
      else process.env.ASTRO_PORTAL_MAX_DEVICES_PER_SPACE = previous;
    }
  },
);

privateTest(
  "no attachment is offered: an attach token is unknown to a private server",
  async (context) => {
    const first = await context.signIn(phone(PHONE));
    assert.ok(first.deviceToken);
    const refused = await refusal(
      context.spaces.attach({
        attachToken: "A".repeat(43),
        device: phone(PHONE),
        origin: "origin-attach",
      }),
    );
    assert.equal(refused.code, "sign_in_code_expired");
    assert.equal(refused.status, 400);
  },
);
