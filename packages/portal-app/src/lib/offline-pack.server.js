import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { portalConfig, runtimeDir } from "./config.server.js";
import {
  catalogueFingerprint,
  targetIndexDocument,
  targetIndexMaximumPageSize,
  targetIndexNotation,
  targetKnowledgeBundleDocument,
  targetTextsImported,
} from "./target-library.server.js";
import { yieldToEventLoop } from "./cooperative.server.js";
import { installedSolveCatalogue } from "./solve-catalogue.server.js";
import { installedCameraCatalogue } from "./camera-catalogue.server.js";
import { installedReadAloud } from "./read-aloud.server.js";
import { installedBaseMap } from "./base-map.server.js";
import { installedTargetTexts } from "./target-texts-pack.server.js";
import { skyQualityRasterDirectory } from "portal/planner/sky-quality.server.js";
import {
  skyTileMirror,
  skyTileMirrorEnabled,
} from "portal/sky-tiles/mirror.js";
import {
  defaultSkyBackdropSurveyId,
  dssColourMeanTileBytesByOrder,
  skyBackdropSurveys,
} from "portal/sky-tiles/surveys.js";
import { offlinePackManifestDocument } from "portal/offline-pack/manifest.js";
import {
  targetIndexPackComponent as sharedTargetIndexPackComponent,
  targetKnowledgePackPart,
} from "portal/offline-pack/target-index.js";
import { skyQualityPackComponent as sharedSkyQualityPackComponent } from "portal/offline-pack/sky-quality.js";
import {
  skyBackdropPackComponent as sharedSkyBackdropPackComponent,
  skyBackdropPrepareUrlTemplate,
  skyBackdropTierStates,
} from "portal/offline-pack/sky-backdrop.js";

/*
 * `GET /v1/offline-pack` on a service that may sleep, restart and read its
 * data from a slow network file system. The first manifest after a restart
 * must not hold the process, so:
 *
 * 1. The manifest kept on disk is not keyed on everything it describes (the
 *    tile mirror's live state would change the key whenever a tile is
 *    fetched). Each component is kept under what it is computed from: the
 *    catalogue index under the catalogue's fingerprint
 *    (`catalogueFingerprint`, which loads nothing), the sky-quality raster
 *    under its files' identity; the backdrop is re-described from the
 *    mirror's small index files on every request.
 * 2. Each catalogue page is built in slices (`cooperative.server.js`)
 *    rather than as one synchronous block.
 * 3. One computation runs at a time, in the background, whatever the number
 *    of requests; a request waits for it at most `ASTRO_PORTAL_OFFLINE_PACK_WAIT_MS`
 *    (2 s by default), then gets the last manifest this portal knows — its
 *    backdrop always current, only the component being recomputed as it
 *    last was — or, when there is none at all, a 503 with `Retry-After`.
 */

const skyQualityPackFileName = "raster.bin";
const skyQualityPackManifestName = "manifest.json";

/** Bumped whenever what a component describes for unchanged inputs changes
 * (its shape, how a page is sized), so that a component kept by an older
 * build is never served by a newer one. 2: kept per component. 3: the
 * catalogue index describes the published pages (`knowledge`). 4: the
 * knowledge file also holds the short texts of the bright stars and the
 * constellations. */
const offlinePackPersistedVersion = 4;

/** Component entries kept, in memory and on disk. */
const componentLimit = 8;

const defaultWaitMs = 2000;
const defaultRetryAfterSeconds = 30;

const statistics = {
  refreshes: 0,
  targetIndexPagesBuilt: 0,
  skyQualityComputations: 0,
};

/** What this process had to compute (test seam, and a diagnostic). */
export function offlinePackStatistics() {
  return { ...statistics };
}

