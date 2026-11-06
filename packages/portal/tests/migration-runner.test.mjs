import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { migrations, statementsFor } from "../dist/persistence/migrations.js";
import { PostgresDriver } from "../dist/persistence/postgres-driver.js";
import { SqliteDriver } from "../dist/persistence/sqlite-driver.js";

async function migrationCount(driver) {
  return Number(
    (await driver.query("SELECT COUNT(*) AS count FROM schema_migrations"))
      .rows[0]?.count,
  );
}

const timestamp = "2026-09-14T00:00:00.000Z";

async function assertMobilePlanResourceSchema(driver) {
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    ["tenant-1", "Test observatory", timestamp],
  );
  await driver.run(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
    ["user-1", "migration@example.test", "scrypt$test", timestamp],
  );
  await driver.run(
    "INSERT INTO plans (id, tenant_id, created_by_user_id, client_id, plan_date, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      "plan-1",
      "tenant-1",
      "user-1",
      "client-plan-1",
      "2026-09-14",
      "Migration plan",
      timestamp,
      timestamp,
    ],
  );

  const plan = (
    await driver.query(
      "SELECT revision, night_end_at, frozen_at, payload_json, deleted_at FROM plans WHERE id = ?",
      ["plan-1"],
    )
  ).rows[0];
  assert.deepEqual(plan, {
    revision: 1,
    night_end_at: null,
    frozen_at: null,
    payload_json: null,
    deleted_at: null,
  });

  await driver.run("UPDATE plans SET deleted_at = ? WHERE id = ?", [
    timestamp,
    "plan-1",
  ]);
  assert.equal(
    Number(
      (
        await driver.query(
          "SELECT COUNT(*) AS count FROM plans WHERE tenant_id = ? AND deleted_at IS NULL",
          ["tenant-1"],
        )
      ).rows[0]?.count,
    ),
    0,
  );
  await driver.run("UPDATE plans SET deleted_at = NULL WHERE id = ?", [
    "plan-1",
  ]);

  await driver.run(
    "INSERT INTO device_tokens (id, tenant_id, user_id, label, token_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [
      "device-1",
      "tenant-1",
      "user-1",
      "Field phone",
      "sha256-token",
      timestamp,
    ],
  );
  await driver.run(
    "INSERT INTO device_pairings (code, tenant_id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    ["A1B2C3D4", "tenant-1", "user-1", timestamp, "2026-09-14T00:10:00.000Z"],
  );

  const device = (
    await driver.query(
      "SELECT id, tenant_id, user_id, label, token_hash, last_seen_at, last_sync_at, revoked_at FROM device_tokens WHERE id = ?",
      ["device-1"],
    )
  ).rows[0];
  assert.deepEqual(device, {
    id: "device-1",
    tenant_id: "tenant-1",
    user_id: "user-1",
    label: "Field phone",
    token_hash: "sha256-token",
    last_seen_at: null,
    last_sync_at: null,
    revoked_at: null,
  });

  const pairing = (
    await driver.query(
      "SELECT code, tenant_id, user_id, claimed_at FROM device_pairings WHERE code = ?",
      ["A1B2C3D4"],
    )
  ).rows[0];
  assert.deepEqual(pairing, {
    code: "A1B2C3D4",
    tenant_id: "tenant-1",
    user_id: "user-1",
    claimed_at: null,
  });

  const versions = [
    ["version-a", '{"source":"device-a"}', "2026-10-14T00:00:00.000Z"],
    ["version-b", '{"source":"device-b"}', "2026-10-15T00:00:00.000Z"],
  ];
  for (const [id, payloadJson, purgeAfter] of versions) {
    await driver.run(
      "INSERT INTO plan_versions (id, tenant_id, plan_id, revision, state, origin_device_id, payload_json, created_at, purge_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        id,
        "tenant-1",
        "plan-1",
        1,
        "set_aside",
        "device-1",
        payloadJson,
        timestamp,
        purgeAfter,
      ],
    );
  }

  const savedVersions = await driver.query(
    "SELECT id, plan_id, revision, state, origin_device_id, payload_json, purge_after FROM plan_versions WHERE plan_id = ? ORDER BY id",
    ["plan-1"],
  );
  assert.deepEqual(savedVersions.rows, [
    {
      id: "version-a",
      plan_id: "plan-1",
      revision: 1,
      state: "set_aside",
      origin_device_id: "device-1",
      payload_json: '{"source":"device-a"}',
      purge_after: "2026-10-14T00:00:00.000Z",
    },
    {
      id: "version-b",
      plan_id: "plan-1",
      revision: 1,
      state: "set_aside",
      origin_device_id: "device-1",
      payload_json: '{"source":"device-b"}',
      purge_after: "2026-10-15T00:00:00.000Z",
    },
  ]);

  await driver.run("DELETE FROM plans WHERE id = ?", ["plan-1"]);
  assert.equal(
    Number(
      (
        await driver.query(
          "SELECT COUNT(*) AS count FROM plan_versions WHERE plan_id = ?",
          ["plan-1"],
        )
      ).rows[0]?.count,
    ),
    2,
  );
}

// Exercises migration 17. Run after assertMobilePlanResourceSchema, which
// leaves "tenant-1"/"user-1"/"device-1" in place (it only deletes plan-1).
async function assertObservationSessionsAndCapturesSchema(driver) {
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    ["tenant-2", "Second observatory", timestamp],
  );
  await driver.run(
    "INSERT INTO plans (id, tenant_id, created_by_user_id, client_id, plan_date, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      "session-plan-1",
      "tenant-1",
      "user-1",
      "client-session-plan-1",
      "2026-09-16",
      "Session-linked plan",
      timestamp,
      timestamp,
    ],
  );

  // The table is named observation_sessions, not "sessions": migration 1's
  // "sessions" table already holds web-portal auth sessions.
  await driver.run(
    "INSERT INTO observation_sessions (id, tenant_id, plan_id, started_at, created_at) VALUES (?, ?, ?, ?, ?)",
    ["session-1", "tenant-1", "session-plan-1", timestamp, timestamp],
  );
  const session = (
    await driver.query(
      "SELECT id, tenant_id, plan_id, started_at, finished_at, status FROM observation_sessions WHERE id = ?",
      ["session-1"],
    )
  ).rows[0];
  assert.deepEqual(session, {
    id: "session-1",
    tenant_id: "tenant-1",
    plan_id: "session-plan-1",
    started_at: timestamp,
    finished_at: null,
    status: "open", // DEFAULT 'open' applied without specifying the column.
  });

  await assert.rejects(
    driver.run(
      "INSERT INTO observation_sessions (id, tenant_id, started_at, created_at, status) VALUES (?, ?, ?, ?, ?)",
      ["session-bogus-status", "tenant-1", timestamp, timestamp, "bogus"],
    ),
    /CHECK|constraint/i,
  );

  // A direct session (no plan) is a first-class path.
  await driver.run(
    "INSERT INTO observation_sessions (id, tenant_id, started_at, created_at) VALUES (?, ?, ?, ?)",
    ["session-2", "tenant-1", timestamp, timestamp],
  );

  await driver.run(
    "INSERT INTO session_events (event_id, session_id, type, payload, recorded_at, received_at, origin_device_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      "evt-1",
      "session-1",
      "note",
      '{"text":"clear skies"}',
      timestamp,
      timestamp,
      "device-1",
    ],
  );
  const event = (
    await driver.query(
      "SELECT event_id, session_id, type, payload, origin_device_id FROM session_events WHERE session_id = ? AND event_id = ?",
      ["session-1", "evt-1"],
    )
  ).rows[0];
  assert.deepEqual(event, {
    event_id: "evt-1",
    session_id: "session-1",
    type: "note",
    payload: '{"text":"clear skies"}',
    origin_device_id: "device-1",
  });

  // Primary key is (session_id, event_id): the same pair twice is rejected...
  await assert.rejects(
    driver.run(
      "INSERT INTO session_events (event_id, session_id, type, payload, recorded_at, received_at) VALUES (?, ?, ?, ?, ?, ?)",
      [
        "evt-1",
        "session-1",
        "note",
        '{"text":"duplicate"}',
        timestamp,
        timestamp,
      ],
    ),
    /UNIQUE|constraint|PRIMARY/i,
  );
  // ...but the same event_id under a different session is a distinct row.
  await driver.run(
    "INSERT INTO session_events (event_id, session_id, type, payload, recorded_at, received_at) VALUES (?, ?, ?, ?, ?, ?)",
    [
      "evt-1",
      "session-2",
      "note",
      '{"text":"other session"}',
      timestamp,
      timestamp,
    ],
  );
  assert.equal(
    Number(
      (
        await driver.query(
          "SELECT COUNT(*) AS count FROM session_events WHERE event_id = ?",
          ["evt-1"],
        )
      ).rows[0]?.count,
    ),
    2,
  );

  // session_events has no update/delete path: only insert and select are
  // exercised here, matching the append-only design.
  await assert.rejects(
    driver.run(
      "INSERT INTO session_events (event_id, session_id, type, payload, recorded_at, received_at) VALUES (?, ?, ?, ?, ?, ?)",
      ["evt-orphan", "session-missing", "note", "{}", timestamp, timestamp],
    ),
    /FOREIGN KEY|constraint/i,
  );

  await driver.run(
    "INSERT INTO session_supplements (id, session_id, origin_device_id, payload, created_at) VALUES (?, ?, ?, ?, ?)",
    [
      "supplement-1",
      "session-1",
      "device-1",
      '{"note":"field data"}',
      timestamp,
    ],
  );
  const supplement = (
    await driver.query(
      "SELECT id, session_id, status FROM session_supplements WHERE id = ?",
      ["supplement-1"],
    )
  ).rows[0];
  assert.deepEqual(supplement, {
    id: "supplement-1",
    session_id: "session-1",
    status: "proposed", // DEFAULT 'proposed' applied.
  });
  await assert.rejects(
    driver.run(
      "INSERT INTO session_supplements (id, session_id, payload, created_at, status) VALUES (?, ?, ?, ?, ?)",
      ["supplement-bogus", "session-1", "{}", timestamp, "bogus"],
    ),
    /CHECK|constraint/i,
  );

  await driver.run(
    "INSERT INTO captures (id, tenant_id, session_id, original_name, sha256, byte_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      "capture-1",
      "tenant-1",
      "session-1",
      "m31.tif",
      "a".repeat(64),
      1024,
      timestamp,
    ],
  );
  const capture = (
    await driver.query(
      "SELECT id, tenant_id, sha256, status FROM captures WHERE id = ?",
      ["capture-1"],
    )
  ).rows[0];
  assert.deepEqual(capture, {
    id: "capture-1",
    tenant_id: "tenant-1",
    sha256: "a".repeat(64),
    status: "draft", // DEFAULT 'draft' applied.
  });

  // Re-sending the same bytes for the same tenant must be rejected at the
  // database level, which is what makes the upload idempotency safe even under
  // a race between two concurrent requests.
  await assert.rejects(
    driver.run(
      "INSERT INTO captures (id, tenant_id, original_name, sha256, byte_size, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [
        "capture-1-dup",
        "tenant-1",
        "m31-again.tif",
        "a".repeat(64),
        2048,
        timestamp,
      ],
    ),
    /UNIQUE|constraint/i,
  );
  // The same bytes for a different tenant are a distinct capture.
  await driver.run(
    "INSERT INTO captures (id, tenant_id, original_name, sha256, byte_size, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ["capture-2", "tenant-2", "m31.tif", "a".repeat(64), 1024, timestamp],
  );
  await assert.rejects(
    driver.run(
      "INSERT INTO captures (id, tenant_id, original_name, sha256, byte_size, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        "capture-bogus",
        "tenant-1",
        "x.tif",
        "b".repeat(64),
        1,
        timestamp,
        "bogus",
      ],
    ),
    /CHECK|constraint/i,
  );
}

// Exercises migration 18, added after 17 for the multi-target plans. Run after assertObservationSessionsAndCapturesSchema, which
// leaves "capture-1" (tenant-1) and "capture-2" (tenant-2) in place.
async function assertCaptureTargetAssociationsSchema(driver) {
  await driver.run(
    "INSERT INTO capture_targets (capture_id, target_id, position) VALUES (?, ?, ?)",
    ["capture-1", "m31", 0],
  );
  await driver.run(
    "INSERT INTO capture_targets (capture_id, target_id, position) VALUES (?, ?, ?)",
    ["capture-1", "ngc224", 1],
  );
  const targets = (
    await driver.query(
      "SELECT target_id, position FROM capture_targets WHERE capture_id = ? ORDER BY position",
      ["capture-1"],
    )
  ).rows;
  assert.deepEqual(targets, [
    { target_id: "m31", position: 0 },
    { target_id: "ngc224", position: 1 },
  ]);

  // The primary key is (capture_id, target_id): a replay that adds no new
  // target must be caught here rather than silently duplicating a row, which
  // is what makes the service layer's idempotent union safe under a race.
  await assert.rejects(
    driver.run(
      "INSERT INTO capture_targets (capture_id, target_id, position) VALUES (?, ?, ?)",
      ["capture-1", "m31", 2],
    ),
    /UNIQUE|constraint|PRIMARY/i,
  );

  // The same target on a different capture is a distinct row (tenant-2's
  // capture-2, from the previous migration's fixture).
  await driver.run(
    "INSERT INTO capture_targets (capture_id, target_id, position) VALUES (?, ?, ?)",
    ["capture-2", "m31", 0],
  );

  // An orphan capture_id is rejected: the join table can never point at a
  // capture that does not exist.
  await assert.rejects(
    driver.run(
      "INSERT INTO capture_targets (capture_id, target_id, position) VALUES (?, ?, ?)",
      ["capture-missing", "m31", 0],
    ),
    /FOREIGN KEY|constraint/i,
  );

  // Migration 17's captures.target_id column is untouched by this migration:
  // it still exists and still holds nothing set by these inserts.
  const capture = (
    await driver.query("SELECT target_id FROM captures WHERE id = ?", [
      "capture-1",
    ])
  ).rows[0];
  assert.deepEqual(capture, { target_id: null });
}

