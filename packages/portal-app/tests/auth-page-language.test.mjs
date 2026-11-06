import assert from "node:assert/strict";
import test from "node:test";
import { authPageLanguageHint } from "../dist/server/start.js";

// The sign-in page reached from a page of a language says that language in
// its words and in the header around it, when the visitor has saved none.
const request = (url, { method = "GET", cookie = "" } = {}) => ({
  method,
  url,
  headers: { host: "portal.example.test", ...(cookie ? { cookie } : {}) },
});

test("a sign-in page whose `next` names a language speaks it", () => {
  assert.equal(authPageLanguageHint(request("/auth/sign-in?next=%2Ffr")), "fr");
  assert.equal(
    authPageLanguageHint(request("/auth/sign-in?next=%2Fja%2Fplanner")),
    "ja",
  );
  assert.equal(
    authPageLanguageHint(
      request("/auth/sign-in?next=%2Fpt-BR%2Fmanage%3Ftab%3D1"),
    ),
    "pt-BR",
  );
  assert.equal(
    authPageLanguageHint(request("/auth/sign-in?next=%2Fde%3Fx%3D1")),
    "de",
    "a query on `next` does not hide its language",
  );
  assert.equal(
    authPageLanguageHint(request("/auth/login?next=%2Fru")),
    "ru",
    "the password page of a private server too",
  );
});

test("a saved language, a `next` without one, or another page: nothing is hinted", () => {
  assert.equal(
    authPageLanguageHint(
      request("/auth/sign-in?next=%2Ffr", {
        cookie: "a=b; astro-portal-locale=en",
      }),
    ),
    undefined,
    "the visitor's own choice wins",
  );
  assert.equal(authPageLanguageHint(request("/auth/sign-in")), undefined);
  assert.equal(
    authPageLanguageHint(request("/auth/sign-in?next=%2Fplanner")),
    undefined,
  );
  assert.equal(
    authPageLanguageHint(request("/auth/sign-in?next=%2Fxx%2Fplanner")),
    undefined,
    "not a shipped language",
  );
  assert.equal(
    authPageLanguageHint(request("/fr/planner?next=%2Fja")),
    undefined,
    "only the pages under /auth/",
  );
  assert.equal(
    authPageLanguageHint(
      request("/auth/sign-in?next=%2Ffr", { method: "POST" }),
    ),
    undefined,
  );
});
