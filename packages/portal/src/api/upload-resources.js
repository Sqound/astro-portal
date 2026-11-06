import { randomUUID } from "node:crypto";
import {
  CAPABILITY_UNLIMITED,
  isUnlimitedCapability,
} from "astro-contracts/capabilities";
import { resolveWriteAccess, staticProfile } from "../capabilities/provider.js";
import {
  MetadataError,
  PROPOSABLE_FIELDS,
  PROPOSAL_SOURCES,
  acquisitionSummaryOf,
  imageQualityInput,
  proposedFieldsInput,
  recordProposals,
  recordVariantProcessing,
  recordVariantProposal,
  variantProposalInput,
} from "../captures/capture-metadata.js";
import { OPEN_SOURCE_PROFILE } from "../capabilities/profiles.js";
import {
  DEFAULT_CHECK_NOTICE_DAYS,
  captureState,
} from "../captures/capture-state.js";
import {
  PUBLIC_GALLERY_TAGS,
  publicGalleryTag,
} from "../captures/public-capture-view.js";
import { readCaptureContext } from "../captures/capture-context.js";
import { createDatabaseDriver } from "../persistence/database.js";
import { createSkySolutionRepository } from "../persistence/sky-solution-repository.js";
import {
  CaptureRepositoryError,
  createCaptureRepository,
  decodeRecentCursor,
} from "../persistence/capture-repository.js";
import {
  VARIANT_ROLES,
  VARIANT_SOURCES,
} from "../captures/capture-variants.js";
import {
  UploadSessionRepositoryError,
  createUploadSessionRepository,
} from "../persistence/upload-session-repository.js";
import {
  CaptureStorageError,
  defaultUploadChunkBytes,
} from "../uploads/capture-storage.js";
import { captureStore } from "../uploads/capture-store.js";
import {
  MultipartError,
  readTwoPartUpload,
} from "../uploads/multipart-stream.js";
import {
  MEDIA_HEAD_BYTES,
  activeDocumentKindOf,
} from "../uploads/media-type.js";

const uploadExpiryHours = 72;

/**
 * A refusal of `capture-metadata.js` as the uploads answer it —
 * `400 invalid_metadata` naming the field and its limit.
 */
function invalidMetadata(error) {
  if (!(error instanceof MetadataError)) return error;
  const refusal = new UploadResourceError(error.code, error.message, {
    status: error.status,
  });
  refusal.body.error.field = error.field;
  refusal.body.error.limit = error.limit;
  return refusal;
}

const PERSONAL_TARGET_KEYS = new Set([
  "name",
  "label",
  "raHours",
  "decDegrees",
  "placeName",
  "date",
  "note",
]);

/**
 * The body of `POST /v1/targets/personal`: `name` (1 to 80 characters,
 * trimmed), `label` (one of the public gallery's generic tags), the
 * optional `raHours` (0 ≤ h < 24) and `decDegrees` (−90 to 90), given
 * together, `placeName` (120 characters at most), `date` (`YYYY-MM-DD`) and
 * `note` (1 000 characters at most). The text is kept as typed, trimmed.
 */
export function parsePersonalTarget(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body))
    throw invalid("The request body must be a JSON object.");
  for (const key of Object.keys(body))
    if (!PERSONAL_TARGET_KEYS.has(key))
      throw invalid(`Unexpected property "${key}".`);
  const text = (value, label, max, { required = false } = {}) => {
    if (value === undefined || value === null) {
      if (required) throw invalid(`${label} is required.`);
      return null;
    }
    if (typeof value !== "string") throw invalid(`${label} is a string.`);
    const trimmed = value.trim();
    if (!trimmed) {
      if (required) throw invalid(`${label} is required.`);
      return null;
    }
    if ([...trimmed].length > max)
      throw invalid(`${label} holds ${max} characters at most.`);
    return trimmed;
  };
  const name = text(body.name, "name", 80, { required: true });
  if (!PUBLIC_GALLERY_TAGS.includes(body.label))
    throw invalid(`label is one of ${PUBLIC_GALLERY_TAGS.join(", ")}.`);
  const hasRa = body.raHours !== undefined && body.raHours !== null;
  const hasDec = body.decDegrees !== undefined && body.decDegrees !== null;
  if (hasRa !== hasDec)
    throw invalid("raHours and decDegrees are given together.");
  if (
    hasRa &&
    (typeof body.raHours !== "number" ||
      !Number.isFinite(body.raHours) ||
      body.raHours < 0 ||
      body.raHours >= 24 ||
      typeof body.decDegrees !== "number" ||
      !Number.isFinite(body.decDegrees) ||
      body.decDegrees < -90 ||
      body.decDegrees > 90)
  )
    throw invalid("raHours is in [0, 24) and decDegrees in [-90, 90].");
  let date = null;
  if (body.date !== undefined && body.date !== null) {
    if (
      typeof body.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.date) ||
      Number.isNaN(Date.parse(`${body.date}T00:00:00Z`)) ||
      new Date(`${body.date}T00:00:00Z`).toISOString().slice(0, 10) !==
        body.date
    )
      throw invalid("date is a day, YYYY-MM-DD.");
    date = body.date;
  }
  return {
    name,
    label: body.label,
    raHours: hasRa ? body.raHours : null,
    decDegrees: hasDec ? body.decDegrees : null,
    placeName: text(body.placeName, "placeName", 120),
    date,
    note: text(body.note, "note", 1000),
  };
}

const isoDay = (value) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)
    ? value.slice(0, 10)
    : null;
const arrayOfJson = (value) => {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

/**
 * A target of a capture as `GET /v1/captures` writes it: a catalogue target
 * with its designation, type, aliases and position; a personal target with
 * its name and label.
 */
export function listedTarget(id, entry) {
  if (!entry) return { id, source: "catalogue", designation: id };
  if (entry.library_source === "personal")
    return {
      id,
      source: "personal",
      name: entry.designation,
      label: entry.gallery_label ?? null,
      raHours: entry.ra_hours == null ? null : Number(entry.ra_hours),
      decDegrees: entry.dec_degrees == null ? null : Number(entry.dec_degrees),
    };
  return {
    id,
    source: "catalogue",
    designation: entry.designation,
    type: entry.type_key ?? null,
    aliases: [
      ...arrayOfJson(entry.aliases_json),
      ...arrayOfJson(entry.common_names_json),
    ],
    raHours: entry.ra_hours == null ? null : Number(entry.ra_hours),
    decDegrees: entry.dec_degrees == null ? null : Number(entry.dec_degrees),
  };
}

const thumbnailExists = async (files, tenantId, sha256) =>
  Boolean(await files.stat({ tenantId, sha256, file: "thumbnail" }));

/** The generic label of a capture: its first target's. */
export function galleryLabelOf(targets) {
  const first = targets[0];
  if (!first) return "Grand champ";
  if (first.source === "personal") return first.label ?? "Grand champ";
  return publicGalleryTag(first.type) ?? null;
}
function hoursFromNow(nowIso, hours) {
  return new Date(new Date(nowIso).getTime() + hours * 3600_000).toISOString();
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256Pattern = /^[0-9a-f]{64}$/;
const allowedMetadataKeys = new Set([
  "sessionId",
  "planId",
  "targetId",
  "targetIds",
  "originalName",
  "sha256",
  "byteSize",
  "contentType",
  // The capture these bytes add an image to, and the image's source.
  "captureId",
  "source",
  // A progression image of `captureId` (its history) and the light frames
  // its milestone stacks.
  "role",
  "progressionFrames",
  // The image of a multi-night plan (role `plan`), its plan and what it
  // combines.
  "projectId",
  "combinedNightIds",
  "totalsByFilter",
  "planRender",
  // The web's add box asks for a draft (« Elle sera ajoutée en brouillon,
  // privée. »).
  "stage",
  // A producer's proposals for
  // the capture and for the image sent, under `metadataSource`.
  "metadataSource",
  ...PROPOSABLE_FIELDS,
  "variantTitle",
  "variantDescription",
  // The texts the producer generated for the image sent, in the ten
  // languages (kept apart from the owner's title and description).
  "variantGeneratedTitle",
  "variantGeneratedDescription",
  // What made the image sent (`{ software?, steps? }`): the image's own,
  // which the capture shows while the image is its main one.
  "variantProcessing",
  // The quality of the stacked image a producer measured on its linear
  // master (`imageQuality`), kept under `analysis.logs`.
  "imageQuality",
]);
const maxTargetsPerCapture = 16;

/**
 * The stable application error for thin HTTP adapters, on the exact pattern
 * of `PlanResourceError` (`api/plan-resources.js`): it carries its own
 * complete v1 body so a route adapter never has to know which fields go with
 * which code. `storage` is only ever attached for the three capability
 * refusals (`capture_limit_reached`, `storage_quota_reached`,
 * `file_too_large`), matching `capture.schema.json`'s `refusal` shape.
 */
export class UploadResourceError extends Error {
  constructor(
    code,
    message,
    { status = 400, storage = null, offset = undefined, ...details } = {},
  ) {
    super(message);
    this.name = "UploadResourceError";
    this.code = code;
    this.status = status;
    this.body = {
      error: { code, message },
      ...(storage ? { storage } : {}),
      // `offset` repeats the resumable protocol's own deciding number
      // (`api/uploads.md`), on the same doctrine as `storage` above: a
      // client refused with `upload_offset_mismatch`, `upload_hash_mismatch`
      // or `upload_incomplete` can resume without a second `GET`.
      ...(offset !== undefined ? { offset } : {}),
    };
    if (offset !== undefined) this.offset = offset;
    Object.assign(this, details);
  }
}

function invalid(message) {
  return new UploadResourceError("invalid_request", message, { status: 400 });
}

/**
 * An SVG or HTML document has no reason to be a capture, and is refused by
 * its bytes, whatever its name. Every other file an astrophotographer sends
 * (images, FITS, XISF, raw files, logs, XML sidecars) is still accepted;
 * how a file is later served is decided by its bytes too
 * (`uploads/media-type.js`).
 */
function refuseActiveContent(head) {
  if (activeDocumentKindOf(head))
    throw new UploadResourceError(
      "capture_content_refused",
      "SVG and HTML documents cannot be sent as captures.",
      { status: 415 },
    );
}

function nullableUuid(value, label) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !uuidPattern.test(value))
    throw invalid(`${label} must be a UUID or null.`);
  return value;
}

function targetIdValue(value, label) {
  if (typeof value !== "string" || value.length < 1 || value.length > 200)
    throw invalid(`${label} must be a string of 1 to 200 characters.`);
  return value;
}

/**
 * Hand-validates the `metadata` part against `capture.schema.json`'s
 * `uploadMetadata` def (no runtime JSON Schema library is a dependency of
 * this repository — see `multipart-stream.js`'s own note). `targetId` is the
 * tolerated singular alias (additive, pre-decision callers); a request
 * carrying both `targetId` and `targetIds` is their union, deduplicated,
 * `targetIds` order first.
 */
