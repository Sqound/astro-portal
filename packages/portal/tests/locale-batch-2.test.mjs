import assert from "node:assert/strict";
import test from "node:test";
import {
  decimalComma,
  messages,
  normalizeSearch,
  sentenceSeparator,
} from "../dist/i18n.js";
import {
  plannerFlowMessage,
  plannerFlowMessages,
} from "../dist/planner/flow-messages.js";
import { nightDateLabel } from "../dist/planner/state.js";
import { fontStack } from "../dist/spaces/email-fonts.js";
import { readIcu } from "./helpers/icu-message.mjs";

// The web side of the second batch of languages: the catalogue's own
// rules and the small language rules of the web.
const locales = ["zh-Hans", "zh-Hant", "ru"];

test("each catalogue holds every English key, with the same arguments", () => {
  const english = Object.keys(messages.en);
  for (const locale of locales) {
    assert.deepEqual(Object.keys(messages[locale]), english, locale);
    for (const key of english) {
      const source = readIcu(messages.en[key]);
      const own = readIcu(messages[locale][key]);
      assert.equal(own.error, null, `${locale} ${key}`);
      assert.deepEqual(own.names, source.names, `${locale} ${key}`);
    }
  }
});

test("the planner flow's messages: the same keys and arguments as English, English for a key a language lacks", () => {
  for (const locale of locales) {
    assert.ok(Object.keys(plannerFlowMessages[locale]).length >= 120, locale);
    assert.deepEqual(
      Object.keys(plannerFlowMessages[locale]).sort(),
      Object.keys(plannerFlowMessages.en).sort(),
      `${locale}: the complete flow catalogue`,
    );
    for (const [key, text] of Object.entries(plannerFlowMessages[locale])) {
      const english = plannerFlowMessage("en", key);
      assert.notEqual(english, key, `${locale}: an unknown key ${key}`);
      assert.deepEqual(
        readIcu(text).names,
        readIcu(english).names,
        `${locale} ${key}`,
      );
      assert.equal(plannerFlowMessage(locale, key), text);
    }
  }
  assert.equal(
    plannerFlowMessage("zh-Hans", "noSuchKey"),
    "noSuchKey",
    "an unknown key is its own text",
  );
});

test("sentences run together in Chinese and Japanese, and take a space elsewhere", () => {
  for (const locale of ["ja", "zh-Hans", "zh-Hant"])
    assert.equal(sentenceSeparator(locale), "", locale);
  for (const locale of ["en", "fr", "ru", "de", "pt-BR"])
    assert.equal(sentenceSeparator(locale), " ", locale);
});

test("French and Russian write decimals with a comma", () => {
  assert.equal(decimalComma("fr"), true);
  assert.equal(decimalComma("ru"), true);
  for (const locale of ["en", "ja", "zh-Hans", "zh-Hant"])
    assert.equal(decimalComma(locale), false, locale);
});

test("the night's label is written out in Chinese and Russian", () => {
  assert.equal(
    nightDateLabel("2024-06-15", "zh-Hans"),
    "2024年6月15日至16日的观测夜",
  );
  assert.equal(
    nightDateLabel("2024-12-31", "zh-Hant"),
    "2024年12月31日至2025年1月1日的觀測夜",
  );
  assert.equal(
    nightDateLabel("2024-02-29", "ru"),
    "Ночь с 29 февраля на 1 марта 2024 г.",
  );
  assert.equal(
    nightDateLabel("2024-12-31", "ru"),
    "Ночь с 31 декабря 2024 г. на 1 января 2025 г.",
  );
});

test("a search for a Russian name finds it with or without « ё », and full-width digits fold", () => {
  assert.equal(
    normalizeSearch("Звёздное скопление", "ru"),
    normalizeSearch("звездное скопление", "ru"),
  );
  assert.equal(normalizeSearch("ＮＧＣ　７０００", "zh-Hans"), "ngc 7000");
});

test("a Chinese e-mail asks for its script's faces before the Japanese ones", () => {
  assert.match(fontStack("zh-Hans"), /^[^;]*'PingFang SC'.*'Hiragino Sans'/);
  assert.match(fontStack("zh-Hant"), /^[^;]*'PingFang TC'.*'Hiragino Sans'/);
  assert.ok(!fontStack("ru").includes("PingFang"));
  assert.ok(fontStack("ja").startsWith("-apple-system"));
});
