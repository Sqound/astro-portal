// The fixed vocabulary of the sample data: format, licence, the one public
// place every record is moved to, and the columns each table may carry. The
// exporter, the verifier and the installer all read this file, so a column or
// a rule that is not written here cannot travel.

import { spaceOrganizationCondition } from "portal/persistence/space-organizations.js";

export const FORMAT = "astro-portal-sample";
export const FORMAT_VERSION = 1;

export const LICENSE_ID = "CC-BY-4.0";
export const LICENSE_NAME = "Creative Commons Attribution 4.0 International";
export const LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";
// The signature of the example data: the product, never a person's
// name.
export const ATTRIBUTION = "PlanAstro";

/**
 * Where `install.mjs` reads the manifest of the image pack when it is not
 * given a local archive. Overridable with `--manifest-url`; the site publishes
 * the file (see docs/SAMPLE_DATA.md).
 */
export const DEFAULT_MANIFEST_URL =
  "https://www.planastro.space/samples/astro-portal-sample/latest.json";

/** The single folder every image of the pack lives under. */
export const PACK_ROOT = "astro-portal-sample";
export const packArchiveName = (version) =>
  `astro-portal-sample-images-v${version}.tar.gz`;
export const DEFAULT_MAX_PACK_BYTES = 200_000_000;
export const MAX_PACK_FILES = 5000;

/**
 * The only place the sample ever shows. Public values: the centre of the
 * department, rounded to a tenth of a degree, an elevation rounded to fifty
 * metres. No time zone (the rule of the repository for a place without one:
 * the night is computed from the longitude).
 */
export const SAMPLE_PLACE = Object.freeze({
  id: "sample-place-alpes-maritimes",
  version: 1,
  name: "Alpes-Maritimes (France)",
  locality: "Alpes-Maritimes (France)",
  latitude: "43.9",
  longitude: "7.1",
  elevation: "500",
  horizonStatus: "unverified",
});

export const EPOCH = "2026-01-01T00:00:00.000Z";

/**
 * Tables in the order they are inserted (parents first). Never `organizations`,
 * `users` or `memberships`: the sample has no account and no space of its own.
 * Its records carry two placeholder ids (see ids.mjs) that `install` replaces by
 * the space and the owner of the portal it installs into.
 */
export const RECORD_TABLES = Object.freeze([
  "equipment",
  "known_locations",
  "planner_contexts",
  "framings",
  "plans",
  "plan_items",
  "plan_framings",
  "observation_sessions",
  "session_events",
  "session_supplements",
  "session_analyses",
  "captures",
  "capture_targets",
  "capture_equipment",
  "target_media",
]);

