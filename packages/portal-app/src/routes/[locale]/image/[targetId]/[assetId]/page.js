import { DetailPage } from "portal/components/detail/DetailPage.js";
import { pageMetadata } from "../../../../../lib/page-title.server.js";

// The browser title of the page (the locale layout carries the gallery's).
export const generateMetadata = pageMetadata("pageTitleTarget");

export default async function Page({ params }) {
  const { locale, targetId, assetId } = await params;
  return (
    <DetailPage
      locale={locale}
      targetId={decodeURIComponent(targetId)}
      initialAssetId={decodeURIComponent(assetId)}
    />
  );
}
