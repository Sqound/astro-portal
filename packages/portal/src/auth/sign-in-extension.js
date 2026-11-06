/**
 * The seam through which a sign-in method that is not part of the core
 * takes a mode of it over. The
 * core has three modes of ASTRO_PORTAL_AUTH_MODE (auth/modes.js):
 * `disabled`, `password` and `email-code`, whose own version is a private
 * server's, for one person. An extension may take `email-code` over — for a
 * server where any address gets a space — never `disabled` nor `password`. The core never imports
 * such a package: it only reads this registry, the same inversion
 * `account/extensions.js` and `planner/extensions.ts` apply to user-interface
 * blocks.
 *
 * The registry lives on `globalThis` under a registered symbol rather than
 * in a module-level variable. Next.js bundles a server module once per
 * compilation layer (route handlers, server components…), so a module-level
 * map registered from one layer would be empty in another (a problem that
 * already showed on the account page). The process-wide symbol makes one
 * registration, done at process start, visible to every
 * copy of this module.
 *
 * An extension is a plain object:
 *
 * - `mode`: the value of `ASTRO_PORTAL_AUTH_MODE` it takes over
 *   (`email-code`);
 * - `enabled(env)`, optional: whether it takes the mode over with these
 *   settings (ASTRO_PORTAL_HOSTED_SPACES=off hands the mode back to the
 *   core's private server); absent, always;
 * - `announcement(env)`: the `signIn` object of `GET /v1/service`;
 * - `signInPath`: the web page a signed-out visitor of a private page is
 *   sent to;
 * - `administrationAllowed({ session })`: whether the person of this web
 *   session may use the administration of the service;
 * - `refusedCredential({ tokenHash })`, optional: why a device token or a
 *   web session the core does not recognise is refused, as
 *   `{ code, message, status }`, or `null` for the core's own anonymous
 *   refusal. `tokenHash` is the SHA-256 digest the core keeps of the
 *   credential. An extension may answer `space_deleted` for a
 *   credential of a deleted space;
 * - `startupProblems()`, optional: the settings, by name, without which
 *   the service must not start in this mode; `server.mjs` refuses to start
 *   while the list is not empty.
 */
const registryKey = Symbol.for("astro-portal.sign-in-extensions");

function registry() {
  if (!(globalThis[registryKey] instanceof Map))
    globalThis[registryKey] = new Map();
  return globalThis[registryKey];
}

/** The modes an extension may take over. */
export const EXTENSIBLE_MODES = new Set(["email-code"]);

export function registerSignInExtension(extension) {
  const mode = String(extension?.mode || "");
  if (!EXTENSIBLE_MODES.has(mode))
    throw new Error(
      `A sign-in extension may take over ${[...EXTENSIBLE_MODES].join(", ")}, not "${mode}".`,
    );
  for (const member of ["announcement", "administrationAllowed"])
    if (typeof extension[member] !== "function")
      throw new Error(`The sign-in extension "${mode}" lacks ${member}().`);
  for (const member of ["refusedCredential", "startupProblems", "enabled"])
    if (
      extension[member] !== undefined &&
      typeof extension[member] !== "function"
    )
      throw new Error(
        `The sign-in extension "${mode}" has a ${member} that is not a function.`,
      );
  if (typeof extension.signInPath !== "string" || !extension.signInPath)
    throw new Error(`The sign-in extension "${mode}" lacks its signInPath.`);
  registry().set(mode, extension);
  return extension;
}

/**
 * The extension registered for `mode` and enabled with the settings `env`,
 * or `null`.
 */
export function signInExtension(mode, env = process.env) {
  const extension = registry().get(String(mode || "")) || null;
  if (!extension) return null;
  return typeof extension.enabled !== "function" || extension.enabled(env)
    ? extension
    : null;
}

/** Tests only: forgets every registration. */
export function clearSignInExtensions() {
  registry().clear();
}
