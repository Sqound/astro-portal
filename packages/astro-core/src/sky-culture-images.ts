// The pictures of the bright stars and of the constellations: a fixed render
// of the application's sky map (no gesture, no word in it), pre-rendered once
// and shipped with the code in `examples/sky-culture-images/`, beside their
// CREDITS.md and their manifest. The catalogue serves them on the route of the
// other target pictures (`/target-library-images/`).
//
// - a bright star: centred on the star, ringed in gold, the lines of its
//   constellation in full and the neighbours' paler, no drawing;
// - a constellation: its lines and its drawing, whole; and the bare sky of
//   « Prévisualiser » in the same frame, its stars alone and with its lines.
//
// The drawings are Johan Meuris's for Stellarium, under the Free Art License;
// the stars and the lines come from Stellarium's data (CC BY-SA).

/** The catalogue id of a bright star (`star-hip-91262`). */
export const skyCultureStarIdPattern = /^star-hip-\d+$/;
/** The catalogue id of a constellation (`constellation-lyr`). */
export const skyCultureConstellationIdPattern = /^constellation-[a-z]{3}$/;

export type SkyCultureImageVariantName =
  "thumbnail" | "full" | "naked" | "nakedLines";

export type SkyCultureImageVariant = {
  name: SkyCultureImageVariantName;
  /** The file the portal serves, `<id>[-suffix].jpg`. */
  file: string;
  /** The render it is made from (`<id>-<render>.png`). */
  render: "thumb" | "full" | "naked" | "naked-lines";
  /** The side of the square, pixels. */
  pixels: number;
  /** JPEG quality. */
  quality: number;
};

const suffixes: Record<SkyCultureImageVariantName, string> = {
  thumbnail: "",
  full: "-full",
  naked: "-naked",
  nakedLines: "-naked-lines",
};

/** What kind of sky picture an id has, or null. */
export function skyCultureImageKind(
  id: string | null | undefined,
): "star" | "constellation" | null {
  const key = String(id ?? "");
  if (skyCultureStarIdPattern.test(key)) return "star";
  if (skyCultureConstellationIdPattern.test(key)) return "constellation";
  return null;
}

/** The file of one variant of an id's picture, or null. */
export function skyCultureImageFile(
  id: string | null | undefined,
  variant: SkyCultureImageVariantName = "thumbnail",
): string | null {
  const kind = skyCultureImageKind(id);
  if (!kind) return null;
  if (kind === "star" && (variant === "naked" || variant === "nakedLines"))
    return null;
  return `${id}${suffixes[variant]}.jpg`;
}

/** The address of one variant of an id's picture on the portal, or null. */
export function skyCultureImageUrl(
  id: string | null | undefined,
  variant: SkyCultureImageVariantName = "thumbnail",
): string | null {
  const file = skyCultureImageFile(id, variant);
  return file ? `/target-library-images/${file}` : null;
}

/** The files an id's picture is made of: two for a star, four for a
 * constellation. */
export function skyCultureImageVariants(id: string): SkyCultureImageVariant[] {
  const kind = skyCultureImageKind(id);
  if (!kind) return [];
  const variants: SkyCultureImageVariant[] = [
    {
      name: "thumbnail",
      file: `${id}.jpg`,
      render: "thumb",
      pixels: 360,
      quality: 84,
    },
    {
      name: "full",
      file: `${id}-full.jpg`,
      render: "full",
      pixels: 900,
      quality: 80,
    },
  ];
  if (kind === "constellation")
    variants.push(
      {
        name: "naked",
        file: `${id}-naked.jpg`,
        render: "naked",
        pixels: 696,
        quality: 84,
      },
      {
        name: "nakedLines",
        file: `${id}-naked-lines.jpg`,
        render: "naked-lines",
        pixels: 696,
        quality: 84,
      },
    );
  return variants;
}

/** The short credit of a constellation's picture (its drawing). */
export const skyCultureDrawingCredit = "Stellarium";

/**
 * The image record of an id's picture, as the catalogue stores a target's
 * survey image (`dssImage`): the card's file and its credit. A bright star
 * has no drawing, so no credit on its card.
 */
export function skyCultureImageFor(id: string): {
  file: string;
  source: string;
  credit: string | null;
  license: string;
} | null {
  const kind = skyCultureImageKind(id);
  if (!kind) return null;
  return {
    file: `${id}.jpg`,
    source: "PlanAstro sky map (Stellarium data)",
    credit: kind === "constellation" ? skyCultureDrawingCredit : null,
    license:
      kind === "constellation"
        ? "Free Art License (drawings), CC BY-SA (data)"
        : "CC BY-SA (data)",
  };
}
