import { targetLibraryVisualPreviewImagesDir } from "../../../lib/config.server.js";
import { fileResponse } from "../../../lib/media.server.js";
import { targetLibraryPreviewFilePattern } from "../../../lib/target-library-media.js";

export async function GET(request, { params }) {
  const { file } = await params;
  if (!targetLibraryPreviewFilePattern.test(file || ""))
    return new Response("Image introuvable", { status: 404 });
  return fileResponse(targetLibraryVisualPreviewImagesDir, [file], {
    "Cache-Control": "public, max-age=31536000, immutable",
  });
}

export const HEAD = GET;
