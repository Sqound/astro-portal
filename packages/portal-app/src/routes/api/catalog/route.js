import { catalog, catalogueListItem } from "../../../lib/catalog.server.js";
import { isExternalRequest } from "../../../lib/media.server.js";
import { portalConfig } from "../../../lib/config.server.js";
import { normalizeSearch } from "portal/i18n.js";

export async function GET(request) {
  const configuration = await portalConfig();
  const url = new URL(request.url);
  const requestedLocale = url.searchParams.get("locale");
  const locale = configuration.supportedLocales.includes(requestedLocale)
    ? requestedLocale
    : configuration.defaultLocale;
  const query = url.searchParams.get("query") || "";
  const tag = url.searchParams.get("tag") || "";
  const requestedTarget = url.searchParams.get("target") || "";
  const summary = url.searchParams.get("summary") === "1";
  const offset = Math.max(
    0,
    Number.parseInt(url.searchParams.get("offset") || "0", 10) || 0,
  );
  let limit = Math.min(
    48,
    Math.max(
      1,
      Number.parseInt(url.searchParams.get("limit") || "24", 10) || 24,
    ),
  );
  const allTargets = await catalog({
    canDownload: !isExternalRequest(request),
    locale,
    applicationDefault: configuration.defaultLocale,
    includeTargetKnowledge: url.searchParams.get("knowledge") === "1",
    knowledgeTargetId: requestedTarget || null,
  });
  const normalizedQuery = normalizeSearch(query, locale);
  const targets = allTargets.filter(
    (target) =>
      (!requestedTarget || target.id === requestedTarget) &&
      (!tag || (target.tags || []).includes(tag)) &&
      (!normalizedQuery ||
        normalizeSearch(
          `${target.title} ${(target.objects || []).join(" ")} ${(target.localizedAliases || []).join(" ")}`,
          locale,
        ).includes(normalizedQuery)),
  );
  targets.sort((left, right) => {
    const leftDate =
      Date.parse(
        (left.latest?.date || left.featured?.date || "").replaceAll("/", "-"),
      ) || 0;
    const rightDate =
      Date.parse(
        (right.latest?.date || right.featured?.date || "").replaceAll("/", "-"),
      ) || 0;
    return rightDate - leftDate;
  });
  if (url.searchParams.get("order") === "oldest") targets.reverse();
  if (url.searchParams.get("all") === "1") limit = targets.length || 1;
  return Response.json(
    {
      generatedAt: new Date().toISOString(),
      targets: (summary ? targets.map(catalogueListItem) : targets).slice(
        offset,
        offset + limit,
      ),
      total: targets.length,
      catalogTotal: allTargets.length,
      nextOffset: offset + limit < targets.length ? offset + limit : null,
      tags: [
        ...new Set(allTargets.flatMap((target) => target.tags || [])),
      ].sort((left, right) => left.localeCompare(right, locale)),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
