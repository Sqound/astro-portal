import { readFile } from "node:fs/promises";
import path from "node:path";
import { stellariumCode, stellariumLocales } from "astro-contracts/locales";
import { serviceDir } from "../../../../../../lib/config.server.js";

const sourceRoot =
  "https://stellarium.sfo2.cdn.digitaloceanspaces.com/i18n/v1/skyculture/";
const westernCultureRoot = path.join(
  serviceDir,
  "public/vendor/stellarium/skydata/skycultures/western",
);

const dictionaries = new Map();

function safeAssetPath(parts) {
  // The engine activates its built-in western culture only when the source
  // URL ends in `western`.  Accept that virtual segment before resolving the
  // localized culture's actual files.
  const normalizedParts = parts?.[0] === "western" ? parts.slice(1) : parts;
  const assetPath = (normalizedParts || []).join("/") || "index.json";
  // Stellarium-Web loads this document before it considers a culture ready.
  // Without it, the localized source is parsed but never activated, so no
  // constellation lines are created on the map.
  return /^(?:index\.json|description\.md|illustrations\/[a-z0-9-]+\.webp)$/i.test(
    assetPath,
  )
    ? assetPath
    : null;
}

async function loadDictionary(locale) {
  if (!dictionaries.has(locale)) {
    dictionaries.set(
      locale,
      fetch(`${sourceRoot}${stellariumCode(locale)}.json`, {
        next: { revalidate: 604800 },
      }).then(async (response) => {
        if (!response.ok) throw new Error("Translations unavailable");
        return response.json();
      }),
    );
  }
  return dictionaries.get(locale);
}

export async function GET(_request, { params }) {
  const { locale, path: parts } = await params;
  const assetPath = safeAssetPath(parts);
  // The shipped locales but the default one that have a Stellarium
  // translation (the locale registry's `stellarium` code).
  if (!stellariumLocales().includes(locale) || !assetPath)
    return new Response("Not found", { status: 404 });

  try {
    const asset = await readFile(path.join(westernCultureRoot, assetPath));
    if (assetPath !== "index.json") {
      return new Response(asset, {
        headers: {
          "Cache-Control": "public, max-age=86400, s-maxage=604800",
          "Content-Type":
            assetPath === "description.md"
              ? "text/markdown; charset=utf-8"
              : "image/webp",
        },
      });
    }

    const [dictionary, culture] = await Promise.all([
      loadDictionary(locale),
      Promise.resolve(JSON.parse(asset)),
    ]);
    // Stellarium-Web renders western-constellation labels from `native` names
    // in several display modes.  Localizing those names in the served culture
    // makes the canvas honor the portal language consistently.
    for (const constellation of culture.constellations) {
      const commonName = constellation.common_name;
      if (!commonName) continue;
      commonName.native =
        dictionary[commonName.native] ||
        dictionary[commonName.english] ||
        commonName.native;
    }
    return Response.json(culture, {
      headers: {
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      },
    });
  } catch {
    return new Response("Skyculture unavailable", { status: 502 });
  }
}
