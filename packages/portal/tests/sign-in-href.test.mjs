import assert from "node:assert/strict";
import test from "node:test";
import {
  EMAIL_CODE_SIGN_IN_PATH,
  PASSWORD_SIGN_IN_PATH,
  signInHrefFor,
  signInPageOf,
} from "../src/sign-in-href.js";

// « Sign in » in the portal's menu
// led to a 404 where the sign-in page is `/auth/sign-in`.
// Every link to the sign-in goes through this one answer.

test("the page is the one the service names", () => {
  assert.equal(
    signInPageOf({ method: "email-code", signInPath: "/auth/sign-in" }),
    "/auth/sign-in",
  );
  assert.equal(
    signInPageOf({ method: "password", signInPath: "/auth/login" }),
    "/auth/login",
  );
});

test("without a page named, it follows the method: login for the password only", () => {
  assert.equal(signInPageOf({ method: "password" }), PASSWORD_SIGN_IN_PATH);
  assert.equal(signInPageOf({ method: "email-code" }), EMAIL_CODE_SIGN_IN_PATH);
  // A header that knows nothing (a status that could not be read, a server
  // without sign-in) never leads to the page of another method.
  for (const unknown of [
    undefined,
    null,
    {},
    { enabled: false, authenticated: false },
    { method: "disabled" },
  ])
    assert.equal(
      signInPageOf(unknown),
      "/auth/sign-in",
      JSON.stringify(unknown),
    );
});

test("a page that is not a plain path of this site is not followed", () => {
  for (const signInPath of [
    "//evil.example/auth",
    "https://evil.example/auth",
    "/auth/sign-in?x=1",
    "",
    42,
  ])
    assert.equal(
      signInPageOf({ method: "email-code", signInPath }),
      "/auth/sign-in",
      String(signInPath),
    );
  assert.equal(
    signInPageOf({ method: "password", signInPath: "//evil.example" }),
    "/auth/login",
  );
});

test("the address brings the person back to where they were", () => {
  assert.equal(
    signInHrefFor({ method: "email-code", signInPath: "/auth/sign-in" }, "/en"),
    "/auth/sign-in?next=%2Fen",
  );
  assert.equal(
    signInHrefFor({ method: "password" }, "/fr/gallery?view=map"),
    "/auth/login?next=%2Ffr%2Fgallery%3Fview%3Dmap",
  );
  assert.equal(signInHrefFor({ method: "password" }), "/auth/login");
});
