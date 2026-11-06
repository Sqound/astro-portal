// Where everything of a plan frise sits, in pixels: the result of `planFrise` laid
// out for a box of a given width. Pure, no DOM: the width of a text is asked of
// the `measure` the caller gives (a canvas in the browser, an estimate on a
// server), so the layout is tested without a browser.
//
// Two variants: `full`, at most 330 px wide and 146 high (hours on
// top, the plot 100 high for 0°–90°, the references labelled, the names at the
// foot of the blocks, a caption), and `reduced`, at most 328 × 60 (the plot 44
// high, no hour, the references unlabelled, the names under the blocks).
// A width above the maximum is never used: the texts of the web keep, at 1280
// px, the size they have at 390.

export const planFriseSizes = {
  full: {
    maxWidth: 330,
    height: 146,
    plotLeft: 26,
    plotRight: 2,
    plotTop: 24,
    plotHeight: 100,
  },
  reduced: {
    maxWidth: 328,
    height: 60,
    plotLeft: 2,
    plotRight: 2,
    plotTop: 2,
    plotHeight: 44,
  },
};

/** The narrowest a frise is drawn (a box narrower than this scales its drawing no more). */
export const planFriseMinWidth = 220;

// The room a name leaves to its neighbour, in pixels.
const nameGap = 4;

const fontSizes = { hour: 11, height: 10, caption: 11 };

/** The room the hours at the foot of the span's lines take in the full frise. */
export const planFriseSpanHoursRoom = 12;
export const planFriseNameFonts = {
  full: { size: 11, weight: 600 },
  reduced: { size: 10, weight: 400 },
};

/**
 * A rough width of `text` for a server render or a test (no canvas): the
 * average advance of the page's rounded face, wide for the scripts written
 * without word spaces.
 */
