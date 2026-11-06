import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { adminPathname, parseAdminRoute } from "../dist/admin-route.js";

// The routes of the administration: its own sections, each one segment, or
// one segment and an item. No composition adds a section: there is no seam
// for it any more.

test("the administration opens on its own sections; it knows no review of captures", () => {
  assert.equal(parseAdminRoute(["review"]), null);
  assert.equal(parseAdminRoute(["review", "one"]), null);
  assert.deepEqual(parseAdminRoute(["catalogue"]), {
    section: "catalogue",
    itemId: null,
  });
  assert.deepEqual(parseAdminRoute(["catalogue", "m31"]), {
    section: "catalogue",
    itemId: "m31",
  });
  assert.equal(parseAdminRoute(["logs", "one"]), null);
  assert.equal(
    adminPathname("fr", { section: "catalogue", itemId: "a b" }),
    "/fr/admin/catalogue/a%20b",
  );
});

test("a section nobody draws is not there, whatever a caller asks", () => {
  for (const section of ["review", "feedback", "beta", "grants", "first"]) {
    assert.equal(parseAdminRoute([section]), null, section);
    assert.equal(
      parseAdminRoute([section], { extra: [section] }),
      null,
      `${section}: no extra sections`,
    );
  }
  assert.equal(
    existsSync(new URL("../src/admin/extensions.js", import.meta.url)),
    false,
  );
});
