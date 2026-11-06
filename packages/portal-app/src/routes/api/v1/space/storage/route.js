import { deviceOrSessionReadV1Access } from "../../../../../lib/v1/access.js";
import {
  requireUploadResourceService,
  uploadResourceFailure,
} from "../../../../../lib/v1/upload-resource-service.js";
import { v1Json } from "../../../../../lib/v1/response.js";

/**
 * GET /v1/space/storage: what a device needs to check a sending before it
 * starts — the bytes the space uses (every stored image, the uploads in
 * progress included), its quota and what remains, the per-file ceiling,
 * its captures and their limit, `capture.variant_limit`, and the composed
 * capabilities of the person (those of `GET /v1/capabilities`). A device
 * token or the web session. A private server answers the limits its
 * profile carries (the unlimited sentinel where it sets none).
 */
export async function GET(request) {
  const access = await deviceOrSessionReadV1Access(request);
  if (access.response) return access.response;
  try {
    const service = await requireUploadResourceService();
    return v1Json(
      await service.spaceStorage({
        tenantId: access.tenantId,
        userId: access.userId,
      }),
    );
  } catch (error) {
    return uploadResourceFailure(error);
  }
}
