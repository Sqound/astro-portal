import { CAPABILITY_UNLIMITED } from "astro-contracts/capabilities";
import { OPEN_SOURCE_PROFILE } from "../capabilities/profiles.js";
import { staticProfile } from "../capabilities/provider.js";
import { publishChange } from "../api/change-bus.js";
import { createSessionDebriefService } from "../api/session-debrief.js";
import { galleryLabelOf, listedTarget } from "../api/upload-resources.js";
import { targetLabel } from "./capture-detail.js";
import {
  createCaptureRepository,
  isImageDigest,
} from "../persistence/capture-repository.js";
import { createSkySolutionRepository } from "../persistence/sky-solution-repository.js";
import { layerIsEmpty, parseLayer } from "../journal/session-rework-layer.js";
import { createProjectNightRepository } from "../persistence/project-night-repository.js";
import {
  createJournalRepository,
  knownPlacesOf,
} from "../journal/journal-repository.js";
import { declaredFiguresOfTarget } from "../debrief-declared.js";
import { captureStore } from "../uploads/capture-store.js";
import {
  createFileDeletionRunner,
  recordFileDeletions,
} from "../persistence/capture-file-deletions.js";
import { rasterImageTypeOf } from "../uploads/media-type.js";
import {
  DerivedImageError,
  ensureSharedCopy,
  isShowable,
} from "../uploads/derived-images.js";
import { captureDetail } from "./capture-detail.js";
import {
  DEVICE_OWNER_FIELDS,
  MetadataError,
  applyOwnerChange,
  imageQualityInput,
  metadataColumns,
  metadataFieldView,
  nightLines,
  ownerChangeInput,
  proposalsInput,
  recordProposals,
  recordVariantProcessing,
  recordVariantProposal,
  carryProcessingOfMainImage,
  storedMetadata,
  variantProposalInput,
} from "./capture-metadata.js";
import {
  changedLineIds,
  sameValue,
  withCaptureLock,
} from "./capture-revision.js";
import { syncCaptureLines } from "./capture-lines-sync.js";
import { sessionQualityOf } from "../sessions/night-summary.js";
import { derivedFieldsOf } from "../persistence/session-derived.js";
import { listLivePlaces } from "../persistence/place-repository.js";
import {
  captureMetadata,
  readMetadataInputs,
} from "./capture-metadata-reading.js";
import { resolveWriteAccess } from "../capabilities/provider.js";
import { readCaptureContext } from "./capture-context.js";
import { nightMonthsOf } from "./public-capture-view.js";
import { DEFAULT_CHECK_NOTICE_DAYS, captureState } from "./capture-state.js";
import { captureTagsProblem, storedCaptureTags } from "./capture-tags.js";
import {
  VARIANT_TEXT_LIMITS,
  mainImageRefusal,
  storedVariantText,
  variantDeletionRefusal,
  variantTextProblem,
  variantVisibilityRefusal,
} from "./capture-variants.js";
import { skySolutionResource } from "./sky-solution.js";
import { captureSessionLiveSql } from "../persistence/capture-session-visibility.js";

/**
 * The owner's side of the captures (« Mon espace » → « Captures »;
 * `GET`/`PATCH`/`DELETE /api/v1/manage/captures[/{id}]` and the owner's
 * media route). Every read and write is bounded by the space of the web
 * session: another space's capture is exactly as absent as one that does
 * not exist.
 *
 * The owner writes four things only — `visibility`, `review_requested_at`
 * (« Demander une vérification »), `protection_lifted_at` (« Accepter la
 * vérification ») and the capture's own tags (`capture_tags`: free text, never
 * normalised, shown in the private gallery only, written in any state) — the
 * first three under the rule of `captureState`, checked here on the server
 * whatever the screen showed (and, before « Publique », the shared copy without
 * location is written): « Publique » is refused when the automatic check did
 * not recognise the sky and the team did not approve, when the team refused the
 * capture, while the owner's block on publishing lasts, and when the profile's
 * `capture.public` is false (true when the profile does not name it). Neither a
 * review request nor an accepted verification ever makes a capture public.
 *
 * Framework-free like the other resource services: a route adapter gives
 * the authenticated space and person and turns an `OwnerCaptureError` into
 * the v1 error envelope.
 */
export class OwnerCaptureError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    this.name = "OwnerCaptureError";
    this.code = code;
    this.status = status;
    Object.assign(this, details);
  }
}

/**
 * A refusal of `capture-metadata.js` as the owner's routes answer it —
 * `400 invalid_metadata` with the field and its limit, `404` for a line
 * that does not exist.
 */
const metadataFailure = (error) =>
  error instanceof MetadataError
    ? new OwnerCaptureError(error.code, error.message, error.status, {
        field: error.field,
        limit: error.limit,
      })
    : error;

/** Who writes the metadata — the web session, or a device token. */
const WEB_ONLY = (field) =>
  new OwnerCaptureError(
    "web_session_required",
    `A device does not change ${field}: it is changed from the web.`,
    403,
  );

const notFound = () =>
  new OwnerCaptureError("capture_not_found", "Capture not found.", 404);

/**
 * The block on publishing: `403` `publishing_blocked` with the end of
 * the block, on every request that would make a capture public; never
 * on an upload nor on « Privée ».
 */
const blockedError = (until) =>
  Object.assign(
    new OwnerCaptureError(
      "publishing_blocked",
      "This space cannot make a capture public before the end of its block.",
      403,
    ),
    { publishingBlockedUntil: until ?? null },
  );

/** The raster types a browser draws: the list shows the original of these. */
const PREVIEW_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

const pageSize = (limit) =>
  Math.min(Math.max(Math.trunc(Number(limit)) || 50, 1), 200);

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a lifted protection was lifted by its delay, without an
 * answer, rather than by « Accepter la vérification »: the lifting was
 * never written, or written at the end of the delay.
 */
function lapsed(state, checks, days) {
  if (state.state !== "protection_lifted") return false;
  if (!checks?.protectionLiftedAt) return true;
  const start = Date.parse(checks.protectionNoticeAt ?? checks.automaticAt);
  if (!Number.isFinite(start)) return false;
  return Date.parse(checks.protectionLiftedAt) >= start + days * DAY_MS;
}

/** A finite cap of a numeric capability, or `null` (absent or unlimited). */
const finiteCap = (value) =>
  Number.isSafeInteger(value) && value >= 0 && value < CAPABILITY_UNLIMITED
    ? value
    : null;

