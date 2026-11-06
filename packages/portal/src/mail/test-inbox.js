import { randomUUID } from "node:crypto";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { MailDeliveryError } from "./errors.js";

/**
 * The test inbox: a test-deployment-only way to sign in by e-mail code with
 * as many accounts as needed, without a real mailbox.
 *
 * A message addressed to the reserved test domain
 * (ASTRO_PORTAL_TEST_INBOX_DOMAIN, a `.test` domain: that top-level domain is
 * reserved by RFC 6761 and can never receive real mail) is not sent. It is
 * written as one JSON file under ASTRO_PORTAL_TEST_INBOX_DIR (to, subject,
 * text, the sign-in code, the link, the instant). Every other address goes
 * through the real sender, unchanged.
 *
 * Safety, in layers:
 *
 * - the routing exists only when BOTH settings are set; one without the
 *   other keeps the service from starting;
 * - the domain must end in `.test`;
 * - the service REFUSES TO START when the test inbox is set and the
 *   deployment is not affirmatively a test one: ASTRO_PORTAL_ENVIRONMENT
 *   must read `staging` (or `development`, `test`) — an allow-list, so a
 *   production that forgot to set it is refused too — and the public
 *   address must not be a production host (a host named `…-prod…`).
 *   `NODE_ENV` cannot tell the two apart: a test deployment may run with
 *   `NODE_ENV=production` as well;
 * - an address is diverted only when its domain, compared whole and in
 *   lower case, is the configured one (never a suffix, a look-alike, a
 *   second address);
 * - the files are purged after N days (3 by default), on every write;
 * - nothing of a message is ever logged.
 */
export const TEST_INBOX_DOMAIN_SETTING = "ASTRO_PORTAL_TEST_INBOX_DOMAIN";
export const TEST_INBOX_DIR_SETTING = "ASTRO_PORTAL_TEST_INBOX_DIR";
export const TEST_INBOX_RETENTION_SETTING =
  "ASTRO_PORTAL_TEST_INBOX_RETENTION_DAYS";
export const ENVIRONMENT_SETTING = "ASTRO_PORTAL_ENVIRONMENT";
export const DEFAULT_RETENTION_DAYS = 3;

/** The values of ASTRO_PORTAL_ENVIRONMENT under which the test inbox may run. */
export const TEST_INBOX_ENVIRONMENTS = ["staging", "development", "test"];

const text = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/** `a.b.test`: at least one label before `.test`, plain letters, digits, hyphens. */
const TEST_DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+test$/;

/**
 * The host names the operator declares as production ones, a comma- or
 * space-separated list in this setting: a plain name (`portal.example.org`)
 * or `*.example.org` for every subdomain of a domain (not the domain itself).
 */
export const PRODUCTION_HOSTS_SETTING = "ASTRO_PORTAL_PRODUCTION_HOSTS";

/**
 * A production host: a host named `…-prod…` or `…production…`, or one the
 * operator lists in ASTRO_PORTAL_PRODUCTION_HOSTS (a self-hosted server that
 * serves a test inbox or a re-run of the sky check on a staging copy must not
 * be mistaken for its own production).
 */
export function isProductionHost(host, env = process.env) {
  const name = String(host || "")
    .trim()
    .toLowerCase();
  if (!name) return false;
  for (const entry of String(env?.[PRODUCTION_HOSTS_SETTING] || "")
    .toLowerCase()
    .split(/[\s,]+/)) {
    if (!entry) continue;
    if (entry.startsWith("*.")) {
      if (name.endsWith(entry.slice(1))) return true;
    } else if (name === entry) return true;
  }
  return /(^|[.-])prod(uction)?([.-]|$)/.test(name);
}

