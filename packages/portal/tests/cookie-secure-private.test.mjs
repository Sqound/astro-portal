import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import {
  authConfiguration,
  createAuthService,
} from "../dist/auth/auth-service.js";
import { signInStartupNotices } from "../dist/auth/modes.js";
import {
  clearSignInExtensions,
  registerSignInExtension,
} from "../dist/auth/sign-in-extension.js";

// `ASTRO_PORTAL_COOKIE_SECURE=false`, said explicitly, lets a private server
// of the local network keep its web session over plain http in production;
// a sign-in extension that takes `email-code` over ignores it,
// and without it the cookies stay `Secure` in production
// (docs/PRIVATE_NOTEBOOK_AUTH.md, docs/SELF_HOSTING.md).

const signInKey = randomBytes(32).toString("base64");

/** The cookies a sign-out sets, which carry the names and flags of the service. */
async function cookiesOf(env) {
  const auth = createAuthService({
    repository: {},
    configuration: authConfiguration(env),
  });
  return (await auth.logout(new Headers())).cookies;
}

const secure = (cookies) =>
  cookies.length === 2 &&
  cookies.every(
    (cookie) => cookie.startsWith("__Host-") && /; Secure$/.test(cookie),
  );
const plain = (cookies) =>
  cookies.length === 2 &&
  cookies.every(
    (cookie) => cookie.startsWith("astro_portal_") && !/Secure/.test(cookie),
  );

const password = {
  NODE_ENV: "production",
  ASTRO_PORTAL_AUTH_MODE: "password",
  ASTRO_PORTAL_SIGN_IN_KEY: signInKey,
};
const emailCode = {
  NODE_ENV: "production",
  ASTRO_PORTAL_AUTH_MODE: "email-code",
  ASTRO_PORTAL_SIGN_IN_KEY: signInKey,
  ASTRO_PORTAL_PUBLIC_URL: "http://192.168.1.20:8787",
  ASTRO_PORTAL_MAIL_SENDER: "file",
  ASTRO_PORTAL_MAIL_FILE_ALLOWED: "1",
};

test("in production, a private server's cookies are Secure unless COOKIE_SECURE=false says otherwise", async () => {
  clearSignInExtensions();
  assert.ok(secure(await cookiesOf(password)), "password, unset");
  assert.ok(secure(await cookiesOf(emailCode)), "email-code, unset");
  for (const value of ["", "true", "1", "maybe"])
    assert.ok(
      secure(
        await cookiesOf({ ...password, ASTRO_PORTAL_COOKIE_SECURE: value }),
      ),
      `password, COOKIE_SECURE="${value}"`,
    );
  for (const value of ["false", "FALSE", "0", "no", "off", " false "]) {
    assert.ok(
      plain(
        await cookiesOf({ ...password, ASTRO_PORTAL_COOKIE_SECURE: value }),
      ),
      `password, COOKIE_SECURE="${value}"`,
    );
    assert.ok(
      plain(
        await cookiesOf({ ...emailCode, ASTRO_PORTAL_COOKIE_SECURE: value }),
      ),
      `email-code, COOKIE_SECURE="${value}"`,
    );
  }
});

test("a sign-in extension that takes email-code over keeps Secure cookies in production whatever COOKIE_SECURE says", async () => {
  clearSignInExtensions();
  registerSignInExtension({
    mode: "email-code",
    signInPath: "/auth/sign-in",
    announcement: () => ({ method: "email-code", spaceCreation: "open" }),
    administrationAllowed: async () => false,
  });
  try {
    assert.ok(
      secure(
        await cookiesOf({ ...emailCode, ASTRO_PORTAL_COOKIE_SECURE: "false" }),
      ),
    );
    // The same settings with the extension handed back (a private server):
    // honoured.
    registerSignInExtension({
      mode: "email-code",
      signInPath: "/auth/sign-in",
      announcement: () => ({ method: "email-code", spaceCreation: "open" }),
      administrationAllowed: async () => false,
      enabled: () => false,
    });
    assert.ok(
      plain(
        await cookiesOf({ ...emailCode, ASTRO_PORTAL_COOKIE_SECURE: "false" }),
      ),
    );
  } finally {
    clearSignInExtensions();
  }
});

test("a private server in production says at start that its cookies are not Secure", () => {
  clearSignInExtensions();
  const notices = (env) =>
    signInStartupNotices(env).filter(
      (notice) => notice.event === "sign-in.cookies",
    );
  assert.deepEqual(notices(password), []);
  const [notice] = notices({
    ...password,
    ASTRO_PORTAL_COOKIE_SECURE: "false",
  });
  assert.equal(notice.level, "warn");
  assert.match(notice.message, /never exposed to the Internet/);
  assert.deepEqual(
    notices({
      ...password,
      NODE_ENV: "development",
      ASTRO_PORTAL_COOKIE_SECURE: "false",
    }),
    [],
  );
});
