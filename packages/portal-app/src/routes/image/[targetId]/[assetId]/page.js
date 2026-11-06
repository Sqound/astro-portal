import { DetailPage } from "portal/components/detail/DetailPage.js";

export default async function Page({ params }) {
  const { targetId, assetId } = await params;
  return (
    <DetailPage
      targetId={decodeURIComponent(targetId)}
      initialAssetId={decodeURIComponent(assetId)}
    />
  );
}
