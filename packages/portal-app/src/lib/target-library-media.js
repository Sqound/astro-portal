import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Is every image the target library names really there?
 *
 * The library knows its images through four manifests, each beside its own
 * folder; the catalogue only shows a picture when the service can answer the
 * file the manifest names. A thumbnail or a visual preview named by a
 * manifest and absent from the file system answers 404, and the card shows
 * its pictogram. This module counts what is missing, per
 * catalogue and per layer; `scripts/check-target-library-media.mjs` runs it
 * before and after any upload of the library, and the service logs its count
 * once at load.
 *
 * A folder is read once (`readdir`), never one `stat` per image: the library
 * has thousands of thumbnails, possibly on a network file system whose every
 * call costs a round trip.
 */

/**
 * The file names the library's image routes answer (`/target-library-images/`
 * and `/target-library-visual-preview-images/`): one prefix per source
 * catalogue, the target identifier's own. The routes refuse anything else, so
 * a catalogue added to the library is added here and in the identifier table
 * below.
 */
export const targetLibraryImagePrefixes = [
  "openngc",
  "barnard",
  "sharpless",
  "ldn",
  "lbn",
  "abell",
  "solar-system",
  // The bright stars' and the constellations' sky pictures
  // (`star-hip-91262.jpg`, `constellation-lyr-full.jpg`).
  "star-hip",
  "constellation",
];
const filePattern = (prefixes, before = "") =>
  new RegExp(
    `^${before}(?:${prefixes.join("|")})-[a-z0-9][a-z0-9 .-]*\\.jpg$`,
    "i",
  );
export const targetLibraryImageFilePattern = filePattern(
  targetLibraryImagePrefixes,
);
// No visual preview is made for the Solar System's bodies, nor for the sky
// pictures.
export const targetLibraryPreviewFilePattern = filePattern(
  targetLibraryImagePrefixes.filter(
    (prefix) => !["solar-system", "star-hip", "constellation"].includes(prefix),
  ),
  "visual-preview-",
);

/** The four layers, in the order a report lists them. */
export const targetLibraryMediaLayers = [
  {
    name: "images",
    manifest: "images.json",
    directory: "images",
    route: "/target-library-images",
    pattern: targetLibraryImageFilePattern,
  },
  {
    name: "visual-preview-images",
    manifest: "visual-preview-images.json",
    directory: "visual-preview-images",
    route: "/target-library-visual-preview-images",
    pattern: targetLibraryPreviewFilePattern,
  },
  {
    name: "curated-photo-images",
    manifest: "curated-photo-images.json",
    directory: "curated-photo-images",
    route: "/target-library-curated-images",
  },
  {
    name: "visual-images",
    manifest: "visual-images.json",
    directory: "visual-images",
    route: "/target-library-visual-images",
  },
];

const identifierCatalogues = [
  ["solar-system-", "Système solaire"],
  ["sharpless-", "Sharpless"],
  ["ldn-", "LDN"],
  ["lbn-", "LBN"],
  ["abell-", "Abell"],
  ["barnard-", "Barnard"],
  ["openngc-ngc", "NGC"],
  ["openngc-ic", "IC"],
  ["star-hip-", "BrightStars"],
  ["constellation-", "Constellations"],
];
export const unknownCatalogue = "(autre)";

/**
 * The catalogue a target belongs to, when only its identifier is known: the
 * script's fallback for an id the library file does not list. The library's
 * own `catalogue` field wins whenever it is given.
 */
export function catalogueOfTargetId(id) {
  const key = String(id || "");
  for (const [prefix, catalogue] of identifierCatalogues)
    if (key.startsWith(prefix)) return catalogue;
  return unknownCatalogue;
}

/**
 * Compare what each layer names with what its folder holds.
 *
 * `layers`: `[{ name, entries, directory }]`, `entries` being the layer's
 * `{ targetId: { file, kind? } }` map and `directory` the folder (a missing
 * folder holds nothing; `alsoIn`, optional, lists further folders the route
 * serves from). `catalogueOf(targetId)` names the catalogue; the
 * identifier's own prefix answers when it is not given. An entry of kind
 * `demo` is never served (`loadedVisualImages`), so it is never counted. A
 * file the layer's route refuses by its name (`pattern`) is counted missing
 * too, folder or not: the service would answer 404 for it all the same.
 *
 * Returns `{ checked, missing, byCatalogue, layers }`: `byCatalogue` is
 * `{ catalogue: { checked, missing } }`, each layer carries its own counts,
 * its per-catalogue counts and the first `sample` missing files.
 */
export async function checkTargetLibraryMedia({
  layers,
  catalogueOf = catalogueOfTargetId,
  sample = 5,
}) {
  const report = { checked: 0, missing: 0, byCatalogue: {}, layers: [] };
  for (const layer of layers) {
    // `layer.alsoIn`: folders the route falls back to (the pictures that
    // ship with the code); a file in any of them is served.
    const present = new Set();
    for (const directory of [layer.directory, ...(layer.alsoIn || [])])
      try {
        for (const name of await readdir(directory)) present.add(name);
      } catch {}
    const counts = {};
    const examples = [];
    let checked = 0;
    let missing = 0;
    for (const [targetId, entry] of Object.entries(layer.entries || {})) {
      if (!entry?.file || entry.kind === "demo") continue;
      const catalogue = catalogueOf(targetId) || catalogueOfTargetId(targetId);
      const total = (report.byCatalogue[catalogue] ||= {
        checked: 0,
        missing: 0,
      });
      const own = (counts[catalogue] ||= { checked: 0, missing: 0 });
      checked += 1;
      total.checked += 1;
      own.checked += 1;
      const refused = layer.pattern && !layer.pattern.test(entry.file);
      if (present.has(entry.file) && !refused) continue;
      missing += 1;
      total.missing += 1;
      own.missing += 1;
      if (examples.length < sample)
        examples.push(
          `${targetId}: ${entry.file}${refused ? " (name refused by the route)" : ""}`,
        );
    }
    report.checked += checked;
    report.missing += missing;
    report.layers.push({
      name: layer.name,
      directory: layer.directory,
      checked,
      missing,
      byCatalogue: counts,
      examples,
    });
  }
  return report;
}

