import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createAuthService } from "../dist/auth/auth-service.js";
import {
  authModeProblem,
  signInAnnouncement,
  signInStartupNotices,
  signInStartupProblems,
} from "../dist/auth/modes.js";
import { clearSignInExtensions } from "../dist/auth/sign-in-extension.js";
import { MailDeliveryError } from "../dist/mail/errors.js";
import { createSmtpSender } from "../dist/mail/smtp.js";
import { createAuthenticationRepository } from "../dist/persistence/authentication-repository.js";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import {
  createPrivateSpaceSignIn,
  privateSpaceSignInConfiguration,
} from "../dist/spaces/private.js";

// A private server's own sign-in (docs/PRIVATE_NOTEBOOK_AUTH.md): its modes
// and the settings it refuses to start without, its codes sent by `smtp`
// (against a fake mail server in this process, no network), the owner's
// address alone (`not_owner`, `not_initialized`), and the locks of the
// `password` mode.

clearSignInExtensions();

/** A password that is not the owner's, for the failures. */
const wrongPassword = ["not", "the", "password"].join(" ");

// ——— A fake mail server: EHLO, AUTH, MAIL, RCPT, DATA, no TLS ———

async function fakeSmtpServer() {
  const received = [];
  const sessions = [];
  const server = createServer((socket) => {
    const session = { auth: null, from: null, to: [], mailed: false };
    sessions.push(session);
    let buffer = "";
    let data = null;
    let awaiting = null;
    const reply = (line) => socket.write(`${line}\r\n`);
    reply("220 fake.example.test ESMTP");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let end;
      while ((end = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data !== null) {
          if (line === ".") {
            received.push({ ...session, data: data.join("\r\n") });
            session.mailed = true;
            data = null;
            reply("250 queued");
          } else data.push(line.startsWith("..") ? line.slice(1) : line);
          continue;
        }
        if (awaiting === "user") {
          session.auth = { user: Buffer.from(line, "base64").toString() };
          awaiting = "pass";
          reply("334 UGFzc3dvcmQ6");
          continue;
        }
        if (awaiting === "pass") {
          session.auth.pass = Buffer.from(line, "base64").toString();
          awaiting = null;
          reply("235 accepted");
          continue;
        }
        const [verb, ...rest] = line.split(" ");
        switch (verb.toUpperCase()) {
          case "EHLO":
            reply("250-fake.example.test");
            reply("250-AUTH PLAIN LOGIN");
            reply("250 8BITMIME");
            break;
          case "HELO":
            reply("250 fake.example.test");
            break;
          case "AUTH":
            if (rest[0]?.toUpperCase() === "PLAIN" && rest[1]) {
              const [, user, pass] = Buffer.from(rest[1], "base64")
                .toString()
                .split("\u0000");
              session.auth = { user, pass };
              reply("235 accepted");
            } else if (rest[0]?.toUpperCase() === "PLAIN") {
              awaiting = "plain";
              reply("334 ");
            } else {
              awaiting = "user";
              reply("334 VXNlcm5hbWU6");
            }
            break;
          case "MAIL":
            session.from = /<([^>]*)>/.exec(line)?.[1] ?? null;
            reply("250 ok");
            break;
          case "RCPT":
            session.to.push(/<([^>]*)>/.exec(line)?.[1] ?? null);
            reply("250 ok");
            break;
          case "DATA":
            data = [];
            reply("354 go ahead");
            break;
          case "RSET":
          case "NOOP":
            reply("250 ok");
            break;
          case "QUIT":
            reply("221 bye");
            socket.end();
            break;
          default:
            if (awaiting === "plain") {
              const [, user, pass] = Buffer.from(line, "base64")
                .toString()
                .split("\u0000");
              session.auth = { user, pass };
              awaiting = null;
              reply("235 accepted");
            } else reply("502 not implemented");
        }
      }
    });
    socket.on("error", () => {});
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: server.address().port,
    received,
    sessions,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** The body of a message as a person reads it: quoted-printable undone. */
function readable(data) {
  if (!/quoted-printable/i.test(data)) return data;
  const bytes = [];
  const text = data.replace(/=\r\n/g, "");
  for (let index = 0; index < text.length; index += 1) {
    const hex = /^=([0-9A-F]{2})/.exec(text.slice(index, index + 3));
    if (hex) {
      bytes.push(parseInt(hex[1], 16));
      index += 2;
    } else bytes.push(...Buffer.from(text[index], "utf8"));
  }
  return Buffer.from(bytes).toString("utf8");
}

test("smtp: a message reaches the mail server with its sender, recipient, subject, code and link", async () => {
  const smtp = await fakeSmtpServer();
  try {
    const sender = createSmtpSender({
      url: `smtp://vous%40example.com:app%2Fpass@127.0.0.1:${smtp.port}`,
      from: "Astro Portal <vous@example.com>",
      allowInsecure: true,
    });
    await sender.send({
      to: "vous@example.com",
      subject: "Your sign-in code: 481 207",
      text: "Your code: 481207\nhttps://portal.example.test/auth/link#v=1&c=481207",
      html: "<p>Your code: <b>481207</b></p>",
    });
    sender.close();
    assert.equal(smtp.received.length, 1);
    const [message] = smtp.received;
    assert.deepEqual(message.auth, {
      user: "vous@example.com",
      pass: "app/pass",
    });
    assert.equal(message.from, "vous@example.com");
    assert.deepEqual(message.to, ["vous@example.com"]);
    const body = readable(message.data);
    assert.match(body, /^Subject: Your sign-in code: 481 207$/m);
    assert.match(body, /481207/);
    assert.match(
      body,
      /https:\/\/portal\.example\.test\/auth\/link#v=1&c=481207/,
    );
  } finally {
    await smtp.close();
  }
});

test("smtp: STARTTLS is required on port 587 unless the relay is allowed insecure, and a failure names no address", async () => {
  const smtp = await fakeSmtpServer();
  try {
    const sender = createSmtpSender({
      url: `smtp://someone:secret-password@127.0.0.1:${smtp.port}`,
      from: "vous@example.com",
      timeoutMs: 5_000,
    });
    const failure = await sender
      .send({ to: "vous@example.com", subject: "x", text: "x" })
      .then(
        () => null,
        (error) => error,
      );
    sender.close();
    assert.ok(failure instanceof MailDeliveryError, String(failure));
    assert.doesNotMatch(failure.message, /secret-password|someone|127\.0\.0/);
    assert.equal(smtp.received.length, 0, "nothing was handed over");
    assert.ok(
      smtp.sessions.every((session) => session.auth === null),
      "no password was sent in clear",
    );
  } finally {
    await smtp.close();
  }
});

// ——— A private server by e-mail code, over smtp ———

async function scratch() {
  const directory = await mkdtemp(join(tmpdir(), "astro-private-sign-in-"));
  const databasePath = join(directory, "portal.sqlite");
  const driver = createDatabaseDriver({ databasePath });
  await applyMigrations(driver, "sqlite");
  return {
    directory,
    databasePath,
    driver,
    async close() {
      await driver.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test("email-code: the installation sends its code at once; then only the owner's address receives one", async () => {
  const smtp = await fakeSmtpServer();
  const place = await scratch();
  try {
    const signInKey = randomBytes(32).toString("base64");
    const env = {
      ASTRO_PORTAL_AUTH_MODE: "email-code",
      ASTRO_PORTAL_PUBLIC_URL: "http://portal.local:8814",
      ASTRO_PORTAL_SIGN_IN_KEY: signInKey,
      ASTRO_PORTAL_MAIL_SENDER: "smtp",
      ASTRO_PORTAL_SMTP_URL: `smtp://relay:pw@127.0.0.1:${smtp.port}`,
      ASTRO_PORTAL_SMTP_ALLOW_INSECURE: "1",
      ASTRO_PORTAL_MAIL_FROM: "portail@example.com",
      ASTRO_PORTAL_RUNTIME_DIR: join(place.directory, "runtime"),
    };
    assert.deepEqual(signInStartupProblems(env), []);
    assert.deepEqual(signInAnnouncement(env), {
      method: "email-code",
      spaceCreation: "closed",
      codeLength: 6,
    });
    const [notice] = signInStartupNotices(env);
    assert.match(notice.message, /127\.0\.0\.1:\d+/);
    assert.doesNotMatch(notice.message, /relay|pw@/);
    const repository = await createAuthenticationRepository({
      driver: place.driver,
    });
    const auth = createAuthService({
      repository,
      configuration: {
        enabled: true,
        mode: "email-code",
        databasePath: place.databasePath,
        bootstrapSecret: "the-bootstrap-secret",
        signInKey,
        secureCookies: false,
      },
    });
    let now = new Date();
    const { spaces, installation } = createPrivateSpaceSignIn({
      driver: place.driver,
      configuration: privateSpaceSignInConfiguration(env),
      auth,
      alert: () => {},
      log: () => {},
      clock: () => now,
    });
    const headers = new Headers({ "x-astro-client-ip": "192.0.2.10" });
    // Before the installation, no address receives a code.
    await assert.rejects(
      spaces.requestCode({ email: "vous@example.com", origin: "192.0.2.10" }),
      { code: "not_initialized", status: 409 },
    );
    await assert.rejects(
      installation.start({
        bootstrapSecret: "wrong",
        email: "vous@example.com",
        headers,
      }),
      /Invalid bootstrap secret/,
    );
    assert.equal(smtp.received.length, 0);
    const sent = await installation.start({
      bootstrapSecret: "the-bootstrap-secret",
      email: "Vous@Example.com",
      language: "fr",
      headers,
    });
    assert.equal(sent.email, "vous@example.com");
    assert.equal(smtp.received.length, 1);
    const first = readable(smtp.received[0].data);
    assert.deepEqual(smtp.received[0].to, ["vous@example.com"]);
    const code = /(\d{3})[\s\u00a0\u202f](\d{3})/u
      .exec(first)
      .slice(1)
      .join("");
    // The installation is a web page: the message names the page, not the app,
    // and has no button to open it.
    assert.match(first, /page de connexion d’Astro Portal/);
    assert.doesNotMatch(first, /\/auth\/link#|PlanAstro/);
    const account = await installation.confirm({
      bootstrapSecret: "the-bootstrap-secret",
      email: "vous@example.com",
      code,
      organizationName: "Observatoire",
      headers,
    });
    assert.equal(account.recoveryCodes.length, 10);
    assert.equal(account.cookies.length, 2);
    await assert.rejects(
      installation.start({
        bootstrapSecret: "the-bootstrap-secret",
        email: "autre@example.com",
        headers,
      }),
      /Bootstrap is already closed/,
    );
    // Another address: refused, never a code.
    await assert.rejects(
      spaces.requestCode({ email: "autre@example.com", origin: "192.0.2.11" }),
      { code: "not_owner", status: 403 },
    );
    assert.equal(smtp.received.length, 1);
    // The owner's: a code (a minute after the last one).
    now = new Date(now.getTime() + 2 * 60_000);
    await spaces.requestCode({
      email: "vous@example.com",
      language: "en",
      origin: "192.0.2.12",
    });
    assert.equal(smtp.received.length, 2);
    const second = readable(smtp.received[1].data);
    // The subject carries the code (a MIME word: its space is a no-break
    // one), the body the code and the link.
    assert.match(second, /^Subject: =\?UTF-8\?Q\?Your_sign-in_code:_\d{3}/m);
    assert.match(second, /\d{3}[\u00a0 ]\d{3}/u);
    assert.match(second, /http:\/\/portal\.local:8814\/auth\/link#/);
    const status = await auth.status(new Headers());
    assert.equal(status.spaceCreation, "closed");
    assert.equal(status.signInPath, "/auth/sign-in");
    assert.equal(status.initialized, true);
    // A recovery code signs in whatever the mode, and only once.
    const recovered = await auth.login({
      recoveryCode: account.recoveryCodes[0],
      headers,
    });
    assert.equal(recovered.cookies.length, 2);
    await assert.rejects(
      auth.login({ recoveryCode: account.recoveryCodes[0], headers }),
      { code: "recovery_code_incorrect" },
    );
    // There is no password to type in this mode.
    await assert.rejects(
      auth.login({ email: "vous@example.com", password: "x", headers }),
      { code: "not_found", status: 404 },
    );
  } finally {
    await place.close();
    await smtp.close();
  }
});

// ——— The modes and the settings they need ———

test("totp is gone: the service names the two modes and the documentation", () => {
  const problem = authModeProblem({ ASTRO_PORTAL_AUTH_MODE: "totp" });
  assert.match(problem, /email-code/);
  assert.match(problem, /password/);
  assert.match(problem, /docs\/PRIVATE_NOTEBOOK_AUTH\.md/);
  assert.deepEqual(signInStartupProblems({ ASTRO_PORTAL_AUTH_MODE: "totp" }), [
    problem,
  ]);
  assert.throws(
    () => signInAnnouncement({ ASTRO_PORTAL_AUTH_MODE: "totp" }),
    /no longer exists/,
  );
});

test("a private server names the settings it cannot start without, never their values", () => {
  assert.deepEqual(
    signInStartupProblems({ ASTRO_PORTAL_AUTH_MODE: "password" }),
    ["ASTRO_PORTAL_SIGN_IN_KEY (32 bytes, base64)"],
  );
  assert.deepEqual(signInAnnouncement({ ASTRO_PORTAL_AUTH_MODE: "password" }), {
    method: "pairing",
  });
  const problems = signInStartupProblems({
    ASTRO_PORTAL_AUTH_MODE: "email-code",
  });
  assert.ok(
    problems.some((problem) => /ASTRO_PORTAL_PUBLIC_URL/.test(problem)),
  );
  assert.ok(
    problems.some((problem) => /ASTRO_PORTAL_SIGN_IN_KEY/.test(problem)),
  );
  assert.ok(
    problems.some((problem) =>
      /ASTRO_PORTAL_MAIL_SENDER \(smtp, with ASTRO_PORTAL_SMTP_URL and ASTRO_PORTAL_MAIL_FROM; or file/.test(
        problem,
      ),
    ),
  );
  const smtp = signInStartupProblems({
    ASTRO_PORTAL_AUTH_MODE: "email-code",
    ASTRO_PORTAL_PUBLIC_URL: "http://192.168.1.20:8787",
    ASTRO_PORTAL_SIGN_IN_KEY: randomBytes(32).toString("base64"),
    ASTRO_PORTAL_MAIL_SENDER: "smtp",
    ASTRO_PORTAL_SMTP_URL: "not a url with a s3cret",
  });
  assert.equal(smtp.length, 2);
  assert.match(smtp[0], /^ASTRO_PORTAL_SMTP_URL/);
  assert.equal(smtp[1], "ASTRO_PORTAL_MAIL_FROM");
  assert.ok(smtp.every((problem) => !problem.includes("s3cret")));
});

// ——— The locks of the `password` mode ———

test("password: five failures from one origin lock the pair 15 minutes, then 1 hour; the recovery code still signs in", async () => {
  const place = await scratch();
  try {
    let now = new Date("2026-10-01T20:00:00.000Z");
    const repository = await createAuthenticationRepository({
      driver: place.driver,
    });
    const auth = createAuthService({
      repository,
      clock: () => now,
      configuration: {
        enabled: true,
        mode: "password",
        databasePath: place.databasePath,
        bootstrapSecret: "the-bootstrap-secret",
        signInKey: randomBytes(32).toString("base64"),
        secureCookies: false,
      },
    });
    const password = ["a", "password", "long", "enough"].join(" ");
    const { recoveryCodes } = await auth.installWithPassword({
      bootstrapSecret: "the-bootstrap-secret",
      email: "vous@example.com",
      password,
    });
    const from = (address) => new Headers({ "x-astro-client-ip": address });
    const wrong = (address = "198.51.100.7") =>
      auth.login({
        email: "vous@example.com",
        password: wrongPassword,
        headers: from(address),
      });
    for (const remaining of [4, 3, 2, 1])
      await assert.rejects(wrong(), {
        code: "sign_in_password_incorrect",
        status: 401,
        extra: { attemptsRemaining: remaining },
      });
    const lock = await wrong().then(
      () => null,
      (error) => error,
    );
    assert.equal(lock.code, "sign_in_locked");
    assert.equal(lock.status, 429);
    assert.equal(lock.extra.retryAt, "2026-10-01T20:15:00.000Z");
    // The right password waits too, from this origin.
    await assert.rejects(
      auth.login({
        email: "vous@example.com",
        password,
        headers: from("198.51.100.7"),
      }),
      { code: "sign_in_locked" },
    );
    // Once the wait is over, five more failures within 24 hours of the
    // first lock lock for an hour.
    now = new Date("2026-10-01T20:16:00.000Z");
    for (let failure = 0; failure < 4; failure += 1)
      await assert.rejects(wrong(), { code: "sign_in_password_incorrect" });
    const second = await wrong().then(
      () => null,
      (error) => error,
    );
    assert.equal(second.code, "sign_in_locked");
    assert.equal(second.extra.retryAt, "2026-10-01T21:16:00.000Z");
    // Another origin is not held back by this pair.
    assert.equal(
      (
        await auth.login({
          email: "vous@example.com",
          password,
          headers: from("203.0.113.9"),
        })
      ).cookies.length,
      2,
    );
    // A recovery code is never held back by the lock of the address: it
    // signs in, sets the new password, and the failures are forgotten.
    const newPassword = "another password, long enough";
    const recovered = await auth.login({
      recoveryCode: recoveryCodes[0],
      newPassword,
      headers: from("198.51.100.7"),
    });
    assert.equal(recovered.cookies.length, 2);
    assert.equal(
      (
        await auth.login({
          email: "vous@example.com",
          password: newPassword,
          headers: from("198.51.100.7"),
        })
      ).cookies.length,
      2,
    );
    await assert.rejects(
      auth.login({
        email: "vous@example.com",
        password,
        headers: from("198.51.100.7"),
      }),
      { code: "sign_in_password_incorrect" },
    );
  } finally {
    await place.close();
  }
});

test("password: twenty failures from every origin lock the address itself", async () => {
  const place = await scratch();
  try {
    const repository = await createAuthenticationRepository({
      driver: place.driver,
    });
    const auth = createAuthService({
      repository,
      configuration: {
        enabled: true,
        mode: "password",
        databasePath: place.databasePath,
        bootstrapSecret: "the-bootstrap-secret",
        signInKey: randomBytes(32).toString("base64"),
        secureCookies: false,
      },
    });
    const password = ["a", "password", "long", "enough"].join(" ");
    await auth.installWithPassword({
      bootstrapSecret: "the-bootstrap-secret",
      email: "vous@example.com",
      password,
    });
    const attempt = (secret, index) =>
      auth.login({
        email: "vous@example.com",
        password: secret,
        headers: new Headers({ "x-astro-client-ip": `192.0.2.${index}` }),
      });
    for (let index = 1; index < 20; index += 1)
      await assert.rejects(attempt("wrong password", index), {
        code: "sign_in_password_incorrect",
      });
    await assert.rejects(attempt("wrong password", 20), {
      code: "sign_in_locked",
    });
    await assert.rejects(attempt(password, 21), { code: "sign_in_locked" });
  } finally {
    await place.close();
  }
});
