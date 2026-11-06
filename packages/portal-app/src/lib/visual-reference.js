import { stat } from "node:fs/promises";
import { join } from "node:path";

// References remain confined to a single filename in the private runtime.
// Existing authorised collections include descriptive names such as
// M1-Crab-Nebula-Sketch-s.jpg, so requiring a synthetic catalogue-only name
// would incorrectly hide them. Path separators are deliberately excluded.
export const visualReferenceFilename =
  /^[a-z0-9][a-z0-9 ._-]*\.(?:jpe?g|png|webp)$/i;

export function isVisualReferenceFilename(value) {
  return (
    typeof value === "string" &&
    value.length <= 240 &&
    visualReferenceFilename.test(value)
  );
}

export async function visualReferenceFileExists(image, directory) {
  if (!isVisualReferenceFilename(image?.file)) return false;
  try {
    return (await stat(join(directory, image.file))).isFile();
  } catch {
    return false;
  }
}

export async function availableVisualReferences(images, directory) {
  const entries = await Promise.all(
    Object.entries(images || {}).map(async ([id, image]) =>
      (await visualReferenceFileExists(image, directory)) ? [id, image] : null,
    ),
  );
  return Object.fromEntries(entries.filter(Boolean));
}