/**
 * The same count, asked of a running service instead of a folder: each file a
 * layer names is requested at `<baseUrl><layer.route>/<file>` (HEAD) and
 * counts as missing unless the answer is a 2xx. For a service whose files
 * cannot be listed from a shell. `only` limits the check
 * to some catalogues (a whole library is 34 000 requests); `concurrency`
 * requests run at a time.
 */
export async function checkTargetLibraryMediaOverHttp({
  layers,
  baseUrl,
  catalogueOf = catalogueOfTargetId,
  only = null,
  concurrency = 6,
  sample = 5,
  fetchImpl = fetch,
}) {
  const root = String(baseUrl).replace(/\/+$/, "");
  const wanted = only?.length ? new Set(only) : null;
  const report = { checked: 0, missing: 0, byCatalogue: {}, layers: [] };
  for (const layer of layers) {
    const jobs = [];
    for (const [targetId, entry] of Object.entries(layer.entries || {})) {
      if (!entry?.file || entry.kind === "demo") continue;
      const catalogue = catalogueOf(targetId) || catalogueOfTargetId(targetId);
      if (wanted && !wanted.has(catalogue)) continue;
      jobs.push({ targetId, file: entry.file, catalogue });
    }
    const counts = {};
    const examples = [];
    let missing = 0;
    let next = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        let present = false;
        try {
          const response = await fetchImpl(
            `${root}${layer.route}/${encodeURIComponent(job.file)}`,
            { method: "HEAD", signal: AbortSignal.timeout(20_000) },
          );
          present = response.ok;
        } catch {}
        for (const total of [
          (report.byCatalogue[job.catalogue] ||= { checked: 0, missing: 0 }),
          (counts[job.catalogue] ||= { checked: 0, missing: 0 }),
        ]) {
          total.checked += 1;
          if (!present) total.missing += 1;
        }
        if (present) continue;
        missing += 1;
        if (examples.length < sample)
          examples.push(`${job.targetId}: ${job.file}`);
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    report.checked += jobs.length;
    report.missing += missing;
    report.layers.push({
      name: layer.name,
      directory: `${root}${layer.route}`,
      checked: jobs.length,
      missing,
      byCatalogue: counts,
      examples,
    });
  }
  return report;
}

/**
 * The line the service writes once its library is loaded: always
 * `target-library media: N missing`, and when N is not zero the catalogues
 * that miss files, most affected first.
 */
export function targetLibraryMediaLine(report) {
  const line = `target-library media: ${report.missing} missing`;
  if (!report.missing) return line;
  const detail = Object.entries(report.byCatalogue)
    .filter(([, counts]) => counts.missing)
    .sort(
      ([leftName, left], [rightName, right]) =>
        right.missing - left.missing || leftName.localeCompare(rightName),
    )
    .map(([catalogue, counts]) => `${catalogue} ${counts.missing}`)
    .join(", ");
  return `${line} (${detail})`;
}

/**
 * The default sink: the app's log format (`[Astro Portal] info …`) on stderr,
 * never stdout, which the scripts that load the library keep for their own
 * output (JSON, tables).
 */
export const targetLibraryMediaLog = {
  info: (line) =>
    console.error(`[Astro Portal] info target-library.media: ${line}`),
  warn: (line) =>
    console.error(`[Astro Portal] warning target-library.media: ${line}`),
};

/**
 * Check and write the line: `info` when nothing is missing, `warn`
 * otherwise, to stderr by default. A check that fails (an unreadable folder is
 * already « nothing there ») never reaches the caller: the library's load
 * does not wait for it and does not depend on it.
 */
export async function logTargetLibraryMedia({
  layers,
  catalogueOf,
  log = targetLibraryMediaLog,
}) {
  try {
    const report = await checkTargetLibraryMedia({ layers, catalogueOf });
    (report.missing ? log.warn : log.info).call(
      log,
      targetLibraryMediaLine(report),
    );
    return report;
  } catch (error) {
    log.warn?.(`target-library media: check failed (${error?.message})`);
    return null;
  }
}

/**
 * Read the four manifests of `directory` (the library's folder) into the
 * layers `checkTargetLibraryMedia` takes. `directories` replaces a layer's
 * default folder (`<directory>/<layer's folder>`) by name. An absent
 * manifest names nothing; an unreadable one is an error, reported by
 * `unreadable` and never taken for an empty layer.
 */
export async function readTargetLibraryMediaLayers({
  directory,
  directories = {},
}) {
  const layers = [];
  const unreadable = [];
  const absent = [];
  for (const layer of targetLibraryMediaLayers) {
    const manifest = join(directory, layer.manifest);
    let text;
    try {
      text = await readFile(manifest, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") absent.push(layer.manifest);
      else unreadable.push(`${layer.manifest}: ${error?.message}`);
      layers.push({ ...layer, entries: {}, directory: "" });
      continue;
    }
    let entries = {};
    try {
      const parsed = JSON.parse(text);
      entries =
        parsed?.images && typeof parsed.images === "object"
          ? parsed.images
          : {};
    } catch (error) {
      unreadable.push(`${layer.manifest}: ${error?.message}`);
    }
    layers.push({
      ...layer,
      entries,
      directory: directories[layer.name] || join(directory, layer.directory),
    });
  }
  return { layers, unreadable, absent };
}
