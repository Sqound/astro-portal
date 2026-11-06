import { emailCodeSignIn } from "astro-contracts/service-identity";
import {
  clientOriginProblems,
  clientOriginSettings,
} from "../api/client-origin.js";
import { smtpDescription } from "../mail/smtp-settings.js";
import {
  SIGN_IN_KEY_PROBLEM,
  privateSpaceSignInProblems,
  spaceSignInConfiguration,
} from "../spaces/configuration.js";
import { signInExtension } from "./sign-in-extension.js";

/**
 * The ways a person signs in (ASTRO_PORTAL_AUTH_MODE,
 * docs/PRIVATE_NOTEBOOK_AUTH.md). Settings only: nothing
 * here reads the database or loads a sender, so that the service can check
 * them before it starts (server.mjs).
 *
 * - `disabled` (the default): no private API.
 * - `password`: a private server; its owner signs in on the web with an
 *   e-mail address and a password, and pairs the devices with a code shown
 *   on the account page.
 * - `email-code`: an e-mail address, then a six-digit code received by
 *   e-mail. On a private server (the core's own), only the owner's address,
 *   in a space of one person (`spaceCreation: "closed"`). An extension may
 *   take the mode over, for a server where any address gets a space
 *   (`spaceCreation: "open"`).
 *
 * `totp`, the authenticator of the first private servers, is gone: a
 * service set to it does not start, and says which modes to choose.
 */
export const AUTH_MODES = ["disabled", "password", "email-code"];
export const EMAIL_CODE_MODE = "email-code";
export const PASSWORD_MODE = "password";
export const AUTH_DOCUMENTATION = "docs/PRIVATE_NOTEBOOK_AUTH.md";

export const authMode = (env = process.env) =>
  String(env.ASTRO_PORTAL_AUTH_MODE || "disabled")
    .trim()
    .toLowerCase();

/** Why a value of ASTRO_PORTAL_AUTH_MODE is not a mode, or `null`. */
export function authModeProblem(env = process.env) {
  const mode = authMode(env);
  if (AUTH_MODES.includes(mode)) return null;
  if (mode === "totp")
    return `ASTRO_PORTAL_AUTH_MODE=totp no longer exists: choose email-code (a code received by e-mail, sent by the server) or password (an e-mail address and a password); see ${AUTH_DOCUMENTATION}`;
  return `ASTRO_PORTAL_AUTH_MODE must be disabled, password or email-code (see ${AUTH_DOCUMENTATION})`;
}

/**
 * The extension that takes the mode over in this process, or `null`: only
 * `email-code` may be taken over, and only by an extension enabled for these
 * settings.
 */
export function activeSignInExtension(env = process.env) {
  const mode = authMode(env);
  return mode === EMAIL_CODE_MODE ? signInExtension(mode, env) : null;
}

/** The mode the extension took over (`email-code`), or `null`. */
export const hostedSignInMode = (env = process.env) =>
  activeSignInExtension(env) ? authMode(env) : null;

/** A private server's own sign-in by e-mail code is in force. */
export const privateEmailCode = (env = process.env) =>
  authMode(env) === EMAIL_CODE_MODE && !activeSignInExtension(env);

/**
 * The `signIn` object of `GET /v1/service`: `none` when the private API is
 * off, `pairing` for a private server signing in by password, the private
 * server's own `email-code` (`spaceCreation: "closed"`), or the extension's
 * announcement. Settings only, no database read. Throws for a value that is
 * not a mode (signInStartupProblems says why).
 */
export function signInAnnouncement(env = process.env) {
  const problem = authModeProblem(env);
  if (problem) throw new Error(problem);
  const mode = authMode(env);
  if (mode === "disabled") return { method: "none" };
  if (mode === PASSWORD_MODE) return { method: "pairing" };
  const extension = activeSignInExtension(env);
  return extension
    ? extension.announcement(env)
    : emailCodeSignIn({ spaceCreation: "closed" });
}

/**
 * Whether this server opens spaces (`spaceCreation: "open"` in its sign-in
 * announcement): a server where any address gets a space. A
 * private server — one owner, who is also its administrator — does not,
 * nor a server without the sign-in by e-mail code. Read by what exists only
 * where people other than the owner have a space: what a composition adds for
 * them (its extensions read it). Settings only.
 */
export function spaceCreationOpen(env = process.env) {
  try {
    return signInAnnouncement(env)?.spaceCreation === "open";
  } catch {
    return false;
  }
}

/**
 * The settings, by name, without which the service must not start: a mode
 * that is not one; the key of a private server (password, e-mail code);
 * the public address and the sender of its codes (e-mail code); the
 * extension's own `startupProblems`; and, in every
 * mode, a wrong setting of the network origin every limit counts against
 * (ASTRO_PORTAL_CLIENT_IP_HEADER, ASTRO_PORTAL_TRUSTED_PROXIES). Settings
 * only, no database read.
 */
export function signInStartupProblems(env = process.env) {
  const modeProblem = authModeProblem(env);
  if (modeProblem) return [modeProblem];
  const mode = authMode(env);
  const origin = clientOriginProblems(clientOriginSettings(env));
  if (mode === "disabled") return origin;
  if (mode === PASSWORD_MODE) {
    const { signInKey } = spaceSignInConfiguration(env);
    return [
      ...new Set([...(signInKey ? [] : [SIGN_IN_KEY_PROBLEM]), ...origin]),
    ];
  }
  const extension = activeSignInExtension(env);
  if (extension)
    return [...new Set([...(extension.startupProblems?.() || []), ...origin])];
  return [
    ...new Set([
      ...privateSpaceSignInProblems(
        spaceSignInConfiguration(env, { allowPlainHttp: true }),
      ),
      ...origin,
    ]),
  ];
}

/**
 * What a private server says once in its log at start, as
 * `{ level, event, message }`: how its codes leave in the `email-code` mode
 * (the address of a mail server is never written, only its host and port),
 * and, in production, that its web session goes without `Secure` cookies
 * when `ASTRO_PORTAL_COOKIE_SECURE=false` says so.
 */
export function signInStartupNotices(env = process.env) {
  const mode = authMode(env);
  if (mode === "disabled" || activeSignInExtension(env)) return [];
  const notices = [];
  if (privateEmailCode(env)) {
    const settings = spaceSignInConfiguration(env, { allowPlainHttp: true });
    const how =
      settings.mailSender === "smtp"
        ? `by smtp through ${smtpDescription(settings)}`
        : settings.mailSender === "file"
          ? `to the fake mailbox ${settings.mailFileDir} (nothing leaves the machine)`
          : `by ${settings.mailSender}`;
    notices.push({
      level: "info",
      event: "sign-in.mail",
      message: `The sign-in codes of this private server are sent ${how}.`,
    });
  }
  if (
    env.NODE_ENV === "production" &&
    /^(0|false|no|off)$/i.test(
      String(env.ASTRO_PORTAL_COOKIE_SECURE ?? "").trim(),
    )
  )
    notices.push({
      level: "warn",
      event: "sign-in.cookies",
      message:
        "ASTRO_PORTAL_COOKIE_SECURE=false: the web session's cookies are not Secure, so a browser keeps them over plain http. For a private server of the local network only, never exposed to the Internet (docs/SELF_HOSTING.md).",
    });
  return notices;
}

/** Where a signed-out visitor of a private page is sent. */
export function signInPath(env = process.env) {
  const mode = authMode(env);
  if (mode === EMAIL_CODE_MODE)
    return activeSignInExtension(env)?.signInPath || "/auth/sign-in";
  return "/auth/login";
}
