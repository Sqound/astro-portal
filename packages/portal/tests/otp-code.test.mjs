import assert from "node:assert/strict";
import test from "node:test";
import {
  OTP_LENGTH,
  otpDigitOfKey,
  otpDigits,
  otpInsert,
} from "../src/components/otp-code.js";

// A code typed on a keyboard did not fill the six cells while a paste did. The
// digit of a key is read from the key; a pasted text is written from the cell
// it lands in.

test("six cells, empty where nothing is written", () => {
  assert.equal(OTP_LENGTH, 6);
  assert.deepEqual(otpDigits(""), ["", "", "", "", "", ""]);
  assert.deepEqual(otpDigits("123"), ["1", "2", "3", "", "", ""]);
  assert.deepEqual(otpDigits(undefined), ["", "", "", "", "", ""]);
});

test("typing the six digits one after the other fills the code", () => {
  let value = "";
  let cell = 0;
  for (const key of "483920") {
    assert.equal(otpDigitOfKey({ key }), key);
    const written = otpInsert(otpDigits(value), cell, key);
    value = written.next.join("");
    cell = written.focus;
  }
  assert.equal(value, "483920");
  assert.equal(cell, 5, "the caret stays on the last cell");
});

test("a digit typed in a cell that holds one replaces it", () => {
  const written = otpInsert(otpDigits("123456"), 2, "9");
  assert.equal(written.next.join(""), "129456");
  assert.equal(written.focus, 3);
});

test("a paste lands from its cell on, digits only, no more than the cells left", () => {
  assert.equal(otpInsert(otpDigits(""), 0, "483 920").next.join(""), "483920");
  assert.equal(
    otpInsert(otpDigits("12"), 2, "34-56-78").next.join(""),
    "123456",
  );
  assert.equal(otpInsert(otpDigits(""), 0, "abc"), null);
  assert.equal(otpInsert(otpDigits(""), 0, ""), null);
});

test("only a digit key writes; a shortcut or another key is left to the browser", () => {
  for (const key of [
    "a",
    "Backspace",
    "Tab",
    "ArrowLeft",
    "Unidentified",
    " ",
    "٣",
  ]) {
    assert.equal(otpDigitOfKey({ key }), null, key);
  }
  assert.equal(otpDigitOfKey({ key: "v", ctrlKey: true }), null);
  assert.equal(otpDigitOfKey({ key: "5", metaKey: true }), null);
  assert.equal(otpDigitOfKey({ key: "5", altKey: true }), null);
  assert.equal(otpDigitOfKey({}), null);
});

test("both code inputs read their keys and their pastes through these functions", async () => {
  const { readFile } = await import("node:fs/promises");
  for (const file of [
    "../src/components/space/SpaceSignInPage.js",
    "../src/components/auth/AuthPage.js",
  ]) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    for (const name of ["otpDigitOfKey", "otpDigits", "otpInsert"]) {
      assert.match(source, new RegExp(name), `${file} uses ${name}`);
    }
    assert.match(source, /onFocus=\{\(event\) => event\.target\.select\(\)\}/);
  }
});
