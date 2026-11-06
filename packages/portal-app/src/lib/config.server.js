import { dirname, join, resolve } from "node:path";
import { readFile, rename, writeFile } from "node:fs/promises";
import {
  defaultLocale as registryDefaultLocale,
  localeName,
  shippedLocales,
} from "astro-contracts/locales";
import { normalizedProductName } from "./product-name.js";

// The directory the service runs from: the repository of its composition.
// `server.mjs` sets it to that repository before anything reads it; a
// script or a test run from the repository's root finds it as its working
// directory.
export const serviceDir = resolve(
  /* turbopackIgnore: true */ process.env.ASTRO_PORTAL_SERVICE_DIR ||
    process.cwd(),
);
export const imagesDir = resolve(
  /* turbopackIgnore: true */ process.env.ASTRO_PORTAL_IMAGES_DIR ||
    join(serviceDir, "examples", "images"),
);
export const metadataDir = resolve(
  /* turbopackIgnore: true */ process.env.ASTRO_PORTAL_METADATA_DIR ||
    join(serviceDir, "examples", "catalog"),
);
export const runtimeDir = resolve(
  /* turbopackIgnore: true */ process.env.ASTRO_PORTAL_RUNTIME_DIR ||
    join(serviceDir, ".astro-portal"),
);
export const plateSolveDir = resolve(
  /* turbopackIgnore: true */ process.env.ASTRO_PORTAL_PLATE_SOLVE_DIR ||
    join(runtimeDir, "plate-solves"),
);
// Per-capture measurements are deliberately kept alongside the private runtime
// data.  The public repository only contains the reader and the JSON contract.
export const captureQualityDir = resolve(
  /* turbopackIgnore: true */ process.env.ASTRO_PORTAL_CAPTURE_QUALITY_DIR ||
    join(runtimeDir, "quality"),
);
export const stellariumPreviewsDir = resolve(
  /* turbopackIgnore: true */ process.env.ASTRO_PORTAL_STELLARIUM_DIR ||
    join(metadataDir, "stellarium-previews"),
);
export const astrometryIndexDir = resolve(
  /* turbopackIgnore: true */ process.env.ASTRO_PORTAL_ASTROMETRY_INDEX_DIR ||
    join(runtimeDir, "astrometry", "indexes"),
);
export const hygCatalog = resolve(
  /* turbopackIgnore: true */ process.env.ASTRO_PORTAL_HYG_CATALOG ||
    join(runtimeDir, "astrometry", "catalogs", "hyg_v41.csv"),
);
// The deep-sky reference catalogue is deliberately runtime data. It can grow
// independently of the public application code and remains available locally
// if an upstream catalogue changes or is temporarily unavailable.
export const targetLibraryDir = resolve(
  /* turbopackIgnore: true */ process.env.ASTRO_PORTAL_TARGET_LIBRARY_DIR ||
    join(runtimeDir, "target-library"),
);
export const targetLibraryImagesDir = resolve(
  /* turbopackIgnore: true */ process.env
    .ASTRO_PORTAL_TARGET_LIBRARY_IMAGES_DIR || join(targetLibraryDir, "images"),
);
// The Solar System's eleven NASA pictures ship with the code, next to the
// demonstration catalogue (`examples/target-library-images/`, with their
// credits): a portal started without an initialization package serves them
// from there. A file of `targetLibraryImagesDir` with the same name wins, so
// `npm run import:solar-system-images` still refreshes them at run time.
export const bundledTargetLibraryImagesDir = resolve(
  /* turbopackIgnore: true */ process.env
    .ASTRO_PORTAL_BUNDLED_TARGET_LIBRARY_IMAGES_DIR ||
    join(serviceDir, "examples", "target-library-images"),
);
// The pictures of the bright stars and of the constellations (a fixed render
// of the application's sky map) ship with the code too, in their own folder
// beside their credits and manifest (`examples/sky-culture-images/`): the
// image route answers them after the runtime folder and the Solar System's.
export const bundledSkyCultureImagesDir = resolve(
  /* turbopackIgnore: true */ process.env
    .ASTRO_PORTAL_BUNDLED_SKY_CULTURE_IMAGES_DIR ||
    join(serviceDir, "examples", "sky-culture-images"),
);
// Curated, high-quality photographic references live separately from the
// all-sky DSS fallback. This keeps a future refresh of the survey thumbnails
// from overwriting rights-tracked editorial selections.
export const targetLibraryCuratedPhotoImagesDir = resolve(
  /* turbopackIgnore: true */ process.env
    .ASTRO_PORTAL_TARGET_LIBRARY_CURATED_PHOTO_IMAGES_DIR ||
    join(targetLibraryDir, "curated-photo-images"),
);
export const targetLibraryVisualImagesDir = resolve(
  /* turbopackIgnore: true */ process.env
    .ASTRO_PORTAL_TARGET_LIBRARY_VISUAL_IMAGES_DIR ||
    join(targetLibraryDir, "visual-images"),
);
// Generated, intentionally conservative visual previews are distinct from
// optional third-party eyepiece sketches, which retain their own provenance.
export const targetLibraryVisualPreviewImagesDir = resolve(
  /* turbopackIgnore: true */ process.env
    .ASTRO_PORTAL_TARGET_LIBRARY_VISUAL_PREVIEW_IMAGES_DIR ||
    join(targetLibraryDir, "visual-preview-images"),
);
// Versionable initialization package. It is intentionally a sibling of
// runtime state: deployments replace code releases, while this package can be
// copied to bootstrap another instance without copying the SQLite database.
export const staticDataDir = resolve(
  /* turbopackIgnore: true */ process.env.ASTRO_PORTAL_STATIC_DATA_DIR ||
    join(runtimeDir, "..", "static-data"),
);

