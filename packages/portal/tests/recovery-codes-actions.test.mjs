import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// The screen that shows the recovery codes once offers
// « Copy » and « Download », in every language, beside « I saved them ».
await registerJsx();
const registry = JSON.parse(
  readFileSync(
    new URL("../../astro-contracts/locales/registry.json", import.meta.url),
    "utf8",
  ),
);
const tags = registry.locales.map((entry) => entry.tag);
const { authCopy, RecoveryCodesActions } =
  await import("portal/components/auth/AuthPage.js");

test("every language names the two actions, in its own words", () => {
  assert.deepEqual(Object.keys(authCopy).sort(), [...tags].sort());
  for (const tag of tags)
    for (const key of ["copyCodes", "copiedCodes", "downloadCodes"]) {
      assert.equal(typeof authCopy[tag][key], "string", `${tag} ${key}`);
      if (tag !== "en")
        assert.notEqual(authCopy[tag][key], authCopy.en[key], `${tag} ${key}`);
    }
  assert.equal(authCopy.fr.copyCodes, "Copier");
  assert.equal(authCopy.fr.downloadCodes, "Télécharger");
});

test("the actions draw one button to copy and one to download", () => {
  const markup = renderToStaticMarkup(
    createElement(RecoveryCodesActions, {
      codes: ["AAAA-BBBB", "CCCC-DDDD"],
      copy: authCopy.fr,
    }),
  );
  assert.match(markup, /data-recovery-copy[^>]*>Copier</);
  assert.match(markup, /data-recovery-download[^>]*>Télécharger</);
  assert.equal(markup.match(/<button/g).length, 2);
});
