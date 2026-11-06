import { notFound } from "next/navigation";
import { SpaceLinkPage } from "portal/components/space/SpaceLinkPage.js";
import { emailCodeMode } from "../../../lib/auth.server.js";
import { pageLocale } from "../../../lib/page-locale.server.js";

// The page the link of the sign-in message opens when the application does
// not: it shows the code read from the address's fragment, nothing else,
// and never calls the service. Wherever a person signs in
// by e-mail code.
export const metadata = { referrer: "no-referrer" };

export default async function SpaceLink() {
  if (!emailCodeMode()) notFound();
  return <SpaceLinkPage locale={await pageLocale()} />;
}
