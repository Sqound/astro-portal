import { ensureTargetCatalogue } from "../target-library.server.js";
import { createUploadResourceService } from "portal/api/upload-resources.js";
import { writeCaptureLinesForCapture } from "portal/captures/capture-lines-sync.js";
import { nightLines } from "portal/captures/capture-metadata.js";
import { nightStepsFor } from "portal/captures/capture-night-steps.js";
import { databaseDriver } from "portal/persistence/database.js";
import { captureCreated } from "../capture-processing.server.js";
import { galleryTeam } from "../service-extensions.js";
import {
  entitlementProviderFor,
  multiNightActiveFor,
} from "./entitlement-provider.js";
import { v1Error, v1Json } from "./response.js";

// The storage an account may use comes from `./entitlement-provider.js`: a
// private server's open-source profile, where only its person caps their
// own disk (`ASTRO_PORTAL_STORAGE_MAX_FILE_BYTES`,
// `ASTRO_PORTAL_STORAGE_QUOTA_BYTES`), or what a registered provider gives
// the account.
let sharedService = null;
let configurationKey = null;

// The delay of the notice of « vérification non passée » (the date the app
// says a protection is lifted), as the owner's captures read it.
const noticeDays = () => {
  const value = Number(process.env.ASTRO_PORTAL_CHECK_NOTICE_DAYS);
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
};

/**
 * Keeps upload/capture operations on the process-owned persistence driver,
 * like the existing plan resource service and other v1 repositories. A
 * process cannot safely switch database configuration after its first
 * service has been created.
 */
export async function uploadResourceService() {
  const databasePath = process.env.ASTRO_PORTAL_DATABASE_PATH || null;
  const databaseUrl = process.env.ASTRO_PORTAL_DATABASE_URL || null;
  if (!databasePath && !databaseUrl) return null;
  await ensureTargetCatalogue();
  const nextKey = databaseUrl
    ? `postgres:${databaseUrl}`
    : `sqlite:${databasePath}`;
  if (sharedService && configurationKey !== nextKey)
    throw new Error(
      "Upload resource database configuration cannot change during a process.",
    );
  if (sharedService) return sharedService;
  const driver = databaseDriver({
    ASTRO_PORTAL_DATABASE_PATH: databasePath,
    ASTRO_PORTAL_DATABASE_URL: databaseUrl,
  });
  sharedService = await createUploadResourceService({
    driver,
    dialect: databaseUrl ? "postgres" : "sqlite",
    entitlementProvider: entitlementProviderFor(driver),
    // Every capture created is queued for its thumbnail and its automatic
    // check, after the answer.
    onCaptureCreated: captureCreated,
    // The image of a multi-night plan, where the entitlement provider allows
    // it; always on a private server, which never restricts the multi-night
    // plans.
    multiNightActive: (userId) => multiNightActiveFor(driver, userId),
    // A capture that arrived on a session reads its
    // lines from the night, without a touch.
    onCapturePlaced: (tenantId, captureId) =>
      writeCaptureLinesForCapture(driver, tenantId, captureId),
    // The card of a capture with no line of its own reads its night's steps.
    nightLinesFor: async (_tenantId, sessionId, targetIds) =>
      nightLines(await nightStepsFor(driver, sessionId, targetIds)),
    moderated: () => Boolean(galleryTeam()),
    ...(noticeDays() === undefined ? {} : { noticeDays: noticeDays() }),
  });
  configurationKey = nextKey;
  return sharedService;
}

export async function requireUploadResourceService() {
  const service = await uploadResourceService();
  if (service) return service;
  throw Object.assign(new Error("Capture storage is unavailable."), {
    code: "capture_storage_unavailable",
    status: 503,
  });
}

/** Preserves the package service's contractual error body, including the 409/413 refusal's `storage`. */
export function uploadResourceFailure(error) {
  if (error?.body && Number.isInteger(error?.status))
    return v1Json(error.body, { status: error.status });
  return v1Error(error, {
    code: "capture_storage_unavailable",
    message: "Capture storage is unavailable.",
    status: 503,
  });
}
