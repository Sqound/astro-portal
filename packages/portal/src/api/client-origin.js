import { isIP } from "node:net";

/**
 * The network origin of a visitor: the one function every limit of the
 * service counts against. Whatever a limit protects — a sign-in, a pairing code, a log, a preparation — it
 * asks this module, never a header of its own, so that a visitor is one
 * origin everywhere and two visitors behind the same proxy are two.
 *
 * Two settings say where the address of a visitor is read:
 *
 * - `ASTRO_PORTAL_CLIENT_IP_HEADER` (`clientIpHeader`):
 *   - absent or `socket`: the connection's own address, which server.mjs
 *     writes into `x-astro-client-ip` for every request and never takes
 *     from the caller — a private server, development, or a service reached
 *     without a proxy;
 *   - `x-forwarded-for`: the value `ASTRO_PORTAL_TRUSTED_PROXIES` places
 *     from the right (1: the right-most, the one the platform's proxy
 *     appended), never one further left, which a client could have written
 *     itself; a header holding fewer values was not written by those
 *     proxies, and the connection's address counts instead;
 *   - any other header (`cf-connecting-ip`): its one value, which the proxy
 *     writes over whatever a client sent — only when nothing but that proxy
 *     can reach the service; a header holding several values was not
 *     written by that proxy alone, and the connection's address counts;
 * - `ASTRO_PORTAL_TRUSTED_PROXIES` (`trustedProxies`): how many proxies in
 *   front of the service append to `x-forwarded-for`; 1 by default.
 *
 * An IPv4 address counts whole, an IPv6 address by its /64 (one subscriber
 * usually holds a whole /64), an IPv4-mapped IPv6 address as its IPv4.
 * Anything that is not an address counts as one origin, `unknown`, so that
 * made-up values cannot each get a limit of their own.
 */

/** `socket`: the address of the connection itself. */
export const SOCKET_ORIGIN = "socket";
export const CLIENT_IP_HEADER_SETTING = "ASTRO_PORTAL_CLIENT_IP_HEADER";
export const TRUSTED_PROXIES_SETTING = "ASTRO_PORTAL_TRUSTED_PROXIES";
/** What the setting may name, for the messages that ask for it. */
export const CLIENT_IP_HEADER_CHOICES =
  "x-forwarded-for, cf-connecting-ip, another header set by the proxy, or socket for development";

const text = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/**
 * The header naming the client, lowercase; `socket`; `null` when the
 * setting is absent; `invalid` when it is neither a header name nor
 * `socket` (the service then counts the connection's address, and says at
 * startup that the setting is wrong).
 */
export function clientIpHeaderSetting(value) {
  const raw = text(value)?.toLowerCase() || null;
  if (!raw) return null;
  return raw === SOCKET_ORIGIN || /^[a-z0-9-]+$/.test(raw) ? raw : "invalid";
}

/** A whole number from 1 to 10: 1 when absent, `null` when wrong. */
export function trustedProxiesSetting(value) {
  const raw = text(value);
  if (raw === null) return 1;
  if (!/^[0-9]+$/.test(raw)) return null;
  const number = Number(raw);
  return number >= 1 && number <= 10 ? number : null;
}

/**
 * The two settings, read from the environment: `{ clientIpHeader,
 * trustedProxies }`, the shape `clientOrigin` reads.
 */
export function clientOriginSettings(env = process.env) {
  return {
    clientIpHeader: clientIpHeaderSetting(env[CLIENT_IP_HEADER_SETTING]),
    trustedProxies: trustedProxiesSetting(env[TRUSTED_PROXIES_SETTING]),
  };
}

/**
 * The settings that are wrong, by setting name and never by value, for the
 * startup check of the service: an empty list means every limit can count
 * per visitor.
 */
export function clientOriginProblems(settings) {
  const problems = [];
  if (settings?.clientIpHeader === "invalid")
    problems.push(`${CLIENT_IP_HEADER_SETTING} (a header name, or socket)`);
  if (settings?.trustedProxies === null)
    problems.push(`${TRUSTED_PROXIES_SETTING} (a whole number from 1 to 10)`);
  return problems;
}

/** The eight groups of a valid IPv6 address, an embedded IPv4 included. */
function ipv6Groups(address) {
  let value = address;
  const embedded = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
  if (embedded) {
    const [a, b, c, d] = embedded[1].split(".").map(Number);
    value = `${value.slice(0, -embedded[1].length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = value.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const fill =
    tail === undefined ? [] : Array(8 - left.length - right.length).fill("0");
  return [...left, ...fill, ...right].map((group) => parseInt(group, 16));
}

/**
 * An address as the limits count it (see above). A port or brackets are
 * dropped; an empty value stays empty (no address was reported).
 */
export function originKey(value) {
  let address = String(value || "").trim();
  if (!address) return "";
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(address);
  if (bracketed) address = bracketed[1];
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(address))
    address = address.replace(/:\d+$/, "");
  address = address.replace(/%.*$/, "").toLowerCase();
  const kind = isIP(address);
  if (kind === 4) return address;
  if (kind !== 6) return "unknown";
  const groups = ipv6Groups(address);
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff)
    return [groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255]
      .map(String)
      .join(".");
  return `${groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(":")}::/64`;
}

/** A header of a `Headers` or of Node's plain, lowercase-keyed object. */
function headerValue(headers, name) {
  const value = headers?.get ? headers.get(name) : headers?.[name];
  return Array.isArray(value) ? value.join(", ") : String(value ?? "");
}

/**
 * The connection's own address, as server.mjs wrote it — raw, neither
 * grouped nor read from a header a caller can write. For an access rule (the
 * administration's allowlist of addresses), never for a limit: a limit asks
 * `clientOrigin`.
 */
export function connectionAddress(headers) {
  return headerValue(headers, "x-astro-client-ip");
}

/**
 * The network origin a limit is counted against, from the headers of a
 * request (a `Headers`, or Node's `request.headers`) and the two settings.
 * Without settings — a private server, development — it is the
 * connection's own address.
 */
export function clientOrigin(headers, settings = {}) {
  const name = settings?.clientIpHeader;
  const socket = headerValue(headers, "x-astro-client-ip");
  if (!name || name === SOCKET_ORIGIN || name === "invalid")
    return originKey(socket);
  const entries = headerValue(headers, name)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (name === "x-forwarded-for") {
    const position = entries.length - (settings.trustedProxies || 1);
    return originKey(position >= 0 ? entries[position] : socket);
  }
  return originKey(entries.length === 1 ? entries[0] : socket);
}

/**
 * The network origin of a request, as the environment's settings say — what
 * the limits of the routes call; `unknown` when no address was reported.
 * Read at each call: two short values, so that a changed environment (a
 * test) is never stale.
 */
export function requestOrigin(request, env = process.env) {
  return clientOrigin(request.headers, clientOriginSettings(env)) || "unknown";
}
