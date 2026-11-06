// The planner of the open core holds no « Demander un objet manquant »: the
// searches draw `MissingObjectLink`, which draws what a shell registered at
// `planner.missingObject` and, without a shell, nothing.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  getPlannerExtensions,
  registerPlannerExtension,
} from "portal/planner/extensions.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const slot = await import("planner/missing-object-slot.js");

const link = (value) =>
  renderToStaticMarkup(
    createElement(
      slot.MissingObjectContext.Provider,
      { value },
      createElement(slot.MissingObjectLink, { locale: "fr", query: "Sh2-155" }),
    ),
  );

test("without an extension, nothing: the form exists nowhere and no link is drawn", () => {
  assert.equal(getPlannerExtensions("planner.missingObject").length, 0);
  assert.equal(
    slot.missingObjectAvailable({ signInPath: "/auth/sign-in" }),
    false,
  );
  assert.equal(slot.missingObjectAvailable(null), false);
  assert.equal(link({ available: true, signedIn: true }), "");
  assert.equal(
    renderToStaticMarkup(
      createElement(slot.MissingObjectLink, { locale: "fr" }),
    ),
    "",
  );
});

test("a registered extension decides where the form exists and draws the link, given what the planner knows", () => {
  const seen = [];
  registerPlannerExtension("planner.missingObject", {
    available: (auth) => auth?.signInPath === "/auth/sign-in",
    Link: (props) => {
      seen.push(props);
      return createElement("a", { className: "stub-link" }, props.query);
    },
  });
  assert.equal(
    slot.missingObjectAvailable({ signInPath: "/auth/sign-in" }),
    true,
  );
  assert.equal(slot.missingObjectAvailable({}), false);
  // The planner says it does not exist here: nothing, whatever is registered.
  assert.equal(link({ available: false }), "");
  assert.equal(
    link({ available: true, signedIn: false, signInHref: "/auth/sign-in" }),
    '<a class="stub-link">Sh2-155</a>',
  );
  assert.deepEqual(seen.at(-1), {
    locale: "fr",
    query: "Sh2-155",
    context: { available: true, signedIn: false, signInHref: "/auth/sign-in" },
  });
});

test("the planner's components name no form, no request and no route of the shell", () => {
  const directory = new URL("../src", import.meta.url).pathname;
  const sources = readdirSync(directory, {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile() && /\.(?:js|ts)$/.test(entry.name))
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name));
  // The words are assembled: this file names what the planner must not.
  const route = ["catalogue", "requests"].join("-");
  const sheet = ["Missing", "ObjectRequest"].join("");
  for (const file of sources) {
    if (file.endsWith("missing-object-slot.js")) continue;
    const text = readFileSync(file, "utf8");
    assert.ok(!text.includes(route), file);
    assert.doesNotMatch(text, new RegExp(`${sheet}\\b`), file);
  }
});
