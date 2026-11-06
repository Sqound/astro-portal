import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

// `GET /v1/entitlements` on the open-source shell: the answer of a private
// server, `{ purchases: [], capabilities }`. The route stays (the apps read it
// as the standing of the space, and a 404 would be taken for a refusal); it
// answers no purchase and the capabilities of `GET /v1/capabilities`. The
// recorded exchange `entitlements-private-server` is played as it stands.

const directory = await mkdtemp(join(tmpdir(), "astro-oss-entitlements-"));
process.env.ASTRO_PORTAL_AUTH_MODE = "password";
process.env.ASTRO_PORTAL_DATABASE_PATH = join(directory, "portal.sqlite");
process.env.ASTRO_PORTAL_DATABASE_URL = "";
process.env.ASTRO_PORTAL_SIGN_IN_KEY = randomBytes(32).toString("base64");
process.env.ASTRO_PORTAL_COOKIE_SECURE = "false";

const { createDatabaseDriver } = await import("portal/persistence/database.js");
const { applyMigrations } =
  await import("portal/persistence/migration-runner.js");
const { OPEN_SOURCE_PROFILE } = await import("portal/capabilities/profiles.js");
const { registerServiceExtension } =
  await import("portal-app/lib/service-extensions.js");
const { GET } = await import("../src/app/api/v1/entitlements/route.js");
const { GET: capabilities } =
  await import("../src/app/api/v1/capabilities/route.js");

const exchange = JSON.parse(
  await readFile(
    new URL(
      "../../../packages/astro-contracts/fixtures/api/entitlements-private-server.json",
      import.meta.url,
    ),
    "utf8",
  ),
).exchanges[0];
const token = exchange.request.headers.authorization.replace(/^Bearer /, "");
const at = "2026-10-28T08:00:00.000Z";

let driver;
before(async () => {
  driver = createDatabaseDriver({
    databasePath: process.env.ASTRO_PORTAL_DATABASE_PATH,
  });
  await applyMigrations(driver, "sqlite");
  const tenantId = randomUUID();
  const userId = randomUUID();
  await driver.transaction(async (tx) => {
    await tx.run(
      "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
      [tenantId, "Observatory", at],
    );
    await tx.run(
      "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
      [userId, "owner@example.test", "test-only-password-hash", at],
    );
    await tx.run(
      "INSERT INTO memberships (id, tenant_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)",
      [randomUUID(), tenantId, userId, "owner", at],
    );
    await tx.run(
      "INSERT INTO device_tokens (id, tenant_id, user_id, label, token_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [
        randomUUID(),
        tenantId,
        userId,
        "Test device",
        createHash("sha256").update(token).digest("hex"),
        at,
      ],
    );
  });
});
after(async () => {
  await driver?.close();
  await rm(directory, { force: true, recursive: true });
});

const get = (handler = GET, path = "/api/v1/entitlements") =>
  handler(
    new Request(`http://localhost${path}`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  );

test("the recorded exchange entitlements-private-server is played as it stands", async () => {
  assert.equal(exchange.id, "entitlements-private-server");
  const response = await get();
  assert.equal(response.status, exchange.response.status);
  assert.equal(
    response.headers.get("cache-control"),
    exchange.response.headers["cache-control"],
  );
  assert.deepEqual(await response.json(), exchange.response.body);
});

test("a private server answers no purchase and the capabilities of GET /v1/capabilities", async () => {
  const body = await (await get()).json();
  assert.deepEqual(Object.keys(body).sort(), ["capabilities", "purchases"]);
  assert.deepEqual(body.purchases, []);
  assert.deepEqual(body.capabilities, OPEN_SOURCE_PROFILE);
  assert.deepEqual(
    body.capabilities,
    await (await get(capabilities, "/api/v1/capabilities")).json(),
  );
});

test("a request with no device token is refused, not answered", async () => {
  const response = await GET(
    new Request("http://localhost/api/v1/entitlements"),
  );
  assert.equal(response.status, 401);
});

test("a composition answers in its place through entitlements.read, and its refusal stays a refusal", async () => {
  registerServiceExtension("entitlements.read", {
    enabled: () => true,
    read: async () => ({ purchases: [], capabilities: { composed: true } }),
  });
  assert.deepEqual(await (await get()).json(), {
    purchases: [],
    capabilities: { composed: true },
  });
  registerServiceExtension("entitlements.read", {
    enabled: () => true,
    read: async () => {
      throw Object.assign(new Error("Storage is unavailable."), {
        code: "storage_unavailable",
        status: 503,
      });
    },
  });
  assert.equal((await get()).status, 503);
  registerServiceExtension("entitlements.read", {
    enabled: () => false,
    read: async () => ({ purchases: [{ id: "never" }], capabilities: {} }),
  });
  assert.deepEqual((await (await get()).json()).purchases, []);
});
