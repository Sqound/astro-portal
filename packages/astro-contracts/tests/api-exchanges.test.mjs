import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import {
  emailCodeSignIn,
  parseServiceIdentity,
  parseSignInAnnouncement,
  serviceIdentity,
} from "../dist/service-identity.js";
import { registerExternalSchema, schemaErrors } from "./schema-assert.mjs";

// The recorded exchanges of fixtures/api/ (the space sign-in contract): every
// answer they record satisfies the schema definition it names, so that the
// applications replaying them against a fake service and the service's own
// tests hold to the same shapes.

const schemasDirectory = new URL("../schemas/api/", import.meta.url);
const exchangesDirectory = new URL("../fixtures/api/", import.meta.url);
const documents = {};
for (const name of await readdir(schemasDirectory)) {
  if (!name.endsWith(".schema.json")) continue;
  documents[name] = JSON.parse(
    await readFile(new URL(name, schemasDirectory), "utf8"),
  );
  registerExternalSchema(name, documents[name]);
}

function definition(reference) {
  const [file, pointer = ""] = reference.split("#");
  const document = documents[file];
  assert.ok(document, `unknown schema ${file}`);
  let schema = document;
  for (const segment of pointer.split("/").filter(Boolean)) {
    schema = schema[segment];
    assert.ok(schema, `unknown definition ${reference}`);
  }
  return { ...schema, $defs: document.$defs };
}

const files = (await readdir(exchangesDirectory)).filter((name) =>
  name.endsWith(".json"),
);

test("the recorded exchanges are the nine files the README lists", async () => {
  const readme = await readFile(
    new URL("README.md", exchangesDirectory),
    "utf8",
  );
  assert.deepEqual(files.sort(), [
    "entitlements-private-server.json",
    "plan-trash.json",
    "service-identity.json",
    "sign-in-code-request.json",
    "sign-in-link.json",
    "sign-in-verify.json",
    "space-current.json",
    "space-deletion.json",
    "space-devices.json",
  ]);
  for (const file of files) assert.ok(readme.includes(`\`${file}\``), file);
});