/**
 * The `sky-quality` component of `GET /v1/offline-pack`, at the live route's
 * own URLs — a thin wrapper over `packages/portal/src/offline-pack/sky-quality.js`'s
 * `skyQualityPackComponent`, which can also be called with relative URLs
 * for a static pack. Kept exported under this exact name for
 * `portal-app/routes/api/v1/offline-pack/sky-quality/[file]/route.js`'s own
 * `ensureSkyQualityPackRaster` seam.
 */
export async function skyQualityPackComponent() {
  return sharedSkyQualityPackComponent();
}

async function fileIdentity(path) {
  try {
    const info = await stat(path);
    return [info.size, info.mtimeMs];
  } catch {
    return null;
  }
}

async function manifestChecksum(path) {
  try {
    const manifest = JSON.parse(await readFile(path, "utf8"));
    return typeof manifest?.checksum === "string" ? manifest.checksum : null;
  } catch {
    return null;
  }
}

/**
 * What the sky-quality component is computed from: the pack raster's
 * identity and its manifest's checksum (a raster copied in with its
 * modification time preserved must never be described by the previous
 * one's digest), and the installed source raster's checksum (a new source
 * is what makes `ensureSkyQualityPackRaster` derive a new pack). Two small
 * files read, one `stat`: never the multi-megabyte raster itself.
 */
async function skyQualityInputs() {
  const root = skyQualityRasterDirectory();
  const [pack, packChecksum, sourceChecksum] = await Promise.all([
    fileIdentity(join(root, "pack", skyQualityPackFileName)),
    manifestChecksum(join(root, "pack", skyQualityPackManifestName)),
    manifestChecksum(join(root, "manifest.json")),
  ]);
  return { pack, packChecksum, sourceChecksum };
}

/**
 * The cheap state of everything the manifest describes, read on every
 * request: the catalogue's fingerprint, the sky-quality files' identity, the
 * configured locales, and — when the mirror is on — its observed mean tile
 * size per order and each tier's real `{ state, exactBytes? }` (small index
 * files, `mirror.js`'s `tierState`). The catalogue itself is never loaded
 * here.
 */
async function offlinePackProbe() {
  const config = await portalConfig();
  const mirrorEnabled = skyTileMirrorEnabled();
  const [
    catalogue,
    skyQuality,
    skyBackdropState,
    solveCatalogue,
    cameraCatalogue,
    baseMap,
    targetTexts,
    readAloud,
  ] = await Promise.all([
    catalogueFingerprint(),
    skyQualityInputs(),
    mirrorEnabled ? skyBackdropProbe() : null,
    installedSolveCatalogue(),
    installedCameraCatalogue(),
    installedBaseMap(),
    installedTargetTexts(),
    installedReadAloud(),
  ]);
  return {
    locale: config.defaultLocale,
    supportedLocales: config.supportedLocales,
    catalogue,
    skyQuality,
    mirrorEnabled,
    skyBackdropState,
    // The deep star catalogue of the phone's telephoto aiming, when the
    // file is installed (`solve-catalogue.server.js`): described from a
    // `stat` of the file, never recomputed per request.
    solveCatalogue: solveCatalogue?.component || null,
    // The camera star catalogue (Tycho-2, CAM-3), when the file is installed
    // (`camera-catalogue.server.js`): read once, then a `stat`.
    cameraCatalogue: cameraCatalogue?.component || null,
    // The offline background of the light-pollution map (Natural Earth), when the file is installed (`base-map.server.js`).
    baseMap: baseMap?.component || null,
    // The optional catalogue texts (« Textes complets du catalogue »,
    // `target-texts-pack.server.js`): the shards present in the data
    // package's `texts/` folder, none when there is no index or no shard.
    // Described from a few `stat`s while nothing moved, never recomputed with
    // the catalogue.
    targetTexts: targetTexts?.component || null,
    // The optional spoken reading (« Lecture à voix haute »,
    // `read-aloud.server.js`): the languages whose `read-aloud/<voice>/<locale>/
    // manifest.json` is deposited in the static data, none otherwise. A
    // `readdir` and a `stat` a language while nothing moved.
    readAloud: readAloud?.component || null,
  };
}

