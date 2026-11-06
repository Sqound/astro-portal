import type { ComponentType } from "react";

/**
 * The places where a shell may add to the planner of the core, and the
 * only ones: the core renders the complete planner by itself and reads these
 * points where what a shell adds belongs. A shell registers its additions
 * here; the open-source shell registers nothing, and the planner works
 * without them.
 *
 * - `planner.map.overlay`: a component drawn over the sky map, in the place
 *   of the frame, and told of every projected frame;
 * - `planner.map.controls`: a component in the map's control bar, between
 *   the markers' toggle and the sky-brightness picker;
 * - `planner.framing.surface`: what extends a single frame into a larger
 *   surface — the live controls of the « Mosaïque » section of the framing
 *   settings (the core draws that section greyed without them), what a saved
 *   framing reopens with, what a framing made with it stores and the area it
 *   covers;
 * - `planner.export.asiair`: the lines an ASIAIR list writes for one target
 *   of a plan, when it is more than its centre;
 * - `planner.offers`: the offers of a shell that sells: the words that name
 *   what a capability held back belongs to and the way to them, any other
 *   sentence of its offers (`copy`), and the pieces the planner draws at its
 *   locked places (`components`: chips, purchase boxes, lock cards). The core
 *   draws them through `planner/offers-slot.js`, and nothing without them;
 * - `planner.missingObject`: « Demander un objet manquant » — the link a
 *   catalogue search draws under an empty result and the sheet it opens
 *   (`available(auth)`, `Link`). The core draws nothing without it
 *   (`planner/missing-object-slot.js`);
 * - `planner.projects`: the multi-night plans — the views that list them,
 *   show one, its calendar and its progress, the dialogs that start or
 *   follow one, the actions of a plan's menu and the debriefing's link to a
 *   plan's progress. The core reads it in the plans library, behind « Nouveau
 *   plan », on the night's schedule, in a plan's menu and in the debriefing;
 *   where it is registered but the profile lacks the capability, the core
 *   draws the entries held back itself (`planner/multi-night-access.js`);
 * - `planner.places.lightMap`: the geographic light-pollution map — the view
 *   « Carte de la pollution lumineuse » and its words. The core draws its
 *   entry in the header of the « Lieux » view only where it is registered,
 *   held back with a badge where the profile lacks the
 *   capability (`planner/places-light-map-access.js`).
 *
 * A point that is not in this list is refused: nothing hooks into the
 * planner anywhere else.
 */
export const PLANNER_EXTENSION_POINTS = [
  "planner.map.overlay",
  "planner.map.controls",
  "planner.framing.surface",
  "planner.export.asiair",
  "planner.offers",
  "planner.missingObject",
  "planner.projects",
  "planner.places.lightMap",
] as const;

export type PlannerExtensionPoint = (typeof PLANNER_EXTENSION_POINTS)[number];

export type PlannerExtension<Props extends object = Record<string, never>> =
  ComponentType<Props>;

const extensions = new Map<PlannerExtensionPoint, unknown[]>();

function knownPoint(point: string): PlannerExtensionPoint {
  if (!(PLANNER_EXTENSION_POINTS as readonly string[]).includes(point))
    throw new Error(`Unknown planner extension point: ${point}`);
  return point as PlannerExtensionPoint;
}

/** Adds `extension` at `point`, once. */
export function registerPlannerExtension<Extension>(
  point: PlannerExtensionPoint,
  extension: Extension,
): void {
  const known = knownPoint(point);
  const registered = extensions.get(known) || [];
  if (!registered.includes(extension))
    extensions.set(known, [...registered, extension]);
}

/** What is registered at `point`, in the order it was registered. */
export function getPlannerExtensions<Extension = unknown>(
  point: PlannerExtensionPoint,
): Extension[] {
  return (extensions.get(knownPoint(point)) || []) as Extension[];
}
