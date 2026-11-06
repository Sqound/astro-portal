import { createHash, randomUUID } from "node:crypto";
import {
  buildContributionRecord,
  contributionRecordKey,
} from "../calibration/contribution-record.js";
import { placeCoordinates } from "../planner/state.js";
import { normalizeSkyEntered } from "../sky-brightness-source.js";
import { createDatabaseDriver } from "./database.js";
import { applyMigrations } from "./migration-runner.js";

/**
 * The project's own sky-brightness calibration set
 * (docs/CONTRIBUTION_RULES.md;
 * `packages/astro-contracts/schemas/api/calibration-consent.schema.json`;
 * migration 48).
 *
 * - The consent of a space is `organizations.calibration_consent_at`
 *   (NULL: off, the default).
 * - `calibration_contributions` holds the anonymised records, under a random
 *   row key, with no column that refers to a space.
 * - `calibration_ledger` links a space to its row keys, by the digest of
 *   each value's source (`measured:<place>:<night>`, `entered:<place>`):
 *   the only link, for replacing a changed value's row and for deleting the
 *   space's rows.
 *
 * The values of a space are its nights measured by Astro Sync
 * (`place_sky_measures`) and the values typed in its places' forms
 * (`skyEntered`): on the places the planner keeps (`known_locations`), and
 * — for a place the service knows only through its plans, which is how the
 * phone sends it — on the plans' place, the latest entry winning. Each is
 * turned into a record with the place's raster level and region, then the
 * place is forgotten.
 *
 * `refresh` brings the space's rows to what it holds now, when it consented:
 * a new value gets a row, a changed one a new row in place of the old, a
 * removed one (or one whose place is gone) loses its row. Without the
 * installed sky-quality raster nothing is touched: no record can be built,
 * and nothing is deleted for lack of it.
 */

const SOURCE_DIGEST = (source) =>
  `sha256:${createHash("sha256").update(source).digest("hex")}`;

const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const rowRecord = (row) => ({
  kind: row.kind,
  sqm: Number(row.sqm),
  band: row.band,
  radianceLevel: Number(row.radiance_level),
  region: row.region,
  year: Number(row.year),
  methodVersion: row.method_version ?? null,
});

/** An error the route answers as it is. */
export class CalibrationContributionError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = "CalibrationContributionError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Methods:
 * - status(tenantId) → { enabled, consentedAt, kept, lastKeptAt }
 * - setConsent({ tenantId, enabled }) → status
 * - withdraw(tenantId) → { withdrawn, consent }
 * - refresh(tenantId) → { kept, replaced, removed } | null (not consented,
 *   or no raster)
 */
