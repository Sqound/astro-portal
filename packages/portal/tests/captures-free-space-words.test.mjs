// The words of the web -- the free space's count with its
// plural, what « Synchroniser avec la session » came to, and the sentence of
// the session deletion that says the captures still count in the space.
import assert from "node:assert/strict";
import test from "node:test";
import { shippedLocales } from "astro-contracts/locales";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const { capturesCopyFor } =
  await import("portal/components/manage/captures-copy.js");
const { integrationSignature } =
  await import("portal/components/manage/captures-list.js");
const { SessionDeleteBody } =
  await import("portal/components/sessions/JournalSessionMenu.js");
const { message } = await import("portal/i18n.js");

test("« 1 capture sur 3 », « 0 capture sur 3 » — the count agrees in French and Italian, and shows its number in every language", () => {
  const fr = capturesCopyFor("fr");
  assert.equal(fr.usage(0, 3), "0 capture sur 3");
  assert.equal(fr.usage(1, 3), "1 capture sur 3");
  assert.equal(fr.usage(2, 3), "2 captures sur 3");
  assert.equal(fr.usage(3, 3), "3 captures sur 3");
  const it = capturesCopyFor("it");
  assert.equal(it.usage(1, 3), "1 ripresa su 3");
  assert.equal(it.usage(0, 3), "0 riprese su 3");
  assert.equal(it.usage(3, 3), "3 riprese su 3");
  for (const locale of shippedLocales()) {
    for (const count of [0, 1, 2, 3]) {
      assert.ok(
        capturesCopyFor(locale).usage(count, 3).includes(String(count)),
        `${locale} ${count}`,
      );
    }
  }
});

const line = (overrides = {}) => ({
  id: "declared:m31",
  filter: "L",
  frameCount: 40,
  exposureSeconds: 180,
  gain: 100,
  integrationSeconds: 7200,
  origin: "session",
  edited: false,
  ...overrides,
});
const capture = (lines, totals = {}) => ({
  metadata: {
    acquisition: {
      source: "session",
      lines,
      totalFrames: lines.reduce((sum, entry) => sum + entry.frameCount, 0),
      totalSeconds: lines.reduce(
        (sum, entry) => sum + entry.integrationSeconds,
        0,
      ),
      ...totals,
    },
  },
});

test("two captures with the same lines have the same signature; a step gained, a line corrected or a new origin changes it", () => {
  const before = capture([line()]);
  assert.equal(
    integrationSignature(before),
    integrationSignature(capture([line()])),
  );
  assert.notEqual(
    integrationSignature(before),
    integrationSignature(capture([line(), line({ id: "declared:m42" })])),
    "a line gained",
  );
  assert.notEqual(
    integrationSignature(before),
    integrationSignature(capture([line({ frameCount: 41 })])),
    "a line changed",
  );
  assert.notEqual(
    integrationSignature(before),
    integrationSignature(capture([line({ origin: "astro-sync" })])),
    "another origin",
  );
  assert.equal(
    integrationSignature({}),
    integrationSignature({ metadata: { acquisition: { lines: [] } } }),
    "a capture without lines is a capture without lines",
  );
});

test("the two words of the synchronisation are written in every shipped language, not left in English", () => {
  const en = capturesCopyFor("en");
  assert.equal(typeof en.syncNothing, "string");
  for (const locale of shippedLocales()) {
    const copy = capturesCopyFor(locale);
    assert.ok(copy.syncNothing.length > 5, locale);
    assert.ok(copy.syncDone.length > 5, locale);
    if (locale === "en") continue;
    assert.notEqual(copy.syncNothing, en.syncNothing, locale);
    assert.notEqual(copy.syncDone, en.syncDone, locale);
  }
});

test("the deletion of a session that has captures says they still count in the space until it is erased — and says nothing when it has none", () => {
  // The dialog is a plain function of its props: its element tree is read
  // (the shell's WebDialog draws nothing on the server).
  const textOf = (node) =>
    typeof node === "string"
      ? node
      : Array.isArray(node)
        ? node.map(textOf).join(" ")
        : node?.props
          ? textOf(node.props.children)
          : "";
  const dialog = (locale, captureCount) =>
    textOf(
      // The words of the dialog are its body's (SPACE-DATA-MANAGE-01).
      SessionDeleteBody({
        locale,
        item: { captureCount },
      }),
    );
  for (const locale of shippedLocales()) {
    const sentence = message(locale, "sessionDeleteCapturesCounted");
    assert.ok(sentence.length > 8, locale);
    assert.notEqual(sentence, "sessionDeleteCapturesCounted", locale);
    assert.ok(dialog(locale, 2).includes(sentence), locale);
    assert.ok(!dialog(locale, 0).includes(sentence), locale);
  }
});
