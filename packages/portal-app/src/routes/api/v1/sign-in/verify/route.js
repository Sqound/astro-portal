import {
  notFoundResponse,
  spaceSignIn,
} from "../../../../../lib/space-sign-in.server.js";

/** POST /v1/sign-in/verify — the sign-in by e-mail code (docs/PRIVATE_NOTEBOOK_AUTH.md). */
export async function POST(request) {
  const handlers = spaceSignIn();
  return handlers ? await handlers.verify(request) : notFoundResponse();
}
