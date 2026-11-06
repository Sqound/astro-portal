import { join, resolve } from "node:path";
import {
  clientIpHeaderSetting,
  clientOriginProblems,
  trustedProxiesSetting,
} from "../api/client-origin.js";
import { mailSettings, mailSettingsProblems } from "../mail/settings.js";
import { isSecureOrLocalUrl } from "./urls.js";

/**
 * The settings of the sign-in by e-mail code (docs/PRIVATE_NOTEBOOK_AUTH.md,
 * « Settings »), read from the environment, shared by a private server
 * (`spaceCreation: "closed"`) and a server that opens spaces
 * (`spaceCreation: "open"`). Secret values
 * are held here only as far as the code needs them and never written to a
 * log or an answer.
 *
 * `allowPlainHttp`: a private server may name an `http` address of its own
 * network as its public address (urls.js); a server that opens spaces may not.
 */

/**
 * The e-mail budget of the whole service, set below the usual limits of a
 * sending service, so that their limit is never what refuses.
 */
export const DEFAULT_MAIL_HOURLY_BUDGET = 80;
export const DEFAULT_MAIL_MINUTE_BUDGET = 20;

const text = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

function publicOrigin(value, allowPlainHttp) {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (isSecureOrLocalUrl(url)) return url.origin;
    return allowPlainHttp && url.protocol === "http:" && url.hostname
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

function signInKey(value) {
  const raw = text(value);
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
}

/** A whole number from 1 to `maximum`, `fallback` when absent, `null` when wrong. */
function count(value, fallback, maximum) {
  const raw = text(value);
  if (raw === null) return fallback;
  if (!/^[0-9]+$/.test(raw)) return null;
  const number = Number(raw);
  return number >= 1 && number <= maximum ? number : null;
}

/** The directory the service writes its runtime data to. */
export function runtimeDirectory(env = process.env, runtimeDir = null) {
  // A path of the runtime, never of the source: kept out of the bundler's
  // file tracing, as portal-app/lib/config.server.js does for its own.
  return resolve(
    /* turbopackIgnore: true */ text(env.ASTRO_PORTAL_RUNTIME_DIR) ||
      runtimeDir ||
      join(process.cwd(), ".astro-portal"),
  );
}

export function spaceSignInConfiguration(
  env = process.env,
  { runtimeDir = null, allowPlainHttp = false } = {},
) {
  const runtime = runtimeDirectory(env, runtimeDir);
  return {
    allowPlainHttp,
    publicUrl: publicOrigin(env.ASTRO_PORTAL_PUBLIC_URL, allowPlainHttp),
    signInKey: signInKey(env.ASTRO_PORTAL_SIGN_IN_KEY),
    ...mailSettings(env, { runtime }),
    mailHourlyBudget: count(
      env.ASTRO_PORTAL_MAIL_HOURLY_BUDGET,
      DEFAULT_MAIL_HOURLY_BUDGET,
      100_000,
    ),
    mailMinuteBudget: count(
      env.ASTRO_PORTAL_MAIL_MINUTE_BUDGET,
      DEFAULT_MAIL_MINUTE_BUDGET,
      100_000,
    ),
    // Read by the core's `clientOrigin`, like every limit of the service:
    // the same two settings, parsed in one place.
    clientIpHeader: clientIpHeaderSetting(env.ASTRO_PORTAL_CLIENT_IP_HEADER),
    trustedProxies: trustedProxiesSetting(env.ASTRO_PORTAL_TRUSTED_PROXIES),
    productName: text(env.ASTRO_PORTAL_PRODUCT_NAME) || "Astro Portal",
  };
}

/** The key of the codes, the throttles and the recovery codes, by name. */
export const SIGN_IN_KEY_PROBLEM =
  "ASTRO_PORTAL_SIGN_IN_KEY (32 bytes, base64)";

/**
 * What keeps codes from being sent, by setting name — never by value,
 * besides the network origin (which a composition checks at start): the
 * public address, the key, the sender and the budget. An empty list means
 * the sign-in by e-mail code can work.
 */
export function spaceSignInProblems(configuration) {
  const problems = [];
  if (!configuration.publicUrl)
    problems.push(
      configuration.allowPlainHttp
        ? "ASTRO_PORTAL_PUBLIC_URL (the address of this portal, as its owner opens it: https://… or http://…)"
        : "ASTRO_PORTAL_PUBLIC_URL (an https address; http only for localhost, 127.0.0.1 or [::1])",
    );
  if (!configuration.signInKey) problems.push(SIGN_IN_KEY_PROBLEM);
  problems.push(...mailSettingsProblems(configuration));
  if (configuration.mailHourlyBudget === null)
    problems.push(
      "ASTRO_PORTAL_MAIL_HOURLY_BUDGET (a whole number, 1 or more)",
    );
  if (configuration.mailMinuteBudget === null)
    problems.push(
      "ASTRO_PORTAL_MAIL_MINUTE_BUDGET (a whole number, 1 or more)",
    );
  return problems;
}

/**
 * The same, the network origin first: a private server's own check, which
 * keeps it from starting. It names the settings of a sender when none is
 * chosen: a private server in the `email-code` mode cannot be opened
 * without one.
 */
export function privateSpaceSignInProblems(configuration) {
  return [
    ...clientOriginProblems(configuration),
    ...spaceSignInProblems(configuration).map((problem) =>
      problem === "ASTRO_PORTAL_MAIL_SENDER is disabled"
        ? "ASTRO_PORTAL_MAIL_SENDER (smtp, with ASTRO_PORTAL_SMTP_URL and ASTRO_PORTAL_MAIL_FROM; or file, the fake mailbox, for a test): without a sender no code can be sent"
        : problem,
    ),
  ];
}
