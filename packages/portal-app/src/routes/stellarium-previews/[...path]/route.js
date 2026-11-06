import { fileResponse } from "../../../lib/media.server.js";
import { stellariumPreviewsDir } from "../../../lib/catalog.server.js";

export async function GET(_request, { params }) {
  return fileResponse(stellariumPreviewsDir, (await params).path);
}
export const HEAD = GET;
