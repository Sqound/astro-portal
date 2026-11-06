import assert from "node:assert/strict";
import test from "node:test";
import {
  CLIENT_IDENTITY_HEADER,
  clientIdentityOf,
  parseClientIdentity,
} from "../dist/api/client-identity.js";

// The header the mobile application and Astro Sync send to say which build
// makes a request (v1.md, « Client identity »): read whole or not at all.

test("a client identity names its product, its version and build, and its system", () => {
  assert.deepEqual(parseClientIdentity("planastro-ios/1.0.4+126 (iOS 18.1)"), {
    product: "planastro-ios",
    appVersion: "1.0.4+126",
    osVersion: "iOS 18.1",
  });
  assert.deepEqual(
    parseClientIdentity("astro-sync-macos/1.0.0+6aa28f767 (macOS 15.1)"),
    {
      product: "astro-sync-macos",
      appVersion: "1.0.0+6aa28f767",
      osVersion: "macOS 15.1",
    },
  );
  assert.deepEqual(parseClientIdentity("astro-sync-windows/1.0.0 (Windows)"), {
    product: "astro-sync-windows",
    appVersion: "1.0.0",
    osVersion: "Windows",
  });
  assert.deepEqual(parseClientIdentity("planastro-android/1.0.4+126"), {
    product: "planastro-android",
    appVersion: "1.0.4+126",
    osVersion: null,
  });
});

test("a value that is not of the form is ignored whole", () => {
  for (const value of [
    null,
    "",
    "planastro-ios",
    "PlanAstro-iOS/1.0.4",
    "planastro-ios/1.0.4 (iOS 18.1",
    "planastro-ios/1.0.4 (iOS 18.1) extra",
    "planastro-ios/1.0 4",
    "planastro-ios/1.0.4+126+2",
    "planastro-ios/1.0.4 (iOS 18.1; iPhone17,1)",
    "planastro-ios/<script>",
    `planastro-ios/${"1".repeat(41)}`,
    `planastro-ios/1.0.4 (iOS ${"1".repeat(41)})`,
    `${"a".repeat(41)}/1.0.4`,
  ])
    assert.equal(parseClientIdentity(value), null, String(value));
});

test("the header is read from a Headers object or Node's plain one", () => {
  const value = "planastro-ios/1.0.4+126 (iOS 18.1)";
  assert.equal(CLIENT_IDENTITY_HEADER, "x-planastro-client");
  assert.equal(
    clientIdentityOf(new Headers({ "X-PlanAstro-Client": value }))?.appVersion,
    "1.0.4+126",
  );
  assert.equal(
    clientIdentityOf({ "x-planastro-client": value })?.osVersion,
    "iOS 18.1",
  );
  assert.equal(clientIdentityOf(new Headers()), null);
  assert.equal(clientIdentityOf(undefined), null);
});
