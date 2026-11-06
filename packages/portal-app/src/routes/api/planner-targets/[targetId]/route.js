import { isShippedLocale } from "astro-contracts/locales";
import { targetKnowledgeFor } from "../../../../lib/target-library.server.js";

const targetIdPattern = /^[a-z0-9][a-z0-9 .:_-]{0,199}$/i;

export async function GET(request, { params }) {
  const { targetId } = await params;
  const id = decodeURIComponent(targetId || "").trim();
  const locale = isShippedLocale(
    new URL(request.url).searchParams.get("locale"),
  )
    ? new URL(request.url).searchParams.get("locale")
    : "en";
  if (!targetIdPattern.test(id))
    return Response.json({ error: "Target was not found." }, { status: 404 });
  const knowledge = await targetKnowledgeFor({ id }, locale);
  if (!knowledge)
    return Response.json({ error: "Target was not found." }, { status: 404 });
  return Response.json(knowledge, {
    headers: { "cache-control": "public, max-age=300" },
  });
}
