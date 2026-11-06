import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_JSON_BODY_BYTES,
  PayloadTooLargeError,
  readBodyText,
  readJsonBody,
} from "../dist/api/json-body.js";

const post = (body, headers = {}) =>
  new Request("http://portal.test/", {
    method: "POST",
    headers,
    body,
    duplex: "half",
  });

function stream(bytes, piece = 1000) {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      controller.enqueue(bytes.subarray(offset, offset + piece));
      offset += piece;
    },
  });
}

test("a body up to the ceiling is read; one byte more is refused", async () => {
  const exact = Buffer.from(JSON.stringify({ text: "x".repeat(89) }));
  assert.equal(exact.length, 100);
  assert.deepEqual(await readJsonBody(post(exact), { limit: 100 }), {
    text: "x".repeat(89),
  });
  const over = Buffer.concat([exact, Buffer.from(" ")]);
  await assert.rejects(
    readJsonBody(post(stream(over, 7)), { limit: 100 }),
    (error) =>
      error instanceof PayloadTooLargeError &&
      error.code === "payload_too_large" &&
      error.status === 413,
  );
});

test("an announced Content-Length over the ceiling is refused before reading", async () => {
  await assert.rejects(
    readBodyText(post("{}", { "content-length": "5000" }), { limit: 100 }),
    PayloadTooLargeError,
  );
});

test("malformed JSON keeps each route's own answer", async () => {
  await assert.rejects(readJsonBody(post("{ nope")), (error) => {
    assert.ok(error instanceof SyntaxError);
    assert.equal(error.code, undefined);
    return true;
  });
  await assert.rejects(readJsonBody(post(undefined)), SyntaxError);
  assert.equal(await readBodyText(post(undefined)), "");
  assert.equal(DEFAULT_JSON_BODY_BYTES, 1024 * 1024);
});
