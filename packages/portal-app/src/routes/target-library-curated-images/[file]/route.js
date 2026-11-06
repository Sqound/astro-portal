import { targetLibraryCuratedPhotoImagesDir } from "../../../lib/config.server.js";
import { fileResponse } from "../../../lib/media.server.js";

export async function GET(request, { params }) {
  const { file } = await params;
  if (!/^noirlab-[a-z0-9_.-]+\.jpg$/i.test(file || ""))
    return new Response("Image introuvable", { status: 404 });
  return fileResponse(targetLibraryCuratedPhotoImagesDir, [file], {
    "Cache-Control": "public, max-age=31536000, immutable",
  });
}

export const HEAD = GET;
