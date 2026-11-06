import { targetLibraryVisualImagesDir } from "../../../lib/config.server.js";
import { fileResponse } from "../../../lib/media.server.js";
import { isVisualReferenceFilename } from "../../../lib/visual-reference.js";

export async function GET(request, { params }) {
  const { file } = await params;
  if (!isVisualReferenceFilename(file))
    return new Response("Image introuvable", { status: 404 });
  return fileResponse(targetLibraryVisualImagesDir, [file], {
    "Cache-Control": "public, max-age=31536000, immutable",
  });
}

export const HEAD = GET;
