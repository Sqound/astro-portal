import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  nextDestination,
  sameOriginPath,
  sitePath,
} from "../dist/safe-redirect.js";

const authDestination = (search, origin) =>
  nextDestination(search, origin, "/");

// Where a sign-in sends the browser afterwards (`next`): a path of the same
// site, never an address elsewhere (also on the private server's own sign-in).

const origin = "https://portal.example.test";

// Forms that a filter on the first characters lets through, and that a
// browser then reads as another site or as a script.
const traps = [
  "//evil.example",
  "/\\evil.example",
  "\\\\evil.example",
  "\\/evil.example",
  "/\t/evil.example",
  "/\n/evil.example",
  " //evil.example",
  "https://evil.example/fr",
  "http:evil.example",
  "javascript:alert(document.domain)",
  "JaVaScRiPt:alert(1)",
  "java\tscript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "/.//evil.example",
  "/./\\evil.example",
];

test("a trap never leaves the site", () => {
  for (const trap of traps) {
    const path = sameOriginPath(trap, origin);
    if (path === null) continue;
    // Anything kept is a path of this site, read the same way twice.
    assert.equal(new URL(path, origin).origin, origin, JSON.stringify(trap));
    assert.match(path, /^\/(?![/\\])/, JSON.stringify(trap));
  }
  for (const trap of traps)
    assert.equal(sameOriginPath(trap, origin), null, JSON.stringify(trap));
  // The browser reads the same scheme without its slashes as a path here.
  assert.equal(sameOriginPath("https:/evil.example", origin), "/evil.example");
});

test("a path of the site is kept, with its query and fragment", () => {
  assert.equal(sameOriginPath("/fr/account", origin), "/fr/account");
  assert.equal(
    sameOriginPath("/ja/admin/captures?x=1#top", origin),
    "/ja/admin/captures?x=1#top",
  );
  // Percent-encoded characters stay a path of this site.
  assert.equal(
    sameOriginPath("/%09/evil.example", origin),
    "/%09/evil.example",
  );
  assert.equal(
    sameOriginPath("/%2F%2Fevil.example", origin),
    "/%2F%2Fevil.example",
  );
  assert.equal(sameOriginPath(`${origin}/fr/plans`, origin), "/fr/plans");
  for (const empty of [null, undefined, "", 42, {}])
    assert.equal(sameOriginPath(empty, origin), null);
});

test("the server keeps a path without knowing its own address", () => {
  assert.equal(sitePath("/fr/account?tab=devices"), "/fr/account?tab=devices");
  for (const trap of traps)
    assert.equal(sitePath(trap), null, JSON.stringify(trap));
});

test("the private server's sign-in follows only a path of its site", () => {
  assert.equal(authDestination("?next=%2Ffr%2Faccount", origin), "/fr/account");
  for (const trap of traps)
    assert.match(
      authDestination(`?next=${encodeURIComponent(trap)}`, origin),
      /^\/(?![/\\])/,
      JSON.stringify(trap),
    );
  assert.equal(authDestination("?next=javascript%3Aalert(1)", origin), "/");
  assert.equal(authDestination("?next=%2F%5Cevil.example", origin), "/");
  assert.equal(authDestination("", origin), "/");
  // The page follows `next` only through this check.
  const page = readFileSync(
    new URL("../src/components/auth/AuthPage.js", import.meta.url),
    "utf8",
  );
  assert.match(
    page,
    /window\.location\.assign\(\s*nextDestination\(window\.location\.search, window\.location\.origin, "\/"\),?\s*\)/,
  );
  assert.doesNotMatch(page, /\.get\("next"\)/);
});
