import { randomUUID } from "node:crypto";
import { createDatabaseDriver } from "./database.js";
import { applyMigrations } from "./migration-runner.js";
import { planCaptureFieldsOf } from "./plan-capture-fields.js";
import { sessionCarryingTarget } from "./capture-session-link.js";
import { acquisitionSummaryOf } from "../captures/capture-metadata.js";
import { publishChange } from "../api/change-bus.js";
import { withSerializedSqliteRetry } from "./db-transaction-retry.js";
import { OTHER_READS_AS_UNDETERMINED } from "../captures/sky-check-verdict.js";
import {
  arrivalRanks,
  variantResource as variantResourceOf,
} from "../captures/capture-variants.js";
import {
  CAPTURE_TAGS_MAX,
  captureTagsProblem,
  compareCaptureTags,
  storedCaptureTags,
} from "../captures/capture-tags.js";
import {
  PUBLIC_GALLERY_TAGS,
  defaultGenericTag,
} from "../captures/generic-tags.js";
import { captureSessionLiveSql } from "./capture-session-visibility.js";
import {
  createFileDeletionRunner,
  recordFileDeletions,
} from "./capture-file-deletions.js";

const now = () => new Date().toISOString();
const maxTargetsPerCapture = 16;

/** A package-level error that route adapters map to the v1 error envelope. */
export class CaptureRepositoryError extends Error {
  constructor(code, message, { status = 400, ...details } = {}) {
    super(message);
    this.name = "CaptureRepositoryError";
    this.code = code;
    this.status = status;
    Object.assign(this, details);
  }
}

/**
 * A capture may exist before any image (it is then the sole definition),
 * its images sent later by Astro Sync or added on the web. Its image columns (`sha256`, `byte_size`,
 * `original_name`) are then NULL (migration 72); the readers see
 * `sha256: null`, `originalName: null` and `byteSize: null`. The first image
 * it receives becomes its main image (`addVariant`). Whether a stored
 * `sha256` names an image (the capture has one):
 */
/**
 * The instant `GET /v1/captures?since=` reads for a capture (the synchronisation
 * cursor): the later of the day it was added and the day it came back from the
 * trash of its session (`restored_at`, migration 88). `created_at` itself is
 * the date it was added and never moves.
 */
const SYNC_AT_SQL = `(CASE WHEN c.restored_at IS NOT NULL
  AND c.restored_at > c.created_at THEN c.restored_at ELSE c.created_at END)`;

/**
 * The night of a capture, as the most-recent-first reading orders by it: its
 * plan's date (its own plan, else its session's), else its session's day, else
 * the day it was added (`GET /v1/captures?order=recent`).
 */
const RECENT_NIGHT_SQL = `COALESCE(
  (SELECT substr(p.plan_date, 1, 10) FROM plans p
     WHERE p.tenant_id = c.tenant_id AND p.id = COALESCE(c.plan_id,
       (SELECT o.plan_id FROM observation_sessions o
          WHERE o.id = c.session_id AND o.tenant_id = c.tenant_id))),
  (SELECT substr(o.started_at, 1, 10) FROM observation_sessions o
     WHERE o.id = c.session_id AND o.tenant_id = c.tenant_id),
  substr(c.created_at, 1, 10))`;

/** The opaque `nextBefore` of the most-recent-first reading. */
export const encodeRecentCursor = ({ night, createdAt, id }) =>
  Buffer.from(JSON.stringify([night, createdAt, id])).toString("base64url");

/** The cursor a `nextBefore` carries, or `null` when it is not one. */
export function decodeRecentCursor(value) {
  try {
    const [night, createdAt, id] = JSON.parse(
      Buffer.from(String(value), "base64url").toString("utf8"),
    );
    return [night, createdAt, id].every(
      (part) =>
        typeof part === "string" && part.length > 0 && part.length < 100,
    )
      ? { night, createdAt, id }
      : null;
  } catch {
    return null;
  }
}

/** The sources of an image that Astro Sync sends from the person's computer. */
const ASTRO_SYNC_SOURCES = new Set(["astro-sync", "stacking"]);

export const isImageDigest = (sha256) =>
  typeof sha256 === "string" && sha256.length > 0;

function toResource(row, targetIds, tags) {
  const hasImage = isImageDigest(row.sha256);
  return {
    id: row.id,
    sessionId: row.session_id ?? null,
    planId: row.plan_id ?? null,
    targetIds,
    originalName: hasImage ? row.original_name : null,
    sha256: hasImage ? row.sha256 : null,
    byteSize: hasImage ? Number(row.byte_size) : null,
    status: row.status,
    // `draft` or `finalized`, distinct from the visibility.
    stage: row.stage ?? "draft",
    visibility: row.visibility ?? "private",
    // On a public capture, when it last turned public (`null` for a capture
    // that was public before the date was kept: unknown). A private capture
    // carries no such field.
    ...((row.visibility ?? "private") === "public"
      ? { madePublicAt: row.made_public_at ?? null }
      : {}),
    checks: checksOf(row),
    // Archived by the service: the owner still reads and exports it, no
    // gallery shows it. Absent when it is not archived.
    ...(row.archived_at ? { archivedAt: row.archived_at } : {}),
    // The owner's own tags, on the reads that name them: `getCaptureById` and
    // `listCaptures`.
    ...(tags ? { tags } : {}),
    createdAt: row.created_at,
    // The capture's revision, 1 at the creation, +1 at each write that
    // changed something (`bumpRevision`).
    revision: Number(row.revision ?? 1) || 1,
    // The latest replacement of the capture's image by another one for the
    // same session and target, and the source of the image that was replaced
    // (`null` while it never was).
    replacedAt: row.replaced_at ?? null,
    replacedSource: row.replaced_at ? (row.replaced_source ?? "phone") : null,
    // The replacement turned this public capture private; present (and
    // true) until the owner next writes the visibility.
    ...(row.replaced_at &&
    Number(row.replaced_made_private ?? 0) === 1 &&
    (row.visibility ?? "private") === "private"
      ? { replacedMadePrivate: true }
      : {}),
    // The image of a multi-night plan names its plan and what it
    // combines; every other capture is unchanged.
    ...(row.project_id
      ? { projectId: row.project_id, plan: planCaptureFieldsOf(row.plan_json) }
      : {}),
  };
}

/**
 * One image of a capture as the owner reads it: the verdict REDUCED applies
 * to its own automatic check as to the capture's (a result `other` reads as
 * `undetermined`; a variant has no protection notice).
 */
function variantResource(row) {
  return variantResourceOf({
    ...row,
    auto_check:
      OTHER_READS_AS_UNDETERMINED && row.auto_check === "other"
        ? "undetermined"
        : row.auto_check,
  });
}

/**
 * The two checks as the owner reads them (`capture.schema.json`, `checks`):
 * the reason of an undetermined automatic check in the words the owner may
 * read (`automaticReason`, `OWNER_READABLE_CHECK_REASONS`: the file, the
 * format, a person, or « not recognised » — never the figure of the rule
 * that fell short); the administration reads the machine reason from the
 * row. Under the
 * verdict REDUCED (`captures/sky-check-verdict.js`), a result `other` whose
 * owner was never given the notice reads as `undetermined`: no notice, no
 * lifting, « Demander une vérification » as for any capture the check
 * could not recognise. The row keeps `other`, for the administration.
 */
/**
 * The reasons of a check that could not decide that the owner reads. The
 * service's own: the check is off on this server, the file could not be
 * read, was too large, took too long, is in a format the check does not
 * read, is a camera's raw file (the last two tell what to send instead;
 * without them the owner writes to support). And, since the rule has four
 * outcomes (the owner is shown why):
 * `person_detected`, a person seems to be in the image, and
 * `not_recognised`, neither a sky nor a landscape was recognised with
 * enough confidence — every other reason of the rule (too few stars, a
 * calibration frame, an astronomical header without coordinates, a
 * doubtful person, an animal or a room, the detector not running) reads as
 * this one: the owner learns why the team looks, never which figure of
 * the rule fell short.
 */
export const OWNER_READABLE_CHECK_REASONS = Object.freeze(
  Object.keys({
    check_off: true,
    unreadable: true,
    too_large: true,
    too_slow: true,
    unsupported_format: true,
    raw_camera_file: true,
    person_detected: true,
    not_recognised: true,
  }),
);

function automaticReasonOf(row, automatic) {
  // Why the check could not decide: only for a stored `undetermined`
  // (never for `other`, read as undetermined); a reason of the rule other
  // than a person reads as `not_recognised`. Absent without a reason.
  const reason = row.auto_check_reason;
  if (automatic !== "undetermined" || row.auto_check !== "undetermined")
    return {};
  if (!reason) return {};
  return {
    automaticReason: OWNER_READABLE_CHECK_REASONS.includes(reason)
      ? reason
      : "not_recognised",
  };
}

export function checksOf(row) {
  const automatic =
    OTHER_READS_AS_UNDETERMINED &&
    row.auto_check === "other" &&
    !row.protection_notice_at
      ? "undetermined"
      : (row.auto_check ?? null);
  return {
    automatic,
    ...automaticReasonOf(row, automatic),
    automaticAt: row.auto_check_at ?? null,
    team: row.admin_check ?? null,
    teamAt: row.admin_check_at ?? null,
    teamReason: row.admin_check_reason ?? null,
    reviewRequestedAt: row.review_requested_at ?? null,
    protectionNoticeAt: row.protection_notice_at ?? null,
    protectionLiftedAt: row.protection_lifted_at ?? null,
    removedFromGalleryAt: row.removed_from_gallery_at ?? null,
  };
}

/**
 * A personal target of a space, as the routes write it: a row of the
 * target library with `space_id`. Its place, date and note are its
 * owner's; a visitor reads its name and its label only.
 */
export function personalTargetResource(row) {
  return {
    id: row.id,
    source: "personal",
    name: row.designation,
    label: row.gallery_label ?? null,
    raHours: row.ra_hours == null ? null : Number(row.ra_hours),
    decDegrees: row.dec_degrees == null ? null : Number(row.dec_degrees),
    placeName: row.place_name ?? null,
    date: row.observed_on ?? null,
    note: row.note ?? null,
    createdAt: row.created_at,
  };
}

