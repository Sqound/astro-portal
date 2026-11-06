import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { createFileSender, readFakeMailbox } from "../dist/mail/file.js";
import { codeDigest } from "../dist/spaces/codes.js";
import { spaceSignInConfiguration } from "../dist/spaces/configuration.js";
import {
  SignInRefusal,
  createSpaceSignIn,
  openSpacePolicy,
} from "../dist/spaces/service.js";
import { testOpenSpace } from "./helpers/space-opener.mjs";

// The `fixedCode` option of the policy of a server that opens spaces: the
// addresses a composition signs in with a code fixed by its settings, not
// sent by e-mail. The core knows nothing of who they are or why.

const FIXED = "fixed@example.test";
const CODE = "483920";
const device = {
  application: "planner",
  installationId: "uwiNSxC6OIQqqkmdEeoVUB6dUVpI1kds",
  name: "iPhone",
  platform: "ios",
};

async function setUp(policyOptions) {
  const directory = await mkdtemp(join(tmpdir(), "astro-fixed-code-"));
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
  const opened = [];
  const fixedCode = {
    has: (email) => email === FIXED,
    matches: (email, code, { key, compareDigests }) =>
      compareDigests(
        codeDigest(key, "fixed", code),
        codeDigest(key, "fixed", CODE),
      ),
    spaceFields: (email) => (email === FIXED ? { fixedCodeSpace: true } : {}),
    afterOpen: async (context) => {
      opened.push(context);
    },
  };
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
    policy: openSpacePolicy({
      openSpace: testOpenSpace,
      ...policyOptions(fixedCode),
    }),
    log: () => {},
  });
  return {
    spaces,
    opened,
    mailbox: () => readFakeMailbox(configuration.mailFileDir),
    async close() {
      await driver.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test("an address of the fixed code asks for a code without any message, and signs in with the fixed one", async () => {
  const context = await setUp((fixedCode) => ({ fixedCode }));
  try {
    const answer = await context.spaces.requestCode({ email: FIXED });
    assert.equal(answer.email, FIXED);
    assert.equal(answer.codeLength, 6);
    assert.deepEqual(await context.mailbox(), []);

    await assert.rejects(
      context.spaces.verify({ email: FIXED, code: "135790", client: "web" }),
      (error) =>
        error instanceof SignInRefusal &&
        error.code === "sign_in_code_incorrect" &&
        error.extra.attemptsRemaining === 4,
    );
    const web = await context.spaces.verify({
      email: FIXED,
      code: CODE,
      client: "web",
    });
    assert.equal(web.created, true);
    assert.equal(web.space.email, FIXED);
    assert.equal(web.space.fixedCodeSpace, true);
    assert.equal(context.opened.length, 1);
    assert.equal(context.opened[0].client, "web");
    assert.equal(context.opened[0].tenantId, web.space.id);

    const phone = await context.spaces.verify({
      email: FIXED,
      code: CODE,
      client: "app",
      device,
    });
    assert.equal(phone.created, false);
    assert.equal(phone.space.fixedCodeSpace, true);
    assert.equal(context.opened.length, 2);
    assert.equal(
      (
        await context.spaces.currentSpace({
          tenantId: web.space.id,
          email: FIXED,
        })
      ).space.fixedCodeSpace,
      true,
    );
  } finally {
    await context.close();
  }
});

test("any other address receives its code by e-mail and its space says nothing of the fixed code", async () => {
  const context = await setUp((fixedCode) => ({ fixedCode }));
  try {
    await context.spaces.requestCode({ email: "someone@example.test" });
    const messages = await context.mailbox();
    assert.equal(messages.length, 1);
    assert.equal(messages[0].to, "someone@example.test");
    // The fixed code is no code of another address.
    await assert.rejects(
      context.spaces.verify({
        email: "someone@example.test",
        code: CODE,
        client: "web",
      }),
      (error) => error instanceof SignInRefusal,
    );
    assert.equal(context.opened.length, 0);
  } finally {
    await context.close();
  }
});

test("without a fixed code, every address receives its code by e-mail", async () => {
  const context = await setUp(() => ({}));
  try {
    await context.spaces.requestCode({ email: FIXED });
    assert.equal((await context.mailbox()).length, 1);
    await assert.rejects(
      context.spaces.verify({ email: FIXED, code: CODE, client: "web" }),
      (error) => error instanceof SignInRefusal,
    );
  } finally {
    await context.close();
  }
});
