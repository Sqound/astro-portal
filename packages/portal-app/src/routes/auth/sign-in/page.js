import { notFound } from "next/navigation";
import { sitePath } from "portal/safe-redirect.js";
import { SpaceSignInPage } from "portal/components/space/SpaceSignInPage.js";
import { emailCodeMode } from "../../../lib/auth.server.js";
import { spacePageSettings } from "../../../lib/space-pages.server.js";
import { pageLocale } from "../../../lib/page-locale.server.js";
import { enabledServiceExtension } from "../../../lib/service-extensions.js";

// The web sign-in by e-mail code: an address, then the code received by
// e-mail. Where spaces are open any address gets a space
// (`spaceCreation: "open"`); on a private server only its owner's address
// signs in (`"closed"`, docs/PRIVATE_NOTEBOOK_AUTH.md). A private server
// signing in by password has no such page. `next` is passed on only when
// it is a path of this site; the page checks it again where it follows it.
//
// A composition that lets people into a gallery by name (`gallery.audience`)
// may know a link of its own in the query: the person it brings (an address
// to fill in, a language, the line it says above the form, and where the
// page goes after the code). Any other query: the page as it is.
export default async function SpaceSignIn({ searchParams }) {
  if (!emailCodeMode()) notFound();
  const query = (await searchParams) || {};
  const audience = enabledServiceExtension("gallery.audience");
  const guest = (await audience?.guest(query)) ?? null;
  const locale = await pageLocale({ fallback: guest?.language ?? null });
  const settings = spacePageSettings(locale);
  // A guest comes back to the gallery they were brought to; any other
  // `next` as asked.
  const next = guest ? audience.guestNext(locale, guest) : query.next;
  return (
    <SpaceSignInPage
      locale={locale}
      next={sitePath(typeof next === "string" ? next : null)}
      spaceCreation={settings ? "open" : "closed"}
      termsUrl={settings?.termsUrl ?? null}
      privacyUrl={settings?.privacyUrl ?? null}
      aboveForm={guest ? await audience.guestNotice({ locale, guest }) : null}
      initialEmail={guest?.email ?? ""}
    />
  );
}
