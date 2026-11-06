import {
  bundledSkyCultureImagesDir,
  bundledTargetLibraryImagesDir,
  targetLibraryImagesDir,
} from "../../../lib/config.server.js";
import { fileResponse } from "../../../lib/media.server.js";
import { targetLibraryImageFilePattern } from "../../../lib/target-library-media.js";

const headers = { "Cache-Control": "public, max-age=31536000, immutable" };

export async function GET(request, { params }) {
  const { file } = await params;
  if (!targetLibraryImageFilePattern.test(file || ""))
    return new Response("Image introuvable", { status: 404 });
  // The runtime folder first (what an import or a package put there), then
  // the pictures that ship with the code: the Solar System's, the sky's.
  const served = await fileResponse(targetLibraryImagesDir, [file], headers);
  if (served.status !== 404) return served;
  for (const directory of [
    bundledTargetLibraryImagesDir,
    bundledSkyCultureImagesDir,
  ]) {
    const bundled = await fileResponse(directory, [file], headers);
    if (bundled.status !== 404) return bundled;
  }
  return served;
}

export const HEAD = GET;
