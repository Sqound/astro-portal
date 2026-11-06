import { isShippedLocale } from "astro-contracts/locales";
import { portalConfig } from "../../../../../lib/config.server.js";
import { observationNights } from "../../../../../lib/sessions.server.js";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const targetIdPattern = /^[a-z0-9][a-z0-9 .:_-]{0,199}$/i;

export async function GET(request, { params }) {
  const { date, targetId } = await params;
  const id = decodeURIComponent(targetId || "").trim();
  if (!datePattern.test(date) || !targetIdPattern.test(id))
    return Response.json(
      { error: "Session target was not found." },
      { status: 404 },
    );
  const configuration = await portalConfig();
  const requestedLocale = new URL(request.url).searchParams.get("locale");
  const locale = isShippedLocale(requestedLocale)
    ? requestedLocale
    : configuration.defaultLocale;
  const target = (
    await observationNights({
      canDownload: false,
      locale,
      applicationDefault: configuration.defaultLocale,
      includeQuality: true,
    })
  )
    .find((night) => night.date === date)
    ?.targets.find((entry) => entry.id === id);
  if (!target)
    return Response.json(
      { error: "Session target was not found." },
      { status: 404 },
    );
  return Response.json(
    { qualityEntries: target.qualityEntries || [] },
    { headers: { "cache-control": "no-store" } },
  );
}
