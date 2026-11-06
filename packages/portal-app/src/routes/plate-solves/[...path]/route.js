import { fileResponse } from "../../../lib/media.server.js";
import { plateSolveDir } from "../../../lib/catalog.server.js";

export async function GET(_request, { params }) {
  return fileResponse(plateSolveDir, (await params).path);
}
export const HEAD = GET;
