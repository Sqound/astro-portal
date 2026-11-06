/**
 * What happens to every capture after its upload: its thumbnail, then the
 * automatic check (`checkCaptureFile`), stored once (`auto_check`,
 * `auto_check_reason`, `auto_check_at`). Private or public, nothing here ever
 * blocks, hides or moves a capture: the check writes its result, and the rule
 * of a capture's state (`capture-state.js`) reads it.
 *
 * - **After the answer, once.** The upload routes queue a capture they
 *   created after their answer is built (a deduplicated replay queues
 *   nothing). The work starts on a later turn of the event loop, never
 *   inside the request.
 * - **One capture at a time** in a process (the image work is
 *   CPU-bound): one queue for the whole process, kept on `globalThis` so that the
 *   copy of this module that Next.js bundles with the routes and the copy
 *   the server's start loads share it.
 * - **Taken again.** A capture left without a result (a process stopped before it
 *   finished, a crash, every capture stored before the check existed) is
 *   queued again at startup, every hour, and when its owner lists the tab
 *   « Captures ». The result is written only while the capture has none
 *   (`onlyIfPending`): two processes reaching the same capture write one.
 * - **Never fails the caller.** An unreadable file is `undetermined`
 *   (`unreadable`), a thumbnail that cannot be written is logged; the
 *   queue keeps going.
 *
 * `ruleVersion` and `signals` have no column: they go to the
 * application log with the result, never to the capture's row.
 *
 * Each image is read once from the capture store
 * (`uploads/capture-store.js`): its dimensions, its thumbnail and its check
 * share the one path on this machine `withLocalFile` gives.
 *
 * This module reaches `sharp` (through the sky check and the derived
 * files) only by `await import`: it is loaded by the routes and, by name at
 * run time, by the server's start — never in the static import graph of
 * `server.mjs`.
 */

import {
  checkCaptureFile,
  skyCheckSettingsFromEnv,
} from "../sky-check/index.js";
import { readPhotoSoftware } from "../sky-check/image-metadata.js";
import { isProductionHost } from "../mail/test-inbox.js";
import { captureStore } from "../uploads/capture-store.js";
import { recordProposals } from "./capture-metadata.js";
import {
  readImageDimensions,
  writeThumbnail,
} from "../uploads/derived-images.js";

const STATE = Symbol.for("astro-portal.capture-processing");

/** The setting that allows the check to be run again on any deployment. */
export const RECHECK_SETTING = "ASTRO_PORTAL_ALLOW_SKY_CHECK_RECHECK";
const TEST_ENVIRONMENTS = ["staging", "development", "test"];

/**
 * Why the automatic check of every image may not be run again here, or
 * `null` when it may: a test deployment (`ASTRO_PORTAL_ENVIRONMENT`
 * `staging`, `development` or `test`, an allow-list) that does not answer
 * on a production address, or the operator's explicit setting
 * (`ASTRO_PORTAL_ALLOW_SKY_CHECK_RECHECK=1`, a private server after an
 * update of the rule). Never on a production address by default.
 */
export function recheckRefusal(env = process.env) {
  if (String(env[RECHECK_SETTING] || "").trim() === "1") return null;
  const environment = String(env.ASTRO_PORTAL_ENVIRONMENT || "")
    .trim()
    .toLowerCase();
  if (!TEST_ENVIRONMENTS.includes(environment))
    return `The automatic check runs again only on a test deployment (ASTRO_PORTAL_ENVIRONMENT staging, development or test), or with ${RECHECK_SETTING}=1.`;
  let host = null;
  try {
    host = new URL(String(env.ASTRO_PORTAL_PUBLIC_URL || "")).hostname;
  } catch {
    host = null;
  }
  if (host && isProductionHost(host, env))
    return `The automatic check never runs again on a production address without ${RECHECK_SETTING}=1.`;
  return null;
}

/** The queue of the process, shared by every copy of this module. */
function queue() {
  globalThis[STATE] ??= {
    jobs: new Map(),
    running: false,
    paused: false,
    waiting: [],
  };
  return globalThis[STATE];
}

const keyOf = (tenantId, captureId) => `${tenantId}\u0000${captureId}`;

function settle(state) {
  if (state.running || (state.jobs.size && !state.paused)) return;
  for (const resolve of state.waiting.splice(0)) resolve();
}

