import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { solarSystemImageSources } from "astro-core/solar-system-image-sources.js";
import { cropTargetLibraryImage } from "portal/target-library-image-crop.js";

// `--bundle` refreshes the pictures that ship with the code
// (`examples/target-library-images/`, beside their CREDITS.md and SOURCES.json)
// instead of a portal's runtime folder: it downloads them all again and writes
// no manifest.
const bundle = process.argv.includes("--bundle");
const bundledDirectory = resolve(
  fileURLToPath(new URL("..", import.meta.url)),
  "examples",
  "target-library-images",
);

const libraryFile = resolve(
  process.env.ASTRO_PORTAL_TARGET_LIBRARY_FILE ||
    ".astro-portal/target-library/openngc.json",
);
const libraryDirectory = dirname(libraryFile);
const imagesDirectory = bundle
  ? bundledDirectory
  : resolve(
      process.env.ASTRO_PORTAL_TARGET_LIBRARY_IMAGES_DIR ||
        join(libraryDirectory, "images"),
    );
const manifestFile = join(libraryDirectory, "images.json");

// `--only <targetId>[,<targetId>…]` imports those sources alone; `--force`
// downloads again a picture already in the folder (without it, one is kept).
const argumentsByName = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (!argument.startsWith("--")) continue;
  const [name, inlineValue] = argument.slice(2).split("=", 2);
  argumentsByName.set(name, inlineValue ?? process.argv[index + 1]);
  if (inlineValue === undefined && !process.argv[index + 1]?.startsWith("--"))
    index += 1;
}
const only = argumentsByName.has("only")
  ? String(argumentsByName.get("only")).split(",")
  : null;
const force = bundle || argumentsByName.has("force");
const sources = solarSystemImageSources.filter(
  (source) => !only || only.includes(source.targetId),
);

async function exists(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function writeAtomically(path, content) {
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, content);
  await rename(temporary, path);
}

async function imageFor(source) {
  const direct = `https://images-assets.nasa.gov/image/${source.nasaId}/${source.nasaId}~${source.assetVariant || "small"}.jpg`;
  let response = await fetch(direct, {
    headers: { "user-agent": "PlanAstro solar-system image importer" },
    signal: AbortSignal.timeout(45_000),
  });
  let assetUrl = direct;
  if (!response.ok) {
    const assets = await fetch(
      `https://images-api.nasa.gov/asset/${source.nasaId}`,
      { signal: AbortSignal.timeout(30_000) },
    ).then((result) => result.json());
    assetUrl = (assets.collection?.items || [])
      .map((entry) => entry.href)
      .find((url) => /~(?:small|medium|thumb)\.jpg$/i.test(url));
    if (!assetUrl) throw new Error(`No JPEG asset for ${source.nasaId}`);
    response = await fetch(assetUrl, {
      headers: { "user-agent": "PlanAstro solar-system image importer" },
      signal: AbortSignal.timeout(45_000),
    });
  }
  if (!response.ok) throw new Error(`NASA image HTTP ${response.status}`);
  if (!response.headers.get("content-type")?.startsWith("image/"))
    throw new Error(`NASA asset is not an image for ${source.nasaId}`);
  const downloaded = Buffer.from(await response.arrayBuffer());
  if (downloaded.length < 1_000)
    throw new Error(`NASA image is unexpectedly small for ${source.nasaId}`);
  // A crop the source record declares (Venus, the left half of NASA's
  // comparison board) is applied to what was downloaded, before it is kept.
  const image = source.crop
    ? await cropTargetLibraryImage(downloaded, source.crop)
    : downloaded;
  return { image, assetUrl };
}

let manifest = {};
if (!bundle)
  try {
    manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  } catch {}
const images =
  manifest.images && typeof manifest.images === "object" ? manifest.images : {};
await mkdir(imagesDirectory, { recursive: true });

let downloaded = 0;
let skipped = 0;
for (const source of sources) {
  const file = source.file || `${source.targetId}.jpg`;
  const destination = join(imagesDirectory, file);
  // A picture kept before its source declared a crop is not the cropped one:
  // the manifest says which crop its file went through.
  const cropped = !source.crop || images[source.targetId]?.crop === source.crop;
  if (!force && cropped && (await exists(destination))) {
    skipped += 1;
    continue;
  }
  const { image, assetUrl } = await imageFor(source);
  await writeAtomically(destination, image);
  images[source.targetId] = {
    file,
    source: "NASA Image and Video Library",
    sourceUrl: `https://images.nasa.gov/details/${source.nasaId}`,
    assetUrl,
    title: source.title,
    credit: "NASA",
    license: "NASA media usage guidelines",
    licenseUrl: "https://www.nasa.gov/nasa-brand-center/images-and-media/",
    ...(source.crop ? { crop: source.crop } : {}),
  };
  downloaded += 1;
}

for (const source of sources) {
  const file = source.file || `${source.targetId}.jpg`;
  if (!images[source.targetId] && (await exists(join(imagesDirectory, file))))
    images[source.targetId] = {
      file,
      source: "NASA Image and Video Library",
      sourceUrl: `https://images.nasa.gov/details/${source.nasaId}`,
      title: source.title,
      credit: "NASA",
      license: "NASA media usage guidelines",
      licenseUrl: "https://www.nasa.gov/nasa-brand-center/images-and-media/",
    };
}

if (!bundle)
  await writeAtomically(
    manifestFile,
    `${JSON.stringify(
      {
        ...manifest,
        attribution: {
          ...(manifest.attribution || {}),
          supplementalSource:
            "Solar System imagery — NASA Image and Video Library",
          supplementalLicense: "NASA media usage guidelines",
          supplementalLicenseUrl:
            "https://www.nasa.gov/nasa-brand-center/images-and-media/",
        },
        images,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
console.log(
  JSON.stringify({
    downloaded,
    skipped,
    total: sources.length,
  }),
);
