import { createEmailCodeInstallation } from "../auth/installation.js";
import { createMailSender } from "../mail/senders.js";
import {
  privateSpaceSignInProblems,
  spaceSignInConfiguration,
} from "./configuration.js";
import { createSpaceSignInHandlers } from "./http.js";
import { closedSpacePolicy, createSpaceSignIn } from "./service.js";

/**
 * A private server's own sign-in by e-mail code (ASTRO_PORTAL_AUTH_MODE=
 * email-code with no extension taking the mode over): a space of one
 * person, its owner's (docs/PRIVATE_NOTEBOOK_AUTH.md). What a composition
 * wires into its routes: the handlers of `/api/v1/sign-in/*`,
 * `/api/v1/space` and `/api/v1/devices/*`, and the installation of
 * `/api/auth/bootstrap/*`.
 *
 * This module loads the senders, and so the mail library: the start of the
 * service (server.mjs) reads the settings only (auth/modes.js).
 */
export function privateSpaceSignInConfiguration(
  env = process.env,
  { runtimeDir = null } = {},
) {
  return spaceSignInConfiguration(env, { runtimeDir, allowPlainHttp: true });
}

export function createPrivateSpaceSignIn({
  driver,
  configuration,
  auth,
  alert,
  log,
  clock,
}) {
  let sender = null;
  try {
    sender = createMailSender(configuration);
  } catch {
    // A sender whose settings cannot be read: no message can leave, and a
    // request for a code says the sign-in is unavailable.
    sender = null;
  }
  const options = {
    ...(alert ? { alert } : {}),
    ...(log ? { log } : {}),
    ...(clock ? { clock } : {}),
  };
  const spaces = createSpaceSignIn({
    driver,
    configuration,
    sender,
    auth,
    policy: closedSpacePolicy(),
    problems: privateSpaceSignInProblems,
    ...options,
  });
  return {
    spaces,
    handlers: createSpaceSignInHandlers({
      spaces,
      auth,
      configuration,
      ...(log ? { log } : {}),
      ...(clock ? { clock } : {}),
    }),
    installation: createEmailCodeInstallation({ spaces, auth, configuration }),
  };
}
