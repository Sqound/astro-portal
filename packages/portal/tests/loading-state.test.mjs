// `LoadingState`: the one waiting state of the portal — the loading star with
// the sentence that says what is awaited, in one `role="status"` region marked
// `aria-busy` — and the screens of "Mon espace" and the gallery that wait with
// it instead of a bare line of text.
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const { LoadingState } = await import("portal/components/LoadingState.js");
const { CapturesView } =
  await import("portal/components/manage/CapturesTab.js");

const draw = (props, children = "Chargement…") =>
  renderToStaticMarkup(createElement(LoadingState, props, children));

test("the star and the caller's words, centred, in one busy status region", () => {
  const markup = draw({});
  assert.match(markup, /^<div [^>]*class="loading-state is-block"/);
  assert.match(markup, /role="status"/);
  assert.match(markup, /aria-busy="true"/);
  assert.match(markup, /aria-live="polite"/);
  assert.match(markup, /data-loading-state="block"/);
  assert.match(markup, /data-brand-loader=""/);
  assert.match(markup, /<span class="loading-state-text">Chargement…<\/span>/);
  // The star is decoration: the sentence is what is announced.
  assert.match(markup, /<svg [^>]*aria-hidden="true"/);
  assert.equal((markup.match(/data-brand-loader/g) || []).length, 1);
});

test("inline is a line inside a card: a smaller star before the sentence", () => {
  const block = draw({});
  const inline = draw({ layout: "inline", className: "mine", testId: "x" });
  assert.match(inline, /class="loading-state is-inline mine"/);
  assert.match(inline, /data-testid="x"/);
  assert.match(inline, /width="18" height="18"/);
  assert.match(block, /width="40" height="40"/);
  assert.match(draw({ size: 30 }), /width="30" height="30"/);
});

test("the words are never changed or added by the component", () => {
  const markup = draw({}, "Lecture de vos données…");
  assert.equal(
    markup.replace(/<style>.*?<\/style>/s, "").replace(/<[^>]+>/g, ""),
    "Lecture de vos données…",
  );
});

test("the list of captures waits with the star, then shows its rows without it", () => {
  const base = {
    locale: "fr",
    actions: {},
    timeZone: "Europe/Paris",
    now: new Date("2026-10-01T12:00:00Z"),
    wide: true,
    offersHref: "/fr/manage/plan",
  };
  const state = (list) => ({
    list,
    detail: { status: "loading", capture: null },
    touched: new Set(),
    retired: new Set(),
    busy: null,
    dialog: null,
    upload: { busy: false, refusal: null },
    failure: null,
    filter: { chip: "", query: "", oldestFirst: false },
    view: "list",
  });
  const waiting = renderToStaticMarkup(
    createElement(CapturesView, {
      ...base,
      state: state({ status: "loading" }),
    }),
  );
  assert.match(waiting, /data-brand-loader/);
  assert.match(waiting, /aria-busy="true"/);
  assert.match(waiting, /Chargement de vos captures…/);
  const failed = renderToStaticMarkup(
    createElement(CapturesView, {
      ...base,
      state: state({ status: "failed" }),
    }),
  );
  assert.doesNotMatch(failed, /data-brand-loader/);
  assert.doesNotMatch(failed, /Chargement de vos captures…/);
});
