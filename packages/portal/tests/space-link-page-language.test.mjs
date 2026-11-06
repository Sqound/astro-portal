import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { shippedLocales } from "astro-contracts/locales";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const { SpaceLinkView } =
  await import("portal/components/space/SpaceLinkPage.js");
const { linkCopy, copyFor } =
  await import("portal/components/space/sign-in-copy.js");
const { parseSignInFragment, signInLink } =
  await import("portal/spaces/link.js");

// The page a sign-in link opens speaks the language the link carries
// (`lang`), not the one the visitor's browser or cookie happens to have;
// the page's own locale serves only before the fragment is read.

const NOW = Date.parse("2026-10-20T10:00:00.000Z");
const TOKEN = "A".repeat(43);

function linkIn(language) {
  const address = signInLink({
    publicUrl: "https://portal.example.test",
    token: TOKEN,
    code: "481207",
    expiresAt: "2026-10-20T10:08:00.000Z",
    language,
  });
  return parseSignInFragment(new URL(address).hash);
}

const text = (node) =>
  renderToStaticMarkup(node)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");

test("a link written for French opens a French page whatever the page's locale", () => {
  const link = linkIn("fr");
  assert.equal(link.lang, "fr");
  const page = text(
    createElement(SpaceLinkView, { link, locale: "en", now: NOW }),
  );
  assert.match(page, /Votre code de connexion/);
  assert.match(page, /Valable encore 8 minutes/);
  assert.doesNotMatch(page, /Your sign-in code/);
});

test("every shipped language: the page is the link's, in each locale of the page", () => {
  for (const language of shippedLocales()) {
    const link = linkIn(language);
    const expected = copyFor(linkCopy, language);
    for (const locale of ["en", "fr", "ja"]) {
      const page = text(
        createElement(SpaceLinkView, { link, locale, now: NOW }),
      );
      assert.ok(page.includes(expected.title), `${language} on ${locale}`);
      assert.ok(page.includes(expected.intro), `${language} on ${locale}`);
    }
  }
});

test("before the fragment is read, and for a fragment that is no link, the page's locale speaks", () => {
  const french = copyFor(linkCopy, "fr");
  assert.ok(
    text(
      createElement(SpaceLinkView, { link: undefined, locale: "fr" }),
    ).includes(french.title),
  );
  const incomplete = text(
    createElement(SpaceLinkView, { link: null, locale: "fr", now: NOW }),
  );
  assert.ok(incomplete.includes(french.incomplete));
});

test("an expired link says so in the link's language", () => {
  const link = linkIn("de");
  const page = text(
    createElement(SpaceLinkView, {
      link,
      locale: "en",
      now: Date.parse("2026-10-20T10:30:00.000Z"),
    }),
  );
  assert.ok(page.includes(copyFor(linkCopy, "de").expired));
});
