import { FullImagePage } from "portal/components/detail/FullImagePage.js";
import { pageMetadata } from "../../../../../lib/page-title.server.js";

// The browser title of the page (the locale layout carries the gallery's).
export const generateMetadata = pageMetadata("pageTitleFullImage");

export default async function Page({ params }) {
  const { locale, targetId, assetId } = await params;
  return (
    <FullImagePage
      targetId={decodeURIComponent(targetId)}
      assetId={decodeURIComponent(assetId)}
      locale={locale}
    />
  );
}
