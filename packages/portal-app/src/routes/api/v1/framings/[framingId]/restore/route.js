import {
  clientInstanceIdFrom,
  deviceOrSessionWriteV1Access,
} from "../../../../../../lib/v1/access.js";
import {
  framingResourceFailure,
  requireFramingResourceService,
} from "../../../../../../lib/v1/framing-resource-service.js";
import { v1Json } from "../../../../../../lib/v1/response.js";

/** Clears an archived framing's `archivedAt`, returning it to the library. */
export async function POST(request, { params }) {
  const access = await deviceOrSessionWriteV1Access(request);
  if (access.response) return access.response;
  try {
    const { framingId } = await params;
    return v1Json(
      await (
        await requireFramingResourceService()
      ).restore({
        tenantId: access.tenantId,
        userId: access.userId,
        framingId,
        originClientInstanceId: clientInstanceIdFrom(request),
      }),
    );
  } catch (error) {
    return framingResourceFailure(error);
  }
}
