import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PostgresDriver } from "../dist/persistence/postgres-driver.js";
import {
  clearSignInExtensions,
  registerSignInExtension,
  signInExtension,
} from "../dist/auth/sign-in-extension.js";
import { subscribe } from "../dist/api/change-bus.js";
import { createAuthenticationRepository } from "../dist/persistence/authentication-repository.js";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { migrations } from "../dist/persistence/migrations.js";

// What the portal gives the space sign-in: a seam for a
// sign-in mode it does not contain, a person without a password, and the
// registration of a device for a person the caller already proved.

const postgresTestDatabaseUrl =
  process.env.ASTRO_PORTAL_TEST_DATABASE_URL || null;

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
function persistenceTest(name, scenario) {
  test(`${name} [SQLite]`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "astro-space-core-"));
    const driver = createDatabaseDriver({
      databasePath: join(directory, "portal.sqlite"),
    });
    try {
      await applyMigrations(driver, "sqlite");
      await scenario({ driver });
    } finally {
      await driver.close();
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
      const driver = createDatabaseDriver({
        databaseUrl: postgresTestDatabaseUrl,
      });
      try {
        await applyMigrations(driver, "postgres");
        await scenario({ driver });
      } finally {
        await driver.close();
        await resetPostgresSchema(postgresTestDatabaseUrl);
      }
    },
  );
}

const extension = {
  mode: "email-code",
  signInPath: "/auth/sign-in",
  announcement: () => ({ method: "email-code" }),
  administrationAllowed: async () => false,
};

test("an extension may take email-code over, never disabled nor password, and hands it back when not enabled", () => {
  clearSignInExtensions();
  assert.equal(signInExtension("email-code"), null);
  registerSignInExtension(extension);
  assert.equal(signInExtension("email-code"), extension);
  // Process-wide: another copy of the module (another Next.js layer) sees it.
  assert.equal(
    globalThis[Symbol.for("astro-portal.sign-in-extensions")].get("email-code"),
    extension,
  );
  for (const mode of ["totp", "disabled", "password", "", "Email Code"])
    assert.throws(() => registerSignInExtension({ ...extension, mode }));
  // `enabled(env)`: an extension's own switch (here a setting set to `off`)
  // hands `email-code` back to the private server's sign-in.
  const switchable = {
    ...extension,
    enabled: (env) => env.ASTRO_PORTAL_TEST_EXTENSION !== "off",
  };
  registerSignInExtension(switchable);
  assert.equal(signInExtension("email-code", {}), switchable);
  assert.equal(
    signInExtension("email-code", { ASTRO_PORTAL_TEST_EXTENSION: "off" }),
    null,
  );
  assert.throws(() => registerSignInExtension({ ...extension, enabled: true }));
  registerSignInExtension(extension);
  assert.throws(() =>
    registerSignInExtension({ ...extension, administrationAllowed: null }),
  );
  assert.throws(() =>
    registerSignInExtension({ ...extension, signInPath: "" }),
  );
  // Why a credential is refused (space_deleted) is optional, and a function.
  assert.throws(() =>
    registerSignInExtension({ ...extension, refusedCredential: "yes" }),
  );
  const refusing = { ...extension, refusedCredential: async () => null };
  assert.equal(registerSignInExtension(refusing), refusing);
  clearSignInExtensions();
  assert.equal(signInExtension("email-code"), null);
});

