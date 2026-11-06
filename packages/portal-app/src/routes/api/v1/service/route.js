import { appVersion } from "../../../../lib/app-version.server.js";
import { serviceIdentity } from "astro-contracts/service-identity";
import { signInAnnouncement } from "../../../../lib/auth.server.js";
import { v1Json } from "../../../../lib/v1/response.js";

/**
 * Public service identity: no credential, no database,
 * only "this is an Astro portal speaking API version 1", the software
 * version and — since the space sign-in — how a person signs in here
 * (`signIn`: `email-code`, `pairing` on a private
 * server, `none` when the private API is off). The mobile app calls it
 * before saving a self-hosted address, to tell whether its service answers,
 * and to choose its sign-in screen. `astro-contracts/service-identity`
 * builds and checks the body.
 */
export function GET() {
  let signIn;
  try {
    signIn = signInAnnouncement();
  } catch {
    // A sign-in mode whose package is missing: nothing can be attached.
    signIn = { method: "none" };
  }
  return v1Json(serviceIdentity(appVersion(), signIn));
}
