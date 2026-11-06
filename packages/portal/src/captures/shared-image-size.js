/**
 * The pixel size of the shared copy of a capture: the public gallery and
 * the private gallery write it under the image of the detail page (« 4
 * 096 × 2 730 px »). Written at the first need through
 * `ensureSharedCopy`; `null` when the copy cannot be made or read.
 */

/** `{ width, height }` of the image file at `path`, or `null`. */
export async function imageSizeOf(path) {
  try {
    const { default: sharp } = await import("sharp");
    const { width, height } = await sharp(path).metadata();
    return { width, height };
  } catch {
    return null;
  }
}

/**
 * The size of the shared copy of one image of a space. `sharedCopy` and
 * `captureStore` are the ones the service reads files through; `imageSize`
 * reads a file's size (`imageSizeOf` unless a test gives its own).
 */
export async function sharedCopySize({
  sharedCopy,
  captureStore,
  tenantId,
  sha256,
  originalName,
  imageSize = imageSizeOf,
}) {
  try {
    const { path } = await sharedCopy({
      tenantId,
      sha256,
      originalName,
      captureStore,
    });
    return path
      ? await imageSize(path)
      : await captureStore.withLocalFile(
          { tenantId, sha256, file: "shared" },
          imageSize,
        );
  } catch {
    return null;
  }
}
