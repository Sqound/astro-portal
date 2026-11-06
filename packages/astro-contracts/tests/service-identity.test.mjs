import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  SERVICE_API_VERSION,
  SERVICE_IDENTITY_NAME,
  parseServiceIdentity,
  serviceIdentity,
} from "../dist/service-identity.js";
import { assertInvalid, assertValid } from "./schema-assert.mjs";

const schema = async () =>
  JSON.parse(
    await readFile(
      new URL("../schemas/api/service.schema.json", import.meta.url),
      "utf8",
    ),
  );

test("the built identity matches the schema and parses as valid", async () => {
  const body = serviceIdentity("1.2.3");
  assert.deepEqual(body, {
    service: SERVICE_IDENTITY_NAME,
    apiVersion: SERVICE_API_VERSION,
    version: "1.2.3",
  });
  assertValid(await schema(), body);
  assert.deepEqual(parseServiceIdentity(body), { valid: true, ...body });
});

test("the schema refuses another service marker and a missing version", async () => {
  const document = await schema();
  assertInvalid(document, { service: "other", apiVersion: 1, version: "1" });
  assertInvalid(document, { service: "astro-portal", apiVersion: 1 });
});

test("a caller may widen the supported API versions", () => {
  const body = { service: "astro-portal", apiVersion: 2, version: "3.0.0" };
  assert.equal(parseServiceIdentity(body).valid, false);
  assert.equal(parseServiceIdentity(body, [1, 2]).valid, true);
});
