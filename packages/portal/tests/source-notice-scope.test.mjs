import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isAdministrationPath,
  isFullViewportPath,
  showsBuildIdentity,
} from "../src/source-notice-scope.js";

// The portal's version number must be visible only in the footer of the
// administration screens.

test("the build identity belongs to the pages under /<locale>/admin, in every language", () => {
  for (const path of [
    "/fr/admin",
    "/fr/admin/",
    "/fr/admin/review",
    "/en/admin/feedback",
    "/ja/admin/extra/summary",
    "/pt-BR/admin/review",
    "/zh-Hans/admin/review",
  ]) {
    assert.equal(isAdministrationPath(path), true, path);
    assert.equal(showsBuildIdentity(path), true, path);
  }
});

test("no public page, page of a space, planner or gallery capture shows it", () => {
  for (const path of [
    "/",
    "/fr",
    "/fr/",
    "/fr/planner",
    "/fr/tonight",
    "/fr/sessions",
    "/fr/sessions/abc",
    "/fr/manage",
    "/fr/manage/captures",
    "/fr/gallery/c-m31",
    "/fr/p/6qMMYTTZjM7myH-PLQxYRM0i",
    "/p/6qMMYTTZjM7myH-PLQxYRM0i/c-m31",
    "/fr/p/6qMMYTTZjM7myH-PLQxYRM0i/c-m31/extra",
    "/fr/image/m31/a1",
    "/fr/feedback",
    "/auth/sign-in",
    "/fr/administration",
    "/fr/gallery/admin",
  ])
    assert.equal(showsBuildIdentity(path), false, path);
});

test("« admin » is the section only after a shipped language: an address that merely holds the word is no administration", () => {
  for (const path of [
    "/admin",
    "/admin/review",
    "/xx/admin/review",
    "/p/admin/review",
    "/fr/p/admin",
    "/fr/manage/admin",
  ])
    assert.equal(isAdministrationPath(path), false, path);
  for (const value of [null, undefined, "", 12])
    assert.equal(isAdministrationPath(value), false, String(value));
});

test("the full-viewport pages are the capture's sheet (public gallery and private gallery, one component), the viewer and the image alone: they draw no footer", () => {
  for (const path of [
    "/fr/p/6qMMYTTZjM7myH-PLQxYRM0i/c-m31",
    "/ja/p/6qMMYTTZjM7myH-PLQxYRM0i/c-m31/",
    "/fr/gallery/c-m31",
    "/fr/gallery/c-m31/",
    "/en/gallery/0d0e6f2c-7f19-4b6e-9d58-5a7e0e0f4a11",
    "/pt-BR/gallery/c-m31",
    "/fr/image/m31/a1",
    "/image/m31/a1",
    "/fr/full/m31/a1",
    "/full/m31/a1",
  ])
    assert.equal(isFullViewportPath(path), true, path);
});

test("every other page keeps its footer: the private gallery's list scrolls and ends with it", () => {
  for (const path of [
    "/",
    "/fr",
    "/fr/gallery",
    "/gallery/c-m31",
    "/fr/gallery/c-m31/extra",
    "/fr/p/6qMMYTTZjM7myH-PLQxYRM0i",
    "/p/6qMMYTTZjM7myH-PLQxYRM0i/c-m31",
    "/fr/p/6qMMYTTZjM7myH-PLQxYRM0i/c-m31/extra",
    "/fr/image/m31",
    "/fr/planner",
    "/fr/manage/captures",
    "/fr/admin/review",
    "/xx/gallery/c-m31",
    null,
    undefined,
  ])
    assert.equal(isFullViewportPath(path), false, String(path));
});