async function work(state) {
  if (state.running || state.paused) return;
  state.running = true;
  try {
    while (state.jobs.size && !state.paused) {
      const [key, job] = state.jobs.entries().next().value;
      try {
        await job.run();
      } catch {
        // A job reports its own failures; the queue never stops on one.
      } finally {
        state.jobs.delete(key);
      }
    }
  } finally {
    state.running = false;
    settle(state);
  }
}

/**
 * Queues one capture's processing (`run`, an async function), unless the
 * same capture is already queued or running. The work starts on a later
 * turn of the event loop.
 */
export function queueCaptureProcessing({ tenantId, captureId }, run) {
  const state = queue();
  const key = keyOf(tenantId, captureId);
  if (state.jobs.has(key)) return false;
  state.jobs.set(key, { run });
  setImmediate(() => void work(state));
  return true;
}

/**
 * Holds the queue (`true`) or lets it run again (`false`). For tests that
 * write the checks by hand and need the upload not to be processed.
 */
export function pauseCaptureProcessing(paused = true) {
  const state = queue();
  state.paused = paused;
  if (!paused) setImmediate(() => void work(state));
  else settle(state);
}

/** Resolves once nothing is queued or running (or the queue is held). */
export function captureProcessingIdle() {
  const state = queue();
  if (!state.running && (!state.jobs.size || state.paused))
    return Promise.resolve();
  return new Promise((resolve) => state.waiting.push(resolve));
}

/**
 * `use(path)` with the original of one image on this machine, or
 * `use(null)` when it cannot be had: every step then says so on its own
 * (no dimensions, no thumbnail, an `unreadable` check).
 */
async function withOriginalOf(files, tenantId, sha256, use) {
  let ran = false;
  try {
    return await files.withLocalFile(
      { tenantId, sha256, file: "original" },
      (path) => {
        ran = true;
        return use(path);
      },
    );
  } catch (error) {
    if (ran) throw error;
    return await use(null);
  }
}

const unreadable = () => ({
  result: "undetermined",
  reason: "unreadable",
  checkedAt: new Date().toISOString(),
  ruleVersion: null,
  signals: null,
  milliseconds: 0,
});

/**
 * What a server with no team records in place of the check: the sky. Nobody
 * is to look at a capture there, so nothing is run, asked or shown of it.
 */
export const skyWithoutCheck = async () => ({
  result: "sky",
  reason: null,
  checkedAt: new Date().toISOString(),
  ruleVersion: null,
  signals: null,
  milliseconds: 0,
});

/**
 * Processes one capture of a space: its thumbnail, then its automatic
 * check, stored once. `store` is a capture repository; `log(level, event,
 * message, context)` receives what happened. Answers `{ thumbnail,
 * result, written }`.
 */
export async function processCapture({
  store,
  tenantId,
  capture,
  // An alternative image of the capture, processed on its own (its
  // thumbnail, its dimensions, its automatic check: the check belongs to
  // each image).
  variant = null,
  settings = skyCheckSettingsFromEnv(),
  check = checkCaptureFile,
  thumbnail = writeThumbnail,
  dimensions = readImageDimensions,
  // The processing program the main image names, proposed as the
  // capture's `processing.software` (source `photo`).
  software = readPhotoSoftware,
  log = () => {},
  captureStore: files = captureStore(),
}) {
  const current = await store.getCaptureById(tenantId, capture.id);
  if (!current) return { thumbnail: false, result: null, written: false };
  if (variant && !variant.main) {
    const processed = await withOriginalOf(
      files,
      tenantId,
      variant.sha256,
      (original) =>
        processVariant({
          store,
          tenantId,
          captureId: current.id,
          variant,
          settings,
          check,
          thumbnail,
          dimensions,
          log,
          original,
          files,
        }),
    );
    // Deleted while it was processed (the image, or its capture with it):
    // what was just derived goes too.
    const still =
      typeof store.getVariant === "function"
        ? await store.getVariant(tenantId, current.id, variant.id)
        : true;
    if (!still)
      await discardDerivedFiles({
        store,
        files,
        log,
        tenantId,
        sha256: variant.sha256,
      });
    return processed;
  }
  const result = await withOriginalOf(
    files,
    tenantId,
    current.sha256,
    (original) =>
      processMainImage({
        store,
        tenantId,
        current,
        settings,
        check,
        thumbnail,
        dimensions,
        software,
        log,
        original,
        files,
      }),
  );
  // Deleted (or its image replaced) while it was processed: what was just
  // derived goes too, unless an image holds those bytes still.
  const after = await store.getCaptureById(tenantId, current.id);
  if (!after || after.sha256 !== current.sha256)
    await discardDerivedFiles({
      store,
      files,
      log,
      tenantId,
      sha256: current.sha256,
    });
  return result;
}