/** Columns a record of each table may carry (a whitelist, never a blacklist). */
export const TABLE_COLUMNS = Object.freeze({
  equipment: [
    "id",
    "tenant_id",
    "equipment_type",
    "name",
    "manufacturer",
    "model",
    "specifications_json",
    "planner_json",
    "notes",
    "created_at",
    "updated_at",
    "archived_at",
    "preference_order",
    "is_binoculars",
  ],
  // `edited_at` (migration 70): the instant the rule of the most recent edit
  // reads; the sample's place is never deleted (no `deleted_at`).
  known_locations: [
    "id",
    "tenant_id",
    "client_id",
    "details_json",
    "created_at",
    "updated_at",
    "edited_at",
  ],
  planner_contexts: ["tenant_id", "details_json", "updated_at"],
  framings: [
    "id",
    "tenant_id",
    "created_by_user_id",
    "origin_device_id",
    "name",
    "revision",
    "catalogue_target_id",
    "center_ra",
    "center_dec",
    "angle_degrees",
    "payload_json",
    "archived_at",
    "deleted_at",
    "created_at",
    "updated_at",
  ],
  plans: [
    "id",
    "tenant_id",
    "created_by_user_id",
    "client_id",
    "plan_date",
    "name",
    "location_json",
    "equipment_json",
    "min_altitude",
    "created_at",
    "updated_at",
    "status",
    "archived_at",
    "settings_json",
    "revision",
    "night_end_at",
    "frozen_at",
    "payload_json",
    "deleted_at",
    "night_start_at",
    "night_bounds_resolved_at",
  ],
  plan_items: [
    "id",
    "tenant_id",
    "plan_id",
    "client_id",
    "details_json",
    "created_at",
    "updated_at",
  ],
  plan_framings: ["tenant_id", "plan_id", "framing_id"],
  observation_sessions: [
    "id",
    "tenant_id",
    "plan_id",
    "started_at",
    "finished_at",
    "status",
    "created_at",
    "client_session_id",
    "updated_at",
    "package_documents_json",
  ],
  session_events: [
    "event_id",
    "session_id",
    "type",
    "payload",
    "recorded_at",
    "received_at",
    "origin_device_id",
    "timing",
  ],
  session_supplements: [
    "id",
    "session_id",
    "origin_device_id",
    "payload",
    "status",
    "created_at",
    "decided_at",
    "event_ids_json",
    "payload_fingerprint",
  ],
  session_analyses: [
    "id",
    "tenant_id",
    "session_id",
    "report_version",
    "report_json",
    "created_at",
  ],
  captures: [
    "id",
    "tenant_id",
    "session_id",
    "plan_id",
    "target_id",
    "original_name",
    "sha256",
    "byte_size",
    "status",
    // A capture that was public in the source is public once installed
    // (`private` or `public`, migration 54).
    "visibility",
    "created_at",
  ],
  capture_targets: ["capture_id", "target_id", "position"],
  capture_equipment: [
    "id",
    "tenant_id",
    "capture_id",
    "equipment_id",
    "assignment_role",
    "created_at",
  ],
  target_media: [
    "id",
    "target_id",
    "variant",
    "metadata_json",
    "created_at",
    "updated_at",
  ],
});

/** Columns that hold JSON text, per table: scrubbed structurally on export. */
export const JSON_COLUMNS = Object.freeze({
  equipment: ["specifications_json", "planner_json"],
  known_locations: ["details_json"],
  planner_contexts: ["details_json"],
  framings: ["payload_json"],
  plans: ["location_json", "equipment_json", "settings_json", "payload_json"],
  plan_items: ["details_json"],
  observation_sessions: ["package_documents_json"],
  session_events: ["payload"],
  session_supplements: ["payload", "event_ids_json"],
  session_analyses: ["report_json"],
  target_media: ["metadata_json"],
});

/** Columns holding integers: PostgreSQL may return them as strings. */
export const INTEGER_COLUMNS = Object.freeze({
  equipment: ["preference_order", "is_binoculars"],
  framings: ["revision"],
  plans: ["revision"],
  session_analyses: ["report_version"],
  captures: ["byte_size"],
  capture_targets: ["position"],
});

/** Columns holding floating point numbers. */
export const REAL_COLUMNS = Object.freeze({
  framings: ["center_ra", "center_dec", "angle_degrees"],
  plans: ["min_altitude"],
});

/** Tables the record folder holds, plus the list of images. */
export const RECORD_FILES = Object.freeze([
  ...RECORD_TABLES.map((table) => `records/${table}.json`),
  "records/images.json",
]);

export const DOCUMENT_KINDS_KEPT = Object.freeze(["metric-log", "event-log"]);

/**
 * How many rows of `table` belong to a space. The default equipment is held
 * by the platform organisation, which is no one's space: a portal whose only
 * equipment is the default list is still empty, and the sample's own rows are
 * counted without it.
 */
export const recordCountSql = (table) =>
  table === "equipment"
    ? `SELECT COUNT(*) AS count FROM equipment WHERE ${spaceOrganizationCondition("tenant_id")}`
    : `SELECT COUNT(*) AS count FROM ${table}`;
