import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { shippedLocales } from "astro-contracts/locales";
import {
  parseReadAloudManifest,
  readAloudLocalePattern,
  readAloudManifestFileName,
  readAloudPackComponent,
  readAloudUnitIdPattern,
  readAloudVoiceVersionPattern,
} from "portal/offline-pack/read-aloud.js";

import { staticDataDir } from "./config.server.js";

/*
 * The offline pack's optional « Lecture à voix haute » component
 * (`read-aloud`, kind `audio-units`), as this instance can serve it:
 *
 *   <static data>/read-aloud/<voiceVersion>/<locale>/manifest.json
 *   <static data>/read-aloud/<voiceVersion>/<locale>/u/<id>.m4a
 *
 * (`portal/offline-pack/read-aloud.js` states the contract). A language is
 * listed when its `manifest.json` is there and valid, and its folder names
 * are the manifest's own `voiceVersion` and `locale`; nothing deposited, no
 * component. The units are listed as the manifest lists them, none is read
 * or counted here: a language is deposited unit files first, `manifest.json`
 * last (docs/STATIC_DATA.md), so the manifest appearing is the language
 * being complete. A language with several voice versions lists the latest
 * (the greatest name); the older ones keep answering their addresses.
 *
 * Kept while nothing moved: each manifest is read once and kept with its
 * size and modification time; a request that finds them unchanged costs a
 * `readdir` per folder and a `stat` per manifest, never a read. Nothing
 * needs a restart.
 */

export const readAloudDirectory = () => join(staticDataDir, "read-aloud");

/** @type {Map<string, { size: number, mtimeMs: number, value: object | null }>} */
const kept = new Map();

async function subdirectories(directory) {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/**
 * The language manifest of [voiceVersion]/[locale]: `{ path, directory,
 * manifest (parsed), manifestBytes, checksum }`, or `null` (absent, not a
 * manifest, or one that contradicts its folder).
 */
async function languageManifest(voiceVersion, locale) {
  if (
    !readAloudVoiceVersionPattern.test(voiceVersion) ||
    !readAloudLocalePattern.test(locale)
  )
    return null;
  const directory = join(readAloudDirectory(), voiceVersion, locale);
  const path = join(directory, readAloudManifestFileName);
  let info;
  try {
    info = await stat(path);
  } catch {
    kept.delete(path);
    return null;
  }
  if (!info.isFile() || info.size === 0) return null;
  const earlier = kept.get(path);
  if (earlier && earlier.size === info.size && earlier.mtimeMs === info.mtimeMs)
    return earlier.value;
  let value = null;
  try {
    const manifestBytes = await readFile(path);
    const manifest = parseReadAloudManifest(
      JSON.parse(manifestBytes.toString("utf8")),
    );
    if (
      manifest &&
      manifest.voiceVersion === voiceVersion &&
      manifest.locale === locale
    )
      value = {
        path,
        directory,
        manifest,
        manifestBytes,
        checksum: createHash("sha256").update(manifestBytes).digest("hex"),
      };
  } catch {
    value = null;
  }
  kept.set(path, { size: info.size, mtimeMs: info.mtimeMs, value });
  return value;
}

/**
 * What this instance offers: `{ component }` or `null` when no shipped
 * language has a valid manifest.
 */
export async function installedReadAloud({ locales = shippedLocales() } = {}) {
  const versions = (await subdirectories(readAloudDirectory()))
    .filter((name) => readAloudVoiceVersionPattern.test(name))
    .sort()
    .reverse();
  if (!versions.length) return null;
  const present = await Promise.all(
    versions.map(async (version) => ({
      version,
      folders: new Set(
        await subdirectories(join(readAloudDirectory(), version)),
      ),
    })),
  );
  const languages = [];
  for (const locale of locales) {
    for (const { version, folders } of present) {
      if (!folders.has(locale)) continue;
      const found = await languageManifest(version, locale);
      if (!found) continue;
      languages.push(found);
      break;
    }
  }
  const component = readAloudPackComponent({ languages });
  return component ? { component } : null;
}

/** The language manifest file to serve: `{ path, bytes, checksum }` or `null`. */
export async function installedReadAloudManifest({ locale, voice }) {
  if (!shippedLocales().includes(locale)) return null;
  const found = await languageManifest(voice, locale);
  return found
    ? {
        path: found.path,
        bytes: found.manifestBytes.length,
        checksum: found.checksum,
      }
    : null;
}

/**
 * One unit file: `{ path, bytes, sha256 }`, or `null` when the language is not
 * installed, the manifest does not list [unit], or the file is not there
 * with the size the manifest says. Nothing taken from the request reaches the
 * filesystem except a language of the registry, a folder name and 32
 * hexadecimal digits.
 */
export async function installedReadAloudUnit({ locale, voice, unit }) {
  if (!readAloudUnitIdPattern.test(unit)) return null;
  if (!shippedLocales().includes(locale)) return null;
  const found = await languageManifest(voice, locale);
  const listed = found?.manifest.units.get(unit);
  if (!listed) return null;
  const path = join(found.directory, "u", `${unit}.m4a`);
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size !== listed.bytes) return null;
  } catch {
    return null;
  }
  return { path, bytes: listed.bytes, sha256: listed.sha256 };
}
