import { catalog, plateSolve } from "../../../../../lib/catalog.server.js";

export async function GET(request, { params }) {
  const { targetId, assetId } = await params;
  const decodedTargetId = decodeURIComponent(targetId),
    decodedAssetId = decodeURIComponent(assetId);
  const target = (await catalog()).find((item) => item.id === decodedTargetId);
  const asset =
    target &&
    [...target.variants, ...target.history].find(
      (item) =>
        item.assetId === decodedAssetId || item.baseName === decodedAssetId,
    );
  if (!asset?.imageUrl)
    return new Response("Image introuvable", { status: 404 });
  return Response.json(
    await plateSolve(
      target,
      asset,
      new URL(request.url).searchParams.get("retry") === "1",
    ),
    { headers: { "Cache-Control": "no-store" } },
  );
}