/**
 * The derived files of an image deleted while it was processed: a task of
 * the repository (`capture-file-deletions.js`), tried at once and again by
 * the hourly maintenance when the store does not answer — never an error of
 * the processing. A repository without tasks (a test double) removes them
 * directly.
 */
async function discardDerivedFiles({ store, files, log, tenantId, sha256 }) {
  try {
    if (typeof store.fileDeletions === "function")
      await store.fileDeletions({ files, log }).discard({
        tenantId,
        digests: [sha256],
        scope: "derived",
      });
    else await files.remove({ tenantId, sha256, file: "derived" });
  } catch (error) {
    log("warning", "captures.files.deletion_failed", "Derived files stay.", {
      tenantId,
      reason: String(error?.message || error).slice(0, 500),
    });
  }
}

/** The main image: its dimensions, its thumbnail, the capture's check. */
async function processMainImage({
  store,
  tenantId,
  current,
  settings,
  check,
  thumbnail,
  dimensions,
  software,
  log,
  original,
  files,
}) {
  await recordDimensions(store, tenantId, current.sha256, dimensions, {
    original,
    files,
  });
  await proposePhotoSoftware(store, tenantId, current, original, software);
  let thumbnailWritten = false;
  try {
    thumbnailWritten = (
      await thumbnail({
        tenantId,
        sha256: current.sha256,
        original,
        captureStore: files,
      })
    ).written;
  } catch (error) {
    log("warning", "captures.thumbnail", "A thumbnail was not written.", {
      captureId: current.id,
      reason: error?.code || "unreadable",
    });
  }
  let verdict = null;
  if (current.checks?.automatic == null) {
    try {
      if (!original) throw new Error("original unavailable");
      verdict = await check({
        path: original,
        originalName: current.originalName,
        byteSize: current.byteSize,
        settings,
      });
    } catch {
      verdict = unreadable();
    }
  }
  const written = verdict
    ? await store.recordAutomaticCheck(
        tenantId,
        current.id,
        {
          result: verdict.result,
          reason: verdict.reason,
          at: verdict.checkedAt,
        },
        { onlyIfPending: true },
      )
    : false;
  if (verdict)
    log("info", "captures.checked", `Automatic check: ${verdict.result}.`, {
      captureId: current.id,
      result: verdict.result,
      reason: verdict.reason,
      ruleVersion: verdict.ruleVersion,
      milliseconds: verdict.milliseconds,
      written,
      signals: verdict.signals,
    });
  return {
    thumbnail: thumbnailWritten,
    result: verdict?.result ?? current.checks?.automatic ?? null,
    written,
  };
}

/**
 * « D'après la photo » — the
 * program the main image names becomes the capture's `processing.software`
 * while the capture has none (never over Astro Sync's, the import's or the
 * owner's); nothing else is read from the photo, never a position nor a
 * date.
 */
async function proposePhotoSoftware(
  store,
  tenantId,
  current,
  original,
  software,
) {
  if (!original || typeof store.captureRow !== "function") return;
  try {
    const row = await store.captureRow(tenantId, current.id);
    if (!row) return;
    const processing = row.processing_json
      ? JSON.parse(row.processing_json)
      : null;
    if (processing?.software) return;
    const name = await software(original, {
      extension: String(current.originalName || "")
        .split(".")
        .pop()
        .toLowerCase(),
    });
    if (!name) return;
    await recordProposals({
      store,
      tenantId,
      capture: row,
      input: { source: "photo", fields: { processing: { software: name } } },
      at: new Date().toISOString(),
    });
  } catch {
    // A signal, never a requirement: the capture is processed without it.
  }
}

async function recordDimensions(
  store,
  tenantId,
  sha256,
  dimensions,
  { original = null, files } = {},
) {
  if (typeof store.recordVariantDimensions !== "function") return;
  try {
    const found = await dimensions({
      tenantId,
      sha256,
      original,
      captureStore: files,
    });
    if (found) await store.recordVariantDimensions(tenantId, sha256, found);
  } catch {
    // Dimensions are a detail of the screen; the processing goes on.
  }
}

