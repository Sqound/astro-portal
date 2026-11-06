import {
  authConfiguration,
  createAuthService,
} from "portal/auth/auth-service.js";
import {
  EMAIL_CODE_MODE,
  PASSWORD_MODE,
  authMode,
  hostedSignInMode,
  privateEmailCode,
  signInAnnouncement,
  signInPath,
  signInStartupNotices,
  signInStartupProblems,
  spaceCreationOpen,
} from "portal/auth/modes.js";

/**
 * The composition's authentication: the core's (packages/portal/src/auth/,
 * docs/PRIVATE_NOTEBOOK_AUTH.md), one service per process and per
 * settings. The core reads the sign-in extension a composition registered
 * through its seam.
 */
export {
  authConfiguration,
  createAuthService,
  hostedSignInMode,
  privateEmailCode,
  signInAnnouncement,
  signInPath,
  signInStartupNotices,
  signInStartupProblems,
};

export const authEnabled = () => authMode() !== "disabled";

/** The sign-in method of this server: `disabled`, `password` or `email-code`. */
export const authMethod = (env = process.env) => authMode(env);

/**
 * Whether this server opens spaces to any address: what only a service made
 * of spaces offers (a composition's extensions) exists only there.
 */
export const spacesOpen = (env = process.env) => spaceCreationOpen(env);

/** The sign-in by e-mail code, wherever spaces are open or on a private server. */
export const emailCodeMode = (env = process.env) =>
  authMode(env) === EMAIL_CODE_MODE;

/** A private server that pairs its devices with a code (the `password` mode). */
export const pairingMode = (env = process.env) =>
  authMode(env) === PASSWORD_MODE;

let sharedService, sharedKey;
export function authService() {
  const configuration = authConfiguration();
  const key = JSON.stringify(configuration);
  if (!sharedService || sharedKey !== key) {
    sharedService = createAuthService({ configuration });
    sharedKey = key;
  }
  return sharedService;
}
