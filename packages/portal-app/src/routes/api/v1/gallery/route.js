import {
  galleryFailure,
  requirePublicGalleryService,
} from "../../../../lib/v1/public-gallery-service.js";
import { requestedLocale } from "../../../../lib/v1/targets-query.js";
import { v1Json } from "../../../../lib/v1/response.js";

/**
 * GET /v1/gallery: a page of the home gallery — the public captures of
 * every space, newest night first (`order=oldest` reverses it), `limit` 24
 * by default and 48 at most from `offset`, one generic `tag`, a `query` on
 * the targets' names; `all=1` the whole list (the sky map). Anyone may
 * read it; no capability is read. The shapes are `gallery.schema.json`,
 * `#/$defs/list`.
 */
export async function GET(request) {
  const url = new URL(request.url);
  const parameter = (name) => url.searchParams.get(name) || "";
  try {
    const service = await requirePublicGalleryService();
    return v1Json(
      await service.list({
        locale: requestedLocale(url),
        query: parameter("query").slice(0, 200),
        tag: parameter("tag").slice(0, 60),
        offset: parameter("offset") || 0,
        limit: parameter("limit") || undefined,
        newestFirst: parameter("order") !== "oldest",
        all: parameter("all") === "1",
      }),
    );
  } catch (error) {
    return galleryFailure(error);
  }
}
