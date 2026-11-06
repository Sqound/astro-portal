import { notFound } from "next/navigation";
import { AuthPage } from "portal/components/auth/AuthPage.js";
import {
  authEnabled,
  hostedSignInMode,
  pairingMode,
} from "../../../lib/auth.server.js";
import { pageLocale } from "../../../lib/page-locale.server.js";

// A private server's recovery codes, in either mode: the way back when the
// e-mail no longer leaves or the password is lost. Where spaces are open
// there is none.
export default async function RecoveryPage() {
  if (!authEnabled() || hostedSignInMode()) notFound();
  return (
    <AuthPage
      initialMode="recovery"
      method={pairingMode() ? "password" : "email-code"}
      locale={await pageLocale()}
    />
  );
}