async function skyBackdropProbe() {
  const survey = skyBackdropSurveys[defaultSkyBackdropSurveyId];
  const observedMeans = skyTileMirror().observedMeanTileBytesByOrder(
    survey.id,
    dssColourMeanTileBytesByOrder,
  );
  const [meanTileBytesByOrder, tierStates] = await Promise.all([
    observedMeans,
    // `{ state, exactBytes?, unavailable? }` per tier — see `mirror.js`'s
    // `tierState`: a tier is `ready` as soon as every archive it needs
    // exists. It is `unavailable` when it is not built and would not fit in
    // the mirror's byte budget — judged by the very tile sizes, and the very
    // rule, that make `POST .../prepare` answer `409`.
    skyBackdropTierStates(survey, { meanTileBytesByOrder: observedMeans }),
  ]);
  return { meanTileBytesByOrder, tierStates };
}

const targetIndexUrlTemplate =
  "/v1/target-index?locale={locale}&sort=designation&limit=1000&offset={offset}";
const targetKnowledgeUrlTemplate = "/v1/offline-pack/target-knowledge/{locale}";

function targetIndexKey(probe) {
  return JSON.stringify([
    "target-index",
    offlinePackPersistedVersion,
    targetIndexNotation,
    targetIndexMaximumPageSize,
    targetIndexUrlTemplate,
    probe.locale,
    probe.catalogue,
  ]);
}

/** Whether the manifest has a sky-quality component to describe: a pack
 * raster on disk, or a source raster to derive one from (which computing
 * the component does, `ensureSkyQualityPackRaster`). */
function wantsSkyQuality(probe) {
  return Boolean(probe.skyQuality.pack || probe.skyQuality.sourceChecksum);
}

function skyQualityKey(probe) {
  return JSON.stringify([
    "sky-quality",
    offlinePackPersistedVersion,
    probe.skyQuality,
  ]);
}

/** Whether a kept entry is a target-index component for [probe]'s locale,
 * whatever the catalogue it described (what a stale manifest may use). */
function sameTargetIndexKind(key, probe) {
  try {
    const [kind, version, notation, pageSize, template, locale] =
      JSON.parse(key);
    return (
      kind === "target-index" &&
      version === offlinePackPersistedVersion &&
      notation === targetIndexNotation &&
      pageSize === targetIndexMaximumPageSize &&
      template === targetIndexUrlTemplate &&
      locale === probe.locale
    );
  } catch {
    return false;
  }
}

function sameSkyQualityKind(key) {
  try {
    const [kind, version] = JSON.parse(key);
    return kind === "sky-quality" && version === offlinePackPersistedVersion;
  } catch {
    return false;
  }
}

// ── Kept components ───────────────────────────────────────────────────────
//
// In memory, most recent first, and in `<runtime>/offline-pack/manifest-cache.json`
// so that a process that starts again — after a wake-up or a restart — finds
// them. A file written by the previous version (`{ entries: [{ json, etag
// }] }`, whole manifests) is still read for one thing: the last manifest to
// serve while the new components are computed.

const persistedManifestPath = () =>
  join(runtimeDir, "offline-pack", "manifest-cache.json");

let store = null;
let storeLoad = null;
let storeWrites = Promise.resolve();
let persistWarned = false;

function emptyStore() {
  return { components: [], legacyDocument: null, lastComputationMs: null };
}

function parsedStore(text) {
  const next = emptyStore();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return next;
  }
  if (parsed?.v === 2 && Array.isArray(parsed.components)) {
    next.components = parsed.components.filter(
      (entry) =>
        typeof entry?.key === "string" &&
        entry.value &&
        typeof entry.value === "object",
    );
    if (Number.isFinite(parsed.lastComputationMs))
      next.lastComputationMs = parsed.lastComputationMs;
    if (
      typeof parsed.legacyDocument?.json === "string" &&
      typeof parsed.legacyDocument?.etag === "string"
    )
      next.legacyDocument = parsed.legacyDocument;
  } else if (Array.isArray(parsed?.entries)) {
    const newest = parsed.entries.find(
      (entry) =>
        typeof entry?.json === "string" && typeof entry?.etag === "string",
    );
    if (newest) next.legacyDocument = { json: newest.json, etag: newest.etag };
  }
  return next;
}

