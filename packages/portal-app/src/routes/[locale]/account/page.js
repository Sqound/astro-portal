import { redirect } from "next/navigation";
import { AccountPage } from "portal/components/account/AccountPage.js";
import { NoSignInPage } from "portal/components/no-sign-in/NoSignInPage.js";
import { authEnabled } from "../../../lib/auth.server.js";
import { spacePageServed } from "../manage/manage-page.js";
import { accountPageTitleKey } from "../../../lib/space-pages.server.js";
import { pageMetadata } from "../../../lib/page-title.server.js";

// The browser title of the page (the locale layout carries the gallery's).
export const generateMetadata = pageMetadata(accountPageTitleKey);

/**
 * The account page (`/<locale>/account`). Wherever a person signs in by
 * e-mail code, the space has its page « Mon espace » (`/<locale>/manage`):
 * this address leads to its tab « Réglages », so that an old link or an
 * e-mail already sent lands on the space. A private server signing in by
 * password keeps its account page here (devices paired by code).
 *
 * A composition may draw the account page through its own view and give it
 * an extra section (`billingContext(locale)`, handed to the view as
 * `billing`); `HostedSpace` says that it serves the page of the space. The
 * open-source composition uses the page as it is.
 */
export function createAccountPage({
  Account = AccountPage,
  HostedSpace = null,
  billingContext = async () => null,
} = {}) {
  return async function Page({ params }) {
    const { locale } = await params;
    // A server that runs without a sign-in has no private API: the page
    // says so once instead of failing three requests.
    if (!authEnabled()) return <NoSignInPage locale={locale} page="account" />;
    if (spacePageServed({ HostedSpace }))
      redirect(`/${encodeURIComponent(locale)}/manage/settings`);
    const billing = await billingContext(locale);
    return <Account locale={locale} billing={billing} />;
  };
}

export default createAccountPage();
