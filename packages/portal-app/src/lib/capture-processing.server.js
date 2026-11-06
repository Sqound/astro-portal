import { createCaptureRepository } from "portal/persistence/capture-repository.js";
import { galleryTeam } from "./service-extensions.js";
import { databaseDriver } from "portal/persistence/database.js";
import { recordBackendLog } from "./app-log.server.js";

/**
 * The processing of the captures in this process: the thumbnail and the
 * automatic check of every capture after its upload, on the process-owned
 * driver, its lines in the application log (Administration → Logs). The
 * upload routes call `captureCreated`; the tab « Captures » and the
 * server's start (at startup and every hour) call `pickUpPendingCaptures`
 * for the captures left without a result.
 *
 * `portal/captures/capture-processing.js` reaches `sharp`: it is loaded
 * here by `await import`, and the server's start loads this module by a
 * name computed at run time, so that neither enters the static import
 * graph of `server.mjs`.
 */
let shared = null;

const configured = () =>
  Boolean(
    process.env.ASTRO_PORTAL_DATABASE_PATH ||
    process.env.ASTRO_PORTAL_DATABASE_URL,
  );

async function processor() {
  if (!configured()) return null;
  shared ??= (async () => {
    const driver = databaseDriver();
    // The service migrated the database before serving: no second
    // migration here, whose transaction would meet a request's.
    const store = await createCaptureRepository({
      driver,
      dialect: driver.dialect,
      migrate: false,
    });
    const { createCaptureProcessor } =
      await import("portal/captures/capture-processing.js");
    return createCaptureProcessor({
      store,
      // The check belongs to a team: a server without one records the sky.
      checked: () => Boolean(galleryTeam()),
      log: (level, event, message, context) =>
        recordBackendLog({ level, event, message, context }),
    });
  })().catch((error) => {
    shared = null;
    throw error;
  });
  return await shared;
}

/**
 * Queues a capture an upload created, or an alternative image an upload
 * added to one (`{ variant }`); never waits for the work.
 */
export function captureCreated(tenantId, capture, { variant = null } = {}) {
  void processor()
    .then((found) => found?.enqueue(tenantId, capture, variant))
    .catch(() => {});
}

/**
 * Queues the captures left without a result — of one space (`tenantId`),
 * or of every space. Resolves to how many were queued; never rejects.
 */
export async function pickUpPendingCaptures({ tenantId = null } = {}) {
  try {
    const found = await processor();
    return found ? await found.pickUpPending({ tenantId }) : 0;
  } catch {
    return 0;
  }
}

/**
 * Runs the automatic check again on every image (every space, or one):
 * `{ captures, images, queued }`, or `null` when this process has no
 * database. The route checks the administration and `recheckRefusal`.
 */
export async function recheckCaptures({ tenantId = null } = {}) {
  const found = await processor();
  return found ? await found.recheck({ tenantId }) : null;
}
