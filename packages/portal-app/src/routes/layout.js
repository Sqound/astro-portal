import { headers } from "next/headers";
import { portalConfig } from "../lib/config.server.js";
import { enabledServiceExtension } from "../lib/service-extensions.js";
import { footerBuild } from "../lib/build-identity.server.js";
import { headerState } from "../lib/header-state.server.js";
import { LocaleSwitcher } from "portal/components/LocaleSwitcher.js";
import { ClientLogReporter } from "portal/components/ClientLogReporter.js";
import { TranslationProvider } from "portal/components/TranslationProvider.js";
import { SourceNotice } from "portal/components/SourceNotice.js";
import { NightModeFilterDefs } from "portal/components/NightModeFilterDefs.js";
import { spacePageSettings } from "../lib/space-pages.server.js";
import { addressLocale, pageLocale } from "../lib/page-locale.server.js";

// The displayed product name is configurable per deployment
// (`ASTRO_PORTAL_PRODUCT_NAME`/`portal.config.json`'s `productName`), so this
// page's own `<title>` is resolved at request time rather than fixed here.
export async function generateMetadata() {
  const { productName } = await portalConfig();
  return {
    title: productName,
    description: "Catalogue local d’astrophotographie",
  };
}

// The planner behaves as an application on a handheld device: its responsive layout
// owns the viewport, rather than a browser pinch gesture resizing the whole
// interface underneath the user.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default async function RootLayout({ children }) {
  const { supportedLocales, localeNames, translationOverrides, productName } =
    await portalConfig();
  // A page whose address names no language (`/auth/…`) speaks the visitor's
  // last choice, else the default: the selector, the page and the footer
  // alike. A `/fr/…` page speaks French whatever this value.
  const fallbackLocale = await pageLocale();
  // The document's own language: the address's when it names one.
  const documentLocale = (await addressLocale()) ?? fallbackLocale;
  const requestHeaders = await headers();
  // What the header shows, decided here for the person who asks: served
  // right for each role, kept across the navigations inside the site.
  const header = await headerState({ requestHeaders });
  // What a composition adds to the footer for this request (`footer.link`);
  // the open-source composition adds nothing.
  const footerLink = enabledServiceExtension("footer.link");
  const extra = footerLink
    ? await footerLink.element({ requestHeaders, fallbackLocale })
    : null;
  // The version and the commit, small, at the end of the footer: read
  // from the running service, never at build time. The footer draws them
  // under `/<locale>/admin` only: it decides from
  // the page's address (`portal/source-notice-scope.js`), which a layout
  // shared by every navigation could not read from the server.
  const build = footerBuild();
  // What a composition says over every page (`layout.overlay`); the
  // open-source composition says nothing.
  const overlayPoint = enabledServiceExtension("layout.overlay");
  const overlay = overlayPoint
    ? await overlayPoint.element({
        requestHeaders,
        fallbackLocale,
        version: build.version,
      })
    : null;
  return (
    // `suppressHydrationWarning`: the first-paint script of
    // `NightModeFilterDefs` sets `data-night-mode` on this element before
    // React hydrates it.
    <html lang={documentLocale} suppressHydrationWarning>
      <body>
        <NightModeFilterDefs />
        <TranslationProvider
          overrides={translationOverrides}
          productName={productName}
        >
          <ClientLogReporter />
          <LocaleSwitcher
            supportedLocales={supportedLocales}
            localeNames={localeNames}
            productName={productName}
            fallbackLocale={fallbackLocale}
            spaces={Boolean(spacePageSettings())}
            authentication={header.authentication}
            privateGalleryPath={header.privateGalleryPath}
            debriefQueueCount={header.debriefQueueCount}
          />
          {children}
          {overlay}
        </TranslationProvider>
        <SourceNotice
          fallbackLocale={fallbackLocale}
          extra={extra}
          version={build.version}
          commit={build.commit}
        />
      </body>
    </html>
  );
}
