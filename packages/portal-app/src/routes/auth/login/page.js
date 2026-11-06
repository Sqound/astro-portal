import { notFound } from "next/navigation";
import { AuthPage } from "portal/components/auth/AuthPage.js";
import { pairingMode } from "../../../lib/auth.server.js";
import { pageLocale } from "../../../lib/page-locale.server.js";

// A private server's sign-in by address and password. Wherever a person
// signs in by e-mail code, the page is /auth/sign-in.
export default async function LoginPage() {
  if (!pairingMode()) notFound();
  return (
    <AuthPage
      initialMode="login"
      method="password"
      locale={await pageLocale()}
    />
  );
}
