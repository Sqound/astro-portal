"use client";

import { BrandLoader } from "portal/components/BrandLoader.js";

// The waiting state of the portal: the loading star and the sentence that says
// what is awaited, together, so that no screen shows a bare line of text while
// something loads. It is one `role="status"` region marked `aria-busy`. The
// words are the caller's (`children`): this component never writes any.
//
// - `layout="block"` (the default) centres the star above the sentence, for a
//   list, a pane or a page that waits for its content;
// - `layout="inline"` puts the star before the sentence on one line, for a
//   line inside a card, a form or a toolbar.

/**
 * @param {object} props
 * @param {import("react").ReactNode} props.children the sentence shown with the star
 * @param {"block" | "inline"} [props.layout]
 * @param {number} [props.size] the star's size, in pixels
 * @param {string} [props.className]
 * @param {string} [props.testId]
 * @param {boolean} [props.polite] announce the sentence to screen readers (on by default)
 * @param {Record<string, unknown>} [props.rest] other attributes (`data-*`)
 */
export function LoadingState({
  children,
  layout = "block",
  size,
  className = "",
  testId,
  polite = true,
  ...rest
}) {
  return (
    <div
      {...rest}
      className={`loading-state is-${layout}${className ? ` ${className}` : ""}`}
      role="status"
      aria-busy="true"
      aria-live={polite ? "polite" : undefined}
      data-loading-state={layout}
      data-testid={testId}
    >
      <BrandLoader
        className="loading-state-star"
        size={size ?? (layout === "inline" ? 18 : 40)}
      />
      <span className="loading-state-text">{children}</span>
    </div>
  );
}
