import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUuid } from "../src/random-uuid.js";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("randomUuid falls back to getRandomValues outside a secure context", () => {
  const original = globalThis.crypto.randomUUID;
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    value: undefined,
    configurable: true,
  });
  try {
    const first = randomUuid();
    assert.match(first, UUID_V4);
    assert.notEqual(first, randomUuid());
  } finally {
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      value: original,
      configurable: true,
    });
  }
});

test("randomUuid uses crypto.randomUUID when present", () => {
  assert.match(randomUuid(), UUID_V4);
});
