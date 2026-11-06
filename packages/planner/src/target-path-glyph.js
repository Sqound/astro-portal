// The "astre sur l'horizon" glyph: a
// horizon line, a dotted arc above it — the target's course over the night —
// and a dot on the arc, the target. It marks "Déplacement de la cible"
// everywhere: the icon of a target card that opens the summary, and the
// culmination line of the summary and of the horizon map's path card.
//
// One description, read by `components/TargetPathGlyph.js`. Units are those of
// a 24 × 24 box, y pointing down.

export const targetPathGlyph = Object.freeze({
  viewBox: 24,
  strokeWidth: 1.8,
  horizon: Object.freeze({ x1: 2, x2: 22, y: 19 }),
  arc: Object.freeze({ cx: 12, cy: 19, rx: 9, ry: 12 }),
  dotSpacing: 3.6,
  body: Object.freeze({ angle: 55, r: 2.3 }),
});

const digits = 2;
const round = (value) => Number(value.toFixed(digits));

/**
 * The glyph as SVG data: the horizon and the arc as path data, the arc's dash
 * pattern (round caps turn zero-length dashes into dots), and the body's
 * centre on the arc, `angle` degrees above the horizon from the arc's centre.
 */
export function targetPathGlyphShapes(glyph = targetPathGlyph) {
  const { horizon, arc, body } = glyph;
  const radians = (body.angle * Math.PI) / 180;
  return {
    horizon: `M${horizon.x1} ${horizon.y}H${horizon.x2}`,
    arc: `M${arc.cx - arc.rx} ${arc.cy}A${arc.rx} ${arc.ry} 0 0 1 ${arc.cx + arc.rx} ${arc.cy}`,
    dash: `0 ${glyph.dotSpacing}`,
    body: {
      cx: round(arc.cx + arc.rx * Math.cos(radians)),
      cy: round(arc.cy - arc.ry * Math.sin(radians)),
      r: body.r,
    },
  };
}
