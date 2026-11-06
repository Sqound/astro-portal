// « Les règles du jeu de calibration » leads to a stable page of the site
// that exists in every shipped language, never to a source repository.
import assert from "node:assert/strict";
import test from "node:test";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const { contributionRulesUrl } =
  await import("portal/components/space/SpacePage.js");

test("the rules link is a page of planastro.space, never the repository", () => {
  for (const locale of ["fr", "en", "ja", "xx", undefined]) {
    const url = contributionRulesUrl(locale);
    assert.match(
      url,
      /^https:\/\/www\.planastro\.space\/[A-Za-z-]+\/privacy\/$/,
    );
    assert.ok(!url.includes("github"));
  }
  assert.equal(
    contributionRulesUrl("zh-Hant"),
    "https://www.planastro.space/zh-Hant/privacy/",
  );
  assert.equal(
    contributionRulesUrl("xx"),
    "https://www.planastro.space/en/privacy/",
  );
});
