#!/usr/bin/env node
// Fills the space of the owner of a portal with the public sample: the records
// of sample/ and the pack of images. The portal must be set up (it has an owner)
// and hold no data yet; the installer never creates an account. All or nothing.
// See docs/SAMPLE_DATA.md.
import { resolve } from "node:path";
import { UsageError, parseArguments } from "./lib/cli.mjs";
import { DEFAULT_MANIFEST_URL } from "./lib/constants.mjs";
import { runInstall } from "./lib/install-run.mjs";

const usage = `Usage: node scripts/sample-data/install.mjs --database <sqlite file | postgres url of a portal that has an owner>
         --images-dir <folder of the portal images>
         [--pack <local archive> | --manifest-url <url> [--yes]] [--records-only]
         [--captures-dir <dir>] [--records-dir <dir>]

  The records go into the space of the owner of the portal (found by itself, no
  option): a portal that is not set up yet, or that holds data, is refused and
  nothing is written; set the portal up first.
  Without --pack, the manifest of the image pack is read from
  ${DEFAULT_MANIFEST_URL}
  (override with --manifest-url); its version, size and SHA-256 are shown and
  you are asked to confirm (--yes skips the question). The archive is checked
  against its SHA-256 before anything is extracted.
  --records-only      write the records without the images (tests, development)
  --captures-dir      where the portal keeps the bytes of its captures (default: as the portal)
  --records-dir       default: sample/ of the repository`;

const spec = {
  "--database": { key: "database", type: "string" },
  "--images-dir": { key: "imagesDir", type: "string" },
  "--captures-dir": { key: "capturesDir", type: "string" },
  "--records-dir": { key: "recordsDir", type: "string" },
  "--pack": { key: "pack", type: "string" },
  "--manifest-url": { key: "manifestUrl", type: "string" },
  "--yes": { key: "yes", type: "boolean" },
  "--records-only": { key: "recordsOnly", type: "boolean" },
  "--help": { key: "help", type: "boolean" },
};

async function main() {
  const args = parseArguments(process.argv.slice(2), spec);
  if (args.help) {
    console.log(usage);
    return;
  }
  const isUrl = /^postgres(?:ql)?:\/\//i.test(args.database || "");
  const result = await runInstall({
    database: args.database
      ? isUrl
        ? args.database
        : resolve(args.database)
      : null,
    imagesDir: args.imagesDir ?? null,
    capturesDir: args.capturesDir ?? null,
    ...(args.recordsDir ? { recordsDir: args.recordsDir } : {}),
    pack: args.pack ?? null,
    ...(args.manifestUrl ? { manifestUrl: args.manifestUrl } : {}),
    yes: Boolean(args.yes),
    recordsOnly: Boolean(args.recordsOnly),
  });
  const lines = [
    result.recordsOnly
      ? "Records installed WITHOUT images (--records-only): the captures point at images that were not installed."
      : `Records and ${result.images} image(s) installed.`,
    ...Object.entries(result.counts)
      .filter(([, count]) => count > 0)
      .map(([table, count]) => `  ${table}: ${count}`),
  ];
  if (result.targetMediaSkipped)
    lines.push(
      `${result.targetMediaSkipped} target media record(s) skipped: their target is not in this portal's catalogue.`,
    );
  console.log(lines.join("\n"));
}

main().catch((error) => {
  console.error(error.message || error);
  if (error instanceof UsageError) console.error(`\n${usage}`);
  process.exitCode = error instanceof UsageError ? 2 : 1;
});