export function parseUploadMetadata(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw invalid("The metadata part must be valid JSON.");
  }
  return parseUploadMetadataObject(parsed, "The metadata part");
}

/**
 * The object-level half of `parseUploadMetadata`, reused as-is by the
 * resumable protocol's `POST /v1/uploads` JSON create body (`api/
 * uploads.md`): the two share every field (`sessionId`, `planId`,
 * `targetId`/`targetIds`, `originalName`, `sha256`, `byteSize`,
 * `contentType`) and every validation rule, on purpose — a create request
 * IS an upload's declared metadata, just delivered as a JSON request body
 * instead of a multipart part.
 */
export function parseUploadMetadataObject(
  parsed,
  subject = "The request body",
) {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
    throw invalid(`${subject} must be a JSON object.`);
  for (const key of Object.keys(parsed))
    if (!allowedMetadataKeys.has(key))
      throw invalid(`Unexpected metadata property "${key}".`);

  const { originalName } = parsed;
  if (
    typeof originalName !== "string" ||
    originalName.length < 1 ||
    originalName.length > 255
  )
    throw invalid("originalName must be a string of 1 to 255 characters.");

  const { sha256 } = parsed;
  if (typeof sha256 !== "string" || !sha256Pattern.test(sha256))
    throw invalid("sha256 must be a lowercase 64-character hex digest.");

  const { byteSize } = parsed;
  if (!Number.isInteger(byteSize) || byteSize < 1)
    throw invalid("byteSize must be a positive integer.");

  const sessionId = nullableUuid(parsed.sessionId, "sessionId");
  const planId = nullableUuid(parsed.planId, "planId");

  const targetIdsInput = [];
  if (parsed.targetIds !== undefined) {
    if (!Array.isArray(parsed.targetIds))
      throw invalid("targetIds must be an array.");
    for (const value of parsed.targetIds)
      targetIdsInput.push(targetIdValue(value, "targetIds"));
  }
  if (parsed.targetId !== undefined && parsed.targetId !== null)
    targetIdsInput.push(targetIdValue(parsed.targetId, "targetId"));
  const targetIds = [...new Set(targetIdsInput)];
  if (targetIds.length > maxTargetsPerCapture)
    throw invalid(
      `A capture may show at most ${maxTargetsPerCapture} targets.`,
    );

  const { contentType } = parsed;
  if (
    contentType !== undefined &&
    (typeof contentType !== "string" ||
      contentType.length < 1 ||
      contentType.length > 120)
  )
    throw invalid("contentType must be a string of 1 to 120 characters.");

  const captureId = nullableUuid(parsed.captureId, "captureId");
  const { source } = parsed;
  if (
    source !== undefined &&
    source !== null &&
    !VARIANT_SOURCES.includes(source)
  )
    throw invalid(`source is one of ${VARIANT_SOURCES.join(", ")}.`);
  const { role, progressionFrames } = parsed;
  if (role !== undefined && role !== null && !UPLOAD_ROLES.includes(role))
    throw invalid(`role is one of ${UPLOAD_ROLES.join(", ")}.`);
  const plan = parsePlanImage(parsed, { role, captureId, sessionId, planId });
  if (role === "progression" && !captureId)
    throw invalid(
      "A progression image names the capture it is the history of (captureId).",
    );
  if (
    progressionFrames !== undefined &&
    progressionFrames !== null &&
    (role !== "progression" ||
      !Number.isInteger(progressionFrames) ||
      progressionFrames < 1 ||
      progressionFrames > 1_000_000)
  )
    throw invalid(
      "progressionFrames is a positive integer, with role progression.",
    );
  const { stage } = parsed;
  if (
    stage !== undefined &&
    stage !== null &&
    !CAPTURE_UPLOAD_STAGES.has(stage)
  )
    throw invalid("stage is draft or finalized.");

  // The proposals, checked before a byte is read.
  const { metadataSource } = parsed;
  if (
    metadataSource !== undefined &&
    metadataSource !== null &&
    !PROPOSAL_SOURCES.includes(metadataSource)
  )
    throw invalidMetadata(
      new MetadataError(
        "metadataSource",
        null,
        `metadataSource is one of ${PROPOSAL_SOURCES.join(", ")}.`,
      ),
    );
  let proposals;
  try {
    const fields = proposedFieldsInput(
      Object.fromEntries(
        PROPOSABLE_FIELDS.filter((key) => parsed[key] !== undefined).map(
          (key) => [key, parsed[key]],
        ),
      ),
      "metadata",
    );
    const variant = variantProposalInput(
      {
        title: parsed.variantTitle,
        description: parsed.variantDescription,
        generatedTitle: parsed.variantGeneratedTitle,
        generatedDescription: parsed.variantGeneratedDescription,
        processing: parsed.variantProcessing,
      },
      {
        generatedTitle: "variantGeneratedTitle",
        generatedDescription: "variantGeneratedDescription",
        processing: "variantProcessing",
      },
    );
    // `undefined` when the field is absent; a value (or `null`, which
    // clears) when it is named.
    const imageQuality =
      parsed.imageQuality === undefined
        ? undefined
        : imageQualityInput(parsed.imageQuality, "imageQuality");
    proposals = {
      source: metadataSource ?? null,
      fields,
      variant,
      ...(imageQuality === undefined ? {} : { imageQuality }),
      any: Boolean(
        Object.keys(fields).length ||
        Object.keys(variant).length ||
        imageQuality !== undefined,
      ),
    };
  } catch (error) {
    throw invalidMetadata(error);
  }

  return {
    sessionId,
    planId,
    targetIds,
    originalName,
    sha256,
    byteSize,
    contentType: contentType ?? null,
    captureId,
    source: source ?? null,
    role: role ?? null,
    progressionFrames:
      role === "progression" ? (progressionFrames ?? null) : null,
    plan,
    stage: stage ?? null,
    proposals,
  };
}

/**
 * The roles an upload may declare: an image of a capture's history
 * (`progression`, `VARIANT_ROLES`) or the image of a multi-night plan
 * (`plan`, a capture of its own).
 */
export const UPLOAD_ROLES = Object.freeze([...VARIANT_ROLES, "plan"]);
const PLAN_RENDERS = new Set([
  "natural",
  "dualband",
  "polished",
  "hoo",
  "none",
]);
const PLAN_FIELDS = [
  "projectId",
  "combinedNightIds",
  "totalsByFilter",
  "planRender",
];

/**
 * The image of a multi-night plan — `role: "plan"` with `projectId`,
 * never `captureId`, `sessionId` nor `planId` (it belongs to no night) —
 * and what it combines: the nights (`combinedNightIds`), its total by
 * filter (`totalsByFilter`) and its render (`planRender`). Those fields
 * come only with the role. Answers `null` for any other upload.
 */
function parsePlanImage(parsed, { role, captureId, sessionId, planId }) {
  const given = PLAN_FIELDS.filter(
    (key) => parsed[key] !== undefined && parsed[key] !== null,
  );
  if (role !== "plan") {
    if (given.length)
      throw invalid(`${given.join(", ")} come only with role plan.`);
    return null;
  }
  const projectId = nullableUuid(parsed.projectId, "projectId");
  if (!projectId)
    throw invalid(
      "The image of a multi-night plan names its plan (projectId).",
    );
  if (captureId || sessionId || planId)
    throw invalid(
      "The image of a multi-night plan belongs to no night: no captureId, sessionId nor planId.",
    );
  const nights = parsed.combinedNightIds ?? [];
  if (!Array.isArray(nights) || nights.length > 100)
    throw invalid("combinedNightIds holds at most 100 nights.");
  const combinedNightIds = [
    ...new Set(nights.map((id) => nullableUuid(id, "combinedNightIds"))),
  ].filter(Boolean);
  const totals = parsed.totalsByFilter ?? [];
  if (!Array.isArray(totals) || totals.length > 40)
    throw invalid("totalsByFilter holds at most 40 filters.");
  const totalsByFilter = totals.map((total) => {
    if (!total || typeof total !== "object" || Array.isArray(total))
      throw invalid("A line of totalsByFilter is an object.");
    for (const key of Object.keys(total))
      if (!["filter", "frameCount", "totalSeconds"].includes(key))
        throw invalid(`totalsByFilter: unexpected property "${key}".`);
    const { filter = null, frameCount, totalSeconds } = total;
    if (
      filter !== null &&
      (typeof filter !== "string" || filter.length < 1 || filter.length > 40)
    )
      throw invalid("totalsByFilter.filter is null or 1 to 40 characters.");
    if (
      typeof totalSeconds !== "number" ||
      !Number.isFinite(totalSeconds) ||
      totalSeconds < 0 ||
      totalSeconds > 100_000_000
    )
      throw invalid("totalsByFilter.totalSeconds is a number of seconds.");
    if (
      frameCount !== undefined &&
      (!Number.isInteger(frameCount) ||
        frameCount < 0 ||
        frameCount > 100_000_000)
    )
      throw invalid("totalsByFilter.frameCount is a whole number.");
    return {
      filter,
      ...(frameCount === undefined ? {} : { frameCount }),
      totalSeconds,
    };
  });
  const render = parsed.planRender ?? null;
  if (render !== null && !PLAN_RENDERS.has(render))
    throw invalid("planRender is natural, dualband, polished, hoo or none.");
  return { projectId, combinedNightIds, totalsByFilter, render };
}

/**
 * What a resumable upload keeps of its declared metadata until it completes
 * (`upload_sessions.metadata_json`): the proposals when there are any, and
 * the role and the frames of a progression image.
 */
function sessionMetadata(declared) {
  const progression = declared.role
    ? { role: declared.role, progressionFrames: declared.progressionFrames }
    : {};
  // The image of a multi-night plan keeps its plan's fields.
  const plan = declared.plan ? { plan: declared.plan } : {};
  // The rule that picked the capture of the session and target (`replace`
  // or `add`), kept until the upload completes.
  const sessionRule = declared.sessionRule
    ? { sessionRule: declared.sessionRule }
    : {};
  if (!declared.proposals.any && !declared.role && !declared.sessionRule)
    return null;
  return { ...declared.proposals, ...progression, ...plan, ...sessionRule };
}

/**
 * The source the proposals of an upload carry — the one declared
 * (`astro-sync`, `import`), else `astro-sync` for Astro Sync's token or an
 * image of Astro Sync; the web session proposes nothing (its owner writes
 * on the detail), and a device without a producer's source is refused.
 */
