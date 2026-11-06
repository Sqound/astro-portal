import { databaseDriver } from "./database.js";
import { applyMigrations } from "./migration-runner.js";

/**
 * The weather trend of each rounded place (table `place_climate_trends`,
 * migration 78). The service
 * (`place-climate-trend.server.js`) writes it after every successful reading
 * of the archive and reads it back when its memory is empty: the trend of a
 * place is worked out once a year, whichever process serves it and however
 * often a process restarts.
 *
 * Nothing here belongs to a space: the key is the place rounded to 0.05
 * degree (`climatePlaceKey`). The table is kept small: only the most recent
 * `PLACE_CLIMATE_TRENDS_MAX` places stay, and a trend older than the
 * retention is dropped (it would be worked out again anyway).
 */

export const PLACE_CLIMATE_TRENDS_MAX = 5000;
// A trend is fresh for a year; it is kept two more, to be served stale
// rather than not at all while the archive is down.
export const PLACE_CLIMATE_TRENDS_RETAINED_MS = 3 * 365 * 86400_000;

const iso = (millis) => new Date(millis).toISOString();

export async function createPlaceClimateTrendRepository({
  databasePath,
  databaseUrl,
  driver,
  dialect = driver?.dialect ?? (databaseUrl ? "postgres" : "sqlite"),
  now = Date.now,
  retainedMs = PLACE_CLIMATE_TRENDS_RETAINED_MS,
  maximum = PLACE_CLIMATE_TRENDS_MAX,
} = {}) {
  const db =
    driver ||
    databaseDriver({
      ASTRO_PORTAL_DATABASE_PATH: databasePath,
      ASTRO_PORTAL_DATABASE_URL: databaseUrl,
    });
  await applyMigrations(db, dialect);
  return {
    /** The stored trend of a place, or `null`. Instants are milliseconds. */
    async read(placeKey) {
      const row = (
        await db.query(
          "SELECT payload, computed_at, fresh_until FROM place_climate_trends WHERE place_key = ?",
          [placeKey],
        )
      ).rows[0];
      if (!row) return null;
      const computedAt = Date.parse(row.computed_at);
      const freshUntil = Date.parse(row.fresh_until);
      let payload;
      try {
        payload = JSON.parse(row.payload);
      } catch {
        return null;
      }
      if (
        !payload ||
        !Number.isFinite(computedAt) ||
        !Number.isFinite(freshUntil)
      )
        return null;
      return { payload, computedAt, freshUntil };
    },
    /** Keeps `result` (`{ payload, computedAt, freshUntil }`) for the place. */
    async write(placeKey, result) {
      await db.run(
        `INSERT INTO place_climate_trends (place_key, payload, computed_at, fresh_until)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(place_key) DO UPDATE SET
           payload = excluded.payload,
           computed_at = excluded.computed_at,
           fresh_until = excluded.fresh_until`,
        [
          placeKey,
          JSON.stringify(result.payload),
          iso(result.computedAt),
          iso(result.freshUntil),
        ],
      );
      await db.run("DELETE FROM place_climate_trends WHERE computed_at < ?", [
        iso(now() - retainedMs),
      ]);
      await db.run(
        `DELETE FROM place_climate_trends WHERE place_key IN (
           SELECT place_key FROM place_climate_trends
           ORDER BY computed_at DESC, place_key LIMIT 1000000 OFFSET ?)`,
        [maximum],
      );
    },
  };
}

let sharedStore = null;
let sharedKey = null;

/**
 * The service's own store (`ASTRO_PORTAL_DATABASE_URL` or
 * `ASTRO_PORTAL_DATABASE_PATH`, on the process-owned driver), opened once, or
 * `null` without a database. A failure to open is not kept: the next call
 * tries again.
 */
export async function placeClimateTrendStore(env = process.env) {
  const databasePath = env.ASTRO_PORTAL_DATABASE_PATH || null;
  const databaseUrl = env.ASTRO_PORTAL_DATABASE_URL || null;
  if (!databasePath && !databaseUrl) return null;
  const key = databaseUrl
    ? `postgres:${databaseUrl}`
    : `sqlite:${databasePath}`;
  if (sharedStore && sharedKey !== key) sharedStore = null;
  if (!sharedStore) {
    sharedKey = key;
    sharedStore = createPlaceClimateTrendRepository({
      databasePath,
      databaseUrl,
      driver: databaseDriver({
        ASTRO_PORTAL_DATABASE_PATH: databasePath,
        ASTRO_PORTAL_DATABASE_URL: databaseUrl,
      }),
      dialect: databaseUrl ? "postgres" : "sqlite",
    }).catch((error) => {
      sharedStore = null;
      throw error;
    });
  }
  return sharedStore;
}