export const solveFieldCommand =
  process.env.ASTRO_PORTAL_SOLVE_FIELD || "solve-field";
export const wcsInfoCommand = process.env.ASTRO_PORTAL_WCSINFO || "wcsinfo";
export const plotConstellationsCommand =
  process.env.ASTRO_PORTAL_PLOT_CONSTELLATIONS || "plot-constellations";
export const defaultScaleLow = Number(
  process.env.ASTRO_PORTAL_SCALE_LOW || 0.8,
);
export const defaultScaleHigh = Number(
  process.env.ASTRO_PORTAL_SCALE_HIGH || 4.5,
);
export const solveCpuLimit = Number(
  process.env.ASTRO_PORTAL_SOLVE_CPU_LIMIT || 90,
);
export const redactLocations = /^(1|true|yes)$/i.test(
  process.env.ASTRO_PORTAL_REDACT_LOCATIONS || "",
);
/**
 * Where the home gallery comes from: `ASTRO_PORTAL_GALLERY_SOURCE` =
 * `captures` (the default) — the public captures of every space, read from
 * the database; `files` — the operator's file gallery of
 * `ASTRO_PORTAL_IMAGES_DIR` and `ASTRO_PORTAL_METADATA_DIR`, its detail
 * pages and its editor in the administration, exactly as before. Read at
 * each request, like the other settings a test changes.
 */
export const gallerySource = () =>
  String(process.env.ASTRO_PORTAL_GALLERY_SOURCE || "")
    .trim()
    .toLowerCase() === "files"
    ? "files"
    : "captures";
export const adminAllowedIps = (
  process.env.ASTRO_PORTAL_ADMIN_ALLOWED_IPS || ""
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

let portalConfiguration;
// A BCP 47 tag of a language, with an optional script and region
// (`en`, `pt-BR`, `zh-Hans`): the shape of the registry's tags.
const localePattern = /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2})?$/;
const translationKeyPattern = /^[A-Za-z][A-Za-z0-9_]*$/;

function normalizedLocales(value) {
  return Array.isArray(value)
    ? [...new Set(value.map(String))].filter((locale) =>
        localePattern.test(locale),
      )
    : [];
}