export function proposalSourceFor(caller, declared) {
  const proposals = declared?.proposals;
  if (!proposals?.any) return null;
  if (caller?.kind !== "device")
    throw invalidMetadata(
      new MetadataError(
        proposals.imageQuality !== undefined &&
          !Object.keys(proposals.fields).length &&
          !Object.keys(proposals.variant).length
          ? "imageQuality"
          : "metadataSource",
        null,
        "The web session writes a capture's metadata on its detail, not at its upload.",
      ),
    );
  // The quality of the stacked image is a producer's measure: the
  // phone (the planner's token) never sends it.
  if (proposals.imageQuality !== undefined && caller.application === "planner")
    throw invalidMetadata(
      new MetadataError(
        "imageQuality",
        null,
        "The phone does not send the quality of an image: Astro Sync measures it.",
      ),
    );
  if (proposals.source) return proposals.source;
  if (
    caller.application === "sync" ||
    ["astro-sync", "stacking"].includes(declared.source)
  )
    return "astro-sync";
  throw invalidMetadata(
    new MetadataError(
      "metadataSource",
      null,
      "Proposed metadata carries its producer: metadataSource is astro-sync or import.",
    ),
  );
}

/** The stages an upload may ask for (a device's is always a draft). */
const CAPTURE_UPLOAD_STAGES = new Set(["draft", "finalized"]);

/**
 * Who sends: `{ kind: "device", application }` for a device token
 * (`application`: `planner`, `sync` or none), `{ kind: "web" }` for a web
 * session. A device's upload is a draft, private; the web's is finalized,
 * private (only the web makes a capture public).
 */
const WEB_CALLER = Object.freeze({ kind: "web" });

export function stageFor(caller, declared = null) {
  if (caller?.kind === "device") return "draft";
  // The web session may ask for a draft (its add box always does).
  return declared === "draft" ? "draft" : "finalized";
}

/**
 * The source an image records: always `web` from a web session; from a
 * device, the one it declares (`phone`, `astro-sync`, `stacking`; never
 * `web`), else `astro-sync` for Astro Sync and `phone` otherwise.
 */
export function sourceFor(caller, declared = null) {
  if (caller?.kind !== "device") return "web";
  if (declared === "web")
    throw invalid("A device does not send an image as the web.");
  if (declared) return declared;
  return caller.application === "sync" ? "astro-sync" : "phone";
}

function statusForCode(code) {
  switch (code) {
    case "capture_limit_reached":
    case "capture_variant_limit_reached":
    case "storage_quota_reached":
    case "main_image":
      return 409;
    case "capture_not_found":
      return 404;
    case "file_too_large":
      return 413;
    case "plan_not_found":
    case "target_not_found":
    case "session_not_found":
    case "upload_not_found":
      return 404;
    case "upload_offset_mismatch":
    case "upload_incomplete":
    case "upload_capture_gone":
      return 409;
    case "upload_hash_mismatch":
      return 422;
    default:
      return 400;
  }
}

/** Turns any error this module's dependencies can throw into an `UploadResourceError`. */
function apiError(error, storage) {
  if (error instanceof UploadResourceError) return error;
  if (
    error instanceof CaptureRepositoryError ||
    error instanceof CaptureStorageError ||
    error instanceof UploadSessionRepositoryError ||
    error instanceof MultipartError
  )
    return new UploadResourceError(error.code, error.message, {
      status: error.status || statusForCode(error.code),
      storage:
        error.code === "capture_limit_reached" ||
        error.code === "storage_quota_reached" ||
        error.code === "file_too_large"
          ? storage
          : null,
      ...(error.offset !== undefined ? { offset: error.offset } : {}),
    });
  return new UploadResourceError(
    "capture_storage_unavailable",
    "Capture storage is unavailable.",
    { status: 503 },
  );
}

function requiredIdentifier(value, label) {
  const result = String(value || "").trim();
  if (!result) throw invalid(`${label} is required.`);
  return result;
}

/** A non-negative integer setting, or its default when unset or invalid. */
function settingFromEnv(name, fallback, { allowZero = false } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || (!allowZero && value === 0))
    return fallback;
  return Math.floor(value);
}

/**
 * Every capability/entitlement gate a byte-accepting write must pass,
 * factored out so the legacy single-request upload, the resumable
 * protocol's create step, and its finalize step all refuse the exact same
 * way at the exact same numbers (finalize "passes through the same path
 * as the existing simple upload — capture creation, quota,
 * entitlement_read_only"). Decided from a declared byte size alone, so
 * every caller can run this before a single byte is read or written.
 *
 * Relational validation of `planId`/`targetIds` is deliberately a second,
 * separate step (`checkRelationalLinks` below): finalize re-runs it too
 * (a target could have been deleted since create), but a `plan_not_found`/
 * `target_not_found` there must not shadow a `storage_quota_reached` this
 * function would have thrown first, matching this contract's fixed refusal
 * order (api/v1.md, "Uploads and captures").
 *
 * `held` is what the space's unfinished resumable uploads already hold on
 * disk -- their received bytes and their number -- leaving out the one that
 * carries these same bytes: they count in the quota like stored captures,
 * and in the number of captures, so a space cannot keep more than its quota
 * (or its three captures) in uploads it never finishes. `storage.usedBytes`
 * and `storage.captureCount` report both.
 *
 * After the read-only gate and before the quota, the captures the space
 * holds, plus its uploads in progress, plus this one, may not exceed
 * `capture.count_limit` (`409 capture_limit_reached`). A file the space
 * already holds (the deduplication by SHA-256) is never counted twice. A
 * space over its limit (its capabilities having changed) keeps every capture and
 * only cannot add one until it is under the limit.
 */
async function checkWriteGates({
  provider,
  store,
  tenant,
  normalizedUserId,
  declaredByteSize,
  declaredSha256 = null,
  captureId = null,
  role = null,
  // The image takes the place of the capture's main image
  // (`capture.variant_limit` = 0): no image beyond the main one is added, and
  // the bytes it replaces are released from the quota.
  replaces = false,
  held = { receivedBytes: 0, count: 0, captures: 0 },
}) {
  // Read-only write gate: checked ahead of the capability refusals
  // below, and independently of them.
  const writeAccess = await resolveWriteAccess(provider, normalizedUserId);
  if (writeAccess.readOnly)
    throw new UploadResourceError(
      "entitlement_read_only",
      "This account's subscription has ended: new uploads are suspended; existing captures remain readable and exportable.",
      { status: 403 },
    );

  const caps = await provider.capabilitiesFor(normalizedUserId);
  const quotaBytes = Number(caps["storage.quota_bytes"]) || 0;
  const maxFileBytes = Number(caps["storage.max_file_bytes"]) || 0;
  const captureCountLimit = captureCountLimitOf(caps);
  const variantLimit = variantLimitOf(caps);
  const usedBytes = (await store.usedBytes(tenant)) + held.receivedBytes;
  const captureCount =
    (await store.captureCount(tenant)) + (held.captures ?? held.count ?? 0);
  const storage = {
    usedBytes,
    quotaBytes,
    maxFileBytes,
    captureCount,
    captureCountLimit,
    variantLimit,
  };

  // Bytes the space already holds, as any image of any of its captures,
  // are « already present »: nothing is stored, nothing counted, never
  // refused for a limit.
  const present = declaredSha256
    ? await store.findVariantBySha256(tenant, declaredSha256)
    : null;
  if (present) return { storage, maxFileBytes, present };

  // Capability refusals: the number (of captures, or of a capture's
  // images), then the quota, then the per-file size -- the order
  // api/v1.md's "Uploads and captures" section requires.
  let freedBytes = 0;
  if (captureId) {
    // An image added to an existing capture of the space; the images
    // beyond the main one may not exceed `capture.variant_limit` (`0`:
    // the main image only).
    const target = await store.getCaptureById(tenant, captureId);
    if (!target)
      throw new UploadResourceError(
        "capture_not_found",
        "The capture was not found.",
        { status: 404 },
      );
    const variantCount = await store.alternativeCount(tenant, captureId);
    storage.variantCount = variantCount;
    if (replaces && target.sha256 !== null) freedBytes = target.byteSize ?? 0;
    // The first image of a capture without one is its main image, not an
    // image beyond it: the limit does not count it. Nor a progression image,
    // the history of the capture. Nor an image that replaces the main one.
    if (
      target.sha256 !== null &&
      !role &&
      !replaces &&
      !isUnlimitedCapability(variantLimit) &&
      variantCount + 1 > variantLimit
    )
      throw new UploadResourceError(
        "capture_variant_limit_reached",
        "This capture holds as many images as its profile allows.",
        { status: 409, storage },
      );
  } else if (
    !isUnlimitedCapability(captureCountLimit) &&
    captureCount + 1 > captureCountLimit
  )
    throw new UploadResourceError(
      "capture_limit_reached",
      "This space holds as many captures as its profile allows.",
      { status: 409, storage },
    );
  if (quotaBytes <= 0 || usedBytes - freedBytes + declaredByteSize > quotaBytes)
    throw new UploadResourceError(
      "storage_quota_reached",
      "Hosted media storage is not available for this account.",
      { status: 409, storage },
    );
  if (maxFileBytes <= 0 || declaredByteSize > maxFileBytes)
    throw new UploadResourceError(
      "file_too_large",
      "This file exceeds the per-file limit.",
      { status: 413, storage },
    );
  return { storage, maxFileBytes, present: null };
}

/**
 * The refusals the pre-check (`POST /v1/uploads/check`) answers as
 * `refused` with their numbers rather than as an error: the same
 * codes, in the same order, as the upload itself.
 */
const PRE_CHECK_REFUSALS = new Set([
  "entitlement_read_only",
  "capture_limit_reached",
  "capture_variant_limit_reached",
  "storage_quota_reached",
  "file_too_large",
]);

/** `403 capture_public_unavailable` unless the profile carries `capture.public`. */
async function requirePublicCapability(provider, userId) {
  const caps = await provider.capabilitiesFor(
    userId === null || userId === undefined
      ? null
      : requiredIdentifier(userId, "User id"),
  );
  if (caps["capture.public"] !== true)
    throw new UploadResourceError(
      "capture_public_unavailable",
      "A capture of this space cannot be made public.",
      { status: 403 },
    );
}

/**
 * `capture.count_limit` as a number: `0` no allowance, the unlimited
 * sentinel no cap. A profile that does not carry the key at all (a
 * hand-made one) sets no cap, like `planLimitIsUnlimited` for the plans.
 */
function captureCountLimitOf(capabilities) {
  const value = capabilities["capture.count_limit"];
  if (value === undefined || value === null) return CAPABILITY_UNLIMITED;
  return Math.max(0, Math.floor(Number(value)) || 0);
}

/**
 * `capture.variant_limit` as a number: the images a capture may hold
 * beyond its main one, `0` none, the unlimited sentinel no cap; a
 * profile without the key sets none.
 */
export function variantLimitOf(capabilities) {
  const value = capabilities["capture.variant_limit"];
  if (value === undefined || value === null) return CAPABILITY_UNLIMITED;
  return Math.max(0, Math.floor(Number(value)) || 0);
}

/**
 * The resumable protocol's response envelope (`api/uploads.md`), shared
 * verbatim by the create, `PUT`, `GET` and finalize handlers so a client
 * never has to parse four different shapes for the same underlying
 * resource. `expiresAt` is meaningful only while still in progress — a
 * completed session's row is not subject to the 72-hour expiry (migration
 * 25's own comment), so it reports `null` rather than a stale value.
 */
