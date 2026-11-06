import {
  OwnerCaptureError,
  createOwnerCaptureService,
} from "portal/captures/owner-captures.js";
import { databaseDriver } from "portal/persistence/database.js";
import { recordBackendLog } from "../app-log.server.js";
import { pickUpPendingCaptures } from "../capture-processing.server.js";
import { galleryTeam, serviceExtension } from "../service-extensions.js";
import { entitlementProviderFor } from "./entitlement-provider.js";
import { v1Error, v1Json } from "./response.js";
import { requestedLocale } from "./targets-query.js";

// The owner's captures (« Mon espace » → « Captures »), on the
// process-owned persistence driver, with the space's capabilities
// (`./entitlement-provider.js`). The delay of the notice of « vérification
// non passée » is `ASTRO_PORTAL_CHECK_NOTICE_DAYS` (14 days by default).
let shared = null;

const noticeDays = () => {
  const value = Number(process.env.ASTRO_PORTAL_CHECK_NOTICE_DAYS);
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
};

export async function requireOwnerCaptureService() {
  if (
    !process.env.ASTRO_PORTAL_DATABASE_PATH &&
    !process.env.ASTRO_PORTAL_DATABASE_URL
  )
    throw Object.assign(new Error("Capture storage is unavailable."), {
      code: "capture_storage_unavailable",
      status: 503,
    });
  if (!shared) {
    const driver = databaseDriver();
    shared = createOwnerCaptureService({
      driver,
      dialect: driver.dialect,
      entitlementProvider: entitlementProviderFor(driver),
      // Whether a team checks the captures, read at each use: the
      // composition registers it as it loads.
      moderated: () => Boolean(galleryTeam()),
      // What the team keeps about a capture goes with it, in the same
      // transaction, even when the team is switched off.
      captureRemoved: (transaction, removed) =>
        serviceExtension("gallery.moderation")?.captureRemoved?.(
          transaction,
          removed,
        ),
      ...(noticeDays() === undefined ? {} : { noticeDays: noticeDays() }),
      // Listing the tab queues the space's captures left without a
      // thumbnail and a check.
      pickUpPending: (tenantId) => pickUpPendingCaptures({ tenantId }),
      // The files of a deleted capture the store did not delete at once are
      // reported in the application log (Administration → Logs).
      log: (level, event, message, context) =>
        recordBackendLog({ level, event, message, context }),
    });
  }
  return await shared;
}

/**
 * The hourly pass over the files of deleted captures that the store has not
 * deleted yet (`server/start.js`): the tasks that are due are tried again, a
 * longer time after each failure. Logs, never throws. Nothing without a
 * database.
 */
export async function replayCaptureFileDeletions({ log, at } = {}) {
  if (
    !process.env.ASTRO_PORTAL_DATABASE_PATH &&
    !process.env.ASTRO_PORTAL_DATABASE_URL
  )
    return null;
  try {
    const result = await (
      await requireOwnerCaptureService()
    ).replayFileDeletions(at ? { at } : {});
    if (result.done || result.failed || result.remaining)
      log?.info?.(
        "captures.files.replayed",
        `${result.done} deletion(s) of files done, ${result.failed} failed, ${result.remaining} still waiting.`,
      );
    return result;
  } catch (error) {
    log?.warn?.(
      "captures.files.replayed",
      `The pending deletions of files were not tried (${error.message}).`,
    );
    return null;
  }
}

/** The v1 error envelope of a refusal of the owner's captures. */
export function ownerCaptureFailure(error) {
  // The block on publishing says when it ends.
  if (error?.code === "publishing_blocked")
    return v1Json(
      {
        error: {
          code: error.code,
          message: error.message,
          publishingBlockedUntil: error.publishingBlockedUntil ?? null,
        },
      },
      { status: 403 },
    );
  // `409 capture_conflict` names the field (and the line of « Intégrations
  // ») that changed and carries the capture as it stands.
  if (error?.code === "capture_conflict")
    return v1Json(
      {
        error: {
          code: error.code,
          message: error.message,
          field: error.conflictField,
          ...(error.conflictLine === undefined
            ? {}
            : { line: error.conflictLine }),
        },
        capture: error.capture,
      },
      { status: 409 },
    );
  // `invalid_metadata` names the field and its limit.
  if (error instanceof OwnerCaptureError && error.field !== undefined)
    return v1Json(
      {
        error: {
          code: error.code,
          message: error.message,
          field: error.field,
          limit: error.limit ?? null,
        },
      },
      { status: error.status || 400 },
    );
  if (
    error instanceof OwnerCaptureError ||
    error?.code === "capture_storage_unavailable"
  )
    return v1Error(error);
  return v1Error(error, {
    code: "capture_storage_unavailable",
    message: "Capture storage is unavailable.",
    status: 503,
  });
}

/**
 * The page's language for the names of targets: `?locale=` when the
 * registry ships it, else English.
 */
export const localeOf = (request) => requestedLocale(new URL(request.url));
