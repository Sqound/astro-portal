"use client";

import {
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { message } from "portal/i18n.js";
import {
  readTargetView,
  subscribeTargetView,
  writeTargetView,
} from "../plan-frise-preferences.js";
import { fill } from "../wind-section.js";
import {
  estimateTextWidth,
  planFriseLayout,
  planFriseSizes,
} from "../plan-frise-layout.js";
import {
  planFriseCaption,
  planFriseReducedSentence,
  planFriseSentence,
  planFriseSpanSentence,
} from "../plan-frise-words.js";

// The plan as a frise on the web: the hours, one block per target over its
// slot, the height of that target as a curve inside its block, the twilights as
// the two grey gradients of the night band, two dashed reference heights. It
// draws the result of `planFrise` (`plan-frise.js`), which is the plan as
// planned and never an execution, and the layout of `plan-frise-layout.js`.
//
// Two variants: `full` (the plan card of "Cette nuit", 330 × 146 at most)
// and `reduced` (under each plan of the list, 328 × 60 at most). The frise is
// **one image** for a screen reader — its sentence — and has no
// gesture of its own. It never relies on hue alone: blocks have a fill and an
// edge, curves a line, references dashes. Its colours are `.plan-frise-*` in
// `portal.css`, so the red night mode of the page filters it with the rest.

/**
 * How the plans show their targets, kept in this browser: `compact`, `details` or `frise`.
 */
export function usePlanTargetView() {
  const view = useSyncExternalStore(
    (listener) => subscribeTargetView(listener),
    () => readTargetView(),
    () => "compact",
  );
  return [view, (next) => writeTargetView(next)];
}

// The width of a text in the font the drawing uses, measured on a canvas; an
// estimate where there is none (a server render).
function textMeter(box) {
  let context = null;
  let family = "";
  try {
    context = document.createElement("canvas").getContext("2d");
    family = box ? getComputedStyle(box).fontFamily : "";
  } catch {
    context = null;
  }
  if (!context) return estimateTextWidth;
  return (text, { size, weight }) => {
    context.font = `${weight} ${size}px ${family || "sans-serif"}`;
    return context.measureText(text).width;
  };
}

/**
 * The frise of one plan. `frise` is the result of `planFrise`; `clock(iso)`
 * writes an instant in the time of the place the page shows (the card's own
 * hours); `variant` is `full` or `reduced`.
 */
export function PlanFrise({
  frise,
  locale,
  clock,
  variant = "full",
  onBlock = null,
}) {
  const full = variant !== "reduced";
  const size = planFriseSizes[full ? "full" : "reduced"];
  const identifier = useId().replace(/[^a-zA-Z0-9]/g, "");
  // The drawing is as wide as its box, up to a fixed size: its texts keep the
  // size they have at 390 px at every width.
  const [box, setBox] = useState(null);
  const [boxWidth, setBoxWidth] = useState(size.maxWidth);
  useEffect(() => {
    if (!box) return undefined;
    const measure = () => {
      const measured = Math.round(box.getBoundingClientRect().width);
      if (measured > 0) setBoxWidth(measured);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [box]);
  const meter = useMemo(() => textMeter(box), [box]);
  const layout = planFriseLayout(frise, {
    width: boxWidth,
    variant,
    measure: meter,
    captionText: full ? planFriseCaption(locale) : "",
  });
  // "Nuit choisie de 20:40 à 00:40." closes the sentence when the
  // plan chose a night.
  const sentence = [
    (full ? planFriseSentence : planFriseReducedSentence)(frise, {
      locale,
      clock,
    }),
    planFriseSpanSentence(frise, { locale, clock }),
  ]
    .filter(Boolean)
    .join(" ");
  const { plot } = layout;
  const evening = Math.max(
    0,
    Math.min(layout.night.x0, plot.right) - plot.left,
  );
  const dawn = Math.max(0, plot.right - Math.max(layout.night.x1, plot.left));
  const id = (name) => `plan-frise-${name}-${identifier}`;
  // The night the plan chose — a grey hatch outside the two
  // gold lines (diagonals, never a tint alone), the lines with their hours at
  // the foot of the full frise, the blocks beyond greyed (a dashed edge) and,
  // on a line, gold inside and grey outside. Never the weather, on the web.
  const span = layout.span;
  const outsideRects = span
    ? [
        [0, span.x0],
        [span.x1, layout.width],
      ]
    : [];
  return (
    <div
      className={`plan-frise-box is-${layout.variant}`}
      ref={setBox}
      data-plan-frise={layout.variant}
    >
      <svg
        className="plan-frise"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width={layout.width}
        height={layout.height}
        role="img"
        aria-label={sentence}
      >
        <defs>
          <linearGradient id={id("evening")} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" className="plan-frise-twilight-light" />
            <stop offset="1" className="plan-frise-twilight-dark" />
          </linearGradient>
          <linearGradient id={id("dawn")} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" className="plan-frise-twilight-dark" />
            <stop offset="1" className="plan-frise-twilight-light" />
          </linearGradient>
          {span ? (
            <>
              <pattern
                id={id("hatch")}
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="6" height="6" className="plan-frise-hatch-base" />
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="6"
                  className="plan-frise-hatch-line"
                />
              </pattern>
              <clipPath id={id("inside")}>
                <rect
                  x={span.x0}
                  y="0"
                  width={Math.max(0, span.x1 - span.x0)}
                  height={layout.height}
                />
              </clipPath>
              <clipPath id={id("outside")}>
                {outsideRects.map(([from, to]) => (
                  <rect
                    key={from}
                    x={from}
                    y="0"
                    width={Math.max(0, to - from)}
                    height={layout.height}
                  />
                ))}
              </clipPath>
            </>
          ) : null}
          <clipPath id={id("plot")}>
            <rect
              x={plot.left}
              y={plot.top}
              width={plot.width}
              height={plot.height}
              rx="6"
            />
          </clipPath>
        </defs>
        {full ? (
          <g className="plan-frise-ticks">
            {layout.ticks.map((tick, index) => (
              <line key={index} x1={tick.x} y1="16" x2={tick.x} y2="20" />
            ))}
          </g>
        ) : null}
        {full ? (
          <g className="plan-frise-hours" textAnchor="middle">
            {layout.ticks
              .filter((tick) => tick.labelled)
              .map((tick, index) => (
                <text key={index} x={tick.x} y="12">
                  {tick.text}
                </text>
              ))}
          </g>
        ) : null}
        <g clipPath={`url(#${id("plot")})`}>
          <rect
            className="plan-frise-plot"
            x={plot.left}
            y={plot.top}
            width={plot.width}
            height={plot.height}
          />
          <rect
            x={plot.left}
            y={plot.top}
            width={evening}
            height={plot.height}
            fill={`url(#${id("evening")})`}
          />
          <rect
            x={plot.right - dawn}
            y={plot.top}
            width={dawn}
            height={plot.height}
            fill={`url(#${id("dawn")})`}
          />
        </g>
        {layout.blocks.map((block, index) => {
          const shape = (greyed) => (
            <>
              <rect
                className={`plan-frise-block${greyed ? " is-greyed" : ""}`}
                x={block.left}
                y={plot.top}
                width={block.right - block.left}
                height={plot.height}
                rx="6"
              />
              <rect
                className={`plan-frise-block-edge${greyed ? " is-greyed" : ""}`}
                x={block.left}
                y={plot.top}
                width={block.right - block.left}
                height={plot.height}
                rx="6"
              />
            </>
          );
          if (!span || block.fit === "inside")
            return <g key={index}>{shape(false)}</g>;
          if (block.fit === "outside")
            return (
              <g key={index} data-fit="outside">
                {shape(true)}
              </g>
            );
          return (
            <g key={index} data-fit="straddling">
              <g clipPath={`url(#${id("inside")})`}>{shape(false)}</g>
              <g clipPath={`url(#${id("outside")})`}>{shape(true)}</g>
            </g>
          );
        })}
        <g className="plan-frise-reference">
          {layout.heights.map((height) => (
            <line
              key={height.degrees}
              x1={plot.left}
              y1={height.y}
              x2={plot.right}
              y2={height.y}
            />
          ))}
        </g>
        {full ? (
          <g className="plan-frise-heights" textAnchor="end">
            {layout.heights.map((height) => (
              <text key={height.degrees} x={height.labelX} y={height.labelY}>
                {`${height.degrees}°`}
              </text>
            ))}
          </g>
        ) : null}
        <g clipPath={`url(#${id("plot")})`}>
          {layout.blocks.map((block, index) => {
            if (!block.curve) return null;
            if (!span || block.fit === "inside")
              return (
                <path
                  key={index}
                  className="plan-frise-curve"
                  d={block.curve}
                />
              );
            if (block.fit === "outside")
              return (
                <path
                  key={index}
                  className="plan-frise-curve is-greyed"
                  d={block.curve}
                />
              );
            return (
              <g key={index}>
                <path
                  className="plan-frise-curve"
                  d={block.curve}
                  clipPath={`url(#${id("inside")})`}
                />
                <path
                  className="plan-frise-curve is-greyed"
                  d={block.curve}
                  clipPath={`url(#${id("outside")})`}
                />
              </g>
            );
          })}
        </g>
        {layout.blocks.map((block, index) =>
          block.name ? (
            <text
              key={index}
              className={`plan-frise-name${span && block.greyed ? " is-greyed" : ""}`}
              x={block.name.x}
              y={block.name.y}
              textAnchor="middle"
            >
              {block.name.text}
            </text>
          ) : null,
        )}
        {span ? (
          <g className="plan-frise-span" data-beyond={span.beyond}>
            <g clipPath={`url(#${id("plot")})`}>
              {outsideRects.map(([from, to]) => (
                <rect
                  key={from}
                  className="plan-frise-hatch"
                  x={Math.max(from, plot.left)}
                  y={plot.top}
                  width={Math.max(
                    0,
                    Math.min(to, plot.right) - Math.max(from, plot.left),
                  )}
                  height={plot.height}
                  fill={`url(#${id("hatch")})`}
                />
              ))}
            </g>
            {[span.x0, span.x1].map((x, index) =>
              x > plot.left && x < plot.right ? (
                <line
                  key={index}
                  className="plan-frise-span-line"
                  x1={x}
                  y1={plot.top}
                  x2={x}
                  y2={plot.bottom + (full ? 3 : 0)}
                />
              ) : null,
            )}
            {full ? (
              <>
                {span.x0 > plot.left && span.x0 < plot.right ? (
                  <text
                    className="plan-frise-span-hour"
                    x={span.x0 - 3}
                    y={plot.bottom + 13}
                    textAnchor="end"
                  >
                    {clock(span.start)}
                  </text>
                ) : null}
                {span.x1 > plot.left && span.x1 < plot.right ? (
                  <text
                    className="plan-frise-span-hour"
                    x={span.x1 + 3}
                    y={plot.bottom + 13}
                  >
                    {clock(span.end)}
                  </text>
                ) : null}
              </>
            ) : null}
          </g>
        ) : (
          <g className="plan-frise-night-lines">
            <line
              x1={layout.night.x0}
              y1={plot.top}
              x2={layout.night.x0}
              y2={plot.bottom}
            />
            <line
              x1={layout.night.x1}
              y1={plot.top}
              x2={layout.night.x1}
              y2={plot.bottom}
            />
          </g>
        )}
        {layout.caption ? (
          <text
            className="plan-frise-caption"
            x={layout.caption.x}
            y={layout.caption.y}
          >
            {layout.caption.text}
          </text>
        ) : null}
      </svg>
      {onBlock ? (
        // On "Cette nuit" each block is a button that opens the sheet of its
        // target, at least 24 px wide, as tall as the plot.
        <div className="plan-frise-blocks">
          {layout.blocks.map((block) => {
            const source = (frise.blocks || []).find(
              (entry) => entry.key === block.key,
            );
            const width = Math.max(24, block.right - block.left);
            const centre = (block.left + block.right) / 2;
            return (
              <button
                key={block.key}
                type="button"
                className="plan-frise-block-button"
                data-block={block.key}
                style={{
                  left: centre - width / 2,
                  top: plot.top,
                  width,
                  height: plot.height,
                }}
                aria-label={
                  source?.start && source?.end
                    ? fill(message(locale, "planFriseBlockOpen"), {
                        target: block.label ?? "",
                        start: clock(source.start),
                        end: clock(source.end),
                      })
                    : String(block.label ?? "")
                }
                onClick={() => onBlock(block.key)}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

const targetViewGlyphs = {
  compact: (
    <>
      <rect x="3" y="5" width="8" height="5.5" rx="1.8" />
      <rect x="13.5" y="5" width="7.5" height="5.5" rx="1.8" />
      <rect x="3" y="13.5" width="11" height="5.5" rx="1.8" />
    </>
  ),
  details: (
    <>
      <rect x="3" y="4" width="18" height="7" rx="2" />
      <rect x="3" y="13" width="18" height="7" rx="2" />
      <path d="M6.5 7.5h3M6.5 16.5h3" />
    </>
  ),
  frise: (
    <>
      <path d="M3 20h18" />
      <rect x="4" y="9" width="5" height="8" rx="1.2" />
      <rect x="10" y="6" width="5" height="11" rx="1.2" />
      <rect x="16" y="11" width="4" height="6" rx="1.2" />
    </>
  ),
};

const targetViewKeys = {
  compact: "planTargetViewCompact",
  details: "planTargetViewDetails",
  frise: "planTargetViewFrise",
};

// The same control on Planifier and "Tous les plans", named for
// the plans it shows.
const planViewKeys = {
  compact: "planTargetViewPlansCompact",
  details: "planTargetViewPlansDetails",
  frise: "planTargetViewPlansFrise",
};

/**
 * The three-icon control of "Votre plan de ce soir": the app's segmented control
 * (12 px group, 8 px choices, the chosen one in the secondary look) with the
 * three glyphs — compact, details, frise. Disabled (dotted edge,
 * grey glyphs, no choice marked) while no plan has a target placed: it
 * keeps its place so that the heading does not move.
 */
export function PlanTargetViewButtons({
  locale,
  view,
  onChange,
  disabled,
  plans = false,
}) {
  const off = disabled === true;
  const keys = plans ? planViewKeys : targetViewKeys;
  return (
    <div
      role="radiogroup"
      aria-label={message(
        locale,
        plans ? "planTargetViewPlansLabel" : "planTargetViewLabel",
      )}
      aria-disabled={off || undefined}
      className={`plan-target-view${off ? " is-disabled" : ""}`}
    >
      {Object.keys(targetViewGlyphs).map((value) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={!off && view === value}
          aria-label={message(locale, keys[value])}
          title={message(locale, keys[value])}
          data-view={value}
          className={!off && view === value ? "is-active" : undefined}
          disabled={off}
          onClick={() => onChange(value)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {targetViewGlyphs[value]}
          </svg>
        </button>
      ))}
    </div>
  );
}
