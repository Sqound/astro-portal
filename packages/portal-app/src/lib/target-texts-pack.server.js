import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { shippedLocales } from "astro-contracts/locales";
import {
  isListableTextShard,
  targetTextsPackComponent,
  targetTextsUrlTemplate,
} from "portal/offline-pack/target-texts.js";

import { targetTextsDirectory } from "./target-texts.server.js";
import {
  assertTargetTextsIndex,
  targetTextsIndexShards,
} from "./target-text-shards.js";

/*
 * The offline pack's optional « Textes complets du catalogue » component
 * (`target-texts`, kind `text-shards`), as this instance can serve it: the
 * shards of the static-data package's `target-library/ texts/` folder, the
 * very files the service imports into `target_texts` and a client reads into
 * its own database.
 *
 * What is listed is what is there: a shipped language of the locale registry
 * (never a list typed here) whose index entry names a file of the size the
 * index says. No folder, no index, an index that is not one, or no shard
 * present: the component is absent from the manifest, never an error — the
 * rule of every optional component.
 *
 * Kept while nothing moved: the index's size and modification time, and the
 * modification time of each language's folder (the loader replaces a shard
 * by renaming a file into it, which moves the folder's; a file that appears
 * or goes moves it too). A request that finds all of them as they were costs
 * a handful of `stat`s, never a read of the index nor of a shard; a shard
 * file is never read here at all (its digest is the index's, checked by the
 * client and by the service's own import). A file rewritten in place moves
 * none of those, so what is kept is looked at again after
 * `recheckAfterMilliseconds` whatever the stamp says: the manifest is
 * cached for a minute anyway.
 */

const recheckAfterMilliseconds = 30_000;

let kept = null;

async function identity(path) {
  try {
    const info = await stat(path);
    return [info.size, info.mtimeMs];
  } catch {
    return null;
  }
}

async function folderIdentities(directory, locales) {
  return Promise.all(
    locales.map(async (locale) => {
      try {
        return (await stat(join(directory, locale))).mtimeMs;
      } catch {
        return null;
      }
    }),
  );
}

async function readIndex(directory) {
  try {
    return assertTargetTextsIndex(
      JSON.parse(await readFile(join(directory, "index.json"), "utf8")),
    );
  } catch {
    return null;
  }
}

/** Runs [work] over [items], [width] at a time. */
async function inParallel(items, width, work) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(width, items.length) }, async () => {
      while (next < items.length) {
        const at = next;
        next += 1;
        results[at] = await work(items[at]);
      }
    }),
  );
  return results;
}

/**
 * What [directory] offers of the catalogue texts in [locales]:
 * `{ component, files }` or `null` (see the header). The caller gives its
 * own `urlTemplate` and the languages it asks for.
 */
export async function describeTargetTexts({
  directory = targetTextsDirectory(),
  locales = shippedLocales(),
  urlTemplate = targetTextsUrlTemplate,
} = {}) {
  const index = await readIndex(directory);
  if (!index) return null;
  const shipped = new Set(locales);
  // A shipped language and a shard the manifest can describe (three digits):
  // nothing else of the index ever becomes a path.
  const listed = targetTextsIndexShards(index).filter(
    (item) => shipped.has(item.locale) && isListableTextShard(item),
  );
  const present = await inParallel(listed, 16, async (item) => {
    const info = await stat(join(directory, item.path)).catch(() => null);
    return info?.isFile() && info.size === item.bytes;
  });
  const files = new Map();
  const filtered = { locales: {} };
  listed.forEach((item, at) => {
    if (!present[at]) return;
    files.set(`${item.locale}/${item.shard}`, {
      path: join(directory, item.path),
      bytes: item.bytes,
      sha256: item.sha256,
    });
    (filtered.locales[item.locale] ??= []).push(item);
  });
  const component = targetTextsPackComponent({
    index: filtered,
    locales,
    urlTemplate,
  });
  return component ? { component, files } : null;
}

/**
 * What this instance offers of the catalogue texts: `{ component, files }`
 * (`files` maps `<locale>/<shard>` to `{ path, bytes, sha256 }`), or `null`
 * when it offers none.
 */
export async function installedTargetTexts({
  directory = targetTextsDirectory(),
} = {}) {
  const locales = shippedLocales();
  const stamp = JSON.stringify([
    directory,
    locales,
    await identity(join(directory, "index.json")),
    await folderIdentities(directory, locales),
  ]);
  if (kept?.stamp === stamp && Date.now() - kept.at < recheckAfterMilliseconds)
    return kept.value;
  const value = await describeTargetTexts({ directory, locales });
  kept = { stamp, value, at: Date.now() };
  return value;
}

/** The shard file a request names, or `null`: a shipped language and a shard
 * of the index whose file is there. Nothing taken from the request reaches
 * the filesystem but through the index's own path. */
export async function installedTargetTextShard({ locale, shard }) {
  const installed = await installedTargetTexts();
  return installed?.files.get(`${locale}/${shard}`) ?? null;
}

/** Forgets what was kept (tests). */
export function forgetInstalledTargetTexts() {
  kept = null;
}
