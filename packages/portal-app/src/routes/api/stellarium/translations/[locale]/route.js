import { readFile } from "node:fs/promises";
import path from "node:path";
import { stellariumCode, stellariumLocales } from "astro-contracts/locales";
import { serviceDir } from "../../../../../lib/config.server.js";

const sourceRoot =
  "https://stellarium.sfo2.cdn.digitaloceanspaces.com/i18n/v1/skyculture/";
const westernSkyculturePath = path.join(
  serviceDir,
  "public/vendor/stellarium/skydata/skycultures/western/index.json",
);

let constellationNamesPromise;

async function loadConstellationNames() {
  if (!constellationNamesPromise) {
    constellationNamesPromise = readFile(westernSkyculturePath, "utf8").then(
      (source) =>
        JSON.parse(source).constellations.flatMap((constellation) => {
          const { english, native } = constellation.common_name || {};
          return english && native ? [[english, native]] : [];
        }),
    );
  }
  return constellationNamesPromise;
}

export async function GET(_request, { params }) {
  const { locale } = await params;
  // The shipped locales but the default one that have a Stellarium
  // translation (the locale registry's `stellarium` code).
  if (!stellariumLocales().includes(locale))
    return new Response("Not found", { status: 404 });

  try {
    const response = await fetch(
      `${sourceRoot}${stellariumCode(locale)}.json`,
      {
        next: { revalidate: 604800 },
      },
    );
    if (!response.ok)
      return new Response("Translations unavailable", { status: 502 });
    const [dictionary, constellationNames] = await Promise.all([
      response.json(),
      loadConstellationNames(),
    ]);
    // The engine asks for a constellation's English common name ("Giraffe"),
    // while Skycultures' French/Japanese dictionaries commonly index its IAU
    // name ("Camelopardalis").  Complete that bridge at the source instead of
    // teaching the canvas component about individual constellations.
    for (const [englishName, nativeName] of constellationNames) {
      dictionary[englishName] ??= dictionary[nativeName] || nativeName;
    }
    return Response.json(dictionary, {
      headers: {
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      },
    });
  } catch {
    return new Response("Translations unavailable", { status: 502 });
  }
}
