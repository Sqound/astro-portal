/**
 * Mosaic panel grid, computed from the surface a mosaic framing covers and
 * the field of the equipment actually drawing it. Rationale:
 * a surface makes sense when the same result is wanted with a different
 * telescope. A mosaic framing
 * never stores columns/rows: the grid is recomputed every time, once with
 * the reference equipment (in the creation modal) and once with the plan's
 * own equipment (inside a plan), so the same framing keeps covering the same
 * sky regardless of which telescope draws it.
 *
 * Proven by `packages/astro-contracts/fixtures/mosaic-grid.json`.
 */

export interface MosaicGridInput {
  /** The sky area the mosaic must cover, in degrees. */
  widthDegrees: number;
  heightDegrees: number;
  /** The requested panel-to-panel overlap, as a percentage of one panel's
   * field. Clamped to [0, 90] so a pathological value never produces an
   * unbounded panel count. */
  overlapPercent: number;
  /** The field of the equipment actually drawing the grid: the reference
   * equipment in the creation modal, or the plan's own equipment inside a
   * plan. */
  fieldWidthDegrees: number;
  fieldHeightDegrees: number;
}

export interface MosaicGridResult {
  columns: number;
  rows: number;
  panelCount: number;
}

const MAX_OVERLAP_PERCENT = 90;

function panelsAlongAxis(
  surfaceDegrees: number,
  fieldDegrees: number,
  overlapPercent: number,
): number {
  if (!(surfaceDegrees > 0) || !(fieldDegrees > 0)) return 1;
  // "1 panneau si le champ couvre déjà la surface" (A2).
  if (surfaceDegrees <= fieldDegrees) return 1;
  const clampedOverlap = Math.min(
    Math.max(overlapPercent, 0),
    MAX_OVERLAP_PERCENT,
  );
  const step = fieldDegrees * (1 - clampedOverlap / 100);
  if (!(step > 0)) return 1;
  return Math.max(1, Math.ceil((surfaceDegrees - fieldDegrees) / step) + 1);
}

/** A2 — the computed panel grid for a mosaic framing, never stored. */
export function mosaicGrid(args: MosaicGridInput): MosaicGridResult {
  const overlapPercent = Number(args.overlapPercent) || 0;
  const columns = panelsAlongAxis(
    Number(args.widthDegrees),
    Number(args.fieldWidthDegrees),
    overlapPercent,
  );
  const rows = panelsAlongAxis(
    Number(args.heightDegrees),
    Number(args.fieldHeightDegrees),
    overlapPercent,
  );
  return { columns, rows, panelCount: columns * rows };
}
