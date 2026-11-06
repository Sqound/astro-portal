// A scratch space for the metadata of
// a capture — the services of the uploads, of the owner's captures and of
// the galleries on one SQLite database, a space « Camille » with M31, the
// plan « Nuit d'octobre au col » at « Col des Étoiles » (Bortle 4,
// 45° N 30° W), its night with two steps on M31, and the space's equipment.
// Every name, place and date is invented.
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUploadResourceService } from "../../dist/api/upload-resources.js";
import { createOwnerCaptureService } from "../../dist/captures/owner-captures.js";
import { createPublicGalleryService } from "../../dist/captures/public-gallery.js";
import { createCaptureRepository } from "../../dist/persistence/capture-repository.js";
import { capturePathFor } from "../../dist/uploads/capture-storage.js";
import { createDatabaseDriver } from "../../dist/persistence/database.js";
import { applyMigrations } from "../../dist/persistence/migration-runner.js";
import { OPEN_SOURCE_PROFILE } from "../../dist/capabilities/profiles.js";

export const at = "2026-10-06T09:41:00.000Z";
export const PHONE = { kind: "device", application: "planner" };
export const SYNC = { kind: "device", application: "sync" };
export const WEB = { kind: "web" };
export const digest = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export const image = (label, size = 100) =>
  Buffer.concat([Buffer.from(label), Buffer.alloc(size - label.length, 7)]);

export const profile = (changes = {}) => ({
  ...OPEN_SOURCE_PROFILE,
  "storage.max_file_bytes": 100000,
  "storage.quota_bytes": 1000000,
  ...changes,
});

const boundary = "astro-portal-metadata-test-boundary";

