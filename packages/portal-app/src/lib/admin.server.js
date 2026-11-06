import { connectionAddress } from "portal/api/client-origin.js";
import { adminAllowedIps } from "./config.server.js";
import { authEnabled, authService, hostedSignInMode } from "./auth.server.js";

/**
 * The address of the connection itself is what the administration's
 * allowlist reads (`connectionAddress`). It is an access rule, not a limit:
 * it never follows the settings that place a visitor behind a proxy
 * (`ASTRO_PORTAL_CLIENT_IP_HEADER`), so that a header a client can write
 * never opens the administration.
 */
function normalizeIp(value) {
  const first = String(value || "")
    .split(",")[0]
    .trim();
  return first.startsWith("::ffff:") ? first.slice(7) : first;
}

function ipv4Number(value) {
  const parts = value.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  )
    return null;
  return parts.reduce((result, part) => (result * 256 + part) >>> 0, 0);
}

function matchesRule(ip, rule) {
  if (!rule.includes("/")) return normalizeIp(rule) === ip;
  const [network, prefixText] = rule.split("/");
  const address = ipv4Number(ip);
  const networkAddress = ipv4Number(network);
  const prefix = Number(prefixText);
  if (
    address === null ||
    networkAddress === null ||
    !Number.isInteger(prefix) ||
    prefix < 0 ||
    prefix > 32
  )
    return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (address & mask) === (networkAddress & mask);
}

export function adminAccess(headers) {
  const cloudflare = Boolean(
    headers.get("cf-ray") || headers.get("cf-connecting-ip"),
  );
  const ip = normalizeIp(connectionAddress(headers));
  const local = ip === "127.0.0.1" || ip === "::1";
  const allowed =
    !cloudflare &&
    (local || adminAllowedIps.some((rule) => matchesRule(ip, rule)));
  return { allowed, ip, cloudflare };
}

// A private sign-in replaces the deployment-specific IP allowlist when it is
// enabled. The legacy local/IP restriction remains the only gate when
// authentication is off.
// Where the one session is its owner's, that person administers the server;
// where every person owns a space, only the addresses the service names may
// administer it (`administrationAllowed`).
/**
 * Whether a page of the administration may render for this request. With a
 * single-owner sign-in the pages rely on server.mjs, its single page gate
 * (rechecking in Next can see another request context after the outer gate
 * passed). Where every person owns a space, being signed in is not enough —
 * the person must administer the service — so the page asks exactly what
 * the administration's API asks.
 */
export async function adminPageAccess(headers) {
  if (authEnabled() && !hostedSignInMode()) return { allowed: true, ip: "" };
  return adminAuthorization(headers);
}

export async function adminAuthorization(headers) {
  if (!authEnabled()) return adminAccess(headers);
  const ip = normalizeIp(connectionAddress(headers));
  try {
    const service = authService();
    const session = await service.session(headers);
    const allowed =
      Boolean(session) && (await service.administrationAllowed(session));
    return { allowed, ip, session, authenticated: true };
  } catch {
    return { allowed: false, ip, session: null, authenticated: true };
  }
}