export function estimateTextWidth(text, { size = 11, weight = 400 } = {}) {
  let em = 0;
  for (const glyph of text) {
    const code = glyph.codePointAt(0);
    if (code >= 0x2e80) em += 1;
    else if (glyph === " ") em += 0.3;
    else if (/[0-9]/.test(glyph)) em += 0.58;
    else if (/[A-ZÀ-ÖØ-Þ]/.test(glyph)) em += 0.68;
    else if (/[iljtfI.,:;'’|]/.test(glyph)) em += 0.32;
    else em += 0.54;
  }
  return em * size * (weight >= 600 ? 1.05 : 1);
}

/**
 * `text` cut with "…" so that it fits `maxWidth` ("" when not even the ellipsis
 * does). The sentence read by a screen reader always lists the name whole.
 */
export function fitName(text, maxWidth, measure) {
  if (!text) return "";
  if (measure(text) <= maxWidth) return text;
  const glyphs = [...text];
  for (let count = glyphs.length - 1; count >= 1; count -= 1) {
    const candidate = `${glyphs.slice(0, count).join("").trimEnd()}…`;
    if (measure(candidate) <= maxWidth) return candidate;
  }
  return measure("…") <= maxWidth ? "…" : "";
}

const round = (value) => Math.round(value * 10) / 10;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// A smooth path through `points` (a Catmull-Rom spline as cubic Béziers): it
// ends exactly on the first and last point, the heights of the slot's ends.
function smoothPath(points) {
  const [first] = points;
  let path = `M${round(first[0])} ${round(first[1])}`;
  if (points.length === 2)
    return `${path}L${round(points[1][0])} ${round(points[1][1])}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    path += `C${round(c1[0])} ${round(c1[1])} ${round(c2[0])} ${round(c2[1])} ${round(p2[0])} ${round(p2[1])}`;
  }
  return path;
}

/**
 * The layout of `frise` (the result of `planFrise`) for a box `width` pixels
 * wide (at most the variant's maximum): `{ variant, width, height, plot: {
 * left, top, width, height, right, bottom }, night: { x0, x1 }, ticks: [{ x,
 * hour, labelled, text }], heights: [{ degrees, y, labelX, labelY }], blocks:
 * [{ key, label, left, right, curve, fit, greyed, name: { text, x, y } | null }],
 * span: { x0, x1, start, end, beyond } | null, caption:
 * { x, y, text } | null }`. `measure(text, { size, weight })` is the width of
 * a text; `captionText` the caption of the full frise.
 */
export function planFriseLayout(
  frise,
  {
    width = Infinity,
    variant = "full",
    measure = estimateTextWidth,
    captionText = "",
  } = {},
) {
  const full = variant !== "reduced";
  const size = full ? planFriseSizes.full : planFriseSizes.reduced;
  const drawn = clamp(width, planFriseMinWidth, size.maxWidth);
  const plot = {
    left: size.plotLeft,
    top: size.plotTop,
    right: drawn - size.plotRight,
    bottom: size.plotTop + size.plotHeight,
    height: size.plotHeight,
  };
  plot.width = Math.max(0, plot.right - plot.left);
  const x = (fraction) => plot.left + fraction * plot.width;
  const y = (degrees) =>
    plot.top + plot.height * (1 - clamp(degrees, 0, 90) / 90);

  const ticks = full
    ? frise.ticks.map((tick) => ({
        x: x(tick.at),
        hour: tick.hour,
        labelled: tick.labelled,
        text: `${String(tick.hour).padStart(2, "0")}:00`,
      }))
    : [];
  const heights = frise.heights.map((height) => ({
    degrees: height.degrees,
    y: y(height.degrees),
    // The label sits at the left of the plot, its baseline a little under the line.
    labelX: plot.left - 4,
    labelY: y(height.degrees) + 3.5,
  }));

  const blocks = frise.blocks.map((block) => {
    const left = x(block.x0);
    const right = x(block.x1);
    // The curve starts and ends one pixel inside its block.
    let curve = null;
    const inner = right - left - 2;
    if (block.curve && block.curve.length >= 2 && inner > 0) {
      const span = block.x1 - block.x0;
      curve = smoothPath(
        block.curve.map((point) => [
          left + 1 + inner * clamp((point.x - block.x0) / span, 0, 1),
          y(point.altitude),
        ]),
      );
    }
    return {
      key: block.key,
      label: block.label,
      left,
      right,
      curve,
      // How the block sits against the night the plan chose.
      fit: block.fit ?? "inside",
      greyed: block.greyed === true,
    };
  });

  // The names: at the foot of the block (full) or under it (reduced), cut
  // with "…" rather than touching their neighbour.
  const font = full ? planFriseNameFonts.full : planFriseNameFonts.reduced;
  const baseline = full ? plot.bottom - 8 : plot.bottom + 12;
  blocks.forEach((block, index) => {
    const centre = (block.left + block.right) / 2;
    let room = 2 * Math.min(centre - plot.left, plot.right - centre);
    if (index > 0) {
      const before = blocks[index - 1];
      room = Math.min(room, centre - (before.left + before.right) / 2);
    }
    if (index < blocks.length - 1) {
      const after = blocks[index + 1];
      room = Math.min(room, (after.left + after.right) / 2 - centre);
    }
    const text = fitName(String(block.label ?? ""), room - nameGap, (value) =>
      measure(value, font),
    );
    block.name = text ? { text, x: centre, y: baseline } : null;
  });

  // The night the plan chose — the two lines, the full frise taking
  // `planFriseSpanHoursRoom` more under the plot for their hours.
  const span = frise.span
    ? {
        x0: x(frise.span.x0),
        x1: x(frise.span.x1),
        start: frise.span.start,
        end: frise.span.end,
        beyond: frise.span.beyond ?? 0,
      }
    : null;
  const extra = full && span ? planFriseSpanHoursRoom : 0;
  const caption =
    full && captionText
      ? {
          x: plot.left,
          y: plot.bottom + 16 + extra,
          text: fitName(captionText, drawn - plot.left, (value) =>
            measure(value, { size: fontSizes.caption, weight: 400 }),
          ),
        }
      : null;

  return {
    variant: full ? "full" : "reduced",
    width: drawn,
    height: size.height + extra,
    plot,
    span,
    night: { x0: x(frise.night.x0), x1: x(frise.night.x1) },
    ticks,
    heights,
    blocks,
    caption,
  };
}
