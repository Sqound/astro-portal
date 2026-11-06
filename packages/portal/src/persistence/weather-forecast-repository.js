import { databaseDriver } from "./database.js";
import { applyMigrations } from "./migration-runner.js";
import { plannerReferenceCacheWindows } from "../planner/reference-cache.js";

/**
 * The last forecast of each rounded place (table `weather_forecasts`,
 * migration 63). The planner's weather
 * (`astronomy-weather.server.js`) writes it after every successful provider
 * call and reads it back when its memory is empty -- a process just started
 * -- so that it serves it stale rather than answering 503.
 *
 * Nothing here belongs to a space: the key is the place rounded to a
 * thousandth of a degree, the same key the in-memory cache uses. The table is
 * kept small: a forecast older than the retention is dropped, and only the
 * most recent `WEATHER_FORECASTS_MAX` places stay.
 */

export const WEATHER_FORECASTS_MAX = 1000;

const iso = (millis) => new Date(millis).toISOString();

export async function createWeatherForecastRepository({
  databasePath,
  databaseUrl,
  driver,
  dialect = driver?.dialect ?? (databaseUrl ? "postgres" : "sqlite"),
  now = Date.now,
  retainedMs = plannerReferenceCacheWindows.weather.retainedMs,
  maximum = WEATHER_FORECASTS_MAX,
} = {}) {
  const db =
    driver ||
    databaseDriver({
      ASTRO_PORTAL_DATABASE_PATH: databasePath,
      ASTRO_PORTAL_DATABASE_URL: databaseUrl,
    });
  await applyMigrations(db, dialect);
  return {
    /** The stored forecast of a place, or `null`. Instants are milliseconds. */
    async read(placeKey) {
      const row = (
        await db.query(
          "SELECT payload, fetched_at, fresh_until, last_modified FROM weather_forecasts WHERE place_key = ?",
          [placeKey],
        )
      ).rows[0];
      if (!row) return null;
      const fetchedAt = Date.parse(row.fetched_at);
      const freshUntil = Date.parse(row.fresh_until);
      let payload;
      try {
        payload = JSON.parse(row.payload);
      } catch {
        return null;
      }
      if (
        !payload ||
        !Number.isFinite(fetchedAt) ||
        !Number.isFinite(freshUntil)
      )
        return null;
      return {
        payload,
        fetchedAt,
        freshUntil,
        lastModified: row.last_modified ?? null,
      };
    },
    /** Keeps `result` (`{ payload, fetchedAt, freshUntil, lastModified }`) for the place. */
    async write(placeKey, result) {
      await db.run(
        `INSERT INTO weather_forecasts (place_key, payload, fetched_at, fresh_until, last_modified)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(place_key) DO UPDATE SET
           payload = excluded.payload,
           fetched_at = excluded.fetched_at,
           fresh_until = excluded.fresh_until,
           last_modified = excluded.last_modified`,
        [
          placeKey,
          JSON.stringify(result.payload),
          iso(result.fetchedAt),
          iso(result.freshUntil),
          result.lastModified ?? null,
        ],
      );
      await db.run("DELETE FROM weather_forecasts WHERE fetched_at < ?", [
        iso(now() - retainedMs),
      ]);
      await db.run(
        `DELETE FROM weather_forecasts WHERE place_key IN (
           SELECT place_key FROM weather_forecasts
           ORDER BY fetched_at DESC, place_key LIMIT 1000000 OFFSET ?)`,
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
export async function weatherForecastStore(env = process.env) {
  const databasePath = env.ASTRO_PORTAL_DATABASE_PATH || null;
  const databaseUrl = env.ASTRO_PORTAL_DATABASE_URL || null;
  if (!databasePath && !databaseUrl) return null;
  const key = databaseUrl
    ? `postgres:${databaseUrl}`
    : `sqlite:${databasePath}`;
  if (sharedStore && sharedKey !== key) sharedStore = null;
  if (!sharedStore) {
    sharedKey = key;
    sharedStore = createWeatherForecastRepository({
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