function uploadEnvelope(session) {
  return {
    uploadId: session.id,
    offset: session.offset,
    byteSize: session.byteSize,
    chunkSize: session.chunkSize,
    completed: session.state === "completed",
    expiresAt: session.state === "completed" ? null : session.expiresAt,
    ...(session.captureId ? { captureId: session.captureId } : {}),
  };
}

/** Every `{id}` route's shared first step: load the session, or silently purge and report "not found" if its 72-hour window has already passed — a client sees the same 404 whether the row still physically exists or not. */
async function purgeIfExpiredOrGet(
  sessionStore,
  tenant,
  uploadId,
  nowIso,
  files,
) {
  const session = await sessionStore.get(tenant, uploadId);
  if (!session) return null;
  if (session.state === "in_progress" && session.expiresAt <= nowIso) {
    await files.discard({ tenantId: tenant, uploadId: session.id });
    await sessionStore.deleteRow(tenant, session.id);
    return null;
  }
  return session;
}

/**
 * The optional `planId`/`sessionId`/`targetIds` links, within the tenant.
 * See `checkWriteGates`'s own comment on why this is a separate step. The
 * session is checked here, before anything is written: another space's
 * session answers exactly like one that exists nowhere,
 * `404 session_not_found`.
 */
async function checkRelationalLinks({
  store,
  tenant,
  planId,
  sessionId = null,
  targetIds,
}) {
  if (planId) {
    const plan = await store.findPlan(tenant, planId);
    if (!plan)
      throw new UploadResourceError(
        "plan_not_found",
        "The plan was not found.",
        { status: 404 },
      );
  }
  if (sessionId && !(await store.findObservationSession(tenant, sessionId)))
    throw new UploadResourceError(
      "session_not_found",
      "The session was not found.",
      { status: 404 },
    );
  if (targetIds.length) {
    const found = new Set(await store.existingTargetIds(targetIds, tenant));
    if (targetIds.some((targetId) => !found.has(targetId)))
      throw new UploadResourceError(
        "target_not_found",
        "One or more targets were not found.",
        { status: 404 },
      );
  }
}

/**
 * Framework-free v1 upload/capture service, on the pattern of
 * `createPlanResourceService` (`api/plan-resources.js`): a route adapter
 * supplies authenticated identity and a raw request body, and turns the
 * returned value or thrown `UploadResourceError` into HTTP.
 *
 * Methods:
 * - receiveUpload({ tenantId, userId, contentType, bodyChunks }) -> { status, body }
 * - listCaptures({ tenantId, userId, since, limit, targetId, skySolution, order, before }) -> list body
 * - capabilitiesFor(userId) -> the composed capability map
 */
