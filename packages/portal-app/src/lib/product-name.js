/**
 * The configurable product name: the web portal has always shown
 * "Astro Portal" in its own UI, hard-coded. A single place configures the *displayed* name per deployment — never the technical
 * identifiers (package names, cookies, storage keys, headers, user-agent, `ASTRO_PORTAL_*` variable names themselves), only
 * what a visitor reads.
 *
 * `defaultProductName` is the exact current, hard-coded name: an
 * unconfigured deployment must render byte-for-byte what it always has.
 */
export const defaultProductName = "Astro Portal";

/**
 * A product name is shown in several single-line contexts at once — a page
 * title, an Open Graph tag, an authenticator app's issuer string, an
 * iCalendar `SUMMARY` line — none of which has a safe way to render an
 * embedded newline or other control character, and none of which should be
 * allowed to grow without bound from a stray environment value. This is the
 * one place that resolves a raw candidate (an env var, a `portal.config.json`
 * field) down to a value every one of those contexts can use as-is.
 *
 * - not a non-empty string (missing, not a string, or blank/whitespace-only
 *   after trimming) → {@link defaultProductName}, so an unconfigured or
 *   misconfigured deployment shows no visible change at all;
 * - control characters (including newlines/tabs, matched with a hex-escaped
 *   `\x00-\x1f`/`\x7f` range rather than `\uXXXX`, which some formatters
 *   rewrite as literal raw bytes) and any run of internal whitespace collapse
 *   to a single plain space — a deployment's own value never breaks out of
 *   the single-line field it is placed into;
 * - the result is capped at {@link maxProductNameLength} characters, well
 *   past what a page title or header actually has room for.
 *
 * @param {unknown} value
 * @returns {string}
 */
export const maxProductNameLength = 60;

export function normalizedProductName(value) {
  if (typeof value !== "string") return defaultProductName;
  const collapsed = value
    .replace(/[\x00-\x1f\x7f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return collapsed
    ? collapsed.slice(0, maxProductNameLength)
    : defaultProductName;
}
