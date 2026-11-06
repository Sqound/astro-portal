import { authEnabled, authService } from "../../../lib/auth.server.js";
import { writeAccessFor } from "../../../lib/v1/entitlement-provider.js";
import { targetLibrarySearch } from "../../../lib/target-library.server.js";
import { targetFavoriteRepository } from "../../../lib/target-favorite-repository.server.js";
import { readJsonBody } from "portal/api/json-body.js";

const unavailable = () =>
  Response.json(
    { error: "Favorite targets require enabled authentication." },
    { status: 403 },
  );

export async function GET(request) {
  if (!authEnabled()) return unavailable();
  try {
    const session = await authService().requireSession(request.headers);
    const repository = await targetFavoriteRepository();
    if (!repository) throw new Error("Favorite storage is unavailable.");
    return Response.json(
      await repository.favoriteTargetIdsByMode(session.user_id),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return Response.json({ error: error.message }, { status: 401 });
  }
}

export async function PUT(request) {
  if (!authEnabled()) return unavailable();
  try {
    const session = await authService().verifyCsrf(request.headers);
    const body = await readJsonBody(request);
    const targetId = String(body?.targetId || "").trim();
    const mode = String(body?.mode || "").trim();
    if (!targetId || targetId.length > 200)
      throw new Error("A valid target identifier is required.");
    // Ensure the local shared catalogue has been synchronized before the
    // favorite relation checks its target foreign key.
    const target = await targetLibrarySearch({
      targetIds: [targetId],
      limit: 1,
    });
    if (!target.targets.some((entry) => entry.id === targetId))
      return Response.json({ error: "Target was not found." }, { status: 404 });
    // Soft-downgrade write gate: adding a favorite is a new envoi; removing
    // one is the person's own voluntary cleanup and stays allowed, on the
    // same doctrine as a plan/framing deletion.
    if (body?.favorite) {
      const writeAccess = await writeAccessFor(session.user_id);
      if (writeAccess.readOnly)
        return Response.json(
          {
            error:
              "This account's subscription has ended: new favorites are suspended; existing favorites remain readable and exportable.",
            code: "entitlement_read_only",
          },
          { status: 403 },
        );
    }
    const repository = await targetFavoriteRepository();
    if (!repository) throw new Error("Favorite storage is unavailable.");
    const clientInstanceIdHeader = request.headers
      .get("x-astro-client-instance")
      ?.trim();
    return Response.json(
      await repository.setTargetFavorite({
        tenantId: session.tenant_id,
        userId: session.user_id,
        targetId,
        mode,
        favorite: Boolean(body?.favorite),
        originClientInstanceId: clientInstanceIdHeader
          ? clientInstanceIdHeader.slice(0, 200)
          : null,
      }),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: error?.code === "payload_too_large" ? 413 : 400 },
    );
  }
}
