import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// The words of the page of an address that leads nowhere, of the pages
// that need a space on a server with no sign-in, and the Journal's
// calendar.
await registerJsx();
const registry = JSON.parse(
  readFileSync(
    new URL("../../astro-contracts/locales/registry.json", import.meta.url),
    "utf8",
  ),
);
const tags = registry.locales.map((entry) => entry.tag);

const { notFoundCopy, notFoundCopyFor } =
  await import("portal/components/not-found/not-found-copy.js");
const { noSignInCopy, noSignInCopyFor } =
  await import("portal/components/no-sign-in/no-sign-in-copy.js");
const { NoSignInPage } =
  await import("portal/components/no-sign-in/NoSignInPage.js");
const { NotFoundPage } =
  await import("portal/components/not-found/NotFoundPage.js");
const { monthToShow } =
  await import("portal/components/sessions/JournalCalendar.js");
const { journalFiltersCount } =
  await import("portal/components/sessions/JournalControls.js");

test("both tables speak every language of the registry, each with its own words", () => {
  for (const [name, table, keys] of [
    ["notFoundCopy", notFoundCopy, ["title", "body", "home"]],
    ["noSignInCopy", noSignInCopy, ["account", "notice"]],
  ]) {
    assert.deepEqual(Object.keys(table).sort(), [...tags].sort(), name);
    for (const tag of tags)
      for (const key of keys) {
        assert.equal(typeof table[tag][key], "string", `${name} ${tag} ${key}`);
        assert.ok(table[tag][key].length > 1, `${name} ${tag} ${key}`);
        // « Account » is the Italian word too.
        if (tag !== "en" && key !== "account")
          assert.notEqual(
            table[tag][key],
            table.en[key],
            `${name} ${tag} ${key} is not the English words`,
          );
      }
  }
  // An unknown language reads the default's words.
  assert.equal(notFoundCopyFor("xx").title, notFoundCopy.en.title);
});

test("the 404 page speaks the address's language, else the visitor's, with one way back", () => {
  const draw = (pathname, fallbackLocale) => {
    globalThis.__renderedPathname = pathname;
    try {
      return renderToStaticMarkup(
        createElement(NotFoundPage, { fallbackLocale }),
      );
    } finally {
      delete globalThis.__renderedPathname;
    }
  };
  const french = draw("/fr/nowhere", "en");
  assert.match(french, /<h1[^>]*>Page introuvable<\/h1>/);
  assert.match(french, /href="\/fr"[^>]*>Retour à l’accueil</);
  assert.ok(!/could not be found/i.test(french));
  const japanese = draw("/ja/xyz", "en");
  assert.match(japanese, /ページが見つかりません/);
  assert.match(japanese, /href="\/ja"/);
  // No language in the address: the visitor's last choice.
  assert.match(draw("/nowhere", "de"), /Seite nicht gefunden/);
  assert.match(draw("/nowhere", "de"), /href="\/de"/);
  assert.match(draw("/nowhere", "en"), /Page not found/);
  // Exactly one control: the way back.
  assert.equal(french.match(/<a /g)?.length, 1);
  assert.equal(french.match(/<button/g), null);
});

test("a server with no sign-in says it once, in the language, with no button", () => {
  for (const tag of tags) {
    for (const page of ["account", "journal"]) {
      const markup = renderToStaticMarkup(
        createElement(NoSignInPage, { locale: tag, page }),
      );
      assert.ok(markup.includes(noSignInCopyFor(tag).notice), `${tag} ${page}`);
      assert.equal(markup.match(/<button|<a /g), null, `${tag} ${page}`);
      assert.ok(!/Private API|Connectez un espace/.test(markup));
    }
  }
  const journal = renderToStaticMarkup(
    createElement(NoSignInPage, { locale: "fr", page: "journal" }),
  );
  assert.match(journal, /<h1>Journal<\/h1>/);
  const account = renderToStaticMarkup(
    createElement(NoSignInPage, { locale: "fr", page: "account" }),
  );
  assert.match(account, /<h1>Compte<\/h1>/);
});

test("a year of the calendar opens on the current month, else on the latest session's", () => {
  const dates = ["2026-03-04", "2026-10-02", "2026-10-19", "2025-12-30"];
  const june = new Date(2026, 5, 15);
  assert.equal(monthToShow({ year: 2026, dates, today: june }), 5);
  assert.equal(monthToShow({ year: "2026", dates, today: june }), 5);
  assert.equal(monthToShow({ year: 2025, dates, today: june }), 11);
  assert.equal(monthToShow({ year: 2024, dates, today: june }), null);
  assert.equal(
    monthToShow({ year: 2026, dates: [], today: new Date(2027, 0, 1) }),
    null,
  );
});

test("the calendar's year is its own scope, not a filter the person set", () => {
  assert.equal(journalFiltersCount({ year: 2026, view: "calendar" }), 0);
  assert.equal(journalFiltersCount({ year: 2026, view: "list" }), 1);
  assert.equal(
    journalFiltersCount({ year: 2026, view: "calendar", season: "autumn" }),
    1,
  );
});

test("the arrow of a folded section keeps its size, and its line does not copy the names of two buttons", async () => {
  const css = readFileSync(
    new URL("../../portal-app/styles/portal.css", import.meta.url),
    "utf8",
  );
  const rule = css.slice(css.indexOf(".night-fold > summary::after {"));
  assert.match(rule.slice(0, rule.indexOf("}")), /flex: none;/);
  const { messages } = await import("portal/i18n.js");
  for (const tag of tags) {
    const hint = messages[tag].sessionPageDetailsQualityHint;
    for (const key of ["nightPageReplaceAnalysis", "nightPageDeleteAnalysis"]) {
      const name = messages[tag][key];
      if (name)
        assert.ok(!hint.includes(name), `${tag}: the line repeats « ${name} »`);
    }
    assert.ok(hint.length < 90, `${tag}: one short line`);
  }
});
