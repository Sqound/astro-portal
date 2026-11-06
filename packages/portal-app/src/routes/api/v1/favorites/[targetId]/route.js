import {
  clientInstanceIdFrom,
  deviceV1Access,
} from "../../../../../lib/v1/access.js";
import { writeAccessFor } from "../../../../../lib/v1/entitlement-provider.js";
import { v1Error, v1Json } from "../../../../../lib/v1/response.js";
import { targetLibrarySearch } from "../../../../../lib/target-library.server.js";
import { targetFavoriteRepository } from "../../../../../lib/target-favorite-repository.server.js";
import { readJsonBody } from "portal/api/json-body.js";

/**
 * A bearer credential carries no browser cookie, so no CSRF token applies.
 * The audit trail is the repository's, identical to the web route's.
 */
export async function PUT(request, { params }) {
  const access = await deviceV1Access(request, { synchronize: false });
  if (access.response) return access.response;
  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    return v1Error(error, {
      code: "invalid_request",
      message: "A JSON favorite request is required.",
      status: 400,
    });
  }
  const { targetId } = await params;
  const id = decodeURIComponent(targetId || "").trim();
  const mode = String(body?.mode || "").trim();
  if (!id || id.length > 200 || !["photo", "visual"].includes(mode))
    return v1Error(
      Object.assign(
        new Error(
          "A target identifier and a photo or visual mode are required.",
        ),
        { code: "invalid_request", status: 400 },
      ),
    );
  if (typeof body?.favorite !== "boolean")
    return v1Error(
      Object.assign(new Error("A boolean favorite state is required."), {
        code: "invalid_request",
        status: 400,
      }),
    );
  // Soft-downgrade write gate: adding a favorite is a new envoi; removing
  // one is the person's own voluntary cleanup and stays allowed, on the
  // same doctrine as a plan/framing deletion.
  if (body.favorite) {
    const writeAccess = await writeAccessFor(access.userId);
    if (writeAccess.readOnly)
      return v1Error(
        Object.assign(
          new Error(
            "This account's subscription has ended: new favorites are suspended; existing favorites remain readable and exportable.",
          ),
          { code: "entitlement_read_only", status: 403 },
        ),
      );
  }
  try {
    // Ensure the local shared catalogue has been synchronized before the
    // favorite relation checks its target foreign key.
    const target = await targetLibrarySearch({ targetIds: [id], limit: 1 });
    if (!target.targets.some((entry) => entry.id === id))
      return v1Error(
        Object.assign(new Error("Target was not found."), {
          code: "target_not_found",
          status: 404,
        }),
      );
    const repository = await targetFavoriteRepository();
    if (!repository)
      throw Object.assign(new Error("Favorite storage is unavailable."), {
        code: "favorite_storage_unavailable",
        status: 503,
      });
    return v1Json(
      await repository.setTargetFavorite({
        tenantId: access.tenantId,
        userId: access.userId,
        targetId: id,
        mode,
        favorite: body.favorite,
        originClientInstanceId: clientInstanceIdFrom(request),
      }),
    );
  } catch (error) {
    return v1Error(error, {
      code: "favorite_storage_unavailable",
      message: "Favorite storage is unavailable.",
      status: 503,
    });
  }
}