export async function createCalibrationContributionRepository({
  databasePath,
  databaseUrl,
  driver,
  dialect = driver?.dialect ?? (databaseUrl ? "postgres" : "sqlite"),
  skyQualityGrid = async () => null,
  clock = () => new Date(),
  rowKey = () => randomUUID(),
} = {}) {
  const ownsDriver = !driver;
  const db = driver || createDatabaseDriver({ databasePath, databaseUrl });
  await applyMigrations(db, dialect);

  async function consentOf(executor, tenantId) {
    const row = (
      await executor.query(
        "SELECT calibration_consent_at FROM organizations WHERE id = ?",
        [tenantId],
      )
    ).rows[0];
    if (!row)
      throw new CalibrationContributionError(
        "invalid_request",
        "The space was not found.",
        404,
      );
    return row.calibration_consent_at || null;
  }

  async function statusOf(executor, tenantId) {
    const consentedAt = await consentOf(executor, tenantId);
    const kept = (
      await executor.query(
        "SELECT COUNT(*) AS kept, MAX(updated_at) AS last FROM calibration_ledger WHERE tenant_id = ?",
        [tenantId],
      )
    ).rows[0];
    return {
      enabled: Boolean(consentedAt),
      consentedAt,
      kept: Number(kept?.kept || 0),
      lastKeptAt: kept?.last || null,
    };
  }

  /** The values the space holds now, by source digest. */
  async function sourcesOf(executor, tenantId) {
    const places = new Map(
      (
        await executor.query(
          "SELECT client_id, details_json FROM known_locations WHERE tenant_id = ? AND deleted_at IS NULL",
          [tenantId],
        )
      ).rows.map((row) => [
        String(row.client_id),
        parseJson(row.details_json) || {},
      ]),
    );
    const sources = new Map();
    const add = (source, value, place) =>
      sources.set(SOURCE_DIGEST(source), { value, place });

    for (const row of (
      await executor.query(
        "SELECT place_id, night, sqm, method_version FROM place_sky_measures WHERE tenant_id = ?",
        [tenantId],
      )
    ).rows) {
      const place = placeCoordinates(places.get(String(row.place_id)));
      if (!place) continue;
      add(
        `measured:${row.place_id}:${row.night}`,
        {
          kind: "measured",
          sqm: Number(row.sqm),
          night: row.night,
          methodVersion: row.method_version,
        },
        place,
      );
    }

    // A place's entered value: the planner's own place first; a place known
    // only through the plans takes the latest entry among them.
    const entered = new Map();
    for (const [id, details] of places) {
      const value = normalizeSkyEntered(details?.skyEntered);
      const place = placeCoordinates(details);
      if (value && place) entered.set(id, { value, place });
    }
    for (const row of (
      await executor.query(
        "SELECT location_json FROM plans WHERE tenant_id = ?",
        [tenantId],
      )
    ).rows) {
      const location = parseJson(row.location_json);
      const id = location?.id ? String(location.id) : null;
      if (!id || places.has(id)) continue;
      const value = normalizeSkyEntered(location?.skyEntered);
      const place = placeCoordinates(location);
      if (!value || !place) continue;
      const known = entered.get(id);
      if (!known || known.value.enteredAt < value.enteredAt)
        entered.set(id, { value, place });
    }
    for (const [id, { value, place }] of entered)
      add(
        `entered:${id}`,
        { kind: "entered", sqm: value.sqm, enteredAt: value.enteredAt },
        place,
      );
    return sources;
  }

  async function deleteRows(executor, rowKeys) {
    for (const key of rowKeys) {
      await executor.run(
        "DELETE FROM calibration_contributions WHERE row_key = ?",
        [key],
      );
      await executor.run("DELETE FROM calibration_ledger WHERE row_key = ?", [
        key,
      ]);
    }
  }

  async function insertRecord(executor, key, record) {
    await executor.run(
      `INSERT INTO calibration_contributions
         (row_key, kind, sqm, band, radiance_level, region, year, method_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        key,
        record.kind,
        record.sqm,
        record.band,
        record.radianceLevel,
        record.region,
        record.year,
        record.methodVersion,
      ],
    );
  }

  async function refreshIn(executor, tenantId, grid) {
    const timestamp = clock().toISOString();
    const sources = await sourcesOf(executor, tenantId);
    const ledger = new Map(
      (
        await executor.query(
          `SELECT l.source_hash, l.row_key, c.kind, c.sqm, c.band, c.radiance_level,
                  c.region, c.year, c.method_version
             FROM calibration_ledger l
             LEFT JOIN calibration_contributions c ON c.row_key = l.row_key
            WHERE l.tenant_id = ?`,
          [tenantId],
        )
      ).rows.map((row) => [row.source_hash, row]),
    );
    const outcome = { kept: 0, replaced: 0, removed: 0 };
    for (const [digest, { value, place }] of sources) {
      const record = buildContributionRecord(value, place, { grid });
      const existing = ledger.get(digest);
      if (!record) continue;
      if (existing) {
        ledger.delete(digest);
        if (
          existing.kind !== null &&
          existing.kind !== undefined &&
          contributionRecordKey(rowRecord(existing)) ===
            contributionRecordKey(record)
        )
          continue;
        await deleteRows(executor, [existing.row_key]);
        outcome.replaced += 1;
      } else outcome.kept += 1;
      const key = rowKey();
      await insertRecord(executor, key, record);
      await executor.run(
        `INSERT INTO calibration_ledger (tenant_id, source_hash, row_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [tenantId, digest, key, timestamp, timestamp],
      );
    }
    // What the space no longer holds (a value removed, a place deleted).
    for (const row of ledger.values()) {
      if (sources.has(row.source_hash)) continue;
      await deleteRows(executor, [row.row_key]);
      outcome.removed += 1;
    }
    return outcome;
  }

  return {
    async close() {
      if (ownsDriver) await db.close();
    },

    status: (tenantId) => statusOf(db, tenantId),

    async setConsent({ tenantId, enabled }) {
      const current = await consentOf(db, tenantId);
      if (enabled && !current)
        await db.run(
          "UPDATE organizations SET calibration_consent_at = ? WHERE id = ?",
          [clock().toISOString(), tenantId],
        );
      else if (!enabled && current)
        await db.run(
          "UPDATE organizations SET calibration_consent_at = NULL WHERE id = ?",
          [tenantId],
        );
      // Switching on keeps what the space already holds.
      if (enabled) await this.refresh(tenantId);
      return statusOf(db, tenantId);
    },

    async withdraw(tenantId) {
      await consentOf(db, tenantId);
      const withdrawn = await db.transaction(async (tx) => {
        const kept = Number(
          (
            await tx.query(
              "SELECT COUNT(*) AS kept FROM calibration_ledger WHERE tenant_id = ?",
              [tenantId],
            )
          ).rows[0]?.kept || 0,
        );
        await tx.run(
          "DELETE FROM calibration_contributions WHERE row_key IN (SELECT row_key FROM calibration_ledger WHERE tenant_id = ?)",
          [tenantId],
        );
        await tx.run("DELETE FROM calibration_ledger WHERE tenant_id = ?", [
          tenantId,
        ]);
        await tx.run(
          "UPDATE organizations SET calibration_consent_at = NULL WHERE id = ?",
          [tenantId],
        );
        return kept;
      });
      return { withdrawn, consent: await statusOf(db, tenantId) };
    },

    async refresh(tenantId) {
      if (!(await consentOf(db, tenantId).catch(() => null))) return null;
      const grid = await skyQualityGrid();
      if (!grid) return null;
      return db.transaction(async (tx) => {
        // Consent read again inside the transaction: a withdrawal that
        // committed meanwhile wins.
        if (!(await consentOf(tx, tenantId))) return null;
        return refreshIn(tx, tenantId, grid);
      });
    },
  };
}
