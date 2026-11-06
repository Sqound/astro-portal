/**
 * The settings of the `smtp` sender (docs/PRIVATE_NOTEBOOK_AUTH.md,
 * « Sending the codes »), read without the mail library, so that the
 * service can check them at start:
 *
 * - ASTRO_PORTAL_SMTP_URL: `smtps://user:password@host:465` (TLS from the
 *   first byte) or `smtp://user:password@host:587` (STARTTLS, required
 *   unless ASTRO_PORTAL_SMTP_ALLOW_INSECURE=1). A user name or a password
 *   holding `@`, `:` or `/` is written percent-encoded (`%40`, `%3A`, `%2F`).
 *   The address holds the password: it is never written to a log, an
 *   answer or a problem; the log names the host and the port only.
 * - ASTRO_PORTAL_SMTP_ALLOW_INSECURE=1: a relay of the local network that
 *   offers no TLS, or a certificate that cannot be verified. Never for a
 *   server reached across the Internet.
 * - ASTRO_PORTAL_MAIL_FROM: the sender address of every message.
 */
export const SMTP_URL_SETTING = "ASTRO_PORTAL_SMTP_URL";
export const SMTP_ALLOW_INSECURE_SETTING = "ASTRO_PORTAL_SMTP_ALLOW_INSECURE";
const DEFAULT_PORTS = { "smtps:": 465, "smtp:": 587 };

const text = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export function smtpSettings(env = process.env) {
  return {
    smtpUrl: text(env[SMTP_URL_SETTING]),
    smtpAllowInsecure: text(env[SMTP_ALLOW_INSECURE_SETTING]) === "1",
  };
}

/**
 * The server an `smtp://` or `smtps://` address names: host, port, whether
 * TLS starts at once, and the credentials. Throws an error that repeats
 * nothing of the address (it holds the password).
 */
export function parseSmtpUrl(value) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    url = null;
  }
  if (!url || !(url.protocol in DEFAULT_PORTS) || !url.hostname)
    throw new Error(
      `${SMTP_URL_SETTING} must read smtps://user:password@host:465 or smtp://user:password@host:587.`,
    );
  const decode = (part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      throw new Error(
        `${SMTP_URL_SETTING} holds a user name or a password that is not correctly percent-encoded.`,
      );
    }
  };
  const user = url.username ? decode(url.username) : null;
  return {
    host: url.hostname.replace(/^\[(.*)\]$/, "$1"),
    port: Number(url.port) || DEFAULT_PORTS[url.protocol],
    secure: url.protocol === "smtps:",
    user,
    pass: user ? decode(url.password) : null,
  };
}

/** What keeps `smtp` from sending, by setting name, never by value. */
export function smtpProblems(configuration) {
  const problems = [];
  if (!configuration.smtpUrl)
    problems.push(
      `${SMTP_URL_SETTING} (smtps://user:password@host:465, or smtp://user:password@host:587 with STARTTLS)`,
    );
  else
    try {
      parseSmtpUrl(configuration.smtpUrl);
    } catch {
      problems.push(
        `${SMTP_URL_SETTING} (smtps://user:password@host:465, or smtp://user:password@host:587 with STARTTLS)`,
      );
    }
  if (!configuration.mailFrom) problems.push("ASTRO_PORTAL_MAIL_FROM");
  return problems;
}

/**
 * The server, as a log may name it: host and port, and how the connection
 * is protected. Never the user name, never the password.
 */
export function smtpDescription(configuration) {
  try {
    const server = parseSmtpUrl(configuration.smtpUrl);
    const protection = configuration.smtpAllowInsecure
      ? server.secure
        ? "TLS, certificate not verified"
        : "STARTTLS when offered, not required, certificate not verified"
      : server.secure
        ? "TLS"
        : "STARTTLS required";
    return `${server.host}:${server.port} (${protection})`;
  } catch {
    return "no valid server";
  }
}
