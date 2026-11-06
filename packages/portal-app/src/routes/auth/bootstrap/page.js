import { notFound } from "next/navigation";
import { AuthPage } from "portal/components/auth/AuthPage.js";
import {
  authEnabled,
  hostedSignInMode,
  pairingMode,
} from "../../../lib/auth.server.js";
import { pageLocale } from "../../../lib/page-locale.server.js";

// The installation of a private server's one account, in either mode. The
// Where spaces are open there is none: they are created by the e-mail sign-in.
export default async function BootstrapPage() {
  if (!authEnabled() || hostedSignInMode()) notFound();
  return (
    <AuthPage
      initialMode="bootstrap"
      method={pairingMode() ? "password" : "email-code"}
      locale={await pageLocale()}
    />
  );
}
