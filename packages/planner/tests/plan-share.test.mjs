import assert from "node:assert/strict";
import test from "node:test";
import { message } from "portal/i18n.js";
import { shippedLocales } from "portal/locales.js";
import { sharePlanText } from "../src/plan-share.js";

const input = { title: "Plan 1", text: "Plan 1 · 3 targets" };

test("the share sheet takes the plan where the browser has one", async () => {
  const calls = [];
  const host = {
    share: async (payload) => calls.push(payload),
    clipboard: { writeText: async () => assert.fail("not copied") },
  };
  assert.equal(await sharePlanText(host, input), "shared");
  assert.deepEqual(calls, [input]);
});

test("a closed share sheet is the person's choice: cancelled, nothing copied", async () => {
  const host = {
    share: async () => {
      throw Object.assign(new Error("closed"), { name: "AbortError" });
    },
    clipboard: { writeText: async () => assert.fail("not copied") },
  };
  assert.equal(await sharePlanText(host, input), "cancelled");
});

test("without a share sheet the clipboard has it, and the outcome says so", async () => {
  let copied = null;
  const host = { clipboard: { writeText: async (text) => (copied = text) } };
  assert.equal(await sharePlanText(host, input), "copied");
  assert.equal(copied, input.text);
  // A share sheet that fails for another reason falls back to the clipboard.
  const failing = {
    share: async () => {
      throw new Error("NotAllowedError");
    },
    clipboard: host.clipboard,
  };
  assert.equal(await sharePlanText(failing, input), "copied");
});

test("a browser that can neither share nor copy says so instead of staying silent", async () => {
  assert.equal(await sharePlanText({}, input), "unavailable");
  assert.equal(await sharePlanText(null, input), "unavailable");
  const refused = {
    clipboard: {
      writeText: async () => {
        throw new Error("denied");
      },
    },
  };
  assert.equal(await sharePlanText(refused, input), "unavailable");
});

test("the three sentences exist in the ten languages", () => {
  assert.equal(shippedLocales().length, 10);
  for (const locale of shippedLocales())
    for (const key of [
      "plannerShared",
      "plannerShareCopied",
      "plannerShareUnavailable",
    ]) {
      const text = message(locale, key);
      assert.ok(text && text !== key, `${locale}.${key}`);
    }
  assert.notEqual(
    message("fr", "plannerShareCopied"),
    message("en", "plannerShareCopied"),
  );
});
