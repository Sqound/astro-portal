import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const { getManageTab, getManageTabs, registerManageTab } =
  await import("portal/manage/extensions.js");
const { SpaceView, tabsWith } =
  await import("portal/components/space/SpacePage.js");

// The tab seam of « Mon espace »: an extension registers a tab; the page
// draws it only where the request names it (`extraTabs`), after the
// built-in tabs, with its panel when open. Without an extension the page
// draws the built-in tabs alone.

const state = {
  space: { status: "ready", email: "camille@exemple.test" },
  devices: { status: "ready", list: [], refreshing: false },
  ended: null,
  notice: null,
  dialog: null,
  browser: { busy: false, error: null },
};
const view = (props) =>
  renderToStaticMarkup(
    createElement(SpaceView, {
      locale: "fr",
      state,
      actions: {},
      ...props,
    }),
  );
const tabsOf = (html) =>
  [...html.matchAll(/role="tab"[^>]*>([^<]+)</g)].map((match) => match[1]);

test("without a registered tab, « Mon espace » draws the core's tabs alone, whatever extraTabs says", () => {
  assert.equal(getManageTab("extra"), null);
  const html = view({ tab: "settings", extraTabs: ["extra"] });
  assert.deepEqual(tabsOf(html), [
    "Captures",
    "Plans",
    "Sessions",
    "Matériel",
    "Galerie privée",
    "Appareils",
    "Exports",
    "Réglages",
  ]);
});

test("a registered tab is drawn last only when the request names it, its panel when it is open", () => {
  assert.throws(() => registerManageTab("Extra!", {}), /plain name/);
  registerManageTab("extra", {
    label: () => "Extra",
    Component: ({ locale, item }) =>
      createElement("p", { "data-extension": "" }, `${locale}:${item}`),
  });
  assert.deepEqual(
    getManageTabs().map(([name]) => name),
    ["extra"],
  );
  assert.deepEqual(tabsOf(view({ tab: "settings" })), [
    "Captures",
    "Plans",
    "Sessions",
    "Matériel",
    "Galerie privée",
    "Appareils",
    "Exports",
    "Réglages",
  ]);
  const html = view({
    tab: "extra",
    extraTabs: ["extra"],
    extension: createElement("p", { "data-extension": "" }, "fr:mounts"),
  });
  assert.deepEqual(tabsOf(html), [
    "Captures",
    "Plans",
    "Sessions",
    "Matériel",
    "Galerie privée",
    "Appareils",
    "Exports",
    "Réglages",
    "Extra",
  ]);
  assert.match(html, /href="\/fr\/manage\/extra"/);
  assert.match(html, /aria-selected="true"[^>]*>Extra</);
  assert.match(html, /data-extension="">fr:mounts</);
  // Another tab open: the extension's panel is not drawn.
  assert.doesNotMatch(
    view({ tab: "exports", extraTabs: ["extra"], extension: null }),
    /data-extension/,
  );
});

test("a tab that names the one it follows is drawn after it, in the order it was registered; an unknown anchor sends it last", () => {
  registerManageTab("after-devices", {
    label: () => "Après",
    after: "devices",
    Component: () => null,
  });
  registerManageTab("after-devices-bis", {
    label: () => "Après bis",
    after: "devices",
    Component: () => null,
  });
  registerManageTab("lost", {
    label: () => "Perdu",
    after: "nowhere",
    Component: () => null,
  });
  assert.deepEqual(
    tabsWith(
      ["captures", "devices", "exports"],
      ["lost", "after-devices", "after-devices-bis"],
    ),
    [
      "captures",
      "devices",
      "after-devices",
      "after-devices-bis",
      "exports",
      "lost",
    ],
  );
  const html = view({
    tab: "exports",
    extraTabs: ["after-devices", "after-devices-bis"],
  });
  assert.deepEqual(tabsOf(html), [
    "Captures",
    "Plans",
    "Sessions",
    "Matériel",
    "Galerie privée",
    "Appareils",
    "Après",
    "Après bis",
    "Exports",
    "Réglages",
  ]);
});
