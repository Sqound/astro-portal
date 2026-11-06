import { currentPortalSession } from "../../../lib/debrief.server.js";
import { plannerCapabilitiesForSession } from "../../../lib/planner-capabilities.server.js";
import { TonightPage } from "planner/components/TonightPage.js";
import { pageMetadata } from "../../../lib/page-title.server.js";

// The browser title of the page (the locale layout carries the gallery's).
export const generateMetadata = pageMetadata("pageTitleTonight");

/**
 * « Cette nuit » (`/<locale>/tonight`): the night at a glance for tonight's
 * plan's place — the web counterpart of the mobile apps' landing tab. Everything it
 * shows is read in the browser (the plans of the browser or of the space, the
 * forecast, the sky quality, the planner's candidates), so the page itself
 * only carries the locale. The header's « Cette nuit » link
 * (LocaleSwitcher.js) opens it. A composition may draw it through its own
 * surface (`Tonight`), the way it does the planner; the open-source
 * composition draws the core's page.
 */
export function createTonightPage({ Tonight = TonightPage } = {}) {
  return async function Page({ params }) {
    const { locale } = await params;
    const capabilities = await plannerCapabilitiesForSession(
      await currentPortalSession(),
    );
    return <Tonight locale={locale} capabilities={capabilities} />;
  };
}

export default createTonightPage();
