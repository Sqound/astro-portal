import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { testOpenSpace } from "./helpers/space-opener.mjs";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { createFileSender, readFakeMailbox } from "../dist/mail/file.js";
import { spaceSignInConfiguration } from "../dist/spaces/configuration.js";
import {
  SignInRefusal,
  closedSpacePolicy,
  createSpaceSignIn,
  openSpacePolicy,
} from "../dist/spaces/service.js";

// A private server has one account: the administrator created at the
// installation. Another address is refused whatever the core is asked to do,
// and the core holds no way to write a second person: a service that opens
// spaces brings its own (`openSpace` of the sign-in policy).

const OWNER = "owner@example.test";
const STRANGER = "stranger@example.test";
const here = dirname(fileURLToPath(import.meta.url));

async function setUp(makePolicy) {
  const directory = await mkdtemp(join(tmpdir(), "astro-single-account-"));
  const configuration = spaceSignInConfiguration(
    {
      ASTRO_PORTAL_PUBLIC_URL: "https://portal.example.test",
      ASTRO_PORTAL_SIGN_IN_KEY: Buffer.alloc(32, 9).toString("base64"),
      ASTRO_PORTAL_MAIL_SENDER: "file",
      ASTRO_PORTAL_CLIENT_IP_HEADER: "socket",
    },
    { runtimeDir: directory, allowPlainHttp: false },
  );
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  await applyMigrations(driver, driver.dialect);
  const spaces = createSpaceSignIn({
    driver,
    configuration,
    sender: createFileSender({
      directory: configuration.mailFileDir,
      clock: () => new Date(),
    }),
    auth: {
      async openSession({ userId }) {
        return { cookies: [`session=for-${userId}`] };
      },
      newDeviceCredential() {
        const deviceToken = randomBytes(32).toString("base64url");
        return {
          deviceToken,
          tokenHash: createHash("sha256").update(deviceToken).digest("hex"),
        };
      },
    },
    policy: makePolicy(),
    log: () => {},
  });
  // The one account of the server, as the installation leaves it.
  const now = new Date().toISOString();
  const tenantId = randomUUID();
  const userId = randomUUID();
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    [tenantId, OWNER, now],
  );
  await driver.run(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, NULL, ?)",
    [userId, OWNER, now],
  );
  await driver.run(
    "INSERT INTO memberships (id, tenant_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)",
    [randomUUID(), tenantId, userId, now],
  );
  return {
    spaces,
    driver,
    mailbox: () => readFakeMailbox(configuration.mailFileDir),
    people: async () =>
      (await driver.query("SELECT email FROM users ORDER BY email")).rows.map(
        (row) => row.email,
      ),
    async close() {
      await driver.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test("a private server refuses another address: no code sent, nothing written", async () => {
  const context = await setUp(() => closedSpacePolicy());
  try {
    await assert.rejects(
      context.spaces.requestCode({ email: STRANGER, client: "web" }),
      (error) =>
        error instanceof SignInRefusal &&
        error.code === "not_owner" &&
        error.status === 403,
    );
    await assert.rejects(
      context.spaces.verify({ email: STRANGER, code: "123456", client: "web" }),
      (error) => error instanceof SignInRefusal && error.code === "not_owner",
    );
    assert.deepEqual(await context.people(), [OWNER]);
  } finally {
    await context.close();
  }
});

test("a core that was given no way to open a space refuses a second address even when asked to open them", async () => {
  // The policy of a service that opens spaces, with no `openSpace` of its
  // composition: the core alone cannot create a person.
  const context = await setUp(() => openSpacePolicy());
  try {
    await context.spaces.requestCode({ email: STRANGER, client: "web" });
    const [message] = (await context.mailbox()).filter(
      (sent) => sent.to === STRANGER,
    );
    assert.ok(message, "the code of the address left, like any address's");
    await assert.rejects(
      context.spaces.verify({
        email: STRANGER,
        code: message.code,
        client: "web",
      }),
      (error) =>
        error instanceof SignInRefusal &&
        error.code === "not_owner" &&
        error.status === 403,
    );
    assert.deepEqual(await context.people(), [OWNER], "no second person");
    const owners = (
      await context.driver.query(
        "SELECT COUNT(*) AS count FROM memberships WHERE role = 'owner'",
      )
    ).rows[0].count;
    assert.equal(Number(owners), 1, "no second space");
  } finally {
    await context.close();
  }
});

test("the composition's way to open a space is what creates one", async () => {
  let asked = null;
  const context = await setUp(() =>
    openSpacePolicy({
      async openSpace(transaction, details) {
        asked = { email: details.email, language: details.language };
        return await testOpenSpace(transaction, details);
      },
    }),
  );
  try {
    await context.spaces.requestCode({
      email: STRANGER,
      client: "web",
      language: "fr",
    });
    const [message] = (await context.mailbox()).filter(
      (sent) => sent.to === STRANGER,
    );
    const opened = await context.spaces.verify({
      email: STRANGER,
      code: message.code,
      client: "web",
    });
    assert.equal(opened.created, true);
    assert.equal(opened.space.email, STRANGER);
    assert.deepEqual(asked, { email: STRANGER, language: "fr" });
    assert.deepEqual(await context.people(), [OWNER, STRANGER]);
  } finally {
    await context.close();
  }
});

/** Every source file of the core's packages, below `directory`. */
async function sources(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await sources(path)));
    else if (/\.(js|jsx|ts|tsx|mjs)$/.test(entry.name)) found.push(path);
  }
  return found;
}

test("the open core writes a person at the installation only", async () => {
  // Where a person (and the membership that makes them a space's owner) is
  // written: the installation of the server, the migrations that rebuild the
  // table, and nothing else. A service that opens spaces writes its own
  // people from its composition.
  const allowed = new Set([
    "persistence/authentication-repository.js",
    "persistence/migrations.ts",
  ]);
  const writers = [];
  for (const path of [
    ...(await sources(join(here, "../src"))),
    ...(await sources(join(here, "../../portal-app/src"))),
    ...(await sources(join(here, "../../planner/src"))),
  ]) {
    const text = await readFile(path, "utf8");
    if (!/INSERT INTO (users|memberships)\b/i.test(text)) continue;
    const name = relative(join(here, "../src"), path);
    if (!allowed.has(name)) writers.push(name);
  }
  assert.deepEqual(writers, []);
});
