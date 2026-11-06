import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// A page that fails while it draws no longer shows the
// framework's « This page couldn’t load » and two buttons; it says what
// happened, that the data is safe, and offers a reset of the browser's copy.
await registerJsx();
const registry = JSON.parse(
  readFileSync(
    new URL("../../astro-contracts/locales/registry.json", import.meta.url),
    "utf8",
  ),
);
const tags = registry.locales.map((entry) => entry.tag);

const { errorPageCopy, errorPageCopyFor } =
  await import("portal/components/error/error-copy.js");
const { ErrorPage } = await import("portal/components/error/ErrorPage.js");
const { resetPlannerBrowserCopy, plannerBrowserKeyPrefixes } =
  await import("portal/components/error/browser-copy.js");

const keys = [
  "title",
  "body",
  "retry",
  "home",
  "reset",
  "resetWarning",
  "resetConfirm",
  "cancel",
  "detail",
];

test("the page speaks every language of the registry, each with its own words", () => {
  assert.deepEqual(Object.keys(errorPageCopy).sort(), [...tags].sort());
  for (const tag of tags)
    for (const key of keys) {
      assert.equal(typeof errorPageCopy[tag][key], "string", `${tag} ${key}`);
      assert.ok(errorPageCopy[tag][key].length > 1, `${tag} ${key}`);
      if (tag !== "en")
        assert.notEqual(
          errorPageCopy[tag][key],
          errorPageCopy.en[key],
          `${tag} ${key} is not the English words`,
        );
    }
  assert.equal(errorPageCopyFor("xx").title, errorPageCopy.en.title);
  assert.doesNotMatch(
    JSON.stringify(errorPageCopy),
    /couldn.t load|Astro Portal/i,
  );
});

test("the page says what happened in the address's language, with a retry, a way home and a reset", () => {
  const draw = (pathname, error) => {
    globalThis.__renderedPathname = pathname;
    try {
      return renderToStaticMarkup(createElement(ErrorPage, { error }));
    } finally {
      delete globalThis.__renderedPathname;
    }
  };
  const english = draw("/en/planner", new RangeError("Invalid time value"));
  assert.match(english, /<h1[^>]*>This page could not be displayed<\/h1>/);
  assert.match(english, />Try again</);
  assert.match(english, /href="\/en"[^>]*>Back to the home page</);
  assert.match(english, />Reset this browser’s copy</);
  // The warning of what the reset removes waits behind the button.
  assert.doesNotMatch(english, /Reset and reload/);
  // The message of the error is there, closed, for whoever reports it.
  assert.match(english, /<details>.*RangeError: Invalid time value/);
  const french = draw("/fr/planner", new Error("x"));
  assert.match(french, /Cette page n’a pas pu s’afficher/);
  assert.match(french, /href="\/fr"/);
  assert.match(draw("/nowhere", null), /This page could not be displayed/);
  assert.doesNotMatch(draw("/ja/x", null), /<details>/);
});

test("the reset empties the planner's keys of the browser and nothing else", () => {
  const held = new Map([
    ["astro-portal:planner:v1", "{}"],
    ["astro-portal:planner:space:v1", "{}"],
    ["astro-portal:planner:device-id:v1", "kept"],
    ["astro-portal:plans:target-view:v1", "x"],
    ["astro-portal:tonight:night-slot", "x"],
    ["planner.darkness", "x"],
    ["astro-portal:gallery:fr", "kept"],
    ["theme", "kept"],
  ]);
  const storage = {
    get length() {
      return held.size;
    },
    key: (index) => [...held.keys()][index] ?? null,
    removeItem: (key) => held.delete(key),
  };
  assert.equal(resetPlannerBrowserCopy(storage), 5);
  assert.deepEqual([...held.keys()].sort(), [
    "astro-portal:gallery:fr",
    "astro-portal:planner:device-id:v1",
    "theme",
  ]);
  // A browser that refuses its storage resets nothing and throws nothing.
  assert.equal(
    resetPlannerBrowserCopy({
      get length() {
        throw new Error("denied");
      },
    }),
    0,
  );
  assert.ok(plannerBrowserKeyPrefixes.includes("astro-portal:planner:"));
});
