import { createEquipmentReader } from "portal/persistence/equipment-reader.js";
import { databaseDriver } from "portal/persistence/database.js";
import { hostedSignInMode } from "./auth.server.js";

let sharedReader = null;
let configurationKey = null;
let pendingReader = null;

/** Shared, read-only view of private equipment for public metadata enrichment. */
export async function equipmentReader() {
  const databasePath = process.env.ASTRO_PORTAL_DATABASE_PATH || null;
  const databaseUrl = process.env.ASTRO_PORTAL_DATABASE_URL || null;
  if (!databasePath && !databaseUrl) return null;
  const nextKey = databaseUrl
    ? `postgres:${databaseUrl}`
    : `sqlite:${databasePath}`;
  if ((sharedReader || pendingReader) && configurationKey !== nextKey)
    throw new Error(
      "Equipment database configuration cannot change during a process.",
    );
  if (sharedReader) return sharedReader;
  if (!pendingReader) {
    configurationKey = nextKey;
    pendingReader = createEquipmentReader({
      databasePath,
      databaseUrl,
      driver: databaseDriver({
        ASTRO_PORTAL_DATABASE_PATH: databasePath,
        ASTRO_PORTAL_DATABASE_URL: databaseUrl,
      }),
      dialect: databaseUrl ? "postgres" : "sqlite",
    })
      .then((reader) => {
        sharedReader = reader;
        return reader;
      })
      .finally(() => {
        pendingReader = null;
      });
  }
  return pendingReader;
}

/**
 * The one space whose private equipment enriches the public gallery and
 * journal: the operator's.
 *
 * - `ASTRO_PORTAL_OPERATOR_SPACE` names it (an organisation id). A value
 *   that names no space shows nothing — never a fallback to another space.
 * - Unset on a private server (`password`, `email-code` with one owner, or
 *   authentication disabled): its one space, as before.
 * - Unset where any address may open a space (a sign-in extension such as
 *   `email-code`): no space at all — the public pages show the operator's
 *   files and never a space's own content.
 */
export async function operatorSpaceId(env = process.env) {
  const repository = await equipmentReader();
  if (!repository) return null;
  const configured = String(env.ASTRO_PORTAL_OPERATOR_SPACE || "").trim();
  if (configured)
    return (await repository.spaceExists(configured)) ? configured : null;
  if (hostedSignInMode(env)) return null;
  return await repository.firstTenantId();
}
