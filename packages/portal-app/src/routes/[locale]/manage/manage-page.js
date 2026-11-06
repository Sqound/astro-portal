import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { MANAGE_TABS } from "portal/components/manage/manage-copy.js";
import { SpacePage } from "portal/components/space/SpacePage.js";
import { ManageTargetsProvider } from "planner/components/ManageTargetsProvider.js";
import { emailCodeMode } from "../../../lib/auth.server.js";
import {
  accountPageTitleKey,
  spacePageSettings,
} from "../../../lib/space-pages.server.js";
import { pageMetadata } from "../../../lib/page-title.server.js";

/**
 * The page « Mon espace » (`/{locale}/manage/<tab>`): the identity card of
 * the space, then its tabs, one address each. It is the page of the space
 * wherever a person signs in by e-mail code, wherever spaces are open or on
 * a private server; a private server signing in by password (or without a
 * sign-in) keeps its account page, where every address of « Mon espace »
 * leads.
 *
 * A composition draws it through its own views, as it draws the account
 * page: a `HostedSpace` view (with the deletion of a space, drawn while it
 * registers `spaces.pageSettings`), and what it adds around the core's tabs
 * (`spaceHost`, below). The open-source composition uses the page as it is.
 */

// A private server signing in by e-mail code: the page of its space, for
// its owner alone (`spaceCreation: "closed"`, « votre portail »), without
// the deletion of a space — its owner deletes the server.
function PrivateSpace(props) {
  return <SpacePage {...props} spaceCreation="closed" />;
}

/** Whether the page of the space (and not the account page) is served. */
export const spacePageServed = ({ HostedSpace = null } = {}) =>
  Boolean(HostedSpace && spacePageSettings()) || emailCodeMode();

/**
 * `tab` is one of the core's tabs, or one a composition adds
 * (`portal/manage/extensions.js`): such a tab's address answers 404 unless
 * the composition's `spaceHost({ headers, locale })` names it for this
 * request. That function answers `{ tabs, offersHref, data }`: the tabs
 * drawn on every tab, known when the page is drawn (so that a tab never
 * appears then vanishes); where the composition sells (`offersHref`, the
 * link of the tabs that meet a limit, `null` where it sells nothing); and
 * what it hands to the component of each tab it added (`data[tab]`).
 */
export function manageTabPage(tab) {
  function createManagePage({
    PrivateSpace: PrivateSpaceView = PrivateSpace,
    HostedSpace = null,
    spaceHost = async () => ({}),
  } = {}) {
    return async function Page({ params }) {
      const { locale, captureId = null, item = null } = await params;
      if (!spacePageServed({ HostedSpace }))
        redirect(`/${encodeURIComponent(locale)}/account`);
      const {
        tabs: extraTabs = [],
        offersHref = null,
        data = {},
      } = await spaceHost({ headers: await headers(), locale });
      if (!MANAGE_TABS.includes(tab) && !extraTabs.includes(tab)) notFound();
      const View =
        HostedSpace && spacePageSettings() ? HostedSpace : PrivateSpaceView;
      // The planner's target search, for the tab « Captures ».
      return (
        <ManageTargetsProvider>
          <View
            locale={locale}
            tab={tab}
            captureId={captureId}
            item={item}
            extraTabs={extraTabs}
            offersHref={offersHref}
            extensionData={data}
          />
        </ManageTargetsProvider>
      );
    };
  }
  return {
    createManagePage,
    // The browser title of the page: the account page's (« Espace »).
    generateMetadata: pageMetadata(accountPageTitleKey),
  };
}
