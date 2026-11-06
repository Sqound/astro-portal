// The web
// dialogs enter with a 200 ms fade and an 8 px rise, leave the same way back,
// and nothing moves under `prefers-reduced-motion`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  WEB_DIALOG_MOTION_MS,
  WEB_DIALOG_MOTION_PX,
  playWebDialogExit,
  reducesMotion,
} from "../src/components/dialog/web-dialog-exit.js";

const css = readFileSync(
  new URL("../../portal-app/styles/portal.css", import.meta.url),
  "utf8",
);
const dialogSource = readFileSync(
  new URL("../src/components/dialog/WebDialog.js", import.meta.url),
  "utf8",
);

const block = (selector) => {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, `${selector} is in portal.css`);
  return css.slice(at, css.indexOf("}", at) + 1);
};

test("a dialog enters with a 200 ms fade and an 8 px rise, its backdrop fading in", () => {
  assert.match(
    block(".web-dialog[open] > :where(.web-dialog-panel)"),
    /animation:\s*web-dialog-enter\s+200ms/,
  );
  assert.match(
    block(".web-dialog[open]::backdrop"),
    /animation:\s*web-dialog-backdrop-enter\s+200ms/,
  );
  const enter = css.slice(css.indexOf("@keyframes web-dialog-enter"));
  assert.match(
    enter.slice(0, enter.indexOf("}\n}") + 3),
    /opacity:\s*0;[\s\S]*transform:\s*translateY\(8px\)/,
  );
  assert.equal(WEB_DIALOG_MOTION_MS, 200);
  assert.equal(WEB_DIALOG_MOTION_PX, 8);
});

test("nothing moves under prefers-reduced-motion: no entry, no exit copy", () => {
  const reduced = [
    ...css.matchAll(
      /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g,
    ),
  ]
    .map((match) => match[1])
    .find((body) => body.includes(".web-dialog[open]"));
  assert.ok(reduced, "a reduced-motion block names the dialogs");
  assert.match(
    reduced,
    /\.web-dialog\[open\] > :where\(\.web-dialog-panel\),\s*\.web-dialog\[open\]::backdrop \{\s*animation: none;/,
  );
  assert.match(reduced, /\.web-dialog-exit \{\s*display: none;/);
});

test("the sheet-like places picker keeps its own slide (the dialogs' entry is the weaker rule)", () => {
  assert.ok(
    css.indexOf(".web-dialog > .places-picker-panel {") >
      css.indexOf(".web-dialog[open] > :where(.web-dialog-panel) {"),
  );
});

test("the exit copy is filtered in red mode like the dialog it replaces", () => {
  assert.match(
    css,
    /html\[data-night-mode="on"\] \.web-dialog-exit:popover-open \{\s*filter: url\(#astro-night-mode-filter\);/,
  );
});

test("WebDialog plays the exit before its dialog closes", () => {
  const cleanup = dialogSource.slice(dialogSource.indexOf("return () => {"));
  assert.ok(
    cleanup.indexOf("playWebDialogExit(") < cleanup.indexOf("dialog.close()"),
  );
});

// A small stand-in for the browser: enough of the DOM for the exit copy.
function fakeBrowser({ reduce = false, popover = true } = {}) {
  const calls = { animations: [], shown: 0, removed: 0, appended: [] };
  const element = (tag) => {
    const node = {
      tagName: tag.toUpperCase(),
      attributes: {},
      children: [],
      className: "",
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
      append(...nodes) {
        this.children.push(...nodes);
      },
      querySelectorAll: () => [],
      cloneNode() {
        return element(tag);
      },
      attachShadow(options) {
        this.shadowOptions = options;
        const root = element("#shadow");
        this.shadow = root;
        return root;
      },
      animate(keyframes, timing) {
        calls.animations.push({ node: this, keyframes, timing });
        return { finished: Promise.resolve() };
      },
      remove() {
        calls.removed += 1;
      },
    };
    if (popover)
      node.showPopover = () => {
        calls.shown += 1;
      };
    return node;
  };
  class FakeSheet {
    replaceSync(text) {
      this.text = text;
    }
  }
  const document = {
    styleSheets: [
      { cssRules: [{ cssText: ".web-dialog-panel { color: red; }" }] },
    ],
    createElement: element,
    body: {
      append(node) {
        calls.appended.push(node);
      },
    },
  };
  return {
    calls,
    env: {
      document,
      CSSStyleSheet: FakeSheet,
      matchMedia: (query) => ({
        matches: reduce && query === "(prefers-reduced-motion: reduce)",
      }),
      setTimeout: () => 0,
    },
    panel: element("div"),
  };
}

test("the exit: a still copy in the top layer fades and falls 8 px in 200 ms, then goes", async () => {
  const { calls, env, panel } = fakeBrowser();
  assert.equal(reducesMotion(env), false);
  assert.equal(playWebDialogExit(panel, env), true);
  const [host] = calls.appended;
  assert.equal(host.className, "web-dialog-exit");
  assert.equal(host.attributes.popover, "manual");
  assert.equal(host.attributes["aria-hidden"], "true");
  assert.ok("inert" in host.attributes);
  // Closed shadow root: no query of the page reaches the copy.
  assert.deepEqual(host.shadowOptions, { mode: "closed" });
  assert.equal(calls.shown, 1);
  const fall = calls.animations.find((call) => call.node !== host);
  assert.deepEqual(fall.keyframes.at(-1), {
    opacity: 0,
    transform: "translateY(8px)",
  });
  assert.equal(fall.timing.duration, 200);
  const fade = calls.animations.find((call) => call.node === host);
  assert.deepEqual(fade.keyframes.at(-1), { opacity: 0 });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls.removed, 1, "the copy goes once its exit is played");
});

test("no exit copy under reduced motion, nor without a popover", () => {
  const reduced = fakeBrowser({ reduce: true });
  assert.equal(reducesMotion(reduced.env), true);
  assert.equal(playWebDialogExit(reduced.panel, reduced.env), false);
  assert.equal(reduced.calls.appended.length, 0);
  const old = fakeBrowser({ popover: false });
  assert.equal(playWebDialogExit(old.panel, old.env), false);
  assert.equal(old.calls.appended.length, 0);
});
