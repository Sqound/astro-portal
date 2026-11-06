import assert from "node:assert/strict";
import test from "node:test";
import { shippedLocales } from "astro-contracts/locales";
import { signInMessage } from "../src/spaces/messages.js";

// The e-mail of a code asked for on the web page said « Saisissez ce code dans
// l'application PlanAstro » and offered « Ouvrir PlanAstro » — the person is on the
// page of Astro Portal, not in the app. A request that names the web (`client: "web"`)
// gets a message that says the page; a request without a client is the app's, as ever.

const publicUrl = "https://portal.example.test";
const link = `${publicUrl}/auth/link#v=1`;
const message = (language, client) =>
  signInMessage({
    code: "571501",
    link,
    language,
    productName: "Astro Portal",
    publicUrl,
    ...(client ? { client } : {}),
  });

test("a code asked for on the web names Astro Portal and no app, in every language", () => {
  for (const locale of shippedLocales()) {
    const web = message(locale, "web");
    const app = message(locale);
    for (const part of ["text", "html"]) {
      assert.ok(web[part].includes("Astro Portal"), `${locale} ${part}`);
      assert.ok(!web[part].includes("PlanAstro"), `${locale} ${part}`);
    }
    // No button to open the app, nor the link that opens it.
    assert.ok(!web.text.includes(link), locale);
    assert.ok(!web.html.includes("<a "), locale);
    // The code is still there, grouped, in the subject and in the body.
    assert.ok(web.subject.includes("571 501"), locale);
    assert.ok(web.text.includes("571 501"), locale);
    // The app's message is the one it always was: the app, its button, its link.
    assert.ok(app.text.includes("PlanAstro"), locale);
    assert.ok(app.text.includes(link), locale);
    assert.ok(app.html.includes("<a "), locale);
    assert.notEqual(web.text, app.text, locale);
  }
});

test("in French the web's sentence says the sign-in page, the app's the application", () => {
  const web = message("fr", "web");
  assert.match(
    web.text,
    /Saisissez ce code sur la page de connexion d’Astro Portal\./,
  );
  assert.doesNotMatch(web.text, /application|Ouvrir/);
  const app = message("fr");
  assert.match(app.text, /Saisissez ce code dans l’application PlanAstro\./);
  assert.match(app.text, /Ouvrir PlanAstro/);
});

test("anything but « web » is the app's message", () => {
  const expected = message("fr").text;
  for (const client of ["app", "", null, undefined, "other"])
    assert.equal(
      signInMessage({
        code: "571501",
        link,
        language: "fr",
        productName: "Astro Portal",
        publicUrl,
        client,
      }).text,
      expected,
      String(client),
    );
});
