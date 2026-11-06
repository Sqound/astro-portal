#!/usr/bin/env node
// Is every image the target library names in its folder?
//
//   node scripts/check-target-library-media.mjs [--dir <target-library>] [--json] [--show <n>]
//   node scripts/check-target-library-media.mjs --url <service> [--only Abell,LDN] [--dir <target-library>]
//
// Reads `images.json`, `visual-preview-images.json`,
// `curated-photo-images.json` and `visual-images.json` of the target library's
// folder (`--dir`, else `ASTRO_PORTAL_TARGET_LIBRARY_DIR`, else
// `<runtime>/target-library`), and checks that each file they name exists in
// the folder beside them (`images/`, `visual-preview-images/`,
// `curated-photo-images/`, `visual-images/`). Missing files are counted per
// catalogue and per layer. Run it before and after any upload of the library
// to a service.
//
// Exit code: 0 nothing missing; 1 files missing; 2 a manifest unreadable.
// `--show <n>` lists the first n missing files of each layer (default 5);
// `--json` prints the report as JSON, for another tool.
//
// `--url <service>` asks a running service instead of the folders: the
// manifests of `--dir` say which files to expect, and each is requested
// (HEAD) at the service's `/target-library-*` routes, for a service whose
// folders you cannot read. A whole library is 34 000 requests: `--only
// Abell,LDN,...` keeps the named catalogues.
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  targetLibraryDir,
  targetLibraryImagesDir,
  bundledTargetLibraryImagesDir,
  targetLibraryCuratedPhotoImagesDir,
  targetLibraryVisualImagesDir,
  targetLibraryVisualPreviewImagesDir,
} from "portal-app/lib/config.server.js";
import {
  catalogueOfTargetId,
  checkTargetLibraryMedia,
  checkTargetLibraryMediaOverHttp,
  readTargetLibraryMediaLayers,
  targetLibraryMediaLine,
} from "portal-app/lib/target-library-media.js";

const options = { json: false, show: 5, dir: null, url: null, only: null };
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument === "--json") options.json = true;
  else if (argument === "--dir") options.dir = process.argv[++index];
  else if (argument.startsWith("--dir=")) options.dir = argument.slice(6);
  else if (argument === "--url") options.url = process.argv[++index];
  else if (argument.startsWith("--url=")) options.url = argument.slice(6);
  else if (argument === "--only")
    options.only = String(process.argv[++index]).split(",");
  else if (argument.startsWith("--only="))
    options.only = argument.slice(7).split(",");
  else if (argument === "--show") options.show = Number(process.argv[++index]);
  else if (argument.startsWith("--show="))
    options.show = Number(argument.slice(7));
  else {
    console.error(`Unknown argument: ${argument}`);
    process.exit(2);
  }
}
if (!Number.isInteger(options.show) || options.show < 0) {
  console.error("--show takes a whole number, 0 or more");
  process.exit(2);
}

// With `--dir`, every folder is the one beside the manifests; without it, the
// service's own configuration (including its per-folder environment
// variables) says where each layer lives.
const directory = options.dir ? resolve(options.dir) : targetLibraryDir;
const directories = options.dir
  ? {}
  : {
      images: targetLibraryImagesDir,
      "visual-preview-images": targetLibraryVisualPreviewImagesDir,
      "curated-photo-images": targetLibraryCuratedPhotoImagesDir,
      "visual-images": targetLibraryVisualImagesDir,
    };

// The library file tells each target's catalogue (« Abell », « LDN »…); an
// id it does not list falls back to its prefix.
const catalogueById = new Map();
try {
  const library = JSON.parse(
    await readFile(join(directory, "openngc.json"), "utf8"),
  );
  for (const target of library.targets || [])
    if (target.id && target.catalogue)
      catalogueById.set(target.id, target.catalogue);
} catch {}
const catalogueOf = (id) => catalogueById.get(id) || catalogueOfTargetId(id);

const { layers, unreadable, absent } = await readTargetLibraryMediaLayers({
  directory,
  directories,
});
// The pictures that ship with the code are served by the route all the same.
for (const layer of layers)
  if (layer.name === "images") layer.alsoIn = [bundledTargetLibraryImagesDir];
const report = options.url
  ? await checkTargetLibraryMediaOverHttp({
      layers,
      baseUrl: options.url,
      catalogueOf,
      only: options.only,
      sample: options.show,
    })
  : await checkTargetLibraryMedia({
      layers,
      catalogueOf,
      sample: options.show,
    });

if (options.json) {
  console.log(
    JSON.stringify({ directory, ...report, unreadable, absent }, null, 2),
  );
} else {
  const pad = (value, width) => String(value).padStart(width);
  console.log(
    options.url
      ? `target-library: ${directory} (manifests), asked of ${options.url}`
      : `target-library: ${directory}`,
  );
  for (const name of absent) console.log(`  (${name} absent: names nothing)`);
  for (const message of unreadable) console.log(`  UNREADABLE ${message}`);
  console.log("");
  console.log(
    `${"catalogue".padEnd(18)}${pad("named", 8)}${pad("missing", 9)}`,
  );
  for (const [catalogue, counts] of Object.entries(report.byCatalogue).sort(
    ([left], [right]) => left.localeCompare(right),
  ))
    console.log(
      `${catalogue.padEnd(18)}${pad(counts.checked, 8)}${pad(counts.missing, 9)}`,
    );
  console.log("");
  console.log(`${"layer".padEnd(24)}${pad("named", 8)}${pad("missing", 9)}`);
  for (const layer of report.layers) {
    console.log(
      `${layer.name.padEnd(24)}${pad(layer.checked, 8)}${pad(layer.missing, 9)}`,
    );
    for (const [catalogue, counts] of Object.entries(layer.byCatalogue))
      if (counts.missing)
        console.log(`  ${catalogue}: ${counts.missing} missing`);
    for (const example of layer.examples) console.log(`    e.g. ${example}`);
  }
  console.log("");
  console.log(targetLibraryMediaLine(report));
}

process.exit(unreadable.length ? 2 : report.missing ? 1 : 0);
