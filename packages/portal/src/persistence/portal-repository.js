import { createDatabaseDriver } from "./database.js";
import { applyMigrations } from "./migration-runner.js";
import { generateRandomToken } from "./random-token.js";

const now = () => new Date().toISOString();

/** A package-level error that route adapters map to the v1 error envelope. */
export class PortalRepositoryError extends Error {
  constructor(code, message, { status = 400, ...details } = {}) {
    super(message);
    this.name = "PortalRepositoryError";
    this.code = code;
    this.status = status;
    Object.assign(this, details);
  }
}

/** Who may see the private gallery of a space: the core's two modes. */
export const PORTAL_MODES = Object.freeze(["none", "link"]);
/** The longest public name and gallery name, in characters. */
export const PUBLIC_NAME_MAX = 60;
export const PORTAL_NAME_MAX = 80;

const invalid = (message) =>
  new PortalRepositoryError("invalid_request", message);

// Characters, not UTF-16 units: « é » or « 星 » count one, as the
// database's `length()` does.
const characters = (text) => [...text].length;

function nameValue(value, max, label) {
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw invalid(`${label} must be a string.`);
  if (characters(value) > max)
    throw invalid(`${label} holds ${max} characters at most.`);
  // What the owner typed is kept as typed: never trimmed, never normalised.
  return value;
}

function toPortal(row) {
  return {
    token: row.portal_token ?? null,
    mode: row.portal_mode,
    publicName: row.public_name ?? null,
    portalName: row.portal_name ?? null,
    publicNameRefusedAt: row.public_name_refused_at ?? null,
    portalNameRefusedAt: row.portal_name_refused_at ?? null,
  };
}

const PORTAL_COLUMNS =
  "id, portal_token, portal_mode, public_name, portal_name, public_name_refused_at, portal_name_refused_at";

/**
 * The private gallery of a space (« Galerie privée » on screen; `portal`
 * in the names of the code and of the routes) — its random address, who
 * may see it, the two names, the equipment option of the space. Dual
 * SQLite/PostgreSQL, every read and write bounded by the space
 * (`tenant_id`), except the read by token, which is how a visitor reaches a
 * space. It applies no rule of who may do what: the routes do.
 */
export async function createPortalRepository({
  databasePath,
  databaseUrl,
  driver,
  dialect = driver?.dialect ?? (databaseUrl ? "postgres" : "sqlite"),
} = {}) {
  const ownsDriver = !driver;
  const db = driver || createDatabaseDriver({ databasePath, databaseUrl });
  await applyMigrations(db, dialect);

  const portalRow = async (executor, tenantId) =>
    (
      await executor.query(
        `SELECT ${PORTAL_COLUMNS} FROM organizations WHERE id = ?`,
        [tenantId],
      )
    ).rows[0] || null;

  return {
    async close() {
      if (ownsDriver) await db.close();
    },

    /**
     * The private gallery of a space, `null` for a space that does not
     * exist. Its address is minted at the first read (18 random bytes,
     * base64url) and kept until a new one is asked for; two first reads at
     * once keep the same one.
     */
    async getPortal(tenantId) {
      const row = await portalRow(db, tenantId);
      if (!row) return null;
      if (row.portal_token) return toPortal(row);
      await db.run(
        "UPDATE organizations SET portal_token = ? WHERE id = ? AND portal_token IS NULL",
        [generateRandomToken(), tenantId],
      );
      return toPortal(await portalRow(db, tenantId));
    },

    /** « Générer une nouvelle adresse »: the former one stops at once. */
    async regenerateToken(tenantId) {
      const token = generateRandomToken();
      const result = await db.run(
        "UPDATE organizations SET portal_token = ? WHERE id = ?",
        [token, tenantId],
      );
      return result.rowCount === 1 ? token : null;
    },

    /**
     * `none` or `link`; nothing else is stored, but the mode a composition
     * adds (`extraModes`, its names).
     */
    async setMode(tenantId, mode, { extraModes = [] } = {}) {
      if (![...PORTAL_MODES, ...extraModes].includes(mode))
        throw invalid(`Unknown gallery mode: ${String(mode)}.`);
      const result = await db.run(
        "UPDATE organizations SET portal_mode = ? WHERE id = ?",
        [mode, tenantId],
      );
      return result.rowCount === 1;
    },

    /**
     * The public name (60 characters at most) and the gallery's name (80),
     * both optional: a field left `undefined` is unchanged, `null` or ""
     * empties it. Saving a name clears the time the team refused that one.
     */
    async setNames(tenantId, { publicName, portalName } = {}) {
      const columns = {};
      if (publicName !== undefined) {
        columns.public_name = nameValue(
          publicName,
          PUBLIC_NAME_MAX,
          "The public name",
        );
        columns.public_name_refused_at = null;
      }
      if (portalName !== undefined) {
        columns.portal_name = nameValue(
          portalName,
          PORTAL_NAME_MAX,
          "The gallery's name",
        );
        columns.portal_name_refused_at = null;
      }
      const names = Object.keys(columns);
      if (!names.length) return Boolean(await portalRow(db, tenantId));
      const result = await db.run(
        `UPDATE organizations SET ${names.map((name) => `${name} = ?`).join(", ")} WHERE id = ?`,
        [...names.map((name) => columns[name]), tenantId],
      );
      return result.rowCount === 1;
    },

    /**
     * The space a private gallery's address leads to, `null` when no space
     * holds it. Its mode is returned as stored: whether this visitor may
     * see the gallery is the route's decision.
     */
    async spaceByPortalToken(token) {
      if (typeof token !== "string" || !token) return null;
      const row = (
        await db.query(
          `SELECT ${PORTAL_COLUMNS} FROM organizations WHERE portal_token = ?`,
          [token],
        )
      ).rows[0];
      return row ? { tenantId: row.id, ...toPortal(row) } : null;
    },

    /** « Masquer le matériel par défaut » of the space. */
    async hideDefaultEquipment(tenantId) {
      const row = (
        await db.query(
          "SELECT hide_default_equipment FROM organizations WHERE id = ?",
          [tenantId],
        )
      ).rows[0];
      return Boolean(Number(row?.hide_default_equipment || 0));
    },

    async setHideDefaultEquipment(tenantId, hidden) {
      const result = await db.run(
        "UPDATE organizations SET hide_default_equipment = ? WHERE id = ?",
        [hidden ? 1 : 0, tenantId],
      );
      return result.rowCount === 1;
    },
  };
}