// Exercises migration 19. Run after assertObservationSessionsAndCapturesSchema,
// which leaves "tenant-1"/"session-plan-1"/"session-1"/"session-2" in place.
async function assertNightBoundsAndObservationSessionIdempotencySchema(driver) {
  // plans.night_start_at / night_bounds_resolved_at: additive and nullable,
  // and an earlier row (night_end_at already NULL from migration 15) now also
  // reads night_start_at/night_bounds_resolved_at as NULL rather than erroring.
  const plan = (
    await driver.query(
      "SELECT night_start_at, night_end_at, night_bounds_resolved_at FROM plans WHERE id = ?",
      ["session-plan-1"],
    )
  ).rows[0];
  assert.deepEqual(plan, {
    night_start_at: null,
    night_end_at: null,
    night_bounds_resolved_at: null,
  });
  await driver.run(
    "UPDATE plans SET night_start_at = ?, night_end_at = ?, night_bounds_resolved_at = ? WHERE id = ?",
    [
      "2026-09-16T00:46:37.000Z",
      "2026-09-16T08:52:44.000Z",
      timestamp,
      "session-plan-1",
    ],
  );
  const resolved = (
    await driver.query(
      "SELECT night_start_at, night_end_at, night_bounds_resolved_at FROM plans WHERE id = ?",
      ["session-plan-1"],
    )
  ).rows[0];
  assert.deepEqual(resolved, {
    night_start_at: "2026-09-16T00:46:37.000Z",
    night_end_at: "2026-09-16T08:52:44.000Z",
    night_bounds_resolved_at: timestamp,
  });

  // observation_sessions.updated_at is additive and nullable: a row
  // inserted (by the previous migration's own test, before this column was
  // ever written by any application code) without a value reads back NULL,
  // exactly like every other additive column in this file.
  const sessionUpdatedAt = (
    await driver.query(
      "SELECT updated_at FROM observation_sessions WHERE id = ?",
      ["session-1"],
    )
  ).rows[0];
  assert.deepEqual(sessionUpdatedAt, { updated_at: null });

  // At most one session per plan: a second row naming the same
  // (tenant_id, plan_id) is rejected at the database level.
  await assert.rejects(
    driver.run(
      "INSERT INTO observation_sessions (id, tenant_id, plan_id, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [
        "session-1-dup",
        "tenant-1",
        "session-plan-1",
        timestamp,
        timestamp,
        timestamp,
      ],
    ),
    /UNIQUE|constraint/i,
  );
  // A second direct session (plan_id NULL) is unaffected: NULLs never
  // collide under the partial unique index either.
  await driver.run(
    "INSERT INTO observation_sessions (id, tenant_id, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    ["session-3", "tenant-1", timestamp, timestamp, timestamp],
  );

  // clientSessionId idempotency: the same (tenant_id, client_session_id)
  // pair is rejected, a different tenant's use of the same id is not.
  await driver.run(
    "UPDATE observation_sessions SET client_session_id = ? WHERE id = ?",
    ["01J8Z9QK7R4M2N6P8S0T1V3W5X", "session-2"],
  );
  await assert.rejects(
    driver.run(
      "INSERT INTO observation_sessions (id, tenant_id, started_at, created_at, updated_at, client_session_id) VALUES (?, ?, ?, ?, ?, ?)",
      [
        "session-client-dup",
        "tenant-1",
        timestamp,
        timestamp,
        timestamp,
        "01J8Z9QK7R4M2N6P8S0T1V3W5X",
      ],
    ),
    /UNIQUE|constraint/i,
  );
  await driver.run(
    "INSERT INTO observation_sessions (id, tenant_id, started_at, created_at, updated_at, client_session_id) VALUES (?, ?, ?, ?, ?, ?)",
    [
      "session-tenant2-client",
      "tenant-2",
      timestamp,
      timestamp,
      timestamp,
      "01J8Z9QK7R4M2N6P8S0T1V3W5X",
    ],
  );

  // session_events.timing: additive, nullable, and independent of the
  // envelope columns migration 17 already exercised.
  await driver.run(
    "INSERT INTO session_events (event_id, session_id, type, payload, recorded_at, received_at, timing) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ["evt-timed", "session-1", "note", "{}", timestamp, timestamp, "planned"],
  );
  const timedEvent = (
    await driver.query(
      "SELECT timing FROM session_events WHERE session_id = ? AND event_id = ?",
      ["session-1", "evt-timed"],
    )
  ).rows[0];
  assert.deepEqual(timedEvent, { timing: "planned" });
}

