import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCESS_COPY,
  isHostedService,
  plannerAccessCopy,
  plannerSignInHref,
} from "../src/access-copy.js";

// The entry of the web planner ("Préparer la prochaine nuit") speaks of the
// space and signs in by e-mail code on the hosted service, and keeps its own
// words and its authenticator's sign-in on a private server.

test("a private server's entry says what it always said, word for word", () => {
  const fr = plannerAccessCopy("fr");
  assert.equal(fr.guestLabel, "Continuer en invité");
  assert.equal(
    fr.signInHelp,
    "Retrouvez vos plans privés, sauvegardés dans votre portail.",
  );
  assert.equal(fr.signInLabel, "Se connecter");
  const en = plannerAccessCopy("en", { hosted: false });
  assert.equal(en.guestLabel, "Continue as guest");
  assert.equal(en.signInHelp, "Open your private plans, saved in your portal.");
  const ja = plannerAccessCopy("ja");
  assert.equal(ja.guestLabel, "ゲストとして続ける");
  assert.equal(
    ja.signInHelp,
    "ポータルに保存されたプライベートプランを開きます。",
  );
});

test("the hosted service's entry speaks of the space, in the three languages", () => {
  assert.deepEqual(
    [
      plannerAccessCopy("fr", { hosted: true }).guestLabel,
      plannerAccessCopy("fr", { hosted: true }).signInHelp,
    ],
    [
      "Continuer sans espace",
      "Retrouvez vos plans privés, sauvegardés dans votre espace Astro Portal.",
    ],
  );
  assert.deepEqual(
    [
      plannerAccessCopy("en", { hosted: true }).guestLabel,
      plannerAccessCopy("en", { hosted: true }).signInHelp,
    ],
    [
      "Continue without a space",
      "Open your private plans, saved in your Astro Portal space.",
    ],
  );
  assert.deepEqual(
    [
      plannerAccessCopy("ja", { hosted: true }).guestLabel,
      plannerAccessCopy("ja", { hosted: true }).signInHelp,
    ],
    [
      "スペースなしで続ける",
      "Astro Portal スペースに保存されたプライベートプランを開きます。",
    ],
  );
  // What is not about the service is the same on both.
  for (const language of Object.keys(ACCESS_COPY)) {
    const hosted = plannerAccessCopy(language, { hosted: true });
    const private_ = plannerAccessCopy(language, { hosted: false });
    for (const key of ["loading", "title", "intro", "guestHelp", "signInLabel"])
      assert.equal(hosted[key], private_[key], `${language} ${key}`);
  }
});

test("an unknown language reads English", () => {
  assert.equal(plannerAccessCopy("xx").title, "Plan your next night");
});

test("the hosted service is recognised by the sign-in page its status names", () => {
  // `GET /api/auth/status`: the sign-in extension's `method` and `signInPath`
  // on the hosted service; a private server adds `spaceCreation: "closed"`.
  assert.equal(
    isHostedService({
      enabled: true,
      method: "email-code",
      signInPath: "/auth/sign-in",
    }),
    true,
  );
  assert.equal(isHostedService({ enabled: true, authenticated: false }), false);
  // A private server names its sign-in page too, and says it holds one
  // space, its owner's: never the hosted service, in either mode.
  for (const [method, signInPath] of [
    ["email-code", "/auth/sign-in"],
    ["password", "/auth/login"],
  ])
    assert.equal(
      isHostedService({
        enabled: true,
        method,
        spaceCreation: "closed",
        signInPath,
      }),
      false,
      method,
    );
  assert.equal(isHostedService({}), false);
  assert.equal(isHostedService(null), false);
  // An address that leaves the site names no sign-in page of ours.
  assert.equal(
    isHostedService({ signInPath: "//evil.example/sign-in" }),
    false,
  );
  assert.equal(isHostedService({ signInPath: "https://evil.example/" }), false);
});

test("« Se connecter » leads to the sign-in of the service and back to the planner", () => {
  assert.equal(
    plannerSignInHref({ locale: "fr", signInPath: "/auth/sign-in" }),
    "/auth/sign-in?next=%2Ffr%2Fplanner",
  );
  assert.equal(
    plannerSignInHref({ locale: "ja", signInPath: "/auth/sign-in" }),
    "/auth/sign-in?next=%2Fja%2Fplanner",
  );
  // A private server: the authenticator's page.
  assert.equal(
    plannerSignInHref({ locale: "en", signInPath: "/auth/login" }),
    "/auth/login?next=%2Fen%2Fplanner",
  );
  assert.equal(
    plannerSignInHref({ locale: "en", method: "password" }),
    "/auth/login?next=%2Fen%2Fplanner",
  );
  // Nothing said by the service: the e-mail code's page, never a 404.
  assert.equal(
    plannerSignInHref({ locale: "en", signInPath: undefined }),
    "/auth/sign-in?next=%2Fen%2Fplanner",
  );
  // The page is only ever a path of this site.
  for (const signInPath of [
    "//evil.example/auth",
    "https://evil.example/auth",
    "\\\\evil.example",
    "",
    null,
  ])
    assert.equal(
      plannerSignInHref({ locale: "fr", signInPath }),
      "/auth/sign-in?next=%2Ffr%2Fplanner",
      String(signInPath),
    );
});