function normalizedLocaleNames(value, locales) {
  const names = {};
  for (const locale of locales) {
    const candidate = String(value?.[locale] || localeName(locale))
      .trim()
      .slice(0, 80);
    names[locale] = candidate || locale;
  }
  return names;
}

function normalizedTranslations(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result = {};
  for (const [locale, entries] of Object.entries(value)) {
    if (!localePattern.test(locale) || !entries || typeof entries !== "object")
      continue;
    const next = {};
    for (const [key, translation] of Object.entries(entries)) {
      if (!translationKeyPattern.test(key) || typeof translation !== "string")
        continue;
      next[key] = translation.slice(0, 4000);
    }
    if (Object.keys(next).length) result[locale] = next;
  }
  return result;
}

function normalizedTranslationKeys(value) {
  return Array.isArray(value)
    ? [...new Set(value.map(String))]
        .filter((key) => translationKeyPattern.test(key))
        .slice(0, 500)
    : [];
}

async function configuredFile() {
  if (!process.env.ASTRO_PORTAL_CONFIG) return null;
  try {
    return JSON.parse(await readFile(process.env.ASTRO_PORTAL_CONFIG, "utf8"));
  } catch (error) {
    throw new Error(`ASTRO_PORTAL_CONFIG cannot be read: ${error.message}`);
  }
}

/** Optional deployment configuration: generic code never embeds private paths. */
export async function portalConfig() {
  if (portalConfiguration) return portalConfiguration;
  const fileConfig = (await configuredFile()) || {};
  const supportedLocales = normalizedLocales(fileConfig.supportedLocales);
  const activeLocales = supportedLocales.length
    ? supportedLocales
    : shippedLocales();
  portalConfiguration = {
    supportedLocales: activeLocales,
    defaultLocale:
      fileConfig.defaultLocale ||
      process.env.ASTRO_PORTAL_DEFAULT_LOCALE ||
      registryDefaultLocale(),
    publicUrl:
      fileConfig.publicUrl || process.env.ASTRO_PORTAL_PUBLIC_URL || null,
    // The displayed product name, never a technical identifier (package
    // names, cookies, storage keys, `ASTRO_PORTAL_*` variable names stay
    // fixed). `portal.config.json`'s `productName` wins over the environment
    // variable, matching `publicUrl` above; neither set falls back to the
    // current fixed name, so an unconfigured deployment shows no visible
    // change at all.
    productName: normalizedProductName(
      fileConfig.productName || process.env.ASTRO_PORTAL_PRODUCT_NAME,
    ),
    localeNames: normalizedLocaleNames(fileConfig.localeNames, activeLocales),
    translationOverrides: normalizedTranslations(
      fileConfig.translationOverrides,
    ),
    customTranslationKeys: normalizedTranslationKeys(
      fileConfig.customTranslationKeys,
    ),
  };
  if (
    !portalConfiguration.supportedLocales.includes(
      portalConfiguration.defaultLocale,
    )
  )
    portalConfiguration.defaultLocale = portalConfiguration.supportedLocales[0];
  return portalConfiguration;
}

export async function updatePortalLocales({
  supportedLocales,
  defaultLocale,
  localeNames,
  translationOverrides,
  customTranslationKeys,
}) {
  const path = process.env.ASTRO_PORTAL_CONFIG;
  if (!path) throw new Error("La configuration privée du portail est absente.");
  const locales = normalizedLocales(supportedLocales);
  if (!locales.length) throw new Error("Conservez au moins une langue active.");
  if (!locales.includes(defaultLocale))
    throw new Error("La langue par défaut doit être active.");
  const next = {
    ...((await configuredFile()) || {}),
    supportedLocales: locales,
    defaultLocale,
    localeNames: normalizedLocaleNames(localeNames, locales),
    translationOverrides: normalizedTranslations(translationOverrides),
    customTranslationKeys: normalizedTranslationKeys(customTranslationKeys),
  };
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, path);
  portalConfiguration = null;
  return portalConfig();
}

export const imageExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif",
  ".svg",
  ".tif",
  ".tiff",
]);
export const mimeTypes = {
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml; charset=utf-8",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
};