async function readPersistedStore() {
  try {
    return parsedStore(await readFile(persistedManifestPath(), "utf8"));
  } catch {
    return emptyStore();
  }
}

async function loadedStore() {
  if (store) return store;
  if (!storeLoad)
    storeLoad = readPersistedStore().then((loaded) => {
      store = store || loaded;
      return store;
    });
  return storeLoad;
}

function keptComponent(key) {
  return store?.components.find((entry) => entry.key === key)?.value || null;
}

/** The newest kept entry matching [predicate]. */
function newestKept(predicate) {
  return store?.components.find((entry) => predicate(entry.key))?.value || null;
}

/**
 * Writes the store — merged with whatever another process (the previous
 * instance) wrote meanwhile, and replaced atomically; one write
 * at a time. Never fails a request: an unwritable directory is logged once.
 */
function persistStore() {
  storeWrites = storeWrites.then(async () => {
    try {
      const onDisk = await readPersistedStore();
      const known = new Set(store.components.map((entry) => entry.key));
      const components = [
        ...store.components,
        ...onDisk.components.filter((entry) => !known.has(entry.key)),
      ].slice(0, componentLimit);
      const path = persistedManifestPath();
      await mkdir(join(path, ".."), { recursive: true });
      const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
      await writeFile(
        temporary,
        JSON.stringify({
          v: 2,
          components,
          lastComputationMs: store.lastComputationMs,
          legacyDocument: store.legacyDocument || onDisk.legacyDocument,
        }),
        "utf8",
      );
      await rename(temporary, path);
    } catch (error) {
      if (!persistWarned) {
        persistWarned = true;
        console.warn(
          `The offline-pack manifest could not be persisted in ${runtimeDir}: ` +
            `${error?.message}. It is recomputed after every restart instead.`,
        );
      }
    }
  });
  return storeWrites;
}

// ── Computing the components ──────────────────────────────────────────────

/**
 * The compact catalogue index component, at the live route's own URL
 * template — measured against the real pages (`targetIndexPackComponent`,
 * shared with the static pack builder), each built in slices and memoized by
 * `targetIndexDocument` for the phones that download them next. Every page
 * must come from the same catalogue revision: an import landing mid-walk
 * fails this computation, and the next request starts another.
 */
async function computedTargetIndex(probe) {
  const pageOf = (page) =>
    targetIndexDocument({
      locale: probe.locale,
      limit: targetIndexMaximumPageSize,
      offset: page * targetIndexMaximumPageSize,
    });
  const first = JSON.parse((await pageOf(0)).json);
  const component = await sharedTargetIndexPackComponent({
    total: first.total,
    pageSize: targetIndexMaximumPageSize,
    revision: first.revision,
    urlTemplate: targetIndexUrlTemplate,
    pageJson: async (page) => {
      statistics.targetIndexPagesBuilt += 1;
      await yieldToEventLoop();
      const document = await pageOf(page);
      if (page > 0 && JSON.parse(document.json).revision !== first.revision)
        throw new Error("The catalogue changed while its pages were sized.");
      return document.json;
    },
    // The published pages (the long catalogue texts) ride with the index:
    // the file of the default locale is what the manifest measures.
    knowledge: await targetKnowledgePackPart({
      document: await targetKnowledgeBundleDocument(probe.locale),
      urlTemplate: targetKnowledgeUrlTemplate,
    }),
  });
  return { component, revision: first.revision, targets: first.total };
}

async function computedSkyQuality() {
  statistics.skyQualityComputations += 1;
  return { component: await skyQualityPackComponent() };
}

let refresh = null;

