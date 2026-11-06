const sourceRoot = "https://data.stellarium.org/surveys/milkyway/";

function safeSurveyPath(parts) {
  const path = (parts || []).join("/");
  return /^(?:properties|Norder\d+\/(?:Allsky|Dir\d+\/Npix\d+)\.webp)$/.test(
    path,
  )
    ? path
    : null;
}

export async function GET(_request, { params }) {
  const path = safeSurveyPath((await params).path);
  if (!path) return new Response("Not found", { status: 404 });

  try {
    const response = await fetch(`${sourceRoot}${path}`, {
      next: { revalidate: 604800 },
    });
    if (!response.ok)
      return new Response("Survey unavailable", { status: 502 });
    return new Response(await response.arrayBuffer(), {
      headers: {
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
        "Content-Type": path.endsWith(".webp")
          ? "image/webp"
          : "text/plain; charset=utf-8",
      },
    });
  } catch {
    return new Response("Survey unavailable", { status: 502 });
  }
}
