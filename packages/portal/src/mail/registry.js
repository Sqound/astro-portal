/**
 * The senders of e-mail an extension adds to the core's own (`file`, the
 * fake mailbox, and `smtp`, docs/PRIVATE_NOTEBOOK_AUTH.md). The core never
 * imports such a sender; it only reads this registry, the inversion
 * `auth/sign-in-extension.js` applies to a sign-in mode.
 *
 * The registry lives on `globalThis` under a registered symbol, for the
 * reason `auth/sign-in-extension.js` gives: Next.js bundles a server module
 * once per compilation layer, and one registration must be seen by all.
 *
 * A sender is a plain object:
 *
 * - `kind`: the value of ASTRO_PORTAL_MAIL_SENDER it answers;
 * - `settings(env)`: its own settings, read from the environment and merged
 *   into the configuration of the sign-in (secret values stay in memory,
 *   never in a log or an answer);
 * - `problems(configuration)`: what keeps it from sending, by setting name,
 *   never by value;
 * - `create(configuration, options)`: the sender (`{ kind, send(message) }`),
 *   or `null` when its settings are incomplete.
 */
const registryKey = Symbol.for("astro-portal.mail-senders");

function registry() {
  if (!(globalThis[registryKey] instanceof Map))
    globalThis[registryKey] = new Map();
  return globalThis[registryKey];
}

/** The kinds the core provides itself, and `disabled`: never registered. */
export const CORE_MAIL_SENDERS = ["file", "smtp"];
const reserved = new Set([...CORE_MAIL_SENDERS, "disabled", "invalid"]);

export function registerMailSender(sender) {
  const kind = String(sender?.kind || "");
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(kind) || reserved.has(kind))
    throw new Error(`A mail sender needs its own name, not "${kind}".`);
  for (const member of ["settings", "problems", "create"])
    if (typeof sender[member] !== "function")
      throw new Error(`The mail sender "${kind}" lacks ${member}().`);
  registry().set(kind, sender);
  return sender;
}

/** The sender registered under `kind`, or `null`. */
export function registeredMailSender(kind) {
  return registry().get(String(kind || "")) || null;
}

/** Every registered sender, in the order of registration. */
export function registeredMailSenders() {
  return [...registry().values()];
}

/** Tests only: forgets every registration. */
export function clearMailSenders() {
  registry().clear();
}
