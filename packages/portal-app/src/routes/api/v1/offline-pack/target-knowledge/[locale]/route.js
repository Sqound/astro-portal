import { isShippedLocale } from "astro-contracts/locales";
import { optionalDeviceV1Access } from "../../../../../../lib/v1/access.js";
import { v1Error } from "../../../../../../lib/v1/response.js";
import { negotiatedJsonResponse } from "../../../../../../lib/content-coding.server.js";
import { targetKnowledgeBundleDocument } from "../../../../../../lib/target-library.server.js";

/**
 * `GET /v1/offline-pack/target-knowledge/{locale}`: the published pages (the
 * long catalogue texts) of the targets that have them, in one language, as
 * the `knowledge` part of the `target-index` component of
 * `GET /v1/offline-pack` announces them. One JSON object,
 * `{ v, locale, count, targets: { [id]: knowledge } }`, each knowledge the
 * answer of `GET /v1/targets/{targetId}` for that target and language.
 * Guest access, like the manifest: public, portal-wide data. Sent gzip- or
 * brotli-encoded when the client accepts it, each coding with its own
 * `ETag` (`negotiatedJsonResponse`).
 */
export async function GET(request, { params }) {
  const access = await optionalDeviceV1Access(request, { synchronize: false });
  if (access.response) return access.response;
  const { locale } = await params;
  if (!isShippedLocale(locale))
    return v1Error(
      Object.assign(new Error("The locale is not one this portal ships."), {
        code: "offline_pack_target_knowledge_not_found",
        status: 404,
      }),
    );
  try {
    const document = await targetKnowledgeBundleDocument(locale);
    if (!document.count)
      return v1Error(
        Object.assign(
          new Error("No target has a published page on this portal."),
          { code: "offline_pack_target_knowledge_not_found", status: 404 },
        ),
      );
    return await negotiatedJsonResponse(request, document, {
      "Cache-Control": "public, max-age=300",
    });
  } catch (error) {
    return v1Error(error, {
      code: "target_library_unavailable",
      message: "The target library is unavailable.",
      status: 503,
    });
  }
}