export function multipart({ metadata, fileBytes, filename = "m31.jpg" }) {
  return Buffer.concat([
    Buffer.from(`--${boundary}\r\n`, "latin1"),
    Buffer.from(
      'Content-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n',
      "latin1",
    ),
    Buffer.from(JSON.stringify(metadata), "utf8"),
    Buffer.from(`\r\n--${boundary}\r\n`, "latin1"),
    Buffer.from(
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/jpeg\r\n\r\n`,
      "latin1",
    ),
    fileBytes,
    Buffer.from(`\r\n--${boundary}--\r\n`, "latin1"),
  ]);
}

async function* once(buffer) {
  yield buffer;
}

/** The space, its plan, its night (two steps on M31) and its equipment. */
export async function seedSpace(driver) {
  const tenantId = randomUUID();
  const userId = randomUUID();
  await driver.run(
    "INSERT INTO organizations (id, name, created_at, public_name) VALUES (?, ?, ?, ?)",
    [tenantId, "Camille", at, "Camille"],
  );
  await driver.run(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
    [userId, `${userId}@exemple.test`, "test-only", at],
  );
  await driver.run(
    "INSERT INTO memberships (id, tenant_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)",
    [randomUUID(), tenantId, userId, at],
  );
  for (const id of ["m31", "ic1396"])
    await driver.run(
      `INSERT INTO target_catalogue_entries (
         id, designation, aliases_json, common_names_json, type_key, ra_hours,
         dec_degrees, catalogues_json, catalogue, source_json, source_revision,
         created_at, updated_at
       ) VALUES (?, ?, '["NGC 224"]', '[]', 'galaxy', 0.712, 41.27, '["Messier"]', 'Messier', '{}', 'r1', ?, ?)
       ON CONFLICT (id) DO NOTHING`,
      [id, id.toUpperCase(), at, at],
    );
  const equipment = {};
  for (const [key, type, name] of [
    ["telescope", "telescope", "Askar 50P"],
    ["camera", "camera", "ZWO ASI533MC Pro"],
    ["mount", "mount", "ZWO AM5N"],
    ["filter", "filter", "Dual-band"],
    ["otherCamera", "camera", "Caméra de guidage"],
  ]) {
    const id = randomUUID();
    equipment[key] = id;
    await driver.run(
      `INSERT INTO equipment (id, tenant_id, equipment_type, name, specifications_json, planner_json, created_at, updated_at, preference_order)
       VALUES (?, ?, ?, ?, '{}', '{}', ?, ?, 0)`,
      [id, tenantId, type, name, at, at],
    );
  }
  const planId = randomUUID();
  await driver.run(
    `INSERT INTO plans (id, tenant_id, created_by_user_id, client_id, name, plan_date, location_json, equipment_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      planId,
      tenantId,
      userId,
      `client-${planId}`,
      "Nuit d’octobre au col",
      "2026-10-05",
      JSON.stringify({
        name: "Col des Étoiles",
        latitude: 45,
        longitude: -30,
        bortle: 4,
      }),
      JSON.stringify({
        telescopeId: equipment.telescope,
        cameraId: equipment.camera,
        mountId: equipment.mount,
        filterIds: [],
      }),
      at,
      at,
    ],
  );
  const sessionId = randomUUID();
  await driver.run(
    "INSERT INTO observation_sessions (id, tenant_id, plan_id, started_at, finished_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'finished', ?, ?)",
    [
      sessionId,
      tenantId,
      planId,
      "2026-10-05T21:40:00.000Z",
      "2026-10-06T04:50:00.000Z",
      at,
      at,
    ],
  );
  const otherSessionId = randomUUID();
  await driver.run(
    "INSERT INTO observation_sessions (id, tenant_id, plan_id, started_at, status, created_at, updated_at) VALUES (?, ?, NULL, ?, 'finished', ?, ?)",
    [otherSessionId, tenantId, "2026-10-07T21:00:00.000Z", at, at],
  );
  for (const [position, filter, frames, exposure] of [
    [1, "Dual-band", 38, 180],
    [2, null, 20, 120],
  ])
    await driver.run(
      `INSERT INTO acquisition_steps (id, tenant_id, session_id, target_id, filter, frame_count, exposure_seconds, gain, origin, position, created_at, updated_at)
       VALUES (?, ?, ?, 'm31', ?, ?, ?, 100, 'analysis', ?, ?, ?)`,
      [
        randomUUID(),
        tenantId,
        sessionId,
        filter,
        frames,
        exposure,
        position,
        at,
        at,
      ],
    );
  return {
    tenantId,
    userId,
    planId,
    sessionId,
    otherSessionId,
    equipment,
  };
}

/**
 * The services on a scratch database, `fn({ driver, uploads, owner,
 * gallery, store, space, other, send })`; `other` is a second space.
 */
export async function withMetadataSpace(
  fn,
  { capabilities = profile(), entitlementProvider = null, now = null } = {},
) {
  const directory = await mkdtemp(join(tmpdir(), "astro-capture-metadata-"));
  const previous = process.env.ASTRO_PORTAL_CAPTURES_DIR;
  process.env.ASTRO_PORTAL_CAPTURES_DIR = join(directory, "captures");
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  await applyMigrations(driver, "sqlite");
  const uploads = await createUploadResourceService({
    driver,
    dialect: "sqlite",
    capabilities,
    ...(entitlementProvider ? { entitlementProvider } : {}),
  });
  const owner = await createOwnerCaptureService({
    driver,
    dialect: "sqlite",
    capabilities,
    ...(entitlementProvider ? { entitlementProvider } : {}),
    ...(now ? { now } : {}),
    sharedCopy: async ({ tenantId, sha256 }) => ({
      path: capturePathFor(tenantId, sha256),
      created: false,
    }),
    showable: async () => true,
  });
  const gallery = await createPublicGalleryService({
    driver,
    sharedCopy: async ({ tenantId, sha256 }) => ({
      path: capturePathFor(tenantId, sha256),
    }),
    imageSize: async () => null,
  });
  const store = await createCaptureRepository({
    driver,
    dialect: "sqlite",
    migrate: false,
  });
  const space = await seedSpace(driver);
  const other = await seedSpace(driver);
  const send = async (bytes, metadata = {}, caller = WEB, onto = space) =>
    await uploads.receiveUpload({
      tenantId: onto.tenantId,
      userId: onto.userId,
      contentType: `multipart/form-data; boundary=${boundary}`,
      bodyChunks: once(
        multipart({
          metadata: {
            originalName: "M31_final.jpg",
            sha256: digest(bytes),
            byteSize: bytes.length,
            ...metadata,
          },
          fileBytes: bytes,
        }),
      ),
      caller,
    });
  try {
    await fn({ driver, uploads, owner, gallery, store, space, other, send });
  } finally {
    await uploads.close();
    await driver.close();
    if (previous === undefined) delete process.env.ASTRO_PORTAL_CAPTURES_DIR;
    else process.env.ASTRO_PORTAL_CAPTURES_DIR = previous;
    await rm(directory, { force: true, recursive: true });
  }
}

/**
 * The errors of `value` against a definition of an API schema
 * (`manage-captures.schema.json#/$defs/capture`…), its sibling files
 * registered: an empty list when the value is in the contract.
 */
export async function contractErrors(file, pointer, value) {
  const { readFile } = await import("node:fs/promises");
  const { registerExternalSchema, schemaErrors } =
    await import("../../../astro-contracts/tests/schema-assert.mjs");
  const read = async (name) =>
    JSON.parse(
      await readFile(
        new URL(
          `../../../astro-contracts/schemas/api/${name}`,
          import.meta.url,
        ),
        "utf8",
      ),
    );
  for (const name of [
    "capture.schema.json",
    "capture-variant.schema.json",
    "sky-solution.schema.json",
    "manage-captures.schema.json",
  ])
    registerExternalSchema(name, await read(name));
  const schema = await read(file);
  return schemaErrors({ ...schema, $ref: `#/$defs/${pointer}` }, value);
}
