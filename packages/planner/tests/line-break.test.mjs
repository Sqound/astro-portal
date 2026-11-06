// A CJK place name never leaves its last character alone on a line. The header
// of "Cette nuit" and its sticky bar use the helper.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { keepLastCharactersTogether } from "../src/line-break.js";

test("the last characters of a name stay together", () => {
  assert.equal(
    keepLastCharactersTogether("BASEGATE audit横浜関内"),
    "BASEGATE audit横浜関⁠内",
  );
  assert.equal(
    keepLastCharactersTogether("Camping du Lac Noir"),
    "Camping du Lac Noir",
  );
  assert.equal(keepLastCharactersTogether("横浜"), "横浜");
  assert.equal(keepLastCharactersTogether("Lac横"), "Lac横");
  assert.equal(keepLastCharactersTogether(""), "");
  assert.equal(keepLastCharactersTogether("星空カフェ"), "星空カフ⁠ェ");
  assert.equal(keepLastCharactersTogether("서울공원"), "서울공⁠원");
  // Only a display form: taking the joiner out gives the name back.
  assert.equal(
    keepLastCharactersTogether("ベースゲート audit横浜関内").replace("⁠", ""),
    "ベースゲート audit横浜関内",
  );
});

test("the page header and both places of the sticky bar draw the name through it", () => {
  const source = readFileSync(
    new URL("../src/components/TonightPage.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /keepLastCharactersTogether\(words\.placeName\)/);
  assert.equal(
    source.match(/keepLastCharactersTogether\(sticky\.place\)/g).length,
    2,
  );
  assert.doesNotMatch(source, />\{words\.placeName\}</);
  assert.doesNotMatch(source, />\{sticky\.place\}</);
});