// 4's resumable upload protocol (api/uploads.md). "tenant-1" and
// "capture-1" are the same fixtures migration 17/18's own assertions leave
// in place.
async function assertResumableUploadSessionsSchema(driver) {
  const sha256 = "b".repeat(64);
  await driver.run(
    `INSERT INTO upload_sessions
       (id, tenant_id, sha256, byte_size, content_type, target_ids_json,
        original_name, chunk_size, part_path, created_at, updated_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "upload-1",
      "tenant-1",
      sha256,
      4194304,
      "image/tiff",
      '["m31"]',
      "m31-final.tif",
      8388608,
      "/tmp/astro-portal-uploads/tenant-1/uploads/upload-1.part",
      timestamp,
      timestamp,
      "2026-09-23T20:00:00.000Z",
    ],
  );
  const row = (
    await driver.query(
      "SELECT tenant_id, sha256, offset_bytes, chunk_size, state FROM upload_sessions WHERE id = ?",
      ["upload-1"],
    )
  ).rows[0];
  assert.deepEqual(row, {
    tenant_id: "tenant-1",
    sha256,
    offset_bytes: 0,
    chunk_size: 8388608,
    state: "in_progress",
  });

  // (tenant_id, sha256) is UNIQUE: a second session for the same content is
  // never a competing transfer, it is the same one (the service layer's own
  // create idempotency relies on this).
  await assert.rejects(
    driver.run(
      `INSERT INTO upload_sessions
         (id, tenant_id, sha256, byte_size, original_name, chunk_size, part_path,
          created_at, updated_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "upload-2",
        "tenant-1",
        sha256,
        4194304,
        "m31-final.tif",
        8388608,
        "/tmp/astro-portal-uploads/tenant-1/uploads/upload-2.part",
        timestamp,
        timestamp,
        "2026-09-23T20:00:00.000Z",
      ],
    ),
    /UNIQUE|constraint/i,
  );

  // `state` only ever accepts the two named values.
  await assert.rejects(
    driver.run(
      `INSERT INTO upload_sessions
         (id, tenant_id, sha256, byte_size, original_name, chunk_size, part_path,
          state, created_at, updated_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "upload-3",
        "tenant-1",
        "c".repeat(64),
        1024,
        "n.tif",
        8388608,
        "/tmp/n.part",
        "cancelled",
        timestamp,
        timestamp,
        timestamp,
      ],
    ),
    /CHECK|constraint/i,
  );

  // Finalizing sets `capture_id`, pointing at an existing capture
  // (migration 17/18's own "capture-1" fixture, tenant-1).
  await driver.run(
    "UPDATE upload_sessions SET state = 'completed', capture_id = ?, offset_bytes = byte_size, updated_at = ? WHERE id = ?",
    ["capture-1", timestamp, "upload-1"],
  );
  const completed = (
    await driver.query(
      "SELECT state, capture_id, offset_bytes FROM upload_sessions WHERE id = ?",
      ["upload-1"],
    )
  ).rows[0];
  assert.deepEqual(completed, {
    state: "completed",
    capture_id: "capture-1",
    offset_bytes: 4194304,
  });

  // An orphan `capture_id` is rejected: it can never point at a capture that
  // does not exist.
  await assert.rejects(
    driver.run("UPDATE upload_sessions SET capture_id = ? WHERE id = ?", [
      "capture-does-not-exist",
      "upload-1",
    ]),
    /FOREIGN KEY|foreign key|constraint/i,
  );
}

const rejectsCheck = (promise) => assert.rejects(promise, /CHECK|constraint/i);
const rejectsUnique = (promise) =>
  assert.rejects(promise, /UNIQUE|unique|duplicate|constraint/i);

async function tableIsGone(driver, table) {
  await assert.rejects(
    driver.query(`SELECT COUNT(*) AS count FROM ${table}`),
    /no such table|does not exist/i,
    `${table} is dropped`,
  );
}

// Migration 54: the visibility and the two flags of a
// capture, the private gallery of a space, the warnings of a person, the
// reports, the access list, the access log, the dictionary and the mail
// budget; the publications are gone. "tenant-1", "user-1" and "capture-1"
// are the rows earlier assertions leave in place.
async function assertGallerySchema(driver) {
  const capture = (
    await driver.query(
      "SELECT visibility, auto_check, admin_check, review_requested_at, protection_notice_at, protection_lifted_at, removed_from_gallery_at FROM captures WHERE id = ?",
      ["capture-1"],
    )
  ).rows[0];
  assert.deepEqual(capture, {
    visibility: "private",
    auto_check: null,
    admin_check: null,
    review_requested_at: null,
    protection_notice_at: null,
    protection_lifted_at: null,
    removed_from_gallery_at: null,
  });
  await rejectsCheck(
    driver.run("UPDATE captures SET visibility = 'unlisted' WHERE id = ?", [
      "capture-1",
    ]),
  );
  await rejectsCheck(
    driver.run("UPDATE captures SET auto_check = 'maybe' WHERE id = ?", [
      "capture-1",
    ]),
  );
  await rejectsCheck(
    driver.run("UPDATE captures SET admin_check = 'pending' WHERE id = ?", [
      "capture-1",
    ]),
  );
  await rejectsCheck(
    driver.run("UPDATE captures SET admin_check_reason = 'ugly' WHERE id = ?", [
      "capture-1",
    ]),
  );
  await driver.run(
    "UPDATE captures SET visibility = 'public', auto_check = 'sky', admin_check = 'approved', admin_check_reason = 'other' WHERE id = ?",
    ["capture-1"],
  );

  const space = (
    await driver.query(
      "SELECT portal_token, portal_mode, public_name, portal_name, hide_default_equipment FROM organizations WHERE id = ?",
      ["tenant-1"],
    )
  ).rows[0];
  assert.deepEqual(
    { ...space, hide_default_equipment: Number(space.hide_default_equipment) },
    {
      portal_token: null,
      portal_mode: "none",
      public_name: null,
      portal_name: null,
      hide_default_equipment: 0,
    },
  );
  await rejectsCheck(
    driver.run("UPDATE organizations SET portal_mode = 'open' WHERE id = ?", [
      "tenant-1",
    ]),
  );
  await rejectsCheck(
    driver.run("UPDATE organizations SET public_name = ? WHERE id = ?", [
      "é".repeat(61),
      "tenant-1",
    ]),
  );
  await driver.run("UPDATE organizations SET public_name = ? WHERE id = ?", [
    "é".repeat(60),
    "tenant-1",
  ]);
  await rejectsCheck(
    driver.run("UPDATE organizations SET portal_name = ? WHERE id = ?", [
      "a".repeat(81),
      "tenant-1",
    ]),
  );
  await driver.run("UPDATE organizations SET portal_token = ? WHERE id = ?", [
    "t".repeat(24),
    "tenant-1",
  ]);
  await rejectsUnique(
    driver.run("UPDATE organizations SET portal_token = ? WHERE id = ?", [
      "t".repeat(24),
      "tenant-2",
    ]),
  );

  const person = (
    await driver.query(
      "SELECT warnings_count, publishing_blocked_until, block_count FROM users WHERE id = ?",
      ["user-1"],
    )
  ).rows[0];
  assert.deepEqual(
    {
      warnings_count: Number(person.warnings_count),
      publishing_blocked_until: person.publishing_blocked_until,
      block_count: Number(person.block_count),
    },
    { warnings_count: 0, publishing_blocked_until: null, block_count: 0 },
  );

  await driver.run(
    "INSERT INTO portal_access (id, tenant_id, email, state, token, invited_at) VALUES (?, ?, ?, ?, ?, ?)",
    [
      "access-1",
      "tenant-1",
      "lea@exemple.test",
      "invited",
      "i".repeat(24),
      timestamp,
    ],
  );
  await rejectsUnique(
    driver.run(
      "INSERT INTO portal_access (id, tenant_id, email, state, token, invited_at) VALUES (?, ?, ?, ?, ?, ?)",
      [
        "access-2",
        "tenant-1",
        "lea@exemple.test",
        "granted",
        "j".repeat(24),
        timestamp,
      ],
    ),
  );
  await rejectsCheck(
    driver.run(
      "INSERT INTO portal_access (id, tenant_id, email, state, token, invited_at) VALUES (?, ?, ?, ?, ?, ?)",
      [
        "access-3",
        "tenant-1",
        "noe@exemple.test",
        "refused",
        "k".repeat(24),
        timestamp,
      ],
    ),
  );
  await driver.run(
    "INSERT INTO admin_access_log (id, actor_user_id, tenant_id, capture_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ["log-1", "user-1", "tenant-1", null, "authority request", timestamp],
  );
  await driver.run(
    "INSERT INTO portal_mail_budget (id, kind, created_at) VALUES (?, ?, ?)",
    ["mail-1", "invitation", timestamp],
  );
  await tableIsGone(driver, "publication_items");
  await tableIsGone(driver, "publications");
}

// Migration 59 (« capture-tags »): the owner's own tags of a capture — free
// text of 1 to 40 characters, as typed (case and accents kept), unique per
// capture, bound to an existing capture and space. "capture-1" (tenant-1)
// and "capture-2" (tenant-2) are the rows earlier assertions leave in
// place.
async function assertCaptureTagsSchema(driver) {
  const insert = (captureId, tenantId, tag) =>
    driver.run(
      "INSERT INTO capture_tags (capture_id, tenant_id, tag) VALUES (?, ?, ?)",
      [captureId, tenantId, tag],
    );
  await insert("capture-1", "tenant-1", "Nuit très froide");
  await insert("capture-1", "tenant-1", "nuit très froide");
  await insert("capture-1", "tenant-1", "é".repeat(40));
  await insert("capture-2", "tenant-2", "Nuit très froide");
  await rejectsUnique(insert("capture-1", "tenant-1", "Nuit très froide"));
  await rejectsCheck(insert("capture-1", "tenant-1", "é".repeat(41)));
  await rejectsCheck(insert("capture-1", "tenant-1", ""));
  await assert.rejects(
    insert("capture-does-not-exist", "tenant-1", "Orpheline"),
    /FOREIGN KEY|foreign key|constraint/i,
  );
  const rows = (
    await driver.query(
      "SELECT tag FROM capture_tags WHERE tenant_id = ? ORDER BY tag",
      ["tenant-1"],
    )
  ).rows.map((row) => row.tag);
  assert.equal(rows.length, 3);
  assert.ok(rows.includes("nuit très froide"), "never normalised");
  await driver.run("DELETE FROM capture_tags");
}

// Migration 61 (« default-configuration »): one row per space at most, bound
// to an existing space; `configuration` is the JSON text of the equipment
// keys it fixes and `updated_at` the time of the last write. Written for the
// common statement, so SQLite and PostgreSQL share it.
async function assertDefaultConfigurationsSchema(driver) {
  const insert = (tenantId, configuration) =>
    driver.run(
      "INSERT INTO default_configurations (tenant_id, configuration, updated_at) VALUES (?, ?, ?)",
      [tenantId, configuration, timestamp],
    );
  await insert("tenant-1", '{"mode":"telescope","telescope":"askar-50p"}');
  await rejectsUnique(insert("tenant-1", "{}"));
  await assert.rejects(
    insert("tenant-does-not-exist", "{}"),
    /FOREIGN KEY|foreign key|constraint/i,
  );
  await assert.rejects(
    driver.run(
      "INSERT INTO default_configurations (tenant_id, configuration, updated_at) VALUES ('tenant-2', NULL, ?)",
      [timestamp],
    ),
    /NOT NULL|null value|constraint/i,
  );
  const rows = (
    await driver.query(
      "SELECT tenant_id, configuration, updated_at FROM default_configurations",
    )
  ).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tenant_id, "tenant-1");
  assert.equal(
    JSON.parse(rows[0].configuration).telescope,
    "askar-50p",
    "kept as typed text",
  );
  await driver.run("DELETE FROM default_configurations");
}

// Migration 65 (« session-executions »): two nullable columns of
// observation_sessions — the execution several sessions share and the
// piloting of the session's plan — and the index of an execution in a space.
// Written for the common statement, so SQLite and PostgreSQL share it.
async function assertSessionExecutionsSchema(driver) {
  await driver.run(
    "INSERT INTO observation_sessions (id, tenant_id, started_at, status, created_at, updated_at, execution_id, piloting) VALUES ('session-piloting-a', 'tenant-1', ?, 'open', ?, ?, '01J8Z3K9QZ6N3S6R3E6G8H0001', 'assisted')",
    [timestamp, timestamp, timestamp],
  );
  await driver.run(
    "INSERT INTO observation_sessions (id, tenant_id, started_at, status, created_at, updated_at) VALUES ('session-piloting-b', 'tenant-1', ?, 'open', ?, ?)",
    [timestamp, timestamp, timestamp],
  );
  const rows = (
    await driver.query(
      "SELECT id, execution_id, piloting FROM observation_sessions WHERE id IN ('session-piloting-a', 'session-piloting-b') ORDER BY id",
    )
  ).rows;
  assert.deepEqual(
    rows.map((row) => [row.id, row.execution_id ?? null, row.piloting ?? null]),
    [
      ["session-piloting-a", "01J8Z3K9QZ6N3S6R3E6G8H0001", "assisted"],
      ["session-piloting-b", null, null],
    ],
  );
  await driver.run(
    "DELETE FROM observation_sessions WHERE id IN ('session-piloting-a', 'session-piloting-b')",
  );
}

// Migration 83 (« session-closed-by »): one nullable column of
// observation_sessions, how the night was closed. A session already there
// reads NULL (unknown); written for the common statement.
async function assertSessionClosedBySchema(driver) {
  await driver.run(
    "INSERT INTO observation_sessions (id, tenant_id, started_at, status, created_at, updated_at, closed_by) VALUES ('session-closed-by-a', 'tenant-1', ?, 'finished', ?, ?, 'automatic')",
    [timestamp, timestamp, timestamp],
  );
  await driver.run(
    "INSERT INTO observation_sessions (id, tenant_id, started_at, status, created_at, updated_at) VALUES ('session-closed-by-b', 'tenant-1', ?, 'finished', ?, ?)",
    [timestamp, timestamp, timestamp],
  );
  const rows = (
    await driver.query(
      "SELECT id, closed_by FROM observation_sessions WHERE id IN ('session-closed-by-a', 'session-closed-by-b') ORDER BY id",
    )
  ).rows;
  assert.deepEqual(
    rows.map((row) => [row.id, row.closed_by ?? null]),
    [
      ["session-closed-by-a", "automatic"],
      ["session-closed-by-b", null],
    ],
  );
  await driver.run(
    "DELETE FROM observation_sessions WHERE id IN ('session-closed-by-a', 'session-closed-by-b')",
  );
}

// Migrations 33 to 35, the devices of a space: one live
// PlanAstro row per installation across spaces, one live row per
// installation and space, the installation's own state, the attach
// tokens, the language of a person's messages.
async function assertDevicesOfASpaceSchema(driver) {
  const insertDevice = (id, tenantId, application, installationHash) =>
    driver.run(
      "INSERT INTO device_tokens (id, tenant_id, user_id, label, token_hash, created_at, application, platform, model, installation_hash) VALUES (?, ?, 'user-1', 'Phone', ?, ?, ?, 'ios', 'iPhone17,1', ?)",
      [id, tenantId, `hash-${id}`, timestamp, application, installationHash],
    );
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    ["tenant-devices-2", "Second space", timestamp],
  );
  await insertDevice("planner-a", "tenant-1", "planner", "installation-a");
  await assert.rejects(
    insertDevice("planner-b", "tenant-devices-2", "planner", "installation-a"),
    /unique|UNIQUE/,
    "a PlanAstro installation is live in one space at a time",
  );
  await driver.run("UPDATE device_tokens SET revoked_at = ? WHERE id = ?", [
    timestamp,
    "planner-a",
  ]);
  await insertDevice(
    "planner-b",
    "tenant-devices-2",
    "planner",
    "installation-a",
  );
  await insertDevice("sync-a", "tenant-1", "sync", "installation-sync");
  await insertDevice("sync-b", "tenant-devices-2", "sync", "installation-sync");
  await assert.rejects(
    insertDevice("sync-c", "tenant-1", "sync", "installation-sync"),
    /unique|UNIQUE/,
    "Astro Sync: once per space",
  );
  // Devices paired on a private server have no installation: no limit.
  await insertDevice("paired-a", "tenant-1", null, null);
  await insertDevice("paired-b", "tenant-1", null, null);
  await driver.run("UPDATE users SET language = 'ja' WHERE id = 'user-1'");
  assert.equal(
    (await driver.query("SELECT language FROM users WHERE id = 'user-1'"))
      .rows[0].language,
    "ja",
  );
}

test("the core's migration definitions retain their versions and dialect precision", () => {
  assert.deepEqual(
    migrations.map(({ name, version }) => [version, name]),
    [
      [1, "private-notebook-foundation"],
      [2, "private-equipment-inventory"],
      [3, "planner-horizon-profiles"],
      [4, "equipment-preference-order"],
      [5, "equipment-binoculars"],
      [6, "capture-equipment-roles"],
      [7, "planner-plan-lifecycle"],
      [8, "application-logs"],
      [9, "target-library-catalogue"],
      [10, "initialization-data-and-target-relations"],
      [11, "target-catalogue-hemisphere-visibility"],
      [12, "user-target-favorites"],
      [13, "user-target-favorite-modes"],
      [14, "planner-night-context-and-complete-settings"],
      [15, "mobile-plan-resources-and-devices"],
      [16, "plan-soft-deletion"],
      [17, "observation-sessions-and-captures"],
      [18, "capture-target-associations"],
      [19, "plan-night-bounds-and-observation-session-idempotency"],
      [20, "debrief-and-session-supplement-idempotency"],
      [21, "plan-versions-monotonic-tiebreak"],
      [22, "independent-framings"],
      [25, "resumable-upload-sessions"],
      [26, "session-package-imports"],
      [27, "publications"],
      [28, "session-analyses"],
      // The space sign-in.
      [29, "users-without-password"],
      [30, "sign-in-codes"],
      [31, "sign-in-throttles"],
      [32, "service-administration-role"],
      // The devices of a space.
      [33, "device-installations"],
      [35, "users-language"],
      // The hardening of the sign-in.
      [41, "sign-in-hardening"],
      // The per-target part of a debriefing.
      [45, "debrief-targets"],
      // The projects (« plans multi-nuits »).
      [46, "projects"],
      // The measured sky background of a place's night.
      [47, "place-sky-measures"],
      // The project's own sky-brightness calibration set.
      [48, "calibration-contributions"],
      // The visibility and the two flags of a capture, the private
      // gallery of a space; the publications retired.
      [54, "hosted-portal"],
      // The default equipment of the instance.
      [55, "default-equipment"],
      // The owner's own tags of a capture, shown in the private gallery
      // only.
      [59, "capture-tags"],
      // The invitations' language, the owner told once, the space of a
      // message of the invitations' budget.
      [60, "portal-invitations"],
      // The mode and equipment that fill every
      // new plan of a space ("Ma configuration par défaut").
      [61, "default-configuration"],
      // The stage of a capture (draft,
      // finalized), its images (main and alternative), the personal targets
      // in the library.
      [62, "capture-stage-variants-personal-targets"],
      // The last forecast of each
      // rounded place, served stale after a wake-up.
      [63, "weather-forecasts"],
      // The sky solution of each image
      // of a capture, the owner's switch of the annotations (after 63).
      [64, "capture-sky-solutions"],
      // The execution of several plans
      // a session belongs to, and how its plan is piloted.
      [65, "session-executions"],
      // The device that sent an
      // application error log (source `mobile`).
      [66, "application-logs-device"],
      // The night's own fields, its
      // acquisition steps, one analysis per night (report v2), after 66.
      [67, "structured-night"],
      // The optional title and
      // description of an image of a capture, after 67.
      [68, "capture-variant-title-description"],
      // The metadata of a capture, the
      // origin of an image's title, the date of finalization, after 68.
      [69, "capture-metadata"],
      // The places of a space, written
      // under the rule of the most recent edit, soft deletion, the default
      // place, after 69.
      [70, "synchronized-places"],
      // The 39 entries of the
      // default catalogue, after 70.
      [71, "telescope-catalogue"],
      // The image columns
      // of a capture nullable, a capture without an image, after 71.
      [72, "capture-without-image"],
      // The application's error logs anonymous, under a
      // diagnostic token.
      [73, "application-logs-token"],
      // The progression images
      // of a capture, its history, after 73.
      [74, "capture-progression"],
      // A stopped night resumed, `reopened_at`, after 74.
      [75, "observation-session-reopen"],
      // The integrations of a
      // multi-night plan and the image of the plan, after 75.
      [76, "project-integrations"],
      // A night attached to a
      // multi-night plan afterwards, its integrations following it, after
      // 76.
      [77, "project-nights"],
      // The weather trend of a
      // place, kept for a year, after 77.
      [78, "place-climate-trends"],
      // The
      // origin, the rework and the debriefing's reason of a session, after
      // 79.
      [80, "session-journal"],
      // The
      // replacement of a capture's image and the source of an integration
      // line, after 80.
      [81, "journal-captures-integrations"],
      [82, "capture-revisions-and-image-quality"],
      // How a night was closed, after 82.
      [83, "session-closed-by"],
      // A public capture whose image is
      // replaced goes back to private, and says so.
      [84, "capture-made-private-by-replacement"],
      // The soft deletion of a session, the
      // origin of an archived plan.
      [87, "sessions-soft-delete-and-archive-origin"],
      // The instant a capture came back from the trash of its session, apart
      // from the date it was added, after 87.
      [88, "capture-restored-at"],
      // Where a session event comes from, `source`.
      [89, "session-event-source"],
      // The instant a capture turned public, « Publique depuis ».
      [91, "capture-made-public-at"],
      // The catalogue texts B and C, `target_texts`.
      [92, "target-texts"],
      // What the catalogue's reads are built on.
      [93, "target-catalogue-reads"],
      // The catalogue texts in their own SQLite file, out of the backups.
      [94, "target-texts-own-file"],
      // `capture` joins the origins of a session.
      [95, "session-origin-capture"],
      // The four smart telescopes migration 71 lacked.
      [96, "telescope-catalogue-2"],
      // The archive of a space, its last activity,
      // the retention's notices.
      [97, "space-retention"],
      // The default generic tag of the existing captures.
      [99, "capture-default-generic-tag"],
      // The owner's two switches « Afficher la qualité » (99 is the generic
      // tags').
      [100, "capture-quality-switches"],
      // An image's title widened to 90 characters.
      [102, "capture-variant-title-90"],
      // The texts a producer generated for an image, in ten languages.
      [103, "capture-variant-generated-texts"],
      // What made an image, kept with it.
      [104, "capture-variant-processing"],
      // The third equipment catalogue: rows only.
      [107, "telescope-catalogue-3"],
      // The maker and the kind of every default row: rows only.
      [108, "default-equipment-maker-kind"],
      // Every constellation keyed by its IAU abbreviation: rows only.
      [109, "constellation-keys-iau"],
      // The deletion of a capture's files, kept as a task until it is done.
      [110, "capture-file-deletions"],
      // The trash of the plans: 30 days, then the erasure.
      [111, "plan-trash"],
      // The plans closed as abandoned are decided « Abandonné »: data only.
      [112, "abandoned-plans-decided"],
      // The internal plan of a guided evening: its flag, rows caught up.
      [113, "plans-guided-evening"],
      // The build and system each device's client header names: columns.
      [114, "device-tokens-client-version"],
      // The fourth equipment catalogue (EQUIPMENT-CATALOGUE-01): rows only.
      // The numbers 115 to 130 belong to the compositions that extend this runner.
      [131, "equipment-catalogue-4"],
      // The fifth equipment catalogue (EQUIPMENT-CATALOGUE-02): rows only.
      [133, "equipment-catalogue-5"],
    ],
  );

  for (const migration of migrations) {
    assert.equal(statementsFor(migration, "sqlite").length, 1);
    assert.equal(statementsFor(migration, "postgres").length, 1);
  }

  const catalogue = migrations.find(({ version }) => version === 9);
  assert.ok(catalogue);
  assert.match(statementsFor(catalogue, "sqlite")[0], /ra_hours REAL/);
  assert.match(
    statementsFor(catalogue, "postgres")[0],
    /ra_hours DOUBLE PRECISION/,
  );
  assert.doesNotMatch(statementsFor(catalogue, "postgres")[0], /\bREAL\b/);

  const context = migrations.find(({ version }) => version === 14);
  assert.ok(context);
  assert.match(
    statementsFor(context, "postgres")[0],
    /CREATE TABLE IF NOT EXISTS planner_contexts/,
  );

  const mobileResources = migrations.find(({ version }) => version === 15);
  assert.ok(mobileResources);
  const mobileSql = statementsFor(mobileResources, "sqlite")[0];
  assert.match(
    mobileSql,
    /ALTER TABLE plans ADD COLUMN revision INTEGER NOT NULL DEFAULT 1/,
  );
  assert.match(mobileSql, /ALTER TABLE plans ADD COLUMN payload_json TEXT/);
  assert.doesNotMatch(
    mobileSql,
    /ALTER TABLE plans ADD COLUMN payload_json TEXT NOT NULL/,
  );
  assert.match(mobileSql, /CREATE TABLE IF NOT EXISTS device_tokens/);
  assert.match(mobileSql, /CREATE TABLE IF NOT EXISTS device_pairings/);
  assert.match(mobileSql, /CREATE TABLE IF NOT EXISTS plan_versions/);
  assert.match(mobileSql, /plan_id TEXT NOT NULL,/);
  assert.doesNotMatch(
    mobileSql,
    /plan_id TEXT NOT NULL REFERENCES plans\(id\)/,
  );
  assert.match(mobileSql, /plan_versions_tenant_plan_state_idx/);

  const softDeletion = migrations.find(({ version }) => version === 16);
  assert.ok(softDeletion);
  const softDeletionSql = statementsFor(softDeletion, "sqlite")[0];
  assert.equal(statementsFor(softDeletion, "postgres")[0], softDeletionSql);
  assert.match(softDeletionSql, /ALTER TABLE plans ADD COLUMN deleted_at TEXT/);
  assert.match(softDeletionSql, /plans_tenant_deleted_idx/);

  const sessions = migrations.find(({ version }) => version === 17);
  assert.ok(sessions);
  const sessionsSql = statementsFor(sessions, "sqlite")[0];
  assert.equal(statementsFor(sessions, "postgres")[0], sessionsSql);
  assert.match(sessionsSql, /CREATE TABLE IF NOT EXISTS observation_sessions/);
  assert.doesNotMatch(sessionsSql, /CREATE TABLE IF NOT EXISTS sessions\b/);
  assert.match(
    sessionsSql,
    /status TEXT NOT NULL DEFAULT 'open'\s+CHECK \(status IN \('open','paused','finished'\)\)/,
  );
  assert.match(sessionsSql, /CREATE TABLE IF NOT EXISTS session_events/);
  assert.match(sessionsSql, /PRIMARY KEY \(session_id, event_id\)/);
  assert.match(sessionsSql, /CREATE TABLE IF NOT EXISTS session_supplements/);
  assert.match(
    sessionsSql,
    /status TEXT NOT NULL DEFAULT 'proposed'\s+CHECK \(status IN \('proposed','accepted','dismissed'\)\)/,
  );
  assert.match(sessionsSql, /CREATE TABLE IF NOT EXISTS captures/);
  assert.match(
    sessionsSql,
    /status TEXT NOT NULL DEFAULT 'draft'\s+CHECK \(status IN \('draft','uploaded'\)\)/,
  );
  assert.match(
    sessionsSql,
    /CREATE UNIQUE INDEX IF NOT EXISTS captures_tenant_sha256_idx\s+ON captures\(tenant_id, sha256\)/,
  );

  const captureTargets = migrations.find(({ version }) => version === 18);
  assert.ok(captureTargets);
  const captureTargetsSql = statementsFor(captureTargets, "sqlite")[0];
  assert.equal(statementsFor(captureTargets, "postgres")[0], captureTargetsSql);
  assert.match(captureTargetsSql, /CREATE TABLE IF NOT EXISTS capture_targets/);
  assert.match(captureTargetsSql, /PRIMARY KEY \(capture_id, target_id\)/);
  assert.match(
    captureTargetsSql,
    /CREATE INDEX IF NOT EXISTS capture_targets_target_idx\s+ON capture_targets\(target_id\)/,
  );
  // Migration 17 itself must stay byte-for-byte untouched by this addition.
  assert.doesNotMatch(sessionsSql, /capture_targets/);

  const nightBounds = migrations.find(({ version }) => version === 19);
  assert.ok(nightBounds);
  const nightBoundsSql = statementsFor(nightBounds, "sqlite")[0];
  assert.equal(statementsFor(nightBounds, "postgres")[0], nightBoundsSql);
  assert.match(
    nightBoundsSql,
    /ALTER TABLE plans ADD COLUMN night_start_at TEXT/,
  );
  assert.match(
    nightBoundsSql,
    /ALTER TABLE plans ADD COLUMN night_bounds_resolved_at TEXT/,
  );
  assert.match(
    nightBoundsSql,
    /ALTER TABLE observation_sessions ADD COLUMN client_session_id TEXT/,
  );
  assert.match(
    nightBoundsSql,
    /ALTER TABLE observation_sessions ADD COLUMN updated_at TEXT/,
  );
  assert.match(
    nightBoundsSql,
    /CREATE UNIQUE INDEX IF NOT EXISTS observation_sessions_tenant_plan_idx\s+ON observation_sessions\(tenant_id, plan_id\) WHERE plan_id IS NOT NULL/,
  );
  assert.match(
    nightBoundsSql,
    /CREATE UNIQUE INDEX IF NOT EXISTS observation_sessions_tenant_client_session_idx\s+ON observation_sessions\(tenant_id, client_session_id\) WHERE client_session_id IS NOT NULL/,
  );
  assert.match(
    nightBoundsSql,
    /ALTER TABLE session_events ADD COLUMN timing TEXT/,
  );
});
async function assertDebriefAndSupplementIdempotencySchema(driver) {
  await driver.run(
    "INSERT INTO device_tokens (id, tenant_id, user_id, label, token_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [
      "device-2",
      "tenant-1",
      "user-1",
      "Second phone",
      "sha256-token-2",
      timestamp,
    ],
  );

  // session_supplements.decided_at / event_ids_json / payload_fingerprint:
  // additive and nullable — the row migration 17's own test inserted (before
  // this migration ever ran) reads all three back as NULL.
  const proposed = (
    await driver.query(
      "SELECT decided_at, event_ids_json, payload_fingerprint FROM session_supplements WHERE id = ?",
      ["supplement-1"],
    )
  ).rows[0];
  assert.deepEqual(proposed, {
    decided_at: null,
    event_ids_json: null,
    payload_fingerprint: null,
  });

  // The idempotency key: the same (session_id, origin_device_id,
  // payload_fingerprint) triple is rejected at the database level, so a
  // resubmitted supplement payload from the same device collapses onto one
  // row via ON CONFLICT DO NOTHING rather than accumulating duplicates.
  await driver.run(
    "UPDATE session_supplements SET payload_fingerprint = ? WHERE id = ?",
    ["fingerprint-a", "supplement-1"],
  );
  await assert.rejects(
    driver.run(
      "INSERT INTO session_supplements (id, session_id, origin_device_id, payload, payload_fingerprint, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [
        "supplement-1-dup",
        "session-1",
        "device-1",
        '{"note":"field data"}',
        "fingerprint-a",
        timestamp,
      ],
    ),
    /UNIQUE|constraint/i,
  );
  // A different device, or a different payload fingerprint, is unaffected.
  await driver.run(
    "INSERT INTO session_supplements (id, session_id, origin_device_id, payload, payload_fingerprint, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [
      "supplement-2",
      "session-1",
      "device-2",
      '{"note":"another device"}',
      "fingerprint-a",
      timestamp,
    ],
  );
  await driver.run(
    "INSERT INTO session_supplements (id, session_id, origin_device_id, payload, payload_fingerprint, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [
      "supplement-3",
      "session-1",
      "device-1",
      '{"note":"a later push"}',
      "fingerprint-b",
      timestamp,
    ],
  );
}

// Migration 63 (« weather-forecasts »): one row per rounded place, the
// providers' answer as JSON text with the two instants it needs. Written for
// the common statement, so SQLite and PostgreSQL share it.
async function assertWeatherForecastsSchema(driver) {
  const insert = (placeKey, payload = '{"hourly":{}}') =>
    driver.run(
      "INSERT INTO weather_forecasts (place_key, payload, fetched_at, fresh_until) VALUES (?, ?, ?, ?)",
      [placeKey, payload, timestamp, timestamp],
    );
  await insert("45.123:-30.568");
  await rejectsUnique(insert("45.123:-30.568"));
  await assert.rejects(
    insert("46.0:-30.0", null),
    /NOT NULL|null value|constraint/i,
  );
  const rows = (
    await driver.query("SELECT place_key, last_modified FROM weather_forecasts")
  ).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].last_modified, null, "optional");
  await driver.run("DELETE FROM weather_forecasts");
}

// Migration 78 (« place-climate-trends »): one row per place rounded to 0.05
// degree, the trend as JSON text with the two instants it needs.
async function assertPlaceClimateTrendsSchema(driver) {
  const insert = (placeKey, payload = '{"months":[]}') =>
    driver.run(
      "INSERT INTO place_climate_trends (place_key, payload, computed_at, fresh_until) VALUES (?, ?, ?, ?)",
      [placeKey, payload, timestamp, timestamp],
    );
  await insert("48.85:2.35");
  await rejectsUnique(insert("48.85:2.35"));
  await assert.rejects(
    insert("48.90:2.35", null),
    /NOT NULL|null value|constraint/i,
  );
  assert.equal(
    (await driver.query("SELECT place_key FROM place_climate_trends")).rows
      .length,
    1,
  );
  await driver.run("DELETE FROM place_climate_trends");
}

test("migration runner is idempotent on a scratch SQLite database", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-portal-migrations-"));
  const driver = SqliteDriver.open(join(directory, "portal.sqlite"));
  try {
    await applyMigrations(driver, "sqlite");
    assert.equal(await migrationCount(driver), migrations.length);
    assert.equal(migrations.length, 89);
    await assertMobilePlanResourceSchema(driver);
    await assertObservationSessionsAndCapturesSchema(driver);
    await assertCaptureTargetAssociationsSchema(driver);
    await assertNightBoundsAndObservationSessionIdempotencySchema(driver);
    await assertDebriefAndSupplementIdempotencySchema(driver);
    await assertResumableUploadSessionsSchema(driver);
    await assertGallerySchema(driver);
    await assertCaptureTagsSchema(driver);
    await assertDefaultConfigurationsSchema(driver);
    await assertWeatherForecastsSchema(driver);
    await assertPlaceClimateTrendsSchema(driver);
    await assertSessionExecutionsSchema(driver);
    await assertSessionClosedBySchema(driver);
    await assertDevicesOfASpaceSchema(driver);
    await applyMigrations(driver, "sqlite");
    assert.equal(await migrationCount(driver), migrations.length);
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test(
  "migration runner is idempotent on the dedicated PostgreSQL test database",
  { skip: !process.env.ASTRO_PORTAL_TEST_DATABASE_URL },
  async () => {
    const url = process.env.ASTRO_PORTAL_TEST_DATABASE_URL;
    if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(url))
      throw new Error(
        "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
      );
    const driver = PostgresDriver.open(url);
    try {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await applyMigrations(driver, "postgres");
      assert.equal(await migrationCount(driver), migrations.length);
      await assertMobilePlanResourceSchema(driver);
      await assertObservationSessionsAndCapturesSchema(driver);
      await assertCaptureTargetAssociationsSchema(driver);
      await assertNightBoundsAndObservationSessionIdempotencySchema(driver);
      await assertDebriefAndSupplementIdempotencySchema(driver);
      await assertResumableUploadSessionsSchema(driver);
      await assertGallerySchema(driver);
      await assertCaptureTagsSchema(driver);
      await assertDefaultConfigurationsSchema(driver);
      await assertWeatherForecastsSchema(driver);
      await assertPlaceClimateTrendsSchema(driver);
      await assertPlaceClimateTrendsSchema(driver);
      await assertSessionExecutionsSchema(driver);
      await assertSessionClosedBySchema(driver);
      await assertDevicesOfASpaceSchema(driver);
      await applyMigrations(driver, "postgres");
      assert.equal(await migrationCount(driver), migrations.length);
    } finally {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await driver.close();
    }
  },
);

// A database at version 53 holding captures and publications moves to 54
// — every capture private with no check yet, the two tables of the
// publications gone, nothing converted.
async function migrateFiftyThreeToFiftyFour(driver, dialect) {
  await applyMigrations(
    driver,
    dialect,
    migrations.filter(({ version }) => version <= 53),
  );
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    ["tenant-old", "Old space", timestamp],
  );
  for (const [id, sha] of [
    ["capture-old-1", "a"],
    ["capture-old-2", "b"],
  ])
    await driver.run(
      "INSERT INTO captures (id, tenant_id, original_name, sha256, byte_size, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        id,
        "tenant-old",
        `${id}.jpg`,
        sha.repeat(64),
        10,
        "uploaded",
        timestamp,
      ],
    );
  await driver.run(
    "INSERT INTO publications (id, tenant_id, slug, visibility, title, published_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      "publication-old",
      "tenant-old",
      "p".repeat(24),
      "public",
      "M31",
      timestamp,
      timestamp,
    ],
  );
  await driver.run(
    "INSERT INTO publication_items (publication_id, capture_id, position) VALUES (?, ?, ?)",
    ["publication-old", "capture-old-1", 0],
  );

  await applyMigrations(driver, dialect);
  assert.equal(await migrationCount(driver), migrations.length);
  const rows = (
    await driver.query(
      "SELECT id, visibility, auto_check, admin_check FROM captures WHERE tenant_id = ? ORDER BY id",
      ["tenant-old"],
    )
  ).rows;
  assert.deepEqual(rows, [
    {
      id: "capture-old-1",
      visibility: "private",
      auto_check: null,
      admin_check: null,
    },
    {
      id: "capture-old-2",
      visibility: "private",
      auto_check: null,
      admin_check: null,
    },
  ]);
  const space = (
    await driver.query(
      "SELECT portal_mode, portal_token FROM organizations WHERE id = ?",
      ["tenant-old"],
    )
  ).rows[0];
  assert.deepEqual(space, { portal_mode: "none", portal_token: null });
  await tableIsGone(driver, "publication_items");
  await tableIsGone(driver, "publications");
}

test("migration 54 on a populated SQLite database at 53: captures private, publications gone", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-portal-migration-54-"));
  const driver = SqliteDriver.open(join(directory, "portal.sqlite"));
  try {
    await migrateFiftyThreeToFiftyFour(driver, "sqlite");
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test(
  "migration 54 on a populated PostgreSQL database at 53: captures private, publications gone",
  { skip: !process.env.ASTRO_PORTAL_TEST_DATABASE_URL },
  async () => {
    const url = process.env.ASTRO_PORTAL_TEST_DATABASE_URL;
    if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(url))
      throw new Error(
        "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
      );
    const driver = PostgresDriver.open(url);
    try {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await migrateFiftyThreeToFiftyFour(driver, "postgres");
    } finally {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await driver.close();
    }
  },
);

// A database at version 54 holding a space and its own equipment moves to
// 55 — the platform organisation appears with the default rows (the
// profiles' own ids, scope `default`), the space's rows stay `private`,
// and the space is still the oldest space.
async function migrateFiftyFourToFiftyFive(driver, dialect) {
  await applyMigrations(
    driver,
    dialect,
    migrations.filter(({ version }) => version <= 54),
  );
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    ["tenant-owner", "Owner", timestamp],
  );
  await driver.run(
    "INSERT INTO equipment (id, tenant_id, equipment_type, name, specifications_json, planner_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      "own-refractor",
      "tenant-owner",
      "telescope",
      "Lunette 72/432",
      '{"apertureMm":72,"focalLengthMm":432}',
      "{}",
      timestamp,
      timestamp,
    ],
  );
  await applyMigrations(driver, dialect);
  await applyMigrations(driver, dialect);
  assert.equal(await migrationCount(driver), migrations.length);
  const platform = (
    await driver.query(
      "SELECT id, created_at FROM organizations WHERE id = 'platform'",
    )
  ).rows;
  assert.equal(platform.length, 1);
  assert.equal(
    Number(
      (
        await driver.query(
          "SELECT COUNT(*) AS count FROM memberships WHERE tenant_id = 'platform'",
        )
      ).rows[0].count,
    ),
    0,
  );
  const rows = (
    await driver.query(
      "SELECT id, tenant_id, equipment_type, scope, preference_order FROM equipment ORDER BY tenant_id, equipment_type, preference_order, id",
    )
  ).rows.map((row) => ({
    ...row,
    preference_order: Number(row.preference_order),
  }));
  const defaults = rows.filter((row) => row.tenant_id === "platform");
  assert.ok(defaults.every((row) => row.scope === "default"));
  assert.deepEqual(
    defaults
      .filter((row) => row.equipment_type === "telescope")
      .map((row) => row.id)
      .slice(0, 2),
    ["seestar-s50", "seestar-s30"],
  );
  for (const type of [
    "telescope",
    "camera",
    "eyepiece",
    "lens",
    "mount",
    "filter",
  ])
    assert.ok(
      defaults.some((row) => row.equipment_type === type),
      type,
    );
  assert.ok(!defaults.some((row) => row.id === "none"));
  assert.deepEqual(
    rows.filter((row) => row.tenant_id === "tenant-owner"),
    [
      {
        id: "own-refractor",
        tenant_id: "tenant-owner",
        equipment_type: "telescope",
        scope: "private",
        preference_order: 0,
      },
    ],
  );
}

test("migration 55 on a populated SQLite database at 54: the default equipment beside a space's own", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-portal-migration-55-"));
  const driver = SqliteDriver.open(join(directory, "portal.sqlite"));
  try {
    await migrateFiftyFourToFiftyFive(driver, "sqlite");
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test(
  "migration 55 on a populated PostgreSQL database at 54: the default equipment beside a space's own",
  { skip: !process.env.ASTRO_PORTAL_TEST_DATABASE_URL },
  async () => {
    const url = process.env.ASTRO_PORTAL_TEST_DATABASE_URL;
    if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(url))
      throw new Error(
        "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
      );
    const driver = PostgresDriver.open(url);
    try {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await migrateFiftyFourToFiftyFive(driver, "postgres");
    } finally {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await driver.close();
    }
  },
);

// At a service's first start several repositories migrate the same
// PostgreSQL database at once, each through its own pool.
test(
  "runners migrating one PostgreSQL database at once all succeed, each migration applied once",
  { skip: !process.env.ASTRO_PORTAL_TEST_DATABASE_URL },
  async () => {
    const url = process.env.ASTRO_PORTAL_TEST_DATABASE_URL;
    if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(url))
      throw new Error(
        "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
      );
    const drivers = Array.from({ length: 4 }, () => PostgresDriver.open(url));
    try {
      await drivers[0].run("DROP SCHEMA public CASCADE");
      await drivers[0].run("CREATE SCHEMA public");
      await Promise.all(
        drivers.map((driver) => applyMigrations(driver, "postgres")),
      );
      assert.equal(await migrationCount(drivers[0]), migrations.length);
    } finally {
      await drivers[0].run("DROP SCHEMA public CASCADE");
      await drivers[0].run("CREATE SCHEMA public");
      await Promise.all(drivers.map((driver) => driver.close()));
    }
  },
);

// A database at version 61 holding
// captures moves to 62 — each capture finalized, with its main image taken
// from its current file (its automatic check with it); the catalogue's rows
// stay the catalogue's; a personal target of a space is a row of the same
// library, invisible to the readers of the catalogue.
async function migrateSixtyOneToSixtyTwo(driver, dialect) {
  await applyMigrations(
    driver,
    dialect,
    migrations.filter(({ version }) => version <= 61),
  );
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    ["tenant-62", "Col des Étoiles", timestamp],
  );
  for (const [id, sha, size, check] of [
    ["capture-62-a", "a", 14, "sky"],
    ["capture-62-b", "b", 412, null],
  ])
    await driver.run(
      "INSERT INTO captures (id, tenant_id, original_name, sha256, byte_size, status, auto_check, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        id,
        "tenant-62",
        `${id}.jpg`,
        sha.repeat(64),
        size,
        "uploaded",
        check,
        timestamp,
      ],
    );
  await driver.run(
    `INSERT INTO target_catalogue_entries (
       id, designation, aliases_json, common_names_json, catalogues_json,
       catalogue, source_json, source_revision, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "m31",
      "M31",
      "[]",
      "[]",
      "[]",
      "Messier",
      "{}",
      "r1",
      timestamp,
      timestamp,
    ],
  );

  await applyMigrations(driver, dialect);
  assert.equal(await migrationCount(driver), migrations.length);
  const captures = (
    await driver.query(
      "SELECT id, stage FROM captures WHERE tenant_id = ? ORDER BY id",
      ["tenant-62"],
    )
  ).rows;
  assert.deepEqual(captures, [
    { id: "capture-62-a", stage: "finalized" },
    { id: "capture-62-b", stage: "finalized" },
  ]);
  const variants = (
    await driver.query(
      "SELECT id, capture_id, sha256, byte_size, original_name, source, width, is_main, is_public, auto_check, created_at FROM capture_variants WHERE tenant_id = ? ORDER BY capture_id",
      ["tenant-62"],
    )
  ).rows.map((row) => ({
    ...row,
    byte_size: Number(row.byte_size),
    is_main: Number(row.is_main),
    is_public: Number(row.is_public),
  }));
  assert.deepEqual(variants, [
    {
      id: "capture-62-a",
      capture_id: "capture-62-a",
      sha256: "a".repeat(64),
      byte_size: 14,
      original_name: "capture-62-a.jpg",
      source: null,
      width: null,
      is_main: 1,
      is_public: 0,
      auto_check: "sky",
      created_at: timestamp,
    },
    {
      id: "capture-62-b",
      capture_id: "capture-62-b",
      sha256: "b".repeat(64),
      byte_size: 412,
      original_name: "capture-62-b.jpg",
      source: null,
      width: null,
      is_main: 1,
      is_public: 0,
      auto_check: null,
      created_at: timestamp,
    },
  ]);
  const insertVariant = (id, sha, { primary = 0, source = "web" } = {}) =>
    driver.run(
      "INSERT INTO capture_variants (id, capture_id, tenant_id, sha256, byte_size, original_name, source, is_main, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        id,
        "capture-62-b",
        "tenant-62",
        sha,
        1,
        "x.jpg",
        source,
        primary,
        timestamp,
      ],
    );
  // A digest once per space, one main image per capture, a known source.
  await rejectsUnique(insertVariant("v-dup", "a".repeat(64)));
  await rejectsUnique(insertVariant("v-main", "c".repeat(64), { primary: 1 }));
  await rejectsCheck(
    insertVariant("v-src", "c".repeat(64), { source: "camera" }),
  );
  await insertVariant("v-alt", "c".repeat(64), { source: "stacking" });
  await rejectsCheck(
    driver.run("UPDATE capture_variants SET is_public = ? WHERE id = ?", [
      2,
      "v-alt",
    ]),
  );
  await rejectsCheck(
    driver.run("UPDATE captures SET stage = ? WHERE id = ?", [
      "published",
      "capture-62-a",
    ]),
  );
  // A new capture is a draft unless the service says otherwise.
  await driver.run(
    "INSERT INTO captures (id, tenant_id, original_name, sha256, byte_size, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      "capture-62-c",
      "tenant-62",
      "c.jpg",
      "d".repeat(64),
      1,
      "uploaded",
      timestamp,
    ],
  );
  assert.equal(
    (
      await driver.query("SELECT stage FROM captures WHERE id = ?", [
        "capture-62-c",
      ])
    ).rows[0].stage,
    "draft",
  );

  const catalogue = (
    await driver.query(
      "SELECT space_id, library_source, source_present FROM target_catalogue_entries WHERE id = ?",
      ["m31"],
    )
  ).rows[0];
  assert.deepEqual(
    { ...catalogue, source_present: Number(catalogue.source_present) },
    { space_id: null, library_source: "catalogue", source_present: 1 },
  );
  await driver.run(
    `INSERT INTO target_catalogue_entries (
       id, designation, aliases_json, common_names_json, catalogues_json,
       catalogue, source_json, source_present, source_revision, created_at,
       updated_at, space_id, library_source, gallery_label, place_name,
       observed_on, note
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "personal-62",
      "Comète du soir",
      "[]",
      "[]",
      "[]",
      "personal",
      "{}",
      "personal",
      timestamp,
      timestamp,
      "tenant-62",
      "personal",
      "Grand champ",
      "Col des Étoiles",
      "2026-10-05",
      "Note",
    ],
  );
  await rejectsCheck(
    driver.run(
      "UPDATE target_catalogue_entries SET library_source = ? WHERE id = ?",
      ["mine", "personal-62"],
    ),
  );
  await driver.run(
    "INSERT INTO capture_targets (capture_id, target_id, position) VALUES (?, ?, ?)",
    ["capture-62-a", "personal-62", 0],
  );
  const shared = (
    await driver.query(
      "SELECT id FROM target_catalogue_entries WHERE source_present = 1",
    )
  ).rows.map((row) => row.id);
  assert.deepEqual(shared, ["m31"]);
  await driver.run(
    "INSERT INTO upload_sessions (id, tenant_id, sha256, byte_size, original_name, chunk_size, part_path, created_at, updated_at, expires_at, variant_of, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      "upload-62",
      "tenant-62",
      "e".repeat(64),
      1,
      "e.jpg",
      1,
      "p",
      timestamp,
      timestamp,
      timestamp,
      "capture-62-a",
      "astro-sync",
    ],
  );
}

test("migration 62 on a populated SQLite database at 61: stage, main image, personal targets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-portal-migration-62-"));
  const driver = SqliteDriver.open(join(directory, "portal.sqlite"));
  try {
    await migrateSixtyOneToSixtyTwo(driver, "sqlite");
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test(
  "migration 62 on a populated PostgreSQL database at 61: stage, main image, personal targets",
  { skip: !process.env.ASTRO_PORTAL_TEST_DATABASE_URL },
  async () => {
    const url = process.env.ASTRO_PORTAL_TEST_DATABASE_URL;
    if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(url))
      throw new Error(
        "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
      );
    const driver = PostgresDriver.open(url);
    try {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await migrateSixtyOneToSixtyTwo(driver, "postgres");
    } finally {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await driver.close();
    }
  },
);

// A database at version 62 holding a
// capture with two images moves to 64 — the switch of the annotations on
// for every capture, no solution yet; a solution belongs to one image, from
// a known source, and is refused for an image that does not exist.
async function migrateSixtyTwoToSixtyFour(driver, dialect) {
  await applyMigrations(
    driver,
    dialect,
    migrations.filter(({ version }) => version <= 62),
  );
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    ["tenant-64", "Col des Étoiles", timestamp],
  );
  await driver.run(
    "INSERT INTO captures (id, tenant_id, original_name, sha256, byte_size, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      "capture-64",
      "tenant-64",
      "m31.jpg",
      "a".repeat(64),
      14,
      "uploaded",
      timestamp,
    ],
  );
  for (const [id, sha, main] of [
    ["image-64-main", "a", 1],
    ["image-64-variant", "b", 0],
  ])
    await driver.run(
      "INSERT INTO capture_variants (id, capture_id, tenant_id, sha256, byte_size, original_name, is_main, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        id,
        "capture-64",
        "tenant-64",
        sha.repeat(64),
        14,
        "m31.jpg",
        main,
        timestamp,
      ],
    );

  await applyMigrations(driver, dialect);
  assert.equal(await migrationCount(driver), migrations.length);
  const capture = (
    await driver.query("SELECT sky_annotations FROM captures WHERE id = ?", [
      "capture-64",
    ])
  ).rows[0];
  assert.equal(Number(capture.sky_annotations), 1);
  assert.equal(
    Number(
      (
        await driver.query(
          "SELECT COUNT(*) AS count FROM capture_sky_solutions",
        )
      ).rows[0].count,
    ),
    0,
  );
  const insert = (imageId, source = "astap", sha = "a") =>
    driver.run(
      "INSERT INTO capture_sky_solutions (image_id, capture_id, tenant_id, sha256, solution_json, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        imageId,
        "capture-64",
        "tenant-64",
        sha.repeat(64),
        "{}",
        source,
        timestamp,
        timestamp,
      ],
    );
  await insert("image-64-main");
  await insert("image-64-variant", "header", "b");
  // One solution per image; a known source; the switch is 0 or 1.
  await rejectsUnique(insert("image-64-main", "astrometry-net"));
  await rejectsCheck(
    driver.run(
      "UPDATE capture_sky_solutions SET source = ? WHERE image_id = ?",
      ["solve-field", "image-64-main"],
    ),
  );
  await rejectsCheck(
    driver.run("UPDATE captures SET sky_annotations = ? WHERE id = ?", [
      2,
      "capture-64",
    ]),
  );
  // A solution names an existing image (the foreign key).
  await assert.rejects(insert("image-64-missing"), /FOREIGN KEY|foreign key/i);
  const solutions = (
    await driver.query(
      "SELECT image_id, source FROM capture_sky_solutions WHERE capture_id = ? ORDER BY image_id",
      ["capture-64"],
    )
  ).rows;
  assert.deepEqual(solutions, [
    { image_id: "image-64-main", source: "astap" },
    { image_id: "image-64-variant", source: "header" },
  ]);
}

test("migration 64 on a populated SQLite database at 62: one sky solution per image, the switch on", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-portal-migration-64-"));
  const driver = SqliteDriver.open(join(directory, "portal.sqlite"));
  try {
    await migrateSixtyTwoToSixtyFour(driver, "sqlite");
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test(
  "migration 64 on a populated PostgreSQL database at 62: one sky solution per image, the switch on",
  { skip: !process.env.ASTRO_PORTAL_TEST_DATABASE_URL },
  async () => {
    const url = process.env.ASTRO_PORTAL_TEST_DATABASE_URL;
    if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(url))
      throw new Error(
        "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
      );
    const driver = PostgresDriver.open(url);
    try {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await migrateSixtyTwoToSixtyFour(driver, "postgres");
    } finally {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await driver.close();
    }
  },
);

// A database at version 65 holding a
// night with a v1 analysis moves to 67 — the night's own fields empty (the
// plan's), the v1 analysis dropped (no compatibility layer), one analysis
// per night, the steps' origin and frame count checked, the exposure kept
// as a double on both dialects.
async function migrateSixtyFiveToSixtySeven(driver, dialect) {
  await applyMigrations(
    driver,
    dialect,
    migrations.filter(({ version }) => version <= 65),
  );
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    ["tenant-67", "Col des Étoiles", timestamp],
  );
  await driver.run(
    "INSERT INTO observation_sessions (id, tenant_id, started_at, status, created_at) VALUES (?, ?, ?, ?, ?)",
    ["night-67", "tenant-67", timestamp, "finished", timestamp],
  );
  await driver.run(
    "INSERT INTO session_analyses (id, tenant_id, session_id, version, report_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [
      "analysis-v1",
      "tenant-67",
      "night-67",
      1,
      '{"reportVersion":1}',
      timestamp,
    ],
  );

  await applyMigrations(driver, dialect);
  assert.equal(await migrationCount(driver), migrations.length);
  const night = (
    await driver.query(
      "SELECT title, place_json, equipment_json, target_ids_json, notes FROM observation_sessions WHERE id = ?",
      ["night-67"],
    )
  ).rows[0];
  assert.deepEqual(
    { ...night },
    {
      title: null,
      place_json: null,
      equipment_json: null,
      target_ids_json: null,
      notes: null,
    },
  );
  const count = async (table) =>
    Number(
      (await driver.query(`SELECT COUNT(*) AS count FROM ${table}`)).rows[0]
        .count,
    );
  assert.equal(await count("session_analyses"), 0);

  const analysis = (id) =>
    driver.run(
      "INSERT INTO session_analyses (id, tenant_id, session_id, report_version, report_json, origin_device_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, "tenant-67", "night-67", 2, '{"reportVersion":2}', null, timestamp],
    );
  await analysis("analysis-v2");
  // One analysis per night.
  await rejectsUnique(analysis("analysis-v2-bis"));

  const step = (
    id,
    { origin = "manual", frames = 40, exposure = 180.5 } = {},
  ) =>
    driver.run(
      "INSERT INTO acquisition_steps (id, tenant_id, session_id, filter, frame_count, exposure_seconds, gain, origin, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        id,
        "tenant-67",
        "night-67",
        "Ha",
        frames,
        exposure,
        100,
        origin,
        1,
        timestamp,
        timestamp,
      ],
    );
  await step("step-1", { exposure: 0.123456789 });
  await step("step-2", { origin: "analysis" });
  await step("step-3", { origin: "import" });
  await rejectsCheck(step("step-4", { origin: "guess" }));
  await rejectsCheck(step("step-5", { frames: 0 }));
  await rejectsCheck(step("step-6", { exposure: 0 }));
  // A step names an existing night (the foreign key).
  await assert.rejects(
    driver.run(
      "INSERT INTO acquisition_steps (id, tenant_id, session_id, frame_count, exposure_seconds, origin, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        "step-7",
        "tenant-67",
        "night-missing",
        1,
        60,
        "manual",
        1,
        timestamp,
        timestamp,
      ],
    ),
    /FOREIGN KEY|foreign key/i,
  );
  const exposure = (
    await driver.query(
      "SELECT exposure_seconds FROM acquisition_steps WHERE id = ?",
      ["step-1"],
    )
  ).rows[0].exposure_seconds;
  assert.equal(Number(exposure), 0.123456789);
  assert.equal(await count("acquisition_steps"), 3);
}

test("migration 67 on a populated SQLite database at 65: the night's fields, its steps, one analysis v2", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-portal-migration-67-"));
  const driver = SqliteDriver.open(join(directory, "portal.sqlite"));
  try {
    await migrateSixtyFiveToSixtySeven(driver, "sqlite");
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test(
  "migration 67 on a populated PostgreSQL database at 65: the night's fields, its steps, one analysis v2",
  { skip: !process.env.ASTRO_PORTAL_TEST_DATABASE_URL },
  async () => {
    const url = process.env.ASTRO_PORTAL_TEST_DATABASE_URL;
    if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(url))
      throw new Error(
        "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
      );
    const driver = PostgresDriver.open(url);
    try {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await migrateSixtyFiveToSixtySeven(driver, "postgres");
    } finally {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await driver.close();
    }
  },
);

// A database at version 67 holding a
// capture and its main image moves to 68 — the image reads a title and a
// description NULL (« by default »); a title holds 60 characters at most, a
// description 280, never an empty string, on both dialects.
async function migrateSixtySevenToSixtyEight(driver, dialect) {
  await applyMigrations(
    driver,
    dialect,
    migrations.filter(({ version }) => version <= 67),
  );
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    ["tenant-68", "Col des Étoiles", timestamp],
  );
  await driver.run(
    "INSERT INTO captures (id, tenant_id, original_name, sha256, byte_size, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      "capture-68",
      "tenant-68",
      "M31_final.jpg",
      "c".repeat(64),
      14,
      "uploaded",
      timestamp,
    ],
  );
  await driver.run(
    "INSERT INTO capture_variants (id, capture_id, tenant_id, sha256, byte_size, original_name, is_main, is_public, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      "image-68",
      "capture-68",
      "tenant-68",
      "c".repeat(64),
      14,
      "M31_final.jpg",
      1,
      0,
      timestamp,
    ],
  );

  await applyMigrations(driver, dialect);
  assert.equal(await migrationCount(driver), migrations.length);
  const read = async () =>
    (
      await driver.query(
        "SELECT title, description FROM capture_variants WHERE id = ?",
        ["image-68"],
      )
    ).rows[0];
  assert.deepEqual({ ...(await read()) }, { title: null, description: null });
  const write = (column, value) =>
    driver.run(`UPDATE capture_variants SET ${column} = ? WHERE id = ?`, [
      value,
      "image-68",
    ]);
  // Migration 68 bounded the title at 60; migration 102 widened it to 90.
  await write("title", "é".repeat(90));
  await write(
    "description",
    "Recadrage serré sur le noyau. ".repeat(10).slice(0, 280),
  );
  assert.equal([...(await read()).title].length, 90);
  assert.equal([...(await read()).description].length, 280);
  await rejectsCheck(write("title", "é".repeat(91)));
  await rejectsCheck(write("description", "x".repeat(281)));
  await rejectsCheck(write("title", ""));
  await write("title", null);
  assert.equal((await read()).title, null);
}

test("migration 68 on a populated SQLite database at 67: an image reads no title nor description, both bounded", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-portal-migration-68-"));
  const driver = SqliteDriver.open(join(directory, "portal.sqlite"));
  try {
    await migrateSixtySevenToSixtyEight(driver, "sqlite");
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test(
  "migration 68 on a populated PostgreSQL database at 67: an image reads no title nor description, both bounded",
  { skip: !process.env.ASTRO_PORTAL_TEST_DATABASE_URL },
  async () => {
    const url = process.env.ASTRO_PORTAL_TEST_DATABASE_URL;
    if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(url))
      throw new Error(
        "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
      );
    const driver = PostgresDriver.open(url);
    try {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await migrateSixtySevenToSixtyEight(driver, "postgres");
    } finally {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await driver.close();
    }
  },
);

// A database at version 68 holding a
// finalized capture and its main image moves to 69 — every new column reads
// NULL (the capture reads its night, `finalized_at` is not invented), and
// the lengths of the sheet are held by the database on both dialects.
async function migrateSixtyEightToSixtyNine(driver, dialect) {
  await applyMigrations(
    driver,
    dialect,
    migrations.filter(({ version }) => version <= 68),
  );
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    ["tenant-69", "Col des Étoiles", timestamp],
  );
  await driver.run(
    "INSERT INTO captures (id, tenant_id, original_name, sha256, byte_size, status, stage, created_at) VALUES (?, ?, ?, ?, ?, ?, 'finalized', ?)",
    [
      "capture-69",
      "tenant-69",
      "M31_final.jpg",
      "d".repeat(64),
      14,
      "uploaded",
      timestamp,
    ],
  );
  await driver.run(
    "INSERT INTO capture_variants (id, capture_id, tenant_id, sha256, byte_size, original_name, is_main, is_public, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      "image-69",
      "capture-69",
      "tenant-69",
      "d".repeat(64),
      14,
      "M31_final.jpg",
      1,
      0,
      timestamp,
    ],
  );

  await applyMigrations(driver, dialect);
  assert.equal(await migrationCount(driver), migrations.length);
  const capture = (
    await driver.query(
      `SELECT title, description, notes, calibration, acquisition_json,
              sensor_json, equipment_json, processing_json,
              field_origins_json, finalized_at
       FROM captures WHERE id = ?`,
      ["capture-69"],
    )
  ).rows[0];
  for (const [column, value] of Object.entries(capture))
    assert.equal(value, null, `${column} reads NULL after the migration`);
  const image = (
    await driver.query(
      "SELECT title_source, edited_at FROM capture_variants WHERE id = ?",
      ["image-69"],
    )
  ).rows[0];
  assert.deepEqual({ ...image }, { title_source: null, edited_at: null });
  const sessionColumn = await driver.query(
    "SELECT metadata_json FROM upload_sessions WHERE 1 = 0",
  );
  assert.deepEqual(sessionColumn.rows, []);

  const write = (column, value, table = "captures", id = "capture-69") =>
    driver.run(`UPDATE ${table} SET ${column} = ? WHERE id = ?`, [value, id]);
  for (const [column, limit] of [
    ["title", 80],
    ["description", 2000],
    ["notes", 4000],
    ["calibration", 120],
  ]) {
    await write(column, "é".repeat(limit));
    await rejectsCheck(write(column, "é".repeat(limit + 1)));
    await rejectsCheck(write(column, ""));
    await write(column, null);
  }
  for (const source of ["astro-sync", "import", "owner"])
    await write("title_source", source, "capture_variants", "image-69");
  await rejectsCheck(
    write("title_source", "photo", "capture_variants", "image-69"),
  );
  await write("finalized_at", timestamp);
  assert.equal(
    (
      await driver.query("SELECT finalized_at FROM captures WHERE id = ?", [
        "capture-69",
      ])
    ).rows[0].finalized_at,
    timestamp,
  );
}

test("migration 69 on a populated SQLite database at 68: the metadata and the date of finalization read NULL, the lengths are held", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-portal-migration-69-"));
  const driver = SqliteDriver.open(join(directory, "portal.sqlite"));
  try {
    await migrateSixtyEightToSixtyNine(driver, "sqlite");
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test(
  "migration 69 on a populated PostgreSQL database at 68: the metadata and the date of finalization read NULL, the lengths are held",
  { skip: !process.env.ASTRO_PORTAL_TEST_DATABASE_URL },
  async () => {
    const url = process.env.ASTRO_PORTAL_TEST_DATABASE_URL;
    if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(url))
      throw new Error(
        "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
      );
    const driver = PostgresDriver.open(url);
    try {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await migrateSixtyEightToSixtyNine(driver, "postgres");
    } finally {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await driver.close();
    }
  },
);

// A database at version 69 holding two
// places of one space moves to 70 — nothing is lost, every place reads its
// `updated_at` as its `edited_at` and is live, the space has no default
// place yet; the default place is one row per space.
async function migrateSixtyNineToSeventy(driver, dialect) {
  await applyMigrations(
    driver,
    dialect,
    migrations.filter(({ version }) => version <= 69),
  );
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    ["tenant-70", "Col des Étoiles", timestamp],
  );
  const places = [
    [
      "row-70-a",
      "col-des-etoiles",
      '{"name":"Col des Étoiles","latitude":"45.00000","longitude":"-30.00000"}',
      "2026-09-20T21:00:00.000Z",
    ],
    [
      "row-70-b",
      "jardin",
      '{"name":"Jardin","latitude":"45.10000","longitude":"-30.10000"}',
      "2026-09-21T21:00:00.000Z",
    ],
  ];
  for (const [id, clientId, details, updatedAt] of places)
    await driver.run(
      "INSERT INTO known_locations (id, tenant_id, client_id, details_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [id, "tenant-70", clientId, details, timestamp, updatedAt],
    );

  await applyMigrations(driver, dialect);
  assert.equal(await migrationCount(driver), migrations.length);
  const rows = (
    await driver.query(
      "SELECT client_id, details_json, updated_at, edited_at, deleted_at FROM known_locations WHERE tenant_id = ? ORDER BY client_id",
      ["tenant-70"],
    )
  ).rows;
  assert.deepEqual(
    rows.map((row) => ({ ...row })),
    [
      {
        client_id: "col-des-etoiles",
        details_json: places[0][2],
        updated_at: places[0][3],
        edited_at: places[0][3],
        deleted_at: null,
      },
      {
        client_id: "jardin",
        details_json: places[1][2],
        updated_at: places[1][3],
        edited_at: places[1][3],
        deleted_at: null,
      },
    ],
  );
  assert.deepEqual(
    (await driver.query("SELECT * FROM place_preferences")).rows,
    [],
  );
  await driver.run(
    "INSERT INTO place_preferences (tenant_id, default_place_id, edited_at, updated_at) VALUES (?, ?, ?, ?)",
    ["tenant-70", "jardin", timestamp, timestamp],
  );
  await rejectsUnique(
    driver.run(
      "INSERT INTO place_preferences (tenant_id, default_place_id, edited_at, updated_at) VALUES (?, ?, ?, ?)",
      ["tenant-70", "col-des-etoiles", timestamp, timestamp],
    ),
  );
  await driver.run("DELETE FROM place_preferences");
  await assert.rejects(
    driver.run(
      "INSERT INTO place_preferences (tenant_id, default_place_id, updated_at) VALUES (?, ?, ?)",
      ["tenant-70", null, timestamp],
    ),
    /NOT NULL|null value/i,
  );
}

test("migration 70 on a populated SQLite database at 69: the places kept, edited when last updated, live, no default place", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-portal-migration-70-"));
  const driver = SqliteDriver.open(join(directory, "portal.sqlite"));
  try {
    await migrateSixtyNineToSeventy(driver, "sqlite");
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test(
  "migration 70 on a populated PostgreSQL database at 69: the places kept, edited when last updated, live, no default place",
  { skip: !process.env.ASTRO_PORTAL_TEST_DATABASE_URL },
  async () => {
    const url = process.env.ASTRO_PORTAL_TEST_DATABASE_URL;
    if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(url))
      throw new Error(
        "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
      );
    const driver = PostgresDriver.open(url);
    try {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await migrateSixtyNineToSeventy(driver, "postgres");
    } finally {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await driver.close();
    }
  },
);

// A database at version 71 holding a capture
// with its image, every table that references `captures` filled for it, and
// a capture written by an earlier version with the placeholder digest moves
// to 72 — the image columns are nullable, the placeholder reads NULL,
// nothing else changes: rows, references, indexes. On SQLite the table is
// rebuilt; `PRAGMA foreign_key_check` stays empty. Applied again (its row of
// `schema_migrations` removed), it changes nothing.
const REFERENCING_CAPTURES = [
  "capture_targets",
  "upload_sessions",
  "capture_tags",
  "capture_variants",
  "capture_sky_solutions",
];

async function referencesToCaptures(driver, dialect) {
  if (dialect === "sqlite") {
    const found = [];
    for (const table of REFERENCING_CAPTURES)
      for (const key of (
        await driver.query(`PRAGMA foreign_key_list("${table}")`)
      ).rows)
        if (key.table === "captures") found.push(`${table}.${key.from}`);
    return found.sort();
  }
  return (
    await driver.query(
      `SELECT c.conrelid::regclass::text AS source, a.attname AS column_name
       FROM pg_constraint c
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
       WHERE c.contype = 'f' AND c.confrelid = 'captures'::regclass`,
    )
  ).rows
    .map((row) => `${row.source}.${row.column_name}`)
    .sort();
}

async function captureIndexes(driver, dialect) {
  const rows =
    dialect === "sqlite"
      ? (
          await driver.query(
            "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'captures' AND name NOT LIKE 'sqlite_%'",
          )
        ).rows
      : (
          await driver.query(
            "SELECT indexname AS name FROM pg_indexes WHERE tablename = 'captures' AND indexname <> 'captures_pkey'",
          )
        ).rows;
  return rows.map((row) => row.name).sort();
}

async function migrateSeventyOneToSeventyTwo(driver, dialect) {
  await applyMigrations(
    driver,
    dialect,
    migrations.filter(({ version }) => version <= 71),
  );
  const tenant = "tenant-72";
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    [tenant, "Col des Étoiles", timestamp],
  );
  await driver.run(
    `INSERT INTO captures (id, tenant_id, target_id, original_name, sha256, byte_size, status,
       created_at, visibility, auto_check, stage, sky_annotations, title, finalized_at)
     VALUES (?, ?, ?, ?, ?, ?, 'uploaded', ?, 'public', 'sky', 'finalized', 0, ?, ?)`,
    [
      "capture-72",
      tenant,
      "m31",
      "M31_final.jpg",
      "e".repeat(64),
      14,
      timestamp,
      "M31 au Col des Étoiles",
      timestamp,
    ],
  );
  // An earlier version stored a capture without an image so.
  await driver.run(
    "INSERT INTO captures (id, tenant_id, original_name, sha256, byte_size, status, stage, created_at) VALUES (?, ?, '', ?, 0, 'draft', 'draft', ?)",
    ["capture-72-empty", tenant, "no-image:capture-72-empty", timestamp],
  );
  await driver.run(
    "INSERT INTO capture_targets (capture_id, target_id, position) VALUES (?, ?, ?), (?, ?, ?)",
    ["capture-72", "m31", 0, "capture-72-empty", "ngc7000", 0],
  );
  await driver.run(
    "INSERT INTO capture_tags (capture_id, tenant_id, tag) VALUES (?, ?, ?)",
    ["capture-72", tenant, "andromède"],
  );
  await driver.run(
    "INSERT INTO capture_variants (id, capture_id, tenant_id, sha256, byte_size, original_name, is_main, is_public, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?)",
    [
      "image-72",
      "capture-72",
      tenant,
      "e".repeat(64),
      14,
      "M31_final.jpg",
      timestamp,
    ],
  );
  await driver.run(
    "INSERT INTO capture_sky_solutions (image_id, capture_id, tenant_id, sha256, solution_json, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'astap', ?, ?)",
    [
      "image-72",
      "capture-72",
      tenant,
      "e".repeat(64),
      "{}",
      timestamp,
      timestamp,
    ],
  );
  await driver.run(
    `INSERT INTO upload_sessions (id, tenant_id, sha256, byte_size, original_name, chunk_size,
       state, part_path, capture_id, created_at, updated_at, expires_at)
     VALUES (?, ?, ?, 14, 'M31_final.jpg', 14, 'completed', 'part', ?, ?, ?, ?)`,
    [
      "upload-72",
      tenant,
      "e".repeat(64),
      "capture-72",
      timestamp,
      timestamp,
      timestamp,
    ],
  );
  // The columns a later migration adds (75: `project_id`, `plan_json`, the
  // image of a multi-night plan; 81: `replaced_at`, `replaced_source`, the
  // replacement of an image; 82: `revision`; 84: `replaced_made_private`; 88:
  // `restored_at`, the return of a capture from a trash; 91: `made_public_at`;
  // 97: `archived_at`; 100: the two quality switches) are not this migration's: left out.
  const readCapture = async () => {
    const {
      project_id: _project,
      plan_json: _plan,
      replaced_at: _replacedAt,
      replaced_source: _replacedSource,
      revision: _revision,
      replaced_made_private: _madePrivate,
      restored_at: _restoredAt,
      made_public_at: _madePublicAt,
      archived_at: _archivedAt,
      quality_private: _qualityPrivate,
      quality_public: _qualityPublic,
      ...row
    } = (
      await driver.query("SELECT * FROM captures WHERE id = ?", ["capture-72"])
    ).rows[0];
    return row;
  };
  const counts = async () => {
    const found = {};
    for (const table of ["captures", ...REFERENCING_CAPTURES])
      found[table] = Number(
        (await driver.query(`SELECT COUNT(*) AS count FROM ${table}`)).rows[0]
          .count,
      );
    return found;
  };
  const before = {
    capture: await readCapture(),
    counts: await counts(),
    references: await referencesToCaptures(driver, dialect),
    indexes: await captureIndexes(driver, dialect),
  };
  assert.equal(before.references.length, REFERENCING_CAPTURES.length);
  assert.equal(before.indexes.length, 5);

  const check = async () => {
    assert.equal(await migrationCount(driver), migrations.length);
    assert.deepEqual(await readCapture(), before.capture, "the capture kept");
    assert.deepEqual(await counts(), before.counts, "every row kept");
    assert.deepEqual(
      await referencesToCaptures(driver, dialect),
      before.references,
      "the five tables still reference captures",
    );
    // Migration 75 adds `captures_project_idx`, migration 97
    // `captures_archived_idx`: not this one's.
    assert.deepEqual(
      (await captureIndexes(driver, dialect)).filter(
        (name) =>
          name !== "captures_project_idx" && name !== "captures_archived_idx",
      ),
      before.indexes,
    );
    assert.deepEqual(
      {
        ...(
          await driver.query(
            "SELECT sha256, byte_size, original_name FROM captures WHERE id = ?",
            ["capture-72-empty"],
          )
        ).rows[0],
      },
      { sha256: null, byte_size: null, original_name: null },
      "the placeholder reads NULL",
    );
    if (dialect === "sqlite")
      assert.deepEqual(
        (await driver.query("PRAGMA foreign_key_check")).rows,
        [],
      );
  };

  await applyMigrations(driver, dialect);
  await check();
  if (dialect === "sqlite")
    assert.deepEqual(
      (await driver.query("PRAGMA table_info(captures)")).rows
        .filter((column) =>
          ["sha256", "byte_size", "original_name"].includes(column.name),
        )
        .map((column) => [column.name, Number(column.notnull)])
        .sort(),
      [
        ["byte_size", 0],
        ["original_name", 0],
        ["sha256", 0],
      ],
    );
  else
    assert.deepEqual(
      (
        await driver.query(
          `SELECT column_name, is_nullable FROM information_schema.columns
           WHERE table_name = 'captures' AND column_name IN ('sha256', 'byte_size', 'original_name')
           ORDER BY column_name`,
        )
      ).rows.map((row) => ({ ...row })),
      [
        { column_name: "byte_size", is_nullable: "YES" },
        { column_name: "original_name", is_nullable: "YES" },
        { column_name: "sha256", is_nullable: "YES" },
      ],
    );

  // Applied again on a database already at 72: nothing changes.
  await driver.run("DELETE FROM schema_migrations WHERE version = ?", [72]);
  await applyMigrations(driver, dialect);
  await check();

  // Two captures without an image in one space; the references and the
  // checks are still enforced.
  await driver.run(
    "INSERT INTO captures (id, tenant_id, status, created_at) VALUES (?, ?, 'draft', ?)",
    ["capture-72-second", tenant, timestamp],
  );
  await assert.rejects(
    driver.run(
      "INSERT INTO capture_tags (capture_id, tenant_id, tag) VALUES (?, ?, ?)",
      ["capture-72-missing", tenant, "orpheline"],
    ),
    /FOREIGN KEY|foreign key/i,
  );
  await rejectsCheck(
    driver.run("UPDATE captures SET stage = ? WHERE id = ?", [
      "published",
      "capture-72",
    ]),
  );
  await rejectsUnique(
    driver.run(
      "INSERT INTO captures (id, tenant_id, original_name, sha256, byte_size, status, created_at) VALUES (?, ?, ?, ?, ?, 'uploaded', ?)",
      ["capture-72-twin", tenant, "M31.jpg", "e".repeat(64), 14, timestamp],
    ),
  );
}

test("migration 72 on a populated SQLite database at 71: the captures table rebuilt with nullable image columns, rows, references and indexes kept, the placeholder read NULL", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-portal-migration-72-"));
  const driver = SqliteDriver.open(join(directory, "portal.sqlite"));
  try {
    await migrateSeventyOneToSeventyTwo(driver, "sqlite");
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test(
  "migration 72 on a populated PostgreSQL database at 71: the image columns of a capture nullable, rows, references and indexes kept, the placeholder read NULL",
  { skip: !process.env.ASTRO_PORTAL_TEST_DATABASE_URL },
  async () => {
    const url = process.env.ASTRO_PORTAL_TEST_DATABASE_URL;
    if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(url))
      throw new Error(
        "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
      );
    const driver = PostgresDriver.open(url);
    try {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await migrateSeventyOneToSeventyTwo(driver, "postgres");
    } finally {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await driver.close();
    }
  },
);

// A database at version 76
// holding an integration and a night moves to 77 — the integration is kept
// as it was (SQLite rebuilds its table), its plan can now be emptied
// (detached), and every night reads no multi-night plan of its own.
async function migrateSeventySixToSeventySeven(driver, dialect) {
  await applyMigrations(
    driver,
    dialect,
    migrations.filter(({ version }) => version <= 76),
  );
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    ["tenant-77", "Col des Mélèzes", timestamp],
  );
  await driver.run(
    "INSERT INTO observation_sessions (id, tenant_id, started_at, status, created_at) VALUES (?, ?, ?, 'finished', ?)",
    ["night-77", "tenant-77", "2026-08-11T00:40:00.000Z", timestamp],
  );
  await driver.run(
    `INSERT INTO project_integrations
       (id, tenant_id, project_id, night_id, target_id, family_key, filter,
        exposure_seconds, frame_count, total_seconds, evening_date,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "integration-77",
      "tenant-77",
      "project-77",
      "night-77",
      "ic1805",
      '["RGB",90,null,null,null]',
      "RGB",
      90,
      89,
      8010,
      "2026-08-10",
      timestamp,
      timestamp,
    ],
  );

  await applyMigrations(driver, dialect);
  assert.equal(await migrationCount(driver), migrations.length);
  const kept = (
    await driver.query(
      "SELECT project_id, night_id, filter, frame_count, total_seconds FROM project_integrations WHERE id = ?",
      ["integration-77"],
    )
  ).rows.map((row) => ({
    ...row,
    frame_count: Number(row.frame_count),
    total_seconds: Number(row.total_seconds),
  }));
  assert.deepEqual(kept, [
    {
      project_id: "project-77",
      night_id: "night-77",
      filter: "RGB",
      frame_count: 89,
      total_seconds: 8010,
    },
  ]);
  await driver.run(
    "UPDATE project_integrations SET project_id = NULL WHERE id = ?",
    ["integration-77"],
  );
  const night = (
    await driver.query(
      "SELECT project_id FROM observation_sessions WHERE id = ?",
      ["night-77"],
    )
  ).rows[0];
  assert.equal(night.project_id, null);
}

