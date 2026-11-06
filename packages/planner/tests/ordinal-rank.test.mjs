import assert from "node:assert/strict";
import test from "node:test";
import { ordinalRank } from "../dist/ordinal-rank.js";

// The rank of a suggestion as an ordinal from rank 1, in each language (the
// same cases as the mobile application's test).
test("a rank is an ordinal of its language, from the first", () => {
  assert.deepEqual(
    [1, 2, 12].map((rank) => ordinalRank("fr", rank)),
    ["1ᵉʳ", "2ᵉ", "12ᵉ"],
  );
  assert.deepEqual(
    [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map((rank) =>
      ordinalRank("en", rank),
    ),
    [
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "101st",
      "111th",
    ],
  );
  assert.equal(ordinalRank("de", 1), "1.");
  assert.equal(ordinalRank("es", 1), "1.º");
  assert.equal(ordinalRank("it", 12), "12º");
  assert.equal(ordinalRank("pt-BR", 1), "1º");
  assert.equal(ordinalRank("ja", 3), "3位");
  assert.equal(ordinalRank("ru", 12), "№ 12");
  assert.equal(ordinalRank("zh-Hans", 12), "第12名");
  assert.equal(ordinalRank("zh-Hant", 12), "第 12 名");
});