export async function createOwnerCaptureService({
  driver,
  dialect = driver?.dialect,
  entitlementProvider = null,
  capabilities = OPEN_SOURCE_PROFILE,
  now = () => new Date().toISOString(),
  noticeDays = DEFAULT_CHECK_NOTICE_DAYS,
  // Where the files are (`uploads/capture-store.js`); the service's
  // store, read at each use, unless one is given.
  captureStore: givenCaptureStore = null,
  // Told, at each listing, of the space whose captures left without a
  // result are to be queued again; never awaited.
  pickUpPending = null,
  // The copy without location a gallery serves, written before a capture
  // becomes public.
  sharedCopy = ensureSharedCopy,
  showable = isShowable,
  // Whether a team checks the captures before and after they are public
  // (the hosted service): a function, read at each use, or a boolean. Without
  // a team (a private server) every capture counts as the sky: nothing is
  // asked of a check, and nothing is refused for it.
  moderated = true,
  // Called in the transaction that deletes a capture, before its rows go:
  // `(transaction, { tenantId, captureId })`. A composition that keeps rows
  // naming a capture deletes them here.
  captureRemoved = null,
  // `(level, event, message, context)`: what happened to the files of a
  // deleted capture that the store did not delete at once.
  log = () => {},
} = {}) {
  if (!driver) throw new Error("The owner's captures need a database.");
  const db = driver;
  const files = () => givenCaptureStore || captureStore();
  // The deletion of the files of a deleted capture or image is a task
  // written with the rows (`persistence/capture-file-deletions.js`): tried
  // at once after the transaction, and again every hour until the store
  // answers. A store that does not answer never undoes a deletion.
  const fileDeletions = createFileDeletionRunner({
    db,
    files,
    log,
    clock: () => new Date(now()),
  });
  const hasThumbnail = async (tenantId, sha256) =>
    Boolean(await files().stat({ tenantId, sha256, file: "thumbnail" }));
  const store = await createCaptureRepository({ driver, dialect });
  // The sky solution of each image, and the owner's switch.
  const skies = await createSkySolutionRepository({ driver });
  // The multi-night plan of a capture's session.
  const projectNights = await createProjectNightRepository({ driver, dialect });
  const provider = entitlementProvider || staticProfile(capabilities);
  const protectionLapsed = (state, checks) => lapsed(state, checks, noticeDays);
  const isModerated = () =>
    (typeof moderated === "function" ? moderated() : moderated) !== false;

  // `inTrash`: also the captures of a session in the trash, which every owner
  // gesture reads as absent; only the erasure of that very session asks for
  // them.
  const row = async (tenantId, captureId, { inTrash = false } = {}) =>
    (
      await db.query(
        `SELECT * FROM captures WHERE id = ? AND tenant_id = ?${
          inTrash ? "" : ` AND ${captureSessionLiveSql()}`
        }`,
        [String(captureId ?? ""), tenantId],
      )
    ).rows[0] || null;

  const person = async (userId) =>
    (userId
      ? (
          await db.query(
            "SELECT warnings_count, publishing_blocked_until, block_count FROM users WHERE id = ?",
            [userId],
          )
        ).rows[0]
      : null) || {};

  const space = async (tenantId) =>
    (
      await db.query(
        "SELECT public_name_refused_at, portal_name_refused_at FROM organizations WHERE id = ?",
        [tenantId],
      )
    ).rows[0] || {};

  /** The capability of making a capture public: true unless named false. */
  const publicAllowed = (caps) => caps["capture.public"] !== false;

  // The debriefed minutes of a night's targets (« Intégration 2 h 20 » on a
  // card, the steps of the add box), read once per night and call.
  let debriefs = null;
  const nightSummary = async (tenantId, sessionId, cache) => {
    if (!sessionId) return null;
    if (cache?.has(sessionId)) return cache.get(sessionId);
    let summary = null;
    try {
      debriefs ??= await createSessionDebriefService({ driver, dialect });
      summary =
        (await debriefs.read({ tenantId, sessionId }))?.debriefSummary ?? null;
    } catch {
      summary = null;
    }
    cache?.set(sessionId, summary);
    return summary;
  };
  // The Journal's reading of the night's targets (the rework, the frames'
  // figures and the analysis included): the integration of a capture is the
  // one the Journal and the night's page show, never the hours of the night.
  let journal = null;
  const nightTargets = async (tenantId, sessionId, cache) => {
    if (!sessionId) return [];
    const key = `targets:${sessionId}`;
    if (cache?.has(key)) return cache.get(key);
    let targets = [];
    try {
      // Only a night a rework gave its figures to differs from the debriefing's
      // summary: the others are not read through the Journal at all.
      const session = (
        await db.query(
          "SELECT rework_json FROM observation_sessions WHERE id = ? AND tenant_id = ?",
          [sessionId, tenantId],
        )
      ).rows[0];
      if (session && !layerIsEmpty(parseLayer(session.rework_json))) {
        journal ??= await createJournalRepository({ driver, dialect });
        targets =
          (await journal.sessionTargets({ tenantId, sessionId }))?.targets ??
          [];
      }
    } catch {
      targets = [];
    }
    cache?.set(key, targets);
    return targets;
  };
  const acquiredMinutes = (summary, targetId, targets = []) => {
    const own = targets.find(
      (candidate) =>
        candidate.targetId === targetId && candidate.state !== "removed",
    );
    if (Number.isFinite(own?.acquiredSeconds) && own.acquiredSeconds > 0)
      return Math.max(1, Math.round(own.acquiredSeconds / 60));
    const entry = summary?.perTarget?.find(
      (candidate) => candidate.targetId === targetId,
    );
    return Number.isFinite(entry?.acquiredMinutes) && entry.acquiredMinutes > 0
      ? entry.acquiredMinutes
      : null;
  };

  /**
   * `captureState` of a capture and its owner; a capture without an image
   * has no check to wait for and nothing to show: `no_image`, never
   * public.
   */
  function stateOf(plain, user) {
    const state = captureState({
      visibility: plain.visibility,
      checks: plain.checks,
      publishingBlockedUntil: user.publishing_blocked_until ?? null,
      now: now(),
      noticeDays,
      moderated: isModerated(),
    });
    if (isImageDigest(plain.sha256)) return state;
    return {
      ...state,
      state: "no_image",
      publishAllowed: false,
      publishRefusal: "no_image",
      teamLine: null,
    };
  }

  /**
   * The night's quality of the capture's session, the medians of Astro
   * Sync's analysis (`sessionQualityOf`, the Journal's own function) with
   * the session and the frames they were measured on; `null` for a capture
   * without a session and a session not analysed. Two queries (the
   * analysis, the session): read on the capture's own resource, never for
   * each item of a list.
   */
  async function sessionQualityOfCapture(tenantId, capture, plan) {
    if (!capture.session_id) return null;
    const analysis = (
      await db.query(
        "SELECT report_json FROM session_analyses WHERE tenant_id = ? AND session_id = ?",
        [tenantId, capture.session_id],
      )
    ).rows[0];
    if (!analysis) return null;
    let report = null;
    try {
      report = JSON.parse(analysis.report_json);
    } catch {
      report = null;
    }
    const quality = report ? sessionQualityOf(report, []) : null;
    if (!quality) return null;
    const held = (
      await db.query(
        "SELECT started_at, place_json FROM observation_sessions WHERE id = ? AND tenant_id = ?",
        [capture.session_id, tenantId],
      )
    ).rows[0];
    return {
      sessionId: capture.session_id,
      eveningDate: held ? derivedFieldsOf(held, plan).eveningDate : null,
      frameCount: quality.measuredFrames,
      skyBackground: quality.skyBackground,
      fwhm: quality.fwhm,
      eccentricity: quality.eccentricity,
    };
  }

  async function resource(
    tenantId,
    capture,
    { locale, user, nights = null, withSessionQuality = true },
  ) {
    const {
      targetIds,
      targets,
      session,
      plan,
      equipment,
      telescope,
      nightDates,
    } = await readCaptureContext(db, tenantId, capture);
    // What a card of the list draws without a second call — the generic
    // label, the instrument, the targets with their aliases or their
    // personal label, the debriefed integration.
    const entries = await store.targetEntries(tenantId, targetIds);
    const listed = targetIds.map((id) => listedTarget(id, entries.get(id)));
    const summary = await nightSummary(tenantId, capture.session_id, nights);
    const journalTargets = await nightTargets(
      tenantId,
      capture.session_id,
      nights,
    );
    // A capture without an image has no file to read.
    const withImage = isImageDigest(capture.sha256);
    let previewType = null;
    try {
      const head = withImage
        ? await files().head({
            tenantId,
            sha256: capture.sha256,
            file: "original",
          })
        : null;
      const type = head ? rasterImageTypeOf(head) : null;
      previewType = PREVIEW_TYPES.has(type) ? type : null;
    } catch {
      previewType = null;
    }
    const thumbnail = withImage
      ? await hasThumbnail(tenantId, capture.sha256).catch(() => false)
      : false;
    const plain = (await store.getCaptureById(tenantId, capture.id)) || null;
    const solutions = await skies.forCapture(tenantId, capture.id);
    const variants = [];
    for (const variant of await store.listVariants(tenantId, capture.id))
      variants.push({
        ...variant,
        thumbnail: await hasThumbnail(tenantId, variant.sha256).catch(
          () => false,
        ),
        // Whether this image has its sky solution.
        skySolved: solutions.has(variant.id),
      });
    // The milestones of the night, the history of the capture, from
    // the first to the last.
    const progression = [];
    for (const image of await store.listProgression(tenantId, capture.id))
      progression.push({
        id: image.id,
        sha256: image.sha256,
        byteSize: image.byteSize,
        originalName: image.originalName,
        frameCount: image.frameCount,
        createdAt: image.createdAt,
        thumbnail: await hasThumbnail(tenantId, image.sha256).catch(
          () => false,
        ),
      });
    const mainImage = variants.find((variant) => variant.main);
    const mainSolution = mainImage ? solutions.get(mainImage.id) : null;
    const state = stateOf(plain, user);
    return {
      ...plain,
      // When the capture became « Finalisée »; `null`
      // for a draft, or a capture finalized before the date was kept.
      finalizedAt: capture.finalized_at ?? null,
      targetIds,
      galleryLabel: galleryLabelOf(listed),
      telescope,
      targets: listed,
      integrationMinutes: targetIds.length
        ? acquiredMinutes(summary, targetIds[0], journalTargets)
        : null,
      // `false` while the capture has no image (its definition alone).
      hasImage: withImage,
      state,
      protectionLapsed: protectionLapsed(state, plain.checks),
      preview: Boolean(previewType),
      thumbnail,
      showable: withImage
        ? await showable(tenantId, capture.sha256, {
            captureStore: files(),
            originalName: capture.original_name,
          })
        : false,
      detail: {
        ...captureDetail(
          {
            capture,
            plan,
            session,
            targets,
            equipment,
            locale,
            knownPlaces: await knownPlacesOf(db, tenantId),
          },
          { audience: "owner" },
        ),
        // The months of the nights the image of a multi-night plan combines
        // (`nightMonth`, and `nightMonthEnd` when they span several), absent
        // for a capture of one night.
        ...(nightMonthsOf(nightDates) ?? {}),
        // Set only when the capture's session belongs to a multi-night plan
        // that is not finished.
        intermediate: capture.session_id
          ? await projectNights.intermediateOf(
              tenantId,
              capture.session_id,
              targetIds,
            )
          : null,
        // The night's quality, beside the image's own (`quality`);
        // not computed for the items of a list.
        ...(withSessionQuality
          ? {
              sessionQuality: await sessionQualityOfCapture(
                tenantId,
                capture,
                plan,
              ),
            }
          : {}),
      },
      // The quality of the main image itself, measured by Astro Sync on
      // the stacked master (the same as `variants[].quality` of the main
      // one); `null` when none was measured.
      quality: mainImage?.quality ?? null,
      // Every value read
      // through plan → night → capture with its origin, and the computed
      // ones (sky quality, Moon); the place is the night's, the owner's.
      metadata: captureMetadata(
        await readMetadataInputs(db, tenantId, capture, targetIds),
        { audience: "owner" },
      ),
      // The images of
      // the capture, its main one first, then the others, newest first.
      variants,
      // « Progression de la nuit », never among the variants.
      progression,
      // The owner's two switches « Afficher la qualité en privé » and
      // « Afficher la qualité en public » (on for a new capture) — whether
      // the quality of the images (`quality`, `variants[].quality`) and of
      // the nights is shown in the galleries.
      qualityShown: {
        private: Number(capture.quality_private ?? 1) === 1,
        public: Number(capture.quality_public ?? 0) === 1,
      },
      // The sky solution of the main image,
      // with the owner's switch « Afficher le plate solving », as soon as
      // one exists (absent otherwise).
      ...(mainSolution
        ? {
            skySolution: skySolutionResource(mainSolution, {
              annotationsEnabled: Number(capture.sky_annotations ?? 1) === 1,
            }),
          }
        : {}),
    };
  }

  /**
   * Every write of the metadata is refused in the read-only window
   * (`403 entitlement_read_only`); a static profile (a
   * private server) never enters it.
   */
  async function refuseReadOnly(userId) {
    const access = await resolveWriteAccess(provider, userId ?? null);
    if (access?.readOnly)
      throw new OwnerCaptureError(
        "entitlement_read_only",
        "This account's subscription has ended: the captures stay readable; nothing is changed.",
        403,
      );
  }

  /**
   * The read-only window of the list's page: `readOnly`, and when it ends
   * and whether a payment failed, for the screen's « Lecture seule jusqu'au
   * … » and its true reason.
   */
  async function readOnlyStateOf(userId) {
    const access = await resolveWriteAccess(provider, userId ?? null);
    if (!access?.readOnly) return { readOnly: false };
    return {
      readOnly: true,
      ...(access.readOnlyUntil ? { readOnlyUntil: access.readOnlyUntil } : {}),
      ...(access.paymentFailed ? { paymentFailed: true } : {}),
    };
  }

  /** A producer's proposals for a capture, written (`capture-metadata.js`). */
  const writeProposals = (tenantId, capture, input, userId = null) =>
    recordProposals({ store, tenantId, capture, input, at: now(), userId });
  const writeVariantProposal = (tenantId, captureId, imageId, texts, source) =>
    recordVariantProposal({
      store,
      tenantId,
      captureId,
      imageId,
      texts,
      source,
    });

  /** The capture of the space, or 404. */
  const ownCapture = async (tenantId, captureId) => {
    const capture = await row(tenantId, captureId);
    if (!capture) throw notFound();
    return capture;
  };

  /** One image of a capture of the space, or 404 `image_not_found`. */
  const ownImage = async (tenantId, captureId, imageId) => {
    const image = await store.getVariant(tenantId, captureId, imageId);
    if (!image)
      throw new OwnerCaptureError("image_not_found", "Image not found.", 404);
    return image;
  };

  /** Throws the refusal a rule of `capture-variants.js` answered, if any. */
  const refuseWith = (found) => {
    if (found)
      throw new OwnerCaptureError(found.code, found.message, found.status);
  };

  /**
   * The copy without location a gallery serves, written before an image
   * is shown publicly (as for « Publique »).
   */
  async function writeSharedCopy(tenantId, sha256, originalName) {
    try {
      await sharedCopy({
        tenantId,
        sha256,
        originalName,
        captureStore: files(),
      });
    } catch (error) {
      if (error instanceof DerivedImageError && error.code === "not_showable")
        throw new OwnerCaptureError(
          "not_showable",
          "Only an image can be shown in a gallery.",
          409,
        );
      throw new OwnerCaptureError(
        "shared_copy_failed",
        "The copy of this capture could not be written; it stays private.",
        503,
      );
    }
  }

  async function storageOf(tenantId, userId) {
    const caps = await provider.capabilitiesFor(userId ?? null);
    const counted = (
      await db.query(
        "SELECT COUNT(*) AS count FROM captures WHERE tenant_id = ? AND archived_at IS NULL",
        [tenantId],
      )
    ).rows[0];
    const limit = finiteCap(caps["capture.count_limit"]);
    return {
      caps,
      storage: {
        usedBytes: await store.usedBytes(tenantId),
        quotaBytes: Number(caps["storage.quota_bytes"]) || 0,
        maxFileBytes: Number(caps["storage.max_file_bytes"]) || 0,
        captureCount: Number(counted?.count) || 0,
        ...(limit === null ? {} : { captureCountLimit: limit }),
        // The service administrator's exempted space says « Inclus »
        // instead of a quota line (asked of the provider when it knows it).
        ...((await provider.exemptedFor?.(userId ?? null)) === true
          ? { included: true }
          : {}),
        // The variants a capture may hold besides its main image; absent
        // when unlimited.
        ...(finiteCap(caps["capture.variant_limit"]) === null
          ? {}
          : { variantLimit: finiteCap(caps["capture.variant_limit"]) }),
      },
    };
  }

  /**
   * The places of the space with their position (« Lieu enregistré le plus
   * proche de la photo »), once each by name. The space's saved places come
   * first (the default one marked `default`, « lieu courant » of a photo
   * without a position), then the places the space's plans name.
   */
  async function placesOf(tenantId) {
    const places = new Map();
    let defaultId = null;
    try {
      defaultId =
        (
          await db.query(
            "SELECT default_place_id FROM place_preferences WHERE tenant_id = ?",
            [tenantId],
          )
        ).rows[0]?.default_place_id ?? null;
    } catch {
      defaultId = null;
    }
    let saved = [];
    try {
      saved = await listLivePlaces(db, tenantId);
    } catch {
      saved = [];
    }
    for (const place of saved) {
      const name = typeof place.name === "string" ? place.name.trim() : "";
      if (!name || places.has(name)) continue;
      places.set(name, {
        name,
        latitude: place.latitude,
        longitude: place.longitude,
        ...(place.id === defaultId ? { default: true } : {}),
      });
    }
    for (const row of (
      await db.query(
        "SELECT location_json FROM plans WHERE tenant_id = ? ORDER BY plan_date DESC",
        [tenantId],
      )
    ).rows) {
      let place = null;
      try {
        place = JSON.parse(row.location_json || "null");
      } catch {
        place = null;
      }
      const name = typeof place?.name === "string" ? place.name.trim() : "";
      const latitude = Number(place?.latitude);
      const longitude = Number(place?.longitude);
      if (
        !name ||
        places.has(name) ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      )
        continue;
      places.set(name, { name, latitude, longitude });
    }
    return [...places.values()].slice(0, 50);
  }

  /**
   * The space's finished nights the add box offers, newest first — the
   * night's date, its place, and the targets observed (done or partial)
   * with their debriefed integration and the captures already added for
   * them.
   */
  async function nightsOf(tenantId, { locale, cache }) {
    const sessions = (
      await db.query(
        `SELECT * FROM observation_sessions
         WHERE tenant_id = ? AND status = 'finished' AND deleted_at IS NULL
         ORDER BY started_at DESC, id DESC LIMIT 24`,
        [tenantId],
      )
    ).rows;
    const nights = [];
    for (const night of sessions) {
      const summary = await nightSummary(tenantId, night.id, cache);
      const journalTargets = await nightTargets(tenantId, night.id, cache);
      const observed = (summary?.perTarget ?? []).filter((entry) =>
        ["done", "partial"].includes(entry.outcome),
      );
      // A night without an observed target is still a session a capture may
      // join (a night built from a capture has none yet, a plan not
      // debriefed neither): it is offered with no target.
      const context = await readCaptureContext(db, tenantId, {
        id: "",
        session_id: night.id,
        plan_id: night.plan_id,
      });
      const ids = observed.map((entry) => entry.targetId);
      const entries = await store.targetEntries(tenantId, ids);
      const counts = new Map();
      for (const row of (
        await db.query(
          `SELECT t.target_id, COUNT(*) AS count FROM captures c
           JOIN capture_targets t ON t.capture_id = c.id
           WHERE c.tenant_id = ? AND c.session_id = ?
           GROUP BY t.target_id`,
          [tenantId, night.id],
        )
      ).rows)
        counts.set(row.target_id, Number(row.count) || 0);
      // The night's own place (a night built from a capture holds it), else
      // its plan's.
      let place = null;
      for (const source of [night.place_json, context.plan?.location_json])
        try {
          const name = JSON.parse(source || "null")?.name;
          if (typeof name === "string" && name.trim()) {
            place = name;
            break;
          }
        } catch {
          // An unreadable place reads as none.
        }
      nights.push({
        sessionId: night.id,
        planId: night.plan_id ?? null,
        night:
          derivedFieldsOf(night, context.plan ?? null).eveningDate ||
          (night.started_at || "").slice(0, 10) ||
          null,
        place: typeof place === "string" && place.trim() ? place.trim() : null,
        targets: observed.map((entry) => {
          const row = entries.get(entry.targetId);
          const label = row
            ? row.library_source === "personal"
              ? { id: entry.targetId, designation: row.designation, name: null }
              : targetLabel(row, locale)
            : { id: entry.targetId, designation: entry.targetId, name: null };
          return {
            ...label,
            outcome: entry.outcome,
            integrationMinutes: acquiredMinutes(
              summary,
              entry.targetId,
              journalTargets,
            ),
            captureCount: counts.get(entry.targetId) ?? 0,
          };
        }),
      });
    }
    return nights;
  }

  // ---- A capture written by two hands. Every write of the owner goes
  // through `mutate`: in one step (the capture's lock) it reads the capture,
  // decides what the write changes, judges the conflict of the field it
  // writes against the revision the client read, moves the revision once and
  // applies the write. A write that changes nothing moves nothing.

  /** The owner's resource of a capture, as every answer of a write gives it. */
  async function reload(tenantId, captureId, { locale, userId }) {
    return await resource(tenantId, await ownCapture(tenantId, captureId), {
      locale,
      user: await person(userId),
    });
  }

  /**
   * `ifMatch` must be a revision the capture had (`400 invalid_if_match`
   * otherwise); then `409 capture_conflict` if the claimed field changed
   * after it. `claim`: `{ field }`, or for `acquisition` `{ field, line }`
   * (that line), or `{ field, anyLine: true }` (any line); `imageTexts` is
   * judged by image the way `acquisition` is by line (`{ field, line:
   * <imageId> }`).
   */
  async function judge(row, claim, { ifMatch, tenantId, userId, locale }) {
    if (ifMatch === null || ifMatch === undefined) return;
    if (ifMatch > (Number(row.revision ?? 1) || 1))
      throw new OwnerCaptureError(
        "invalid_if_match",
        "If-Match names a revision the capture never had.",
        400,
      );
    if (!claim) return;
    const changed = (
      await store.fieldRevisions(tenantId, row.id, claim.field)
    ).filter(
      (entry) =>
        entry.revision > ifMatch &&
        (!["acquisition", "imageTexts"].includes(claim.field) ||
          claim.anyLine === true ||
          claim.line === undefined ||
          entry.line === "" ||
          entry.line === claim.line),
    );
    if (!changed.length) return;
    throw new OwnerCaptureError(
      "capture_conflict",
      claim.field === "acquisition"
        ? "A line of the capture changed after the revision this write read."
        : claim.field === "imageTexts"
          ? "The title or the description of this image changed after the revision this write read."
          : `The ${claim.field} of the capture changed after the revision this write read.`,
      409,
      {
        conflictField: claim.field,
        conflictLine: claim.line,
        capture: await reload(tenantId, row.id, { locale, userId }),
      },
    );
  }

  /**
   * One write of the owner. `decide(row)` checks the request against the
   * capture and answers `null` (it would change nothing) or `{ claim?,
   * fields, apply, after? }`: the field it writes (for the conflict), the
   * fields and lines it changes (for the next conflicts), what to write, and
   * what to do once the capture is free again.
   */
  async function mutate({
    tenantId,
    userId = null,
    captureId,
    ifMatch = null,
    by = "web",
    locale,
    decide,
    originClientInstanceId = null,
  }) {
    let after = null;
    const answer = await withCaptureLock(String(captureId ?? ""), async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const row = await ownCapture(tenantId, captureId);
        const plan = await decide(row);
        await judge(row, plan?.claim ?? null, {
          ifMatch,
          tenantId,
          userId,
          locale,
        });
        if (!plan) return await reload(tenantId, row.id, { locale, userId });
        // The revision moves first, as a compare-and-swap: if another
        // process wrote since the row was read, nothing is applied and the
        // write is judged again against the capture as it now stands.
        const revision = await store.touchCapture(tenantId, row.id, {
          fields: plan.fields ?? [],
          expected: Number(row.revision ?? 1) || 1,
          by,
          userId,
          at: now(),
          originClientInstanceId,
        });
        if (revision === null) continue;
        await plan.apply();
        after = plan.after ?? null;
        return await reload(tenantId, row.id, { locale, userId });
      }
      throw new OwnerCaptureError(
        "capture_storage_unavailable",
        "The capture is being written; try again.",
        503,
      );
    });
    if (after) await after();
    return answer;
  }

  /**
   * The lines of the capture, filled without a touch (it joined a session,
   * or its session was debriefed or reworked): never throws.
   */
  async function prefillLines(tenantId, captureId) {
    try {
      await syncCaptureLines({
        store,
        db,
        dialect,
        tenantId,
        captureId,
        by: "system",
        now,
      });
    } catch {
      // « Synchroniser avec la session » asks again.
    }
  }

  return {
    async close() {
      await store.close?.();
    },

    /**
     * The space's captures, newest first (`before` is the `{ createdAt, id }`
     * of the last item of the previous page), with what the tab needs
     * around them: the storage and its usage, the person's warnings and
     * block, the names of the space refused by the team.
     */
    async list({ tenantId, userId = null, locale = "en", before, limit }) {
      if (typeof pickUpPending === "function")
        void Promise.resolve()
          .then(() => pickUpPending(tenantId))
          .catch(() => {});
      const bounded = pageSize(limit);
      // The captures of a session in the trash are masked.
      const conditions = ["tenant_id = ?", captureSessionLiveSql()];
      const params = [tenantId];
      if (before?.createdAt) {
        conditions.push("(created_at < ? OR (created_at = ? AND id < ?))");
        params.push(before.createdAt, before.createdAt, before.id ?? "");
      }
      params.push(bounded + 1);
      const rows = (
        await db.query(
          `SELECT * FROM captures WHERE ${conditions.join(" AND ")}
           ORDER BY created_at DESC, id DESC LIMIT ?`,
          params,
        )
      ).rows;
      const hasMore = rows.length > bounded;
      const user = await person(userId);
      const nights = new Map();
      const captures = [];
      for (const capture of hasMore ? rows.slice(0, bounded) : rows)
        captures.push(
          await resource(tenantId, capture, {
            locale,
            user,
            nights,
            withSessionQuality: false,
          }),
        );
      const last = captures.at(-1);
      const { caps, storage } = await storageOf(tenantId, userId);
      const names = await space(tenantId);
      return {
        captures,
        hasMore,
        nextBefore:
          hasMore && last ? { createdAt: last.createdAt, id: last.id } : null,
        storage,
        publishing: {
          available: publicAllowed(caps),
          // Said only by a server with no team: the answer of a service with
          // one is what it always was.
          ...(isModerated() ? {} : { moderated: false }),
          warningsCount: Number(user.warnings_count) || 0,
          blockedUntil:
            user.publishing_blocked_until &&
            Date.parse(user.publishing_blocked_until) > Date.parse(now())
              ? user.publishing_blocked_until
              : null,
        },
        names: {
          publicNameRefusedAt: names.public_name_refused_at ?? null,
          portalNameRefusedAt: names.portal_name_refused_at ?? null,
        },
        // The read-only window — no pencil, no
        // button of writing.
        ...(await readOnlyStateOf(userId)),
        // The nights and the saved places the add box offers (first page
        // only).
        ...(before?.createdAt
          ? {}
          : {
              nights: await nightsOf(tenantId, { locale, cache: nights }),
              places: await placesOf(tenantId),
            }),
      };
    },

    /** One capture of the space, as the list gives it; 404 otherwise. */
    async get({ tenantId, userId = null, captureId, locale = "en" }) {
      const capture = await row(tenantId, captureId);
      if (!capture) throw notFound();
      return await resource(tenantId, capture, {
        locale,
        user: await person(userId),
      });
    },

    /**
     * `visibility` (`private` · `public`), `requestReview: true`,
     * `acceptVerification: true`, `tags` (the whole list of the capture's
     * own tags, replacing the former one: 40 characters at most each, 20
     * tags at most), `stage`, `skyAnnotations`, `qualityPrivate`,
     * `qualityPublic` (booleans), `metadata`: one of them per call. Answers the capture as the list gives it, or refuses with one code per
     * reason.
     *
     * `ifMatch` is the revision the client read (`null`: the write is
     * applied). The write is refused with `409 capture_conflict` only if
     * the field it writes changed after that revision; a write that leaves
     * the stored value as it was changes nothing, does not move the
     * revision and never conflicts. `by`: `web` (every change) or `device`
     * (the owner's phone: the tags, the stage and the metadata; the rest is
     * the web's).
     */
    async update({
      tenantId,
      userId = null,
      captureId,
      changes,
      locale,
      by = "web",
      ifMatch = null,
      originClientInstanceId = null,
    }) {
      const body = changes && typeof changes === "object" ? changes : {};
      const keys = [
        "visibility",
        "requestReview",
        "acceptVerification",
        "tags",
        "stage",
        "skyAnnotations",
        "qualityPrivate",
        "qualityPublic",
        "metadata",
      ].filter((key) => body[key] !== undefined);
      if (keys.length !== 1)
        throw new OwnerCaptureError(
          "invalid_request",
          "Send exactly one of visibility, requestReview, acceptVerification, tags, stage, skyAnnotations, qualityPrivate, qualityPublic, metadata.",
        );
      const [key] = keys;
      if (
        by === "device" &&
        key !== "tags" &&
        key !== "stage" &&
        key !== "qualityPrivate" &&
        key !== "qualityPublic" &&
        key !== "metadata"
      )
        throw key === "visibility"
          ? new OwnerCaptureError(
              "visibility_web_only",
              "A device does not change the visibility of a capture: it is changed from the web.",
              403,
            )
          : WEB_ONLY(key);
      // One field of the capture's metadata, by the owner's hand.
      if (key === "metadata")
        return await this.updateMetadata({
          tenantId,
          userId,
          captureId,
          metadata: body.metadata,
          by,
          locale,
          ifMatch,
          originClientInstanceId,
        });
      const common = {
        tenantId,
        userId,
        captureId,
        ifMatch,
        by,
        locale,
        originClientInstanceId,
      };
      // « Afficher le plate solving », the owner's switch of the sky
      // annotations in the gallery; it changes no state and exists only
      // while an image of the capture has a solution (greyed otherwise).
      if (key === "skyAnnotations")
        return await mutate({
          ...common,
          decide: async (capture) => {
            if (typeof body.skyAnnotations !== "boolean")
              throw new OwnerCaptureError(
                "invalid_request",
                "skyAnnotations is a boolean.",
              );
            if (!(await skies.forCapture(tenantId, capture.id)).size)
              throw new OwnerCaptureError(
                "sky_solution_not_found",
                "No image of this capture has a sky solution yet.",
                409,
              );
            if (
              (Number(capture.sky_annotations ?? 1) === 1) ===
              body.skyAnnotations
            )
              return null;
            return {
              fields: [],
              apply: () =>
                skies.setAnnotationsEnabled(
                  tenantId,
                  capture.id,
                  body.skyAnnotations,
                ),
            };
          },
        });
      // « Afficher la qualité en privé » / « … en public », the owner's
      // switches of the quality of the images in each gallery. They change
      // no state, exist whether or not a quality was measured (the choice
      // is made before Astro Sync sends one) and are written by the phone
      // as well as by the web.
      if (key === "qualityPrivate" || key === "qualityPublic") {
        await refuseReadOnly(userId);
        const audience = key === "qualityPublic" ? "public" : "private";
        const column = `quality_${audience}`;
        return await mutate({
          ...common,
          decide: async (capture) => {
            if (typeof body[key] !== "boolean")
              throw new OwnerCaptureError(
                "invalid_request",
                `${key} is a boolean.`,
              );
            const held =
              Number(capture[column] ?? (audience === "private" ? 1 : 0)) === 1;
            if (held === body[key]) return null;
            return {
              fields: [],
              apply: () =>
                store.setQualityShown(
                  tenantId,
                  capture.id,
                  audience,
                  body[key],
                ),
            };
          },
        });
      }
      // « Brouillon » / « Finalisée », distinct from the visibility. A
      // public capture is finalized: it does not go back to a draft.
      if (key === "stage") {
        await refuseReadOnly(userId);
        return await mutate({
          ...common,
          decide: async (capture) => {
            if (!["draft", "finalized"].includes(body.stage))
              throw new OwnerCaptureError(
                "invalid_request",
                "stage is draft or finalized.",
              );
            if (body.stage === "draft" && capture.visibility === "public")
              throw new OwnerCaptureError(
                "capture_public",
                "A public capture does not go back to a draft; make it private first.",
                409,
              );
            if (body.stage === capture.stage) return null;
            return {
              claim: { field: "stage" },
              fields: [{ field: "stage" }],
              apply: () =>
                store.setStage(tenantId, capture.id, body.stage, now()),
            };
          },
        });
      }
      // The tags are the owner's, private, and change no state: written in
      // any state of the capture, a block on publishing included.
      if (key === "tags") {
        await refuseReadOnly(userId);
        return await mutate({
          ...common,
          decide: async (capture) => {
            const problem = captureTagsProblem(body.tags);
            if (problem)
              throw new OwnerCaptureError(
                "invalid_request",
                problem === "not_a_list"
                  ? "tags is a list of strings."
                  : "A tag holds 40 characters at most, and a capture 20 tags at most.",
              );
            const wanted = storedCaptureTags(body.tags);
            const held = await store.getCaptureTags(tenantId, capture.id);
            if (sameValue(wanted, held)) return null;
            return {
              claim: { field: "tags" },
              fields: [{ field: "tags" }],
              apply: () =>
                store.replaceCaptureTags(tenantId, capture.id, body.tags),
            };
          },
        });
      }
      const user = await person(userId);
      return await mutate({
        ...common,
        decide: async (capture) => {
          const plain = await store.getCaptureById(tenantId, capture.id);
          const state = stateOf(plain, user);
          if (key === "visibility") {
            if (!["private", "public"].includes(body.visibility))
              throw new OwnerCaptureError(
                "invalid_request",
                "visibility is private or public.",
              );
            if (body.visibility === "public" && plain.visibility !== "public") {
              // A capture without an image is never public.
              if (!isImageDigest(plain.sha256))
                throw new OwnerCaptureError(
                  "no_image",
                  "A capture without an image cannot be made public: add an image first.",
                  409,
                );
              // « Rendre publique » is refused on a draft.
              if (capture.stage !== "finalized")
                throw new OwnerCaptureError(
                  "capture_draft",
                  "A draft is never public: finalize it first.",
                  409,
                );
              const caps = await provider.capabilitiesFor(userId ?? null);
              if (!publicAllowed(caps))
                throw new OwnerCaptureError(
                  "capture_public_unavailable",
                  "This space cannot make a capture public.",
                  403,
                );
              if (state.publishRefusal === "publishing_blocked")
                throw blockedError(state.publishingBlockedUntil);
              if (!state.publishAllowed)
                throw new OwnerCaptureError(
                  state.publishRefusal,
                  "This capture cannot be made public now.",
                  409,
                );
              // The copy the galleries serve — no EXIF, XMP or IPTC, so no
              // position — is written before the capture becomes public; if
              // it cannot be, the capture stays private.
              try {
                await sharedCopy({
                  captureStore: files(),
                  tenantId,
                  sha256: capture.sha256,
                  originalName: capture.original_name,
                });
              } catch (error) {
                if (
                  error instanceof DerivedImageError &&
                  error.code === "not_showable"
                )
                  throw new OwnerCaptureError(
                    "not_showable",
                    "Only an image can be shown in a gallery.",
                    409,
                  );
                throw new OwnerCaptureError(
                  "shared_copy_failed",
                  "The copy of this capture could not be written; it stays private.",
                  503,
                );
              }
            }
            if (body.visibility === plain.visibility) return null;
            return {
              claim: { field: "visibility" },
              fields: [{ field: "visibility" }],
              apply: () =>
                store.setVisibility(tenantId, capture.id, body.visibility),
            };
          }
          if (key === "requestReview") {
            if (body.requestReview !== true)
              throw new OwnerCaptureError(
                "invalid_request",
                "requestReview is true.",
              );
            // A review request would make the capture public once
            // validated: refused like « Publique » while the block
            // lasts.
            if (state.state === "publishing_blocked")
              throw blockedError(state.publishingBlockedUntil);
            if (state.state !== "undetermined" || !isModerated())
              throw new OwnerCaptureError(
                "review_not_applicable",
                "Only a capture whose check is undetermined asks for a review.",
                409,
              );
            return {
              fields: [],
              apply: () => store.requestReview(tenantId, capture.id, now()),
            };
          }
          if (body.acceptVerification !== true)
            throw new OwnerCaptureError(
              "invalid_request",
              "acceptVerification is true.",
            );
          if (state.state !== "protection_notice")
            throw new OwnerCaptureError(
              "verification_not_applicable",
              "Only a private capture that did not pass the check accepts a verification.",
              409,
            );
          return {
            fields: [],
            apply: () => store.liftProtection(tenantId, capture.id, now()),
          };
        },
      });
    },

    /**
     * `POST /api/v1/manage/captures`: a capture without an image — its
     * definition, a private draft, from the web session only: the night (an
     * existing night of the space) and the targets it shows, both optional.
     * Counts as a capture of the space (`capture.count_limit`,
     * `409 capture_limit_reached`); the images come later (Astro Sync, or
     * « Ajouter une image » on its detail). Answers the capture as `GET`
     * gives it.
     */
    async create({
      tenantId,
      userId = null,
      sessionId = null,
      targetIds = [],
      locale,
    }) {
      await refuseReadOnly(userId);
      if (
        !Array.isArray(targetIds) ||
        targetIds.length > 16 ||
        targetIds.some((id) => typeof id !== "string" || !id || id.length > 200)
      )
        throw new OwnerCaptureError(
          "invalid_request",
          "targetIds is a list of at most 16 identifiers.",
        );
      if (sessionId !== null && (typeof sessionId !== "string" || !sessionId))
        throw new OwnerCaptureError(
          "invalid_request",
          "sessionId is an identifier or null.",
        );
      const caps = await provider.capabilitiesFor(userId ?? null);
      const limit = finiteCap(caps["capture.count_limit"]);
      if (limit !== null && (await store.captureCount(tenantId)) >= limit)
        throw new OwnerCaptureError(
          "capture_limit_reached",
          "This space holds as many captures as its profile allows.",
          409,
        );
      let planId = null;
      if (sessionId) {
        const night = (
          await db.query(
            "SELECT id, plan_id FROM observation_sessions WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
            [sessionId, tenantId],
          )
        ).rows[0];
        if (!night)
          throw new OwnerCaptureError(
            "session_not_found",
            "The night was not found in this space.",
            404,
          );
        planId = night.plan_id ?? null;
      }
      const wanted = [...new Set(targetIds)];
      if (wanted.length) {
        const known = new Set(await store.existingTargetIds(wanted, tenantId));
        if (wanted.some((id) => !known.has(id)))
          throw new OwnerCaptureError(
            "target_not_found",
            "One or more targets were not found.",
            404,
          );
      }
      const created = await store.createDefinition({
        tenantId,
        sessionId,
        planId,
        targetIds: wanted,
        createdAt: now(),
      });
      // A definition made on a night arrives with the lines the night says
      // — « Synchroniser avec la session » without a touch.
      if (sessionId) await prefillLines(tenantId, created.id);
      return await resource(tenantId, await row(tenantId, created.id), {
        locale,
        user: await person(userId),
      });
    },

    /**
     * « Supprimer la capture »: the row, its targets, its tags, what a
     * composition keeps about it (`captureRemoved`), the completed uploads
     * that named it, its equipment links, and the task that deletes its
     * bytes and the files derived from them (the thumbnail, the shared
     * copy), written in the same transaction. The task is tried at once; a
     * store that does not answer leaves it for the hourly maintenance
     * (`replayFileDeletions`) and the capture is gone all the same. A
     * change is published so that a paired phone reads its list again.
     * `sessionErased` is the erasure of a session in the trash taking its
     * captures (`session-trash.js`), which alone may name a masked capture.
     */
    async remove({ tenantId, captureId, sessionErased = false }) {
      const capture = await row(tenantId, captureId, {
        inTrash: sessionErased === true,
      });
      if (!capture) throw notFound();
      // Every image of the capture goes with it, its progression
      // images too.
      const variants = [
        ...(await store.listVariants(tenantId, capture.id)),
        ...(await store.listProgression(tenantId, capture.id)),
      ];
      const digests = new Set(
        [capture.sha256, ...variants.map((variant) => variant.sha256)].filter(
          isImageDigest,
        ),
      );
      await db.transaction(async (tx) => {
        // What a composition keeps about the capture, in the same
        // transaction (`gallery.moderation`: the reports of its team).
        await captureRemoved?.(tx, {
          tenantId,
          captureId: capture.id,
        });
        await tx.run("DELETE FROM capture_targets WHERE capture_id = ?", [
          capture.id,
        ]);
        await tx.run(
          "DELETE FROM capture_tags WHERE tenant_id = ? AND capture_id = ?",
          [tenantId, capture.id],
        );
        await tx.run(
          "DELETE FROM upload_sessions WHERE tenant_id = ? AND (capture_id = ? OR (sha256 = ? AND state = 'completed'))",
          [tenantId, capture.id, capture.sha256],
        );
        await tx.run(
          "DELETE FROM capture_equipment WHERE tenant_id = ? AND capture_id = ?",
          [tenantId, capture.id],
        );
        // The sky solutions of its images go with them.
        await tx.run(
          "DELETE FROM capture_sky_solutions WHERE tenant_id = ? AND capture_id = ?",
          [tenantId, capture.id],
        );
        for (const variant of variants)
          await tx.run(
            "DELETE FROM upload_sessions WHERE tenant_id = ? AND sha256 = ? AND state = 'completed'",
            [tenantId, variant.sha256],
          );
        await tx.run(
          "DELETE FROM capture_variants WHERE tenant_id = ? AND capture_id = ?",
          [tenantId, capture.id],
        );
        // The revisions of its fields leave with it.
        await tx.run(
          "DELETE FROM capture_field_revisions WHERE tenant_id = ? AND capture_id = ?",
          [tenantId, capture.id],
        );
        await tx.run("DELETE FROM captures WHERE id = ? AND tenant_id = ?", [
          capture.id,
          tenantId,
        ]);
        await recordFileDeletions(tx, {
          tenantId,
          digests,
          at: new Date(now()),
        });
      });
      // Never throws, and never undoes the deletion: what the store cannot
      // delete now stays recorded.
      await fileDeletions.attempt({ tenantId, digests });
      publishChange({ tenantId, domains: ["captures"] });
      return { deleted: true, id: capture.id };
    },

    /**
     * The hourly pass over the files left by a deletion the store did not
     * make (`server/start.js`): the tasks that are due are tried again.
     * Answers `{ done, cancelled, deferred, failed, remaining }`; never
     * throws.
     */
    async replayFileDeletions(options = {}) {
      return await fileDeletions.replay(options);
    },

    /** The deletions of files that wait, oldest first. */
    async pendingFileDeletions(options = {}) {
      return await fileDeletions.pending(options);
    },

    // ---- Images:
    // the owner's gestures on the images of a capture, from the web session
    // only (never a device token: the routes are « Mon espace »'s). No
    // history: a main image and variants. Each rule is one function of
    // `capture-variants.js`.

    /**
     * « Utiliser comme image principale »: the chosen image must have
     * passed its own automatic check; on a public capture its shared copy
     * is written before it is shown. The former main image becomes a
     * variant and keeps its visibility.
     */
    async setMainImage({
      tenantId,
      userId = null,
      captureId,
      imageId,
      locale,
    }) {
      const capture = await ownCapture(tenantId, captureId);
      const image = await ownImage(tenantId, capture.id, imageId);
      refuseWith(mainImageRefusal({ capture, image }));
      if (!image.main) {
        if (capture.visibility === "public")
          await writeSharedCopy(tenantId, image.sha256, image.originalName);
        await store.setMainImage(tenantId, capture.id, image.id);
        // The capture says what made its main image: the new one's steps, as
        // its producer proposed them, take the place of the former one's --
        // never over what the owner wrote.
        await carryProcessingOfMainImage({
          store,
          tenantId,
          captureId: capture.id,
          imageId: image.id,
          at: now(),
          userId,
        });
      }
      return await resource(tenantId, await row(tenantId, capture.id), {
        locale,
        user: await person(userId),
      });
    },

    /**
     * A variant's own visibility (`shown`: `true` public): private on
     * arrival; public only under the rules of `variantVisibilityRefusal`
     * and the rights of « Publique » (`capture.public`, the block on
     * publishing), its shared copy written first.
     */
    async setVariantPublic({
      tenantId,
      userId = null,
      captureId,
      imageId,
      shown,
      locale,
    }) {
      if (typeof shown !== "boolean")
        throw new OwnerCaptureError("invalid_request", "public is a boolean.");
      const capture = await ownCapture(tenantId, captureId);
      const image = await ownImage(tenantId, capture.id, imageId);
      refuseWith(variantVisibilityRefusal({ capture, image, shown }));
      if (shown && !image.public) {
        const caps = await provider.capabilitiesFor(userId ?? null);
        if (!publicAllowed(caps))
          throw new OwnerCaptureError(
            "capture_public_unavailable",
            "This space cannot make a capture public.",
            403,
          );
        const user = await person(userId);
        if (
          user.publishing_blocked_until &&
          Date.parse(user.publishing_blocked_until) > Date.parse(now())
        )
          throw blockedError(user.publishing_blocked_until);
        await writeSharedCopy(tenantId, image.sha256, image.originalName);
      }
      if (shown !== image.public)
        await store.setVariantPublic(tenantId, capture.id, image.id, shown);
      return await resource(tenantId, await row(tenantId, capture.id), {
        locale,
        user: await person(userId),
      });
    },

    /**
     * The owner's title (90 characters at most) or description (280 at most) of
     * an image of the capture — the main one or a variant —, one field per
     * call or both together. A blank value gives the generated text, else the
     * name by default, back (`null`); the text is kept as typed, its outer
     * spaces trimmed. `by`: `web` (the web session) or `device` (the owner's
     * phone, by its device token). Judged like the capture's other fields:
     * `ifMatch` is the revision the client read, and the write is refused
     * with `409 capture_conflict` (`field: "imageTexts"`, `line`: the image)
     * only if the texts of that image changed after it; a write that leaves
     * them as they were changes nothing and moves nothing.
     */
    async setVariantText({
      tenantId,
      userId = null,
      captureId,
      imageId,
      field = null,
      value = null,
      // The title and the description together,
      // `{ title?, description? }`.
      texts = null,
      locale,
      by = "web",
      ifMatch = null,
      originClientInstanceId = null,
    }) {
      const changes = texts ?? { [field]: value };
      const keys = Object.keys(changes);
      if (!keys.length)
        throw new OwnerCaptureError(
          "invalid_request",
          "Send { title }, { description } or both: a string or null.",
        );
      for (const key of keys) {
        const problem = variantTextProblem(key, changes[key]);
        if (problem)
          throw new OwnerCaptureError(
            "invalid_request",
            problem === "too_long"
              ? `The ${key} of an image holds ${VARIANT_TEXT_LIMITS[key]} characters at most.`
              : "Send { title }, { description } or both: a string or null.",
            400,
            problem === "too_long"
              ? { field: key, limit: VARIANT_TEXT_LIMITS[key] }
              : {},
          );
      }
      await refuseReadOnly(userId);
      return await mutate({
        tenantId,
        userId,
        captureId,
        ifMatch,
        by,
        locale,
        originClientInstanceId,
        decide: async (capture) => {
          const image = await ownImage(tenantId, capture.id, imageId);
          const stored = await store.variantRow(tenantId, capture.id, image.id);
          const title = Object.hasOwn(changes, "title")
            ? storedVariantText(changes.title)
            : (stored?.title ?? null);
          const description = Object.hasOwn(changes, "description")
            ? storedVariantText(changes.description)
            : (stored?.description ?? null);
          // The owner's hand: a title of the owner (`owner`) and the date he
          // wrote them; both cleared, the image is given back to « by
          // default » and a producer may propose again.
          const titleSource =
            title === null
              ? null
              : Object.hasOwn(changes, "title")
                ? "owner"
                : (stored?.title_source ?? null);
          const written = title !== null || description !== null;
          if (
            title === (stored?.title ?? null) &&
            description === (stored?.description ?? null) &&
            titleSource === (stored?.title_source ?? null) &&
            written === Boolean(stored?.edited_at)
          )
            return null;
          return {
            claim: { field: "imageTexts", line: image.id },
            fields: [{ field: "imageTexts", line: image.id }],
            apply: () =>
              store.writeVariantTexts(
                tenantId,
                capture.id,
                image.id,
                {
                  title,
                  description,
                  titleSource,
                  editedAt: written ? now() : null,
                },
                { moveRevision: false },
              ),
          };
        },
      });
    },

    /**
     * The owner's hand writes one field of the capture's
     * metadata — `null` gives it back to its source, any other value is
     * the owner's (`edited: true`). `by`: `web` (the web session: every
     * field) or `device` (the owner's phone, by its device token: every
     * field of `deviceMetadataField`, the capture's session
     * excepted; the rest `403 web_session_required`). `403
     * entitlement_read_only` in the read-only window.
     *
     * `ifMatch` is the revision the client read; the write is refused with
     * `409 capture_conflict` only if the field it writes (an acquisition
     * line, for a line) changed after it. A write that leaves the stored
     * value as it was changes nothing.
     */
    async updateMetadata({
      tenantId,
      userId = null,
      captureId,
      metadata,
      by = "web",
      locale,
      ifMatch = null,
      originClientInstanceId = null,
    }) {
      await refuseReadOnly(userId);
      let change;
      try {
        change = ownerChangeInput(metadata);
      } catch (error) {
        throw metadataFailure(error);
      }
      if (by === "device" && !DEVICE_OWNER_FIELDS.includes(change.field))
        throw WEB_ONLY(change.field);
      return await mutate({
        tenantId,
        userId,
        captureId,
        ifMatch,
        by,
        locale,
        originClientInstanceId,
        decide: async (capture) => {
          const { field } = change;
          if (field === "sessionId") {
            if (change.value === null) {
              // The capture leaves its session and stays without one. The
              // plan it read from that session goes with it; a plan the
              // capture was linked to by itself stays.
              if (!capture.session_id) return null;
              const former = (
                await db.query(
                  "SELECT plan_id FROM observation_sessions WHERE id = ? AND tenant_id = ?",
                  [capture.session_id, tenantId],
                )
              ).rows[0];
              return {
                claim: { field },
                fields: [{ field }],
                apply: () =>
                  store.setCaptureNight(
                    tenantId,
                    capture.id,
                    null,
                    former?.plan_id && former.plan_id === capture.plan_id
                      ? null
                      : (capture.plan_id ?? null),
                  ),
              };
            }
            const session = (
              await db.query(
                "SELECT id, plan_id FROM observation_sessions WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
                [change.value, tenantId],
              )
            ).rows[0];
            if (!session)
              throw new OwnerCaptureError(
                "session_not_found",
                "The night was not found in this space.",
                404,
              );
            if (session.id === capture.session_id) return null;
            return {
              claim: { field },
              fields: [{ field }],
              apply: () =>
                store.setCaptureNight(
                  tenantId,
                  capture.id,
                  session.id,
                  session.plan_id ?? capture.plan_id ?? null,
                ),
              // The capture joined a session: its lines arrive filled.
              after: () => prefillLines(tenantId, capture.id),
            };
          }
          // The capture's targets, replaced as a whole by the owner.
          if (field === "targetIds") {
            if (change.value.length) {
              const known = new Set(
                await store.existingTargetIds(change.value, tenantId),
              );
              if (change.value.some((id) => !known.has(id)))
                throw new OwnerCaptureError(
                  "target_not_found",
                  "One or more targets were not found.",
                  404,
                );
            }
            const held = (
              await db.query(
                "SELECT target_id FROM capture_targets WHERE capture_id = ? ORDER BY position",
                [capture.id],
              )
            ).rows.map((entry) => entry.target_id);
            if (sameValue(held, change.value)) return null;
            return {
              claim: { field },
              fields: [{ field }],
              apply: () =>
                store.setCaptureTargets(tenantId, capture.id, change.value),
            };
          }
          if (field.startsWith("equipment.") && change.value !== null) {
            const ids = Array.isArray(change.value)
              ? change.value
              : [change.value];
            if (ids.length) {
              const known = new Set(
                (
                  await db.query(
                    `SELECT id FROM equipment
                     WHERE id IN (${ids.map(() => "?").join(", ")})
                       AND (tenant_id = ? OR scope = 'default')`,
                    [...ids, tenantId],
                  )
                ).rows.map((entry) => entry.id),
              );
              if (ids.some((id) => !known.has(id)))
                throw new OwnerCaptureError(
                  "equipment_not_found",
                  "This equipment is not in this space.",
                  404,
                );
            }
          }
          const targetIds = (
            await db.query(
              "SELECT target_id FROM capture_targets WHERE capture_id = ? ORDER BY position",
              [capture.id],
            )
          ).rows.map((entry) => entry.target_id);
          const { steps } = await readMetadataInputs(
            db,
            tenantId,
            capture,
            targetIds,
          );
          const before = storedMetadata(capture);
          let next;
          try {
            next = applyOwnerChange(before, change, {
              at: now(),
              nightSteps: steps,
            });
          } catch (error) {
            throw metadataFailure(error);
          }
          let claim = { field };
          let fields;
          if (field === "acquisition") {
            // The lines the capture reads before this write: its own, else
            // its night's steps.
            const was = Array.isArray(before.acquisition)
              ? before.acquisition
              : nightLines(steps);
            const op = change.value;
            if (op === null) {
              if (!Array.isArray(before.acquisition)) return null;
              claim = { field, anyLine: true };
              fields = [{ field, line: "" }];
            } else {
              const ids = changedLineIds(was, next.acquisition);
              if (op.op === "set" && !ids.length) return null;
              claim = op.op === "add" ? null : { field, line: op.lineId };
              fields = ids.map((line) => ({ field, line }));
            }
          } else {
            if (
              sameValue(
                metadataFieldView(before, field),
                metadataFieldView(next, field),
              )
            )
              return null;
            fields = [{ field }];
          }
          return {
            claim,
            fields,
            apply: () =>
              store.writeMetadata(tenantId, capture.id, metadataColumns(next)),
          };
        },
      });
    },

    /**
     * `POST /v1/manage/captures/{id}/acquisition/sync` (« Synchroniser avec la
     * session »: either credential, `POST /v1/captures/{id}/acquisition/sync`
     * too): fills the capture's lines of « Intégrations » from its session and
     * its targets — the measured steps of Astro Sync's analysis when the session
     * has one (lines of origin `astro-sync`), else one declared line per target
     * from the debriefing or the events (lines of origin `session`: the seconds,
     * the frames and the filter when known). On the image of a multi-night plan
     * (role `plan`) the lines come from the sessions the image combines instead,
     * one per session, target and family (`capture-lines-sync.js`). Replaces the
     * lines of origin `session`, `night` and `astro-sync` that were not
     * corrected, keeps those of origin `owner` and `import` and every line
     * corrected by hand. When the source has nothing to say the lines stay as
     * they are. Answers `{ acquisition, capture }`; `409 capture_without_session`
     * for a capture with neither a session nor a plan; `409 capture_conflict`
     * when a line changed after the revision `ifMatch` names.
     */
    async syncAcquisition({
      tenantId,
      userId = null,
      captureId,
      locale,
      ifMatch = null,
      by = "web",
      originClientInstanceId = null,
    }) {
      await refuseReadOnly(userId);
      const capture = await ownCapture(tenantId, captureId);
      if (!capture.session_id && !capture.project_id)
        throw new OwnerCaptureError(
          "capture_without_session",
          "This capture has no session to synchronise with.",
          409,
        );
      await syncCaptureLines({
        store,
        db,
        dialect,
        tenantId,
        captureId: capture.id,
        userId,
        by,
        now,
        originClientInstanceId,
        // The claim of a synchronisation: any line changed after the
        // revision named refuses it.
        beforeWrite: async (row, prepared) => {
          await judge(
            row,
            prepared?.changed ? { field: "acquisition", anyLine: true } : null,
            { ifMatch, tenantId, userId, locale },
          );
        },
      });
      const synced = await reload(tenantId, capture.id, { locale, userId });
      return { acquisition: synced.metadata.acquisition, capture: synced };
    },

    /**
     * A producer's proposals for a
     * capture that exists (Astro Sync, the import of the old nights, by a
     * device token; `{ source, title?, description?, acquisition[]?,
     * calibration?, sensor?, processing? }`): a value the owner edited is
     * never overwritten nor cleared, a value proposed earlier and untouched
     * is updated, a missing one added, nothing deleted. Answers
     * `{ capture, skipped }` — what was left, `{ field, reason }`.
     */
    async proposeMetadata({
      tenantId,
      userId = null,
      captureId,
      proposed,
      locale,
    }) {
      await refuseReadOnly(userId);
      let input;
      try {
        input = proposalsInput(proposed);
      } catch (error) {
        throw metadataFailure(error);
      }
      const capture = await ownCapture(tenantId, captureId);
      const { skipped } = await writeProposals(
        tenantId,
        capture,
        input,
        userId,
      );
      return {
        capture: await resource(tenantId, await row(tenantId, capture.id), {
          locale,
          user: await person(userId),
        }),
        skipped,
      };
    },

    /**
     * A producer's title and description for an image that exists
     * (`PATCH /v1/captures/{id}/variants/{imageId}`
     * `{ title, description, source }`, the only gesture on an image a
     * device may do): never over an image whose texts the owner wrote.
     * `imageQuality` too, the quality of the stacked image the producer
     * measured — kept under the capability `analysis.logs` (else listed in
     * `skipped` with the reason `capability`), replacing the earlier
     * measure of the same image, `null` clearing it. Answers
     * `{ capture, skipped }`.
     */
    async proposeVariantText({
      tenantId,
      userId = null,
      captureId,
      imageId,
      source,
      title,
      description,
      generatedTitle,
      generatedDescription,
      processing,
      imageQuality,
      locale,
    }) {
      await refuseReadOnly(userId);
      let texts;
      let quality;
      try {
        if (!["astro-sync", "import"].includes(source))
          throw new MetadataError(
            "source",
            null,
            "source is one of astro-sync, import.",
          );
        texts = variantProposalInput({
          title,
          description,
          generatedTitle,
          generatedDescription,
          processing,
        });
        if (imageQuality !== undefined)
          quality = imageQualityInput(imageQuality);
      } catch (error) {
        throw metadataFailure(error);
      }
      const capture = await ownCapture(tenantId, captureId);
      await ownImage(tenantId, capture.id, imageId);
      const skipped = Object.keys(texts).length
        ? await writeVariantProposal(
            tenantId,
            capture.id,
            imageId,
            texts,
            source,
          )
        : [];
      // What made the image: kept with it; the capture shows it while the
      // image is its main one, never over what the owner wrote.
      if (texts.processing)
        skipped.push(
          ...(
            await recordVariantProcessing({
              store,
              tenantId,
              captureId: capture.id,
              imageId,
              processing: texts.processing,
              source,
              at: now(),
              userId,
            })
          ).skipped,
        );
      if (imageQuality !== undefined) {
        const granted = await provider.capabilitiesFor(userId ?? null);
        if (granted?.["analysis.logs"])
          await store.writeVariantQuality(
            tenantId,
            capture.id,
            imageId,
            quality,
          );
        else skipped.push({ field: "imageQuality", reason: "capability" });
      }
      return {
        capture: await resource(tenantId, await row(tenantId, capture.id), {
          locale,
          user: await person(userId),
        }),
        skipped,
      };
    },

    /** Deletes a variant and its files (never the main image alone). */
    async deleteVariant({
      tenantId,
      userId = null,
      captureId,
      imageId,
      locale,
    }) {
      const capture = await ownCapture(tenantId, captureId);
      const image = await ownImage(tenantId, capture.id, imageId);
      refuseWith(variantDeletionRefusal({ image }));
      await store.deleteVariant(tenantId, capture.id, image.id);
      // The task was written with the rows; a store that does not answer
      // leaves it for the hourly maintenance.
      await fileDeletions.attempt({ tenantId, digests: [image.sha256] });
      return await resource(tenantId, await row(tenantId, capture.id), {
        locale,
        user: await person(userId),
      });
    },

    /**
     * Which file of a capture of the space the owner's media routes serve:
     * `{ file, tenantId, sha256, originalName, variant }` — `file` names it
     * in the capture store (`original`, `thumbnail`, `shared`) — or `null`.
     * `variant: "thumbnail"` names its thumbnail instead (`null` while it
     * has none).
     */
    async media({ tenantId, captureId, variant = "original", imageId = null }) {
      const found = await row(tenantId, captureId);
      if (!found) return null;
      // A capture without an image has no file to serve.
      if (!isImageDigest(found.sha256)) return null;
      // One image of the capture (`imageId`), its main one otherwise.
      let capture = found;
      if (imageId) {
        const image = await store.getVariant(tenantId, found.id, imageId);
        if (!image) return null;
        capture = {
          ...found,
          sha256: image.sha256,
          original_name: image.originalName,
        };
      }
      if (variant === "preview") {
        // The copy without location (JPEG, 4096 px at most) a gallery
        // serves, written at the first need; `null` for a file that cannot
        // have one.
        try {
          await sharedCopy({
            captureStore: files(),
            tenantId,
            sha256: capture.sha256,
            originalName: capture.original_name,
          });
          return {
            file: "shared",
            tenantId,
            sha256: capture.sha256,
            originalName: "capture.jpg",
            variant,
          };
        } catch {
          return null;
        }
      }
      if (variant === "thumbnail") {
        const found = await hasThumbnail(tenantId, capture.sha256).catch(
          () => false,
        );
        return found
          ? {
              file: "thumbnail",
              tenantId,
              sha256: capture.sha256,
              originalName: "thumbnail.webp",
              variant,
            }
          : null;
      }
      return {
        file: "original",
        tenantId,
        sha256: capture.sha256,
        originalName: capture.original_name,
        variant: "original",
      };
    },
  };
}
