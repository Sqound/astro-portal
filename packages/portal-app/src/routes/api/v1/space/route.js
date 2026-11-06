import {
  notFoundResponse,
  spaceSignIn,
} from "../../../../lib/space-sign-in.server.js";

/**
 * GET /v1/space — the space of the credential, wherever a person signs in
 * by e-mail code.
 */
export async function GET(request) {
  const handlers = spaceSignIn();
  return handlers ? await handlers.currentSpace(request) : notFoundResponse();
}

/**
 * DELETE /v1/space `{ "confirm": true }` — « Supprimer mon espace », from
 * the application or the web: only handlers that offer it delete a space;
 * on a private server the space belongs to the instance, and the route
 * answers 404.
 */
export async function DELETE(request) {
  const handlers = spaceSignIn();
  return typeof handlers?.deleteSpace === "function"
    ? await handlers.deleteSpace(request)
    : notFoundResponse();
}
