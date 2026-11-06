// Read-only local OSM extract. Atomic replacements reopen on inode/mtime change.
import { DatabaseSync } from "node:sqlite";
import { statSync } from "node:fs";
import { placeFromOverpassElement } from "./overpass.js";

export const extractSchemaVersion = 1;
export const earthRadiusMetres = 6371008.8;
export function sphericalDistance(a, b) {
  const rad = Math.PI / 180;
  const lat = (b.latitude - a.latitude) * rad;
  const lon = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(lat / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(lon / 2) ** 2;
  return 2 * earthRadiusMetres * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function radiusBoxes(centre, metres) {
  const angular = metres / earthRadiusMetres;
  const delta = (angular * 180) / Math.PI;
  const south = Math.max(-90, centre.latitude - delta),
    north = Math.min(90, centre.latitude + delta);
  const lonDelta =
    south <= -90 || north >= 90
      ? 180
      : (Math.asin(
          Math.min(
            1,
            Math.sin(angular) / Math.cos((centre.latitude * Math.PI) / 180),
          ),
        ) *
          180) /
        Math.PI;
  if (lonDelta >= 180) return [[-180, 180, south, north]];
  const west = centre.longitude - lonDelta,
    east = centre.longitude + lonDelta;
  if (west < -180)
    return [
      [west + 360, 180, south, north],
      [-180, east, south, north],
    ];
  if (east > 180)
    return [
      [west, 180, south, north],
      [-180, east - 360, south, north],
    ];
  return [[west, east, south, north]];
}
export function createExtractTables(db) {
  db.exec(`CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE places (rowid INTEGER PRIMARY KEY, id TEXT UNIQUE NOT NULL, type TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL, payload TEXT NOT NULL);
    CREATE VIRTUAL TABLE places_rtree USING rtree(rowid,min_lon,max_lon,min_lat,max_lat);`);
}
export function insertExtractPlace(db, record) {
  const result = db
    .prepare(
      "INSERT INTO places(id,type,latitude,longitude,payload) VALUES(?,?,?,?,?)",
    )
    .run(
      record.id,
      record.type,
      record.latitude,
      record.longitude,
      JSON.stringify(record),
    );
  db.prepare("INSERT INTO places_rtree VALUES(?,?,?,?,?)").run(
    result.lastInsertRowid,
    record.longitude,
    record.longitude,
    record.latitude,
    record.latitude,
  );
}
export function extractMetadata(db) {
  const metadata = Object.fromEntries(
    db
      .prepare("SELECT key,value FROM metadata")
      .all()
      .map((row) => [row.key, JSON.parse(row.value)]),
  );
  if (
    metadata.schemaVersion !== extractSchemaVersion ||
    metadata.licence !== "ODbL-1.0" ||
    !Number.isFinite(Date.parse(metadata.extractDate))
  )
    throw new Error("Invalid OSM extract metadata.");
  return metadata;
}
export function verifyExtract(db) {
  if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
    throw new Error("OSM extract integrity check failed.");
  if (
    db.prepare("SELECT rtreecheck('places_rtree') AS result").get().result !==
    "ok"
  )
    throw new Error("OSM spatial index integrity check failed.");
  if (
    db.prepare("SELECT count(*) AS count FROM places").get().count !==
      db.prepare("SELECT count(*) AS count FROM places_rtree").get().count ||
    db
      .prepare(
        "SELECT count(*) AS count FROM places p LEFT JOIN places_rtree r ON p.rowid=r.rowid WHERE r.rowid IS NULL OR p.longitude<r.min_lon OR p.longitude>r.max_lon OR p.latitude<r.min_lat OR p.latitude>r.max_lat",
      )
      .get().count
  )
    throw new Error("OSM spatial index mismatch.");
  return extractMetadata(db);
}

export function extractPlace(record, locale) {
  const element = {
    ...record.element,
    lat: record.latitude,
    lon: record.longitude,
    center: { lat: record.latitude, lon: record.longitude },
  };
  // The local extract deliberately includes leisure=park per its build policy.
  if (record.type === "park")
    element.tags = { ...element.tags, boundary: "national_park" };
  const place = placeFromOverpassElement(element, locale);
  return place
    ? { ...place, type: record.type, skyQuality: record.skyQuality }
    : null;
}
export function createOsmExtractSource({ path, now = Date.now } = {}) {
  let db, signature;
  function open() {
    try {
      if (!path) throw new Error("ASTRO_PORTAL_PLACES_DB is required.");
      const info = statSync(path),
        next = `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}`;
      if (signature !== next) {
        db?.close();
        db = null;
        signature = null;
        const candidate = new DatabaseSync(path, { readOnly: true });
        try {
          extractMetadata(candidate);
          candidate
            .prepare(
              "SELECT p.payload FROM places_rtree r JOIN places p ON p.rowid=r.rowid LIMIT 1",
            )
            .get();
        } catch (error) {
          candidate.close();
          throw error;
        }
        db = candidate;
        signature = next;
      }
      return db;
    } catch (cause) {
      throw Object.assign(new Error("The places source is unavailable."), {
        code: "source",
        cause,
      });
    }
  }
  return {
    suggest({ latitude, longitude, radiusKm, types, locale }) {
      const database = open(),
        centre = { latitude, longitude },
        seen = new Set(),
        places = [];
      const query = database.prepare(
        "SELECT p.payload FROM places_rtree r JOIN places p ON p.rowid=r.rowid WHERE r.max_lon>=? AND r.min_lon<=? AND r.max_lat>=? AND r.min_lat<=?",
      );
      for (const box of radiusBoxes(centre, radiusKm * 1000))
        for (const row of query.all(...box)) {
          const record = JSON.parse(row.payload);
          if (
            seen.has(record.id) ||
            !types.includes(record.type) ||
            sphericalDistance(centre, record) > radiusKm * 1000
          )
            continue;
          seen.add(record.id);
          const place = extractPlace(record, locale);
          if (place) places.push(place);
        }
      return { places, fetchedAt: new Date(now()).toISOString() };
    },
    known({ id, locale }) {
      const row = open()
        .prepare("SELECT payload FROM places WHERE id=?")
        .get(`osm:${id.replace(/^osm:/, "")}`);
      return {
        place: row ? extractPlace(JSON.parse(row.payload), locale) : null,
        fetchedAt: new Date(now()).toISOString(),
      };
    },
    close() {
      db?.close();
      db = null;
      signature = null;
    },
  };
}