export async function createUploadResourceService({
  repository = null,
  uploadSessionRepository = null,
  databasePath,
  databaseUrl,
  driver,
  dialect,
  entitlementProvider = null,
  capabilities = OPEN_SOURCE_PROFILE,
  now = () => new Date().toISOString(),
  idGenerator = randomUUID,
  maxMetadataBytes = 65536,
  chunkSizeBytes = defaultUploadChunkBytes(),
  maxOpenUploadSessions = settingFromEnv(
    "ASTRO_PORTAL_UPLOAD_MAX_OPEN_SESSIONS",
    32,
  ),
  purgeIntervalMs = settingFromEnv(
    "ASTRO_PORTAL_UPLOAD_PURGE_INTERVAL_MS",
    3_600_000,
    { allowZero: true },
  ),
  // Told of every capture an upload created (never of a deduplicated
  // replay), to queue its thumbnail and its automatic check. It must not
  // wait for that work: the answer is sent first.
  onCaptureCreated = null,
  // The delay of the notice of « vérification non passée », for the date a
  // listed capture says its protection is lifted.
  noticeDays = DEFAULT_CHECK_NOTICE_DAYS,
  // Whether a team checks the captures (a function, read at each use, or a
  // boolean; `captureState`): without one no protection is ever lifted later.
  moderated = true,
  // Where the bytes go (`uploads/capture-store.js`); the service's
  // store, read at each use, unless one is given.
  captureStore: givenCaptureStore = null,
  // Whether the multi-night plans of Astro Sync are active
  // for a person (always on a private server): the image of a multi-night plan needs
  // them.
  multiNightActive = async () => false,
  // Told of every capture an upload created or filled,
  // once it is written — it may have joined a session, whose lines the
  // service then fills without a touch (`capture-lines-sync.js`, wired by
  // the route adapter: this module is loaded by `server.mjs`, which must
  // not reach the night's computation). Never awaited for its failure.
  onCapturePlaced = null,
  // The lines a night's steps give a capture that has none of its own,
  // `(tenantId, sessionId, targetIds) => lines`, for the summary of its card
  // (wired by the route adapter, for the same reason).
  nightLinesFor = null,
} = {}) {
  const files = () => givenCaptureStore || captureStore();
  // Resolved once, up front, so the capture repository and the resumable
  // upload-session repository below always share the SAME connection when
  // neither was independently injected (finalize touches both tables and
  // wants one connection, not two racing ones) — the pattern
  // `capture-repository.js` itself already falls back to when given no
  // driver at all.
  const resolvedDriver =
    driver ||
    (databaseUrl || databasePath
      ? createDatabaseDriver({ databasePath, databaseUrl })
      : null);
  // Both repositories below are always handed this driver explicitly, so
  // neither one's own internal "did I create this?" flag ever fires; this
  // service is the one that decides whether it must close it.
  const ownsResolvedDriver = !driver && Boolean(resolvedDriver);
  const resolvedDialect =
    dialect || resolvedDriver?.dialect || (databaseUrl ? "postgres" : "sqlite");
  const store =
    repository ||
    (await createCaptureRepository({
      driver: resolvedDriver,
      dialect: resolvedDialect,
      databasePath,
      databaseUrl,
    }));
  const sessions =
    uploadSessionRepository ||
    (resolvedDriver
      ? await createUploadSessionRepository({
          driver: resolvedDriver,
          dialect: resolvedDialect,
        })
      : null);
  const provider = entitlementProvider || staticProfile(capabilities);
  // Whether the main image of a listed capture has its sky solution.
  const skies = resolvedDriver
    ? await createSkySolutionRepository({ driver: resolvedDriver })
    : null;

  /**
   * The end of the block on publishing of a person (after four warnings),
   * `null` for a person with none or a database without them.
   */
  async function publishingBlockedUntil(userId) {
    if (!resolvedDriver || !userId) return null;
    try {
      const row = (
        await resolvedDriver.query(
          "SELECT publishing_blocked_until FROM users WHERE id = ?",
          [String(userId)],
        )
      ).rows[0];
      return row?.publishing_blocked_until ?? null;
    } catch {
      return null;
    }
  }

  /** Queues the processing of a capture the upload created, never twice. */
  function queueCreated(tenantId, result) {
    if (!result?.created || typeof onCaptureCreated !== "function") return;
    try {
      onCaptureCreated(tenantId, result.capture);
    } catch {
      // The processing is taken again later; the upload has succeeded.
    }
  }

  /**
   * The image of a multi-night plan needs the multi-night plans of Astro
   * Sync (`403 multi_night_not_active`, always on a private server) and a
   * plan of the space (`404 project_not_found`). Checked before the
   * limits: the refusal says what is missing first.
   */
  async function checkPlanImage(tenant, userId, plan) {
    if (!plan) return;
    if (!(await multiNightActive(userId))) {
      const refusal = new UploadResourceError(
        "multi_night_not_active",
        "The multi-night plans of Astro Sync need a right this space does not hold: the image of the plan is not received.",
        { status: 403 },
      );
      // The capability that lifts it, as `403 capability_required` names it.
      refusal.body.capability = "analysis.progression";
      throw refusal;
    }
    const project = resolvedDriver
      ? (
          await resolvedDriver.query(
            "SELECT id FROM projects WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
            [plan.projectId, tenant],
          )
        ).rows[0]
      : null;
    if (!project)
      throw new UploadResourceError(
        "project_not_found",
        "The project was not found.",
        { status: 404 },
      );
  }

  function requireSessions() {
    if (!sessions)
      throw Object.assign(
        new Error("Resumable upload storage is unavailable."),
        { code: "capture_storage_unavailable", status: 503 },
      );
    return sessions;
  }

  /** `part_path` for a brand new session — deterministic from `(tenant, id)`, matching `uploadPartPathFor` (the staging of every store, `capture-storage.js` `diskStaging`). Not re-derived anywhere else; see migration 25's own comment. */
  function partPathFor(tenant, id) {
    return files().stagedPathOf({ tenantId: tenant, uploadId: id });
  }

  /**
   * What the space's unfinished uploads hold: their received bytes and
   * their number, leaving out the one that carries these same bytes
   * (`sha256`): resuming or finishing a file never counts it twice.
   */
  async function heldUploads(tenant, nowIso, sha256 = null) {
    if (!sessions) return { receivedBytes: 0, count: 0 };
    const same = sha256 ? await sessions.findBySha256(tenant, sha256) : null;
    return await sessions.openUploads(tenant, nowIso, { excludeId: same?.id });
  }

  async function purgeExpired(asOf) {
    const sessionStore = requireSessions();
    const expired = await sessionStore.purgeExpired(asOf);
    for (const session of expired)
      await files().discard({
        tenantId: session.tenantId,
        uploadId: session.id,
      });
    return expired.length;
  }

  // The sweep of abandoned uploads runs along the upload requests, at most
  // once per `purgeIntervalMs` — no timer: a timer would keep an idle
  // service awake, or delay a clean stop. The service also sweeps
  // once at startup (`portal-app/lib/upload-maintenance.server.js`).
  let lastSweepAt = Number.NEGATIVE_INFINITY;
  let sweeping = null;
  async function sweepAlongRequests() {
    if (!sessions || sweeping) return;
    const nowMs = Date.now();
    if (nowMs - lastSweepAt < purgeIntervalMs) return;
    lastSweepAt = nowMs;
    sweeping = purgeExpired(now())
      .catch(() => 0)
      .finally(() => {
        sweeping = null;
      });
    await sweeping;
  }

  /**
   * Which capture an upload that names none belongs to.
   *
   * 1. An upload without a session but with a target and a night (its plan's
   *    date) joins the session of that `eveningDate` that carries the
   *    target; else it stays without one — no session is invented for a
   *    capture.
   * 2. A night and a target for which the space holds a capture without
   *    an image (a definition made on the web) fills that capture: its image
   *    becomes its main image, instead of a second capture of the same night
   *    and target being created.
   * 3. **One capture per session and target**. A capture of that session and
   *    target that already has an image takes the new one:
   *    `capture.variant_limit` = 0 replaces its image; above 0 (or unlimited)
   *    the image is added, the main one when it comes from Astro Sync, with
   *    the former one kept as a variant. The capability is read, never an
   *    offer's name. The image of a multi-night plan and the progression
   *    images are outside the rule.
   */
  async function adoptDefinition(tenant, declared, userId = null) {
    // The image of a multi-night plan is never a night's capture.
    if (declared.plan) return;
    if (declared.captureId || !declared.targetIds?.length) return;
    if (!declared.sessionId && !declared.role && declared.planId) {
      const session = await store.findSessionOfNight(tenant, {
        planId: declared.planId,
        targetIds: declared.targetIds,
      });
      if (session) {
        declared.sessionId = session.id;
        declared.planId = session.planId ?? declared.planId;
      }
    }
    const definition = await store.findDefinitionFor(tenant, {
      sessionId: declared.sessionId ?? null,
      targetIds: declared.targetIds,
    });
    if (definition) {
      declared.captureId = definition.id;
      return;
    }
    if (declared.role || !declared.sessionId || declared.targetIds.length !== 1)
      return;
    const held = await store.findCaptureWithImageFor(tenant, {
      sessionId: declared.sessionId,
      targetId: declared.targetIds[0],
    });
    if (!held) return;
    const limit = variantLimitOf(
      await provider.capabilitiesFor(userId ?? null),
    );
    declared.captureId = held.id;
    declared.sessionRule = limit === 0 ? "replace" : "add";
  }

  /** Where the rule of one capture per session and target puts the image. */
  function placementOf(declared) {
    if (declared.sessionRule === "replace") return "replace";
    if (
      declared.sessionRule === "add" &&
      ["astro-sync", "stacking"].includes(declared.source)
    )
      return "main";
    return "variant";
  }

  /**
   * Writes what an upload brings: a new capture with its main image, or,
   * with `captureId`, an alternative image of that capture; the bytes the
   * space already holds write nothing. Queues the processing of a new
   * image.
   */
  async function storeUpload({
    tenant,
    declared,
    byteSize,
    caller,
    userId = null,
    originClientInstanceId = null,
  }) {
    const result = await writeUpload({
      tenant,
      declared,
      byteSize,
      caller,
      userId,
      originClientInstanceId,
    });
    // A capture that arrived on a session reads its lines from the night
    // without anyone asking.
    if (
      typeof onCapturePlaced === "function" &&
      result.created &&
      (result.capture.sessionId || result.capture.projectId)
    )
      try {
        await onCapturePlaced(tenant, result.capture.id);
      } catch {
        // « Synchroniser avec la session » asks again.
      }
    return result;
  }

  async function writeUpload({
    tenant,
    declared,
    byteSize,
    caller,
    userId = null,
    originClientInstanceId = null,
  }) {
    const createdAt = now();
    if (declared.captureId) {
      const result = await store.addVariant({
        id: idGenerator(),
        tenantId: tenant,
        captureId: declared.captureId,
        sha256: declared.sha256,
        byteSize,
        originalName: declared.originalName,
        source: declared.source ?? sourceFor(caller),
        role: declared.role ?? null,
        frameCount: declared.progressionFrames ?? null,
        targetIds: declared.targetIds,
        createdAt,
        originClientInstanceId: originClientInstanceId || null,
        placement: placementOf(declared),
      });
      if (!result)
        throw new UploadResourceError(
          "capture_not_found",
          "The capture was not found.",
          { status: 404 },
        );
      // The bytes an image replaced leave the store (the digest is the key:
      // one file per image, so nothing else points at it).
      // The task that deletes them was written with the rows; a store that
      // does not answer leaves it for the hourly maintenance.
      if (result.replaced)
        await store
          .fileDeletions?.({ files })
          ?.attempt({ tenantId: tenant, digests: [result.replaced.sha256] });
      // The first image of a capture without one is its main image:
      // processed like the main image of a new capture.
      if (result.created && result.variant.main) queueCreated(tenant, result);
      else if (result.created)
        queueVariant(tenant, result.capture, result.variant);
      const skipped = await applyUploadProposals(
        tenant,
        result.capture.id,
        result.variant?.id ?? null,
        declared.proposals,
        userId,
      );
      return { ...result, kind: "variant", skipped };
    }
    const result = await store.insertCaptureWithTargets({
      id: idGenerator(),
      tenantId: tenant,
      sessionId: declared.sessionId,
      planId: declared.planId,
      targetIds: declared.targetIds,
      originalName: declared.originalName,
      sha256: declared.sha256,
      byteSize,
      status: "uploaded",
      stage: stageFor(caller, declared.stage),
      source: declared.source ?? sourceFor(caller),
      variantId: idGenerator(),
      createdAt,
      originClientInstanceId: originClientInstanceId || null,
      // The image of a multi-night plan, attached to its plan.
      ...(declared.plan
        ? {
            projectId: declared.plan.projectId,
            plan: {
              combinedNightIds: declared.plan.combinedNightIds,
              totalsByFilter: declared.plan.totalsByFilter,
              render: declared.plan.render,
            },
          }
        : {}),
    });
    queueCreated(tenant, result);
    const mainImage = result.created
      ? (await store.listVariants(tenant, result.capture.id)).find(
          (image) => image.main,
        )
      : null;
    const skipped = await applyUploadProposals(
      tenant,
      result.capture.id,
      mainImage?.id ?? null,
      declared.proposals,
      userId,
    );
    return { ...result, kind: "capture", skipped };
  }

  /**
   * The proposals of an upload —
   * the capture's fields, and the title and description of the image sent
   * — applied under their source, never over what the owner wrote; what
   * was left comes back in `skipped`.
   */
  async function applyUploadProposals(
    tenant,
    captureId,
    imageId,
    proposals,
    userId = null,
  ) {
    if (!proposals?.any || !proposals.source) return [];
    const skipped = [];
    // The quality of the stacked image, kept under the capability
    // `analysis.logs` — without it the image is stored all the same and
    // the field is listed as skipped; read without a capability.
    if (imageId && proposals.imageQuality !== undefined) {
      const granted = await provider.capabilitiesFor(userId ?? null);
      if (granted?.["analysis.logs"])
        await store.writeVariantQuality(
          tenant,
          captureId,
          imageId,
          proposals.imageQuality,
        );
      else skipped.push({ field: "imageQuality", reason: "capability" });
    }
    if (Object.keys(proposals.fields || {}).length) {
      const row = await store.captureRow?.(tenant, captureId);
      if (row)
        skipped.push(
          ...(
            await recordProposals({
              store,
              tenantId: tenant,
              capture: row,
              input: { source: proposals.source, fields: proposals.fields },
              at: now(),
              userId,
            })
          ).skipped,
        );
    }
    if (imageId && Object.keys(proposals.variant || {}).length)
      skipped.push(
        ...(await recordVariantProposal({
          store,
          tenantId: tenant,
          captureId,
          imageId,
          texts: proposals.variant,
          source: proposals.source,
        })),
      );
    // What made the image sent: kept with it, and shown by the capture while
    // it is the main one (the capture's own `processing`, when the same upload
    // carries it, was applied above).
    if (imageId && proposals.variant?.processing)
      skipped.push(
        ...(
          await recordVariantProcessing({
            store,
            tenantId: tenant,
            captureId,
            imageId,
            processing: proposals.variant.processing,
            source: proposals.source,
            at: now(),
            userId,
            toCapture: !proposals.fields?.processing,
          })
        ).skipped,
      );
    return skipped;
  }

  /** The storage after a write: the new bytes, and a new capture counted. */
  function grownStorage(storage, result, byteSize) {
    const grown = {
      ...storage,
      usedBytes:
        storage.usedBytes +
        (result.created ? byteSize : 0) -
        (result.replaced ? Number(result.replaced.byte_size) || 0 : 0),
      captureCount:
        storage.captureCount +
        (result.created && result.kind === "capture" ? 1 : 0),
    };
    if (result.kind === "variant" && grown.variantCount !== undefined)
      grown.variantCount += result.created && !result.replaced ? 1 : 0;
    return grown;
  }

  /** Queues the processing of a new alternative image (its thumbnail, its check). */
  function queueVariant(tenantId, capture, variant) {
    if (typeof onCaptureCreated !== "function") return;
    try {
      onCaptureCreated(tenantId, capture, { variant });
    } catch {
      // The processing is taken again later; the upload has succeeded.
    }
  }

  return {
    async close() {
      await store.close?.();
      await sessions?.close?.();
      if (ownsResolvedDriver) await resolvedDriver.close();
    },

    async capabilitiesFor(userId) {
      return { ...(await provider.capabilitiesFor(userId ?? null)) };
    },

    /**
     * `bodyChunks` is any async-iterable of `Buffer`/`Uint8Array` (a Node
     * `Readable`, or a Web `ReadableStream`'s async iterator) — this package
     * never imports a Next.js/web-platform type, per the same framework
     * neutrality `plan-resources.js` keeps. There is no `originDeviceId`
     * parameter: migration 17's `captures` table carries no such column (only
     * `session_events`/`session_supplements` do), so a route adapter's device
     * id, if any, is simply not threaded through here.
     */
    async receiveUpload({
      tenantId,
      userId,
      contentType,
      bodyChunks,
      originClientInstanceId = null,
      caller = WEB_CALLER,
    }) {
      const tenant = requiredIdentifier(tenantId, "Tenant id");
      const normalizedUserId =
        userId === null || userId === undefined
          ? null
          : requiredIdentifier(userId, "User id");

      let declared = null;
      let storage = null;
      let sink = null;
      let head = Buffer.alloc(0);
      let headChecked = false;
      await sweepAlongRequests();

      try {
        await readTwoPartUpload(bodyChunks, contentType, {
          maxMetadataBytes,
          onMetadata: async (text) => {
            declared = parseUploadMetadata(text);
            await adoptDefinition(tenant, declared, normalizedUserId);
            declared.source = sourceFor(caller, declared.source);
            declared.proposals.source = proposalSourceFor(caller, declared);

            await checkPlanImage(tenant, normalizedUserId, declared.plan);
            const gate = await checkWriteGates({
              provider,
              store,
              tenant,
              normalizedUserId,
              declaredByteSize: declared.byteSize,
              declaredSha256: declared.sha256,
              captureId: declared.captureId,
              role: declared.role,
              replaces: declared.sessionRule === "replace",
              held: await heldUploads(tenant, now(), declared.sha256),
            });
            storage = gate.storage;

            await checkRelationalLinks({
              store,
              tenant,
              planId: declared.planId,
              sessionId: declared.sessionId,
              targetIds: declared.targetIds,
            });

            // Only now does anything touch disk.
            sink = files().sink({
              tenantId: tenant,
              sha256: declared.sha256,
              maxBytes: gate.maxFileBytes,
            });
          },
          onFileChunk: async (chunk) => {
            if (!headChecked) {
              head = Buffer.concat([head, Buffer.from(chunk)]);
              if (head.length >= MEDIA_HEAD_BYTES) {
                headChecked = true;
                refuseActiveContent(head);
              }
            }
            await sink.write(chunk);
          },
        });
        if (!headChecked) refuseActiveContent(head);
        // The quota again, now that the bytes are here: an upload that
        // finished meanwhile (this one streamed for a while) cannot let two
        // requests each pass the check made before their first byte.
        storage = (
          await checkWriteGates({
            provider,
            store,
            tenant,
            normalizedUserId,
            declaredByteSize: declared.byteSize,
            declaredSha256: declared.sha256,
            captureId: declared.captureId,
            role: declared.role,
            replaces: declared.sessionRule === "replace",
            held: await heldUploads(tenant, now(), declared.sha256),
          })
        ).storage;
      } catch (error) {
        if (sink) await sink.abort();
        throw apiError(error, storage);
      }

      let written;
      try {
        written = await sink.finish();
      } catch (error) {
        throw apiError(error, storage);
      }

      try {
        // `declared.contentType` is accepted and validated above but not
        // persisted: migration 17's `captures` table (frozen) has no column
        // for it, and only migration 18's `capture_targets` was added
        // beside it. `contentType` is optional in capture.schema.json's
        // `capture` resource, so omitting it from the response is
        // contract-valid; a future migration would be needed to actually
        // store and echo it back.
        const result = await storeUpload({
          tenant,
          declared: { ...declared, sha256: written.sha256 },
          byteSize: written.byteSize,
          caller,
          userId: normalizedUserId,
          originClientInstanceId,
        });
        return {
          status: result.created ? 201 : 200,
          body: {
            capture: result.capture,
            ...(result.variant ? { variant: result.variant } : {}),
            deduplicated: result.deduplicated,
            replaced: Boolean(result.replaced),
            ...(result.deduplicated
              ? { targetsAdded: result.targetsAdded }
              : {}),
            ...(result.skipped?.length ? { skipped: result.skipped } : {}),
            storage: grownStorage(storage, result, written.byteSize),
          },
        };
      } catch (error) {
        throw apiError(error, storage);
      }
    },

    /**
     * `POST /v1/uploads` with a JSON body (`api/uploads.md`): the
     * resumable protocol's create step, sharing the same route as the
     * legacy multipart form above — a route adapter dispatches on
     * Content-Type. Idempotent on `(tenant, sha256)`, at two levels: bytes
     * already a finalized capture (either transport) answer `completed:
     * true` with that capture's id and never write a second row; bytes
     * already mid-transfer answer the session's current offset instead of
     * starting a competing one.
     */
    async createUpload({ tenantId, userId, caller = WEB_CALLER, ...body }) {
      const tenant = requiredIdentifier(tenantId, "Tenant id");
      const normalizedUserId =
        userId === null || userId === undefined
          ? null
          : requiredIdentifier(userId, "User id");
      const declared = parseUploadMetadataObject(body, "The request body");
      await adoptDefinition(tenant, declared, normalizedUserId);
      declared.source = sourceFor(caller, declared.source);
      declared.proposals.source = proposalSourceFor(caller, declared);
      await sweepAlongRequests();
      const nowIso = now();

      let storage = null;
      try {
        await checkPlanImage(tenant, normalizedUserId, declared.plan);
        const gate = await checkWriteGates({
          provider,
          store,
          tenant,
          normalizedUserId,
          declaredByteSize: declared.byteSize,
          declaredSha256: declared.sha256,
          captureId: declared.captureId,
          role: declared.role,
          replaces: declared.sessionRule === "replace",
          held: await heldUploads(tenant, nowIso, declared.sha256),
        });
        storage = gate.storage;
        await checkRelationalLinks({
          store,
          tenant,
          planId: declared.planId,
          sessionId: declared.sessionId,
          targetIds: declared.targetIds,
        });

        const sessionStore = requireSessions();

        // Already an image of the space — under either transport, of any
        // capture (answered before the first chunk). Union any
        // newly-declared targets onto its capture like a replay would, and
        // make sure this table has a `completed` row to answer future
        // `GET`/`POST` calls from, even if the capture predates this table.
        if (gate.present) {
          const existing = gate.present;
          const result = await store.insertCaptureWithTargets({
            id: idGenerator(),
            tenantId: tenant,
            sessionId: declared.sessionId,
            planId: declared.planId,
            targetIds: declared.targetIds,
            originalName: declared.originalName,
            sha256: declared.sha256,
            byteSize: existing.variant.byteSize,
            status: "uploaded",
            createdAt: nowIso,
          });
          const uploadId = idGenerator();
          const session = await sessionStore.recordExistingCapture(
            {
              id: uploadId,
              tenantId: tenant,
              sha256: declared.sha256,
              byteSize: existing.variant.byteSize,
              contentType: declared.contentType,
              sessionId: declared.sessionId,
              planId: declared.planId,
              targetIds: result.capture.targetIds,
              originalName: declared.originalName,
              chunkSize: chunkSizeBytes,
              partPath: partPathFor(tenant, uploadId),
            },
            result.capture.id,
            nowIso,
          );
          return {
            status: 200,
            body: {
              ...uploadEnvelope(session),
              present: true,
              imageId: existing.variant.id,
            },
          };
        }

        const existingSession = await sessionStore.findBySha256(
          tenant,
          declared.sha256,
        );
        if (existingSession) {
          const expired = existingSession.expiresAt <= nowIso;
          if (expired) {
            await files().discard({
              tenantId: tenant,
              uploadId: existingSession.id,
            });
            await sessionStore.deleteRow(tenant, existingSession.id);
          } else {
            if (existingSession.byteSize !== declared.byteSize)
              throw invalid(
                "This upload is already in progress with a different declared size.",
              );
            // The same bytes, now sent to another capture than the one the
            // first create named (that capture was removed, the plan was
            // sent again and made a new one): the upload goes where this
            // create says, with its role, its frames and its proposals; the
            // bytes received are kept. Without this, an upload aimed at a
            // capture that is gone stayed open for 72 hours and every new
            // sending of the image ended in `404 capture_not_found`.
            const aimed =
              existingSession.state === "in_progress" &&
              (existingSession.variantOf ?? null) !==
                (declared.captureId ?? null)
                ? await sessionStore.retarget(
                    tenant,
                    existingSession.id,
                    {
                      variantOf: declared.captureId,
                      sessionId: declared.sessionId,
                      planId: declared.planId,
                      source: declared.source,
                      metadata: sessionMetadata(declared),
                    },
                    nowIso,
                  )
                : existingSession;
            const withTargets = declared.targetIds.length
              ? await sessionStore.unionTargetIds(
                  tenant,
                  aimed.id,
                  declared.targetIds,
                  nowIso,
                )
              : aimed;
            return { status: 200, body: uploadEnvelope(withTargets) };
          }
        }

        // A technical ceiling on the uploads a space keeps open at once: a
        // client sends its files one after the other, and an abandoned
        // upload expires after 72 hours.
        if (
          (await sessionStore.openUploads(tenant, nowIso)).count >=
          maxOpenUploadSessions
        )
          throw new UploadResourceError(
            "upload_sessions_limit_reached",
            `This space already has ${maxOpenUploadSessions} unfinished uploads: finish one, or wait for an abandoned one to expire.`,
            { status: 409 },
          );

        const uploadId = idGenerator();
        const partPath = partPathFor(tenant, uploadId);
        const expiresAt = hoursFromNow(nowIso, uploadExpiryHours);
        const { created, session } = await sessionStore.createOrGet({
          id: uploadId,
          tenantId: tenant,
          sha256: declared.sha256,
          byteSize: declared.byteSize,
          contentType: declared.contentType,
          sessionId: declared.sessionId,
          planId: declared.planId,
          targetIds: declared.targetIds,
          originalName: declared.originalName,
          chunkSize: chunkSizeBytes,
          partPath,
          createdAt: nowIso,
          expiresAt,
          variantOf: declared.captureId,
          source: declared.source,
          // The proposals declared, applied at completion: the role and
          // the frames of a progression image beside them.
          metadata: sessionMetadata(declared),
        });
        return { status: created ? 201 : 200, body: uploadEnvelope(session) };
      } catch (error) {
        throw apiError(error, storage);
      }
    },

    /**
     * `POST /v1/uploads/check`: what an upload of these bytes would meet,
     * answered before a single byte is sent. The body is an upload's
     * declared metadata (`sha256`, `byteSize`, `originalName`, the
     * optional `captureId`, `targetId`/`targetIds`, `sessionId`, `planId`,
     * `source`). Three answers, each with the space's storage:
     *
     * - `present`: the space already holds these bytes, as the image
     *   `imageId` of the capture `captureId` (`main`: its main image);
     *   an upload would store nothing;
     * - `accepted`: the upload would be received, as a new capture
     *   (`adds: "capture"`) or as an image of `captureId` (`adds: "variant"`);
     * - `refused`: the upload would be refused, with the same code and the
     *   same numbers as the upload itself (`entitlement_read_only`,
     *   `capture_limit_reached`, `capture_variant_limit_reached`,
     *   `storage_quota_reached`, `file_too_large`).
     *
     * A malformed body, a foreign or unknown capture, plan, session or
     * target are errors, as for the upload. Nothing is written.
     */
    async checkUpload({ tenantId, userId, caller = WEB_CALLER, ...body }) {
      const tenant = requiredIdentifier(tenantId, "Tenant id");
      const normalizedUserId =
        userId === null || userId === undefined
          ? null
          : requiredIdentifier(userId, "User id");
      const declared = parseUploadMetadataObject(body, "The request body");
      await adoptDefinition(tenant, declared, normalizedUserId);
      sourceFor(caller, declared.source);
      const nowIso = now();
      await checkPlanImage(tenant, normalizedUserId, declared.plan);
      let gate;
      try {
        gate = await checkWriteGates({
          provider,
          store,
          tenant,
          normalizedUserId,
          declaredByteSize: declared.byteSize,
          declaredSha256: declared.sha256,
          captureId: declared.captureId,
          role: declared.role,
          replaces: declared.sessionRule === "replace",
          held: await heldUploads(tenant, nowIso, declared.sha256),
        });
      } catch (error) {
        const refusal = apiError(error, error?.body?.storage ?? null);
        if (!PRE_CHECK_REFUSALS.has(refusal.code)) throw refusal;
        let storage = refusal.body.storage;
        if (!storage) {
          const { remainingBytes: _remaining, ...numbers } =
            await this.spaceStorageNumbers(tenant, userId);
          storage = numbers;
        }
        return {
          result: "refused",
          code: refusal.code,
          message: refusal.message,
          storage,
        };
      }
      if (gate.present)
        return {
          result: "present",
          captureId: gate.present.captureId,
          imageId: gate.present.variant.id,
          main: gate.present.variant.main,
          storage: gate.storage,
        };
      try {
        await checkRelationalLinks({
          store,
          tenant,
          planId: declared.planId,
          sessionId: declared.sessionId,
          targetIds: declared.targetIds,
        });
      } catch (error) {
        throw apiError(error, null);
      }
      return {
        result: "accepted",
        adds: declared.role
          ? "progression"
          : declared.captureId
            ? "variant"
            : "capture",
        storage: gate.storage,
      };
    },

    /**
     * The storage of a space in numbers: its bytes used (every stored
     * original, the uploads in progress included), its quota and what
     * remains, the per-file ceiling, its captures and their limit, and
     * `capture.variant_limit`. Numbers only: the unlimited sentinel where
     * the profile sets no cap.
     */
    async spaceStorageNumbers(tenantId, userId = null) {
      const tenant = requiredIdentifier(tenantId, "Tenant id");
      const caps = await provider.capabilitiesFor(userId ?? null);
      const held = await heldUploads(tenant, now());
      const usedBytes = (await store.usedBytes(tenant)) + held.receivedBytes;
      const quotaBytes = Number(caps["storage.quota_bytes"]) || 0;
      return {
        usedBytes,
        quotaBytes,
        maxFileBytes: Number(caps["storage.max_file_bytes"]) || 0,
        captureCount:
          (await store.captureCount(tenant)) +
          (held.captures ?? held.count ?? 0),
        captureCountLimit: captureCountLimitOf(caps),
        variantLimit: variantLimitOf(caps),
        remainingBytes: isUnlimitedCapability(quotaBytes)
          ? CAPABILITY_UNLIMITED
          : Math.max(0, quotaBytes - usedBytes),
      };
    },

    /**
     * `GET /v1/space/storage`: the numbers above, and the composed
     * capabilities of the person (those of `GET /v1/capabilities`), for a
     * device to check what it is about to send before sending it.
     */
    async spaceStorage({ tenantId, userId = null }) {
      const numbers = await this.spaceStorageNumbers(tenantId, userId);
      return {
        usedBytes: numbers.usedBytes,
        quotaBytes: numbers.quotaBytes,
        remainingBytes: numbers.remainingBytes,
        maxFileBytes: numbers.maxFileBytes,
        captureCount: numbers.captureCount,
        captureCountLimit: numbers.captureCountLimit,
        variantLimit: numbers.variantLimit,
        capabilities: {
          ...(await provider.capabilitiesFor(userId ?? null)),
        },
      };
    },

    /** `GET /v1/uploads/{id}` (`api/uploads.md`): the resumable protocol's status query. Reconciles against the part file's actual size on disk before answering, so an interrupted PUT's true offset is never understated or overstated by a stale database cache. */
    async getUploadStatus({ tenantId, uploadId }) {
      const tenant = requiredIdentifier(tenantId, "Tenant id");
      await sweepAlongRequests();
      try {
        const sessionStore = requireSessions();
        const session = await purgeIfExpiredOrGet(
          sessionStore,
          tenant,
          uploadId,
          now(),
          files(),
        );
        if (!session)
          throw new UploadResourceError(
            "upload_not_found",
            "The upload was not found.",
            { status: 404 },
          );
        if (session.state === "in_progress") {
          const diskOffset = await files().stagedBytes({
            tenantId: tenant,
            uploadId: session.id,
          });
          if (diskOffset !== session.offset) {
            await sessionStore.setOffset(tenant, session.id, diskOffset, now());
            session.offset = diskOffset;
          }
        }
        return { status: 200, body: uploadEnvelope(session) };
      } catch (error) {
        throw apiError(error, null);
      }
    },

    /**
     * `PUT /v1/uploads/{id}` (`api/uploads.md`): one chunk, at the exact
     * server-reported offset. `bodyChunks` is buffered whole before
     * anything is written to disk — bounded by the session's own
     * `chunkSize`, never the file's total size — so a connection dropped
     * mid-chunk leaves the previous, already-durable offset untouched
     * rather than a torn write; the client simply retries the same chunk.
     */
    async putUploadChunk({
      tenantId,
      userId = null,
      uploadId,
      declaredOffset,
      declaredContentLength,
      bodyChunks,
    }) {
      const tenant = requiredIdentifier(tenantId, "Tenant id");
      const normalizedUserId =
        userId === null || userId === undefined
          ? null
          : requiredIdentifier(userId, "User id");
      await sweepAlongRequests();
      try {
        const sessionStore = requireSessions();
        const session = await purgeIfExpiredOrGet(
          sessionStore,
          tenant,
          uploadId,
          now(),
          files(),
        );
        if (!session)
          throw new UploadResourceError(
            "upload_not_found",
            "The upload was not found.",
            { status: 404 },
          );
        if (session.state === "completed")
          return { status: 200, body: uploadEnvelope(session) };

        if (!Number.isInteger(declaredOffset) || declaredOffset < 0)
          throw invalid("Upload-Offset must be a non-negative integer.");
        if (
          !Number.isInteger(declaredContentLength) ||
          declaredContentLength < 0
        )
          throw invalid("Content-Length must be a non-negative integer.");

        const diskOffset = await files().stagedBytes({
          tenantId: tenant,
          uploadId: session.id,
        });
        if (diskOffset !== session.offset)
          await sessionStore.setOffset(tenant, session.id, diskOffset, now());
        if (declaredOffset !== diskOffset)
          throw new UploadResourceError(
            "upload_offset_mismatch",
            "This chunk's Upload-Offset does not match the upload's current offset.",
            { status: 409, offset: diskOffset },
          );
        if (declaredContentLength > session.chunkSize)
          throw invalid(
            `A chunk may not exceed the announced chunkSize of ${session.chunkSize} bytes.`,
          );
        if (diskOffset + declaredContentLength > session.byteSize)
          throw invalid(
            "This chunk would exceed the upload's declared byteSize.",
          );

        // What every unfinished upload of the space already holds — this
        // one included — counts in its quota, before a single byte of this
        // chunk is accepted.
        const caps = await provider.capabilitiesFor(normalizedUserId);
        const quotaBytes = Number(caps["storage.quota_bytes"]) || 0;
        const open = await sessionStore.openUploads(tenant, now());
        const storage = {
          usedBytes: (await store.usedBytes(tenant)) + open.receivedBytes,
          quotaBytes,
          maxFileBytes: Number(caps["storage.max_file_bytes"]) || 0,
          captureCount: (await store.captureCount(tenant)) + open.count,
          captureCountLimit: captureCountLimitOf(caps),
        };
        if (
          declaredContentLength > 0 &&
          (quotaBytes <= 0 ||
            storage.usedBytes + declaredContentLength > quotaBytes)
        )
          throw new UploadResourceError(
            "storage_quota_reached",
            "Hosted media storage is not available for this account.",
            { status: 409, storage },
          );

        const buffers = [];
        let received = 0;
        const iterator = bodyChunks[Symbol.asyncIterator]
          ? bodyChunks[Symbol.asyncIterator]()
          : bodyChunks;
        for (;;) {
          const { value, done } = await iterator.next();
          if (done) break;
          const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
          received += chunk.length;
          if (received > declaredContentLength)
            throw invalid("The request body exceeds its own Content-Length.");
          buffers.push(chunk);
        }
        if (received !== declaredContentLength)
          throw invalid(
            "The request body does not match its own Content-Length.",
          );

        const chunk = Buffer.concat(buffers);
        if (diskOffset === 0) {
          try {
            refuseActiveContent(chunk);
          } catch (refusal) {
            await files().discard({ tenantId: tenant, uploadId: session.id });
            await sessionStore.deleteRow(tenant, session.id);
            throw refusal;
          }
        }
        await files().write(
          { tenantId: tenant, uploadId: session.id },
          chunk,
          diskOffset,
        );
        const newOffset = diskOffset + declaredContentLength;
        await sessionStore.setOffset(tenant, session.id, newOffset, now());
        return {
          status: 200,
          body: uploadEnvelope({ ...session, offset: newOffset }),
        };
      } catch (error) {
        throw apiError(error, null);
      }
    },

    /**
     * `POST /v1/uploads/{id}/finalize` (`api/uploads.md`): verifies the
     * assembled part file's digest, then passes through the exact same
     * gates the legacy single-request upload always has — quota,
     * `entitlement_read_only`, capture creation — before publishing the
     * bytes into the content-addressed store. Idempotent: calling it again
     * after success just replays the same `completed: true` result.
     */
    async finalizeUpload({
      tenantId,
      userId,
      uploadId,
      originClientInstanceId = null,
      caller = WEB_CALLER,
    }) {
      const tenant = requiredIdentifier(tenantId, "Tenant id");
      const normalizedUserId =
        userId === null || userId === undefined
          ? null
          : requiredIdentifier(userId, "User id");
      let storage = null;
      await sweepAlongRequests();
      try {
        const sessionStore = requireSessions();
        const session = await purgeIfExpiredOrGet(
          sessionStore,
          tenant,
          uploadId,
          now(),
          files(),
        );
        if (!session)
          throw new UploadResourceError(
            "upload_not_found",
            "The upload was not found.",
            { status: 404 },
          );
        if (session.state === "completed")
          return { status: 200, body: uploadEnvelope(session) };

        // The capture this upload adds an image to left the space after
        // its create (removed, its space emptied): not a refusal of the
        // image. A new create names the capture it goes to now and keeps
        // the bytes received (`createUpload`); a capture that is really
        // gone is refused there, `404 capture_not_found`.
        if (
          session.variantOf &&
          !(await store.getCaptureById(tenant, session.variantOf))
        )
          throw new UploadResourceError(
            "upload_capture_gone",
            "The capture this upload adds an image to is no longer in the space: create the upload again; the bytes already received are kept.",
            { status: 409 },
          );

        const diskOffset = await files().stagedBytes({
          tenantId: tenant,
          uploadId: session.id,
        });
        if (diskOffset !== session.byteSize)
          throw new UploadResourceError(
            "upload_incomplete",
            "This upload has not yet received all of its declared bytes.",
            { status: 409, offset: diskOffset },
          );

        // 1) The assembled file's own digest, verified WITHOUT touching it
        // yet — a refusal below must find it exactly as it was.
        const hashed = await files().stagedDigest({
          tenantId: tenant,
          uploadId: session.id,
        });
        if (hashed.sha256 !== session.sha256) {
          await files().discard({ tenantId: tenant, uploadId: session.id });
          await sessionStore.resetOffset(tenant, session.id, now());
          throw new UploadResourceError(
            "upload_hash_mismatch",
            "The assembled bytes do not hash to the declared sha256.",
            { status: 422, offset: 0 },
          );
        }
        try {
          refuseActiveContent(
            await files().stagedHead({
              tenantId: tenant,
              uploadId: session.id,
            }),
          );
        } catch (refusal) {
          await files().discard({ tenantId: tenant, uploadId: session.id });
          await sessionStore.deleteRow(tenant, session.id);
          throw refusal;
        }

        // 2) The exact same path the legacy single-request upload takes:
        // entitlement, quota, per-file size, then the optional links.
        await checkPlanImage(tenant, normalizedUserId, session.metadata?.plan);
        const gate = await checkWriteGates({
          provider,
          store,
          tenant,
          normalizedUserId,
          declaredByteSize: session.byteSize,
          declaredSha256: session.sha256,
          captureId: session.variantOf,
          role: session.metadata?.role ?? null,
          replaces: session.metadata?.sessionRule === "replace",
          held: await heldUploads(tenant, now(), session.sha256),
        });
        storage = gate.storage;
        await checkRelationalLinks({
          store,
          tenant,
          planId: session.planId,
          sessionId: session.sessionId,
          targetIds: session.targetIds,
        });

        // 3) Only now does the file leave the resumable area.
        await files().finalize({
          tenantId: tenant,
          uploadId: session.id,
          sha256: session.sha256,
          byteSize: hashed.byteSize,
        });

        const result = await storeUpload({
          tenant,
          declared: {
            sessionId: session.sessionId,
            planId: session.planId,
            targetIds: session.targetIds,
            originalName: session.originalName,
            sha256: session.sha256,
            captureId: session.variantOf,
            source: session.source,
            sessionRule: session.metadata?.sessionRule ?? null,
            role: session.metadata?.role ?? null,
            progressionFrames: session.metadata?.progressionFrames ?? null,
            plan: session.metadata?.plan ?? null,
            proposals: session.metadata,
          },
          byteSize: hashed.byteSize,
          caller,
          userId: normalizedUserId,
          originClientInstanceId,
        });
        await sessionStore.markCompleted(
          tenant,
          session.id,
          result.capture.id,
          now(),
        );
        return {
          status: 200,
          body: {
            ...uploadEnvelope({
              ...session,
              state: "completed",
              captureId: result.capture.id,
            }),
            capture: result.capture,
            ...(result.variant ? { variant: result.variant } : {}),
            deduplicated: result.deduplicated,
            replaced: Boolean(result.replaced),
            ...(result.skipped?.length ? { skipped: result.skipped } : {}),
            storage: grownStorage(storage, result, hashed.byteSize),
          },
        };
      } catch (error) {
        throw apiError(error, storage);
      }
    },

    /**
     * The maintenance sweep for `api/uploads.md`'s 72-hour expiry: removes both
     * the database row and its part file for every expired, still-`in_progress`
     * session. The service runs it once at startup
     * (`portal-app/lib/upload-maintenance.server.js`) and then along the upload
     * requests, at most once per `purgeIntervalMs`.
     */
    async purgeExpiredUploads(asOf = now()) {
      return await purgeExpired(asOf);
    },

    /**
     * `GET /v1/captures` is deliberately not capability-gated (api/v1.md,
     * "Additive routes awaiting approval"): a profile that cannot upload has
     * no captures, so this never refuses, it can only return an empty list.
     */
    async listCaptures({
      tenantId,
      userId = null,
      since,
      limit,
      targetId,
      sessionId,
      skySolution,
      order,
      before,
      caller = WEB_CALLER,
    }) {
      const tenant = requiredIdentifier(tenantId, "Tenant id");
      // Plan "Journal F": `?order=recent`, the most recent first, read page
      // after page by `?before=` (the `nextBefore` of the page before); the
      // synchronisation's `since` keeps its ascending reading.
      if (order !== undefined && order !== null && order !== "recent")
        throw new UploadResourceError("invalid_request", "order is recent.");
      let recentBefore = null;
      if (before !== undefined && before !== null && before !== "") {
        recentBefore = order === "recent" ? decodeRecentCursor(before) : null;
        if (!recentBefore)
          throw new UploadResourceError(
            "invalid_request",
            "before is the nextBefore of a page read with order=recent.",
          );
      }
      if (order === "recent" && since)
        throw new UploadResourceError(
          "invalid_request",
          "order=recent is read with before, not since.",
        );
      // `?sessionId=`, the captures of one session.
      if (
        sessionId !== undefined &&
        sessionId !== null &&
        sessionId !== "" &&
        (typeof sessionId !== "string" || sessionId.length > 200)
      )
        throw new UploadResourceError(
          "invalid_request",
          "sessionId is a session's identifier.",
        );
      // `?skySolution=missing`, the captures
      // whose main image has no sky solution, whatever sent them — the list
      // of Astro Sync's « Annotations ».
      if (
        skySolution !== undefined &&
        skySolution !== null &&
        skySolution !== "missing"
      )
        throw new UploadResourceError(
          "invalid_request",
          "skySolution is missing.",
        );
      try {
        const page = await store.listCaptures({
          tenantId: tenant,
          since: since || null,
          limit,
          targetId: targetId || null,
          sessionId: sessionId || null,
          skySolutionMissing: skySolution === "missing",
          order: order || null,
          before: recentBefore,
        });
        const caps = await provider.capabilitiesFor(userId);
        const usedBytes = await store.usedBytes(tenant);
        const blockedUntil = await publishingBlockedUntil(userId);
        const at = now();
        const entries = await store.targetEntries(
          tenant,
          page.captures.flatMap((capture) => capture.targetIds),
        );
        const alternatives = await store.alternativeCounts(tenant);
        const stepLines = new Map();
        const captures = [];
        for (const capture of page.captures) {
          // What the phone shows of a capture beside its two checks -- the date
          // its private protection is lifted (the rule `captureState`, the one
          // of the web), and whether the person may not make a capture public
          // (never a refusal to upload). It is what the gallery of a device
          // draws, without a second call.
          const variants = await store.listVariants(tenant, capture.id);
          const main = variants.find((variant) => variant.main) ?? null;
          const targets = capture.targetIds.map((id) =>
            listedTarget(id, entries.get(id)),
          );
          const context = resolvedDriver
            ? await readCaptureContext(resolvedDriver, tenant, {
                id: capture.id,
                session_id: capture.sessionId,
                plan_id: capture.planId,
              })
            : null;
          // A capture with no line of its own reads its night's steps; the
          // steps of a night are read once for the page.
          let acquisitionSummary = capture.acquisitionSummary ?? null;
          if (
            acquisitionSummary === null &&
            capture.sessionId &&
            typeof nightLinesFor === "function"
          ) {
            const key = `${capture.sessionId}|${capture.targetIds.join(",")}`;
            if (!stepLines.has(key))
              stepLines.set(
                key,
                await nightLinesFor(
                  tenant,
                  capture.sessionId,
                  capture.targetIds,
                ),
              );
            acquisitionSummary = acquisitionSummaryOf(stepLines.get(key));
          }
          captures.push({
            ...capture,
            acquisitionSummary,
            protectionLiftsAt: captureState({
              visibility: capture.visibility,
              checks: capture.checks,
              publishingBlockedUntil: blockedUntil,
              now: at,
              noticeDays,
              moderated:
                (typeof moderated === "function" ? moderated() : moderated) !==
                false,
            }).protectionLiftsAt,
            // Whether this caller may change the visibility: the web only
            // of a finalized capture.
            visibilityEditable:
              caller?.kind !== "device" &&
              (capture.stage === "finalized" ||
                capture.visibility === "public"),
            thumbnail: await thumbnailExists(files(), tenant, capture.sha256),
            galleryLabel: galleryLabelOf(targets),
            nightDate:
              isoDay(context?.plan?.plan_date) ??
              isoDay(context?.session?.started_at),
            width: main?.width ?? null,
            height: main?.height ?? null,
            targets,
            mainImageId: main?.id ?? null,
            imageCount: 1 + (alternatives.get(capture.id) ?? 0),
            // Where the main image came from (Astro Sync says « Envoyée
            // depuis le téléphone » and fetches its original), and whether it
            // has its sky solution.
            mainImageSource: main?.source ?? null,
            ...(skies && main
              ? {
                  skySolved: Boolean(
                    await skies.forImage(tenant, capture.id, main.id),
                  ),
                }
              : {}),
          });
        }
        return {
          ...page,
          captures,
          publishingBlocked:
            blockedUntil !== null && Date.parse(blockedUntil) > Date.parse(at),
          storage: {
            usedBytes,
            quotaBytes: Number(caps["storage.quota_bytes"]) || 0,
            maxFileBytes: Number(caps["storage.max_file_bytes"]) || 0,
            captureCount: await store.captureCount(tenant),
            captureCountLimit: captureCountLimitOf(caps),
          },
        };
      } catch (error) {
        throw apiError(error, null);
      }
    },

    /**
     * `POST /v1/targets/personal`: a personal target of the space, in
     * the target library; a device token or the web session. Answers
     * `{ target }`.
     */
    async createPersonalTarget({ tenantId, userId = null, ...body }) {
      const tenant = requiredIdentifier(tenantId, "Tenant id");
      const fields = parsePersonalTarget(body);
      const writeAccess = await resolveWriteAccess(
        provider,
        userId === null || userId === undefined
          ? null
          : requiredIdentifier(userId, "User id"),
      );
      if (writeAccess.readOnly)
        throw new UploadResourceError(
          "entitlement_read_only",
          "This account's subscription has ended: nothing new is written.",
          { status: 403 },
        );
      try {
        return {
          target: await store.createPersonalTarget({
            id: idGenerator(),
            tenantId: tenant,
            ...fields,
            createdAt: now(),
          }),
        };
      } catch (error) {
        throw apiError(error, null);
      }
    },

    /** `GET /v1/targets/personal`: the personal targets of the space, newest first. */
    async listPersonalTargets({ tenantId }) {
      const tenant = requiredIdentifier(tenantId, "Tenant id");
      try {
        return { targets: await store.listPersonalTargets(tenant) };
      } catch (error) {
        throw apiError(error, null);
      }
    },

    /**
     * The right to make a capture of this space public (`capture.public`):
     * `403 capture_public_unavailable` when the profile does not carry it.
     * Every route that makes a capture public goes through
     * `setCaptureVisibility` or `requestCaptureReview` below. A capability,
     * not the block on publishing (a state of the person,
     * `publishing_blocked`).
     */
    async requirePublicAllowed({ userId = null }) {
      await requirePublicCapability(provider, userId);
    },

    /**
     * « Privée » / « Publique » of one capture: making it public needs
     * `capture.public`; making it private again never does. Whether a
     * capture of the space was written.
     */
    async setCaptureVisibility({
      tenantId,
      userId = null,
      captureId,
      visibility,
    }) {
      const tenant = requiredIdentifier(tenantId, "Tenant id");
      if (visibility === "public")
        await requirePublicCapability(provider, userId);
      try {
        return await store.setVisibility(tenant, captureId, visibility);
      } catch (error) {
        throw apiError(error, null);
      }
    },

    /** The owner's request for a review (what a public capture needs): the same right. */
    async requestCaptureReview({ tenantId, userId = null, captureId, at }) {
      const tenant = requiredIdentifier(tenantId, "Tenant id");
      await requirePublicCapability(provider, userId);
      try {
        return await store.requestReview(tenant, captureId, at);
      } catch (error) {
        throw apiError(error, null);
      }
    },
  };
}
