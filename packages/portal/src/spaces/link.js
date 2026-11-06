/**
 * The link of the message (v1.md « The message and its link »):
 *
 *   https://<service>/auth/link#v=1&token=<linkToken>&code=<code>&expires=<date-time>&lang=<language>
 *
 * Everything is in the fragment, which a browser never sends: a visit of
 * the link (a mail scanner) reaches the service with nothing to use up.
 * Its one dependency is the locale registry (no server code), so that the
 * page of the link can read the fragment in the browser with the same code
 * the service writes it with.
 */
import { shippedLocaleOr, shippedLocales } from "astro-contracts/locales";

export const LINK_PATH = "/auth/link";

/** The languages a message and its link can be in: the shipped locales. */
export function signInLanguages() {
  return shippedLocales();
}

export function languageOf(value) {
  return shippedLocaleOr(value);
}

export function signInLink({ publicUrl, token, code, expiresAt, language }) {
  const fragment = new URLSearchParams({
    v: "1",
    token,
    code,
    expires: expiresAt,
    lang: languageOf(language),
  });
  return `${publicUrl}${LINK_PATH}#${fragment.toString()}`;
}

/** Reads a fragment (with or without its `#`); `null` when it is not one. */
export function parseSignInFragment(fragment) {
  const params = new URLSearchParams(String(fragment || "").replace(/^#/, ""));
  const token = params.get("token") || "";
  const code = params.get("code") || "";
  const expires = params.get("expires") || "";
  if (
    params.get("v") !== "1" ||
    !/^[A-Za-z0-9_-]{43}$/.test(token) ||
    !/^[0-9]{6}$/.test(code) ||
    Number.isNaN(Date.parse(expires))
  )
    return null;
  return {
    token,
    code,
    expires: new Date(expires).toISOString(),
    lang: languageOf(params.get("lang")),
  };
}
