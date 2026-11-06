"use client";

import { createElement as h } from "react";

/**
 * The web's one empty state: one sentence, one primary button that names what
 * it does, and the eight-branch star in filigree behind them (10 % opacity,
 * never focusable nor clickable). No link beside the button. The other empty
 * states reuse it.
 *
 * Written with `React.createElement`, so that the server-rendered public
 * pages (and the plain `node --test` runner that
 * renders them in-process) can draw it without a JSX transform.
 *
 * - `sentence`: the one sentence; `detail`: the muted second line some
 *   states draw, `null` for the planner without a place.
 * - `actionLabel`, `onAction`: the primary button (none without a label). `actionIcon` is an
 *   optional element drawn before the label (18 px).
 * - `actionHref`: instead of `onAction`, where the button leads (a string, so
 *   that a server component can draw the state).
 *   It stays a button, not a link: no link goes beside it.
 */
export function EmptyState({
  sentence,
  detail = null,
  actionLabel,
  onAction,
  actionHref = null,
  actionIcon = null,
  actionTestId,
  className = "",
}) {
  return h(
    "div",
    {
      className: `empty-state ${className}`.trim(),
      "data-empty-state": "",
    },
    h(EmptyStateStar),
    h(
      "div",
      { className: "empty-state-content" },
      h("p", { className: "empty-state-sentence" }, sentence),
      detail ? h("p", { className: "empty-state-detail" }, detail) : null,
      // A state without an action (the empty private gallery, read by a
      // visitor who has nothing to do about it) is the sentence alone.
      actionLabel
        ? h(
            "button",
            {
              type: "button",
              className: "btn-primary empty-state-action",
              "data-testid": actionTestId,
              onClick:
                onAction ??
                (actionHref
                  ? () => window.location.assign(actionHref)
                  : undefined),
            },
            actionIcon,
            actionLabel,
          )
        : null,
    ),
  );
}

/**
 * The star in filigree: out of the accessibility tree, the focus order and
 * the hit tests (`pointer-events: none` in the stylesheet).
 */
export function EmptyStateStar() {
  return h(
    "svg",
    {
      className: "empty-state-star",
      viewBox: "-50 -50 100 100",
      "aria-hidden": "true",
      focusable: "false",
    },
    h(
      "g",
      null,
      h("path", {
        d: "M0 -48 L4 -4 L48 0 L4 4 L0 48 L-4 4 L-48 0 L-4 -4 Z",
      }),
      h("path", {
        d: "M0 -26 L3 -3 L26 0 L3 3 L0 26 L-3 3 L-26 0 L-3 -3 Z",
        transform: "rotate(45)",
      }),
    ),
  );
}