/** The computation's lines, in the app's log format on stderr (the server's
 * start is told by `server/start.js`; these say where the minutes go when a
 * computation is slow: the wait for the texts' import, then the pages). */
const packLog = (line) =>
  console.error(`[Astro Portal] info offline-pack: ${line}`);

/**
 * Computes whatever [probe] finds missing, once: concurrent requests share
 * the computation in flight. A component is kept only when the inputs it
 * was computed from did not move meanwhile (probed again afterwards); when
 * they did — an import synchronized by this very computation, say — the
 * next request computes again, from pages already in memory.
 */
function ensureRefresh(probe) {
  if (refresh) return refresh;
  statistics.refreshes += 1;
  const started = Date.now();
  const pending = (async () => {
    // The published pages of tiers A and B come from the stored texts
    // (`target_texts`: tier A left the catalogue seed for the shards). The
    // import runs in the background after a start or a load; describing the
    // pages before it ends would keep a manifest without them until the next
    // change, so the computation waits for it — a request waits its own
    // bounded time, then gets the last manifest or the « preparing » answer
    // — and then looks again at what it describes.
    if (!keptComponent(targetIndexKey(probe))) {
      packLog("computing the manifest; waiting for the stored texts' import.");
      const waitStarted = Date.now();
      await targetTextsImported();
      packLog(
        `the stored texts' import is over (waited ${Date.now() - waitStarted} ms).`,
      );
      probe = await offlinePackProbe();
    }
    const targetKey = targetIndexKey(probe);
    const skyKey = skyQualityKey(probe);
    const computed = {};
    if (!keptComponent(targetKey))
      computed[targetKey] = await computedTargetIndex(probe);
    if (wantsSkyQuality(probe) && !keptComponent(skyKey))
      computed[skyKey] = await computedSkyQuality();
    const after = await offlinePackProbe();
    const stillValid = {
      [targetIndexKey(after)]: true,
      [skyQualityKey(after)]: true,
    };
    const kept = Object.entries(computed).filter(([key]) => stillValid[key]);
    store.lastComputationMs = Date.now() - started;
    packLog(
      `manifest computed in ${store.lastComputationMs} ms (${Object.keys(computed).length} component(s) computed, ${kept.length} kept).`,
    );
    for (const [key, value] of kept)
      store.components = [
        { key, value },
        ...store.components.filter((entry) => entry.key !== key),
      ].slice(0, componentLimit);
    await persistStore();
    return computed;
  })();
  refresh = pending;
  pending.then(
    () => {
      if (refresh === pending) refresh = null;
    },
    (error) => {
      if (refresh === pending) refresh = null;
      console.warn(
        `The offline-pack manifest could not be computed: ${error?.message}`,
      );
    },
  );
  return pending;
}

// ── The manifest ──────────────────────────────────────────────────────────

function skyBackdropPackComponent(probe) {
  if (!probe.mirrorEnabled) return null;
  const survey = skyBackdropSurveys[defaultSkyBackdropSurveyId];
  return sharedSkyBackdropPackComponent(
    {
      survey,
      meanTileBytesByOrder: probe.skyBackdropState.meanTileBytesByOrder,
      tierStates: probe.skyBackdropState.tierStates,
    },
    { prepareUrlTemplate: skyBackdropPrepareUrlTemplate },
  );
}

let lastDocument = null;

/** The manifest from [targetIndex] and [skyQuality] entries, the backdrop
 * described from [probe] itself — `{ json, etag }`, the same object as long
 * as nothing changes. */
function assembledDocument(probe, targetIndex, skyQuality) {
  const components = [targetIndex.component];
  if (skyQuality?.component) components.push(skyQuality.component);
  if (probe.solveCatalogue) components.push(probe.solveCatalogue);
  if (probe.cameraCatalogue) components.push(probe.cameraCatalogue);
  if (probe.baseMap) components.push(probe.baseMap);
  if (probe.targetTexts) components.push(probe.targetTexts);
  if (probe.readAloud) components.push(probe.readAloud);
  const skyBackdrop = skyBackdropPackComponent(probe);
  if (skyBackdrop) components.push(skyBackdrop);
  const { json, etag } = offlinePackManifestDocument({
    catalogue: {
      revision: targetIndex.revision,
      targets: targetIndex.targets,
      locales: probe.supportedLocales,
    },
    components,
  });
  if (lastDocument?.etag === etag) return lastDocument;
  lastDocument = { json, etag };
  return lastDocument;
}

