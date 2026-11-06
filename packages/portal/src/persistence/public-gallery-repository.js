import { arrivalRanks } from "../captures/capture-variants.js";
import {
  generatedTexts,
  generatedTextsOfRow,
} from "../captures/image-texts.js";
import { combinedEveningDates } from "./combined-nights.js";
import { createDatabaseDriver } from "./database.js";

/**
 * The captures the public gallery may show, SQLite and PostgreSQL, on the
 * columns of migration 54. A capture is public, here and nowhere else, when:
 *
 * - `visibility = 'public'` (the owner's « Publique »; the owner's capture
 *   service alone decides when it may be chosen, this reader does not repeat
 *   that rule);
 * - `removed_from_gallery_at` is null (not taken out after reports);
 * - `archived_at` is null (not archived);
 * - `admin_check` is not `refused` (a verified one stays);
 * - its upload is complete (`status = 'uploaded'`) and it is finalized
 *  (`stage = 'finalized'`: a draft is never public);
 * - its space is not closed: the space has an owner, and no owner of it is
 *   disabled (`users.disabled_at`).
 *
 * The order is the date of the night — the session's start, otherwise the
 * upload's `created_at` — newest first, then the id. The rows name their
 * space, for the reader's own lookups (the equipment of the night, the
 * file); the view model never carries it (`captures/public-capture-view.js`).
 */

const ELIGIBLE = `
  FROM captures c
  JOIN organizations o ON o.id = c.tenant_id
  LEFT JOIN observation_sessions s
    ON s.id = c.session_id AND s.tenant_id = c.tenant_id
  WHERE c.visibility = 'public'
    AND c.stage = 'finalized'
    AND c.status = 'uploaded'
    AND c.removed_from_gallery_at IS NULL
    AND c.archived_at IS NULL
    AND (c.admin_check IS NULL OR c.admin_check <> 'refused')
    AND s.deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.tenant_id = c.tenant_id AND m.role = 'owner'
    )
    AND NOT EXISTS (
      SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.tenant_id = c.tenant_id AND m.role = 'owner'
        AND u.disabled_at IS NOT NULL
    )`;

const COLUMNS = `
  c.id, c.tenant_id, c.session_id, c.plan_id, c.sha256, c.original_name,
  c.created_at, c.plan_json, o.public_name, s.started_at AS session_started_at,
  s.plan_id AS session_plan_id,
  COALESCE(s.started_at, c.created_at) AS night_at`;

const CHUNK = 400;

/** Runs `query(placeholders, values)` over `values` in chunks; the rows. */
async function inChunks(values, query) {
  const unique = [...new Set(values.filter(Boolean).map(String))];
  const rows = [];
  for (let start = 0; start < unique.length; start += CHUNK) {
    const part = unique.slice(start, start + CHUNK);
    rows.push(...(await query(part.map(() => "?").join(", "), part)));
  }
  return rows;
}

const row = (value, nightDates = []) => ({
  id: value.id,
  tenantId: value.tenant_id,
  sessionId: value.session_id ?? null,
  planId: value.plan_id || value.session_plan_id || null,
  sha256: value.sha256,
  originalName: value.original_name,
  createdAt: value.created_at,
  nightAt: value.night_at,
  // The evenings of the nights the image of a multi-night plan combines
  // (none for a capture of one night).
  nightDates,
  publicName: value.public_name ?? null,
});