/** One alternative image: its thumbnail, its dimensions, its check. */
async function processVariant({
  store,
  tenantId,
  captureId,
  variant,
  settings,
  check,
  thumbnail,
  dimensions,
  log,
  original,
  files,
}) {
  let thumbnailWritten = false;
  try {
    thumbnailWritten = (
      await thumbnail({
        tenantId,
        sha256: variant.sha256,
        original,
        captureStore: files,
      })
    ).written;
  } catch (error) {
    log("warning", "captures.thumbnail", "A thumbnail was not written.", {
      captureId,
      variantId: variant.id,
      reason: error?.code || "unreadable",
    });
  }
  await recordDimensions(store, tenantId, variant.sha256, dimensions, {
    original,
    files,
  });
  let verdict = null;
  if (variant.automaticCheck == null) {
    try {
      if (!original) throw new Error("original unavailable");
      verdict = await check({
        path: original,
        originalName: variant.originalName,
        byteSize: variant.byteSize,
        settings,
      });
    } catch {
      verdict = unreadable();
    }
  }
  const written = verdict
    ? await store.recordVariantCheck(
        tenantId,
        variant.id,
        {
          result: verdict.result,
          reason: verdict.reason,
          at: verdict.checkedAt,
        },
        { onlyIfPending: true },
      )
    : false;
  if (verdict)
    log("info", "captures.checked", `Automatic check: ${verdict.result}.`, {
      captureId,
      variantId: variant.id,
      result: verdict.result,
      reason: verdict.reason,
      ruleVersion: verdict.ruleVersion,
      milliseconds: verdict.milliseconds,
      written,
      signals: verdict.signals,
    });
  return {
    thumbnail: thumbnailWritten,
    result: verdict?.result ?? variant.automaticCheck ?? null,
    written,
  };
}

/**
 * The processing of a process: `enqueue(tenantId, capture)` after an
 * upload, `pickUpPending({ tenantId })` for the captures left without a
 * result (every space when `tenantId` is absent). `store` is a capture
 * repository on the process's driver.
 */
export function createCaptureProcessor({
  store,
  settings,
  log = () => {},
  processOne = processCapture,
  // Whether a team checks the captures (a function, read for each capture, or
  // a boolean): without one the check is not run and every capture is the sky.
  checked = true,
} = {}) {
  if (!store) throw new Error("The capture processing needs a repository.");
  const report = (level, event, message, context) => {
    try {
      log(level, event, message, context);
    } catch {
      // Logging never stops the processing.
    }
  };
  const enqueue = (tenantId, capture, variant = null) =>
    queueCaptureProcessing(
      {
        tenantId,
        captureId:
          variant && !variant.main
            ? `${capture.id}\u0000${variant.id}`
            : capture.id,
      },
      async () => {
        try {
          await processOne({
            store,
            tenantId,
            capture,
            ...(variant ? { variant } : {}),
            ...(settings ? { settings } : {}),
            ...((typeof checked === "function" ? checked() : checked)
              ? {}
              : { check: skyWithoutCheck }),
            log: report,
          });
        } catch (error) {
          report(
            "warning",
            "captures.processing",
            "A capture was not processed.",
            {
              captureId: capture.id,
              message: String(error?.message || error).slice(0, 200),
            },
          );
        }
      },
    );
  const pickUpPending = async ({ tenantId = null, limit = 200 } = {}) => {
    const pending = await store.listPendingChecks({ tenantId, limit });
    let queued = 0;
    for (const item of pending)
      if (enqueue(item.tenantId, item.capture)) queued += 1;
    // The alternative images left without a check, too.
    if (typeof store.listPendingVariantChecks === "function")
      for (const item of await store.listPendingVariantChecks({
        tenantId,
        limit,
      }))
        if (enqueue(item.tenantId, { id: item.captureId }, item.variant))
          queued += 1;
    return queued;
  };
  return {
    enqueue,
    pickUpPending,
    /**
     * Runs the rule in force again on every image (every space, or one):
     * forgets each stored check, then queues them like the captures left
     * without a result (the hourly pick-up takes what the first page
     * leaves). The caller checks `recheckRefusal` first. Answers `{
     * captures, images, queued }`.
     */
    async recheck({ tenantId = null } = {}) {
      const cleared = await store.clearAutomaticChecks({ tenantId });
      const queued = await pickUpPending({ tenantId, limit: 500 });
      return { ...cleared, queued };
    },
  };
}
