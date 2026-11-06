import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { adminPageAccess } from "../../lib/admin.server.js";
import { parseAdminRoute } from "portal/admin-route.js";
import { gallerySource, portalConfig } from "../../lib/config.server.js";
import { AdminPage } from "portal/components/admin/AdminPage.js";

/** The administration's page: its sections, the same on every composition. */
export async function AdminScreen({ locale, segments }) {
  // The editor of the operator's file gallery, only where the home gallery
  // is that file gallery.
  const fileGallery = gallerySource() === "files";
  const route = parseAdminRoute(segments, { fileGallery });
  if (!route) notFound();
  // A private server with a sign-in relies on server.mjs, its single page gate;
  // where spaces are open, the page asks whether this person administers the service,
  // exactly as the administration's API does (adminPageAccess).
  const access = await adminPageAccess(await headers());
  if (!access.allowed) notFound();
  const configuration = await portalConfig();
  return (
    <AdminPage
      clientIp={access.ip}
      locale={locale}
      supportedLocales={configuration.supportedLocales}
      defaultLocale={configuration.defaultLocale}
      localeNames={configuration.localeNames}
      translationOverrides={configuration.translationOverrides}
      customTranslationKeys={configuration.customTranslationKeys}
      fileGallery={fileGallery}
      route={route}
    />
  );
}
