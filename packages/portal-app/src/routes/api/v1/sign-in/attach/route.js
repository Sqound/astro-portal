import {
  notFoundResponse,
  spaceSignIn,
} from "../../../../../lib/space-sign-in.server.js";

/**
 * POST /v1/sign-in/attach — « Rattacher cet appareil à mon espace »
 * (the sign-in by e-mail code only).
 */
export async function POST(request) {
  const handlers = spaceSignIn();
  return handlers ? await handlers.attach(request) : notFoundResponse();
}
