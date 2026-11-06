import { databaseDriver } from "portal/persistence/database.js";
import { capturesDirectory } from "portal/uploads/capture-storage.js";
import { createMailSender } from "portal/mail/senders.js";
import { notFoundResponse } from "portal/spaces/http.js";
import {
  createPrivateSpaceSignIn,
  privateSpaceSignInConfiguration,
} from "portal/spaces/private.js";
import { recordBackendLog } from "./app-log.server.js";
import { authService, emailCodeMode, hostedSignInMode } from "./auth.server.js";
import { runtimeDir } from "./config.server.js";
import { serviceExtension } from "./service-extensions.js";

/**
 * The routes of the sign-in by e-mail code and of « Mes appareils »
 * (`/api/v1/sign-in/*`, `/api/v1/space`, `/api/v1/devices/*`) and the
 * installation of a private server in that mode (`/api/auth/bootstrap/*`):
 * the handlers a composition registered at `spaces.signIn` when its
 * extension takes `email-code` over (`service-extensions.js`), else the
 * core's private server, for its owner alone (docs/PRIVATE_NOTEBOOK_AUTH.md).
 *
 * Only the routes import this module: it loads the senders, and so the
 * mail library, which the start of the service (server.mjs) never does.
 */
export { notFoundResponse };

// The alert of a spent e-mail budget, in the application log
// (Administration → Logs); it names no address.
export const signInAlert = ({ level, event, message }) =>
  recordBackendLog({ level, event, message });

/** What the handlers of a sign-in depend on, to build them again when it changes. */
export const signInSettingsKey = (settings) =>
  JSON.stringify({
    ...settings,
    signInKey: settings.signInKey?.toString("base64") || null,
    adminEmails: settings.adminEmails ? [...settings.adminEmails] : null,
    captures: capturesDirectory(),
  });

/** The sender of these settings, or `null` when it cannot be built. */
export function mailSenderOrNull(settings) {
  try {
    return createMailSender(settings);
  } catch {
    // A malformed connection string: no message can leave, and the request
    // for a code says the sign-in is unavailable.
    return null;
  }
}

let privateServer = null;
let privateKey = null;
function privateSignIn() {
  const settings = privateSpaceSignInConfiguration(process.env, {
    runtimeDir,
  });
  const auth = authService();
  const key = signInSettingsKey(settings);
  if (!privateServer || privateKey !== key || privateServer.auth !== auth) {
    privateServer = {
      auth,
      ...createPrivateSpaceSignIn({
        driver: databaseDriver(),
        configuration: settings,
        auth,
        alert: signInAlert,
      }),
    };
    privateKey = key;
  }
  return privateServer;
}

/**
 * The handlers of the sign-in by e-mail code — a composition's, with the
 * deletion of a space, or a private server's — or `null` when the service
 * does not sign in by e-mail code (the routes then answer 404).
 */
export function spaceSignIn() {
  if (hostedSignInMode()) {
    const registered = serviceExtension("spaces.signIn");
    if (!registered)
      throw new Error(
        "The extension that takes the sign-in by e-mail code over registered no handlers (spaces.signIn).",
      );
    return registered.handlers();
  }
  if (emailCodeMode()) return privateSignIn().handlers;
  return null;
}

/**
 * The installation of a private server signing in by e-mail code (an
 * address, a code sent at once, then the account), or `null`.
 */
export function privateInstallation() {
  if (hostedSignInMode() || !emailCodeMode()) return null;
  return privateSignIn().installation;
}
