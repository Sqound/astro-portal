/**
 * The two editorial selections of the catalogue and the modes of their
 * targets.
 *
 * « Essentielles » (`essential`, the flag `isBest`) and « Étendues »
 * (`extended`, the flag `isExtended`) are disjoint: a target is in one of
 * them at most. Each target of a selection carries the modes it is worth
 * proposing in, `visual` (within reach of a 200 mm telescope under a good
 * sky), `photo`, or both; a target of a selection without any is read as
 * both. The pool of the suggestions is the two selections together, kept to
 * the targets of the profile's mode; a catalogue ticked in the suggestions'
 * filters is that whole catalogue, whatever the modes. The default content
 * is `sky-data/target-selection.json` (`target-selection-table.ts`, built
 * from it); an instance keeps its own memberships, edited in
 * Administration.
 */
import {
  targetCorrectionRows,
  targetSelectionRows,
  targetSelectionVersion,
} from "./target-selection-table.js";

export type TargetSelectionTier = "essential" | "extended";
export type TargetSelectionMode = "visual" | "photo";

export { targetSelectionVersion };

/** The modes, in the order they are listed and stored. */
export const targetSelectionModes: readonly TargetSelectionMode[] = [
  "visual",
  "photo",
];

/** The bit of each mode in the index's `modes` column (1, 2; 3 both). */
export const targetSelectionModeBits: Readonly<
  Record<TargetSelectionMode, number>
> = { visual: 1, photo: 2 };

/** The collection of `target_collections` that holds a mode's targets. */
export const targetSelectionModeCollections: Readonly<
  Record<TargetSelectionMode, string>
> = { visual: "mode-visual", photo: "mode-photo" };

/** `visual`, `photo`, or `""` for any other value. */
export function selectionMode(value: unknown): TargetSelectionMode | "" {
  return value === "visual" || value === "photo" ? value : "";
}

/** The selection mode of an equipment mode (`visual`, `imaging`). */
export function selectionModeOfEquipmentMode(
  mode: unknown,
): TargetSelectionMode | "" {
  if (mode === "visual") return "visual";
  if (mode === "imaging" || mode === "photo") return "photo";
  return "";
}

/** The modes `value` names (an array of modes, or the bits), in order. */
export function selectionModesOf(value: unknown): TargetSelectionMode[] {
  if (typeof value === "number")
    return targetSelectionModes.filter(
      (mode) => (value & targetSelectionModeBits[mode]) !== 0,
    );
  const given = new Set(Array.isArray(value) ? value : []);
  return targetSelectionModes.filter((mode) => given.has(mode));
}

/** The bits of `modes` (1 visual, 2 photo, 3 both, 0 none). */
export function selectionModeBitsOf(modes: unknown): number {
  return selectionModesOf(modes).reduce(
    (bits, mode) => bits | targetSelectionModeBits[mode],
    0,
  );
}

type SelectionFlags = {
  isBest?: unknown;
  isExtended?: unknown;
  modes?: unknown;
};

/** Whether a target is in one of the two selections. */
export function isSelectionTarget(target: SelectionFlags | null | undefined) {
  return Boolean(target?.isBest) || Boolean(target?.isExtended);
}

/**
 * The modes of a target as the selections read them: its own; both for a
 * target of a selection that carries none; none for a target of no
 * selection.
 */
export function effectiveSelectionModes(
  target: SelectionFlags | null | undefined,
): TargetSelectionMode[] {
  if (!isSelectionTarget(target)) return [];
  const own = selectionModesOf(target?.modes);
  return own.length ? own : [...targetSelectionModes];
}

/** Whether a target of a selection is proposed in `mode` (any: `""`). */
export function targetMatchesSelectionMode(
  target: SelectionFlags | null | undefined,
  mode: unknown,
): boolean {
  const wanted = selectionMode(mode);
  if (!wanted) return true;
  return effectiveSelectionModes(target).includes(wanted);
}

/**
 * Whether a target is in the list a catalogue page's `selection` names:
 * `best` the Essentials, `extended` the Extended (the two are disjoint), in
 * `mode` when one is given; any target without a selection.
 */
export function targetInSelectionList(
  target: SelectionFlags | null | undefined,
  selection: unknown,
  mode: unknown = "",
): boolean {
  if (selection === "best")
    return Boolean(target?.isBest) && targetMatchesSelectionMode(target, mode);
  if (selection === "extended")
    return (
      Boolean(target?.isExtended) && targetMatchesSelectionMode(target, mode)
    );
  return true;
}

/**
 * Whether a target is in the pool a planner's `selection` names: `best` the
 * Essentials; `extended` (« Étendues » of the planner, the suggestions'
 * pool) the Essentials and the Extended together — what « Étendues » held
 * when it contained the Essentials. In `mode` when one is given.
 */
export function targetInSelectionPool(
  target: SelectionFlags | null | undefined,
  selection: unknown,
  mode: unknown = "",
): boolean {
  if (selection === "best")
    return Boolean(target?.isBest) && targetMatchesSelectionMode(target, mode);
  if (selection === "extended")
    return (
      isSelectionTarget(target) && targetMatchesSelectionMode(target, mode)
    );
  return true;
}

/** One target of the default selections. */
export type TargetSelectionEntry = {
  id: string;
  designation: string;
  tier: TargetSelectionTier;
  modes: TargetSelectionMode[];
};

/** The default selections (`sky-data/target-selection.json`). */
export function defaultTargetSelection(): TargetSelectionEntry[] {
  return targetSelectionRows.map(([id, designation, tier, modes]) => ({
    id,
    designation,
    tier,
    modes: [...modes],
  }));
}

const correctionsById = new Map(
  targetCorrectionRows.map((correction) => [correction.id, correction.set]),
);

/**
 * `target` (a source record of the catalogue) with the fields its
 * correction gives (`sky-data/target-corrections.json`), or `target` itself
 * when it has none. A new object: the source record is not changed.
 */
export function correctedSourceTarget<T extends { id?: unknown }>(
  target: T,
): T {
  const set = correctionsById.get(String(target?.id ?? ""));
  if (!set) return target;
  return { ...target, ...structuredClone(set) } as T;
}
