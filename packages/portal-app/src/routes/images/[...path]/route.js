import { imageResponse } from "../../../lib/media.server.js";

export async function GET(request, { params }) {
  return imageResponse(request, (await params).path);
}
export const HEAD = GET;
