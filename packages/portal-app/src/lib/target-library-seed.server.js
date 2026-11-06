import { mkdir, open, readFile, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import { staticDataDir } from "./config.server.js";

const seedPath = (directory = staticDataDir) =>
  join(directory, "target-library", "catalogue.json");

/** Where the catalogue seed lives (`static-data/target-library/`). */
export const targetCatalogueSeedPath = () => seedPath();

/**
 * The identity of the seed file — `{ path, size, mtimeMs, ino }` — or null
 * when there is none. The file is only ever replaced by an atomic rename
 * (`writeTargetCatalogueSeed`), so an unchanged identity means unchanged
 * content: the catalogue import (`target-library.server.js`) reads the seed
 * again only when its identity moves, and nothing else ever reads it.
 */
export async function targetCatalogueSeedIdentity(directory = staticDataDir) {
  const path = seedPath(directory);
  try {
    const metadata = await stat(path);
    if (!metadata.isFile()) return null;
    return {
      path,
      size: metadata.size,
      mtimeMs: metadata.mtimeMs,
      ino: metadata.ino,
    };
  } catch {
    return null;
  }
}

/** A seed that is not a catalogue seed (schema, shape, an entry without its
 * identifier or designation). */
export class InvalidTargetCatalogueSeedError extends Error {
  constructor(reason) {
    super(`Invalid target catalogue seed: ${reason}.`);
    this.name = "InvalidTargetCatalogueSeedError";
  }
}

const quote = 0x22;
const backslash = 0x5c;
const openBrace = 0x7b;
const closeBrace = 0x7d;
const openBracket = 0x5b;
const closeBracket = 0x5d;
const comma = 0x2c;
const colon = 0x3a;
const isSpace = (byte) =>
  byte === 0x20 || byte === 0x0a || byte === 0x0d || byte === 0x09;

/**
 * The entries of a catalogue seed, one at a time, read from the file in
 * chunks of `chunkBytes`: neither the file nor its parsed document is ever
 * held whole. The seed is `{ "schemaVersion": 1, …, "entries": [ {…}, … ] }`
 * (its keys in any order); each entry is parsed alone when its closing brace
 * is read, handed over, then let go. `onHeader(key, value)` receives every
 * other top-level member (`schemaVersion`, `exportedAt`, `source`, …) when it
 * is read.
 *
 * The bytes are scanned for the JSON structure only (strings and their
 * escapes, nesting): structural characters are ASCII and never occur inside a
 * multi-byte UTF-8 sequence, so a chunk boundary anywhere is harmless. What
 * is being read when a chunk ends (an entry, a member, a key) is carried to
 * the next one; nothing else is.
 *
 * Throws `InvalidTargetCatalogueSeedError` when the file is not a seed — not
 * an object, no `entries` array, an entry that is not an object with `id` and
 * `designation`, a `schemaVersion` other than 1, a truncated file — possibly
 * after entries were handed over, which the caller must then disregard.
 */
export async function* readTargetCatalogueSeedEntries(
  directory = staticDataDir,
  {
    onHeader = () => {},
    chunkBytes = 1 << 20,
    path = seedPath(directory),
  } = {},
) {
  const handle = await open(path, "r");
  try {
    const chunk = Buffer.allocUnsafe(chunkBytes);
    let buffer = Buffer.alloc(0);
    // Positions in `buffer` of the value being captured and of the key
    // being read, or -1.
    let captureFrom = -1;
    let keyFrom = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let started = false;
    let expectingKey = true;
    let key = null;
    let inEntries = false;
    let sawEntries = false;
    let schemaVersion;
    let entries = 0;
    for (;;) {
      const { bytesRead } = await handle.read(chunk, 0, chunkBytes, null);
      if (!bytesRead) break;
      const scanFrom = buffer.length;
      buffer = buffer.length
        ? Buffer.concat([buffer, chunk.subarray(0, bytesRead)])
        : Buffer.from(chunk.subarray(0, bytesRead));
      for (let at = scanFrom; at < buffer.length; at += 1) {
        if (inString && !escaped) {
          // Most of the bytes are inside strings: skip to the next quote or
          // backslash at once.
          const nextQuote = buffer.indexOf(quote, at);
          const backslashAt = buffer
            .subarray(at, nextQuote < 0 ? buffer.length : nextQuote)
            .indexOf(backslash);
          const next = backslashAt >= 0 ? at + backslashAt : nextQuote;
          if (next < 0) {
            at = buffer.length - 1;
            continue;
          }
          at = next;
        }
        const byte = buffer[at];
        if (inString) {
          if (escaped) escaped = false;
          else if (byte === backslash) escaped = true;
          else if (byte === quote) {
            inString = false;
            if (keyFrom >= 0) {
              key = JSON.parse(buffer.toString("utf8", keyFrom, at + 1));
              keyFrom = -1;
            }
          }
          continue;
        }
        if (isSpace(byte)) continue;
        if (!started) {
          if (byte !== openBrace)
            throw new InvalidTargetCatalogueSeedError("not an object");
          started = true;
          depth = 1;
          continue;
        }
        if (depth === 0)
          throw new InvalidTargetCatalogueSeedError("bytes after the object");
        if (depth === 1) {
          if (expectingKey) {
            if (byte === quote) {
              inString = true;
              keyFrom = at;
            } else if (byte === colon && key !== null) expectingKey = false;
            else if (byte === closeBrace && key === null) depth = 0;
            else
              throw new InvalidTargetCatalogueSeedError(
                "malformed top-level object",
              );
            continue;
          }
          if (byte === comma || byte === closeBrace) {
            if (captureFrom >= 0) {
              const value = JSON.parse(
                buffer.toString("utf8", captureFrom, at),
              );
              if (key === "schemaVersion") {
                schemaVersion = value;
                if (schemaVersion !== 1)
                  throw new InvalidTargetCatalogueSeedError(
                    `schema version ${schemaVersion}`,
                  );
              }
              onHeader(key, value);
              captureFrom = -1;
            }
            expectingKey = true;
            key = null;
            if (byte === closeBrace) depth = 0;
            continue;
          }
          if (key === "entries" && !sawEntries) {
            if (byte !== openBracket)
              throw new InvalidTargetCatalogueSeedError("entries is no array");
            inEntries = true;
            sawEntries = true;
            depth = 2;
            continue;
          }
          if (captureFrom < 0) captureFrom = at;
          if (byte === quote) inString = true;
          else if (byte === openBrace || byte === openBracket) depth += 1;
          continue;
        }
        if (inEntries && depth === 2) {
          if (byte === closeBracket) {
            inEntries = false;
            depth = 1;
            continue;
          }
          if (byte === comma) continue;
          if (byte !== openBrace)
            throw new InvalidTargetCatalogueSeedError(
              `entry ${entries} is no object`,
            );
          captureFrom = at;
          depth = 3;
          continue;
        }
        if (byte === quote) inString = true;
        else if (byte === openBrace || byte === openBracket) depth += 1;
        else if (byte === closeBrace || byte === closeBracket) {
          depth -= 1;
          if (inEntries && depth === 2) {
            const entry = JSON.parse(
              buffer.toString("utf8", captureFrom, at + 1),
            );
            captureFrom = -1;
            if (!entry?.id || !entry?.designation)
              throw new InvalidTargetCatalogueSeedError(
                `entry ${entries} has no id or designation`,
              );
            entries += 1;
            yield entry;
          }
        }
      }
      // Keep what is still being read for the next chunk; drop the rest.
      const starts = [captureFrom, keyFrom].filter((value) => value >= 0);
      const keep = starts.length ? Math.min(...starts) : buffer.length;
      buffer = buffer.subarray(keep);
      if (captureFrom >= 0) captureFrom -= keep;
      if (keyFrom >= 0) keyFrom -= keep;
    }
    if (!started || depth !== 0 || inString)
      throw new InvalidTargetCatalogueSeedError("truncated");
    if (!sawEntries) throw new InvalidTargetCatalogueSeedError("no entries");
    if (schemaVersion !== 1)
      throw new InvalidTargetCatalogueSeedError(
        `schema version ${schemaVersion}`,
      );
  } finally {
    await handle.close();
  }
}

/**
 * The whole seed, parsed, for the tools and tests that need the document.
 * The service never calls it (it streams the entries, see above). Null when
 * there is no valid seed; never kept.
 */
export async function readTargetCatalogueSeed(directory = staticDataDir) {
  const path = seedPath(directory);
  try {
    const metadata = await stat(path);
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (
      parsed?.schemaVersion !== 1 ||
      !Array.isArray(parsed.entries) ||
      !parsed.entries.every((entry) => entry?.id && entry?.designation)
    )
      throw new Error("Invalid target catalogue seed.");
    return { ...parsed, modifiedMs: metadata.mtimeMs };
  } catch {
    return null;
  }
}

/** One entry as `JSON.stringify(seed, null, 2)` writes it inside `entries`. */
const entryText = (entry) =>
  JSON.stringify(entry, null, 2)
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");

/**
 * Writes the seed atomically (a temporary file renamed at the end).
 * `entries` is an array or an async iterable, written as it comes, so an
 * export never holds the catalogue whole. The bytes are exactly those of
 * `JSON.stringify({ schemaVersion: 1, exportedAt, source, entries }, null, 2)`
 * followed by a newline.
 */
export async function writeTargetCatalogueSeed({
  entries,
  source,
  exportedAt,
  selectionVersion,
  directory = staticDataDir,
}) {
  if (
    !Array.isArray(entries) &&
    typeof entries?.[Symbol.asyncIterator] !== "function"
  )
    throw new Error("Target catalogue seed is invalid.");
  const header = {
    schemaVersion: 1,
    exportedAt: exportedAt || new Date().toISOString(),
    source: source || "PlanAstro local target catalogue",
    // The version of the default selections the entries' flags and modes
    // were made under (`target-selection.json`): a seed of an earlier one
    // (or of none) has its flags curated again on a new database.
    ...(selectionVersion ? { selectionVersion } : {}),
  };
  const path = seedPath(directory);
  await mkdir(join(path, ".."), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  const handle = await open(temporary, "w", 0o600);
  let count = 0;
  try {
    // The header without its closing brace, then the entries.
    let pending = `${JSON.stringify(header, null, 2).slice(0, -2)},\n  "entries": [`;
    for await (const entry of entries) {
      pending += `${count ? "," : ""}\n${entryText(entry)}`;
      count += 1;
      if (pending.length > 1 << 20) {
        await handle.write(pending);
        pending = "";
      }
    }
    pending += count ? "\n  ]\n}\n" : "]\n}\n";
    await handle.write(pending);
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
  return { path, entries: count, exportedAt: header.exportedAt };
}