/** The two stages of a capture (`captures.stage`). */
export const CAPTURE_STAGES = Object.freeze(["draft", "finalized"]);

const VISIBILITIES = new Set(["private", "public"]);
const AUTOMATIC_RESULTS = new Set(["sky", "undetermined", "other"]);
const TEAM_RESULTS = new Set(["approved", "refused"]);
const TEAM_REASONS = new Set(["not_sky", "offensive", "identifiable", "other"]);

function oneOf(values, value, what) {
  if (!values.has(value))
    throw new CaptureRepositoryError(
      "invalid_request",
      `Unknown ${what}: ${String(value)}.`,
    );
  return value;
}

const pageSize = (limit, fallback = 50) =>
  Math.min(Math.max(Number(limit) || fallback, 1), 200);

/**
 * The one passage of a capture's stage. `finalized` writes
 * `finalized_at` the first time only (`COALESCE`), never cleared by a
 * return to `draft`; the capture's other columns are untouched.
 */
async function transitionStage(executor, { tenantId, captureId, stage, at }) {
  oneOf(new Set(CAPTURE_STAGES), stage, "stage");
  const result =
    stage === "finalized"
      ? await executor.run(
          `UPDATE captures SET stage = 'finalized', finalized_at = COALESCE(finalized_at, ?)
           WHERE id = ? AND tenant_id = ?`,
          [at, captureId, tenantId],
        )
      : await executor.run(
          "UPDATE captures SET stage = 'draft' WHERE id = ? AND tenant_id = ?",
          [captureId, tenantId],
        );
  return result.rowCount === 1;
}

/**
 * Moves the revision of a capture by 1 and records, for the conflict judged
 * by field, the revision of each field (and acquisition line) that changed —
 * `fields` is a list of `{ field, line? }` — and an audit line
 * `capture.field_changed` (the credential `by`, the names of the fields,
 * never a value). `expected`, when given, makes the move a compare-and-swap:
 * `null` when the capture is no longer at that revision (somebody wrote in
 * between). Runs on `executor`, a transaction or the driver.
 */