test("migration 77 on a populated SQLite database at 76: the integrations are kept and can leave their plan, the nights read no plan of their own", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-portal-migration-77-"));
  const driver = SqliteDriver.open(join(directory, "portal.sqlite"));
  try {
    await migrateSeventySixToSeventySeven(driver, "sqlite");
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test(
  "migration 77 on a populated PostgreSQL database at 76: the integrations are kept and can leave their plan, the nights read no plan of their own",
  { skip: !process.env.ASTRO_PORTAL_TEST_DATABASE_URL },
  async () => {
    const url = process.env.ASTRO_PORTAL_TEST_DATABASE_URL;
    if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(url))
      throw new Error(
        "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
      );
    const driver = PostgresDriver.open(url);
    try {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await migrateSeventySixToSeventySeven(driver, "postgres");
    } finally {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await driver.close();
    }
  },
);

// A database at version 81 holding a capture and an image moves to 82 — the
// capture reads revision 1 (nothing is migrated by a script), the image no
// quality, and the table of the fields' revisions takes a row per field and
// line.
async function migrateEightyOneToEightyTwo(driver, dialect) {
  await applyMigrations(
    driver,
    dialect,
    migrations.filter(({ version }) => version <= 81),
  );
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    ["tenant-82", "Col des Mélèzes", timestamp],
  );
  await driver.run(
    `INSERT INTO captures (id, tenant_id, original_name, sha256, byte_size, status, stage, created_at)
     VALUES (?, ?, ?, ?, ?, 'uploaded', 'draft', ?)`,
    ["capture-82", "tenant-82", "m31.jpg", "f".repeat(64), 100, timestamp],
  );
  await driver.run(
    `INSERT INTO capture_variants (id, capture_id, tenant_id, sha256, byte_size, original_name, is_main, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      "image-82",
      "capture-82",
      "tenant-82",
      "f".repeat(64),
      100,
      "m31.jpg",
      timestamp,
    ],
  );

  await applyMigrations(driver, dialect);
  assert.equal(await migrationCount(driver), migrations.length);
  const capture = (
    await driver.query("SELECT revision FROM captures WHERE id = ?", [
      "capture-82",
    ])
  ).rows[0];
  assert.equal(
    Number(capture.revision),
    1,
    "a capture without a revision reads 1",
  );
  const image = (
    await driver.query(
      "SELECT quality_json FROM capture_variants WHERE id = ?",
      ["image-82"],
    )
  ).rows[0];
  assert.equal(
    image.quality_json,
    null,
    "an image without a quality reads none",
  );
  await driver.run(
    `INSERT INTO capture_field_revisions (capture_id, tenant_id, field, line_id, revision)
     VALUES (?, ?, 'acquisition', 'line-1', 2), (?, ?, 'title', '', 2)`,
    ["capture-82", "tenant-82", "capture-82", "tenant-82"],
  );
  await assert.rejects(
    driver.run(
      `INSERT INTO capture_field_revisions (capture_id, tenant_id, field, line_id, revision)
       VALUES (?, ?, 'title', '', 3)`,
      ["capture-82", "tenant-82"],
    ),
    "one row per capture, field and line",
  );
}

test("migration 82 on a populated SQLite database at 81: the revision reads 1, the image no quality, one revision per field and line", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-portal-migration-82-"));
  const driver = SqliteDriver.open(join(directory, "portal.sqlite"));
  try {
    await migrateEightyOneToEightyTwo(driver, "sqlite");
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test(
  "migration 82 on a populated PostgreSQL database at 81: the revision reads 1, the image no quality, one revision per field and line",
  { skip: !process.env.ASTRO_PORTAL_TEST_DATABASE_URL },
  async () => {
    const url = process.env.ASTRO_PORTAL_TEST_DATABASE_URL;
    if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(url))
      throw new Error(
        "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
      );
    const driver = PostgresDriver.open(url);
    try {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await migrateEightyOneToEightyTwo(driver, "postgres");
    } finally {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await driver.close();
    }
  },
);

// A database at version 86 holding a space, a plan
// and a session moves to 87 — the session reads live (no deletion), the plan
// no origin of an archive, and the unique index « one session per plan » now
// counts the live sessions only: a deleted session keeps its plan and a new
// one may be made for it.
async function migrateEightySixToEightySeven(driver, dialect) {
  await applyMigrations(
    driver,
    dialect,
    migrations.filter(({ version }) => version <= 86),
  );
  assert.equal(
    await migrationCount(driver),
    migrations.filter(({ version }) => version <= 86).length,
  );
  const timestamp = "2026-10-14T00:00:00.000Z";
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    ["tenant-87", "Col des Mélèzes", timestamp],
  );
  await driver.run(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
    ["user-87", "user-87@example.test", "scrypt$test", timestamp],
  );
  await driver.run(
    `INSERT INTO plans (id, tenant_id, created_by_user_id, client_id, plan_date, name, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'executed', ?, ?)`,
    [
      "plan-87",
      "tenant-87",
      "user-87",
      "browser-87",
      "2026-10-04",
      "Nuit",
      timestamp,
      timestamp,
    ],
  );
  const session = (id) =>
    driver.run(
      `INSERT INTO observation_sessions (id, tenant_id, plan_id, started_at, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'finished', ?, ?)`,
      [id, "tenant-87", "plan-87", timestamp, timestamp, timestamp],
    );
  await session("session-87");
  await assert.rejects(
    session("session-87-bis"),
    "before: one session per plan, deleted or not",
  );

  await applyMigrations(driver, dialect);
  assert.equal(await migrationCount(driver), migrations.length);
  const kept = (
    await driver.query(
      "SELECT deleted_at, plan_id FROM observation_sessions WHERE id = ?",
      ["session-87"],
    )
  ).rows[0];
  assert.equal(kept.deleted_at, null, "a session that was there is live");
  assert.equal(kept.plan_id, "plan-87");
  const plan = (
    await driver.query("SELECT archived_from, status FROM plans WHERE id = ?", [
      "plan-87",
    ])
  ).rows[0];
  assert.equal(plan.archived_from, null);
  assert.equal(plan.status, "executed");

  await assert.rejects(
    session("session-87-bis"),
    "a plan still holds one live session",
  );
  await driver.run(
    "UPDATE observation_sessions SET deleted_at = ? WHERE id = ?",
    [timestamp, "session-87"],
  );
  await session("session-87-bis");
  const count = (
    await driver.query(
      "SELECT COUNT(*) AS count FROM observation_sessions WHERE plan_id = ?",
      ["plan-87"],
    )
  ).rows[0];
  assert.equal(
    Number(count.count),
    2,
    "a deleted session keeps its plan beside the new one",
  );
}

test("migration 87 on a populated SQLite database at 86: the sessions live, the plan no archive origin, one live session per plan", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-portal-migration-87-"));
  const driver = SqliteDriver.open(join(directory, "portal.sqlite"));
  try {
    await migrateEightySixToEightySeven(driver, "sqlite");
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test(
  "migration 87 on a populated PostgreSQL database at 86: the sessions live, the plan no archive origin, one live session per plan",
  { skip: !process.env.ASTRO_PORTAL_TEST_DATABASE_URL },
  async () => {
    const url = process.env.ASTRO_PORTAL_TEST_DATABASE_URL;
    if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(url))
      throw new Error(
        "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
      );
    const driver = PostgresDriver.open(url);
    try {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await migrateEightySixToEightySeven(driver, "postgres");
    } finally {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await driver.close();
    }
  },
);

// A database at version 87 holding a capture moves to 88 — the capture
// keeps the date it was added and has never come back from a trash
// (`restored_at` NULL), and the column takes a date.
async function migrateEightySevenToEightyEight(driver, dialect) {
  await applyMigrations(
    driver,
    dialect,
    migrations.filter(({ version }) => version <= 87),
  );
  assert.equal(
    await migrationCount(driver),
    migrations.filter(({ version }) => version <= 87).length,
  );
  const timestamp = "2026-10-14T00:00:00.000Z";
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    ["tenant-88", "Col des Mélèzes", timestamp],
  );
  await driver.run(
    `INSERT INTO captures (id, tenant_id, original_name, sha256, byte_size, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'uploaded', ?)`,
    ["capture-88", "tenant-88", "m31.fits", "a".repeat(64), 10, timestamp],
  );

  await applyMigrations(driver, dialect);
  assert.equal(await migrationCount(driver), migrations.length);
  const row = (
    await driver.query(
      "SELECT created_at, restored_at FROM captures WHERE id = ?",
      ["capture-88"],
    )
  ).rows[0];
  assert.equal(row.created_at, timestamp);
  assert.equal(row.restored_at, null);
  await driver.run("UPDATE captures SET restored_at = ? WHERE id = ?", [
    "2026-10-15T00:00:00.000Z",
    "capture-88",
  ]);
  const restored = (
    await driver.query(
      "SELECT created_at, restored_at FROM captures WHERE id = ?",
      ["capture-88"],
    )
  ).rows[0];
  assert.equal(restored.created_at, timestamp);
  assert.equal(restored.restored_at, "2026-10-15T00:00:00.000Z");
}

test("migration 88 on a populated SQLite database at 87: the capture keeps its date added, restored_at is empty", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-portal-migration-88-"));
  const driver = SqliteDriver.open(join(directory, "portal.sqlite"));
  try {
    await migrateEightySevenToEightyEight(driver, "sqlite");
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test(
  "migration 88 on a populated PostgreSQL database at 87: the capture keeps its date added, restored_at is empty",
  { skip: !process.env.ASTRO_PORTAL_TEST_DATABASE_URL },
  async () => {
    const url = process.env.ASTRO_PORTAL_TEST_DATABASE_URL;
    if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(url))
      throw new Error(
        "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
      );
    const driver = PostgresDriver.open(url);
    try {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await migrateEightySevenToEightyEight(driver, "postgres");
    } finally {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await driver.close();
    }
  },
);

// A database at version 90 holding captures moves to 91 — every capture
// keeps what it had, and `made_public_at` is empty on all of them, the
// public ones included: nothing recorded when they became public, so the
// date is unknown and is never made up (« Publique, date inconnue »). The
// column then takes a date and can be cleared.
async function migrateNinetyToNinetyOne(driver, dialect) {
  await applyMigrations(
    driver,
    dialect,
    migrations.filter(({ version }) => version <= 90),
  );
  assert.equal(
    await migrationCount(driver),
    migrations.filter(({ version }) => version <= 90).length,
  );
  const added = "2026-10-02T08:00:00.000Z";
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    ["tenant-91", "Col des Mélèzes", added],
  );
  const insert = (id, visibility, extra = {}) =>
    driver.run(
      `INSERT INTO captures (id, tenant_id, original_name, sha256, byte_size, status, visibility, admin_check, admin_check_at, removed_from_gallery_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'uploaded', ?, ?, ?, ?, ?)`,
      [
        id,
        "tenant-91",
        `${id}.fits`,
        id.padEnd(64, "a").slice(0, 64),
        10,
        visibility,
        extra.adminCheck ?? null,
        extra.adminCheckAt ?? null,
        extra.removedAt ?? null,
        added,
      ],
    );
  await insert("public-a", "public");
  await insert("public-b", "public", {
    adminCheck: "approved",
    adminCheckAt: "2026-10-05T08:00:00.000Z",
    removedAt: "2026-10-06T08:00:00.000Z",
  });
  await insert("private-a", "private");

  await applyMigrations(driver, dialect);
  assert.equal(await migrationCount(driver), migrations.length);
  const rows = async () =>
    (
      await driver.query(
        `SELECT id, visibility, admin_check, admin_check_at, removed_from_gallery_at, created_at, made_public_at
         FROM captures WHERE tenant_id = ? ORDER BY id`,
        ["tenant-91"],
      )
    ).rows;
  assert.deepEqual(
    (await rows()).map((row) => [row.id, row.visibility, row.made_public_at]),
    [
      ["private-a", "private", null],
      ["public-a", "public", null],
      ["public-b", "public", null],
    ],
    "no date is made up for a capture that was already public",
  );
  const kept = (await rows()).find((row) => row.id === "public-b");
  assert.equal(kept.admin_check, "approved");
  assert.equal(kept.admin_check_at, "2026-10-05T08:00:00.000Z");
  assert.equal(kept.removed_from_gallery_at, "2026-10-06T08:00:00.000Z");
  assert.equal(kept.created_at, added);

  const day = "2026-10-17T01:02:03.000Z";
  await driver.run("UPDATE captures SET made_public_at = ? WHERE id = ?", [
    day,
    "public-a",
  ]);
  assert.equal(
    (await rows()).find((row) => row.id === "public-a").made_public_at,
    day,
  );
  await driver.run("UPDATE captures SET made_public_at = NULL WHERE id = ?", [
    "public-a",
  ]);
  assert.equal(
    (await rows()).find((row) => row.id === "public-a").made_public_at,
    null,
  );
  // A capture inserted afterwards starts with no date, too.
  await insert("public-c", "public");
  assert.equal(
    (await rows()).find((row) => row.id === "public-c").made_public_at,
    null,
  );
  // Running the migrations again changes nothing.
  await applyMigrations(driver, dialect);
  assert.equal(await migrationCount(driver), migrations.length);
}

test("migration 91 on a populated SQLite database at 90: every capture is kept, made_public_at is empty (a date inconnue), then takes a date", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-portal-migration-91-"));
  const driver = SqliteDriver.open(join(directory, "portal.sqlite"));
  try {
    await migrateNinetyToNinetyOne(driver, "sqlite");
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test(
  "migration 91 on a populated PostgreSQL database at 90: every capture is kept, made_public_at is empty (a date inconnue), then takes a date",
  { skip: !process.env.ASTRO_PORTAL_TEST_DATABASE_URL },
  async () => {
    const url = process.env.ASTRO_PORTAL_TEST_DATABASE_URL;
    if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(url))
      throw new Error(
        "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
      );
    const driver = PostgresDriver.open(url);
    try {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await migrateNinetyToNinetyOne(driver, "postgres");
    } finally {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await driver.close();
    }
  },
);
