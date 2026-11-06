import { clientOrigin } from "../api/client-origin.js";

/**
 * The installation of a private server in the `email-code` mode
 * (docs/PRIVATE_NOTEBOOK_AUTH.md, « Installing »), at `/auth/bootstrap`:
 *
 * 1. `start`: the bootstrap secret and the owner's address; a code leaves at
 *    once, under the rules of every code — so that a sender set up wrong is
 *    seen at the installation, not on the first night out;
 * 2. `confirm`: the secret again (the page kept it) and the code; the code is
 *    used and the account created in one transaction, the browser is signed
 *    in, and the ten recovery codes are shown once.
 *
 * `spaces` is the private server's sign-in (spaces/service.js), `auth` the
 * core's authentication (auth-service.js); `configuration` names where the
 * network origin of a request is read.
 */
export function createEmailCodeInstallation({ spaces, auth, configuration }) {
  return {
    async start({ bootstrapSecret, email, language, headers }) {
      await auth.assertInstallationOpen(bootstrapSecret);
      return await spaces.requestInstallationCode({
        email,
        language,
        origin: clientOrigin(headers, configuration),
      });
    },
    async confirm({ bootstrapSecret, email, code, organizationName, headers }) {
      await auth.assertInstallationOpen(bootstrapSecret);
      const owner = auth.pendingOwner({ organizationName });
      const account = await spaces.verifyInstallationCode({
        email,
        code,
        origin: clientOrigin(headers, configuration),
        create: owner.write,
      });
      const session = await auth.openSession(account);
      return { recoveryCodes: owner.recoveryCodes, cookies: session.cookies };
    },
  };
}
