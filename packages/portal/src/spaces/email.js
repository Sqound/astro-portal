import { domainToASCII } from "node:url";

/**
 * An address as typed becomes the address of a space, in one form only,
 * so that two spellings of
 * one address never open two spaces and an invisible character never makes
 * an address look like another:
 *
 * - composed Unicode (NFC);
 * - the white space typed or pasted around or inside removed (spaces,
 *   tabs, line breaks, the no-break and ideographic spaces);
 * - any other control or formatting character refused (U+0000–U+001F,
 *   U+007F, U+200B–U+200F, U+202A–U+202E, U+2060–U+206F, U+FEFF);
 * - the local part in ASCII « dot-atom » (RFC 5322), 64 characters at most,
 *   lowercased; no dot or `+` rule of any provider;
 * - the domain in punycode (IDNA), lowercase, without its final dot, with
 *   at least two labels of letters, digits and inner hyphens, the last one
 *   not all digits (no network address);
 * - 254 characters at most.
 *
 * `normalizeEmail` returns that form, or "" when the address cannot have
 * one; `isValidEmail` says whether a string is that form.
 */
// Written as escapes on purpose: the characters themselves are invisible.
const WHITE_SPACE = new RegExp(
  "[\\u0009\\u000a\\u000d\\u0020\\u00a0\\u3000]",
  "gu",
);
const HIDDEN = new RegExp(
  "[\\u0000-\\u001f\\u007f\\u200b-\\u200f\\u202a-\\u202e\\u2060-\\u206f\\ufeff]",
  "u",
);
const ATEXT = "a-z0-9!#$%&'*+/=?^_`{|}~-";
const LOCAL_PART = new RegExp(`^[${ATEXT}]+(?:\\.[${ATEXT}]+)*$`);
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function normalizeEmail(value) {
  if (typeof value !== "string") return "";
  const typed = value.normalize("NFC").replace(WHITE_SPACE, "");
  if (HIDDEN.test(typed)) return "";
  const at = typed.lastIndexOf("@");
  if (at <= 0 || typed.indexOf("@") !== at) return "";
  const local = typed.slice(0, at).toLowerCase();
  const domain = domainToASCII(typed.slice(at + 1).replace(/\.$/, ""));
  if (!domain) return "";
  return `${local}@${domain.toLowerCase()}`;
}

/** The one form of an address, as `normalizeEmail` writes it. */
export function isValidEmail(email) {
  if (typeof email !== "string" || email.length > 254) return false;
  const at = email.indexOf("@");
  if (at <= 0 || email.indexOf("@", at + 1) !== -1) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const labels = domain.split(".");
  return (
    local.length <= 64 &&
    LOCAL_PART.test(local) &&
    domain.length <= 253 &&
    labels.length >= 2 &&
    labels.every((label) => LABEL.test(label)) &&
    // A name, never a network address written without its brackets.
    !/^[0-9]+$/.test(labels[labels.length - 1])
  );
}

/**
 * `vous@exemple.fr` → `v…@exemple.fr`: the other space's address, shown
 * without revealing it (space-devices.schema.json `maskedEmail`).
 */
export function maskEmail(email) {
  const at = email.indexOf("@");
  return at > 0 ? `${email[0]}…${email.slice(at)}` : "…";
}