function hostOf(value) {
  try {
    return new URL(String(value)).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function retentionDays(value) {
  const raw = text(value);
  if (raw === null) return DEFAULT_RETENTION_DAYS;
  if (!/^[0-9]+$/.test(raw)) return null;
  const days = Number(raw);
  return days >= 1 && days <= 365 ? days : null;
}

/**
 * The test inbox as the environment sets it: `domain` and `directory`
 * (`null` when not set), `retentionDays` (`null` when wrong), `active` when
 * both are set and valid. The environment's problems are `testInboxProblems`.
 */
export function testInboxSettings(env = process.env) {
  const domain = text(env[TEST_INBOX_DOMAIN_SETTING])?.toLowerCase() || null;
  const directory = text(env[TEST_INBOX_DIR_SETTING]);
  return {
    domain,
    directory: directory
      ? resolve(/* turbopackIgnore: true */ directory)
      : null,
    retentionDays: retentionDays(env[TEST_INBOX_RETENTION_SETTING]),
    active: Boolean(
      domain && TEST_DOMAIN.test(domain) && directory && isAbsolute(directory),
    ),
  };
}

/**
 * What keeps the service from starting with a test inbox, by setting name,
 * never by value. Empty when the test inbox is not configured at all.
 */
export function testInboxProblems(env = process.env) {
  const domain = text(env[TEST_INBOX_DOMAIN_SETTING]);
  const directory = text(env[TEST_INBOX_DIR_SETTING]);
  if (!domain && !directory) return [];
  const problems = [];
  if (!domain || !directory)
    problems.push(
      `${TEST_INBOX_DOMAIN_SETTING} and ${TEST_INBOX_DIR_SETTING} are set together or not at all`,
    );
  if (domain && !TEST_DOMAIN.test(domain.toLowerCase()))
    problems.push(
      `${TEST_INBOX_DOMAIN_SETTING} (a domain ending in .test, such as audit.example.test)`,
    );
  if (directory && !isAbsolute(directory))
    problems.push(`${TEST_INBOX_DIR_SETTING} (an absolute path)`);
  if (retentionDays(env[TEST_INBOX_RETENTION_SETTING]) === null)
    problems.push(
      `${TEST_INBOX_RETENTION_SETTING} (a whole number of days, 1 to 365)`,
    );
  const environment = text(env[ENVIRONMENT_SETTING])?.toLowerCase() || null;
  if (!TEST_INBOX_ENVIRONMENTS.includes(environment))
    problems.push(
      `the test inbox is refused outside a test deployment (${ENVIRONMENT_SETTING} must be ${TEST_INBOX_ENVIRONMENTS.join(", ")}; unset it on production)`,
    );
  const publicHost = hostOf(env.ASTRO_PORTAL_PUBLIC_URL);
  if (publicHost && isProductionHost(publicHost, env))
    problems.push(
      `the test inbox is refused on a production address (ASTRO_PORTAL_PUBLIC_URL)`,
    );
  return problems;
}

/**
 * The normalized address when `to` is exactly one address of the test
 * domain, `null` otherwise. The domain is compared whole: `x@audit.test.evil.com`,
 * `x@evil-audit.test`, `x@audit.test.`, two addresses, a name with angle
 * brackets are not the test domain. Case and plus-addressing do not matter.
 */
export function testInboxRecipient(to, domain) {
  if (typeof to !== "string" || !domain) return null;
  const address = to.trim().toLowerCase();
  const match = /^([^\s@,;<>"'()[\]\\:]+)@([a-z0-9.-]+)$/.exec(address);
  if (!match || match[2] !== domain.toLowerCase()) return null;
  return address;
}

/** The part of a file name that tells the recipient: readable, safe on every file system. */
export function testInboxSlug(address) {
  return String(address)
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "_");
}

/** `2026-10-19T12-00-00-000Z-<slug>-<id>.json`, the sentAt first so that names sort by time. */
export function testInboxFileName({ sentAt, address, id }) {
  return `${sentAt.replace(/[:.]/g, "-")}__${testInboxSlug(address)}__${id}.json`;
}

/** The instant a file name carries, or `null`. */
export function testInboxNameInstant(name) {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3}Z)__/.exec(
    name,
  );
  return match ? `${match[1]}:${match[2]}:${match[3]}.${match[4]}` : null;
}

/** The sign-in code of a message: the one the service gave, else six digits of the text. */
export function extractCode({ meta, text: body }) {
  if (typeof meta?.code === "string" && /^[0-9]{4,10}$/.test(meta.code))
    return meta.code;
  const found = /(?<![0-9])[0-9]{6}(?![0-9])/.exec(String(body || ""));
  return found ? found[0] : null;
}

const MESSAGE_FILE = /^\d{4}-\d{2}-\d{2}T[0-9-]+Z__.+\.json$/;
const PART_FILE = /^\..+\.part$/;
const DAY_MS = 86_400_000;

/** Deletes the files of this inbox older than `days`; never raises. */
export async function purgeTestInbox(directory, days, now = new Date()) {
  let names;
  try {
    names = await readdir(directory);
  } catch {
    return 0;
  }
  const limit = now.getTime() - days * DAY_MS;
  let removed = 0;
  for (const name of names) {
    if (!MESSAGE_FILE.test(name) && !PART_FILE.test(name)) continue;
    try {
      const { mtimeMs } = await stat(join(directory, name));
      if (mtimeMs < limit) {
        await rm(join(directory, name), { force: true });
        removed += 1;
      }
    } catch {
      // Gone meanwhile, or unreadable: the next write tries again.
    }
  }
  return removed;
}

/**
 * The sender that diverts the addresses of the test domain to the inbox and
 * hands every other message, untouched, to `real`. `null` when the test inbox
 * is not active, or when there is no real sender to hand the rest to.
 */
export function withTestInbox(
  real,
  settings,
  { clock = () => new Date() } = {},
) {
  if (!real || !settings?.active) return real;
  const { domain, directory, retentionDays: days } = settings;
  return {
    ...real,
    kind: real.kind,
    testInbox: { domain },
    async send(message) {
      const address = testInboxRecipient(message?.to, domain);
      if (!address) return real.send(message);
      const now = clock();
      const sentAt = now.toISOString();
      const id = randomUUID();
      const name = testInboxFileName({ sentAt, address, id });
      const part = join(directory, `.${name}.part`);
      const record = {
        id,
        sentAt,
        to: address,
        subject: message.subject,
        text: message.text,
        code: extractCode(message),
        ...(typeof message.meta?.link === "string"
          ? { link: message.meta.link }
          : {}),
      };
      try {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await purgeTestInbox(directory, days, now);
        await writeFile(part, `${JSON.stringify(record, null, 2)}\n`, {
          mode: 0o600,
          flag: "wx",
        });
        await rename(part, join(directory, name));
      } catch (error) {
        await rm(part, { force: true }).catch(() => {});
        throw new MailDeliveryError(
          `The test inbox could not be written (${error?.code || "error"}).`,
        );
      }
      return { accepted: true, testInbox: true, file: name };
    },
  };
}