test("migration 29 rebuilds users on SQLite without losing a reference", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-users-rebuild-"));
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  try {
    await applyMigrations(
      driver,
      "sqlite",
      migrations.filter((migration) => migration.version <= 28),
    );
    await driver.run(
      "INSERT INTO organizations (id, name, created_at) VALUES ('t', 'T', 'x')",
    );
    await driver.run(
      "INSERT INTO users (id, email, password_hash, created_at) VALUES ('u', 'owner@example.test', 'scrypt$hash', 'x')",
    );
    await driver.run(
      "INSERT INTO memberships (id, tenant_id, user_id, role, created_at) VALUES ('m', 't', 'u', 'owner', 'x')",
    );
    await applyMigrations(driver, "sqlite");
    const person = (await driver.query("SELECT * FROM users")).rows[0];
    assert.equal(person.password_hash, "scrypt$hash");
    assert.equal(person.service_role, null);
    assert.deepEqual((await driver.query("PRAGMA foreign_key_check")).rows, []);
    assert.equal(
      Number((await driver.query("PRAGMA foreign_keys")).rows[0].foreign_keys),
      1,
      "foreign keys are back on",
    );
    await driver.run(
      "INSERT INTO users (id, email, password_hash, created_at) VALUES ('v', 'space@example.test', NULL, 'x')",
    );
    await assert.rejects(
      driver.run(
        "INSERT INTO memberships (id, tenant_id, user_id, role, created_at) VALUES ('n', 't', 'nobody', 'owner', 'x')",
      ),
      /FOREIGN KEY/,
    );
    assert.equal(
      (
        await driver.query(
          "SELECT MAX(version) AS version FROM schema_migrations",
        )
      ).rows[0].version,
      migrations[migrations.length - 1].version,
    );
  } finally {
    await driver.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("a rebuild is not blocked by broken references that were already there", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-users-orphans-"));
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  try {
    await applyMigrations(
      driver,
      "sqlite",
      migrations.filter((migration) => migration.version <= 28),
    );
    await driver.run(
      "INSERT INTO organizations (id, name, created_at) VALUES ('t', 'T', 'x')",
    );
    await driver.run(
      "INSERT INTO users (id, email, password_hash, created_at) VALUES ('u', 'owner@example.test', 'scrypt$hash', 'x')",
    );
    // Rows orphaned long ago, in another table and against `users` itself.
    await driver.run("PRAGMA foreign_keys = OFF");
    await driver.run(
      "INSERT INTO session_events (event_id, session_id, type, payload, recorded_at, received_at) VALUES ('e', 'gone-session', 'note', '{}', 'x', 'x')",
    );
    await driver.run(
      "INSERT INTO memberships (id, tenant_id, user_id, role, created_at) VALUES ('m', 't', 'gone-user', 'owner', 'x')",
    );
    await driver.run("PRAGMA foreign_keys = ON");
    const before = (await driver.query("PRAGMA foreign_key_check")).rows.length;
    assert.equal(before, 2);
    await applyMigrations(driver, "sqlite");
    assert.equal(
      (await driver.query("PRAGMA foreign_key_check")).rows.length,
      before,
    );
    assert.equal(
      (await driver.query("SELECT password_hash FROM users")).rows[0]
        .password_hash,
      "scrypt$hash",
    );
  } finally {
    await driver.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("a rebuild that would break a reference is refused and changes nothing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-users-break-"));
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  try {
    const upTo28 = migrations.filter((migration) => migration.version <= 28);
    await applyMigrations(driver, "sqlite", upTo28);
    await driver.run(
      "INSERT INTO organizations (id, name, created_at) VALUES ('t', 'T', 'x')",
    );
    await driver.run(
      "INSERT INTO users (id, email, password_hash, created_at) VALUES ('u', 'owner@example.test', 'scrypt$hash', 'x')",
    );
    await driver.run(
      "INSERT INTO memberships (id, tenant_id, user_id, role, created_at) VALUES ('m', 't', 'u', 'owner', 'x')",
    );
    const breaking = {
      version: 900,
      name: "loses-a-person",
      sqliteRebuildsReferencedTable: true,
      statements: { sqlite: "DELETE FROM users WHERE id = 'u'" },
    };
    await assert.rejects(
      applyMigrations(driver, "sqlite", [...upTo28, breaking]),
      /Migration 900 would break 1 foreign key reference/,
    );
    assert.equal(
      (await driver.query("SELECT COUNT(*) AS count FROM users")).rows[0].count,
      1,
    );
  } finally {
    await driver.close();
    await rm(directory, { recursive: true, force: true });
  }
});

persistenceTest(
  "a person may have no password, and a proven person's device gets a token",
  async (backend) => {
    {
      const repository = await createAuthenticationRepository({
        driver: backend.driver,
      });
      await backend.driver.run(
        "INSERT INTO organizations (id, name, created_at) VALUES ('t', 'vous@exemple.fr', 'x')",
      );
      await backend.driver.run(
        "INSERT INTO users (id, email, password_hash, created_at) VALUES ('u', 'vous@exemple.fr', NULL, 'x')",
      );
      await backend.driver.run(
        "INSERT INTO memberships (id, tenant_id, user_id, role, created_at) VALUES ('m', 't', 'u', 'owner', 'x')",
      );
      const events = [];
      const unsubscribe = subscribe("t", (event) => events.push(event));
      const device = await repository.createDeviceToken({
        tenantId: "t",
        userId: "u",
        label: "iPhone 16 Pro",
        tokenHash: "hash-of-token",
        details: { application: "planner" },
      });
      unsubscribe();
      assert.equal(device.label, "iPhone 16 Pro");
      const active = await repository.findActiveDeviceToken("hash-of-token");
      assert.equal(active.tenant_id, "t");
      assert.equal(active.user_id, "u");
      assert.equal(events.length, 1);
      assert.deepEqual(events[0].domains, ["devices"]);
      const audit = (
        await backend.driver.query(
          "SELECT event_type, details_json FROM audit_events WHERE event_type = 'device.signed_in'",
        )
      ).rows;
      assert.equal(audit.length, 1);
      assert.equal(JSON.parse(audit[0].details_json).application, "planner");
      assert.equal(
        (await repository.listDevices("t")).map((entry) => entry.label)[0],
        "iPhone 16 Pro",
      );
    }
  },
);
