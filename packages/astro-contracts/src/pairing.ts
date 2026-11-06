/**
 * The QR code shown next to a pairing code on the account page's pairing
 * panel (a small scan icon, to the right of the input, opens the QR code
 * scan). It reuses
 * the `qrcode` package already imported for the TOTP bootstrap enrollment's
 * own QR (`packages/portal/src/components/auth/AuthPage.js`) -- this module
 * only builds the *payload* that gets encoded, not the QR image itself.
 *
 * Format (v1, documented in `schemas/api/v1.md`'s "Device pairing" section):
 *
 *     planastro-pair://v1?origin=<origin, percent-encoded>&code=<code>
 *
 * Deliberately carries nothing else: no durable token, no account
 * identifier, nothing that outlives the pairing code itself. `origin` is
 * exactly `window.location.origin` as the browser reports it -- the mobile
 * side never has to guess a path or a port -- and `code` is the same
 * eight-character Crockford base32 challenge already shown as text
 * (`device-pairing.schema.json`'s own `pairing.code` pattern).
 */

/** The scheme and version token every payload this module builds carries. */
export const PAIRING_QR_SCHEME = "planastro-pair";
export const PAIRING_QR_VERSION = "v1";

/** The exact pattern `device-pairing.schema.json`'s `pairing.code` uses. */
const PAIRING_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{8}$/;

export class InvalidPairingOriginError extends Error {
  constructor(origin: string) {
    super(`Invalid pairing origin: ${JSON.stringify(origin)}`);
    this.name = "InvalidPairingOriginError";
  }
}

export class InvalidPairingCodeError extends Error {
  constructor(code: string) {
    super(`Invalid pairing code: ${JSON.stringify(code)}`);
    this.name = "InvalidPairingCodeError";
  }
}

/**
 * `true` only for a bare `window.location.origin` string: `http:`/`https:`,
 * no userinfo, no path/query/fragment, and no round-trip drift (the guard
 * against something like `https://portal.example.\0evil` that `new
 * URL()` would otherwise normalize into a *different* origin than the one
 * given -- a QR code must encode the origin the browser actually sits on,
 * never a look-alike).
 */
function isValidPairingOrigin(origin: string): boolean {
  if (typeof origin !== "string" || origin === "") return false;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  return (
    (parsed.protocol === "http:" || parsed.protocol === "https:") &&
    parsed.username === "" &&
    parsed.password === "" &&
    parsed.pathname === "/" &&
    parsed.search === "" &&
    parsed.hash === "" &&
    parsed.origin === origin
  );
}

export type PairingQrPayloadInput = {
  /** `window.location.origin`, exactly as the browser reports it. */
  origin: string;
  /** The eight-character pairing code already shown as text. */
  code: string;
};

/**
 * Builds the exact string the QR code encodes. Throws
 * {@link InvalidPairingOriginError}/{@link InvalidPairingCodeError} rather
 * than silently degrading -- a malformed origin or code here would mean the
 * portal's own address bar or its own pairing-code generator is broken, not
 * something a caller should paper over.
 */
export function buildPairingQrPayload({
  origin,
  code,
}: PairingQrPayloadInput): string {
  if (!isValidPairingOrigin(origin)) {
    throw new InvalidPairingOriginError(origin);
  }
  if (typeof code !== "string" || !PAIRING_CODE_PATTERN.test(code)) {
    throw new InvalidPairingCodeError(code);
  }
  const params = new URLSearchParams();
  params.set("origin", origin);
  params.set("code", code);
  return `${PAIRING_QR_SCHEME}://${PAIRING_QR_VERSION}?${params.toString()}`;
}
