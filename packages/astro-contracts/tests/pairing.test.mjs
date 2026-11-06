import assert from "node:assert/strict";
import test from "node:test";
import {
  InvalidPairingCodeError,
  InvalidPairingOriginError,
  PAIRING_QR_SCHEME,
  PAIRING_QR_VERSION,
  buildPairingQrPayload,
} from "../dist/pairing.js";

const validCode = "3K7H9RTZ";

test("encodes the origin and code into the versioned scheme", () => {
  const payload = buildPairingQrPayload({
    origin: "https://portal.example",
    code: validCode,
  });
  assert.equal(
    payload,
    `${PAIRING_QR_SCHEME}://${PAIRING_QR_VERSION}?origin=https%3A%2F%2Fportal.example&code=${validCode}`,
  );
});

function decodeQuery(payload) {
  const prefix = `${PAIRING_QR_SCHEME}://${PAIRING_QR_VERSION}?`;
  assert.ok(payload.startsWith(prefix), payload);
  return new URLSearchParams(payload.slice(prefix.length));
}

test("carries a port through untouched (LAN dev origin)", () => {
  const origin = "http://192.168.1.20:3000";
  const payload = buildPairingQrPayload({ origin, code: validCode });
  const params = decodeQuery(payload);
  assert.equal(params.get("origin"), origin);
  assert.equal(params.get("code"), validCode);
});

test("round-trips through URLSearchParams decoding", () => {
  const origin = "https://portal.example";
  const payload = buildPairingQrPayload({ origin, code: validCode });
  const params = decodeQuery(payload);
  assert.equal(params.get("origin"), origin);
  assert.equal(params.get("code"), validCode);
});

test("rejects an origin carrying a path, query, hash or credentials", () => {
  for (const origin of [
    "https://portal.example/some/path",
    "https://portal.example/?x=1",
    "https://portal.example/#top",
    "https://user:pass@portal.example",
    "https://portal@evil.example",
  ]) {
    assert.throws(
      () => buildPairingQrPayload({ origin, code: validCode }),
      InvalidPairingOriginError,
      origin,
    );
  }
});

test("rejects a non-http(s) origin", () => {
  assert.throws(
    () =>
      buildPairingQrPayload({
        origin: "ftp://portal.example",
        code: validCode,
      }),
    InvalidPairingOriginError,
  );
});

test("rejects a malformed, empty, or non-string origin", () => {
  for (const origin of ["", "not-a-url", null, undefined, 42]) {
    assert.throws(
      () => buildPairingQrPayload({ origin, code: validCode }),
      InvalidPairingOriginError,
    );
  }
});

test("rejects a code that is not eight Crockford base32 characters", () => {
  for (const code of [
    "",
    "short",
    "toolongcode",
    "3K7H9RTI",
    "3k7h9rtz",
    null,
    12345678,
  ]) {
    assert.throws(
      () => buildPairingQrPayload({ origin: "https://portal.example", code }),
      InvalidPairingCodeError,
      String(code),
    );
  }
});
