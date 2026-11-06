import { defaultEquipmentSeedSql } from "./default-equipment-seed.js";
import { telescopeCatalogueSeedSql } from "./telescope-catalogue-seed.js";
import { telescopeCatalogue2SeedSql } from "./telescope-catalogue-2-seed.js";
import { equipmentCatalogue4SeedSql } from "./equipment-catalogue-4-seed.js";
import { equipmentCatalogue5SeedSql } from "./equipment-catalogue-5-seed.js";
import { telescopeCatalogue3SeedSql } from "./telescope-catalogue-3-seed.js";
import { constellationKeySql } from "./constellation-key-seed.js";
import { defaultEquipmentMakerKindSql } from "./default-equipment-maker-kind-seed.js";

export type MigrationStatements = {
  common?: string;
  postgres?: string;
  sqlite?: string;
};

export type Migration = {
  name: string;
  statements: MigrationStatements;
  version: number;
  /**
   * SQLite only: the migration rebuilds a table other tables reference (the
   * only way SQLite drops a NOT NULL). The runner then follows SQLite's own
   * procedure: foreign keys off around the transaction, a
   * `PRAGMA foreign_key_check` before it commits, foreign keys back on.
   */
  sqliteRebuildsReferencedTable?: boolean;
};

/*
 * These definitions are intentionally self-contained. The async migration
 * runner owns the schema history independently of the retired synchronous
 * SQLite repository.
 *
 * SQLite REAL is an IEEE-754 double. PostgreSQL REAL is float4, which rounded
 * catalogue coordinates during the SQLite-to-PostgreSQL parity check. The two
 * affected DDL blocks therefore spell out PostgreSQL DOUBLE PRECISION columns
 * rather than applying a broad SQL rewrite at runtime.
 */
