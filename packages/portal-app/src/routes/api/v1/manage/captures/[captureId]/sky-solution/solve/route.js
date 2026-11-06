import {
  captureSolveState,
  skySolveOnServer,
  solveCaptureImage,
} from "../../../../../../../../lib/plate-solving.server.js";
import { webSessionV1Access } from "../../../../../../../../lib/v1/access.js";
import { v1Json, v1NotFound } from "../../../../../../../../lib/v1/response.js";
import {
  captureIdOf,
  requireSkySolutionService,
  skySolutionFailure,
} from "../../../../../../../../lib/v1/sky-solution-service.js";

const imageIdOf = (request) =>
  new URL(request.url).searchParams.get("imageId") || null;

/**
 * POST /v1/manage/captures/{id}/sky-solution/solve: « Résoudre sur ce
 * serveur », the fallback of a private server that has `solve-field` and
 * its indices. It exists only where `sky.solve_on_server` is true (read
 * from the server's environment, never from an offer): `404 not_found`
 * otherwise. The owner's web session
 * with its CSRF token; the main image, or `?imageId=` a variant. Starts the
 * resolution and answers `202 { state: "running" }`; the solution is then
 * stored under the rules of Astro Sync's `PUT` (source `astrometry-net`).
 */
export async function POST(request, { params }) {
  if (!skySolveOnServer()) return v1NotFound();
  const access = await webSessionV1Access(request, { write: true });
  if (access.response) return access.response;
  try {
    const service = await requireSkySolutionService();
    const captureId = await captureIdOf(params);
    const image = await service.original({
      tenantId: access.tenantId,
      captureId,
      imageId: imageIdOf(request),
    });
    const state = solveCaptureImage({
      image,
      hints: await service.hints({ tenantId: access.tenantId, captureId }),
      store: (solution) =>
        service.put({
          tenantId: access.tenantId,
          captureId,
          body: { sha256: image.sha256, solution },
        }),
    });
    return v1Json(state, { status: 202 });
  } catch (error) {
    return skySolutionFailure(error);
  }
}

/**
 * GET /v1/manage/captures/{id}/sky-solution/solve: where the resolution on
 * this server stands for an image (`idle`, `running`, `solved`, `failed`
 * with its `reason`); `404 not_found` where `sky.solve_on_server` is false.
 */
export async function GET(request, { params }) {
  if (!skySolveOnServer()) return v1NotFound();
  const access = await webSessionV1Access(request);
  if (access.response) return access.response;
  try {
    const image = await (
      await requireSkySolutionService()
    ).original({
      tenantId: access.tenantId,
      captureId: await captureIdOf(params),
      imageId: imageIdOf(request),
    });
    return v1Json(captureSolveState(image.imageId));
  } catch (error) {
    return skySolutionFailure(error);
  }
}
