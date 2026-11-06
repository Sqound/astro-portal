// A scratch space for the Journal's service tests: the services of the
// uploads and of the owner's captures on one driver (SQLite or PostgreSQL),
// nights, plans and debriefings written by hand. Every name, place and date
// is invented.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUploadResourceService } from "../../dist/api/upload-resources.js";
import { createOwnerCaptureService } from "../../dist/captures/owner-captures.js";
import { writeCaptureLinesForCapture } from "../../dist/captures/capture-lines-sync.js";
import { nightLines } from "../../dist/captures/capture-metadata.js";
import { nightStepsFor } from "../../dist/captures/capture-night-steps.js";
import { capturePathFor } from "../../dist/uploads/capture-storage.js";
import {
  digest,
  multipart,
  profile,
  seedSpace,
  WEB,
} from "./metadata-space.mjs";

const boundary = "astro-portal-metadata-test-boundary";
async function* once(buffer) {
  yield buffer;
}

/** The services of the uploads and of the owner's captures on `driver`. */
export async function withServices(
  driver,
  {
    capabilities = profile(),
    entitlementProvider = null,
    uploadOptions = {},
    ownerOptions = {},
  } = {},
  exercise,
) {
  const directory = await mkdtemp(join(tmpdir(), "astro-journal-captures-"));
  const previous = process.env.ASTRO_PORTAL_CAPTURES_DIR;
  process.env.ASTRO_PORTAL_CAPTURES_DIR = join(directory, "captures");
  const options = {
    driver,
    dialect: driver.dialect,
    capabilities,
    ...(entitlementProvider ? { entitlementProvider } : {}),
  };
  // The wiring of the route adapter: a capture that arrives on a session
  // reads its lines from the night, and its card its steps.
  const uploads = await createUploadResourceService({
    ...options,
    ...uploadOptions,
    onCapturePlaced: (tenantId, captureId) =>
      writeCaptureLinesForCapture(driver, tenantId, captureId),
    nightLinesFor: async (_tenantId, sessionId, targetIds) =>
      nightLines(await nightStepsFor(driver, sessionId, targetIds)),
  });
  const owner = await createOwnerCaptureService({
    ...options,
    sharedCopy: async ({ tenantId, sha256 }) => ({
      path: capturePathFor(tenantId, sha256),
      created: false,
    }),
    showable: async () => true,
    ...ownerOptions,
  });
  const space = await seedSpace(driver);
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
    await exercise({ driver, uploads, owner, space, send });
  } finally {
    await uploads.close();
    if (previous === undefined) delete process.env.ASTRO_PORTAL_CAPTURES_DIR;
    else process.env.ASTRO_PORTAL_CAPTURES_DIR = previous;
    await rm(directory, { force: true, recursive: true });
  }
}

export const exists = (path) =>
  access(path).then(
    () => true,
    () => false,
  );

export async function refusal(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("expected a refusal");
}

/** A finished session of an evening, its plan's place and its first target. */
export async function seedSession(
  driver,
  space,
  { date, place, startedAt, target },
) {
  const planId = randomUUID();
  await driver.run(
    `INSERT INTO plans (id, tenant_id, created_by_user_id, client_id, name, plan_date, location_json, payload_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Nuit', ?, ?, ?, ?, ?)`,
    [
      planId,
      space.tenantId,
      space.userId,
      `client-${planId}`,
      date,
      JSON.stringify({ name: place, latitude: 45, longitude: -30 }),
      JSON.stringify({ items: [{ id: randomUUID(), targetId: target }] }),
      "2026-10-01T00:00:00.000Z",
      "2026-10-01T00:00:00.000Z",
    ],
  );
  const sessionId = randomUUID();
  await driver.run(
    "INSERT INTO observation_sessions (id, tenant_id, plan_id, started_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'finished', ?, ?)",
    [
      sessionId,
      space.tenantId,
      planId,
      startedAt,
      "2026-10-01T00:00:00.000Z",
      "2026-10-01T00:00:00.000Z",
    ],
  );
  return { planId, sessionId };
}

/** A night of M31 debriefed `executed` with 90 minutes declared on it. */
export async function seedDebriefedNight(
  driver,
  space,
  { date = "2026-10-09" } = {},
) {
  const planId = randomUUID();
  const itemId = "item-m31";
  await driver.run(
    `INSERT INTO plans (id, tenant_id, created_by_user_id, client_id, name, plan_date, status, frozen_at, debrief_targets_json, payload_json, location_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Nuit de la galaxie', ?, 'executed', ?, ?, ?, ?, ?, ?)`,
    [
      planId,
      space.tenantId,
      space.userId,
      `client-${planId}`,
      date,
      "2026-10-10T08:00:00.000Z",
      JSON.stringify([
        { targetId: itemId, state: "done", acquiredMinutes: 90 },
      ]),
      JSON.stringify({
        items: [
          { id: itemId, targetId: "m31", startMinute: 0, durationMinutes: 120 },
        ],
      }),
      JSON.stringify({ name: "Col des Étoiles", latitude: 45, longitude: -30 }),
      "2026-10-01T00:00:00.000Z",
      "2026-10-01T00:00:00.000Z",
    ],
  );
  const sessionId = randomUUID();
  await driver.run(
    "INSERT INTO observation_sessions (id, tenant_id, plan_id, started_at, finished_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'finished', ?, ?)",
    [
      sessionId,
      space.tenantId,
      planId,
      `${date}T21:00:00.000Z`,
      `${date}T23:30:00.000Z`,
      "2026-10-01T00:00:00.000Z",
      "2026-10-01T00:00:00.000Z",
    ],
  );
  return { planId, sessionId };
}