export async function bumpRevision(
  executor,
  {
    tenantId,
    captureId,
    fields = [],
    expected = null,
    by = null,
    userId = null,
    at = now(),
  },
) {
  const moved = await executor.run(
    `UPDATE captures SET revision = revision + 1
     WHERE id = ? AND tenant_id = ?${expected === null ? "" : " AND revision = ?"}`,
    expected === null ? [captureId, tenantId] : [captureId, tenantId, expected],
  );
  if (moved.rowCount !== 1) return null;
  const revision = Number(
    (
      await executor.query(
        "SELECT revision FROM captures WHERE id = ? AND tenant_id = ?",
        [captureId, tenantId],
      )
    ).rows[0]?.revision,
  );
  const seen = new Set();
  for (const { field, line = "" } of fields) {
    const key = `${field}\u0000${line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await executor.run(
      `INSERT INTO capture_field_revisions
         (capture_id, tenant_id, field, line_id, revision)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (capture_id, field, line_id)
       DO UPDATE SET revision = excluded.revision`,
      [captureId, tenantId, field, line, revision],
    );
  }
  await executor.run(
    // The person, when the space knows her (a device token of a test may
    // carry any id): the audit never fails a write.
    `INSERT INTO audit_events (id, tenant_id, user_id, event_type, details_json, created_at)
     VALUES (?, ?, (SELECT id FROM users WHERE id = ?), ?, ?, ?)`,
    [
      randomUUID(),
      tenantId,
      userId,
      "capture.field_changed",
      JSON.stringify({
        captureId,
        fields: [...new Set(fields.map((entry) => entry.field))],
        revision,
        by,
      }),
      at,
    ],
  );
  return revision;
}

/**
 * Open-source persistence: dual SQLite/PostgreSQL, tenant-isolated, on the exact
 * pattern of the planner repositories (target-favorite-repository.js,
 * planner-state-repository.js).
 *
 * `captures.target_id` (migration 17) still holds the *first* target for a
 * simple read; `capture_targets` (migration 18, the multi-target
 * design) is the source of truth for the complete, ordered list. Every
 * method here keeps both in step.
 */
export async function createCaptureRepository({
  databasePath,
  databaseUrl,
  driver,
  dialect = driver?.dialect ?? (databaseUrl ? "postgres" : "sqlite"),
  // `false` for a reader of a database the service has migrated already (the
  // processing of the captures): a migration opens a transaction, and a SQLite
  // connection holds one at a time.
  migrate = true,
} = {}) {
  const ownsDriver = !driver;
  const db = driver || createDatabaseDriver({ databasePath, databaseUrl });
  if (migrate) await applyMigrations(db, dialect);

  const targetsFor = async (executor, captureId) =>
    (
      await executor.query(
        "SELECT target_id FROM capture_targets WHERE capture_id = ? ORDER BY position",
        [captureId],
      )
    ).rows.map((row) => row.target_id);

  // The owner's tags of one capture of a space, in their reading order.
  const tagsFor = async (tenantId, captureId) =>
    (
      await db.query(
        "SELECT tag FROM capture_tags WHERE capture_id = ? AND tenant_id = ?",
        [captureId, tenantId],
      )
    ).rows
      .map((row) => row.tag)
      .sort(compareCaptureTags);

  // The generic tag a capture takes by default is its first target's type («
  // Nébuleuse »), kept among the capture's tags so that every page lists it,
  // translated. `defaultTagOfTarget` reads the target's row of the library
  // (the catalogue's, or the space's own personal target).
  const defaultTagOfTarget = async (executor, tenantId, targetId) => {
    // A capture without a target has no default: the galleries say « Grand
    // champ » of it by themselves, and the tag would be wrong the day a
    // target joins it.
    if (!targetId) return null;
    const entry = (
      await executor.query(
        `SELECT type_key, library_source, gallery_label
         FROM target_catalogue_entries
         WHERE id = ? AND (space_id IS NULL OR space_id = ?)`,
        [targetId, tenantId],
      )
    ).rows[0];
    return entry ? defaultGenericTag(entry) : null;
  };

  /**
   * Gives the capture its default generic tag, in the transaction that
   * changed its targets. Only when the capture has no generic tag yet; the
   * owner's own tags are never touched, and a generic tag the owner chose
   * stays. One exception keeps « default = the target's type » true when
   * the target changes (« Changer la cible »): a tag that is exactly the
   * default of the *previous* first target (`previousFirstTargetId`, `null`
   * for none, `undefined` when the capture is new) is replaced by the new
   * default. Idempotent: a second call writes nothing.
   */
  const applyDefaultTag = async (
    tx,
    tenantId,
    captureId,
    previousFirstTargetId = undefined,
  ) => {
    const targetIds = await targetsFor(tx, captureId);
    const wanted = await defaultTagOfTarget(tx, tenantId, targetIds[0] ?? null);
    const current = (
      await tx.query(
        "SELECT tag FROM capture_tags WHERE capture_id = ? AND tenant_id = ?",
        [captureId, tenantId],
      )
    ).rows.map((row) => row.tag);
    if (wanted && current.includes(wanted)) return false;
    if (previousFirstTargetId !== undefined) {
      const stale = await defaultTagOfTarget(
        tx,
        tenantId,
        previousFirstTargetId,
      );
      if (stale && stale !== wanted && current.includes(stale)) {
        await tx.run(
          "DELETE FROM capture_tags WHERE capture_id = ? AND tenant_id = ? AND tag = ?",
          [captureId, tenantId, stale],
        );
        if (!wanted) return true;
        await tx.run(
          "INSERT INTO capture_tags (capture_id, tenant_id, tag) VALUES (?, ?, ?)",
          [captureId, tenantId, wanted],
        );
        return true;
      }
    }
    if (!wanted) return false;
    if (
      current.some((tag) => PUBLIC_GALLERY_TAGS.includes(tag)) ||
      current.length >= CAPTURE_TAGS_MAX
    )
      return false;
    await tx.run(
      "INSERT INTO capture_tags (capture_id, tenant_id, tag) VALUES (?, ?, ?)",
      [captureId, tenantId, wanted],
    );
    return true;
  };

  const withTargets = async (rows) => {
    const items = [];
    for (const row of rows)
      items.push({
        tenantId: row.tenant_id,
        capture: toResource(row, await targetsFor(db, row.id)),
      });
    return items;
  };

  // One capture of one space: the column names (and the extra condition)
  // come from this module only.
  const updateCapture = async (tenantId, captureId, columns, extra = "") => {
    // A column may take an expression, `{ sql, params }`, where the value
    // depends on the row as it is at the write (the date a capture turned
    // public).
    const names = Object.keys(columns);
    const expression = (value) =>
      value !== null && typeof value === "object" && "sql" in value;
    const result = await db.run(
      `UPDATE captures SET ${names
        .map((name) =>
          expression(columns[name])
            ? `${name} = ${columns[name].sql}`
            : `${name} = ?`,
        )
        .join(", ")}
       WHERE id = ? AND tenant_id = ?${extra ? ` AND ${extra}` : ""}`,
      [
        ...names.flatMap((name) =>
          expression(columns[name]) ? columns[name].params : [columns[name]],
        ),
        captureId,
        tenantId,
      ],
    );
    const written = result.rowCount === 1;
    if (written) publishChange({ tenantId, domains: ["captures"] });
    return written;
  };

  return {
    async close() {
      if (ownsDriver) await db.close();
    },

    /**
     * The runner of the deletions of files this repository records
     * (`capture-file-deletions.js`) on its own connection; `files` answers
     * the capture store.
     */
    fileDeletions({ files, log, clock } = {}) {
      return createFileDeletionRunner({ db, files, log, clock });
    },

    /**
     * Sum of the sizes of every original the space stores — each image of
     * each capture, the main one and the alternative ones — for the quota
     * check.
     */
    async usedBytes(tenantId) {
      const row = (
        await db.query(
          "SELECT COALESCE(SUM(byte_size), 0) AS total FROM capture_variants WHERE tenant_id = ?",
          [tenantId],
        )
      ).rows[0];
      return Number(row?.total || 0);
    },

    /**
     * How many captures the tenant holds (every row of `captures`, whatever
     * its visibility or checks), for `capture.count_limit`.
     */
    async captureCount(tenantId) {
      const row = (
        await db.query(
          "SELECT COUNT(*) AS total FROM captures WHERE tenant_id = ? AND archived_at IS NULL",
          [tenantId],
        )
      ).rows[0];
      return Number(row?.total || 0);
    },

    /**
     * Existence + tenant scope for an optional plan link, mirroring the
     * soft-deletion rule the plan routes already enforce (migration 16):
     * a deleted plan is not a valid attachment point for a new capture.
     */
    async findPlan(tenantId, planId) {
      if (!planId) return null;
      return (
        (
          await db.query(
            "SELECT id FROM plans WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
            [planId, tenantId],
          )
        ).rows[0] || null
      );
    },

    /**
     * Existence + tenant scope for an optional observation-session link:
     * another space's session is exactly as absent as one that exists
     * nowhere, and is checked before anything is written — never left to
     * the foreign key, which accepts any space's row.
     */
    async findObservationSession(tenantId, sessionId) {
      if (!sessionId) return null;
      return (
        (
          await db.query(
            "SELECT id FROM observation_sessions WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
            [sessionId, tenantId],
          )
        ).rows[0] || null
      );
    },

    /**
     * Which of the given catalogue identifiers actually exist (mirrors
     * target-favorite-repository.js's own `source_present = 1` check; the
     * catalogue is shared across tenants, not tenant-scoped). Returns the
     * subset found, so the caller can name what is missing.
     */
    async existingTargetIds(targetIds, tenantId = null) {
      if (!targetIds.length) return [];
      const placeholders = targetIds.map(() => "?").join(", ");
      // A target of the shared catalogue, or a personal target of this
      // space (never another space's: it answers like one that does not
      // exist).
      const rows = (
        await db.query(
          `SELECT id FROM target_catalogue_entries
           WHERE id IN (${placeholders})
             AND ((space_id IS NULL AND source_present = 1) OR space_id = ?)`,
          [...targetIds, tenantId ?? ""],
        )
      ).rows;
      return rows.map((row) => row.id);
    },

    /**
     * A plain, read-only lookup by the same `(tenant_id, sha256)` key
     * `insertCaptureWithTargets` is idempotent on.4's resumable
     * `POST /v1/uploads` uses this to decide, before allocating anything,
     * whether these bytes are already a finalized capture (created by
     * either transport: this resumable one, or the earlier single-request
     * form). Returns `null` when there is none yet.
     */
    async findCaptureBySha256(tenantId, sha256) {
      const row = (
        await db.query(
          `SELECT c.* FROM capture_variants v JOIN captures c ON c.id = v.capture_id
           WHERE v.tenant_id = ? AND v.sha256 = ?`,
          [tenantId, sha256],
        )
      ).rows[0];
      if (!row) return null;
      return toResource(row, await targetsFor(db, row.id));
    },

    /**
     * The image of the space that holds these bytes, whatever capture it
     * belongs to — `{ captureId, variant }` — or `null`. The pre-check
     * answers `present` from it before a single byte is sent.
     */
    async findVariantBySha256(tenantId, sha256) {
      const row = (
        await db.query(
          "SELECT * FROM capture_variants WHERE tenant_id = ? AND sha256 = ?",
          [tenantId, sha256],
        )
      ).rows[0];
      return row
        ? { captureId: row.capture_id, variant: variantResource(row) }
        : null;
    },

    /**
     * The images of one capture of the space, the main one first, then the
     * newest; each with its rank of arrival (`arrivalRank`, computed from
     * every image of the capture, never stored). Its progression images
     * are not among them (`listProgression`).
     */
    async listVariants(tenantId, captureId) {
      const images = (
        await db.query(
          `SELECT * FROM capture_variants
           WHERE tenant_id = ? AND capture_id = ? AND role IS NULL
           ORDER BY is_main DESC, created_at DESC, id DESC`,
          [tenantId, String(captureId ?? "")],
        )
      ).rows.map(variantResource);
      const ranks = arrivalRanks(images);
      return images.map((image) => ({
        ...image,
        arrivalRank: ranks.get(image.id),
      }));
    },

    /**
     * The progression images of one capture of the space — the milestones
     * of its night, the history of the capture — from the first (one
     * frame) to the last, the oldest first for the same count.
     */
    async listProgression(tenantId, captureId) {
      return (
        await db.query(
          `SELECT * FROM capture_variants
           WHERE tenant_id = ? AND capture_id = ? AND role = 'progression'
           ORDER BY frame_count ASC, created_at ASC, id ASC`,
          [tenantId, String(captureId ?? "")],
        )
      ).rows.map(variantResource);
    },

    /**
     * The owner's title or description of one image of a capture of the
     * space (`field` is `title` or `description`; `value` already
     * bounded and trimmed by the caller, `null` for « by default »).
     * Answers whether an image was written.
     */
    async setVariantText(tenantId, captureId, variantId, field, value) {
      if (!["title", "description"].includes(field))
        throw new Error(`Unknown image text: ${String(field)}.`);
      const written = await db.run(
        `UPDATE capture_variants SET ${field} = ? WHERE tenant_id = ? AND capture_id = ? AND id = ?`,
        [value, tenantId, String(captureId ?? ""), String(variantId ?? "")],
      );
      return Number(written?.rowCount ?? 0) > 0;
    },

    /** One image of one capture of the space, or `null`. */
    async getVariant(tenantId, captureId, variantId) {
      const row = (
        await db.query(
          "SELECT * FROM capture_variants WHERE tenant_id = ? AND capture_id = ? AND id = ?",
          [tenantId, String(captureId ?? ""), String(variantId ?? "")],
        )
      ).rows[0];
      return row ? variantResource(row) : null;
    },

    /**
     * The number of images of each capture of the space beyond the main
     * one: `Map<captureId, count>` (absent: none).
     */
    async alternativeCounts(tenantId) {
      const counts = new Map();
      for (const row of (
        await db.query(
          `SELECT capture_id, COUNT(*) AS count FROM capture_variants
           WHERE tenant_id = ? AND is_main = 0 AND role IS NULL
           GROUP BY capture_id`,
          [tenantId],
        )
      ).rows)
        counts.set(row.capture_id, Number(row.count));
      return counts;
    },

    /**
     * How many images one capture holds beyond its main one (its variants,
     * never its progression images).
     */
    async alternativeCount(tenantId, captureId) {
      const row = (
        await db.query(
          "SELECT COUNT(*) AS count FROM capture_variants WHERE tenant_id = ? AND capture_id = ? AND is_main = 0 AND role IS NULL",
          [tenantId, String(captureId ?? "")],
        )
      ).rows[0];
      return Number(row?.count || 0);
    },

    /**
     * A new image for an existing capture of the space — an alternative
     * image, never the main one by itself (the image online is kept; its
     * owner chooses the main one from the web), private on arrival. The
     * bytes already held by the space (any capture) are « already present »:
     * nothing is written. `targetIds` are unioned onto the capture, like a
     * replay's. Answers `{ capture, variant, created }`, or `null` when the
     * capture is not the space's. `role` `progression` (with its
     * `frameCount`) adds a progression image, the history of the capture,
     * never its main image.
     */
    async addVariant({
      id = randomUUID(),
      tenantId,
      captureId,
      sha256,
      byteSize,
      originalName,
      source = null,
      role = null,
      frameCount = null,
      targetIds = [],
      createdAt = now(),
      originClientInstanceId = null,
      // Where the image goes when the capture has one already — `variant`
      // (default), `main` (the new image becomes the main one and the
      // former one a variant; kept a variant on a public capture, whose
      // main image is shown), `replace` (the new image takes the main
      // image's place, the old bytes freed).
      placement = "variant",
    }) {
      const result = await db.transaction(async (tx) => {
        const owner = (
          await tx.query(
            "SELECT * FROM captures WHERE id = ? AND tenant_id = ?",
            [String(captureId ?? ""), tenantId],
          )
        ).rows[0];
        if (!owner) return null;
        const held = (
          await tx.query(
            "SELECT * FROM capture_variants WHERE tenant_id = ? AND sha256 = ?",
            [tenantId, sha256],
          )
        ).rows[0];
        let created = false;
        let variantRow = held;
        // The first image of a capture that has none is its main image
        // — never a progression image.
        const first = !held && !role && !isImageDigest(owner.sha256);
        const withImage = !held && !role && isImageDigest(owner.sha256);
        const replace = withImage && placement === "replace";
        const promote =
          withImage &&
          placement === "main" &&
          (owner.visibility ?? "private") !== "public";
        let replaced = null;
        if (replace) {
          // The image takes the main image's place: its sky solution and the
          // completed upload that recorded its bytes go with it.
          replaced = (
            await tx.query(
              "SELECT * FROM capture_variants WHERE tenant_id = ? AND capture_id = ? AND is_main = 1",
              [tenantId, owner.id],
            )
          ).rows[0];
          if (replaced) {
            await tx.run(
              "DELETE FROM upload_sessions WHERE tenant_id = ? AND sha256 = ? AND state = 'completed'",
              [tenantId, replaced.sha256],
            );
            await tx.run(
              "DELETE FROM capture_sky_solutions WHERE image_id = ?",
              [replaced.id],
            );
            await tx.run("DELETE FROM capture_variants WHERE id = ?", [
              replaced.id,
            ]);
            // Its bytes are freed once the transaction holds: the task is
            // written with the rows it follows (`capture-file-deletions.js`).
            await recordFileDeletions(tx, {
              tenantId,
              digests: [replaced.sha256],
            });
          }
        } else if (promote)
          await tx.run(
            "UPDATE capture_variants SET is_main = 0 WHERE tenant_id = ? AND capture_id = ? AND is_main = 1",
            [tenantId, owner.id],
          );
        const isMain = first || replace || promote;
        if (!held) {
          const insert = await tx.run(
            `INSERT INTO capture_variants
               (id, capture_id, tenant_id, sha256, byte_size, original_name,
                source, is_main, is_public, created_at, role, frame_count)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
             ON CONFLICT (tenant_id, sha256) DO NOTHING`,
            [
              id,
              owner.id,
              tenantId,
              sha256,
              byteSize,
              originalName,
              source,
              isMain ? 1 : 0,
              createdAt,
              role ?? null,
              role ? (frameCount ?? null) : null,
            ],
          );
          created = insert.rowCount === 1;
          if (created && isMain)
            await tx.run(
              `UPDATE captures SET sha256 = ?, byte_size = ?, original_name = ?,
                 status = 'uploaded', auto_check = NULL, auto_check_reason = NULL,
                 auto_check_at = NULL
               WHERE id = ? AND tenant_id = ?`,
              [sha256, byteSize, originalName, owner.id, tenantId],
            );
          if (created && replace && ASTRO_SYNC_SOURCES.has(source))
            // Astro Sync replaces the image with the one the person
            // processed on their computer: the capture keeps its publication
            // state and the date it turned public. The image is noted as
            // replaced; the check runs again on the new bytes.
            await tx.run(
              `UPDATE captures SET replaced_at = ?, replaced_source = ?
               WHERE id = ? AND tenant_id = ?`,
              [createdAt, replaced?.source ?? "phone", owner.id, tenantId],
            );
          else if (created && replace)
            // A replaced image of a public capture: the new one has not
            // passed its check, so the capture goes back to private.
            await tx.run(
              `UPDATE captures SET replaced_at = ?, replaced_source = ?,
                 visibility = 'private', made_public_at = NULL,
                 replaced_made_private = ?
               WHERE id = ? AND tenant_id = ?`,
              [
                createdAt,
                replaced?.source ?? "phone",
                // The owner is told the capture went back to private; a
                // capture that was private already keeps what it said.
                (owner.visibility ?? "private") === "public" ||
                Number(owner.replaced_made_private ?? 0) === 1
                  ? 1
                  : 0,
                owner.id,
                tenantId,
              ],
            );
          variantRow = (
            await tx.query(
              "SELECT * FROM capture_variants WHERE tenant_id = ? AND sha256 = ?",
              [tenantId, sha256],
            )
          ).rows[0];
        }
        const holder = variantRow.capture_id;
        const existingTargets = await targetsFor(tx, holder);
        const known = new Set(existingTargets);
        const added = [...new Set(targetIds)].filter((t) => !known.has(t));
        if (existingTargets.length + added.length > maxTargetsPerCapture)
          throw new CaptureRepositoryError(
            "invalid_request",
            `A capture may show at most ${maxTargetsPerCapture} targets.`,
          );
        let position = existingTargets.length;
        for (const targetId of added) {
          await tx.run(
            "INSERT INTO capture_targets (capture_id, target_id, position) VALUES (?, ?, ?) ON CONFLICT(capture_id, target_id) DO NOTHING",
            [holder, targetId, position],
          );
          position += 1;
        }
        // A target that joins a capture without one gives it its tag.
        if (added.length)
          await applyDefaultTag(
            tx,
            tenantId,
            holder,
            existingTargets[0] ?? null,
          );
        // An image added or replaced, or a target joined, moves the
        // revision of the capture that holds it.
        if (created || added.length)
          await bumpRevision(tx, {
            tenantId,
            captureId: holder,
            fields: added.length ? [{ field: "targetIds" }] : [],
            by: "image",
            at: createdAt,
          });
        const captureRow = (
          await tx.query("SELECT * FROM captures WHERE id = ?", [holder])
        ).rows[0];
        return {
          capture: toResource(captureRow, [...existingTargets, ...added]),
          variant: variantResource(variantRow),
          created,
          deduplicated: !created,
          targetsAdded: added.length,
          // The image this one replaced, and whether the former main image
          // was kept as a variant.
          replaced: created && replace ? (replaced ?? null) : null,
          madeMain: created && promote,
        };
      });
      if (result && (result.created || result.targetsAdded > 0))
        publishChange({
          tenantId,
          domains: ["captures"],
          originClientInstanceId,
        });
      return result;
    },

    /**
     * The owner's choice of the main image of a capture: the former main
     * image becomes a variant and keeps its visibility (it was seen as its
     * capture is: public while the capture is public); the capture's row
     * takes the new main image's digest, size, name and automatic check.
     * Whether a capture of the space was written.
     */
    async setMainImage(tenantId, captureId, variantId) {
      const written = await db.transaction(async (tx) => {
        const chosen = (
          await tx.query(
            "SELECT * FROM capture_variants WHERE tenant_id = ? AND capture_id = ? AND id = ?",
            [tenantId, String(captureId ?? ""), String(variantId ?? "")],
          )
        ).rows[0];
        if (!chosen) return false;
        if (Number(chosen.is_main) === 1) return true;
        const capture = (
          await tx.query(
            "SELECT visibility FROM captures WHERE id = ? AND tenant_id = ?",
            [chosen.capture_id, tenantId],
          )
        ).rows[0];
        await tx.run(
          "UPDATE capture_variants SET is_main = 0, is_public = ? WHERE tenant_id = ? AND capture_id = ? AND is_main = 1",
          [
            capture?.visibility === "public" ? 1 : 0,
            tenantId,
            chosen.capture_id,
          ],
        );
        await tx.run("UPDATE capture_variants SET is_main = 1 WHERE id = ?", [
          chosen.id,
        ]);
        await tx.run(
          `UPDATE captures SET sha256 = ?, byte_size = ?, original_name = ?,
             auto_check = ?, auto_check_reason = ?, auto_check_at = ?
           WHERE id = ? AND tenant_id = ?`,
          [
            chosen.sha256,
            chosen.byte_size,
            chosen.original_name,
            chosen.auto_check ?? null,
            chosen.auto_check_reason ?? null,
            chosen.auto_check_at ?? null,
            chosen.capture_id,
            tenantId,
          ],
        );
        await bumpRevision(tx, {
          tenantId,
          captureId: chosen.capture_id,
          by: "web",
        });
        return true;
      });
      if (written) publishChange({ tenantId, domains: ["captures"] });
      return written;
    },

    /** The visibility of a variant: `true` public. */
    async setVariantPublic(tenantId, captureId, variantId, shown) {
      if (typeof shown !== "boolean")
        throw new CaptureRepositoryError(
          "invalid_request",
          "public is a boolean.",
        );
      const written = await withSerializedSqliteRetry(db, async (tx) => {
        const result = await tx.run(
          "UPDATE capture_variants SET is_public = ? WHERE tenant_id = ? AND capture_id = ? AND id = ? AND is_main = 0",
          [
            shown ? 1 : 0,
            tenantId,
            String(captureId ?? ""),
            String(variantId ?? ""),
          ],
        );
        if (result.rowCount !== 1) return false;
        await bumpRevision(tx, {
          tenantId,
          captureId: String(captureId ?? ""),
          by: "web",
        });
        return true;
      });
      if (written) publishChange({ tenantId, domains: ["captures"] });
      return written;
    },

    /**
     * Deletes an alternative image of a capture and the completed upload
     * that recorded its bytes, and writes the task that deletes its files
     * (`capture_file_deletions`: the caller then tries it). The main image is never deleted alone
     * (`main_image`), nor, therefore, the last image of a capture. Answers
     * the deleted image, or `null` when it is not one of the capture's.
     */
    async deleteVariant(tenantId, captureId, variantId) {
      const deleted = await db.transaction(async (tx) => {
        const row = (
          await tx.query(
            "SELECT * FROM capture_variants WHERE tenant_id = ? AND capture_id = ? AND id = ?",
            [tenantId, String(captureId ?? ""), String(variantId ?? "")],
          )
        ).rows[0];
        if (!row) return null;
        if (Number(row.is_main) === 1)
          throw new CaptureRepositoryError(
            "main_image",
            "The main image of a capture is not deleted alone: choose another main image first, or delete the capture.",
            { status: 409 },
          );
        await tx.run(
          "DELETE FROM upload_sessions WHERE tenant_id = ? AND sha256 = ? AND state = 'completed'",
          [tenantId, row.sha256],
        );
        // The sky solution belongs to the image; it goes with it.
        await tx.run("DELETE FROM capture_sky_solutions WHERE image_id = ?", [
          row.id,
        ]);
        await tx.run("DELETE FROM capture_variants WHERE id = ?", [row.id]);
        // The image's files go once the rows are gone: the task is written
        // in this transaction (`capture-file-deletions.js`); the caller
        // tries it at once and the hourly maintenance until it is done.
        await recordFileDeletions(tx, { tenantId, digests: [row.sha256] });
        await bumpRevision(tx, {
          tenantId,
          captureId: row.capture_id,
          by: "web",
        });
        return variantResource(row);
      });
      if (deleted) publishChange({ tenantId, domains: ["captures"] });
      return deleted;
    },

    /**
     * A personal target of the space, in the target library (`space_id`,
     * `library_source = 'personal'`, `source_present = 0`: the readers of
     * the shared catalogue never see it). The caller validates the fields.
     */
    async createPersonalTarget({
      id = randomUUID(),
      tenantId,
      name,
      label,
      raHours = null,
      decDegrees = null,
      placeName = null,
      date = null,
      note = null,
      createdAt = now(),
    }) {
      await db.run(
        `INSERT INTO target_catalogue_entries (
           id, designation, aliases_json, common_names_json, type_key,
           ra_hours, dec_degrees, catalogues_json, catalogue, source_json,
           source_present, source_revision, created_at, updated_at,
           space_id, library_source, gallery_label, place_name, observed_on,
           note
         ) VALUES (?, ?, '[]', '[]', NULL, ?, ?, '[]', 'personal', '{}', 0,
           'personal', ?, ?, ?, 'personal', ?, ?, ?, ?)`,
        [
          id,
          name,
          raHours,
          decDegrees,
          createdAt,
          createdAt,
          tenantId,
          label,
          placeName,
          date,
          note,
        ],
      );
      publishChange({ tenantId, domains: ["captures"] });
      return personalTargetResource({
        id,
        designation: name,
        gallery_label: label,
        ra_hours: raHours,
        dec_degrees: decDegrees,
        place_name: placeName,
        observed_on: date,
        note,
        created_at: createdAt,
      });
    },

    /** The personal targets of the space, newest first. */
    async listPersonalTargets(tenantId) {
      return (
        await db.query(
          `SELECT * FROM target_catalogue_entries
           WHERE space_id = ? AND library_source = 'personal'
           ORDER BY created_at DESC, id DESC`,
          [tenantId],
        )
      ).rows.map(personalTargetResource);
    },

    /**
     * The targets of a capture's list as the gallery reads them:
     * `Map<id, row>` of the catalogue's entries and of the space's own
     * personal targets among `ids`.
     */
    async targetEntries(tenantId, ids) {
      const unique = [...new Set(ids.filter(Boolean))];
      if (!unique.length) return new Map();
      const rows = (
        await db.query(
          `SELECT id, designation, aliases_json, common_names_json, type_key,
                  ra_hours, dec_degrees, space_id, library_source, gallery_label
           FROM target_catalogue_entries
           WHERE id IN (${unique.map(() => "?").join(", ")})
             AND (space_id IS NULL OR space_id = ?)`,
          [...unique, tenantId],
        )
      ).rows;
      return new Map(rows.map((row) => [row.id, row]));
    },

    /**
     * The capture's metadata columns (`capture-metadata.js`,
     * `metadataColumns`), written together; a column this list does not
     * name is never written.
     */
    async writeMetadata(tenantId, captureId, columns) {
      const allowed = [
        "title",
        "description",
        "notes",
        "calibration",
        "acquisition_json",
        "sensor_json",
        "equipment_json",
        "processing_json",
        "field_origins_json",
      ];
      const picked = Object.fromEntries(
        allowed
          .filter((name) => Object.hasOwn(columns, name))
          .map((name) => [name, columns[name]]),
      );
      if (!Object.keys(picked).length) return false;
      return await updateCapture(tenantId, captureId, picked);
    },

    /**
     * « Changer la nuit de la capture » — another night of the space and
     * the plan it belongs to (the capture reads them from then on).
     */
    async setCaptureNight(tenantId, captureId, sessionId, planId) {
      return await updateCapture(tenantId, captureId, {
        session_id: sessionId,
        plan_id: planId ?? null,
      });
    },

    /**
     * A capture without an image — its definition (targets, night,
     * plan), a draft, private, whose image columns stay NULL until its
     * first image arrives. Answers the capture's resource.
     */
    async createDefinition({
      id = randomUUID(),
      tenantId,
      sessionId = null,
      planId = null,
      targetIds = [],
      createdAt = now(),
    }) {
      const requested = [...new Set(targetIds)];
      if (requested.length > maxTargetsPerCapture)
        throw new CaptureRepositoryError(
          "invalid_request",
          `A capture may show at most ${maxTargetsPerCapture} targets.`,
        );
      await db.transaction(async (tx) => {
        await tx.run(
          `INSERT INTO captures
             (id, tenant_id, session_id, plan_id, target_id, original_name, sha256, byte_size, status, stage, created_at, quality_public)
           VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, 'draft', 'draft', ?, 1)`,
          [id, tenantId, sessionId, planId, requested[0] || null, createdAt],
        );
        let position = 0;
        for (const targetId of requested) {
          await tx.run(
            "INSERT INTO capture_targets (capture_id, target_id, position) VALUES (?, ?, ?)",
            [id, targetId, position],
          );
          position += 1;
        }
        // The default generic tag, from the first target.
        await applyDefaultTag(tx, tenantId, id);
      });
      publishChange({ tenantId, domains: ["captures"] });
      return toResource(
        (
          await db.query(
            "SELECT * FROM captures WHERE id = ? AND tenant_id = ?",
            [id, tenantId],
          )
        ).rows[0],
        requested,
      );
    },

    /**
     * The capture's targets replaced by this ordered list (« Changer la cible
     * »); `captures.target_id` follows the first. Whether a capture of the
     * space was written.
     */
    async setCaptureTargets(tenantId, captureId, targetIds) {
      const requested = [...new Set(targetIds)];
      if (requested.length > maxTargetsPerCapture)
        throw new CaptureRepositoryError(
          "invalid_request",
          `A capture may show at most ${maxTargetsPerCapture} targets.`,
        );
      const written = await db.transaction(async (tx) => {
        const owner = (
          await tx.query(
            "SELECT id FROM captures WHERE id = ? AND tenant_id = ?",
            [String(captureId ?? ""), tenantId],
          )
        ).rows[0];
        if (!owner) return false;
        const previousFirst = (await targetsFor(tx, owner.id))[0] ?? null;
        await tx.run("DELETE FROM capture_targets WHERE capture_id = ?", [
          owner.id,
        ]);
        let position = 0;
        for (const targetId of requested) {
          await tx.run(
            "INSERT INTO capture_targets (capture_id, target_id, position) VALUES (?, ?, ?)",
            [owner.id, targetId, position],
          );
          position += 1;
        }
        await tx.run("UPDATE captures SET target_id = ? WHERE id = ?", [
          requested[0] || null,
          owner.id,
        ]);
        // The default generic tag follows the target's type.
        await applyDefaultTag(tx, tenantId, owner.id, previousFirst);
        return true;
      });
      if (written) publishChange({ tenantId, domains: ["captures"] });
      return written;
    },

    /**
     * The oldest capture of the space still without an image whose night is
     * this one and which shows one of these targets — the definition an
     * upload of Astro Sync fills instead of creating a second capture. `null`
     * when there is none (or no target is named).
     */
    async findDefinitionFor(tenantId, { sessionId = null, targetIds = [] }) {
      const wanted = [...new Set(targetIds)];
      if (!wanted.length) return null;
      const rows = (
        await db.query(
          `SELECT DISTINCT c.* FROM captures c
           JOIN capture_targets ct ON ct.capture_id = c.id
           WHERE c.tenant_id = ? AND c.sha256 IS NULL
             AND ${sessionId ? "c.session_id = ?" : "c.session_id IS NULL"}
             AND ct.target_id IN (${wanted.map(() => "?").join(", ")})
           ORDER BY c.created_at ASC, c.id ASC
           LIMIT 1`,
          [tenantId, ...(sessionId ? [sessionId] : []), ...wanted],
        )
      ).rows[0];
      return rows ? toResource(rows, await targetsFor(db, rows.id)) : null;
    },

    /**
     * The session a capture joins when it arrives without one but with a
     * plan (its night: the plan's date) and a target — `{ id, planId }`, or
     * `null` (`capture-session-link.js`).
     */
    async findSessionOfNight(tenantId, { planId, targetIds = [] }) {
      const plan = planId
        ? (
            await db.query(
              "SELECT plan_date, location_json FROM plans WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
              [String(planId), tenantId],
            )
          ).rows[0]
        : null;
      if (!plan?.plan_date) return null;
      let placeName = null;
      try {
        placeName = JSON.parse(plan.location_json || "null")?.name ?? null;
      } catch {
        placeName = null;
      }
      return await sessionCarryingTarget(db, tenantId, {
        eveningDate: plan.plan_date,
        targetIds,
        placeName,
      });
    },

    /**
     * The capture of this session that shows this target and already has an
     * image — the one capture per session and target a second image is added
     * to or replaces. The oldest one if the space holds several (a capture
     * the owner made by hand); the image of a multi-night plan
     * (`project_id`) is never one. `null` when there is none.
     */
    async findCaptureWithImageFor(tenantId, { sessionId, targetId }) {
      if (!sessionId || !targetId) return null;
      const row = (
        await db.query(
          `SELECT c.* FROM captures c
           JOIN capture_targets ct ON ct.capture_id = c.id
           WHERE c.tenant_id = ? AND c.session_id = ? AND ct.target_id = ?
             AND c.sha256 IS NOT NULL AND c.project_id IS NULL
           ORDER BY c.created_at ASC, c.id ASC
           LIMIT 1`,
          [tenantId, sessionId, targetId],
        )
      ).rows[0];
      return row ? toResource(row, await targetsFor(db, row.id)) : null;
    },

    /**
     * An image's title and description with the origin of its title
     * (`astro-sync`, `import`, `owner`) and the date the owner wrote them
     * (`null`: never by the owner). Written together.
     */
    async writeVariantTexts(
      tenantId,
      captureId,
      variantId,
      { title, description, titleSource, editedAt },
      { moveRevision = true } = {},
    ) {
      const done = await withSerializedSqliteRetry(db, async (tx) => {
        const before = (
          await tx.query(
            "SELECT title, description, title_source FROM capture_variants WHERE tenant_id = ? AND capture_id = ? AND id = ?",
            [tenantId, String(captureId ?? ""), String(variantId ?? "")],
          )
        ).rows[0];
        const written = await tx.run(
          `UPDATE capture_variants SET title = ?, description = ?, title_source = ?, edited_at = ?
           WHERE tenant_id = ? AND capture_id = ? AND id = ?`,
          [
            title,
            description,
            title === null ? null : titleSource,
            editedAt,
            tenantId,
            String(captureId ?? ""),
            String(variantId ?? ""),
          ],
        );
        if (Number(written?.rowCount ?? 0) < 1) return false;
        // What the owner reads moved with the texts of an image.
        if (
          moveRevision &&
          ((before?.title ?? null) !== title ||
            (before?.description ?? null) !== description)
        )
          await bumpRevision(tx, {
            tenantId,
            captureId: String(captureId ?? ""),
            by: titleSource === "owner" ? "web" : "producer",
          });
        return true;
      });
      if (done) publishChange({ tenantId, domains: ["captures"] });
      return done;
    },

    /**
     * The texts a producer generated for an image in the ten languages
     * (`title`, `description`: each a JSON text, or absent to keep the
     * stored one), and the earlier one-language texts it clears
     * (`clearTitle`, `clearDescription`: the producer's own title and
     * description of before). Answers whether anything changed.
     */
    async writeVariantGeneratedTexts(
      tenantId,
      captureId,
      variantId,
      { title, description, clearTitle = false, clearDescription = false },
    ) {
      const done = await withSerializedSqliteRetry(db, async (tx) => {
        const key = [
          tenantId,
          String(captureId ?? ""),
          String(variantId ?? ""),
        ];
        const before = (
          await tx.query(
            `SELECT title, description, title_source, generated_title_json,
                    generated_description_json
             FROM capture_variants WHERE tenant_id = ? AND capture_id = ? AND id = ?`,
            key,
          )
        ).rows[0];
        if (!before) return false;
        const after = {
          title: clearTitle ? null : (before.title ?? null),
          titleSource: clearTitle ? null : (before.title_source ?? null),
          description: clearDescription ? null : (before.description ?? null),
          generatedTitle: title ?? before.generated_title_json ?? null,
          generatedDescription:
            description ?? before.generated_description_json ?? null,
        };
        if (
          after.title === (before.title ?? null) &&
          after.description === (before.description ?? null) &&
          after.generatedTitle === (before.generated_title_json ?? null) &&
          after.generatedDescription ===
            (before.generated_description_json ?? null)
        )
          return false;
        await tx.run(
          `UPDATE capture_variants SET title = ?, title_source = ?, description = ?,
             generated_title_json = ?, generated_description_json = ?
           WHERE tenant_id = ? AND capture_id = ? AND id = ?`,
          [
            after.title,
            after.titleSource,
            after.description,
            after.generatedTitle,
            after.generatedDescription,
            ...key,
          ],
        );
        // What a reader reads moved with the texts of an image.
        await bumpRevision(tx, {
          tenantId,
          captureId: String(captureId ?? ""),
          by: "producer",
        });
        return true;
      });
      if (done) publishChange({ tenantId, domains: ["captures"] });
      return done;
    },

    /** A capture's row as stored (its metadata columns). */
    async captureRow(tenantId, captureId) {
      return (
        (
          await db.query(
            `SELECT * FROM captures WHERE id = ? AND tenant_id = ?
               AND ${captureSessionLiveSql()}`,
            [String(captureId ?? ""), tenantId],
          )
        ).rows[0] || null
      );
    },

    // ---- The revision and the conflict by field.

    /**
     * Moves the revision of a capture of the space and records the fields
     * (and acquisition lines) that changed, with the audit line, in one
     * transaction. `expected` makes the move a compare-and-swap. Answers the
     * new revision, or `null` (no such capture, or it moved meanwhile).
     */
    async touchCapture(
      tenantId,
      captureId,
      {
        fields = [],
        expected = null,
        by = null,
        userId = null,
        at = now(),
        originClientInstanceId = null,
      } = {},
    ) {
      const revision = await withSerializedSqliteRetry(db, (tx) =>
        bumpRevision(tx, {
          tenantId,
          captureId: String(captureId ?? ""),
          fields,
          expected,
          by,
          userId,
          at,
        }),
      );
      if (revision !== null)
        publishChange({
          tenantId,
          domains: ["captures"],
          originClientInstanceId,
        });
      return revision;
    },

    /**
     * The revision of the last change of a field of a capture, per line for
     * `acquisition`: `[{ line, revision }]` (`line` is `""` for the field as
     * a whole). A field never written has none.
     */
    async fieldRevisions(tenantId, captureId, field) {
      return (
        await db.query(
          `SELECT line_id, revision FROM capture_field_revisions
           WHERE tenant_id = ? AND capture_id = ? AND field = ?`,
          [tenantId, String(captureId ?? ""), field],
        )
      ).rows.map((row) => ({
        line: row.line_id,
        revision: Number(row.revision),
      }));
    },

    /**
     * The quality of a stacked image as a producer measured it
     * (`imageQuality`), written on the image, or cleared with `null`. Moves
     * the capture's revision when it changed anything. Answers whether an
     * image was written.
     */
    async writeVariantQuality(tenantId, captureId, variantId, quality) {
      const json = quality ? JSON.stringify(quality) : null;
      const done = await withSerializedSqliteRetry(db, async (tx) => {
        const before = (
          await tx.query(
            "SELECT quality_json FROM capture_variants WHERE tenant_id = ? AND capture_id = ? AND id = ?",
            [tenantId, String(captureId ?? ""), String(variantId ?? "")],
          )
        ).rows[0];
        if (!before) return false;
        if ((before.quality_json ?? null) === json) return true;
        await tx.run(
          "UPDATE capture_variants SET quality_json = ? WHERE tenant_id = ? AND capture_id = ? AND id = ?",
          [json, tenantId, String(captureId ?? ""), String(variantId ?? "")],
        );
        await bumpRevision(tx, {
          tenantId,
          captureId: String(captureId ?? ""),
          by: "producer",
        });
        return true;
      });
      if (done) publishChange({ tenantId, domains: ["captures"] });
      return done;
    },

    /**
     * What made an image, as its producer proposed it (`processing`:
     * `{ software?, steps?, source }`), written on the image, or cleared with
     * `null`. Moves nothing of the capture: the capture shows the steps of
     * its main image (`recordVariantProcessing`). Answers whether an image
     * was written.
     */
    async writeVariantProcessing(tenantId, captureId, variantId, processing) {
      const json = processing ? JSON.stringify(processing) : null;
      const done = await withSerializedSqliteRetry(db, async (tx) => {
        const key = [
          tenantId,
          String(captureId ?? ""),
          String(variantId ?? ""),
        ];
        const before = (
          await tx.query(
            "SELECT processing_json FROM capture_variants WHERE tenant_id = ? AND capture_id = ? AND id = ?",
            key,
          )
        ).rows[0];
        if (!before) return false;
        if ((before.processing_json ?? null) === json) return true;
        await tx.run(
          "UPDATE capture_variants SET processing_json = ? WHERE tenant_id = ? AND capture_id = ? AND id = ?",
          [json, ...key],
        );
        return true;
      });
      return done;
    },

    /** An image's row as stored (its texts and their origin). */
    async variantRow(tenantId, captureId, variantId) {
      return (
        (
          await db.query(
            "SELECT * FROM capture_variants WHERE tenant_id = ? AND capture_id = ? AND id = ?",
            [tenantId, String(captureId ?? ""), String(variantId ?? "")],
          )
        ).rows[0] || null
      );
    },

    /**
     * The stage of a capture (`draft` · `finalized`): the one function that
     * changes it. The passage « Brouillon » → « Finalisée » writes
     * `finalized_at` once, never cleared nor moved by a later passage (`at`,
     * the moment of the change).
     */
    async setStage(tenantId, captureId, stage, at = now()) {
      const written = await transitionStage(db, {
        tenantId,
        captureId,
        stage,
        at,
      });
      if (written) publishChange({ tenantId, domains: ["captures"] });
      return written;
    },

    /**
     * The owner's switch « Afficher la qualité en privé » / « Afficher la
     * qualité en public » of a capture (`audience`: `private` · `public`);
     * whether it was written.
     */
    async setQualityShown(tenantId, captureId, audience, shown) {
      const column =
        audience === "public"
          ? "quality_public"
          : audience === "private"
            ? "quality_private"
            : null;
      if (!column) return false;
      const result = await db.run(
        `UPDATE captures SET ${column} = ? WHERE id = ? AND tenant_id = ?`,
        [shown ? 1 : 0, String(captureId ?? ""), tenantId],
      );
      const written = result.rowCount === 1;
      if (written) publishChange({ tenantId, domains: ["captures"] });
      return written;
    },

    /**
     * The dimensions of an image, once the processing has read them;
     * written only while unknown.
     */
    async recordVariantDimensions(tenantId, sha256, { width, height }) {
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height))
        return false;
      const result = await db.run(
        "UPDATE capture_variants SET width = ?, height = ? WHERE tenant_id = ? AND sha256 = ? AND width IS NULL",
        [width, height, tenantId, sha256],
      );
      return result.rowCount === 1;
    },

    /**
     * The automatic check of one image (the check belongs to each
     * image). The main image's result is also the capture's.
     */
    async recordVariantCheck(
      tenantId,
      variantId,
      { result, reason, at },
      { onlyIfPending = false } = {},
    ) {
      oneOf(AUTOMATIC_RESULTS, result, "automatic check result");
      const row = (
        await db.query(
          "SELECT * FROM capture_variants WHERE tenant_id = ? AND id = ?",
          [tenantId, String(variantId ?? "")],
        )
      ).rows[0];
      if (!row) return false;
      if (Number(row.is_main) === 1)
        return await this.recordAutomaticCheck(
          tenantId,
          row.capture_id,
          { result, reason, at },
          { onlyIfPending },
        );
      const written = await db.run(
        `UPDATE capture_variants SET auto_check = ?, auto_check_reason = ?, auto_check_at = ?
         WHERE id = ?${onlyIfPending ? " AND auto_check IS NULL" : ""}`,
        [result, reason ?? null, at ?? now(), row.id],
      );
      return written.rowCount === 1;
    },

    /**
     * The alternative images whose automatic check has not run yet, every
     * space (or one), oldest first: `{ tenantId, captureId, variant }`.
     */
    async listPendingVariantChecks({ limit = 50, tenantId = null } = {}) {
      return (
        await db.query(
          `SELECT * FROM capture_variants
           WHERE is_main = 0 AND auto_check IS NULL${tenantId ? " AND tenant_id = ?" : ""}
           ORDER BY created_at ASC, id ASC
           LIMIT ?`,
          tenantId ? [tenantId, pageSize(limit)] : [pageSize(limit)],
        )
      ).rows.map((row) => ({
        tenantId: row.tenant_id,
        captureId: row.capture_id,
        variant: variantResource(row),
      }));
    },

    /**
     * Idempotent insert on the `(tenant_id, sha256)` unique index (migration
     * 17): a race is resolved by re-reading the row the other writer
     * committed rather than failing, per the task's explicit requirement.
     * When the capture already existed, `targetIds` are **unioned** onto its
     * stored list rather than replacing it or
     * creating a second row; `targetsAdded` counts how many were new. The
     * capture's `sessionId`/`planId` are never changed by a replay — only set
     * on the row's first creation.
     *
     * `sessionId` is validated for shape only by the caller. A dangling
     * `sessionId` is therefore only caught here, by the `session_id`
     * foreign key (migration 17); `planId` is pre-checked by the caller via
     * `findPlan`, so in practice the only foreign key this insert can still
     * fail on is `session_id`, and that failure is reported as
     * `session_not_found`.
     */
    async insertCaptureWithTargets({
      id,
      tenantId,
      sessionId = null,
      planId = null,
      targetIds = [],
      originalName,
      sha256,
      byteSize,
      status = "uploaded",
      // A device's upload is a draft; the web's is finalized.
      stage = "draft",
      // The source of its main image (`VARIANT_SOURCES`).
      source = null,
      variantId = randomUUID(),
      createdAt = now(),
      originClientInstanceId = null,
      // The image of a multi-night plan — its plan, and the nights,
      // totals and render it declares (`captures.plan_json`).
      projectId = null,
      plan = null,
    }) {
      oneOf(new Set(CAPTURE_STAGES), stage, "stage");
      const requestedTargets = [...new Set(targetIds)];
      if (requestedTargets.length > maxTargetsPerCapture)
        throw new CaptureRepositoryError(
          "invalid_request",
          `A capture may show at most ${maxTargetsPerCapture} targets.`,
        );
      let result;
      try {
        result = await db.transaction(async (tx) => {
          // The bytes may already be any image of the space — the main one
          // of a capture or an alternative one: that capture is the answer,
          // nothing is written but the targets.
          const held = (
            await tx.query(
              `SELECT c.* FROM capture_variants v JOIN captures c ON c.id = v.capture_id
               WHERE v.tenant_id = ? AND v.sha256 = ?`,
              [tenantId, sha256],
            )
          ).rows[0];
          const insert = held
            ? { rowCount: 0 }
            : await tx.run(
                `INSERT INTO captures
                   (id, tenant_id, session_id, plan_id, target_id, original_name, sha256, byte_size, status, stage, created_at, project_id, plan_json, quality_public)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                 ON CONFLICT(tenant_id, sha256) DO NOTHING`,
                [
                  id,
                  tenantId,
                  sessionId,
                  planId,
                  requestedTargets[0] || null,
                  originalName,
                  sha256,
                  byteSize,
                  status,
                  "draft",
                  createdAt,
                  projectId,
                  projectId && plan ? JSON.stringify(plan) : null,
                ],
              );
          const created = insert.rowCount === 1;
          // A capture is born a draft; a finalized one passes through the
          // one function that changes the stage (its `finalized_at`).
          if (created && stage !== "draft")
            await transitionStage(tx, {
              tenantId,
              captureId: id,
              stage,
              at: createdAt,
            });
          if (created)
            await tx.run(
              `INSERT INTO capture_variants
                 (id, capture_id, tenant_id, sha256, byte_size, original_name,
                  source, is_main, is_public, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?)`,
              [
                variantId,
                id,
                tenantId,
                sha256,
                byteSize,
                originalName,
                source,
                createdAt,
              ],
            );
          const row = created
            ? {
                id,
                tenant_id: tenantId,
                session_id: sessionId,
                plan_id: planId,
                target_id: requestedTargets[0] || null,
                original_name: originalName,
                sha256,
                byte_size: byteSize,
                status,
                stage,
                visibility: "private",
                finalized_at: stage === "finalized" ? createdAt : null,
                created_at: createdAt,
                project_id: projectId,
                plan_json: projectId && plan ? JSON.stringify(plan) : null,
              }
            : (held ??
              (
                await tx.query(
                  "SELECT * FROM captures WHERE tenant_id = ? AND sha256 = ?",
                  [tenantId, sha256],
                )
              ).rows[0]);

          const existingTargets = await targetsFor(tx, row.id);
          const existingSet = new Set(existingTargets);
          const newTargets = requestedTargets.filter(
            (targetId) => !existingSet.has(targetId),
          );
          if (existingTargets.length + newTargets.length > maxTargetsPerCapture)
            throw new CaptureRepositoryError(
              "invalid_request",
              `A capture may show at most ${maxTargetsPerCapture} targets.`,
            );
          let position = existingTargets.length;
          for (const targetId of newTargets) {
            await tx.run(
              "INSERT INTO capture_targets (capture_id, target_id, position) VALUES (?, ?, ?) ON CONFLICT(capture_id, target_id) DO NOTHING",
              [row.id, targetId, position],
            );
            position += 1;
          }
          // The default generic tag, from the first target.
          if (created || newTargets.length)
            await applyDefaultTag(
              tx,
              tenantId,
              row.id,
              created ? undefined : (existingTargets[0] ?? null),
            );
          // A replay that joins targets to a capture changes it.
          if (!created && newTargets.length)
            await bumpRevision(tx, {
              tenantId,
              captureId: row.id,
              fields: [{ field: "targetIds" }],
              by: "image",
              at: createdAt,
            });

          return {
            capture: toResource(
              !created && newTargets.length
                ? {
                    ...row,
                    revision: Number(row.revision ?? 1) + 1,
                  }
                : row,
              [...existingTargets, ...newTargets],
            ),
            created,
            deduplicated: !created,
            targetsAdded: newTargets.length,
          };
        });
      } catch (error) {
        if (error instanceof CaptureRepositoryError) throw error;
        if (
          /FOREIGN KEY|foreign key|violates foreign key/i.test(
            error?.message || "",
          )
        )
          throw new CaptureRepositoryError(
            "session_not_found",
            "The session was not found.",
            { status: 404 },
          );
        throw error;
      }
      // A fully deduplicated upload that added no new target wrote nothing.
      if (result.created || result.targetsAdded > 0)
        publishChange({
          tenantId,
          domains: ["captures"],
          originClientInstanceId,
        });
      return result;
    },

    /**
     * A single capture by id, tenant-scoped. `null` when the id does not
     * exist for this tenant: another space's capture never resolves.
     */
    async getCaptureById(tenantId, captureId) {
      const row = (
        await db.query(
          `SELECT * FROM captures WHERE id = ? AND tenant_id = ?
             AND ${captureSessionLiveSql()}`,
          [captureId, tenantId],
        )
      ).rows[0];
      if (!row) return null;
      return toResource(
        row,
        await targetsFor(db, row.id),
        await tagsFor(tenantId, row.id),
      );
    },

    /**
     * Paginated `GET /v1/captures`. `since` is inclusive against the later of
     * `created_at` and `restored_at` (`SYNC_AT_SQL`; ascending), matching every other `since` cursor in this contract
     * (api/v1.md, "Clocks, ordering and pagination"): a client may see a row
     * twice across pages and never misses one. `targetId`, when given,
     * restricts to captures whose `targetIds` contains it.
     * `skySolutionMissing` (`?skySolution=missing`) restricts to the captures whose main image has no sky solution,
     * whatever sent it.
     *
     * `order: "recent"` (`?order=recent`, the screens' reading): the **most
     * recent first** -- by the night of the capture (its plan's date, else
     * its session's day, else the day it was added), then by the moment it
     * was added -- so that a client that reads only the first pages keeps the
     * recent ones. Its cursor is `before` (the decoded `nextBefore` of the
     * previous page) and it is exact: no row twice, none missed. It has
     * nothing to do with `since`, which keeps the synchronisation's own
     * ascending reading of `createdAt`.
     */
    async listCaptures({
      tenantId,
      since = null,
      limit = 50,
      targetId = null,
      sessionId = null,
      skySolutionMissing = false,
      order = null,
      before = null,
    }) {
      const boundedLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
      const recent = order === "recent";
      // A capture still without an image is the web's definition; the
      // devices' list shows it from its first image. The captures of a session
      // in the trash are masked.
      const conditions = [
        "c.tenant_id = ?",
        "c.sha256 IS NOT NULL",
        captureSessionLiveSql("c"),
      ];
      const params = [tenantId];
      if (since) {
        conditions.push(`${SYNC_AT_SQL} >= ?`);
        params.push(since);
      }
      // The captures of one session (`?sessionId=`).
      if (sessionId) {
        conditions.push("c.session_id = ?");
        params.push(sessionId);
      }
      if (skySolutionMissing)
        conditions.push(
          `NOT EXISTS (SELECT 1 FROM capture_sky_solutions s
             JOIN capture_variants v ON v.id = s.image_id
             WHERE v.capture_id = c.id AND v.is_main = 1)`,
        );
      if (recent && before) {
        conditions.push(
          `(${RECENT_NIGHT_SQL} < ? OR (${RECENT_NIGHT_SQL} = ? AND (c.created_at < ? OR (c.created_at = ? AND c.id < ?))))`,
        );
        params.push(
          before.night,
          before.night,
          before.createdAt,
          before.createdAt,
          before.id,
        );
      }
      const join = targetId
        ? "JOIN capture_targets ct ON ct.capture_id = c.id AND ct.target_id = ?"
        : "";
      if (targetId) params.unshift(targetId);
      params.push(boundedLimit + 1);
      const rows = (
        await db.query(
          recent
            ? `SELECT DISTINCT c.*, ${RECENT_NIGHT_SQL} AS night_key FROM captures c
               ${join}
               WHERE ${conditions.join(" AND ")}
               ORDER BY night_key DESC, c.created_at DESC, c.id DESC
               LIMIT ?`
            : `SELECT DISTINCT c.*, ${SYNC_AT_SQL} AS sync_at FROM captures c
               ${join}
               WHERE ${conditions.join(" AND ")}
               ORDER BY sync_at ASC, c.id ASC
               LIMIT ?`,
          params,
        )
      ).rows;
      const hasMore = rows.length > boundedLimit;
      const page = hasMore ? rows.slice(0, boundedLimit) : rows;
      const captures = [];
      for (const row of page) {
        let lines = null;
        try {
          lines = row.acquisition_json
            ? JSON.parse(row.acquisition_json)
            : null;
        } catch {
          lines = null;
        }
        captures.push({
          ...toResource(
            row,
            await targetsFor(db, row.id),
            await tagsFor(tenantId, row.id),
          ),
          // What a card says without a second call — the capture's own
          // title, the summary of its own lines (`null` without one: the
          // service then reads the night's steps).
          title: row.title ?? null,
          acquisitionSummary: acquisitionSummaryOf(lines),
        });
      }
      if (recent) {
        const last = page.at(-1);
        return {
          captures,
          nextSince: null,
          nextBefore:
            hasMore && last
              ? encodeRecentCursor({
                  night: last.night_key,
                  createdAt: last.created_at,
                  id: last.id,
                })
              : null,
          hasMore,
        };
      }
      return {
        captures,
        nextSince: page.length ? page[page.length - 1].sync_at : null,
        hasMore,
      };
    },

    // ---- The tags of the galleries (`capture_tags`): the
    // owner's own tags, free text never normalised, read and written within
    // one space only. The public gallery never reads them.

    /** The tags of one capture of the space (`[]` when it has none or is not the space's). */
    async getCaptureTags(tenantId, captureId) {
      return await tagsFor(tenantId, String(captureId ?? ""));
    },

    /**
     * Replace the whole list of tags of one capture of the space: each tag
     * trimmed, the empty ones and the exact repetitions dropped, 40
     * characters at most each, 20 tags at most (`invalid_request`
     * otherwise, nothing written). Answers the list stored, in its reading
     * order, or `null` when the capture is not the space's.
     */
    async replaceCaptureTags(tenantId, captureId, tags) {
      const problem = captureTagsProblem(tags);
      if (problem)
        throw new CaptureRepositoryError(
          "invalid_request",
          problem === "not_a_list"
            ? "tags is a list of strings."
            : "A tag holds 40 characters at most, and a capture 20 tags at most.",
          { field: "tags" },
        );
      const stored = storedCaptureTags(tags);
      const id = String(captureId ?? "");
      const written = await db.transaction(async (tx) => {
        const owned = (
          await tx.query(
            "SELECT id FROM captures WHERE id = ? AND tenant_id = ?",
            [id, tenantId],
          )
        ).rows[0];
        if (!owned) return false;
        await tx.run(
          "DELETE FROM capture_tags WHERE capture_id = ? AND tenant_id = ?",
          [id, tenantId],
        );
        for (const tag of stored)
          await tx.run(
            "INSERT INTO capture_tags (capture_id, tenant_id, tag) VALUES (?, ?, ?)",
            [id, tenantId, tag],
          );
        return true;
      });
      if (!written) return null;
      publishChange({ tenantId, domains: ["captures"] });
      return stored;
    },

    /** Every distinct tag of the space's captures, in their reading order. */
    async listSpaceTags(tenantId) {
      return (
        await db.query(
          `SELECT DISTINCT t.tag FROM capture_tags t
           JOIN captures c ON c.id = t.capture_id
           WHERE t.tenant_id = ? AND ${captureSessionLiveSql("c")}`,
          [tenantId],
        )
      ).rows
        .map((row) => row.tag)
        .sort(compareCaptureTags);
    },

    /**
     * The tags of every capture of the space, in one read: a `Map` from a
     * capture's id to its tags in their reading order (absent: none).
     */
    async tagsByCapture(tenantId) {
      const byCapture = new Map();
      for (const row of (
        await db.query(
          "SELECT capture_id, tag FROM capture_tags WHERE tenant_id = ?",
          [tenantId],
        )
      ).rows) {
        const list = byCapture.get(row.capture_id) ?? [];
        list.push(row.tag);
        byCapture.set(row.capture_id, list);
      }
      for (const list of byCapture.values()) list.sort(compareCaptureTags);
      return byCapture;
    },

    // ---- The visibility and the two checks. These writes store
    // what they are given; who may write what (the owner, the check, the
    // team) and when is decided by the routes that call them. Each answers
    // whether a capture of that space was written.

    /** The owner's « Privée » / « Publique ». */
    async setVisibility(tenantId, captureId, visibility) {
      oneOf(VISIBILITIES, visibility, "visibility");
      // A variant is seen while it is public and its capture is; its own
      // flag is kept when the capture goes private and back.
      return await updateCapture(tenantId, captureId, {
        visibility,
        // The date a capture turns public is written once, as it goes from
        // private to public (a second « Publique » keeps it, even unknown);
        // it is cleared as the capture goes private.
        made_public_at:
          visibility === "public"
            ? {
                sql: "CASE WHEN visibility = 'public' THEN made_public_at ELSE ? END",
                params: [now()],
              }
            : null,
        // The owner chose; « redevenue privée » is no longer news.
        replaced_made_private: 0,
      });
    },

    /**
     * The result of the automatic check (`sky`, `undetermined`, `other`),
     * its machine reason (kept for the administration, never sent to the
     * owner) and its time. `onlyIfPending`: written only while the capture
     * has no result yet — the check runs once per capture, whichever
     * process or replica gets there first.
     */
    async recordAutomaticCheck(
      tenantId,
      captureId,
      { result, reason, at },
      { onlyIfPending = false } = {},
    ) {
      oneOf(AUTOMATIC_RESULTS, result, "automatic check result");
      const checkedAt = at ?? now();
      const written = await updateCapture(
        tenantId,
        captureId,
        {
          auto_check: result,
          auto_check_reason: reason ?? null,
          auto_check_at: checkedAt,
        },
        onlyIfPending ? "auto_check IS NULL" : "",
      );
      // The check belongs to the image; the capture's row repeats its main
      // image's.
      if (written)
        await db.run(
          `UPDATE capture_variants SET auto_check = ?, auto_check_reason = ?, auto_check_at = ?
           WHERE tenant_id = ? AND capture_id = ? AND is_main = 1`,
          [result, reason ?? null, checkedAt, tenantId, String(captureId)],
        );
      return written;
    },

    /**
     * The team's flag: `approved` or `refused`, with its time, a reason
     * (`not_sky`, `offensive`, `identifiable`, `other`) and a free note.
     * An approval clears the removal from the gallery (the
     * removal lasts until the team approves).
     */
    async recordTeamCheck(tenantId, captureId, { result, reason, note, at }) {
      oneOf(TEAM_RESULTS, result, "team check result");
      if (reason != null) oneOf(TEAM_REASONS, reason, "team check reason");
      return await updateCapture(tenantId, captureId, {
        admin_check: result,
        admin_check_at: at ?? now(),
        admin_check_reason: reason ?? null,
        admin_check_note: note ?? null,
        ...(result === "approved" ? { removed_from_gallery_at: null } : {}),
      });
    },

    /** « Demander une vérification »: when the owner asked. */
    async requestReview(tenantId, captureId, at = now()) {
      return await updateCapture(tenantId, captureId, {
        review_requested_at: at,
      });
    },

    /** The notice of a private capture that did not pass the check. */
    async recordProtectionNotice(tenantId, captureId, at = now()) {
      return await updateCapture(tenantId, captureId, {
        protection_notice_at: at,
      });
    },

    /**
     * The private protection lifted: accepted by the owner, or written
     * once the delay of the notice has passed.
     */
    async liftProtection(tenantId, captureId, at = now()) {
      return await updateCapture(tenantId, captureId, {
        protection_lifted_at: at,
      });
    },

    /** Removed from the public gallery after reports. */
    async removeFromGallery(tenantId, captureId, at = now()) {
      return await updateCapture(tenantId, captureId, {
        removed_from_gallery_at: at,
      });
    },

    /**
     * The captures whose automatic check has not run yet (`auto_check`
     * NULL), every space (or one, `tenantId`), oldest first: the work list
     * of the check. Each item names its space, so that the caller finds the
     * file.
     */
    async listPendingChecks({ limit = 50, tenantId = null } = {}) {
      const rows = (
        await db.query(
          `SELECT * FROM captures
           WHERE auto_check IS NULL AND sha256 IS NOT NULL
             AND ${captureSessionLiveSql()}${tenantId ? " AND tenant_id = ?" : ""}
           ORDER BY created_at ASC, id ASC
           LIMIT ?`,
          tenantId ? [tenantId, pageSize(limit)] : [pageSize(limit)],
        )
      ).rows;
      return await withTargets(rows);
    },

    /**
     * Forgets the automatic check of every image (every space, or one,
     * `tenantId`), so that the processing runs the rule in force again on
     * each of them: the capture's row and every image of `capture_variants`.
     * Nothing else of a capture changes (its visibility, the team's flag,
     * its reports). Answers how many captures and images were cleared.
     */
    async clearAutomaticChecks({ tenantId = null } = {}) {
      const where = tenantId ? " AND tenant_id = ?" : "";
      const values = tenantId ? [tenantId] : [];
      const captures = await db.run(
        `UPDATE captures SET auto_check = NULL, auto_check_reason = NULL, auto_check_at = NULL
         WHERE auto_check IS NOT NULL${where}`,
        values,
      );
      const images = await db.run(
        `UPDATE capture_variants SET auto_check = NULL, auto_check_reason = NULL, auto_check_at = NULL
         WHERE auto_check IS NOT NULL${where}`,
        values,
      );
      return {
        captures: Number(captures?.rowCount ?? 0),
        images: Number(images?.rowCount ?? 0),
      };
    },

    /**
     * The public captures of every space, newest first: `public`, not
     * removed from the gallery, not refused by the team. `before` is an
     * exclusive `{ createdAt, id }` cursor (the last item of the previous
     * page). Each item names its space; the gallery never shows it.
     */
    async listPublicCaptures({ limit = 50, before = null } = {}) {
      const bounded = pageSize(limit);
      const conditions = [
        "visibility = 'public'",
        "removed_from_gallery_at IS NULL",
        // An archived capture leaves every gallery.
        "archived_at IS NULL",
        "(admin_check IS NULL OR admin_check <> 'refused')",
        captureSessionLiveSql(),
      ];
      const params = [];
      if (before?.createdAt) {
        conditions.push("(created_at < ? OR (created_at = ? AND id < ?))");
        params.push(before.createdAt, before.createdAt, before.id ?? "");
      }
      params.push(bounded + 1);
      const rows = (
        await db.query(
          `SELECT * FROM captures
           WHERE ${conditions.join(" AND ")}
           ORDER BY created_at DESC, id DESC
           LIMIT ?`,
          params,
        )
      ).rows;
      const hasMore = rows.length > bounded;
      return {
        items: await withTargets(hasMore ? rows.slice(0, bounded) : rows),
        hasMore,
      };
    },
  };
}
