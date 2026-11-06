import {
  targetPathGlyph,
  targetPathGlyphShapes,
} from "../target-path-glyph.js";

const shapes = targetPathGlyphShapes();

/**
 * The "astre sur l'horizon" glyph, drawn in the stroke colour its container
 * gives every `svg` of the row or button: the horizon solid, the course
 * dotted, the target a filled dot (a circle of half its radius stroked with
 * its radius, so the stroke colour fills it).
 */
export function TargetPathGlyph({ className }) {
  const size = targetPathGlyph.viewBox;
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      className={className}
      data-glyph="target-path"
    >
      <path d={shapes.horizon} strokeLinecap="round" />
      <path
        d={shapes.arc}
        strokeLinecap="round"
        strokeDasharray={shapes.dash}
        data-glyph-part="course"
      />
      <circle
        cx={shapes.body.cx}
        cy={shapes.body.cy}
        r={shapes.body.r / 2}
        strokeWidth={shapes.body.r}
        data-glyph-part="body"
      />
    </svg>
  );
}
