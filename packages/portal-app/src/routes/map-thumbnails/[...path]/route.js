import { catalog } from "../../../lib/catalog.server.js";

let previewLookup;

async function previews() {
  if (!previewLookup) {
    previewLookup = catalog({ locale: "en", canDownload: false }).then(
      (targets) =>
        new Map(
          targets
            .map((target) => [target.id, target.featured || target.reference])
            .filter(([, asset]) => asset?.imageUrl),
        ),
    );
  }
  return previewLookup;
}

export async function GET(request, { params }) {
  const [fileName] = (await params).path || [];
  const match = fileName?.match(/^([a-z0-9-]+)\.png$/i);
  if (!match) return new Response("Image introuvable", { status: 404 });

  const asset = (await previews()).get(match[1]);
  if (!asset) return new Response("Image introuvable", { status: 404 });

  const query = new URLSearchParams({
    url: asset.imageUrl,
    w: "384",
    q: "75",
  });
  return new Response(null, {
    status: 307,
    headers: { Location: `/_next/image?${query}` },
  });
}
