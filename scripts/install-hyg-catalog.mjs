#!/usr/bin/env node
/**
 * Puts the HYG v4.1 star catalogue where the sky annotations of the portal
 * read it (`ASTRO_PORTAL_HYG_CATALOG`, by default
 * `<runtime>/astrometry/catalogs/hyg_v41.csv`): fetched from the catalogue's
 * author (David Nash, astronexus.com, CC BY-SA 4.0) at a fixed commit and
 * checked against its SHA-256 before it takes its place. The service does the
 * same by itself at its start when the file is missing (background warm-up
 * `hyg-catalogue`, `ASTRO_PORTAL_HYG_DOWNLOAD=off` to stop it); this script is
 * for the deployments that prefer to do it before the start.
 *
 *   node scripts/install-hyg-catalog.mjs [--out <file>] [--force]
 *
 * `--out` defaults to `ASTRO_PORTAL_HYG_CATALOG`, else the runtime directory's
 * path (`ASTRO_PORTAL_RUNTIME_DIR`, else `.astro-portal` here). A file already
 * there is kept unless `--force`. Exit code 1 when the catalogue could not be
 * installed.
 */
import { join, resolve } from "node:path";
import {
  HYG_CATALOG_LICENCE,
  ensureHygCatalog,
} from "portal/sky-annotations/hyg-catalog-install.js";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const out = resolve(
  argument("out") ||
    process.env.ASTRO_PORTAL_HYG_CATALOG ||
    join(
      process.env.ASTRO_PORTAL_RUNTIME_DIR || ".astro-portal",
      "astrometry",
      "catalogs",
      "hyg_v41.csv",
    ),
);
const outcome = await ensureHygCatalog({
  path: out,
  enabled: true,
  force: process.argv.includes("--force"),
});
if (outcome.status === "failed") {
  console.error(`The star catalogue was not installed: ${outcome.reason}.`);
  process.exit(1);
}
console.log(
  outcome.status === "installed"
    ? `${out}: installed, ${outcome.bytes} bytes, SHA-256 verified. ${HYG_CATALOG_LICENCE}.`
    : `${out}: already there (--force fetches it again).`,
);