export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: "private-notebook-foundation",
    statements: {
      sqlite: `
        CREATE TABLE IF NOT EXISTS organizations (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
          created_at TEXT NOT NULL, disabled_at TEXT
        );
        CREATE TABLE IF NOT EXISTS memberships (
          id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES organizations(id),
          user_id TEXT NOT NULL REFERENCES users(id), role TEXT NOT NULL,
          created_at TEXT NOT NULL, UNIQUE(tenant_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS totp_credentials (
          user_id TEXT PRIMARY KEY REFERENCES users(id), encrypted_secret TEXT NOT NULL,
          verified_at TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS recovery_codes (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
          code_hash TEXT NOT NULL UNIQUE, used_at TEXT, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES organizations(id),
          user_id TEXT NOT NULL REFERENCES users(id), token_hash TEXT NOT NULL UNIQUE,
          csrf_hash TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL,
          last_seen_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS login_attempts (
          id TEXT PRIMARY KEY, identity_hash TEXT NOT NULL, ip_hash TEXT NOT NULL,
          succeeded INTEGER NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS bootstrap_enrollments (
          id TEXT PRIMARY KEY, email TEXT NOT NULL, password_hash TEXT NOT NULL,
          organization_name TEXT NOT NULL, encrypted_totp_secret TEXT NOT NULL,
          expires_at TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS known_locations (
          id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES organizations(id),
          client_id TEXT NOT NULL, details_json TEXT NOT NULL, created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL, UNIQUE(tenant_id, client_id)
        );
        CREATE TABLE IF NOT EXISTS plans (
          id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES organizations(id),
          created_by_user_id TEXT NOT NULL REFERENCES users(id), client_id TEXT NOT NULL,
          plan_date TEXT NOT NULL, name TEXT NOT NULL, location_json TEXT,
          equipment_json TEXT, min_altitude REAL, created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL, UNIQUE(tenant_id, client_id)
        );
        CREATE TABLE IF NOT EXISTS plan_items (
          id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES organizations(id),
          plan_id TEXT NOT NULL REFERENCES plans(id), client_id TEXT NOT NULL,
          details_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          UNIQUE(plan_id, client_id)
        );
        CREATE TABLE IF NOT EXISTS planner_imports (
          id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES organizations(id),
          source_hash TEXT NOT NULL, created_at TEXT NOT NULL,
          UNIQUE(tenant_id, source_hash)
        );
        CREATE TABLE IF NOT EXISTS audit_events (
          id TEXT PRIMARY KEY, tenant_id TEXT REFERENCES organizations(id),
          user_id TEXT REFERENCES users(id), event_type TEXT NOT NULL,
          details_json TEXT, created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions(token_hash);
        CREATE INDEX IF NOT EXISTS plans_tenant_updated_idx ON plans(tenant_id, updated_at);
        CREATE INDEX IF NOT EXISTS login_attempts_created_idx ON login_attempts(created_at);
      `,
      postgres: `
        CREATE TABLE IF NOT EXISTS organizations (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
          created_at TEXT NOT NULL, disabled_at TEXT
        );
        CREATE TABLE IF NOT EXISTS memberships (
          id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES organizations(id),
          user_id TEXT NOT NULL REFERENCES users(id), role TEXT NOT NULL,
          created_at TEXT NOT NULL, UNIQUE(tenant_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS totp_credentials (
          user_id TEXT PRIMARY KEY REFERENCES users(id), encrypted_secret TEXT NOT NULL,
          verified_at TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS recovery_codes (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
          code_hash TEXT NOT NULL UNIQUE, used_at TEXT, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES organizations(id),
          user_id TEXT NOT NULL REFERENCES users(id), token_hash TEXT NOT NULL UNIQUE,
          csrf_hash TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL,
          last_seen_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS login_attempts (
          id TEXT PRIMARY KEY, identity_hash TEXT NOT NULL, ip_hash TEXT NOT NULL,
          succeeded INTEGER NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS bootstrap_enrollments (
          id TEXT PRIMARY KEY, email TEXT NOT NULL, password_hash TEXT NOT NULL,
          organization_name TEXT NOT NULL, encrypted_totp_secret TEXT NOT NULL,
          expires_at TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS known_locations (
          id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES organizations(id),
          client_id TEXT NOT NULL, details_json TEXT NOT NULL, created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL, UNIQUE(tenant_id, client_id)
        );
        CREATE TABLE IF NOT EXISTS plans (
          id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES organizations(id),
          created_by_user_id TEXT NOT NULL REFERENCES users(id), client_id TEXT NOT NULL,
          plan_date TEXT NOT NULL, name TEXT NOT NULL, location_json TEXT,
          equipment_json TEXT, min_altitude DOUBLE PRECISION, created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL, UNIQUE(tenant_id, client_id)
        );
        CREATE TABLE IF NOT EXISTS plan_items (
          id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES organizations(id),
          plan_id TEXT NOT NULL REFERENCES plans(id), client_id TEXT NOT NULL,
          details_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          UNIQUE(plan_id, client_id)
        );
        CREATE TABLE IF NOT EXISTS planner_imports (
          id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES organizations(id),
          source_hash TEXT NOT NULL, created_at TEXT NOT NULL,
          UNIQUE(tenant_id, source_hash)
        );
        CREATE TABLE IF NOT EXISTS audit_events (
          id TEXT PRIMARY KEY, tenant_id TEXT REFERENCES organizations(id),
          user_id TEXT REFERENCES users(id), event_type TEXT NOT NULL,
          details_json TEXT, created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions(token_hash);
        CREATE INDEX IF NOT EXISTS plans_tenant_updated_idx ON plans(tenant_id, updated_at);
        CREATE INDEX IF NOT EXISTS login_attempts_created_idx ON login_attempts(created_at);
      `,
    },
  },
  {
    version: 2,
    name: "private-equipment-inventory",
    statements: {
      common: `
        CREATE TABLE IF NOT EXISTS equipment (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES organizations(id),
          equipment_type TEXT NOT NULL,
          name TEXT NOT NULL,
          manufacturer TEXT,
          model TEXT,
          specifications_json TEXT NOT NULL,
          planner_json TEXT NOT NULL,
          notes TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          archived_at TEXT
        );
        CREATE TABLE IF NOT EXISTS capture_equipment (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES organizations(id),
          capture_id TEXT NOT NULL,
          equipment_id TEXT NOT NULL REFERENCES equipment(id),
          created_at TEXT NOT NULL,
          UNIQUE(tenant_id, capture_id, equipment_id)
        );
        CREATE INDEX IF NOT EXISTS equipment_tenant_type_idx
          ON equipment(tenant_id, equipment_type, archived_at, name);
        CREATE INDEX IF NOT EXISTS capture_equipment_capture_idx
          ON capture_equipment(tenant_id, capture_id);
      `,
    },
  },
  {
    version: 3,
    name: "planner-horizon-profiles",
    statements: {
      common: `
        CREATE TABLE IF NOT EXISTS horizon_profiles (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES organizations(id),
          client_id TEXT NOT NULL,
          details_json TEXT NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(tenant_id, client_id)
        );
        CREATE INDEX IF NOT EXISTS horizon_profiles_tenant_updated_idx
          ON horizon_profiles(tenant_id, updated_at);
      `,
    },
  },
  {
    version: 4,
    name: "equipment-preference-order",
    statements: {
      common: `
        ALTER TABLE equipment ADD COLUMN preference_order INTEGER NOT NULL DEFAULT 0;
        CREATE INDEX IF NOT EXISTS equipment_tenant_preference_idx
          ON equipment(tenant_id, equipment_type, archived_at, preference_order, name);
      `,
    },
  },
  {
    version: 5,
    name: "equipment-binoculars",
    statements: {
      common: `
        ALTER TABLE equipment ADD COLUMN is_binoculars INTEGER NOT NULL DEFAULT 0;
      `,
    },
  },
  {
    version: 6,
    name: "capture-equipment-roles",
    statements: {
      common: `
        ALTER TABLE capture_equipment ADD COLUMN assignment_role TEXT NOT NULL DEFAULT 'main';
        CREATE INDEX IF NOT EXISTS capture_equipment_role_idx
        ON capture_equipment(tenant_id, capture_id, assignment_role);
      `,
    },
  },
  {
    version: 7,
    name: "planner-plan-lifecycle",
    statements: {
      common: `
        ALTER TABLE plans ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
        ALTER TABLE plans ADD COLUMN archived_at TEXT;
        CREATE INDEX IF NOT EXISTS plans_tenant_status_date_idx
          ON plans(tenant_id, status, plan_date);
      `,
    },
  },
  {
    version: 8,
    name: "application-logs",
    statements: {
      common: `
        CREATE TABLE IF NOT EXISTS application_logs (
          id TEXT PRIMARY KEY,
          tenant_id TEXT REFERENCES organizations(id),
          level TEXT NOT NULL,
          source TEXT NOT NULL,
          event_type TEXT NOT NULL,
          message TEXT NOT NULL,
          context_json TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS application_logs_created_idx
          ON application_logs(created_at DESC);
        CREATE INDEX IF NOT EXISTS application_logs_filter_idx
        ON application_logs(source, level, created_at DESC);
      `,
    },
  },
  {
    version: 9,
    name: "target-library-catalogue",
    statements: {
      sqlite: `
        CREATE TABLE IF NOT EXISTS target_catalogue_entries (
          id TEXT PRIMARY KEY,
          designation TEXT NOT NULL,
          aliases_json TEXT NOT NULL,
          common_names_json TEXT NOT NULL,
          type_key TEXT,
          constellation_key TEXT,
          ra_hours REAL,
          dec_degrees REAL,
          apparent_size_arcmin_json TEXT,
          magnitude REAL,
          surface_brightness REAL,
          catalogues_json TEXT NOT NULL,
          catalogue TEXT NOT NULL,
          dss_image_json TEXT,
          premium_image_json TEXT,
          visual_image_json TEXT,
          is_best INTEGER NOT NULL DEFAULT 0,
          is_extended INTEGER NOT NULL DEFAULT 0,
          editorial_json TEXT NOT NULL DEFAULT '{}',
          overrides_json TEXT NOT NULL DEFAULT '{}',
          source_json TEXT NOT NULL,
          source_present INTEGER NOT NULL DEFAULT 1,
          source_revision TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS target_catalogue_entries_designation_idx
          ON target_catalogue_entries(designation);
        CREATE INDEX IF NOT EXISTS target_catalogue_entries_selection_idx
          ON target_catalogue_entries(is_best, is_extended, source_present, designation);
        CREATE INDEX IF NOT EXISTS target_catalogue_entries_type_idx
          ON target_catalogue_entries(type_key, constellation_key, source_present);
        CREATE TABLE IF NOT EXISTS target_catalogue_state (
          id TEXT PRIMARY KEY,
          source_revision TEXT NOT NULL,
          revision INTEGER NOT NULL DEFAULT 0,
          synced_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `,
      postgres: `
        CREATE TABLE IF NOT EXISTS target_catalogue_entries (
          id TEXT PRIMARY KEY,
          designation TEXT NOT NULL,
          aliases_json TEXT NOT NULL,
          common_names_json TEXT NOT NULL,
          type_key TEXT,
          constellation_key TEXT,
          ra_hours DOUBLE PRECISION,
          dec_degrees DOUBLE PRECISION,
          apparent_size_arcmin_json TEXT,
          magnitude DOUBLE PRECISION,
          surface_brightness DOUBLE PRECISION,
          catalogues_json TEXT NOT NULL,
          catalogue TEXT NOT NULL,
          dss_image_json TEXT,
          premium_image_json TEXT,
          visual_image_json TEXT,
          is_best INTEGER NOT NULL DEFAULT 0,
          is_extended INTEGER NOT NULL DEFAULT 0,
          editorial_json TEXT NOT NULL DEFAULT '{}',
          overrides_json TEXT NOT NULL DEFAULT '{}',
          source_json TEXT NOT NULL,
          source_present INTEGER NOT NULL DEFAULT 1,
          source_revision TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS target_catalogue_entries_designation_idx
          ON target_catalogue_entries(designation);
        CREATE INDEX IF NOT EXISTS target_catalogue_entries_selection_idx
          ON target_catalogue_entries(is_best, is_extended, source_present, designation);
        CREATE INDEX IF NOT EXISTS target_catalogue_entries_type_idx
          ON target_catalogue_entries(type_key, constellation_key, source_present);
        CREATE TABLE IF NOT EXISTS target_catalogue_state (
          id TEXT PRIMARY KEY,
          source_revision TEXT NOT NULL,
          revision INTEGER NOT NULL DEFAULT 0,
          synced_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `,
    },
  },
  {
    version: 10,
    name: "initialization-data-and-target-relations",
    statements: {
      common: `
        CREATE TABLE IF NOT EXISTS static_data_documents (
          data_key TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          schema_version INTEGER NOT NULL,
          source_payload_json TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          source_revision TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          exported_at TEXT
        );
        CREATE TABLE IF NOT EXISTS static_data_exports (
          id TEXT PRIMARY KEY,
          package_revision TEXT NOT NULL,
          manifest_json TEXT NOT NULL,
          exported_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS static_data_exports_exported_idx
          ON static_data_exports(exported_at DESC);

        CREATE TABLE IF NOT EXISTS target_media (
          id TEXT PRIMARY KEY,
          target_id TEXT NOT NULL REFERENCES target_catalogue_entries(id),
          variant TEXT NOT NULL,
          metadata_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(target_id, variant)
        );
        CREATE INDEX IF NOT EXISTS target_media_target_idx
          ON target_media(target_id, variant);
        CREATE TABLE IF NOT EXISTS target_collections (
          id TEXT PRIMARY KEY,
          title_json TEXT NOT NULL,
          description_json TEXT NOT NULL,
          parent_collection_id TEXT REFERENCES target_collections(id),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS target_collection_memberships (
          collection_id TEXT NOT NULL REFERENCES target_collections(id),
          target_id TEXT NOT NULL REFERENCES target_catalogue_entries(id),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY(collection_id, target_id)
        );
        CREATE INDEX IF NOT EXISTS target_collection_memberships_target_idx
          ON target_collection_memberships(target_id, collection_id);
        CREATE TABLE IF NOT EXISTS target_catalogue_relation_state (
          id TEXT PRIMARY KEY,
          normalized_at TEXT NOT NULL
        );
      `,
    },
  },
  {
    version: 11,
    name: "target-catalogue-hemisphere-visibility",
    statements: {
      common: `
        ALTER TABLE target_catalogue_entries
          ADD COLUMN visible_from_northern_hemisphere INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE target_catalogue_entries
          ADD COLUMN visible_from_southern_hemisphere INTEGER NOT NULL DEFAULT 0;
        UPDATE target_catalogue_entries
        SET visible_from_northern_hemisphere =
              CASE WHEN dec_degrees >= -30 THEN 1 ELSE 0 END,
            visible_from_southern_hemisphere =
              CASE WHEN dec_degrees <= 30 THEN 1 ELSE 0 END;
        CREATE INDEX IF NOT EXISTS target_catalogue_entries_hemisphere_idx
          ON target_catalogue_entries(
            visible_from_northern_hemisphere,
            visible_from_southern_hemisphere,
            source_present,
            designation
          );
      `,
    },
  },
  {
    version: 12,
    name: "user-target-favorites",
    statements: {
      common: `
        CREATE TABLE IF NOT EXISTS user_target_favorites (
          user_id TEXT NOT NULL REFERENCES users(id),
          target_id TEXT NOT NULL REFERENCES target_catalogue_entries(id),
          created_at TEXT NOT NULL,
          PRIMARY KEY(user_id, target_id)
        );
        CREATE INDEX IF NOT EXISTS user_target_favorites_target_idx
          ON user_target_favorites(target_id, user_id);
      `,
    },
  },
  {
    version: 13,
    name: "user-target-favorite-modes",
    statements: {
      common: `
        CREATE TABLE IF NOT EXISTS user_target_favorite_modes (
          user_id TEXT NOT NULL REFERENCES users(id),
          target_id TEXT NOT NULL REFERENCES target_catalogue_entries(id),
          favorite_mode TEXT NOT NULL CHECK(favorite_mode IN ('photo', 'visual')),
          created_at TEXT NOT NULL,
          PRIMARY KEY(user_id, target_id, favorite_mode)
        );
        CREATE INDEX IF NOT EXISTS user_target_favorite_modes_target_idx
          ON user_target_favorite_modes(target_id, favorite_mode, user_id);
      `,
    },
  },
  {
    version: 14,
    name: "planner-night-context-and-complete-settings",
    statements: {
      common: `
        ALTER TABLE plans ADD COLUMN settings_json TEXT;
        CREATE TABLE IF NOT EXISTS planner_contexts (
          tenant_id TEXT PRIMARY KEY REFERENCES organizations(id),
          details_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `,
    },
  },
  {
    version: 15,
    name: "mobile-plan-resources-and-devices",
    // A legacy whole-document save can delete a plan that is absent from the
    // browser document. Version payloads must remain recoverable in that
    // case, so plan_versions.plan_id deliberately has no physical FK to plans.
    statements: {
      common: `
        ALTER TABLE plans ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE plans ADD COLUMN night_end_at TEXT;
        ALTER TABLE plans ADD COLUMN frozen_at TEXT;
        ALTER TABLE plans ADD COLUMN payload_json TEXT;
        CREATE INDEX IF NOT EXISTS plans_tenant_status_night_end_idx
          ON plans(tenant_id, status, night_end_at);

        CREATE TABLE IF NOT EXISTS device_tokens (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES organizations(id),
          user_id TEXT NOT NULL REFERENCES users(id),
          label TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL,
          last_seen_at TEXT,
          last_sync_at TEXT,
          revoked_at TEXT
        );
        CREATE INDEX IF NOT EXISTS device_tokens_tenant_sync_idx
          ON device_tokens(tenant_id, revoked_at, last_sync_at);

        CREATE TABLE IF NOT EXISTS device_pairings (
          code TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES organizations(id),
          user_id TEXT NOT NULL REFERENCES users(id),
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          claimed_at TEXT
        );
        CREATE INDEX IF NOT EXISTS device_pairings_expiry_idx
          ON device_pairings(expires_at);

        CREATE TABLE IF NOT EXISTS plan_versions (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES organizations(id),
          plan_id TEXT NOT NULL,
          revision INTEGER NOT NULL,
          state TEXT NOT NULL CHECK (state IN ('history', 'set_aside')),
          origin_device_id TEXT REFERENCES device_tokens(id),
          payload_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          purge_after TEXT
        );
        CREATE INDEX IF NOT EXISTS plan_versions_tenant_plan_state_idx
          ON plan_versions(tenant_id, plan_id, state, purge_after);
      `,
    },
  },
  {
    version: 16,
    name: "plan-soft-deletion",
    // A deleted plan keeps its row, its items and every retained version so
    // the retention doctrine holds and a set-aside version stays restorable.
    // Both protocols read plans through `deleted_at IS NULL`.
    statements: {
      common: `
        ALTER TABLE plans ADD COLUMN deleted_at TEXT;
        CREATE INDEX IF NOT EXISTS plans_tenant_deleted_idx
          ON plans(tenant_id, deleted_at);
      `,
    },
  },
  {
    version: 17,
    name: "observation-sessions-and-captures",
    // This table was first designed under the name
    // `sessions`, but migration 1 already created a `sessions` table for
    // web-portal cookie authentication (id/token_hash/csrf_hash/expires_at,
    // still read and written by authentication-repository.js). `CREATE TABLE
    // IF NOT EXISTS sessions (...)` would silently no-op against that
    // unrelated table instead of creating the observation-session columns, so
    // this migration uses `observation_sessions` — the product's
    // own term ("observation session") —
    // and every session_events/session_supplements/captures reference below
    // points at it.
    // tenant_id/origin_device_id foreign keys follow the same referential
    // convention already used by every other tenant- and device-scoped table
    // in this file (plans, plan_versions, device_tokens, ...).
    statements: {
      common: `
        CREATE TABLE IF NOT EXISTS observation_sessions (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES organizations(id),
          plan_id TEXT REFERENCES plans(id),
          started_at TEXT NOT NULL,
          finished_at TEXT,
          status TEXT NOT NULL DEFAULT 'open'
            CHECK (status IN ('open','paused','finished')),
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS observation_sessions_tenant_started_idx
          ON observation_sessions(tenant_id, started_at);
        CREATE INDEX IF NOT EXISTS observation_sessions_plan_idx
          ON observation_sessions(plan_id);

        CREATE TABLE IF NOT EXISTS session_events (
          event_id TEXT NOT NULL,
          session_id TEXT NOT NULL REFERENCES observation_sessions(id),
          type TEXT NOT NULL,
          payload TEXT NOT NULL,
          recorded_at TEXT NOT NULL,
          received_at TEXT NOT NULL,
          origin_device_id TEXT REFERENCES device_tokens(id),
          PRIMARY KEY (session_id, event_id)
        );
        CREATE INDEX IF NOT EXISTS session_events_session_received_idx
          ON session_events(session_id, received_at);

        CREATE TABLE IF NOT EXISTS session_supplements (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES observation_sessions(id),
          origin_device_id TEXT REFERENCES device_tokens(id),
          payload TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'proposed'
            CHECK (status IN ('proposed','accepted','dismissed')),
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS session_supplements_session_status_idx
          ON session_supplements(session_id, status);

        CREATE TABLE IF NOT EXISTS captures (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES organizations(id),
          session_id TEXT REFERENCES observation_sessions(id),
          plan_id TEXT REFERENCES plans(id),
          target_id TEXT,
          original_name TEXT NOT NULL,
          sha256 TEXT NOT NULL,
          byte_size INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'draft'
            CHECK (status IN ('draft','uploaded')),
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS captures_tenant_created_idx
          ON captures(tenant_id, created_at);
        CREATE UNIQUE INDEX IF NOT EXISTS captures_tenant_sha256_idx
          ON captures(tenant_id, sha256);
      `,
    },
  },
  {
    version: 18,
    name: "capture-target-associations",
    // Added after migration 17 was already merged (and
    // possibly already applied on a dev database): one capture may show
    // several targets (a wide field, a mosaic pane), so it is never
    // duplicated to attach a second one. This migration only adds the join
    // table; migration 17's `captures.target_id` column is untouched and
    // keeps holding the first target for a simple read
    // — the join table below is the source of truth for the full list.
    // `position` preserves the caller's order (0-based, insertion order,
    // never reordered by a later union) so `GET /v1/captures` can render
    // `targetIds` deterministically without an ORDER BY on anything but this
    // column.
    statements: {
      common: `
        CREATE TABLE IF NOT EXISTS capture_targets (
          capture_id TEXT NOT NULL REFERENCES captures(id),
          target_id TEXT NOT NULL,
          position INTEGER NOT NULL,
          PRIMARY KEY (capture_id, target_id)
        );
        CREATE INDEX IF NOT EXISTS capture_targets_target_idx
          ON capture_targets(target_id);
      `,
    },
  },
  {
    version: 19,
    name: "plan-night-bounds-and-observation-session-idempotency",
    // First half. Version 18 is reserved for the uploads/captures migration
    // (packages/astro-contracts/schemas/api/v1.md, "Uploads and captures") and
    // is intentionally skipped here rather than reused.
    //
    // plans.night_start_at is the missing half of migration 15's
    // night_end_at: every earlier row already carries night_end_at = NULL,
    // written literally by planner-state-repository.js. night_bounds_resolved_at
    // is the "resolved to null" marker api/v1.md's "The night boundaries of a
    // plan" section calls for: it is set on EVERY plan write from here on,
    // whatever the two boundaries come out to be, so the lazy debrief-queue
    // catch-up (GET /v1/plans/debrief-queue) can find exactly the earlier rows
    // it still needs to resolve (`night_bounds_resolved_at IS NULL`) without
    // ever re-deriving a plan this migration, or a later write, already settled
    // — frozen or not.
    //
    // observation_sessions gains the two idempotency keys api/v1.md's
    // "Starting an observation session" requires: at most one session per
    // plan (a partial unique index, since a direct session's plan_id is
    // NULL and NULLs never collide under a plain UNIQUE constraint anyway —
    // the WHERE clause just says so), and a caller-supplied clientSessionId
    // for a direct session's own idempotent retry. updated_at is the
    // resource's own high-water mark ("Clocks, ordering and pagination"):
    // the latest of its creation, its finish, and the receivedAt of its
    // newest event or supplement, maintained by the application on every
    // write that touches a session (it is kept current through creation, event
    // ingestion and finish; the session-supplements write path must keep
    // bumping it the same way).
    //
    // session_events.timing is the additive, server-set field
    // session-event-ingest.schema.json's $defs.timing describes: observed
    // for every event a client submits through POST /v1/sessions/{id}/events,
    // planned/reconstructed for the events generated from a debrief or an
    // accepted supplement.
    statements: {
      common: `
        ALTER TABLE plans ADD COLUMN night_start_at TEXT;
        ALTER TABLE plans ADD COLUMN night_bounds_resolved_at TEXT;
        CREATE INDEX IF NOT EXISTS plans_tenant_status_night_bounds_idx
          ON plans(tenant_id, status, night_bounds_resolved_at);

        ALTER TABLE observation_sessions ADD COLUMN client_session_id TEXT;
        ALTER TABLE observation_sessions ADD COLUMN updated_at TEXT;
        UPDATE observation_sessions SET updated_at = COALESCE(finished_at, created_at)
          WHERE updated_at IS NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS observation_sessions_tenant_plan_idx
          ON observation_sessions(tenant_id, plan_id) WHERE plan_id IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS observation_sessions_tenant_client_session_idx
          ON observation_sessions(tenant_id, client_session_id) WHERE client_session_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS observation_sessions_tenant_updated_idx
          ON observation_sessions(tenant_id, updated_at);

        ALTER TABLE session_events ADD COLUMN timing TEXT;
      `,
    },
  },
  {
    version: 20,
    name: "debrief-and-session-supplement-idempotency",
    // Second half.
    //
    // session_supplements gains the three columns
    // observation-session-repository.js already read defensively
    // (supplementResourceForRow's own comment names this exact migration):
    // decided_at/event_ids_json record a decision (accept/dismiss), and
    // payload_fingerprint is the idempotency key api/v1.md's "Late field
    // data: session supplements" needs but does not name outright — the most
    // sober key is "a fingerprint of the payload, scoped by session and
    // origin device", over e.g. a client-supplied idempotency token (no
    // surface generates one for this path) or the raw payload itself (large,
    // and canonical-JSON equality is exactly what a fingerprint already gives
    // at a fixed width). The unique index makes "the exact same payload
    // resubmitted by the same device" collapse onto one row via ON CONFLICT
    // DO NOTHING, the same idiom observation_sessions_tenant_plan_idx already
    // uses for session creation. It is a plain (non-partial) unique index:
    // origin_device_id is always populated on this path (PUT
    // /v1/plans/{planId} only accepts a paired-device bearer), so the
    // SQLite/PostgreSQL rule that NULLs never collide under a UNIQUE index
    // never applies to a real row here.
    statements: {
      common: `
        ALTER TABLE session_supplements ADD COLUMN decided_at TEXT;
        ALTER TABLE session_supplements ADD COLUMN event_ids_json TEXT;
        ALTER TABLE session_supplements ADD COLUMN payload_fingerprint TEXT;
        CREATE UNIQUE INDEX IF NOT EXISTS session_supplements_idempotency_idx
          ON session_supplements(session_id, origin_device_id, payload_fingerprint);
      `,
    },
  },
  {
    version: 21,
    name: "plan-versions-monotonic-tiebreak",
    // planner-state-repository.js's latestPreservedPlanVersion and
    // debrief-repository.js's queue() both picked "the most recent"
    // plan_versions row with `ORDER BY created_at DESC, id DESC`. `id` is a
    // randomUUID(): whenever two rows share the same `created_at` (the
    // column is an ISO-8601 string with millisecond resolution — a history
    // row archived by the write that *won* a conflict and a set-aside row
    // archived by the write that *lost* the very same conflict share both
    // `created_at` and `revision`, and share `created_at` with each other
    // even more easily) the `id` tiebreak picks between them at random
    // instead of by write order. Proven directly: tests/
    // planner-state-repository.test.mjs's "latestPreservedPlanVersion picks
    // the version written last..." forces that exact tie and, against the
    // pre-migration query, landed on the wrong (not-most-recent) row
    // roughly half the time.
    //
    // `revision` alone cannot replace `id` as the tiebreak, for the reason
    // above (a winning write's history row and a losing write's set-aside
    // row from the same conflict can share both `created_at` and
    // `revision`). What both call sites actually want is insertion order,
    // which every row already has for free: SQLite's implicit `rowid` on
    // this ordinary (non-WITHOUT-ROWID) table already is that monotonic
    // order, so it needs no new column there. PostgreSQL has no equivalent
    // system column safe to sort by (`ctid` moves under vacuum/repack), so
    // `seq` gives it a real one — a single sequence-backed column, no
    // trigger required (the migration runner splits a statement block on
    // every `;`, so a trigger body is not an option here).
    //
    // The covering index matches the WHERE/ORDER BY prefix both call sites
    // share (tenant_id, plan_id, revision, created_at), keeping "the most
    // recent preserved version" and the debrief queue's set-aside lookup an
    // index scan instead of a full table scan. PostgreSQL's index also
    // covers the new `seq` tiebreak column; SQLite refuses an index that
    // names `rowid` explicitly ("no such column: rowid" — its manual says
    // the rowid alias cannot be indexed that way), which needs no
    // workaround here: the handful of rows actually tied on (revision,
    // created_at) get their rowid tiebreak from a plain in-memory sort.
    statements: {
      postgres: `
        ALTER TABLE plan_versions ADD COLUMN seq BIGSERIAL;
        CREATE INDEX IF NOT EXISTS plan_versions_tenant_plan_revision_idx
          ON plan_versions(tenant_id, plan_id, revision DESC, created_at DESC, seq DESC);
      `,
      sqlite: `
        CREATE INDEX IF NOT EXISTS plan_versions_tenant_plan_revision_idx
          ON plan_versions(tenant_id, plan_id, revision, created_at);
      `,
    },
  },
  {
    version: 22,
    name: "independent-framings",
    // A framing becomes an account-wide entity instead of living inside
    // `plans.payload_json`/`plan_items.details_json`. This is a SCHEMA-ONLY
    // migration — no existing plan or item is read or rewritten (no data
    // migration; the test data is reset separately). An item written before
    // this migration keeps its `target.framing` content unmoved and is read
    // as an ordinary frozen target: it is never migrated into this
    // table and never referenced by `plan_framings`.
    //
    // `framings.deleted_at` follows the same soft-deletion convention as
    // `plans.deleted_at`: a deleted row keeps its identity and its
    // `plan_framings` history so a stale write still conflicts against
    // something, exactly as a deleted plan does today.
    //
    // `plan_framings` has no surrogate id: `(plan_id, framing_id)` is already
    // the natural key a plan write replaces wholesale (mirroring
    // `replacePlanItems`'s delete-then-insert), and the index on
    // `(tenant_id, framing_id)` is what `framingUsage` scans to find every
    // plan currently referencing one framing.
    statements: {
      common: `
        CREATE TABLE IF NOT EXISTS framings (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES organizations(id),
          created_by_user_id TEXT REFERENCES users(id),
          origin_device_id TEXT REFERENCES device_tokens(id),
          name TEXT NOT NULL,
          revision INTEGER NOT NULL DEFAULT 1,
          catalogue_target_id TEXT,
          center_ra REAL NOT NULL,
          center_dec REAL NOT NULL,
          angle_degrees REAL NOT NULL DEFAULT 0,
          payload_json TEXT NOT NULL,
          archived_at TEXT,
          deleted_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS framings_tenant_deleted_idx
          ON framings(tenant_id, deleted_at);
        CREATE TABLE IF NOT EXISTS plan_framings (
          tenant_id TEXT NOT NULL REFERENCES organizations(id),
          plan_id TEXT NOT NULL REFERENCES plans(id),
          framing_id TEXT NOT NULL REFERENCES framings(id),
          PRIMARY KEY (plan_id, framing_id)
        );
        CREATE INDEX IF NOT EXISTS plan_framings_tenant_framing_idx
          ON plan_framings(tenant_id, framing_id);
      `,
    },
  },
  {
    version: 25,
    name: "resumable-upload-sessions",
    // The resumable replacement transport for `POST /v1/uploads` (api/v1.md "Uploads and
    // captures"; the full protocol is `api/uploads.md`). One row tracks one
    // in-flight content-addressed transfer, keyed the same way `captures`
    // already is: `(tenant_id, sha256)` is UNIQUE, so re-creating an upload
    // for bytes already mid-transfer or already finalized always finds the
    // same row rather than starting a second, competing transfer of the
    // same content — the create handler's idempotency, not a database
    // accident.
    //
    // `part_path` is written once at creation
    // (`uploads/capture-storage.js`'s `uploadPartPathFor`, deterministic
    // from `tenant_id`/`id`) and never recomputed from anywhere else; it is
    // a stored value, not a derived one, so a future storage-layout change
    // only has to change how new rows are written, never how old ones are
    // read. `offset_bytes` is this table's own cache of how many bytes have
    // been durably appended to that file; every read path (status, PUT,
    // finalize) reconciles it against the part file's actual size on disk
    // before trusting it, so a crash between a chunk write and this row's
    // update self-heals on the next request instead of drifting silently.
    //
    // `target_ids_json` mirrors migration 18's `capture_targets` in content
    // but not in shape: a join table's per-tenant scan
    // (`GET /v1/captures?targetId=`) has no equivalent need here, since an
    // upload session is looked up only by its own id or by
    // `(tenant_id, sha256)` — a single JSON column avoids a second table
    // for state that is only ever read and written as one unit, and is
    // discarded the moment `finalize` unions it onto `capture_targets`
    // through the existing `insertCaptureWithTargets`.
    //
    // `capture_id` is set only once `finalize` succeeds (`state` becomes
    // `completed`); it is what lets a later `POST /v1/uploads` for the same
    // `(tenant_id, sha256)` answer `completed: true` with the same
    // `captureId` without a second query against `captures`. A completed
    // row is deliberately not subject to the 72-hour expiry below — it is a
    // small, permanent idempotency record once a capture exists, exactly
    // like `captures.sha256` itself never expires. `expires_at` is
    // meaningful only while `state = 'in_progress'`;
    // `upload_sessions_expires_idx` is the purge sweep's own access path
    // (`upload-session-repository.js`'s `purgeExpired`).
    statements: {
      common: `
        CREATE TABLE IF NOT EXISTS upload_sessions (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES organizations(id),
          sha256 TEXT NOT NULL,
          byte_size INTEGER NOT NULL,
          content_type TEXT,
          session_id TEXT REFERENCES observation_sessions(id),
          plan_id TEXT REFERENCES plans(id),
          target_ids_json TEXT NOT NULL DEFAULT '[]',
          original_name TEXT NOT NULL,
          offset_bytes INTEGER NOT NULL DEFAULT 0,
          chunk_size INTEGER NOT NULL,
          state TEXT NOT NULL DEFAULT 'in_progress'
            CHECK (state IN ('in_progress','completed')),
          part_path TEXT NOT NULL,
          capture_id TEXT REFERENCES captures(id),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          expires_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS upload_sessions_tenant_sha256_idx
          ON upload_sessions(tenant_id, sha256);
        CREATE INDEX IF NOT EXISTS upload_sessions_expires_idx
          ON upload_sessions(state, expires_at);
      `,
    },
  },
  {
    version: 26,
    name: "session-package-imports",
    // The contract is `packages/astro-contracts/schemas/session-package/`:
    // the idempotency ledger `POST /v1/sessions/{id}/imports/confirm`
    // reads and writes. `UNIQUE(tenant_id, manifest_sha256)` is the whole
    // mechanism of the rule "idempotency is keyed on the manifest", at the
    // database level, exactly like migration 17's
    // `captures_tenant_sha256_idx` already keys byte-identical uploads on
    // `(tenant_id, sha256)`: a manifest fingerprint may be confirmed at most
    // once per tenant, ever, regardless of which session it names — a
    // second confirm of the same bytes finds this row and replays its
    // result rather than writing a second one. `session_id` records which
    // session the one-and-only confirm actually attached the package to,
    // for `GET`-style reads; it is never updated afterwards.
    //
    // `asset_count`/`bytes` cache the confirmed summary so a replay can
    // answer without re-deriving it from the manifest (which the caller may
    // not even resend identically-formatted, only byte-identical) or from a
    // second table scan.
    //
    // Metric/event/other assets are not captures (see
    // `session-package/manifest.js`'s own comment on `DOCUMENT_KINDS`) and
    // therefore have no row of their own here or in `captures`; they are
    // small documents attached directly to `observation_sessions` via the
    // new nullable `package_documents_json` column below, on the same
    // "one JSON column, not a second table" precedent migration 25's own
    // comment already gives for `upload_sessions.target_ids_json`.
    statements: {
      common: `
        CREATE TABLE IF NOT EXISTS session_package_imports (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES organizations(id),
          session_id TEXT NOT NULL REFERENCES observation_sessions(id),
          manifest_sha256 TEXT NOT NULL,
          imported_at TEXT NOT NULL,
          asset_count INTEGER NOT NULL,
          bytes INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS session_package_imports_tenant_manifest_idx
          ON session_package_imports(tenant_id, manifest_sha256);
        CREATE INDEX IF NOT EXISTS session_package_imports_session_idx
          ON session_package_imports(session_id);

        ALTER TABLE observation_sessions ADD COLUMN package_documents_json TEXT;
      `,
    },
  },
  {
    version: 27,
    name: "publications",
    // Retired by migration 54, which drops both tables.
    //
    // A publication is the private→public boundary ("selected outputs
    // become a gallery publication"). It never stores presentation data of its
    // own — no location, no raw path, no equipment label — only a title, a
    // visibility, and an ordered pointer list into `captures`; every other
    // field the public view model shows (target name, acquisition summary,
    // equipment names, integration totals) is derived at read time by the
    // view-model builder in `packages/portal/src/publications/`, joining
    // through the tenant's own already-private tables, and is never
    // duplicated onto this row. This is why the table is intentionally this
    // narrow — the plan's own SQL block, reproduced verbatim.
    //
    // `slug` is the unguessable public identifier a `visibility: 'unlisted'`
    // publication is reached by (22+ random base64url characters) — never the
    // publication's own `id`, which is never exposed to a reader, public or
    // not, exactly like `tenant_id` never is. It is UNIQUE across every
    // tenant (a slug collision would let one tenant's publication shadow
    // another's), generated by the repository, never client-chosen.
    //
    // `visibility` defaults to `'private'`: every publication is born
    // unpublished, and only an explicit later write ever changes it — the
    // structural half of the "no code path publishes automatically" rule,
    // which an integration test also proves. `published_at` stays
    // NULL until the first time a write moves `visibility` away from
    // `'private'`, and is never cleared again by a later downgrade: it
    // records "was this ever made external", not "is it external now",
    // which `visibility` alone already answers.
    //
    // `publication_items.position` is the display order within one
    // publication; `PRIMARY KEY (publication_id, capture_id)` keeps one
    // capture from being listed twice in the same publication while still
    // letting the same capture appear in several different publications
    // (a capture is never "consumed" by publishing it). Deleting a
    // publication's rows here is the caller's job (no ON DELETE CASCADE):
    // the repository always deletes items before the publication itself,
    // inside one transaction, the same discipline migration 17's own
    // `session_events`/`captures` pair already leaves to its repository.
    statements: {
      common: `
        CREATE TABLE IF NOT EXISTS publications (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES organizations(id),
          slug TEXT NOT NULL UNIQUE,
          visibility TEXT NOT NULL DEFAULT 'private'
            CHECK (visibility IN ('private','members','unlisted','public')),
          title TEXT NOT NULL,
          published_at TEXT,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS publications_tenant_updated_idx
          ON publications(tenant_id, updated_at);
        CREATE INDEX IF NOT EXISTS publications_visibility_idx
          ON publications(visibility);

        CREATE TABLE IF NOT EXISTS publication_items (
          publication_id TEXT NOT NULL REFERENCES publications(id),
          capture_id TEXT NOT NULL REFERENCES captures(id),
          position INTEGER NOT NULL,
          PRIMARY KEY (publication_id, capture_id)
        );
      `,
    },
  },
  // Version 27 is reserved for a parallel change (`analysis::siril`) developed
  // from the same base commit; this migration was assigned 28 directly rather
  // than risk a version collision with it.
  {
    version: 28,
    name: "session-analyses",
    // The contract is `packages/astro-contracts/schemas/api/session-analysis.schema.json`,
    // `v1.md` "Session analyses", checkpoint): `POST /v1/sessions/{id}/
    // analyses` never overwrites -- each accepted report is a new,
    // immutable version, so there is no update statement anywhere for this
    // table, only inserts and reads. `UNIQUE(session_id, version)` is the
    // whole mechanism (a session id already belongs to exactly one tenant,
    // so this alone also prevents a cross-tenant collision); the
    // repository computes the next `version` as `MAX(version) + 1` inside
    // one transaction and relies on this constraint plus `ON CONFLICT ...
    // DO NOTHING` to retry on a rare concurrent-write race, on the same
    // idiom migration 26's own `session_package_imports` already uses for
    // its own idempotent insert.
    //
    // `report_json` is the exact canonical-JSON bytes the core crate's
    // `analysis::report::render_report_json` produced (or an equivalent
    // byte-for-byte-different-but-schema-valid JSON body from any other
    // producer against the public contract) -- stored as `TEXT`, not a
    // dialect-specific `JSONB` column, so a read returns the identical
    // string on both SQLite and PostgreSQL rather than a driver-parsed
    // object on one and a string on the other.
    statements: {
      common: `
        CREATE TABLE IF NOT EXISTS session_analyses (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES organizations(id),
          session_id TEXT NOT NULL REFERENCES observation_sessions(id),
          version INTEGER NOT NULL,
          report_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE(session_id, version)
        );
        CREATE INDEX IF NOT EXISTS session_analyses_tenant_session_idx
          ON session_analyses(tenant_id, session_id);
      `,
    },
  },
  {
    version: 29,
    name: "users-without-password",
    // The space sign-in: on a server that opens spaces a person
    // signs in with a code sent to their address and has no password, so
    // `users.password_hash` may be NULL. A private server keeps writing a
    // password hash at its initialisation, exactly as before.
    //
    // PostgreSQL drops the constraint in place. SQLite cannot: its own
    // procedure rebuilds the table, with foreign keys switched off by the
    // runner around the transaction (`sqliteRebuildsReferencedTable`),
    // since every private table references `users(id)`. The columns are
    // those of migration 1; no later migration altered `users`.
    sqliteRebuildsReferencedTable: true,
    statements: {
      postgres: `
        ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
      `,
      sqlite: `
        CREATE TABLE users_rebuilt (
          id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT,
          created_at TEXT NOT NULL, disabled_at TEXT
        );
        INSERT INTO users_rebuilt (id, email, password_hash, created_at, disabled_at)
          SELECT id, email, password_hash, created_at, disabled_at FROM users;
        DROP TABLE users;
        ALTER TABLE users_rebuilt RENAME TO users;
      `,
    },
  },
  {
    version: 30,
    name: "sign-in-codes",
    // A code of six digits sent by e-mail. Neither the code
    // nor the token of the link of its message is stored: only their
    // HMAC-SHA-256 under a key of the service (`code_hash`,
    // `link_token_hash`). `sent_at` stays NULL until the sending service
    // accepted the message: a row whose message failed is deleted, and only
    // sent rows count towards the limits or can be verified. A row stops
    // being valid when it expires, is used (`consumed_at`) or is voided
    // (`voided_at`: a newer message, or too many attempts). `origin_hash`
    // is the keyed digest of the network origin that asked for it.
    statements: {
      common: `
        CREATE TABLE IF NOT EXISTS sign_in_codes (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          code_hash TEXT NOT NULL,
          link_token_hash TEXT NOT NULL UNIQUE,
          language TEXT NOT NULL,
          origin_hash TEXT NOT NULL,
          created_at TEXT NOT NULL,
          sent_at TEXT,
          expires_at TEXT NOT NULL,
          consumed_at TEXT,
          voided_at TEXT
        );
        CREATE INDEX IF NOT EXISTS sign_in_codes_email_idx
          ON sign_in_codes(email, sent_at);
        CREATE INDEX IF NOT EXISTS sign_in_codes_origin_idx
          ON sign_in_codes(origin_hash, sent_at);
      `,
    },
  },
  {
    version: 31,
    name: "sign-in-throttles",
    // The counters of the sign-in limits, one row per subject: an address
    // (its failed codes and its wait after five of them) or a network
    // origin (its failed verifications within the hour). `subject_hash` is
    // a keyed digest; the address itself is never a key here. A window
    // starts at its first failure and ends one hour later.
    statements: {
      common: `
        CREATE TABLE IF NOT EXISTS sign_in_throttles (
          subject_hash TEXT PRIMARY KEY,
          failures INTEGER NOT NULL DEFAULT 0,
          window_started_at TEXT,
          locked_until TEXT,
          updated_at TEXT NOT NULL
        );
      `,
    },
  },
  {
    version: 32,
    name: "service-administration-role",
    // On a server that opens spaces every person owns their own space, so
    // owning a space no longer means administering the service. `service_role` is
    // `administrator` for a space created by an address the service names
    // as an administrator (ASTRO_PORTAL_SERVICE_ADMIN_EMAILS), NULL
    // otherwise. A private server does not read it.
    statements: {
      common: `
        ALTER TABLE users ADD COLUMN service_role TEXT;
      `,
    },
  },
  {
    version: 33,
    name: "device-installations",
    // The devices of a space. A device signing in by e-mail code describes
    // itself: its application (`planner`
    // for PlanAstro, `sync` for Astro Sync), its platform, its model, and an
    // identifier its application generated once and keeps
    // (`installation_hash`: its SHA-256, never the identifier itself). A
    // device paired on a private server has none of them (NULL).
    //
    // A PlanAstro installation is attached to one
    // space at a time: at most one live row (`revoked_at IS NULL`) per
    // installation. Astro Sync may be signed in to several spaces, once per
    // space. The two partial unique indexes are the rule's last guard when
    // two sign-ins of the same device race.
    statements: {
      common: `
        ALTER TABLE device_tokens ADD COLUMN application TEXT;
        ALTER TABLE device_tokens ADD COLUMN platform TEXT;
        ALTER TABLE device_tokens ADD COLUMN model TEXT;
        ALTER TABLE device_tokens ADD COLUMN installation_hash TEXT;
        CREATE UNIQUE INDEX IF NOT EXISTS device_tokens_live_planner_installation_idx
          ON device_tokens(installation_hash)
          WHERE revoked_at IS NULL AND application = 'planner';
        CREATE UNIQUE INDEX IF NOT EXISTS device_tokens_live_installation_space_idx
          ON device_tokens(installation_hash, tenant_id)
          WHERE revoked_at IS NULL AND installation_hash IS NOT NULL;
      `,
    },
  },
  {
    version: 35,
    name: "users-language",
    // The language of a space's messages: that of the message whose code
    // opened it last (`fr`, `en`, `ja`). The service writes it at each
    // sign-in and reads it to tell the space that a device left it. NULL on
    // a private server, which sends no message.
    statements: {
      common: `
        ALTER TABLE users ADD COLUMN language TEXT;
      `,
    },
  },
  // Versions 36 to 40 are not used by the core: 36, 38, 39 and 40 were
  // reserved and never assigned, and 37 belongs to a composition
  // (`migration-registry.ts`). The hardening of the sign-in was assigned
  // 41 to 44.
  {
    version: 41,
    name: "sign-in-hardening",
    // The hardening of the sign-in:
    //
    // - `sign_in_codes.attempts`: the comparisons a code received. Each one
    //   is reserved on the row before the comparison, by a conditional
    //   UPDATE that fails past five, so that parallel verifications never
    //   compare a code more than five times.
    // - The limits on sending count every reserved row (`created_at`),
    //   whether its message has left yet or not; the indexes serve those
    //   counts by address, by origin and for the whole service (its e-mail
    //   budget).
    // - `sign_in_throttles.lock_level`: how many locks in a row a subject
    //   received, each within 24 hours of the previous one; a lock lasts 15
    //   minutes, then 1 hour, then 24 hours. `locked_until` is kept after a
    //   lock ends, to recognise the next one.
    // - `sign_in_throttles.address_hash`: the keyed digest of the address a
    //   subject counts failures of (the address itself, or the address from
    //   one network origin), so that the deletion of a space finds every
    //   row of its address; NULL for a network origin.
    // - `sign_in_send_guard`: one row that every reservation of a message
    //   updates first, inside its transaction. On PostgreSQL its row lock
    //   makes the reservations of messages take turns, so that two of them
    //   never both see room under a limit; SQLite's one connection already
    //   runs one transaction at a time.
    statements: {
      common: `
        ALTER TABLE sign_in_codes ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
        CREATE INDEX IF NOT EXISTS sign_in_codes_created_idx
          ON sign_in_codes(created_at);
        CREATE INDEX IF NOT EXISTS sign_in_codes_email_created_idx
          ON sign_in_codes(email, created_at);
        CREATE INDEX IF NOT EXISTS sign_in_codes_origin_created_idx
          ON sign_in_codes(origin_hash, created_at);
        ALTER TABLE sign_in_throttles ADD COLUMN lock_level INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE sign_in_throttles ADD COLUMN address_hash TEXT;
        CREATE INDEX IF NOT EXISTS sign_in_throttles_address_idx
          ON sign_in_throttles(address_hash);
        CREATE TABLE IF NOT EXISTS sign_in_send_guard (
          id INTEGER PRIMARY KEY,
          reserved_at TEXT NOT NULL
        );
      `,
    },
  },
  // Versions 42 to 44 stay with the hardening of the sign-in.
  {
    version: 45,
    name: "debrief-targets",
    // The per-target part of a debriefing — each adjusted target's state
    // (`done`, `modified`, `partial`, `skipped`), the reason of a skipped
    // one and the acquired minutes the person declared — stored with the
    // decision itself, as the JSON the request carried once validated.
    // The outcome and the instant of the decision already live on the row
    // (`status`, `frozen_at`); NULL for a plan debriefed before this
    // version, for an `executed` or `abandoned` night (which read no
    // adjustment), and for a plan never debriefed.
    statements: {
      common: `
        ALTER TABLE plans ADD COLUMN debrief_targets_json TEXT;
      `,
    },
  },
  {
    version: 46,
    name: "projects",
    // The projects of a space — shown to the observer as « plans
    // multi-nuits » — the unit of intention above the night plans. Schema
    // only: the service that reads and writes these rows is an extension's;
    // a private server never writes one. `payload_json` holds the resource's own
    // fields (target, goal, place, equipment, constraints) as canonical
    // JSON; `revision` and `status` are columns because every write tests
    // them. A project is archived, never deleted: `deleted_at` stays NULL
    // for the service and exists only so that a later erasure or retention
    // rule needs no migration. The link to the nights is carried by each
    // plan item's `projectId`, inside the plan's own JSON, so no join table.
    statements: {
      common: `
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES organizations(id),
          revision INTEGER NOT NULL,
          status TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT
        );
        CREATE INDEX IF NOT EXISTS projects_tenant_idx
          ON projects(tenant_id, deleted_at);
      `,
    },
  },
  {
    version: 47,
    name: "place-sky-measures",
    // The sky background Astro Sync measured on the observer's own solved
    // frames, one value per account, place and night
    // (`POST /v1/place-sky-measures`). `place_id` is the place's id in
    // the account's places (`known_locations.client_id`), `night` the date
    // the evening starts on; a later upload for the same place and night
    // replaces the row. Only the number and its evidence are kept (the
    // median in mag/arcsec², the number of poses, the method version, the
    // median instant, the session it came with): never an image, never the
    // frames' coordinates. DOUBLE PRECISION, not REAL: PostgreSQL's REAL is
    // a float4.
    statements: {
      common: `
        CREATE TABLE IF NOT EXISTS place_sky_measures (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES organizations(id),
          place_id TEXT NOT NULL,
          night TEXT NOT NULL,
          sqm DOUBLE PRECISION NOT NULL,
          pose_count INTEGER NOT NULL,
          method_version TEXT NOT NULL,
          observed_at TEXT NOT NULL,
          session_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (tenant_id, place_id, night)
        );
      `,
    },
  },
  {
    version: 48,
    name: "calibration-contributions",
    // The project's own sky-brightness calibration set
    // (docs/CONTRIBUTION_RULES.md), kept with the observer's explicit
    // consent. `organizations.calibration_consent_at`
    // is the consent of the space (NULL: off, the default).
    // `calibration_contributions` holds the anonymised records — the seven
    // fields and a random row key — and no column that refers to a space, a
    // person, a place or a device. `calibration_ledger` is the only link
    // from a space to its rows (by `source_hash`, a digest of the value's
    // kind, place id and night), used to replace the row of a changed value
    // and to delete them all on withdrawal or with the space; it is never
    // exported. No foreign key between the two: a withdrawal deletes the
    // rows through the ledger, then the ledger.
    statements: {
      common: `
        ALTER TABLE organizations ADD COLUMN calibration_consent_at TEXT;
        CREATE TABLE IF NOT EXISTS calibration_contributions (
          row_key TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          sqm DOUBLE PRECISION NOT NULL,
          band TEXT NOT NULL,
          radiance_level INTEGER NOT NULL,
          region TEXT NOT NULL,
          year INTEGER NOT NULL,
          method_version TEXT
        );
        CREATE TABLE IF NOT EXISTS calibration_ledger (
          tenant_id TEXT NOT NULL REFERENCES organizations(id),
          source_hash TEXT NOT NULL,
          row_key TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (tenant_id, source_hash)
        );
      `,
    },
  },
  {
    version: 54,
    name: "hosted-portal",
    // The visibility of a capture and its two flags, the private gallery of
    // a space (its address, its mode, its two names and its access list) and
    // the warnings of a person. Every name is the one fixed beforehand; this
    // layer stores, it decides nothing (who may do what is written by the
    // routes that use it).
    //
    // `captures`: `visibility` (`private` by default, the only value every
    // existing capture takes); the automatic check (`auto_check`: NULL until
    // it has run, then `sky`, `undetermined` or `other`, with its machine
    // reason and its time); the team's flag (`admin_check`: NULL until the
    // team looks, then `approved` or `refused`, with its time, its reason
    // and a free note); the owner's request of a verification
    // (`review_requested_at`); the notice of a private capture that did not
    // pass (`protection_notice_at`) and the lifting of its protection
    // (`protection_lifted_at`); its removal from the public gallery after
    // reports (`removed_from_gallery_at`).
    //
    // `organizations`: the private gallery — a random address
    // (`portal_token`, minted by the repository, never chosen; a unique
    // index, as SQLite refuses `ADD COLUMN … UNIQUE`), who may see it
    // (`portal_mode`: `none` at creation, `link`, `invited`), the public
    // name (≤ 60 characters) and the gallery's name (≤ 80), when the team
    // refused either (cleared when the owner saves a new one), and whether
    // the equipment kept by the administration is hidden.
    //
    // `users`: the warnings (refusals by the team), the end of a block on
    // publishing in force and the blocks already applied; neither counter
    // ever decreases.
    //
    // `portal_access`: the access list of a private gallery, by normalised
    // address, with its invitation link. `admin_access_log`: every look of
    // the administration at a private capture. `portal_mail_budget`: the
    // messages of the private galleries counted in their own budget, a time
    // and a kind, no address.
    //
    // `equipment.scope`: `private` (the space's own) or `default` (kept by
    // the administration, proposed to every space).
    //
    // The publications (migration 27) are retired without conversion: a
    // publication made public never passed the two checks a public capture
    // now needs.
    statements: {
      common: `
        ALTER TABLE captures ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'
          CHECK (visibility IN ('private','public'));
        ALTER TABLE captures ADD COLUMN auto_check TEXT
          CHECK (auto_check IN ('sky','undetermined','other'));
        ALTER TABLE captures ADD COLUMN auto_check_reason TEXT;
        ALTER TABLE captures ADD COLUMN auto_check_at TEXT;
        ALTER TABLE captures ADD COLUMN admin_check TEXT
          CHECK (admin_check IN ('approved','refused'));
        ALTER TABLE captures ADD COLUMN admin_check_at TEXT;
        ALTER TABLE captures ADD COLUMN admin_check_reason TEXT
          CHECK (admin_check_reason IN ('not_sky','offensive','identifiable','other'));
        ALTER TABLE captures ADD COLUMN admin_check_note TEXT;
        ALTER TABLE captures ADD COLUMN review_requested_at TEXT;
        ALTER TABLE captures ADD COLUMN protection_notice_at TEXT;
        ALTER TABLE captures ADD COLUMN protection_lifted_at TEXT;
        ALTER TABLE captures ADD COLUMN removed_from_gallery_at TEXT;
        CREATE INDEX IF NOT EXISTS captures_visibility_created_idx
          ON captures(visibility, created_at);
        CREATE INDEX IF NOT EXISTS captures_admin_check_created_idx
          ON captures(admin_check, created_at);
        CREATE INDEX IF NOT EXISTS captures_auto_check_created_idx
          ON captures(auto_check, created_at);

        ALTER TABLE organizations ADD COLUMN portal_token TEXT;
        CREATE UNIQUE INDEX IF NOT EXISTS organizations_portal_token_idx
          ON organizations(portal_token);
        ALTER TABLE organizations ADD COLUMN portal_mode TEXT NOT NULL DEFAULT 'none'
          CHECK (portal_mode IN ('none','link','invited'));
        ALTER TABLE organizations ADD COLUMN public_name TEXT
          CHECK (public_name IS NULL OR length(public_name) <= 60);
        ALTER TABLE organizations ADD COLUMN portal_name TEXT
          CHECK (portal_name IS NULL OR length(portal_name) <= 80);
        ALTER TABLE organizations ADD COLUMN public_name_refused_at TEXT;
        ALTER TABLE organizations ADD COLUMN portal_name_refused_at TEXT;
        ALTER TABLE organizations ADD COLUMN hide_default_equipment INTEGER NOT NULL DEFAULT 0;

        ALTER TABLE users ADD COLUMN warnings_count INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE users ADD COLUMN publishing_blocked_until TEXT;
        ALTER TABLE users ADD COLUMN block_count INTEGER NOT NULL DEFAULT 0;

        ALTER TABLE equipment ADD COLUMN scope TEXT NOT NULL DEFAULT 'private'
          CHECK (scope IN ('private','default'));

        CREATE TABLE IF NOT EXISTS portal_access (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES organizations(id),
          email TEXT NOT NULL,
          state TEXT NOT NULL CHECK (state IN ('invited','granted','opened')),
          token TEXT NOT NULL UNIQUE,
          invited_at TEXT NOT NULL,
          last_sent_at TEXT,
          opened_at TEXT,
          UNIQUE (tenant_id, email)
        );
        CREATE INDEX IF NOT EXISTS portal_access_email_idx
          ON portal_access(email);

        CREATE TABLE IF NOT EXISTS admin_access_log (
          id TEXT PRIMARY KEY,
          actor_user_id TEXT NOT NULL,
          tenant_id TEXT NOT NULL REFERENCES organizations(id),
          capture_id TEXT,
          reason TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS admin_access_log_tenant_created_idx
          ON admin_access_log(tenant_id, created_at);
        CREATE INDEX IF NOT EXISTS admin_access_log_created_idx
          ON admin_access_log(created_at);

        CREATE TABLE IF NOT EXISTS portal_mail_budget (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          created_at TEXT NOT NULL,
          sent_at TEXT
        );
        CREATE INDEX IF NOT EXISTS portal_mail_budget_created_idx
          ON portal_mail_budget(created_at);

        DROP TABLE IF EXISTS publication_items;
        DROP TABLE IF EXISTS publications;
      `,
    },
  },
  {
    version: 55,
    name: "default-equipment",
    // The « Matériel par défaut » of the administration. Its rows are
    // `equipment` rows of scope `default`, held by the platform organisation
    // (`default-equipment-seed.js`): an organisation that is no one's space,
    // created here with no membership, no person and no session, and skipped
    // wherever a space is looked for. The list is seeded once from the
    // common equipment profiles of the core, each row with the
    // profile's own identifier; from then on the administration edits it.
    // Nothing of a space changes: its rows stay `private`.
    statements: {
      common: defaultEquipmentSeedSql(),
    },
  },
  {
    version: 59,
    name: "capture-tags",
    // The owner's own tags of a capture, entered in « Mon espace » →
    // « Captures » and shown in the private gallery only. Free text of the
    // owner, 40 characters at most, never normalised; one row per tag of a
    // capture (unique on the capture and the tag). The public gallery never
    // reads this table: its tags are derived from the target's object type.
    // `tenant_id` bounds every read to its space; the index on it serves the
    // list of a space's distinct tags.
    statements: {
      common: `
        CREATE TABLE IF NOT EXISTS capture_tags (
          capture_id TEXT NOT NULL REFERENCES captures(id),
          tenant_id TEXT NOT NULL REFERENCES organizations(id),
          tag TEXT NOT NULL CHECK (length(tag) BETWEEN 1 AND 40),
          PRIMARY KEY (capture_id, tag)
        );
        CREATE INDEX IF NOT EXISTS capture_tags_tenant_tag_idx
          ON capture_tags(tenant_id, tag);
      `,
    },
  },
  {
    version: 60,
    name: "portal-invitations",
    // The invitations to a private gallery. A row of `portal_access` keeps
    // the language its invitation was written in (`language`, the page the
    // owner invited from) and when its owner was told about it
    // (`owner_notified_at`: one message per person, at the acceptance of
    // an invitation or at the first visit, never two). Its `token` holds
    // the digest of the invitation link's token, never the token itself.
    //
    // `portal_mail_budget.space_key`: the digest of the space a message was
    // sent for, so that each space has its own limit an hour; a time, a
    // kind and that digest, no address, no reference to a space. Its rows
    // are purged after a day.
    statements: {
      common: `
        ALTER TABLE portal_access ADD COLUMN language TEXT;
        ALTER TABLE portal_access ADD COLUMN owner_notified_at TEXT;
        ALTER TABLE portal_mail_budget ADD COLUMN space_key TEXT;
        CREATE INDEX IF NOT EXISTS portal_mail_budget_space_created_idx
          ON portal_mail_budget(space_key, created_at);
      `,
    },
  },
  {
    version: 61,
    name: "default-configuration",
    // « Ma configuration par défaut », the
    // mode and the equipment that fill every new plan of a space (the web's
    // « Mon espace » → « Matériel »). One row
    // per space at most: `configuration` is the JSON of the plan's
    // equipment keys it fixes (`defaultConfigurationKeys` of
    // `planner/state.js`: mode, telescope, camera or eyepiece, reducer,
    // mount, filters, and their custom profiles), never a plan's other
    // settings; `updated_at` is the time of its last write. No row: no
    // configuration, a new plan follows the rule of before. A
    // plan's own equipment never writes it. Erased with the space.
    statements: {
      common: `
        CREATE TABLE IF NOT EXISTS default_configurations (
          tenant_id TEXT PRIMARY KEY REFERENCES organizations(id),
          configuration TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `,
    },
  },
  {
    version: 62,
    name: "capture-stage-variants-personal-targets",
    // One clean migration, no compatibility layer. A capture has a main
    // image and alternative images, no history, no « go back ».
    //
    // `captures.stage`: `draft` or `finalized`, distinct from the
    // visibility (`private` · `public`). An upload from a device creates a
    // draft; a draft is never public nor in a gallery. Every capture stored
    // before this migration is `finalized` (it was shown as it is). Named
    // `stage`, not `state`, because the owner's resource already names
    // `state` the answer of `captureState` (manage-captures.schema.json).
    //
    // `capture_variants`: the images of a capture, `capture.variant_limit`
    // counting those beyond the main one. Each one is an original of the
    // space, keyed like every original by its SHA-256
    // (`uploads/capture-storage.js`: the original and its derived files live
    // at paths computed from the space and the digest, so no path is
    // stored): its byte size, the name it was sent with, its dimensions once
    // the processing has read them, its source (`phone`, `web`,
    // `astro-sync`, `stacking`; NULL for the main image this migration
    // writes for a capture stored before it, whose source was never
    // recorded), its date, its own automatic check (the check belongs to
    // each image; the team's verification stays on the capture) and its own
    // visibility (`is_public`: 0 on arrival; a visitor sees a variant only
    // while it is public and its capture is; read for a variant, the main
    // image following the capture). `is_main` marks the main image, exactly
    // one per capture (`capture_variants_main_idx`). A digest appears
    // once in a space, whatever capture holds it
    // (`capture_variants_tenant_sha256_idx`): the same bytes sent again are
    // « already present ». Every stored original counts in the space's
    // storage, so the quota sums this table.
    //
    // `captures.sha256`, `byte_size`, `original_name` and the automatic
    // check (`auto_check`, `auto_check_reason`, `auto_check_at`) are the
    // main image's, written in the same transaction as `is_main`: every
    // reader of the capture's image keeps reading the capture's row. The
    // main image this migration writes takes the capture's id as its own.
    //
    // Personal targets live in the target library itself, in the same
    // identifier space as the catalogue (`capture_targets` names either):
    // `space_id` (NULL for the catalogue), `library_source` (`catalogue` ·
    // `personal`), and for a personal target its generic label (one of the
    // public gallery's tags), the name of its place, its date and a note.
    // Its name is `designation` (80 characters at most, checked by the
    // service), its coordinates `ra_hours` and `dec_degrees` (optional).
    // A personal row has `source_present = 0`, so that no reader of the
    // shared catalogue (which reads `source_present = 1` only) and no
    // catalogue import ever sees or retires it; it is erased with its space.
    //
    // `upload_sessions.variant_of`: the capture a resumable upload adds an
    // image to (its `captureId` at creation), and `source`, the source the
    // image records.
    statements: {
      common: `
        ALTER TABLE captures ADD COLUMN stage TEXT NOT NULL DEFAULT 'draft'
          CHECK (stage IN ('draft','finalized'));
        UPDATE captures SET stage = 'finalized';
        CREATE TABLE IF NOT EXISTS capture_variants (
          id TEXT PRIMARY KEY,
          capture_id TEXT NOT NULL REFERENCES captures(id),
          tenant_id TEXT NOT NULL REFERENCES organizations(id),
          sha256 TEXT NOT NULL,
          byte_size INTEGER NOT NULL,
          original_name TEXT NOT NULL,
          width INTEGER,
          height INTEGER,
          source TEXT
            CHECK (source IN ('phone','web','astro-sync','stacking')),
          is_main INTEGER NOT NULL DEFAULT 0 CHECK (is_main IN (0,1)),
          is_public INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0,1)),
          auto_check TEXT
            CHECK (auto_check IN ('sky','undetermined','other')),
          auto_check_reason TEXT,
          auto_check_at TEXT,
          created_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS capture_variants_tenant_sha256_idx
          ON capture_variants(tenant_id, sha256);
        CREATE UNIQUE INDEX IF NOT EXISTS capture_variants_main_idx
          ON capture_variants(capture_id) WHERE is_main = 1;
        CREATE INDEX IF NOT EXISTS capture_variants_capture_idx
          ON capture_variants(capture_id, created_at);
        INSERT INTO capture_variants
          (id, capture_id, tenant_id, sha256, byte_size, original_name,
           is_main, auto_check, auto_check_reason, auto_check_at, created_at)
          SELECT id, id, tenant_id, sha256, byte_size, original_name,
            1, auto_check, auto_check_reason, auto_check_at, created_at
          FROM captures;
        ALTER TABLE target_catalogue_entries
          ADD COLUMN space_id TEXT REFERENCES organizations(id);
        ALTER TABLE target_catalogue_entries
          ADD COLUMN library_source TEXT NOT NULL DEFAULT 'catalogue'
            CHECK (library_source IN ('catalogue','personal'));
        ALTER TABLE target_catalogue_entries ADD COLUMN gallery_label TEXT;
        ALTER TABLE target_catalogue_entries ADD COLUMN place_name TEXT;
        ALTER TABLE target_catalogue_entries ADD COLUMN observed_on TEXT;
        ALTER TABLE target_catalogue_entries ADD COLUMN note TEXT;
        CREATE INDEX IF NOT EXISTS target_catalogue_entries_space_idx
          ON target_catalogue_entries(space_id);
        ALTER TABLE upload_sessions ADD COLUMN variant_of TEXT;
        ALTER TABLE upload_sessions ADD COLUMN source TEXT;
      `,
    },
  },
  {
    version: 63,
    name: "weather-forecasts",
    // The last forecast of each
    // rounded place (the planner's weather, `astronomy-weather.server.js`),
    // so that a replica woken up after a sleep serves it stale instead of
    // answering 503 while a provider is slow. Shared by every space: a place
    // rounded to a thousandth of a degree, the providers' answer as it was
    // (`payload`, JSON text), when it was fetched and until when it is fresh
    // (ISO instants), and the `Last-Modified` MET Norway gave. No reference
    // to a space or a person. The repository keeps at most a thousand
    // places and drops those older than a week.
    statements: {
      common: `
        CREATE TABLE IF NOT EXISTS weather_forecasts (
          place_key TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          fetched_at TEXT NOT NULL,
          fresh_until TEXT NOT NULL,
          last_modified TEXT
        );
        CREATE INDEX IF NOT EXISTS weather_forecasts_fetched_idx
          ON weather_forecasts(fetched_at);
      `,
    },
  },
  {
    version: 64,
    name: "capture-sky-solutions",
    // The sky solution of an image of a capture — computed by Astro
    // Sync on the person's computer (or read from a header already solved,
    // or carried over by an import), never on the server — from
    // which the portal draws the sky annotations alone.
    //
    // One row per image (`image_id`, the main image or a variant of
    // `capture_variants`): the solution belongs to the image it was
    // computed on, and `sha256` is that image's digest, so a solution never
    // outlives its file (deleting a variant deletes its solution; deleting
    // the capture or the space deletes them all). `solution_json` holds the
    // validated fields of the contract (`sky-solution.schema.json`: centre,
    // scale, rotation, field, parity, the pixel size it was solved at, the
    // time and the solver); `source` is repeated as a column for the reads
    // that count solutions by origin (`header`, `astap`, `astrometry-net`,
    // `import`). The centre of the field is a position in the sky: it says
    // nothing of the place on Earth.
    //
    // `captures.sky_annotations`: the owner's switch « Afficher le plate
    // solving » (management of « Mon espace › Captures »), one per capture,
    // on by default (on as soon as a solution exists); the
    // gallery offers the annotations of an image only while it is on.
    statements: {
      common: `
        CREATE TABLE IF NOT EXISTS capture_sky_solutions (
          image_id TEXT PRIMARY KEY REFERENCES capture_variants(id),
          capture_id TEXT NOT NULL REFERENCES captures(id),
          tenant_id TEXT NOT NULL REFERENCES organizations(id),
          sha256 TEXT NOT NULL,
          solution_json TEXT NOT NULL,
          source TEXT NOT NULL
            CHECK (source IN ('header','astap','astrometry-net','import')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS capture_sky_solutions_capture_idx
          ON capture_sky_solutions(capture_id);
        CREATE INDEX IF NOT EXISTS capture_sky_solutions_tenant_idx
          ON capture_sky_solutions(tenant_id);
        ALTER TABLE captures ADD COLUMN sky_annotations INTEGER NOT NULL
          DEFAULT 1 CHECK (sky_annotations IN (0,1));
      `,
    },
  },
  {
    version: 65,
    name: "session-executions",
    // A night executed with
    // several plans at once, each on its own equipment. Each plan keeps its
    // one observation session; `execution_id` is the client's ULID shared by
    // the sessions launched together (NULL for an execution of a single
    // plan, which reads exactly as before), `piloting` how the plan is
    // piloted (`mount`, `smart_telescope`, `assisted`, `free`; NULL when not
    // told). Both are written at creation only. The index serves the reading
    // of one execution's sessions in a space.
    statements: {
      common: `
        ALTER TABLE observation_sessions ADD COLUMN execution_id TEXT;
        ALTER TABLE observation_sessions ADD COLUMN piloting TEXT;
        CREATE INDEX IF NOT EXISTS observation_sessions_execution_idx
          ON observation_sessions(tenant_id, execution_id);
      `,
    },
  },
  {
    version: 66,
    name: "application-logs-device",
    // The application's error
    // logs, sent by a phone whose person turned « Envoyer les journaux
    // d'erreur de l'application » on, land in `application_logs` with the
    // source `mobile`, tied to the space (`tenant_id`, already there) and to
    // the device that sent them (`device_id`: its identifier, never its name
    // nor the address of the space). No foreign key: a device detached keeps
    // its lines in the space until they age out (30 days) or the space is
    // erased. The index serves the administration's search by the address
    // of a space and the space's erasure.
    statements: {
      common: `
        ALTER TABLE application_logs ADD COLUMN device_id TEXT;
        CREATE INDEX IF NOT EXISTS application_logs_tenant_idx
          ON application_logs(tenant_id, created_at DESC);
      `,
    },
  },
  {
    version: 67,
    name: "structured-night",
    // The night's data is structured, so that Astro Sync can produce the
    // same from the logs and the person edits it easily. One clean
    // migration, no compatibility layer.
    //
    // The night's own fields, on `observation_sessions`: `title` (80
    // characters at most), `place_json` (`{ name, latitude?, longitude? }`,
    // never a time zone: the place rule), `equipment_json` (`{ telescopeId?,
    // cameraId?, mountId?, filterIds[] }`, identifiers of the space's
    // equipment), `target_ids_json` (catalogue or personal targets) and
    // `notes` (4 000 characters at most; the field notes stay events of the
    // journal). NULL means « the plan's »: a reader resolves the field
    // through the plan until the person sets it, and a PATCH with `null`
    // gives it back to the plan.
    //
    // `acquisition_steps`: the night's acquisition steps, one row per line
    // of the table (target, free-text filter never normalized, frames,
    // exposure, gain; binning and sensor temperature kept from the analysis,
    // never shown). The integration is computed (frames × exposure), never
    // stored. `origin`: `analysis` or `import` (proposed by the night's
    // analysis, by Astro Sync or by the import of the old nights; `step_key`
    // is the report's key) or `manual`. `edited_at` marks a step corrected
    // by hand: a new analysis replaces the `analysis`/`import` steps never
    // edited, and keeps the edited ones (« modifié ») and the manual ones.
    //
    // `session_analyses` is rebuilt for the report v2: one analysis per
    // night (`UNIQUE(session_id)`), the next sending replacing it, the
    // versions dropped. The v1
    // reports are not converted (no compatibility layer): the table is
    // dropped and created again, empty. `report_version` repeats the
    // report's own `reportVersion`; `origin_device_id` is the device that
    // sent it (the device's name is read from `device_tokens`).
    statements: {
      sqlite: `
        ALTER TABLE observation_sessions ADD COLUMN title TEXT;
        ALTER TABLE observation_sessions ADD COLUMN place_json TEXT;
        ALTER TABLE observation_sessions ADD COLUMN equipment_json TEXT;
        ALTER TABLE observation_sessions ADD COLUMN target_ids_json TEXT;
        ALTER TABLE observation_sessions ADD COLUMN notes TEXT;
        CREATE TABLE IF NOT EXISTS acquisition_steps (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES organizations(id),
          session_id TEXT NOT NULL REFERENCES observation_sessions(id),
          target_id TEXT,
          target_hint TEXT,
          filter TEXT,
          frame_count INTEGER NOT NULL CHECK (frame_count >= 1),
          exposure_seconds REAL NOT NULL CHECK (exposure_seconds > 0),
          gain INTEGER,
          binning TEXT,
          sensor_temp_c REAL,
          origin TEXT NOT NULL CHECK (origin IN ('analysis','manual','import')),
          step_key TEXT,
          edited_at TEXT,
          position INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS acquisition_steps_session_idx
          ON acquisition_steps(session_id, position);
        CREATE INDEX IF NOT EXISTS acquisition_steps_tenant_idx
          ON acquisition_steps(tenant_id);
        DROP TABLE IF EXISTS session_analyses;
        CREATE TABLE session_analyses (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES organizations(id),
          session_id TEXT NOT NULL UNIQUE REFERENCES observation_sessions(id),
          report_version INTEGER NOT NULL,
          report_json TEXT NOT NULL,
          origin_device_id TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS session_analyses_tenant_idx
          ON session_analyses(tenant_id);
      `,
      postgres: `
        ALTER TABLE observation_sessions ADD COLUMN title TEXT;
        ALTER TABLE observation_sessions ADD COLUMN place_json TEXT;
        ALTER TABLE observation_sessions ADD COLUMN equipment_json TEXT;
        ALTER TABLE observation_sessions ADD COLUMN target_ids_json TEXT;
        ALTER TABLE observation_sessions ADD COLUMN notes TEXT;
        CREATE TABLE IF NOT EXISTS acquisition_steps (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES organizations(id),
          session_id TEXT NOT NULL REFERENCES observation_sessions(id),
          target_id TEXT,
          target_hint TEXT,
          filter TEXT,
          frame_count INTEGER NOT NULL CHECK (frame_count >= 1),
          exposure_seconds DOUBLE PRECISION NOT NULL CHECK (exposure_seconds > 0),
          gain INTEGER,
          binning TEXT,
          sensor_temp_c DOUBLE PRECISION,
          origin TEXT NOT NULL CHECK (origin IN ('analysis','manual','import')),
          step_key TEXT,
          edited_at TEXT,
          position INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS acquisition_steps_session_idx
          ON acquisition_steps(session_id, position);
        CREATE INDEX IF NOT EXISTS acquisition_steps_tenant_idx
          ON acquisition_steps(tenant_id);
        DROP TABLE IF EXISTS session_analyses;
        CREATE TABLE session_analyses (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES organizations(id),
          session_id TEXT NOT NULL UNIQUE REFERENCES observation_sessions(id),
          report_version INTEGER NOT NULL,
          report_json TEXT NOT NULL,
          origin_device_id TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS session_analyses_tenant_idx
          ON session_analyses(tenant_id);
      `,
    },
  },
  {
    version: 68,
    name: "capture-variant-title-description",
    // An image of a capture —
    // its main image or a variant — has an optional title (60 characters at
    // most) and an optional description (280 at most), written by its owner
    // field by field from the web session. NULL means « by default »: the
    // screens name the image « Image principale » or « Variante N » from
    // its rank of arrival, computed at display and never stored. Every
    // image stored before this migration reads NULL.
    statements: {
      common: `
        ALTER TABLE capture_variants ADD COLUMN title TEXT
          CHECK (title IS NULL OR length(title) BETWEEN 1 AND 60);
        ALTER TABLE capture_variants ADD COLUMN description TEXT
          CHECK (description IS NULL OR length(description) BETWEEN 1 AND 280);
      `,
    },
  },
  {
    version: 69,
    name: "capture-metadata",
    // The metadata of a capture, read through plan → night → capture → image.
    // A column NULL means « taken from the level above » (the night, its
    // plan, the capture's targets); the capture holds a value of its own
    // only when its owner corrects it or a producer (Astro Sync, the import,
    // the photo) proposes it. One clean migration, no data to carry, no
    // compatibility layer (the dev database may be reset).
    //
    // `captures`: `title` (80 characters), `description` (2 000), `notes`
    // (4 000, never published), `calibration` (120, free text); the lists
    // and objects as JSON — `acquisition_json` (the capture's own lines
    // `{ id, filter, frameCount, exposureSeconds, gain, origin, editedAt }`,
    // NULL while it reads its night's steps), `sensor_json`
    // (`{ temperatureC, binning }`), `equipment_json` (identifiers of the
    // space's equipment by role), `processing_json` (`{ software, steps }`)
    // — and `field_origins_json`, the origin of each value the capture
    // holds (`{ source, at, edited }`, and the value a producer proposed, so
    // that clearing an edited value gives it back). No place: the place is
    // the night's. `finalized_at`: written once, at the
    // passage « Brouillon » → « Finalisée », never cleared; a capture
    // finalized before this migration reads NULL (« Finalisée. »).
    //
    // `capture_variants`: `title_source` — `astro-sync`, `import` or
    // `owner`, NULL while the title is NULL — and `edited_at`, set when the
    // owner writes the image's title or description: a proposal never
    // changes them afterwards.
    //
    // `upload_sessions.metadata_json`: the proposals a resumable upload
    // declared at its create step (`uploadMetadata`), applied when it
    // completes.
    statements: {
      common: `
        ALTER TABLE captures ADD COLUMN title TEXT
          CHECK (title IS NULL OR length(title) BETWEEN 1 AND 80);
        ALTER TABLE captures ADD COLUMN description TEXT
          CHECK (description IS NULL OR length(description) BETWEEN 1 AND 2000);
        ALTER TABLE captures ADD COLUMN notes TEXT
          CHECK (notes IS NULL OR length(notes) BETWEEN 1 AND 4000);
        ALTER TABLE captures ADD COLUMN calibration TEXT
          CHECK (calibration IS NULL OR length(calibration) BETWEEN 1 AND 120);
        ALTER TABLE captures ADD COLUMN acquisition_json TEXT;
        ALTER TABLE captures ADD COLUMN sensor_json TEXT;
        ALTER TABLE captures ADD COLUMN equipment_json TEXT;
        ALTER TABLE captures ADD COLUMN processing_json TEXT;
        ALTER TABLE captures ADD COLUMN field_origins_json TEXT;
        ALTER TABLE captures ADD COLUMN finalized_at TEXT;
        ALTER TABLE capture_variants ADD COLUMN title_source TEXT
          CHECK (title_source IS NULL OR title_source IN ('astro-sync','import','owner'));
        ALTER TABLE capture_variants ADD COLUMN edited_at TEXT;
        ALTER TABLE upload_sessions ADD COLUMN metadata_json TEXT;
      `,
    },
  },
  {
    version: 70,
    name: "synchronized-places",
    // Places are data, so they are synchronised with the server: a place is a resource of the space, read and written by
    // `/v1/places` under the rule of the most recent edit. One clean
    // migration, no compatibility layer.
    //
    // `known_locations` keeps its name (`place_sky_measures.place_id`, the
    // export and the erasure of a space name it) and gains `edited_at`, the
    // instant of the person's last gesture on the place (an edit, or the
    // deletion's `?at=`), which decides between two writes; a place stored
    // before reads its `updated_at`. `deleted_at` is the service's instant
    // of a soft deletion: the tombstone answers a stale edit for 90 days,
    // then is purged. `kind` and `note` live in `details_json`.
    //
    // `place_preferences`: the space's default place (one per space), with
    // the instant of its last choice under the same rule. A default place
    // that is no longer a live place reads as none.
    statements: {
      common: `
        ALTER TABLE known_locations ADD COLUMN edited_at TEXT;
        UPDATE known_locations SET edited_at = updated_at;
        ALTER TABLE known_locations ADD COLUMN deleted_at TEXT;
        CREATE TABLE IF NOT EXISTS place_preferences (
          tenant_id TEXT PRIMARY KEY REFERENCES organizations(id),
          default_place_id TEXT,
          edited_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `,
    },
  },
  {
    version: 71,
    name: "telescope-catalogue",
    // The default catalogue gets
    // 39 entries (31 telescopes — smart telescopes,
    // refractors, Maksutov, Schmidt-Cassegrain, Newton, Dobsonian —, 5
    // cameras, 3 eyepieces), as rows of scope `default` of the platform
    // organisation, in `telescope-catalogue-seed.js` (this migration's own
    // history, never a second source to keep in step with the profiles
    // file). `ON CONFLICT DO NOTHING`: a row the administration already
    // holds under one of these identifiers, edited, hidden or archived, is
    // never rewritten; migration 55's frozen copy is not touched.
    statements: {
      common: telescopeCatalogueSeedSql(),
    },
  },
  {
    version: 72,
    name: "capture-without-image",
    // It must be possible to create the definition alone and send the
    // images later with Astro Sync (one clean migration, no placeholder). A capture created
    // without an image holds NULL in its image columns — `sha256`,
    // `byte_size`, `original_name` — until its first image arrives and
    // becomes its main image. The unique index `(tenant_id, sha256)` lets
    // several NULLs through on both dialects. A row written by an earlier
    // version with the placeholder digest `no-image:<id>` (size 0, empty name)
    // is converted to NULL here.
    //
    // PostgreSQL drops the three constraints in place. SQLite cannot: its
    // own procedure rebuilds the table (as migration 29 does for `users`),
    // foreign keys switched off by the runner around the transaction
    // (`sqliteRebuildsReferencedTable`) since `capture_targets`,
    // `upload_sessions`, `capture_tags`, `capture_variants`,
    // `capture_sky_solutions` and the tables a composition keeps (its
    // reports of a capture, for one) reference `captures(id)`; their
    // declarations name the table, so they follow the rebuilt one. The
    // columns are those of migrations 17, 54, 62, 64 and 69, in their order
    // and with their checks; the five named indexes of
    // the table are created again; it carries no trigger. Like every
    // migration of this list, it has no way down: a database is brought
    // back by its backup.
    sqliteRebuildsReferencedTable: true,
    statements: {
      postgres: `
        ALTER TABLE captures ALTER COLUMN sha256 DROP NOT NULL;
        ALTER TABLE captures ALTER COLUMN byte_size DROP NOT NULL;
        ALTER TABLE captures ALTER COLUMN original_name DROP NOT NULL;
        UPDATE captures SET sha256 = NULL, byte_size = NULL, original_name = NULL
          WHERE sha256 LIKE 'no-image:%';
      `,
      sqlite: `
        DROP TABLE IF EXISTS captures_rebuilt;
        CREATE TABLE captures_rebuilt (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES organizations(id),
          session_id TEXT REFERENCES observation_sessions(id),
          plan_id TEXT REFERENCES plans(id),
          target_id TEXT,
          original_name TEXT,
          sha256 TEXT,
          byte_size INTEGER,
          status TEXT NOT NULL DEFAULT 'draft'
            CHECK (status IN ('draft','uploaded')),
          created_at TEXT NOT NULL,
          visibility TEXT NOT NULL DEFAULT 'private'
            CHECK (visibility IN ('private','public')),
          auto_check TEXT
            CHECK (auto_check IN ('sky','undetermined','other')),
          auto_check_reason TEXT,
          auto_check_at TEXT,
          admin_check TEXT
            CHECK (admin_check IN ('approved','refused')),
          admin_check_at TEXT,
          admin_check_reason TEXT
            CHECK (admin_check_reason IN ('not_sky','offensive','identifiable','other')),
          admin_check_note TEXT,
          review_requested_at TEXT,
          protection_notice_at TEXT,
          protection_lifted_at TEXT,
          removed_from_gallery_at TEXT,
          stage TEXT NOT NULL DEFAULT 'draft'
            CHECK (stage IN ('draft','finalized')),
          sky_annotations INTEGER NOT NULL DEFAULT 1
            CHECK (sky_annotations IN (0,1)),
          title TEXT
            CHECK (title IS NULL OR length(title) BETWEEN 1 AND 80),
          description TEXT
            CHECK (description IS NULL OR length(description) BETWEEN 1 AND 2000),
          notes TEXT
            CHECK (notes IS NULL OR length(notes) BETWEEN 1 AND 4000),
          calibration TEXT
            CHECK (calibration IS NULL OR length(calibration) BETWEEN 1 AND 120),
          acquisition_json TEXT,
          sensor_json TEXT,
          equipment_json TEXT,
          processing_json TEXT,
          field_origins_json TEXT,
          finalized_at TEXT
        );
        INSERT INTO captures_rebuilt (
          id, tenant_id, session_id, plan_id, target_id, original_name, sha256,
          byte_size, status, created_at, visibility, auto_check,
          auto_check_reason, auto_check_at, admin_check, admin_check_at,
          admin_check_reason, admin_check_note, review_requested_at,
          protection_notice_at, protection_lifted_at, removed_from_gallery_at,
          stage, sky_annotations, title, description, notes, calibration,
          acquisition_json, sensor_json, equipment_json, processing_json,
          field_origins_json, finalized_at
        )
          SELECT
            id, tenant_id, session_id, plan_id, target_id,
            CASE WHEN sha256 LIKE 'no-image:%' THEN NULL ELSE original_name END,
            CASE WHEN sha256 LIKE 'no-image:%' THEN NULL ELSE sha256 END,
            CASE WHEN sha256 LIKE 'no-image:%' THEN NULL ELSE byte_size END,
            status, created_at, visibility, auto_check,
            auto_check_reason, auto_check_at, admin_check, admin_check_at,
            admin_check_reason, admin_check_note, review_requested_at,
            protection_notice_at, protection_lifted_at, removed_from_gallery_at,
            stage, sky_annotations, title, description, notes, calibration,
            acquisition_json, sensor_json, equipment_json, processing_json,
            field_origins_json, finalized_at
          FROM captures;
        DROP TABLE captures;
        ALTER TABLE captures_rebuilt RENAME TO captures;
        CREATE INDEX IF NOT EXISTS captures_tenant_created_idx
          ON captures(tenant_id, created_at);
        CREATE UNIQUE INDEX IF NOT EXISTS captures_tenant_sha256_idx
          ON captures(tenant_id, sha256);
        CREATE INDEX IF NOT EXISTS captures_visibility_created_idx
          ON captures(visibility, created_at);
        CREATE INDEX IF NOT EXISTS captures_admin_check_created_idx
          ON captures(admin_check, created_at);
        CREATE INDEX IF NOT EXISTS captures_auto_check_created_idx
          ON captures(auto_check, created_at);
      `,
    },
  },
  {
    version: 73,
    name: "application-logs-token",
    // The application's error logs are sent by default and anonymous. A line of
    // source `mobile` is kept under a diagnostic token (`diagnostic_token`,
    // a random UUID born at the phone's installation, never derived from the
    // device or the space) and carries neither the space nor the device any
    // more: the lines already held lose `tenant_id` and `device_id` here
    // (level, event, message, context and time stay). Nothing links a token
    // to a person; the person hands it over. The index serves the
    // administration's filter by token and the daily limit per token.
    statements: {
      common: `
        ALTER TABLE application_logs ADD COLUMN diagnostic_token TEXT;
        UPDATE application_logs SET tenant_id = NULL, device_id = NULL
          WHERE source = 'mobile';
        CREATE INDEX IF NOT EXISTS application_logs_token_idx
          ON application_logs(diagnostic_token, created_at DESC);
      `,
    },
  },
  {
    version: 74,
    name: "capture-progression",
    // The milestones are attached to the target's capture as a history, not
    // as separate captures: the progression images Astro Sync makes
    // during a night are images of the capture of their target with the
    // role `progression` — never its main image, never a variant: they
    // count against neither `capture.variant_limit` nor
    // `capture.count_limit` (only against the storage), the list of the
    // captures and the galleries never show them, the capture's page shows
    // them as « Progression de la nuit », in the order of their frames.
    // `role` NULL is an image as before (the main one or a variant);
    // `frame_count` is the number of light frames a milestone stacks.
    // A resumable upload keeps the role and the frames it declared in
    // `upload_sessions.metadata_json` (migration 69), beside its proposals.
    statements: {
      common: `
        ALTER TABLE capture_variants ADD COLUMN role TEXT
          CHECK (role IS NULL OR role IN ('progression'));
        ALTER TABLE capture_variants ADD COLUMN frame_count INTEGER
          CHECK (frame_count IS NULL OR frame_count >= 1);
      `,
    },
  },
  {
    version: 75,
    name: "observation-session-reopen",
    // « Reprendre la nuit »: a
    // night stopped while it still runs can be resumed. `reopened_at` is the
    // instant of the latest resume (`POST /v1/sessions/{id}/reopen`): a
    // finish older than it is a stale replay and changes nothing, so the
    // latest gesture wins whatever the order in which two devices reach
    // the service. NULL for every session never resumed — all of them here.
    statements: {
      common: `
        ALTER TABLE observation_sessions ADD COLUMN reopened_at TEXT;
      `,
    },
  },
  {
    version: 76,
    name: "project-integrations",
    // Astro Sync adds to the portal the list of the integrations it
    // found, never a file: one row per night, target and family
    // of frames (filter, exposure, gain, binning, temperature) of a
    // multi-night plan (`projects`, migration 46), the line Astro Sync
    // sends after it integrated a night; `family_key` is the family written
    // once (its nullable parts cannot make a unique key in PostgreSQL), and
    // sending the same night, target and family again replaces the row.
    // `total_seconds` is computed (frames × exposure) when written. The
    // image of the plan Astro Sync makes from them is a capture of role
    // `plan`: `captures.project_id` names its multi-night plan (never a
    // night: its `session_id` and `plan_id` stay NULL) and `plan_json`
    // keeps the nights it combines, its totals by filter and its render.
    statements: {
      sqlite: `
        CREATE TABLE IF NOT EXISTS project_integrations (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES organizations(id),
          project_id TEXT NOT NULL,
          night_id TEXT NOT NULL,
          target_id TEXT NOT NULL,
          family_key TEXT NOT NULL,
          filter TEXT,
          exposure_seconds REAL NOT NULL CHECK (exposure_seconds > 0),
          gain INTEGER,
          binning INTEGER,
          temperature_c REAL,
          frame_count INTEGER NOT NULL CHECK (frame_count >= 1),
          total_seconds REAL NOT NULL CHECK (total_seconds >= 0),
          evening_date TEXT NOT NULL,
          sensor TEXT,
          computer_label TEXT,
          installation_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS project_integrations_family_idx
          ON project_integrations(tenant_id, night_id, target_id, family_key);
        CREATE INDEX IF NOT EXISTS project_integrations_project_idx
          ON project_integrations(tenant_id, project_id, evening_date);
        ALTER TABLE captures ADD COLUMN project_id TEXT;
        ALTER TABLE captures ADD COLUMN plan_json TEXT;
        CREATE INDEX IF NOT EXISTS captures_project_idx
          ON captures(tenant_id, project_id, created_at);
      `,
      postgres: `
        CREATE TABLE IF NOT EXISTS project_integrations (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES organizations(id),
          project_id TEXT NOT NULL,
          night_id TEXT NOT NULL,
          target_id TEXT NOT NULL,
          family_key TEXT NOT NULL,
          filter TEXT,
          exposure_seconds DOUBLE PRECISION NOT NULL CHECK (exposure_seconds > 0),
          gain INTEGER,
          binning INTEGER,
          temperature_c DOUBLE PRECISION,
          frame_count INTEGER NOT NULL CHECK (frame_count >= 1),
          total_seconds DOUBLE PRECISION NOT NULL CHECK (total_seconds >= 0),
          evening_date TEXT NOT NULL,
          sensor TEXT,
          computer_label TEXT,
          installation_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS project_integrations_family_idx
          ON project_integrations(tenant_id, night_id, target_id, family_key);
        CREATE INDEX IF NOT EXISTS project_integrations_project_idx
          ON project_integrations(tenant_id, project_id, evening_date);
        ALTER TABLE captures ADD COLUMN project_id TEXT;
        ALTER TABLE captures ADD COLUMN plan_json TEXT;
        CREATE INDEX IF NOT EXISTS captures_project_idx
          ON captures(tenant_id, project_id, created_at);
      `,
    },
  },
  {
    version: 77,
    name: "project-nights",
    // How several nights are linked together: a night already
    // run is attached to a multi-night plan of its target afterwards. The
    // link stays where the plans carry it — `planItem.projectId`, on the
    // item of that target — and only a night with no plan item of the
    // target (a night run without a plan, or a target met in the field)
    // carries it itself: `observation_sessions.project_id`, NULL for every
    // night here. The integrations of a night follow it: attaching moves
    // them to the plan, detaching takes them out of it, so
    // `project_integrations.project_id` becomes nullable (SQLite rebuilds
    // the table, which no other table references; PostgreSQL drops the
    // constraint).
    statements: {
      sqlite: `
        ALTER TABLE observation_sessions ADD COLUMN project_id TEXT;
        CREATE INDEX IF NOT EXISTS observation_sessions_project_idx
          ON observation_sessions(tenant_id, project_id);
        CREATE TABLE project_integrations_next (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES organizations(id),
          project_id TEXT,
          night_id TEXT NOT NULL,
          target_id TEXT NOT NULL,
          family_key TEXT NOT NULL,
          filter TEXT,
          exposure_seconds REAL NOT NULL CHECK (exposure_seconds > 0),
          gain INTEGER,
          binning INTEGER,
          temperature_c REAL,
          frame_count INTEGER NOT NULL CHECK (frame_count >= 1),
          total_seconds REAL NOT NULL CHECK (total_seconds >= 0),
          evening_date TEXT NOT NULL,
          sensor TEXT,
          computer_label TEXT,
          installation_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        INSERT INTO project_integrations_next SELECT
          id, tenant_id, project_id, night_id, target_id, family_key, filter,
          exposure_seconds, gain, binning, temperature_c, frame_count,
          total_seconds, evening_date, sensor, computer_label,
          installation_id, created_at, updated_at
        FROM project_integrations;
        DROP TABLE project_integrations;
        ALTER TABLE project_integrations_next RENAME TO project_integrations;
        CREATE UNIQUE INDEX IF NOT EXISTS project_integrations_family_idx
          ON project_integrations(tenant_id, night_id, target_id, family_key);
        CREATE INDEX IF NOT EXISTS project_integrations_project_idx
          ON project_integrations(tenant_id, project_id, evening_date);
      `,
      postgres: `
        ALTER TABLE observation_sessions ADD COLUMN project_id TEXT;
        CREATE INDEX IF NOT EXISTS observation_sessions_project_idx
          ON observation_sessions(tenant_id, project_id);
        ALTER TABLE project_integrations ALTER COLUMN project_id DROP NOT NULL;
      `,
    },
  },
  {
    version: 78,
    name: "place-climate-trends",
    // The weather trend of
    // a place (`place-climate-trend.js`), worked out from ten years of the
    // weather archive and kept for a year. Shared by every space: a place
    // rounded to 0.05 degree, the trend as it was served (`payload`, JSON
    // text) and its two instants (ISO): when it was worked out and until when
    // it is fresh. No reference to a space or a person. Written for the
    // common statement, so SQLite and PostgreSQL share it.
    statements: {
      common: `
        CREATE TABLE IF NOT EXISTS place_climate_trends (
          place_key TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          computed_at TEXT NOT NULL,
          fresh_until TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS place_climate_trends_computed_idx
          ON place_climate_trends(computed_at);
      `,
    },
  },
  {
    version: 80,
    name: "session-journal",
    // A plan carried out becomes a session of the Journal. Four columns on
    // `observation_sessions`: `origin` (where the session was created:
    // `execution`, `debrief`, `import` or `astro-sync`; NULL reads
    // `execution`, nothing is migrated by a script), `rework_revision` (the
    // revision of the rework, 0 at creation, +1 on each rework, the value of
    // the next `If-Match`) and `reworked_at`; and `rework_json`, the
    // **correction layer** of the rework (targets in their new order, the
    // events a rework added, the placements it changed), kept on the
    // session's own row so that it follows the session everywhere (export,
    // erasure, sync read) and never touches the append-only event log. On
    // `plans`, what a debriefing also keeps: `debrief_reason` (why a night
    // was not carried out, for an `abandoned` outcome) and
    // `debrief_added_targets_json` (the targets the night met that the plan
    // did not name). The outcome of a session is not a column: it is read
    // from the debriefing of its plan. Written for the common statement:
    // plain ADD COLUMNs, identical on SQLite and PostgreSQL.
    statements: {
      common: `
        ALTER TABLE observation_sessions ADD COLUMN origin TEXT
          CHECK (origin IS NULL OR origin IN ('execution', 'debrief', 'import', 'astro-sync'));
        ALTER TABLE observation_sessions ADD COLUMN rework_revision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE observation_sessions ADD COLUMN reworked_at TEXT;
        ALTER TABLE observation_sessions ADD COLUMN rework_json TEXT;
        ALTER TABLE plans ADD COLUMN debrief_reason TEXT;
        ALTER TABLE plans ADD COLUMN debrief_added_targets_json TEXT;
      `,
    },
  },
  {
    version: 81,
    name: "journal-captures-integrations",
    // Journal (versions 80 and 81 were taken in the order the two changes were
    // merged).
    //
    // `captures.replaced_at` and `captures.replaced_source`: a space without
    // the right to variants (`capture.variant_limit` = 0) keeps one image per
    // capture, session and target; a second image takes the first one's place
    // (the old bytes released from the quota). The capture remembers the
    // instant of its latest replacement and the source of the image that was
    // replaced (`phone`, `web`, `astro-sync`, `stacking`). NULL for every
    // capture never replaced.
    //
    // `project_integrations.source`: who wrote the line, `declared` (the
    // service, from the debriefing of a night attached to a multi-night plan:
    // family key `declared`) or `measured` (Astro Sync's PUT, every line
    // here). A declared line whose frame count is not known holds 0 frames
    // and a 0 s exposure and keeps the declared time in `total_seconds`, so
    // the two checks that required 1 frame and a positive exposure become
    // `>= 0` (SQLite rebuilds the table, which no other table references;
    // PostgreSQL swaps the two constraints).
    statements: {
      sqlite: `
        ALTER TABLE captures ADD COLUMN replaced_at TEXT;
        ALTER TABLE captures ADD COLUMN replaced_source TEXT;
        CREATE TABLE project_integrations_next (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES organizations(id),
          project_id TEXT,
          night_id TEXT NOT NULL,
          target_id TEXT NOT NULL,
          family_key TEXT NOT NULL,
          filter TEXT,
          exposure_seconds REAL NOT NULL CHECK (exposure_seconds >= 0),
          gain INTEGER,
          binning INTEGER,
          temperature_c REAL,
          frame_count INTEGER NOT NULL CHECK (frame_count >= 0),
          total_seconds REAL NOT NULL CHECK (total_seconds >= 0),
          evening_date TEXT NOT NULL,
          sensor TEXT,
          computer_label TEXT,
          installation_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'measured'
            CHECK (source IN ('declared','measured'))
        );
        INSERT INTO project_integrations_next
          (id, tenant_id, project_id, night_id, target_id, family_key, filter,
           exposure_seconds, gain, binning, temperature_c, frame_count,
           total_seconds, evening_date, sensor, computer_label,
           installation_id, created_at, updated_at, source)
        SELECT
          id, tenant_id, project_id, night_id, target_id, family_key, filter,
          exposure_seconds, gain, binning, temperature_c, frame_count,
          total_seconds, evening_date, sensor, computer_label,
          installation_id, created_at, updated_at, 'measured'
        FROM project_integrations;
        DROP TABLE project_integrations;
        ALTER TABLE project_integrations_next RENAME TO project_integrations;
        CREATE UNIQUE INDEX IF NOT EXISTS project_integrations_family_idx
          ON project_integrations(tenant_id, night_id, target_id, family_key);
        CREATE INDEX IF NOT EXISTS project_integrations_project_idx
          ON project_integrations(tenant_id, project_id, evening_date);
      `,
      postgres: `
        ALTER TABLE captures ADD COLUMN replaced_at TEXT;
        ALTER TABLE captures ADD COLUMN replaced_source TEXT;
        ALTER TABLE project_integrations
          DROP CONSTRAINT IF EXISTS project_integrations_exposure_seconds_check;
        ALTER TABLE project_integrations
          DROP CONSTRAINT IF EXISTS project_integrations_frame_count_check;
        ALTER TABLE project_integrations
          ADD CONSTRAINT project_integrations_exposure_seconds_check
          CHECK (exposure_seconds >= 0);
        ALTER TABLE project_integrations
          ADD CONSTRAINT project_integrations_frame_count_check
          CHECK (frame_count >= 0);
        ALTER TABLE project_integrations
          ADD COLUMN source TEXT NOT NULL DEFAULT 'measured'
          CHECK (source IN ('declared','measured'));
      `,
    },
  },
  {
    version: 82,
    name: "capture-revisions-and-image-quality",
    // A capture written by two hands.
    //
    // `captures.revision`: the revision of the capture, 1 at creation and
    // +1 at each write that changed something (a capture that has no
    // revision yet reads 1; nothing is migrated by a script). The value an
    // owner write names in `If-Match`.
    //
    // `capture_field_revisions`: for the conflict judged **by field**, the
    // revision of the last change of each field of the capture (`field` is
    // the metadata field by its name, or `tags`, `stage`, `visibility`,
    // `acquisition`) and, for `acquisition`, of each line (`line_id`; the
    // empty string is the field as a whole: the lines reset to the night's
    // steps). A line that was deleted keeps its row (the trace of the
    // change). A field that was never written has no row and conflicts
    // with no revision. No foreign key: the rows leave with the capture
    // (`owner-captures.js` `remove`).
    //
    // `capture_variants.quality_json`: the quality of a stacked image as
    // Astro Sync measured it on the linear master (`imageQuality`), written
    // under the capability `analysis.logs`, read by anyone who reads the
    // capture. NULL for every image that has none.
    statements: {
      common: `
        ALTER TABLE captures ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
        CREATE TABLE IF NOT EXISTS capture_field_revisions (
          capture_id TEXT NOT NULL,
          tenant_id TEXT NOT NULL,
          field TEXT NOT NULL,
          line_id TEXT NOT NULL DEFAULT '',
          revision INTEGER NOT NULL,
          PRIMARY KEY (capture_id, field, line_id)
        );
        ALTER TABLE capture_variants ADD COLUMN quality_json TEXT;
      `,
    },
  },
  {
    version: 83,
    name: "session-closed-by",
    // How a night was closed. The phone says
    // it when it finishes the session: `automatic` (the night closed by itself
    // at its end) or `manual` (the person's own « Terminer »). Written
    // by the finish, cleared by a reopen (the night resumed); NULL for every
    // session that never said — an earlier one, a debriefing's, an import's —
    // which reads « unknown », and nothing is migrated by a script.
    statements: {
      common: `
        ALTER TABLE observation_sessions ADD COLUMN closed_by TEXT;
        `,
    },
  },
  {
    version: 84,
    name: "capture-made-private-by-replacement",
    // A public capture whose image is replaced goes
    // back to private (the new image has passed no check), and the owner is
    // told so -- at the replacement, and on the capture afterwards, which an
    // Astro Sync replacement leaves unseen. `captures.replaced_made_private`
    // is 1 from the replacement that turned a public capture private until
    // the visibility is next written (the owner publishes it again, or
    // chooses private); 0 for every other capture.
    statements: {
      common: `
        ALTER TABLE captures ADD COLUMN replaced_made_private INTEGER NOT NULL DEFAULT 0;
      `,
    },
  },
  {
    version: 87,
    name: "sessions-soft-delete-and-archive-origin",
    // A session is deleted softly and kept
    // `SESSION_GRACE_DAYS` (30) days before the maintenance erases it
    // (`portal/api/session-trash.js`). `deleted_at` is the instant of the
    // deletion, NULL for a live session; a deleted session reads as absent
    // everywhere (the Journal, the debrief queue, the routes of a session)
    // except the trash. The deleted row keeps its `plan_id` so that a
    // restoration finds its plan, hence the unique index « one session per
    // plan » now counts the live sessions only: a plan whose session was
    // deleted can have a new one made from it.
    // `plans.archived_from`: the status a debriefed plan had when
    // it was archived (`executed`, `partial` or `abandoned`), so that
    // « Rétablir » gives it back and the Journal keeps reading its outcome.
    // It is NULL for every other plan.
    statements: {
      common: `
        ALTER TABLE observation_sessions ADD COLUMN deleted_at TEXT;
        ALTER TABLE plans ADD COLUMN archived_from TEXT;
        DROP INDEX IF EXISTS observation_sessions_tenant_plan_idx;
        CREATE UNIQUE INDEX IF NOT EXISTS observation_sessions_tenant_plan_idx
          ON observation_sessions(tenant_id, plan_id)
          WHERE plan_id IS NOT NULL AND deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS observation_sessions_deleted_idx
          ON observation_sessions(tenant_id, deleted_at);
      `,
    },
  },
  {
    version: 88,
    name: "capture-restored-at",
    // A capture comes back to the
    // devices when its session is restored from the trash. The first answer
    // moved `captures.created_at` forward (what `GET /v1/captures?since=`
    // compares), which rewrote the date the capture was added. A dedicated
    // column now says when the capture last came back: `restored_at`, NULL
    // for a capture that was never in a trash. `createdAt` is never touched;
    // the synchronisation reads the later of the two.
    statements: {
      common: `
        ALTER TABLE captures ADD COLUMN restored_at TEXT;
      `,
    },
  },
  {
    version: 89,
    name: "session-event-source",
    // `session_events.source` says where an
    // event comes from, set by the service from the credential of the call:
    // `astro-sync` for a device of the application Astro Sync, `declared`
    // for anything else (`session-event-ingest.schema.json` $defs.source).
    // NULL for a row written before this migration or by a path that has no
    // caller (a debriefing's generated events, an import): the reader then
    // says nothing about the origin. The events a rework adds live in
    // `rework_json` and carry their own `source` there.
    statements: {
      common: `
        ALTER TABLE session_events ADD COLUMN source TEXT;
      `,
    },
  },
  {
    version: 91,
    name: "capture-made-public-at",
    // « Publique depuis le … » in the sheet of a capture:
    // `captures.made_public_at` is the instant the
    // capture last turned public, so that the administration who opens a
    // capture, and its owner, can say since when it is public.
    //
    // The service writes it when a capture goes from private to public (the
    // owner's « Publique », « Valider » on a verification the owner asked
    // for) and clears it whenever the capture turns private again (the
    // owner's « Privée », « Refuser », the replacement of its image): the
    // column means the start of the current public period, never an
    // earlier one. A write that keeps a capture public leaves it alone.
    //
    // No backfill: nothing records when a capture that is already public
    // became so, and a date made up from `created_at` or `admin_check_at`
    // would be wrong. NULL on a public capture reads « date inconnue »;
    // NULL on a private one is the rule.
    statements: {
      common: `
        ALTER TABLE captures ADD COLUMN made_public_at TEXT;
      `,
    },
  },
  {
    version: 92,
    name: "target-texts",
    // The published pages of tiers B and C (tier C: about 15 900 targets in
    // every language, ≈ 350 MB) and the children's texts of every tier are
    // too big for the catalogue seed and for the memory of the service. They
    // travel as shards in the static-data package (`target-library/texts/`,
    // docs/STATIC_DATA.md) and the service imports them here, one shard at a
    // time:
    //
    // - `target_texts`: one row per target and language, `tier` A, B or C,
    //   `content` the JSON of the page the catalogue serves (`pageContent`;
    //   for tier A, whose page stays in the seed, the children's text alone),
    //   `revision` the digest of tier and content, `shard` the shard the row
    //   came from (so that a target that left its shard file is retired with
    //   that shard);
    // - `target_text_shards`: the digest of each shard file as last imported,
    //   so that an unchanged shard is never read again.
    //
    // No foreign key on the target: a shard may be imported before the
    // catalogue row exists, and the catalogue never deletes a row.
    statements: {
      common: `
        CREATE TABLE IF NOT EXISTS target_texts (
          target_id TEXT NOT NULL,
          locale TEXT NOT NULL,
          shard TEXT NOT NULL,
          tier TEXT NOT NULL,
          revision TEXT NOT NULL,
          content TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (target_id, locale)
        );
        CREATE INDEX IF NOT EXISTS target_texts_shard_idx
          ON target_texts(locale, shard);
        CREATE INDEX IF NOT EXISTS target_texts_tier_idx
          ON target_texts(locale, tier);
        CREATE TABLE IF NOT EXISTS target_text_shards (
          locale TEXT NOT NULL,
          shard TEXT NOT NULL,
          revision TEXT NOT NULL,
          targets INTEGER NOT NULL,
          imported_at TEXT NOT NULL,
          PRIMARY KEY (locale, shard)
        );
      `,
    },
  },
  {
    version: 93,
    name: "target-catalogue-reads",
    // The catalogue is read from the database, never held whole in memory (a
    // service with 1 GiB of memory ran out of it when the seed grew from 52.7
    // to 74.6 MB).
    // Additive only; everything here is derived from the rows of
    // `target_catalogue_entries` and rebuilt by the service whenever the
    // catalogue's revision moves (`target_catalogue_state.derived_revision`):
    //
    // - `catalogue_sequence`: the order in which the catalogue first wrote
    //   each row (SQLite's `rowid` order, kept on PostgreSQL too), the
    //   tie-break of `storage_rank`;
    // - `storage_rank`: the rows in the catalogue's storage order (the
    //   designation with ASCII letters folded, compared byte by byte, then
    //   `catalogue_sequence`), which decides the first of several targets
    //   sharing a lookup key; `designation_rank`: the rows in the catalogue's
    //   designation order (numeric collation, stable over `storage_rank`),
    //   the order every catalogue page starts from;
    // - `has_premium_image`, `has_distance`, `has_published_pages`: flags the
    //   reads filter or rank on without parsing the JSON columns;
    // - `target_catalogue_lookup_keys`: every lookup key of a target (its
    //   identifier, designation, aliases and common names, folded);
    // - `target_catalogue_names`: the catalogues a target belongs to;
    // - `target_catalogue_search`: the folded text a query is searched in,
    //   per language, built when a language is first searched
    //   (`target_catalogue_search_state` records for which revision);
    // - `target_catalogue_state.metadata_json`: the source line, licence and
    //   export date of the package the catalogue was imported from.
    statements: {
      sqlite: `
        ALTER TABLE target_catalogue_entries ADD COLUMN catalogue_sequence INTEGER;
        ALTER TABLE target_catalogue_entries ADD COLUMN storage_rank INTEGER;
        ALTER TABLE target_catalogue_entries ADD COLUMN designation_rank INTEGER;
        ALTER TABLE target_catalogue_entries
          ADD COLUMN has_premium_image INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE target_catalogue_entries
          ADD COLUMN has_distance INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE target_catalogue_entries
          ADD COLUMN has_published_pages INTEGER NOT NULL DEFAULT 0;
        CREATE INDEX IF NOT EXISTS target_catalogue_entries_rank_idx
          ON target_catalogue_entries(source_present, designation_rank);
        CREATE INDEX IF NOT EXISTS target_catalogue_entries_storage_idx
          ON target_catalogue_entries(storage_rank);
        CREATE INDEX IF NOT EXISTS target_catalogue_entries_sequence_idx
          ON target_catalogue_entries(catalogue_sequence);
        CREATE INDEX IF NOT EXISTS target_catalogue_entries_constellation_idx
          ON target_catalogue_entries(constellation_key, source_present);
        CREATE INDEX IF NOT EXISTS target_catalogue_entries_extended_idx
          ON target_catalogue_entries(is_extended, source_present);
        CREATE INDEX IF NOT EXISTS target_catalogue_entries_magnitude_idx
          ON target_catalogue_entries(magnitude);
        CREATE INDEX IF NOT EXISTS target_catalogue_entries_declination_idx
          ON target_catalogue_entries(dec_degrees);
        CREATE INDEX IF NOT EXISTS target_catalogue_entries_pages_idx
          ON target_catalogue_entries(has_published_pages);
        CREATE TABLE IF NOT EXISTS target_catalogue_lookup_keys (
          lookup_key TEXT NOT NULL,
          target_id TEXT NOT NULL,
          PRIMARY KEY (lookup_key, target_id)
        );
        CREATE INDEX IF NOT EXISTS target_catalogue_lookup_keys_target_idx
          ON target_catalogue_lookup_keys(target_id);
        CREATE TABLE IF NOT EXISTS target_catalogue_names (
          target_id TEXT NOT NULL,
          catalogue TEXT NOT NULL,
          PRIMARY KEY (target_id, catalogue)
        );
        CREATE INDEX IF NOT EXISTS target_catalogue_names_catalogue_idx
          ON target_catalogue_names(catalogue, target_id);
        CREATE TABLE IF NOT EXISTS target_catalogue_search (
          locale TEXT NOT NULL,
          target_id TEXT NOT NULL,
          folded TEXT NOT NULL,
          compact TEXT NOT NULL,
          PRIMARY KEY (locale, target_id)
        );
        CREATE TABLE IF NOT EXISTS target_catalogue_search_state (
          locale TEXT PRIMARY KEY,
          stamp TEXT NOT NULL,
          built_at TEXT NOT NULL
        );
        ALTER TABLE target_catalogue_state ADD COLUMN metadata_json TEXT;
        ALTER TABLE target_catalogue_state ADD COLUMN derived_revision INTEGER;
              -- SQLite reads a row's columns in order, and the rows hold their
        -- texts and source record before the columns added later: the pool a
        -- page reads (every present row) is served by this index alone.
        CREATE INDEX IF NOT EXISTS target_catalogue_entries_pool_idx
          ON target_catalogue_entries(
            source_present, designation_rank, id, designation, aliases_json,
            common_names_json, type_key, constellation_key, ra_hours,
            dec_degrees, apparent_size_arcmin_json, magnitude, catalogues_json,
            catalogue, is_best, is_extended, visible_from_northern_hemisphere,
            visible_from_southern_hemisphere, has_premium_image
          );
      `,
      postgres: `
        ALTER TABLE target_catalogue_entries ADD COLUMN catalogue_sequence INTEGER;
        ALTER TABLE target_catalogue_entries ADD COLUMN storage_rank INTEGER;
        ALTER TABLE target_catalogue_entries ADD COLUMN designation_rank INTEGER;
        ALTER TABLE target_catalogue_entries
          ADD COLUMN has_premium_image INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE target_catalogue_entries
          ADD COLUMN has_distance INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE target_catalogue_entries
          ADD COLUMN has_published_pages INTEGER NOT NULL DEFAULT 0;
        CREATE INDEX IF NOT EXISTS target_catalogue_entries_rank_idx
          ON target_catalogue_entries(source_present, designation_rank);
        CREATE INDEX IF NOT EXISTS target_catalogue_entries_storage_idx
          ON target_catalogue_entries(storage_rank);
        CREATE INDEX IF NOT EXISTS target_catalogue_entries_sequence_idx
          ON target_catalogue_entries(catalogue_sequence);
        CREATE INDEX IF NOT EXISTS target_catalogue_entries_constellation_idx
          ON target_catalogue_entries(constellation_key, source_present);
        CREATE INDEX IF NOT EXISTS target_catalogue_entries_extended_idx
          ON target_catalogue_entries(is_extended, source_present);
        CREATE INDEX IF NOT EXISTS target_catalogue_entries_magnitude_idx
          ON target_catalogue_entries(magnitude);
        CREATE INDEX IF NOT EXISTS target_catalogue_entries_declination_idx
          ON target_catalogue_entries(dec_degrees);
        CREATE INDEX IF NOT EXISTS target_catalogue_entries_pages_idx
          ON target_catalogue_entries(has_published_pages);
        CREATE TABLE IF NOT EXISTS target_catalogue_lookup_keys (
          lookup_key TEXT NOT NULL,
          target_id TEXT NOT NULL,
          PRIMARY KEY (lookup_key, target_id)
        );
        CREATE INDEX IF NOT EXISTS target_catalogue_lookup_keys_target_idx
          ON target_catalogue_lookup_keys(target_id);
        CREATE TABLE IF NOT EXISTS target_catalogue_names (
          target_id TEXT NOT NULL,
          catalogue TEXT NOT NULL,
          PRIMARY KEY (target_id, catalogue)
        );
        CREATE INDEX IF NOT EXISTS target_catalogue_names_catalogue_idx
          ON target_catalogue_names(catalogue, target_id);
        CREATE TABLE IF NOT EXISTS target_catalogue_search (
          locale TEXT NOT NULL,
          target_id TEXT NOT NULL,
          folded TEXT NOT NULL,
          compact TEXT NOT NULL,
          PRIMARY KEY (locale, target_id)
        );
        CREATE TABLE IF NOT EXISTS target_catalogue_search_state (
          locale TEXT PRIMARY KEY,
          stamp TEXT NOT NULL,
          built_at TEXT NOT NULL
        );
        ALTER TABLE target_catalogue_state ADD COLUMN metadata_json TEXT;
        ALTER TABLE target_catalogue_state ADD COLUMN derived_revision INTEGER;
      `,
    },
  },
  {
    version: 94,
    name: "target-texts-own-file",
    // The catalogue texts leave the backups. Under SQLite, `target_texts`
    // and `target_text_shards` live in a second database file that the
    // driver attaches to every connection and defines itself
    // (reimported-data.ts): this drops the copies of the main file, which
    // migration 92 created and which an unqualified name would otherwise
    // reach first. Their rows are imported again from the static data into
    // the attached file (`target_text_shards` starts empty there). Under
    // PostgreSQL the tables stay; the backup scripts dump their definition
    // without their rows (backup/postgres.js).
    statements: {
      sqlite: `
        DROP TABLE IF EXISTS main.target_texts;
        DROP TABLE IF EXISTS main.target_text_shards
      `,
      postgres: `
        SELECT 1
      `,
    },
  },
  {
    version: 95,
    name: "session-origin-capture",
    // A capture always has its session. A session born from a capture the
    // person adds (a night not conducted with the application) is created
    // with `origin: "capture"`, a fifth value of the closed list migration
    // 80 wrote as a CHECK on the column. PostgreSQL replaces the constraint
    // in place (`observation_sessions_origin_check`, the name its ADD COLUMN
    // gave it). SQLite cannot alter a CHECK: the column is added again under
    // its new definition, filled from the old one, the old one dropped and
    // the new one renamed (no index, key, trigger or view touches `origin`;
    // no table is rebuilt, so no foreign key is at stake).
    statements: {
      postgres: `
        ALTER TABLE observation_sessions
          DROP CONSTRAINT IF EXISTS observation_sessions_origin_check;
        ALTER TABLE observation_sessions ADD CONSTRAINT observation_sessions_origin_check
          CHECK (origin IS NULL OR origin IN ('execution', 'debrief', 'import', 'astro-sync', 'capture'));
      `,
      sqlite: `
        ALTER TABLE observation_sessions ADD COLUMN origin_next TEXT
          CHECK (origin_next IS NULL OR origin_next IN ('execution', 'debrief', 'import', 'astro-sync', 'capture'));
        UPDATE observation_sessions SET origin_next = origin;
        ALTER TABLE observation_sessions DROP COLUMN origin;
        ALTER TABLE observation_sessions RENAME COLUMN origin_next TO origin;
      `,
    },
  },
  {
    version: 96,
    name: "telescope-catalogue-2",
    // The default catalogue gets the four smart telescopes migration 71
    // lacked — Vaonis Vespera, Vespera Pro, Atlas and Stellina — as rows of
    // scope `default` of the platform organisation, in
    // `telescope-catalogue-2-seed.js` (this migration's own history).
    // `ON CONFLICT DO NOTHING`: a row the administration already holds under
    // one of these identifiers is never rewritten; the earlier seeds are not
    // touched.
    statements: {
      common: telescopeCatalogue2SeedSql(),
    },
  },
  {
    version: 97,
    name: "space-retention",
    // Archiving and inactivity retention. The columns are the core's —
    // its galleries read them — but only a periodic maintenance registered
    // by an extension writes them; a private server never archives nor
    // deletes.
    //
    // - `captures.archived_at`, `capture_variants.archived_at`: archived:
    //   kept, exported, shown in « Mes captures » with a label, never in a
    //   gallery.
    // - `organizations.last_activity_at`: the space's last authenticated
    //   request (a device, a web session), written at most once an hour.
    //   Every existing space starts its inactivity count at this migration.
    statements: {
      sqlite: `
        ALTER TABLE captures ADD COLUMN archived_at TEXT;
        ALTER TABLE capture_variants ADD COLUMN archived_at TEXT;
        ALTER TABLE organizations ADD COLUMN last_activity_at TEXT;
        UPDATE organizations
          SET last_activity_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
        CREATE INDEX IF NOT EXISTS captures_archived_idx
          ON captures(tenant_id) WHERE archived_at IS NOT NULL
      `,
      postgres: `
        ALTER TABLE captures ADD COLUMN archived_at TEXT;
        ALTER TABLE capture_variants ADD COLUMN archived_at TEXT;
        ALTER TABLE organizations ADD COLUMN last_activity_at TEXT;
        UPDATE organizations
          SET last_activity_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
        CREATE INDEX IF NOT EXISTS captures_archived_idx
          ON captures(tenant_id) WHERE archived_at IS NOT NULL
      `,
    },
  },
  {
    version: 99,
    name: "capture-default-generic-tag",
    // A capture takes by default the generic tag
    // of its target's type (« Nébuleuse » for an emission nebula), kept among
    // its tags (`capture_tags`) and translated by every page. The service
    // writes it when a capture is created (`capture-repository.js`,
    // `applyDefaultTag`); this gives it to the captures that already exist
    // and have no generic tag yet. The words are the stored values of
    // `captures/generic-tags.js` (a migration never reads the code that may
    // change after it). Idempotent: a capture that has a generic tag, or 20
    // tags, is left as it is, so a second run writes nothing; and it runs
    // once, so an owner who removed the tag afterwards keeps it removed. A
    // capture without a target gets none (the galleries say « Grand champ »
    // of it by themselves), nor a type without a generic tag (« Système
    // solaire »).
    statements: {
      common: `
        INSERT INTO capture_tags (capture_id, tenant_id, tag)
        SELECT d.capture_id, d.tenant_id, d.tag
        FROM (
          SELECT s.capture_id AS capture_id, s.tenant_id AS tenant_id,
            CASE
              WHEN s.first_target IS NULL THEN NULL
              WHEN t.library_source = 'personal' THEN
                CASE
                  WHEN t.gallery_label IN ('Galaxie', 'Nébuleuse', 'Amas',
                    'Lune', 'Planète', 'Soleil', 'Étoile', 'Comète')
                    THEN t.gallery_label
                  ELSE 'Grand champ'
                END
              WHEN t.type_key = 'Galaxie' THEN 'Galaxie'
              WHEN t.type_key IN ('Nébuleuse en émission',
                'Nébuleuse en réflexion', 'Nébuleuse planétaire',
                'Nébuleuse sombre', 'Rémanent de supernova',
                'Complexe de nébuleuses en émission',
                'Région H II / nébuleuse en émission',
                'Région HII / nébuleuse en émission') THEN 'Nébuleuse'
              WHEN t.type_key IN ('Amas globulaire', 'Amas ouvert') THEN 'Amas'
              WHEN t.type_key = 'Lune' THEN 'Lune'
              WHEN t.type_key IN ('Planète', 'Planète naine') THEN 'Planète'
              WHEN t.type_key = 'Soleil' THEN 'Soleil'
              WHEN t.type_key = 'Étoile' THEN 'Étoile'
              WHEN t.type_key = 'Comète' THEN 'Comète'
              ELSE NULL
            END AS tag
          FROM (
            SELECT c.id AS capture_id, c.tenant_id AS tenant_id,
              COALESCE(
                (SELECT ct.target_id FROM capture_targets ct
                  WHERE ct.capture_id = c.id
                  ORDER BY ct.position LIMIT 1),
                c.target_id) AS first_target
            FROM captures c
          ) s
          LEFT JOIN target_catalogue_entries t
            ON t.id = s.first_target
           AND (t.space_id IS NULL OR t.space_id = s.tenant_id)
        ) d
        WHERE d.tag IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM capture_tags g
            WHERE g.capture_id = d.capture_id
              AND g.tag IN ('Galaxie', 'Nébuleuse', 'Amas', 'Lune', 'Planète',
                'Soleil', 'Étoile', 'Comète', 'Grand champ'))
          AND (SELECT COUNT(*) FROM capture_tags n
                WHERE n.capture_id = d.capture_id) < 20
      `,
    },
  },
  {
    version: 100,
    name: "capture-quality-switches",
    // The statistics are shown on the private and the public gallery, with a
    // switch saying whether to show them on each: the quality
    // of an image as Astro Sync measured it (`capture_variants.quality_json`,
    // migration 82) is shown in the capture's page of the private gallery
    // while `captures.quality_private` is 1 (on by default) and in the
    // public gallery's while `captures.quality_public` is 1 (off by
    // default). Two switches per capture, the owner's, like
    // `captures.sky_annotations`; a visitor reads nothing while the
    // switch of the gallery they are in is off.
    statements: {
      common: `
        ALTER TABLE captures ADD COLUMN quality_private INTEGER NOT NULL
          DEFAULT 1 CHECK (quality_private IN (0,1));
        ALTER TABLE captures ADD COLUMN quality_public INTEGER NOT NULL
          DEFAULT 0 CHECK (quality_public IN (0,1))
      `,
    },
  },
  {
    version: 102,
    name: "capture-variant-title-90",
    // An image's title may now be 90 characters (it was 60): the title Astro
    // Sync gives an image says its settings (« Rendu naturel · Contraste 3,6 ·
    // Couleurs +40 % · Étoiles adoucies 85 % » is 70). The description stays
    // at 280. A title already stored (at most 60) is valid as it is.
    //
    // PostgreSQL replaces the column's check in place. SQLite cannot: its own
    // procedure rebuilds the table (as migration 72 does for `captures`),
    // foreign keys switched off by the runner around the transaction
    // (`sqliteRebuildsReferencedTable`) since `capture_sky_solutions`
    // references `capture_variants(id)`; its declaration names the table, so
    // it follows the rebuilt one. The columns are those of migration 17 and the
    // ones added since (the title and description, their origin, the role and
    // frame count, the quality, the archive), in their order and with their
    // checks; the three named indexes of the table are
    // created again; it carries no trigger. Like every migration of this
    // list, it has no way down: a database is brought back by its backup.
    sqliteRebuildsReferencedTable: true,
    statements: {
      postgres: `
        ALTER TABLE capture_variants
          DROP CONSTRAINT IF EXISTS capture_variants_title_check;
        ALTER TABLE capture_variants
          ADD CONSTRAINT capture_variants_title_check
          CHECK (title IS NULL OR length(title) BETWEEN 1 AND 90)
      `,
      sqlite: `
        DROP TABLE IF EXISTS capture_variants_rebuilt;
        CREATE TABLE capture_variants_rebuilt (
          id TEXT PRIMARY KEY,
          capture_id TEXT NOT NULL REFERENCES captures(id),
          tenant_id TEXT NOT NULL REFERENCES organizations(id),
          sha256 TEXT NOT NULL,
          byte_size INTEGER NOT NULL,
          original_name TEXT NOT NULL,
          width INTEGER,
          height INTEGER,
          source TEXT
            CHECK (source IN ('phone','web','astro-sync','stacking')),
          is_main INTEGER NOT NULL DEFAULT 0 CHECK (is_main IN (0,1)),
          is_public INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0,1)),
          auto_check TEXT
            CHECK (auto_check IN ('sky','undetermined','other')),
          auto_check_reason TEXT,
          auto_check_at TEXT,
          created_at TEXT NOT NULL,
          title TEXT
            CHECK (title IS NULL OR length(title) BETWEEN 1 AND 90),
          description TEXT
            CHECK (description IS NULL OR length(description) BETWEEN 1 AND 280),
          title_source TEXT
            CHECK (title_source IS NULL OR title_source IN ('astro-sync','import','owner')),
          edited_at TEXT,
          role TEXT
            CHECK (role IS NULL OR role IN ('progression')),
          frame_count INTEGER
            CHECK (frame_count IS NULL OR frame_count >= 1),
          quality_json TEXT,
          archived_at TEXT
        );
        INSERT INTO capture_variants_rebuilt (
          id, capture_id, tenant_id, sha256, byte_size, original_name, width,
          height, source, is_main, is_public, auto_check, auto_check_reason,
          auto_check_at, created_at, title, description, title_source,
          edited_at, role, frame_count, quality_json, archived_at
        )
          SELECT
            id, capture_id, tenant_id, sha256, byte_size, original_name, width,
            height, source, is_main, is_public, auto_check, auto_check_reason,
            auto_check_at, created_at, title, description, title_source,
            edited_at, role, frame_count, quality_json, archived_at
          FROM capture_variants;
        DROP TABLE capture_variants;
        ALTER TABLE capture_variants_rebuilt RENAME TO capture_variants;
        CREATE UNIQUE INDEX IF NOT EXISTS capture_variants_tenant_sha256_idx
          ON capture_variants(tenant_id, sha256);
        CREATE UNIQUE INDEX IF NOT EXISTS capture_variants_main_idx
          ON capture_variants(capture_id) WHERE is_main = 1;
        CREATE INDEX IF NOT EXISTS capture_variants_capture_idx
          ON capture_variants(capture_id, created_at)
      `,
    },
  },
  {
    version: 103,
    name: "capture-variant-generated-texts",
    // The texts a producer generated for an image, in the ten languages of
    // the locale registry, kept apart from the owner's `title` and
    // `description` (only what he types): Astro Sync's name of the
    // processing and its settings (`generated_title_json`, 90 characters a
    // language) and the pipeline's description (`generated_description_json`,
    // 280), each a JSON object keyed by the language's tag, English required
    // (`captures/image-texts.js`). A reader shows the owner's text, else the
    // generated one in his language, else English. Nothing is moved here: a
    // title Astro Sync wrote before stays in `title` (`title_source`
    // `astro-sync`) until Astro Sync sends the generated texts of the image,
    // which clear it (`capture-metadata.js`, `recordVariantProposal`).
    statements: {
      common: `
        ALTER TABLE capture_variants ADD COLUMN generated_title_json TEXT;
        ALTER TABLE capture_variants ADD COLUMN generated_description_json TEXT;
      `,
    },
  },
  {
    version: 104,
    name: "capture-variant-processing",
    // What made *this* image, as its producer proposed it (`{ software?,
    // steps?, source }` as JSON): the capture shows the steps of its main
    // image, so they follow the main image when the owner picks another one
    // (`captures/capture-metadata.js`, `recordVariantProcessing`). Nothing is
    // moved here: an image sent before keeps `NULL` and leaves the capture's
    // steps as they are when it becomes the main one.
    statements: {
      common: `
        ALTER TABLE capture_variants ADD COLUMN processing_json TEXT
      `,
    },
  },
  {
    version: 107,
    name: "telescope-catalogue-3",
    // The default catalogue gets the refractors, reflectors, eyepieces,
    // cameras, Barlows and focal reducers the earlier catalogues lacked, as
    // rows of scope `default` of the platform organisation, in
    // `telescope-catalogue-3-seed.js` (this migration's own history).
    // `ON CONFLICT DO NOTHING`: a row the administration already holds under
    // one of these identifiers is never rewritten; the earlier seeds are not
    // touched.
    statements: {
      common: telescopeCatalogue3SeedSql(),
    },
  },
  {
    version: 108,
    name: "default-equipment-maker-kind",
    // Every telescope, camera, eyepiece, Barlow and reducer of « Matériel
    // par défaut » gets its maker and its kind in `planner_json`
    // (`planner.maker`, `planner.kind`: the pickers' « Marque » and « Type »
    // menus), from `default-equipment-maker-kind-seed.js` (this migration's
    // own history). Merged, never replaced: a row the administration edited
    // keeps its other keys; the rows of a space are not touched.
    statements: {
      postgres: defaultEquipmentMakerKindSql("postgres"),
      sqlite: defaultEquipmentMakerKindSql("sqlite"),
    },
  },
  {
    version: 109,
    name: "constellation-keys-iau",
    // A constellation is keyed by its IAU abbreviation (`Lyr`) in the shared
    // catalogue's rows (`constellation_key`) and in the keys an administrator
    // wrote into their overrides, from `constellation-key-seed.js` (this
    // migration's own history): the French names (« Lyre ») and the
    // spellings that had slipped in (« Se1 » / « Se2 » for the one Serpent,
    // « Air Pump », « Boötes » / « Bootes »). The bright stars and the 88
    // constellations are catalogue entries the service imports itself, and the
    // targets with no constellation are placed by their position at the next
    // import: nothing is inserted here.
    statements: {
      postgres: constellationKeySql("postgres"),
      sqlite: constellationKeySql("sqlite"),
    },
  },
  {
    version: 110,
    name: "capture-file-deletions",
    // The deletion of a capture's files, kept as a task. The rows of a
    // capture, of an image or of a replaced image are deleted in a
    // transaction, and the files (the original, the thumbnail, the shared
    // copy) afterwards, in the capture store; a store that did not answer
    // used to leave the files with no row to name them. The task is written
    // in the same transaction as the rows it follows: tried at once, and
    // while it stays here the hourly maintenance tries it again, a longer
    // time after each failure (`attempts`, `next_attempt_at`, the last
    // error). `scope` is `all` (the original and every derived file) or
    // `derived` (the derived files only, for an image deleted while it was
    // processed). One task per space, digest and scope; no digest is
    // removed while an image of the space holds it again. No foreign key: the
    // sweep of orphans (`captures/orphans.js`) also names the files of a
    // space the database no longer knows.
    statements: {
      common: `
        CREATE TABLE IF NOT EXISTS capture_file_deletions (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          sha256 TEXT NOT NULL,
          scope TEXT NOT NULL CHECK (scope IN ('all', 'derived')),
          created_at TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          next_attempt_at TEXT NOT NULL,
          last_error TEXT,
          UNIQUE (tenant_id, sha256, scope)
        );
        CREATE INDEX IF NOT EXISTS capture_file_deletions_due_idx
          ON capture_file_deletions(next_attempt_at)
      `,
    },
  },
  {
    version: 111,
    name: "plan-trash",
    // The plans get the trash the sessions have: a plan of one night or a
    // multi-night plan the owner deletes stays 30 days in « Plans
    // supprimés », restorable, then the hourly maintenance erases it.
    // `purge_at` is the instant of that erasure; a plan deleted before this
    // migration (its `deleted_at` set, its `purge_at` NULL) stays the hidden
    // row it was, never listed nor erased. A multi-night plan keeps in
    // `trash_json` what its deletion did to its nights (the plans of one night
    // that went with it, the plans and sessions it was detached from), so
    // that its restoration gives them back.
    statements: {
      common: `
        ALTER TABLE plans ADD COLUMN purge_at TEXT;
        ALTER TABLE projects ADD COLUMN purge_at TEXT;
        ALTER TABLE projects ADD COLUMN trash_json TEXT;
        CREATE INDEX IF NOT EXISTS plans_purge_idx ON plans(purge_at);
        CREATE INDEX IF NOT EXISTS projects_purge_idx ON projects(purge_at)
      `,
    },
  },
  {
    version: 112,
    name: "abandoned-plans-decided",
    // A plan a device closed as abandoned (`payload.closedAs`, stored in
    // `settings_json`) is decided « Abandonné » by the write that closes it
    // from now on (planner-state-repository.js, `freezeAbandonedClosure`):
    // `status` `abandoned` and `frozen_at` set, so that it leaves the debrief
    // queue, which lists the plans still `pending`. The plans closed before
    // this migration are caught up here, once: a plan still `pending`, not
    // frozen, whose settings carry `closedAs: abandoned`, gets the same two
    // columns; the instant of its decision is the one of its last write. No
    // revision moves and no session is made or touched, as when a decision
    // freezes a plan; the Journal and the lists read the plan's state from
    // its status as ever. Data only, no schema: a plan « recreated » for a
    // new debriefing afterwards (`POST /v1/plans/{id}/session`) stays pending.
    statements: {
      common: `
        UPDATE plans
        SET status = 'abandoned', frozen_at = COALESCE(updated_at, created_at)
        WHERE status = 'pending' AND frozen_at IS NULL
          AND settings_json LIKE '%"closedAs":"abandoned"%'
      `,
    },
  },
  {
    version: 113,
    name: "plans-guided-evening",
    // The internal plan of a guided evening (`payload.guidedEvening`, stored
    // in `settings_json`) is a plan only for the sake of the data model: it
    // is outside the rule « un plan par nuit » and « une nuit = un lieu »,
    // outside the numeric guard, outside the debrief queue and outside the
    // night's execution. `guided_evening` is the flag the service filters on
    // (0 or 1, as the other flags of the schema), set by every write of a
    // plan from its payload. The plans written before this migration that
    // already carry the flag in their settings are caught up here, once.
    statements: {
      common: `
        ALTER TABLE plans ADD COLUMN guided_evening INTEGER NOT NULL DEFAULT 0;
        UPDATE plans SET guided_evening = 1
        WHERE settings_json LIKE '%"guidedEvening":true%'
      `,
    },
  },
  {
    version: 114,
    name: "device-tokens-client-version",
    // Which build each device runs (`api/client-identity.js`): the version
    // (`1.0.4+126`) and the system (`iOS 18.1`) its `X-PlanAstro-Client`
    // header names, written with `last_seen_at` by the device's own requests
    // and kept as they were when a request names none. Null until the device
    // sends the header. Columns only.
    statements: {
      common: `
        ALTER TABLE device_tokens ADD COLUMN app_version TEXT;
        ALTER TABLE device_tokens ADD COLUMN os_version TEXT
      `,
    },
  },
  {
    version: 131,
    name: "equipment-catalogue-4",
    // The default catalogue gets the entries of EQUIPMENT-CATALOGUE-01 (the
    // mounts, the telescopes, cameras, eyepieces, Barlows and reducers of
    // Sky Rover, ZWO, Takahashi, Explore Scientific, Player One, QHYCCD,
    // Altair, Svbony and the others, and the filters of Optolong,
    // Astronomik, ZWO and ToupTek), as rows of scope `default` of the
    // platform organisation, in `equipment-catalogue-4-seed.js` (this
    // migration's own history). `ON CONFLICT DO NOTHING`: a row the
    // administration already holds under one of these identifiers is never
    // rewritten; the earlier seeds are not touched. The number follows the
    // numbering of the compositions that extend this runner.
    statements: {
      common: equipmentCatalogue4SeedSql(),
    },
  },
  {
    version: 133,
    name: "equipment-catalogue-5",
    // The default catalogue gets the entries of EQUIPMENT-CATALOGUE-02 (the
    // telescopes of Astro-Tech, Omegon, GSO and Lacerta, the cameras of Atik,
    // QHYCCD, Pentax and OM System, the Tele Vue eyepieces, the Sky-Watcher
    // Wave and ZWO AM3 mounts, and the filters of Antlia, IDAS, Baader,
    // Chroma, Optolong, Svbony and Astronomik), as rows of scope `default` of
    // the platform organisation, in `equipment-catalogue-5-seed.js` (this
    // migration's own history). `ON CONFLICT DO NOTHING`: a row the
    // administration already holds under one of these identifiers is never
    // rewritten; the earlier seeds are not touched.
    statements: {
      common: equipmentCatalogue5SeedSql(),
    },
  },
];

export function statementsFor(
  migration: Migration,
  dialect: "postgres" | "sqlite",
): string[] {
  const dialectStatement = migration.statements[dialect];
  if (dialectStatement?.trim()) return [dialectStatement];

  const commonStatement = migration.statements.common;
  return commonStatement?.trim() ? [commonStatement] : [];
}
