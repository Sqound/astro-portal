// The four languages added after English and French (German, Spanish,
// Italian, Brazilian Portuguese): their catalogues keep every placeholder
// of the English, no sentence is left in English, the frozen wire-contract
// error strings are never translated, and the e-mails render with the code
// in the subject.
import assert from "node:assert/strict";
import test from "node:test";
import { localizedServerError, messages } from "../src/i18n.js";
import { signInCopy } from "../src/components/space/sign-in-copy.js";
import { spaceCopy } from "../src/components/space/space-copy.js";
import { signInMessage } from "../src/spaces/messages.js";

const LANGUAGES = ["de", "es", "it", "pt-BR"];

const placeholders = (text) =>
  [...String(text).matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)[,}]/g)]
    .map((match) => match[1])
    .sort();
const withoutPlaceholders = (text) =>
  String(text)
    .replace(/\{[^{}]*\}/g, "")
    .trim();

/** Every string leaf of a nested table, keyed by its path. */
function leaves(value, path = "") {
  if (typeof value === "string") return [[path, value]];
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([key, child]) =>
      leaves(child, path ? `${path}.${key}` : key),
    );
  return [];
}

// A value may equal the English only when it is a name, a symbol or a short
// cognate (« Bortle », « Offline », « Filter »): a sentence never is.
const SHORT = 25;

test("web catalogues: every key and every placeholder of the English", () => {
  for (const tag of LANGUAGES) {
    assert.deepEqual(
      Object.keys(messages[tag]),
      Object.keys(messages.en),
      `${tag}: the same keys in the same order`,
    );
    for (const [key, english] of Object.entries(messages.en))
      assert.deepEqual(
        placeholders(messages[tag][key]),
        placeholders(english),
        `${tag}.${key}`,
      );
  }
});

test("the portal's own copy tables keep their placeholders in every language", () => {
  const tables = {
    signInCopy,
    spaceCopy,
  };
  for (const [name, table] of Object.entries(tables)) {
    const english = new Map(leaves(table.en));
    for (const tag of LANGUAGES)
      for (const [path, text] of leaves(table[tag])) {
        if (!english.has(path)) continue;
        assert.deepEqual(
          placeholders(text),
          placeholders(english.get(path)),
          `${name}.${tag}.${path}`,
        );
      }
  }
});

test("no sentence is left in English: only names, symbols and short cognates are identical", () => {
  for (const tag of LANGUAGES) {
    for (const [key, english] of Object.entries(messages.en)) {
      if (messages[tag][key] !== english) continue;
      assert.ok(
        withoutPlaceholders(english).length < SHORT,
        `${tag} web ${key} is the English sentence`,
      );
    }
  }
});

test("the product name stays a placeholder and the frozen error strings are never translated", () => {
  const frozen = "A plan refers to an unknown observing night.";
  for (const tag of LANGUAGES) {
    // The frozen wire-contract string is shown through its message key, and
    // an unknown string passes through untouched.
    assert.notEqual(localizedServerError(tag, frozen), frozen, tag);
    assert.equal(
      localizedServerError(tag, "An error nobody mapped."),
      "An error nobody mapped.",
    );
    for (const value of Object.values(messages[tag]))
      assert.notEqual(value, frozen, `${tag} holds the frozen string itself`);
    for (const [key, english] of Object.entries(messages.en))
      if (english.includes("{productName}"))
        assert.ok(
          messages[tag][key].includes("{productName}"),
          `${tag}.${key} must keep {productName}`,
        );
  }
});

test("the sign-in e-mail renders in each language, the subject carrying the code", () => {
  for (const tag of LANGUAGES) {
    const message = signInMessage({
      code: "481207",
      link: "https://portal.example.test/sign-in#token",
      language: tag,
      productName: "Astro Portal",
      publicUrl: "https://portal.example.test",
    });
    assert.match(message.subject, /481.207/, `${tag} subject`);
    assert.match(message.text, /481.207/, `${tag} text`);
    assert.match(message.html, new RegExp(`<html lang="${tag}">`), tag);
    assert.match(message.html, /481.207/, `${tag} html`);
    assert.doesNotMatch(
      message.text,
      /Sign in|Your code/i,
      `${tag} is English`,
    );
  }
});
