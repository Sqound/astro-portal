import { canonicalObjectType } from "./catalog-taxonomy.js";

/**
 * The ten figures of the object pictograms (one per kind of object, drawn on
 * a 48-unit grid), keyed by a stable identifier shared by the web, the mobile
 * application, the Live Activity and the Android notification.
 */
export type ObjectPictogramKey =
  | "galaxy"
  | "open-cluster"
  | "globular-cluster"
  | "emission-nebula"
  | "planetary-nebula"
  | "dark-nebula"
  | "planet"
  | "moon"
  | "comet"
  | "star";

/** The figure of the star: unknown type, no type, or a star. */
export const unknownObjectPictogramKey: ObjectPictogramKey = "star";

// The catalogue's own (French) type identifiers mapped to the nearest figure.
// « Comète » is not in the taxonomy yet: it is held here for when a catalogue
// carries one.
const figureByType: Record<string, ObjectPictogramKey> = {
  Galaxie: "galaxy",
  "Amas ouvert": "open-cluster",
  "Amas globulaire": "globular-cluster",
  "Nébuleuse en émission": "emission-nebula",
  "Nébuleuse en réflexion": "emission-nebula",
  "Rémanent de supernova": "emission-nebula",
  "Nébuleuse planétaire": "planetary-nebula",
  "Nébuleuse sombre": "dark-nebula",
  Planète: "planet",
  "Planète naine": "planet",
  "Système solaire": "planet",
  Lune: "moon",
  Comète: "comet",
  Étoile: "star",
  "Étoile brillante": "star",
  // A constellation is drawn as a star too: its name is on the card.
  Constellation: "star",
  Soleil: "star",
};

/** The ten figures, in the order of the design sheet. */
export const objectPictogramKeys: readonly ObjectPictogramKey[] = [
  ...new Set(Object.values(figureByType)),
];

type TypeSource = {
  typeKey?: unknown;
  type?: unknown;
  skyTarget?: { typeKey?: unknown; type?: unknown } | null;
};

/**
 * The type text of a target, read as `photoFilterFamilies` reads it:
 * `skyTarget.typeKey`, then `typeKey`, then `skyTarget.type`. A plain string
 * is taken as the type itself.
 */
export function objectTypeOf(target: TypeSource | string | null | undefined) {
  if (typeof target === "string") return target;
  for (const value of [
    target?.skyTarget?.typeKey,
    target?.typeKey,
    target?.skyTarget?.type,
  ])
    if (typeof value === "string" && value) return value;
  return "";
}

/**
 * The pictogram of a target (or of a type text): the type is read from the
 * catalogue's taxonomy, canonicalised with its aliases, and mapped to a
 * figure. A type the taxonomy does not hold, and no type, give the star.
 */
export function objectPictogramKey(
  target: TypeSource | string | null | undefined,
  aliases?: Record<string, string>,
): ObjectPictogramKey {
  const type = objectTypeOf(target).trim();
  if (!type) return unknownObjectPictogramKey;
  const canonical = canonicalObjectType(type, aliases);
  return (
    (Object.hasOwn(figureByType, canonical)
      ? figureByType[canonical]
      : undefined) ?? unknownObjectPictogramKey
  );
}