for (const file of files)
  test(`${file}: every recorded answer satisfies its schema`, async () => {
    const fixture = JSON.parse(
      await readFile(new URL(file, exchangesDirectory), "utf8"),
    );
    assert.ok(["built", "planned"].includes(fixture.status));
    const ids = new Set();
    for (const exchange of fixture.exchanges || []) {
      assert.ok(!ids.has(exchange.id), `duplicate id ${exchange.id}`);
      ids.add(exchange.id);
      assert.match(exchange.request.path, /^\/(?:api\/v1|auth|\.well-known)\//);
      assert.equal(typeof exchange.response.status, "number");
      if (!exchange.response.schema) continue;
      assert.deepEqual(
        schemaErrors(
          definition(exchange.response.schema),
          exchange.response.body,
        ),
        [],
        `${file} ${exchange.id}`,
      );
      if (
        exchange.response.body?.retryAt &&
        [429, 503].includes(exchange.response.status)
      )
        assert.ok(
          exchange.response.headers["retry-after"],
          `${exchange.id}: a wait goes with Retry-After`,
        );
    }
    for (const link of fixture.links || [])
      assert.deepEqual(
        schemaErrors(definition(link.schema), link.fragment),
        [],
        link.id,
      );
  });

test("every verification that signs in is a request of the contract", async () => {
  const fixture = JSON.parse(
    await readFile(new URL("sign-in-verify.json", exchangesDirectory), "utf8"),
  );
  const accepted = fixture.exchanges.filter(
    (exchange) => exchange.response.status === 200,
  );
  assert.ok(accepted.some((exchange) => exchange.request.body.linkToken));
  for (const exchange of accepted)
    assert.deepEqual(
      schemaErrors(
        definition("sign-in.schema.json#/$defs/verifyRequest"),
        exchange.request.body,
      ),
      [],
      exchange.id,
    );
  // A link token is never sent without the address typed on the device.
  assert.notDeepEqual(
    schemaErrors(definition("sign-in.schema.json#/$defs/verifyRequest"), {
      linkToken: "L6-hEKAbdZ63mYLsAi7VuGXcWm0-5FMU-QRAuYxF39s",
      client: "web",
    }),
    [],
  );
});

test("the service announces how a person signs in, additively", async () => {
  const fixture = JSON.parse(
    await readFile(
      new URL("service-identity.json", exchangesDirectory),
      "utf8",
    ),
  );
  const expected = {
    "hosted-service-announces-email-code": {
      method: "email-code",
      spaceCreation: "open",
      codeLength: 6,
      termsUrl: "https://www.example.test/terms",
      privacyUrl: "https://www.example.test/privacy",
      termsUrlTemplate: null,
      privacyUrlTemplate: null,
    },
    "hosted-service-announces-legal-pages-per-language": {
      method: "email-code",
      spaceCreation: "open",
      codeLength: 6,
      termsUrl: "https://www.example.test/en/terms/",
      privacyUrl: "https://www.example.test/en/privacy/",
      termsUrlTemplate: "https://www.example.test/{lang}/terms/",
      privacyUrlTemplate: "https://www.example.test/{lang}/privacy/",
    },
    "hosted-service-without-legal-links": {
      method: "email-code",
      spaceCreation: "open",
      codeLength: 6,
      termsUrl: null,
      privacyUrl: null,
      termsUrlTemplate: null,
      privacyUrlTemplate: null,
    },
    "private-server-announces-closed-email-code": {
      method: "email-code",
      spaceCreation: "closed",
      codeLength: 6,
      termsUrl: null,
      privacyUrl: null,
      termsUrlTemplate: null,
      privacyUrlTemplate: null,
    },
    "private-server-announces-pairing": { method: "pairing" },
    "service-without-private-api": { method: "none" },
    "older-private-server-announces-nothing": { method: "pairing" },
  };
  for (const exchange of fixture.exchanges) {
    assert.equal(parseServiceIdentity(exchange.response.body).valid, true);
    assert.deepEqual(
      parseSignInAnnouncement(exchange.response.body),
      expected[exchange.id],
      exchange.id,
    );
  }
  assert.deepEqual(parseSignInAnnouncement({ signIn: { method: "passkey" } }), {
    method: "unsupported",
  });
  assert.deepEqual(parseSignInAnnouncement({ signIn: "pairing" }), {
    method: "unsupported",
  });
});

test("a private server sells nothing: its answer to GET /v1/entitlements holds no purchase", async () => {
  const fixture = JSON.parse(
    await readFile(
      new URL("entitlements-private-server.json", exchangesDirectory),
      "utf8",
    ),
  );
  assert.deepEqual(
    fixture.exchanges.map((exchange) => exchange.id),
    ["entitlements-private-server"],
  );
  const [exchange] = fixture.exchanges;
  assert.deepEqual(exchange.response.body.purchases, []);
  assert.equal(Object.keys(exchange.response.body.capabilities).length, 14);
  const response = definition("entitlements-private-server.schema.json");
  assert.deepEqual(schemaErrors(response, exchange.response.body), []);
  // Additive: a client ignores a field it does not know; a purchase is not
  // something a private server can list.
  assert.deepEqual(
    schemaErrors(response, { ...exchange.response.body, extra: true }),
    [],
  );
  assert.notDeepEqual(
    schemaErrors(response, {
      ...exchange.response.body,
      purchases: [{ id: "x" }],
    }),
    [],
  );
});

test("the announcement is built from settings and never announces an empty link", () => {
  assert.deepEqual(serviceIdentity("1.0.1"), {
    service: "astro-portal",
    apiVersion: 1,
    version: "1.0.1",
  });
  assert.deepEqual(serviceIdentity("1.0.1", { method: "pairing" }).signIn, {
    method: "pairing",
  });
  assert.deepEqual(
    emailCodeSignIn({
      termsUrl: " https://www.example.test/terms ",
      privacyUrl: "",
    }),
    {
      method: "email-code",
      spaceCreation: "open",
      codeLength: 6,
      termsUrl: "https://www.example.test/terms",
    },
  );
  assert.deepEqual(emailCodeSignIn({ termsUrl: "javascript:alert(1)" }), {
    method: "email-code",
    spaceCreation: "open",
    codeLength: 6,
  });
  assert.deepEqual(
    schemaErrors(
      definition("service.schema.json"),
      serviceIdentity("1.0.1", emailCodeSignIn()),
    ),
    [],
  );
});

test("a page per language is announced beside the English address, additively", () => {
  const body = serviceIdentity(
    "1.0.1",
    emailCodeSignIn({
      termsUrl: "https://www.example.test/{lang}/terms/",
      privacyUrl: "https://www.example.test/{lang}/privacy/",
    }),
  );
  assert.deepEqual(body.signIn.termsUrl, "https://www.example.test/en/terms/");
  assert.deepEqual(
    body.signIn.privacyUrlTemplate,
    "https://www.example.test/{lang}/privacy/",
  );
  assert.deepEqual(schemaErrors(definition("service.schema.json"), body), []);
});