function waitMilliseconds() {
  const configured = Number(process.env.ASTRO_PORTAL_OFFLINE_PACK_WAIT_MS);
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : defaultWaitMs;
}

function waited(promise, milliseconds) {
  if (milliseconds <= 0) return Promise.resolve(false);
  let timer;
  return Promise.race([
    promise.then(
      () => true,
      () => true,
    ),
    new Promise((resolvePromise) => {
      timer = setTimeout(() => resolvePromise(false), milliseconds);
      timer.unref?.();
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Thrown when there is no manifest to answer with yet. */
export class OfflinePackPreparingError extends Error {
  constructor(retryAfterSeconds) {
    super(
      "This portal is preparing its offline pack manifest; ask again after Retry-After.",
    );
    this.code = "offline_pack_preparing";
    this.status = 503;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function retryAfterSeconds() {
  const measured = store?.lastComputationMs;
  const seconds = Number.isFinite(measured)
    ? Math.ceil(measured / 1000)
    : defaultRetryAfterSeconds;
  return Math.max(5, Math.min(120, seconds));
}

/**
 * The manifest: `{ json, etag, fresh }`. `fresh: false` is the last manifest
 * this portal knows, served while the current one is computed in the
 * background. Throws `OfflinePackPreparingError` when there is none at all.
 */
export async function offlinePackDocument() {
  await loadedStore();
  const wait = waitMilliseconds();
  const deadline = Date.now() + wait;
  for (;;) {
    const probe = await offlinePackProbe();
    const targetIndex = keptComponent(targetIndexKey(probe));
    const skyQuality = wantsSkyQuality(probe)
      ? keptComponent(skyQualityKey(probe))
      : { component: null };
    if (targetIndex && skyQuality)
      return {
        ...assembledDocument(probe, targetIndex, skyQuality),
        fresh: true,
      };

    const computation = ensureRefresh(probe);
    const finished = await waited(computation, deadline - Date.now());
    let failure = null;
    if (finished) {
      const computed = await computation.catch((error) => {
        failure = error;
        return null;
      });
      // Kept, or computed for exactly this probe: assembled from it.
      const ownTarget = computed?.[targetIndexKey(probe)] || targetIndex;
      const ownSky = wantsSkyQuality(probe)
        ? computed?.[skyQualityKey(probe)] || skyQuality
        : { component: null };
      if (ownTarget && ownSky)
        return {
          ...assembledDocument(probe, ownTarget, ownSky),
          fresh: true,
        };
      // Computed for inputs that have moved since: once more, while time is
      // left. A failed computation is not retried in a loop.
      if (!failure && Date.now() < deadline) continue;
    }

    // The last manifest this portal knows: its catalogue index and
    // sky-quality raster as last computed, its backdrop as it is now.
    const staleTarget =
      targetIndex || newestKept((key) => sameTargetIndexKind(key, probe));
    const staleSky = wantsSkyQuality(probe)
      ? skyQuality || newestKept(sameSkyQualityKind)
      : { component: null };
    if (staleTarget)
      return {
        ...assembledDocument(probe, staleTarget, staleSky),
        fresh: false,
      };
    if (store.legacyDocument) return { ...store.legacyDocument, fresh: false };
    if (failure) throw failure;
    throw new OfflinePackPreparingError(retryAfterSeconds());
  }
}

/** Resolves once whatever is being computed and written is done (tests). */
export async function offlinePackSettled() {
  await refresh?.catch(() => {});
  await storeWrites;
}
