import assert from "node:assert/strict";
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readFakeMailbox } from "../dist/mail/file.js";
import { createMailSender } from "../dist/mail/senders.js";
import {
  extractCode,
  isProductionHost,
  purgeTestInbox,
  testInboxNameInstant,
  testInboxProblems,
  testInboxRecipient,
  testInboxSettings,
  testInboxSlug,
} from "../dist/mail/test-inbox.js";
import {
  spaceSignInConfiguration,
  spaceSignInProblems,
} from "../dist/spaces/configuration.js";

const DOMAIN = "audit.example.test";
const SIGN_IN_KEY = Buffer.alloc(32, 7).toString("base64");

async function withDirectories(action) {
  const root = await mkdtemp(join(tmpdir(), "astro-test-inbox-"));
  try {
    return await action({
      inbox: join(root, "inbox"),
      mailbox: join(root, "mailbox"),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/** The settings of a staging service whose real sender is the fake mailbox. */
const stagingEnv = ({ inbox, mailbox }, extra = {}) => ({
  NODE_ENV: "production",
  ASTRO_PORTAL_ENVIRONMENT: "staging",
  ASTRO_PORTAL_PUBLIC_URL: "https://portal-staging.example.test",
  ASTRO_PORTAL_SIGN_IN_KEY: SIGN_IN_KEY,
  ASTRO_PORTAL_MAIL_SENDER: "file",
  ASTRO_PORTAL_MAIL_FILE_ALLOWED: "1",
  ASTRO_PORTAL_MAIL_FILE_DIR: mailbox,
  ASTRO_PORTAL_MAIL_FROM: "sign-in@mail.example.test",
  ASTRO_PORTAL_TEST_INBOX_DOMAIN: DOMAIN,
  ASTRO_PORTAL_TEST_INBOX_DIR: inbox,
  ...extra,
});

const senderFor = (env) =>
  createMailSender(spaceSignInConfiguration(env, { runtimeDir: tmpdir() }));

const message = (to, extra = {}) => ({
  to,
  subject: "Your code",
  text: "Your code is 123456.",
  html: "<p>Your code is 123456.</p>",
  meta: { code: "123456", link: "https://portal-staging.example.test/x" },
  ...extra,
});

test("only an address whose domain is exactly the test domain is the test inbox's", () => {
  for (const to of [
    `audit-ada@${DOMAIN}`,
    `Audit-Ada@${DOMAIN.toUpperCase()}`,
    `audit+one@${DOMAIN}`,
    `  audit-ada@${DOMAIN} `,
  ])
    assert.ok(testInboxRecipient(to, DOMAIN), to);
  assert.equal(
    testInboxRecipient(`A+B@${DOMAIN.toUpperCase()}`, DOMAIN),
    `a+b@${DOMAIN}`,
  );
  for (const to of [
    `x@${DOMAIN}.evil.com`,
    `x@evil.${DOMAIN}`,
    `x@evil${DOMAIN}`,
    `x@${DOMAIN}.`,
    `x@${DOMAIN}@evil.com`,
    `x@evil.com@${DOMAIN}`,
    `x@evil.com,y@${DOMAIN}`,
    `y@${DOMAIN},x@evil.com`,
    `y@${DOMAIN} x@evil.com`,
    `"x@${DOMAIN}"@evil.com`,
    `Ada <x@${DOMAIN}>`,
    `x@other.example.test`,
    `x@gmail.com`,
    "",
    null,
    undefined,
    42,
  ])
    assert.equal(testInboxRecipient(to, DOMAIN), null, String(to));
  assert.equal(testInboxRecipient(`x@${DOMAIN}`, null), null);
});

test("a message to the test domain is written as one JSON file and not sent", async () => {
  await withDirectories(async (directories) => {
    const sender = senderFor(stagingEnv(directories));
    assert.equal(sender.kind, "file");
    assert.deepEqual(sender.testInbox, { domain: DOMAIN });
    const result = await sender.send(
      message(`Audit-Ada+1@${DOMAIN.toUpperCase()}`),
    );
    assert.equal(result.testInbox, true);
    assert.deepEqual(await readFakeMailbox(directories.mailbox), []);
    const names = await readdir(directories.inbox);
    assert.equal(names.length, 1);
    assert.match(
      names[0],
      /^\d{4}-\d\d-\d\dT[\d-]+Z__audit-ada_1_audit.example.test__[0-9a-f-]+\.json$/,
    );
    const stored = JSON.parse(
      await readFile(join(directories.inbox, names[0]), "utf8"),
    );
    assert.equal(stored.to, `audit-ada+1@${DOMAIN}`);
    assert.equal(stored.subject, "Your code");
    assert.equal(stored.text, "Your code is 123456.");
    assert.equal(stored.code, "123456");
    assert.equal(stored.link, "https://portal-staging.example.test/x");
    assert.ok(Number.isFinite(Date.parse(stored.sentAt)));
    assert.equal(stored.html, undefined);
    assert.equal(testInboxNameInstant(names[0]), stored.sentAt);
    assert.ok(names[0].includes(`__${testInboxSlug(stored.to)}__`));
  });
});

test("every other address goes through the real sender unchanged, look-alikes included", async () => {
  await withDirectories(async (directories) => {
    const sender = senderFor(stagingEnv(directories));
    const others = [
      "someone@example.com",
      `x@${DOMAIN}.evil.com`,
      `x@evil${DOMAIN}`,
      `x@evil.com@${DOMAIN}`,
      `x@${DOMAIN}.`,
    ];
    for (const to of others) await sender.send(message(to));
    assert.deepEqual(await readdir(directories.inbox).catch(() => []), []);
    const sent = await readFakeMailbox(directories.mailbox);
    assert.deepEqual(sent.map((m) => m.to).sort(), [...others].sort());
    for (const m of sent) {
      assert.equal(m.html, "<p>Your code is 123456.</p>");
      assert.equal(m.code, "123456");
    }
  });
});

test("without the test inbox the sender is exactly the real one", async () => {
  await withDirectories(async (directories) => {
    const env = stagingEnv(directories);
    delete env.ASTRO_PORTAL_TEST_INBOX_DOMAIN;
    delete env.ASTRO_PORTAL_TEST_INBOX_DIR;
    const sender = senderFor(env);
    assert.equal(sender.testInbox, undefined);
    await sender.send(message(`x@${DOMAIN}`));
    assert.equal((await readFakeMailbox(directories.mailbox)).length, 1);
    assert.deepEqual(await readdir(directories.inbox).catch(() => []), []);
  });
});

test("the routing needs both settings, and never runs with a setting the start refuses", async () => {
  await withDirectories(async (directories) => {
    for (const missing of [
      "ASTRO_PORTAL_TEST_INBOX_DOMAIN",
      "ASTRO_PORTAL_TEST_INBOX_DIR",
    ]) {
      const env = stagingEnv(directories);
      delete env[missing];
      assert.equal(testInboxSettings(env).active, false, missing);
      assert.equal(senderFor(env).testInbox, undefined, missing);
      assert.match(
        testInboxProblems(env).join(";"),
        /set together or not at all/,
      );
    }
    // A production service (nothing says it is a test one) never routes.
    const production = stagingEnv(directories);
    delete production.ASTRO_PORTAL_ENVIRONMENT;
    assert.equal(senderFor(production).testInbox, undefined);
    await senderFor(production).send(message(`x@${DOMAIN}`));
    assert.deepEqual(await readdir(directories.inbox).catch(() => []), []);
  });
});

test("the files older than the retention are purged on write, nothing else is touched", async () => {
  await withDirectories(async (directories) => {
    const sender = senderFor(stagingEnv(directories));
    await sender.send(message(`old@${DOMAIN}`));
    const [oldName] = await readdir(directories.inbox);
    const fourDaysAgo = new Date(Date.now() - 4 * 86_400_000);
    await utimes(join(directories.inbox, oldName), fourDaysAgo, fourDaysAgo);
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
    await sender.send(message(`recent@${DOMAIN}`));
    const recentName = (await readdir(directories.inbox)).find((n) =>
      n.includes("recent"),
    );
    await utimes(join(directories.inbox, recentName), twoDaysAgo, twoDaysAgo);
    await writeFile(join(directories.inbox, "notes.txt"), "not ours");
    await utimes(
      join(directories.inbox, "notes.txt"),
      fourDaysAgo,
      fourDaysAgo,
    );
    await sender.send(message(`new@${DOMAIN}`));
    const names = (await readdir(directories.inbox)).sort();
    assert.ok(!names.includes(oldName));
    assert.ok(names.includes(recentName));
    assert.ok(names.includes("notes.txt"));
    assert.equal(names.filter((n) => n.endsWith(".json")).length, 2);
    // The retention is a setting.
    const short = senderFor(
      stagingEnv(directories, { ASTRO_PORTAL_TEST_INBOX_RETENTION_DAYS: "1" }),
    );
    await short.send(message(`another@${DOMAIN}`));
    assert.ok(!(await readdir(directories.inbox)).includes(recentName));
    assert.equal(await purgeTestInbox(join(directories.inbox, "absent"), 3), 0);
  });
});

test("nothing of a message is logged", async () => {
  await withDirectories(async (directories) => {
    const sender = senderFor(stagingEnv(directories));
    const written = [];
    const originals = {};
    for (const stream of [process.stdout, process.stderr]) {
      originals[stream.fd] = stream.write;
      stream.write = (chunk, ...rest) => {
        written.push(String(chunk));
        return true;
      };
    }
    const consoleMethods = ["log", "info", "warn", "error", "debug"];
    const savedConsole = Object.fromEntries(
      consoleMethods.map((m) => [m, console[m]]),
    );
    for (const m of consoleMethods)
      console[m] = (...args) => written.push(args.join(" "));
    try {
      await sender.send(message(`secret@${DOMAIN}`));
    } finally {
      for (const stream of [process.stdout, process.stderr])
        stream.write = originals[stream.fd];
      Object.assign(console, savedConsole);
    }
    assert.deepEqual(written, []);
  });
});

test("the code is the one the service gave, else six digits of the text", () => {
  assert.equal(
    extractCode({ meta: { code: "654321" }, text: "no digits" }),
    "654321",
  );
  assert.equal(
    extractCode({ meta: {}, text: "Your code: 482913. Valid 10 minutes." }),
    "482913",
  );
  assert.equal(
    extractCode({ meta: {}, text: "order 12345678 and 1234567" }),
    null,
  );
  assert.equal(extractCode({ text: undefined }), null);
});

const staging = {
  ASTRO_PORTAL_ENVIRONMENT: "staging",
  ASTRO_PORTAL_PUBLIC_URL: "https://portal-staging.example.test",
  ASTRO_PORTAL_TEST_INBOX_DOMAIN: DOMAIN,
  ASTRO_PORTAL_TEST_INBOX_DIR: "/data/private/test-inbox",
};

test("the test inbox is accepted on staging, whatever NODE_ENV says", () => {
  assert.deepEqual(testInboxProblems(staging), []);
  assert.deepEqual(
    testInboxProblems({ ...staging, NODE_ENV: "production" }),
    [],
  );
  assert.deepEqual(
    testInboxProblems({
      ...staging,
      ASTRO_PORTAL_ENVIRONMENT: "development",
      ASTRO_PORTAL_PUBLIC_URL: "http://localhost:8787",
    }),
    [],
  );
  assert.deepEqual(testInboxProblems({}), []);
  assert.deepEqual(
    testInboxProblems({ ASTRO_PORTAL_ENVIRONMENT: "production" }),
    [],
  );
});

test("the test inbox is refused unless the deployment is affirmatively a test one", () => {
  const refused = (changes) =>
    testInboxProblems({ ...staging, ...changes }).join(";");
  assert.match(
    refused({ ASTRO_PORTAL_ENVIRONMENT: undefined }),
    /refused outside a test deployment/,
  );
  assert.match(
    refused({ ASTRO_PORTAL_ENVIRONMENT: "" }),
    /refused outside a test deployment/,
  );
  assert.match(
    refused({ ASTRO_PORTAL_ENVIRONMENT: "production" }),
    /refused outside a test deployment/,
  );
  assert.match(
    refused({ ASTRO_PORTAL_ENVIRONMENT: "prod" }),
    /refused outside a test deployment/,
  );
  // The hosts the operator lists as production ones, whatever their name.
  const listed = {
    ASTRO_PORTAL_PRODUCTION_HOSTS: "portal.example.org, notes.example.net",
  };
  assert.match(
    refused({
      ...listed,
      ASTRO_PORTAL_PUBLIC_URL: "https://portal.example.org",
    }),
    /production address/,
  );
  assert.match(
    refused({
      ...listed,
      ASTRO_PORTAL_PUBLIC_URL: "https://PORTAL.example.org/",
    }),
    /production address/,
  );
  assert.match(
    refused({
      ...listed,
      ASTRO_PORTAL_PUBLIC_URL: "https://notes.example.net",
    }),
    /production address/,
  );
  // Even with the environment copied from staging to a production template.
  assert.match(
    refused({
      ...listed,
      ASTRO_PORTAL_ENVIRONMENT: "staging",
      ASTRO_PORTAL_PUBLIC_URL: "https://portal.example.org",
    }),
    /production address/,
  );
  // Not listed: a staging host is not refused for its name alone.
  assert.equal(
    refused({
      ...listed,
      ASTRO_PORTAL_PUBLIC_URL: "https://staging.example.org",
    }),
    "",
  );
  assert.match(
    refused({
      ASTRO_PORTAL_PUBLIC_URL: "https://astro-portal-prod.example",
    }),
    /production address/,
  );
  // Even with the environment copied from staging to a production template.
  assert.match(
    refused({
      ASTRO_PORTAL_ENVIRONMENT: "staging",
      ASTRO_PORTAL_PUBLIC_URL: "https://astro-portal-prod.example",
    }),
    /production address/,
  );
  assert.match(
    refused({ ASTRO_PORTAL_TEST_INBOX_DOMAIN: "audit.example.org" }),
    /ending in \.test/,
  );
  assert.match(
    refused({ ASTRO_PORTAL_TEST_INBOX_DOMAIN: "test" }),
    /ending in \.test/,
  );
  assert.match(
    refused({ ASTRO_PORTAL_TEST_INBOX_DIR: "test-inbox" }),
    /absolute path/,
  );
  assert.match(
    refused({ ASTRO_PORTAL_TEST_INBOX_RETENTION_DAYS: "0" }),
    /RETENTION_DAYS/,
  );
  assert.equal(isProductionHost("portal-staging.example.test"), false);
  // The list: exact names, `*.` for the subdomains of a domain, no partial match.
  const hosts = {
    ASTRO_PORTAL_PRODUCTION_HOSTS: "portal.example.org\n*.apps.example.net",
  };
  assert.equal(isProductionHost("portal.example.org", hosts), true);
  assert.equal(isProductionHost("Portal.Example.Org", hosts), true);
  assert.equal(isProductionHost("x.portal.example.org", hosts), false);
  assert.equal(isProductionHost("example.org", hosts), false);
  assert.equal(isProductionHost("a.apps.example.net", hosts), true);
  assert.equal(isProductionHost("apps.example.net", hosts), false);
  assert.equal(isProductionHost("evilapps.example.net", hosts), false);
  assert.equal(isProductionHost("portal.example.org", {}), false);
  assert.equal(isProductionHost("astro-portal-production.example", {}), true);
  assert.equal(isProductionHost("astro-portal-dev.example"), false);
  assert.equal(isProductionHost("localhost"), false);
});

test("the sign-in settings report the test inbox's problems by name", () => {
  const production = {
    NODE_ENV: "production",
    ASTRO_PORTAL_PUBLIC_URL: "https://portal.example.test",
    ASTRO_PORTAL_SIGN_IN_KEY: SIGN_IN_KEY,
    ASTRO_PORTAL_MAIL_SENDER: "smtp",
    ASTRO_PORTAL_SMTP_URL: "smtps://user:pass@mail.example.com:465",
    ASTRO_PORTAL_MAIL_FROM: "sign-in@mail.example.test",
  };
  assert.deepEqual(
    spaceSignInProblems(
      spaceSignInConfiguration(production, { runtimeDir: tmpdir() }),
    ),
    [],
  );
  const withInbox = spaceSignInConfiguration(
    {
      ...production,
      ASTRO_PORTAL_TEST_INBOX_DOMAIN: DOMAIN,
      ASTRO_PORTAL_TEST_INBOX_DIR: "/data/inbox",
    },
    { runtimeDir: tmpdir() },
  );
  const problems = spaceSignInProblems(withInbox).join(";");
  assert.match(problems, /ASTRO_PORTAL_ENVIRONMENT must be staging/);
  assert.doesNotMatch(problems, /pass|mail\.example\.com/);
  assert.equal(createMailSender(withInbox).testInbox, undefined);
});
