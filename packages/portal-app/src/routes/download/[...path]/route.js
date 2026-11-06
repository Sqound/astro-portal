import { imageResponse, isExternalRequest } from "../../../lib/media.server.js";

export async function GET(request, { params }) {
  if (isExternalRequest(request))
    return new Response("Les TIFF sont réservés au réseau local.", {
      status: 403,
    });
  return imageResponse(request, (await params).path, { download: true });
}
export const HEAD = GET;