export async function createPublicGalleryRepository({
  databasePath,
  databaseUrl,
  driver,
} = {}) {
  const ownsDriver = !driver;
  const db = driver || createDatabaseDriver({ databasePath, databaseUrl });

  /**
   * Every image of a capture with what a visitor may read of it — its
   * files' digest, its pixel size, its owner's title and description and
   * its rank of arrival (counted among every image, the private ones
   * included) — the main one first, then the newest. The caller filters
   * what a visitor sees.
   */
  const namedImages = async (captureId) => {
    const images = (
      await db.query(
        `SELECT id, sha256, original_name, width, height, is_main, is_public,
                title, description, generated_title_json,
                generated_description_json, created_at, archived_at
         FROM capture_variants WHERE capture_id = ? AND role IS NULL
         ORDER BY is_main DESC, created_at DESC, id DESC`,
        [String(captureId ?? "")],
      )
    ).rows.map((entry) => ({
      id: entry.id,
      sha256: entry.sha256,
      originalName: entry.original_name,
      width: entry.width == null ? null : Number(entry.width),
      height: entry.height == null ? null : Number(entry.height),
      main: Number(entry.is_main) === 1,
      // An archived variant is the owner's alone.
      public: Number(entry.is_public) === 1 && !entry.archived_at,
      title: entry.title ?? null,
      description: entry.description ?? null,
      ...generatedTextsOfRow(entry),
      createdAt: entry.created_at,
    }));
    const ranks = arrivalRanks(images);
    return images.map((image) => ({
      ...image,
      arrivalRank: ranks.get(image.id),
    }));
  };

  /** The capture's row with the evenings of the nights it combines. */
  const withNights = async (found) =>
    row(found, await combinedEveningDates(db, found.tenant_id, found));

  return {
    async close() {
      if (ownsDriver) await db.close();
    },

    /**
     * Every public capture, newest night first (`newestFirst: false`
     * reverses it). The gallery filters by tag and by name after the
     * catalogue is read, so the list is read whole; it is the public part of
     * the service, a few hundred rows.
     */
    async listPublic({ newestFirst = true } = {}) {
      const direction = newestFirst ? "DESC" : "ASC";
      const rows = (
        await db.query(
          `SELECT ${COLUMNS} ${ELIGIBLE}
           ORDER BY night_at ${direction}, c.id ${direction}`,
          [],
        )
      ).rows;
      const listed = [];
      for (const found of rows) listed.push(await withNights(found));
      return listed;
    },

    /** One public capture, or `null` — whatever the reason it is not. */
    async getPublic(captureId) {
      const found = (
        await db.query(`SELECT ${COLUMNS} ${ELIGIBLE} AND c.id = ?`, [
          String(captureId ?? ""),
        ])
      ).rows[0];
      return found ? await withNights(found) : null;
    },

    /**
     * The variants of a
     * capture a visitor sees after its main image — those its owner made
     * public — newest first. The caller has checked the capture is public
     * and shown (`captures/capture-variants.js`, `shownToVisitors`).
     */
    async shownVariants(captureId) {
      const images = await namedImages(captureId);
      return images.filter((image) => !image.main && image.public);
    },

    /**
     * The main image of a public capture with its owner's names —
     * `{ id, title, description, arrivalRank }` — or `null` (a capture stored
     * without images).
     */
    async mainImageNames(captureId) {
      const main = (await namedImages(captureId)).find((image) => image.main);
      return main
        ? {
            id: main.id,
            title: main.title,
            description: main.description,
            ...generatedTexts(main),
            arrivalRank: main.arrivalRank,
          }
        : null;
    },

    /** The targets of the captures, in their order: `Map<captureId, ids>`. */
    async targetIdsOf(captureIds) {
      const rows = await inChunks(
        captureIds,
        async (placeholders, values) =>
          (
            await db.query(
              `SELECT capture_id, target_id, position FROM capture_targets
               WHERE capture_id IN (${placeholders})
               ORDER BY capture_id, position`,
              values,
            )
          ).rows,
      );
      const byCapture = new Map();
      for (const entry of rows)
        byCapture.set(entry.capture_id, [
          ...(byCapture.get(entry.capture_id) || []),
          entry.target_id,
        ]);
      return byCapture;
    },

    /** The catalogue entries of `targetIds`: `Map<id, entry>`. */
    async catalogueEntries(targetIds) {
      const rows = await inChunks(
        targetIds,
        async (placeholders, values) =>
          (
            await db.query(
              `SELECT id, designation, aliases_json, common_names_json,
                      type_key, constellation_key, ra_hours, dec_degrees,
                      catalogues_json, library_source, gallery_label
               FROM target_catalogue_entries WHERE id IN (${placeholders})`,
              values,
            )
          ).rows,
      );
      return new Map(rows.map((entry) => [entry.id, entry]));
    },

    /**
     * The plans of the captures, each of its own space only:
     * `Map<planId, { tenantId, location, equipment }>` (the JSON parsed).
     * The place stays in this reader; the view model reads only what the
     * gallery derives from it.
     */
    async plansOf(items) {
      const wanted = new Map(
        items.filter((item) => item.planId).map((item) => [item.planId, item]),
      );
      const rows = await inChunks(
        [...wanted.keys()],
        async (placeholders, values) =>
          (
            await db.query(
              `SELECT id, tenant_id, location_json, equipment_json
               FROM plans WHERE id IN (${placeholders})`,
              values,
            )
          ).rows,
      );
      const parse = (value) => {
        try {
          return typeof value === "string" ? JSON.parse(value) : value;
        } catch {
          return null;
        }
      };
      const plans = new Map();
      for (const plan of rows)
        plans.set(plan.id, {
          tenantId: plan.tenant_id,
          location: parse(plan.location_json),
          equipment: parse(plan.equipment_json),
        });
      return plans;
    },

    /**
     * The equipment rows named by `ids` (identifiers are unique across
     * spaces): `Map<id, { tenantId, type, name, scope }>`. The caller keeps
     * a row of the capture's own space, or one the administration keeps for
     * every space (`scope = 'default'`), never another space's.
     */
    async equipmentOf(ids) {
      const rows = await inChunks(
        ids,
        async (placeholders, values) =>
          (
            await db.query(
              `SELECT id, tenant_id, equipment_type, name, scope
               FROM equipment WHERE id IN (${placeholders})`,
              values,
            )
          ).rows,
      );
      return new Map(
        rows.map((entry) => [
          entry.id,
          {
            tenantId: entry.tenant_id,
            type: entry.equipment_type,
            name: entry.name,
            scope: entry.scope,
          },
        ]),
      );
    },

    /**
     * The measured nights of one place of a space (`place_sky_measures`), as
     * `skyBrightnessSource` reads them.
     */
    async placeMeasures(tenantId, placeId) {
      if (!placeId) return [];
      return (
        await db.query(
          `SELECT night, sqm, pose_count, observed_at, method_version
           FROM place_sky_measures WHERE tenant_id = ? AND place_id = ?`,
          [tenantId, String(placeId)],
        )
      ).rows.map((entry) => ({
        night: entry.night,
        sqm: Number(entry.sqm),
        poseCount: Number(entry.pose_count),
        observedAt: entry.observed_at,
        methodVersion: entry.method_version,
      }));
    },
  };
}
