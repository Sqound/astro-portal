// ODbL section 4.6: offer the entire derived database without an account.
// Only the configured public extract is eligible, never a runtime directory.
import { DatabaseSync } from "node:sqlite";
import { open, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { extractMetadata } from "./osm-extract.js";
import { placesSourceSettings } from "./overpass.js";

export async function placesExtractOffer({ env = process.env } = {}) {
  const settings = placesSourceSettings(env);
  if (!settings.enabled || settings.source !== "osm-extract" || !settings.path)
    throw Object.assign(new Error("The places source is unavailable."), {
      code: "source",
    });
  let db, file;
  try {
    file = await open(settings.path, "r");
    const opened = await file.stat();
    const same = (info) =>
      info.dev === opened.dev &&
      info.ino === opened.ino &&
      info.size === opened.size &&
      info.mtimeMs === opened.mtimeMs;
    if (!same(await stat(settings.path)))
      throw new Error("Extract replaced during offer validation.");
    for (const suffix of ["-wal", "-shm", "-journal"])
      if (await stat(`${settings.path}${suffix}`).catch(() => null))
        throw new Error("Extract has live database sidecars.");
    db = new DatabaseSync(settings.path, { readOnly: true });
    const metadata = extractMetadata(db);
    if (
      metadata.kind !== "osm-extract" ||
      metadata.licenceUrl !== "https://opendatacommons.org/licenses/odbl/1-0/"
    )
      throw new Error("Not a public derived extract.");
    const allowed = new Set([
      "metadata",
      "places",
      "places_rtree",
      "places_rtree_node",
      "places_rtree_rowid",
      "places_rtree_parent",
    ]);
    if (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .some((row) => !allowed.has(row.name))
    )
      throw new Error("Unexpected private tables.");
    if (
      db.prepare("PRAGMA freelist_count").get().freelist_count !== 0 ||
      db.prepare("PRAGMA journal_mode").get().journal_mode !== "delete"
    )
      throw new Error(
        "Offer requires a fresh, standalone extract without free pages.",
      );
    db.close();
    db = null;
    if (!same(await stat(settings.path)))
      throw new Error("Extract replaced during offer validation.");
    const info = await file.stat();
    const stream = file.createReadStream();
    file = null;
    return new Response(Readable.toWeb(stream), {
      headers: {
        "content-type": "application/vnd.sqlite3",
        "content-disposition": 'attachment; filename="places-osm.sqlite"',
        "content-length": String(info.size),
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        link: '<https://opendatacommons.org/licenses/odbl/1-0/>; rel="license"',
      },
    });
  } catch (cause) {
    db?.close();
    await file?.close();
    throw Object.assign(new Error("The places source is unavailable."), {
      code: "source",
      cause,
    });
  }
}
