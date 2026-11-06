import { FullImagePage } from "portal/components/detail/FullImagePage.js";

export default async function Page({ params }) {
  const { targetId, assetId } = await params;
  return (
    <FullImagePage
      targetId={decodeURIComponent(targetId)}
      assetId={decodeURIComponent(assetId)}
    />
  );
}
