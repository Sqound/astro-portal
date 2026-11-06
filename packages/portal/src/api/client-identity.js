/**
 * Which build of an application calls the service (`v1.md`, « Client
 * identity »): the header `X-PlanAstro-Client` the mobile application and
 * Astro Sync send to their portal, for example
 * `planastro-ios/1.0.4+126 (iOS 18.1)` or
 * `astro-sync-macos/1.0.0+6aa28f767 (macOS 15.1)`.
 *
 * `<product>/<version>[+<build>][ (<system>[ <system version>])]`: the
 * product in lowercase letters, digits and hyphens; the version, the build
 * and the system version in `[0-9A-Za-z._-]`, 40 characters at most each;
 * the system a word of letters. The whole header is 200 characters at most.
 * A value that is not of this form is ignored whole — never the reason a
 * request is refused, and never stored in part. It names nothing personal:
 * the service keeps the version and the system of each device to know which
 * builds are still in use.
 */
export const CLIENT_IDENTITY_HEADER = "x-planastro-client";

const MAX_LENGTH = 200;
const FORM =
  /^([a-z][a-z0-9-]{0,39})\/([0-9A-Za-z._-]{1,40})(?:\+([0-9A-Za-z._-]{1,40}))?(?: \(([A-Za-z]{1,20})(?: ([0-9A-Za-z._-]{1,40}))?\))?$/;

/** A header of a `Headers` or of Node's plain, lowercase-keyed object. */
function headerValue(headers, name) {
  const value = headers?.get ? headers.get(name) : headers?.[name];
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

/**
 * Reads a value of the header: `{ product, appVersion, osVersion }`, where
 * `appVersion` is `<version>[+<build>]` and `osVersion` `<system>[ <version>]`
 * (or `null` without the comment); `null` for a value that is not of the
 * form.
 */
export function parseClientIdentity(value) {
  const text = String(value ?? "").trim();
  if (!text || text.length > MAX_LENGTH) return null;
  const match = FORM.exec(text);
  if (!match) return null;
  const [, product, version, build, system, systemVersion] = match;
  return {
    product,
    appVersion: build ? `${version}+${build}` : version,
    osVersion: system
      ? systemVersion
        ? `${system} ${systemVersion}`
        : system
      : null,
  };
}

/** The client identity a request's headers name, or `null`. */
export function clientIdentityOf(headers) {
  return parseClientIdentity(headerValue(headers, CLIENT_IDENTITY_HEADER));
}
