import { readFile } from "node:fs/promises";
import { hygStarReader } from "./annotations.js";

/**
 * The stars the annotations place: the HYG v4.1 catalogue the server has
 * installed (`ASTRO_PORTAL_HYG_CATALOG`, `hyg-catalog-install.js`), read the
 * first time it is asked for and kept.
 *
 * Only a catalogue that was read is kept. Without the file — or with one that
 * is not HYG — the source answers `null` (« no stars on this server »), says
 * so to `log` once, and asks the disk again the next time: a catalogue
 * installed while the server runs (the download of the start, a copy by the
 * operator) is found without a restart, and an empty answer never stays in
 * memory.
 */

const LINES_PER_SLICE = 4000;

const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

export function createHygStarsSource({
  path,
  read = readFile,
  log = () => {},
} = {}) {
  let kept = null;
  let loading = null;
  let warned = false;

  // 119,000 lines: read in slices that hand the event loop back, so that the
  // requests in flight are not held for the second the whole text takes.
  async function load() {
    const lines = String(await read(path, "utf8")).split(/\r?\n/);
    const readLine = hygStarReader(lines[0]);
    if (!readLine) throw new Error("the file is not an HYG v4.1 catalogue");
    const stars = [];
    for (let index = 1; index < lines.length; index += 1) {
      const star = readLine(lines[index]);
      if (star) stars.push(star);
      if (index % LINES_PER_SLICE === 0) await nextTurn();
    }
    if (!stars.length) throw new Error("the file holds no star");
    return stars;
  }

  return async function stars() {
    if (kept) return kept;
    loading ??= load()
      .then((stars) => {
        kept = stars;
        if (warned)
          log({
            level: "info",
            event: "sky-annotations.stars-available",
            message: `The HYG catalogue is installed: ${stars.length} stars.`,
          });
        warned = false;
        return stars;
      })
      .catch((error) => {
        if (!warned)
          log({
            level: "warning",
            event: "sky-annotations.stars-unavailable",
            message: `The HYG star catalogue could not be read at ${path} (${error?.code || error?.message || error}): the annotations hold no stars until it is installed (docs/INSTALLATION.md).`,
          });
        warned = true;
        return null;
      })
      .finally(() => {
        loading = null;
      });
    return loading;
  };
}
