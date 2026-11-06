import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const { clearManageSlots, getManageSlot, registerManageSlot } =
  await import("portal/manage/extensions.js");
const { StorageLine } = await import("portal/components/manage/CapturesTab.js");
const { clearHostedCopy, registerHostedCopy } =
  await import("portal/components/manage/hosted-copy.js");
const { capturesCopyFor } =
  await import("portal/components/manage/captures-copy.js");

// The slot under the free space's count in the tab « Captures »: the core
// draws the block of a composition there only where it registers one and
// where the block says it is shown, and leaves its own link to the offers
// out of the line when the block is drawn. Without a registration the core
// draws the line as it always did.

const storage = { captureCount: 1, captureCountLimit: 3 };
const words = (locale) => ({
  ...capturesCopyFor(locale),
  freeQuota: (count, limit) => `Free · ${count}/${limit}`,
  seeOffers: "See",
});
const line = (props) =>
  renderToStaticMarkup(
    createElement(StorageLine, {
      storage,
      locale: "en",
      copy: words("en"),
      ...props,
    }),
  );
const block = {
  shows: ({ offersHref }) => Boolean(offersHref),
  Component: ({ offersHref, locale }) =>
    createElement("div", { "data-block": locale }, offersHref),
};

test("a slot is a known name with { shows, Component }", () => {
  assert.throws(() => registerManageSlot("elsewhere", block), /Unknown slot/);
  assert.throws(
    () => registerManageSlot("captures.storage", { shows: () => true }),
    /needs/,
  );
  assert.equal(getManageSlot("captures.storage"), null);
});

test("without a registered block, the line keeps its own link to the offers and nothing follows", () => {
  clearManageSlots();
  const html = line({ offersHref: "/en/offers" });
  assert.match(html, /data-storage="count"/);
  assert.match(html, /<a class="btn-link" href="\/en\/offers">See/);
  assert.doesNotMatch(html, /data-block/);
});

test("a registered block is drawn under the line, which leaves its link out", () => {
  clearManageSlots();
  registerManageSlot("captures.storage", block);
  const html = line({ offersHref: "/en/offers" });
  assert.match(html, /data-storage="count"/);
  assert.doesNotMatch(html, /btn-link/);
  assert.match(html, /<div data-block="en">\/en\/offers<\/div>$/);
  assert.ok(html.indexOf('data-storage="count"') < html.indexOf("data-block"));
  clearManageSlots();
});

test("a block that says it is not shown leaves the line as it was", () => {
  clearManageSlots();
  registerManageSlot("captures.storage", block);
  const html = line({ offersHref: null });
  assert.doesNotMatch(html, /data-block/);
  clearManageSlots();
});

test("the slot is asked only under the free space's count: not for a space with a quota, nor in the read-only window, nor without the words of a count", () => {
  clearManageSlots();
  registerManageSlot("captures.storage", block);
  assert.doesNotMatch(
    line({
      storage: { usedBytes: 1000, quotaBytes: 50 * 2 ** 30 },
      offersHref: "/en/offers",
    }),
    /data-block/,
  );
  assert.doesNotMatch(
    line({
      readOnly: true,
      readOnlyUntil: "11 January 2027",
      copy: { ...words("en"), readOnlyUntil: (date) => `Until ${date}` },
      offersHref: "/en/offers",
    }),
    /data-block/,
  );
  clearHostedCopy();
  assert.equal(
    line({ copy: capturesCopyFor("en"), offersHref: "/en/offers" }),
    "",
  );
  clearManageSlots();
});
