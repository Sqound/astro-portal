import { createHash } from "node:crypto";
import { posix } from "node:path";

/**
 * Framework-free parsing and validation for the open session package
 * contract (`packages/astro-contracts/schemas/session-package/`,
 * `manifest.schema.json` and that directory's own `README.md`). No
 * production code in this repository depends on a runtime JSON Schema
 * library (see `api/upload-resources.js`'s own note on
 * `parseUploadMetadataObject`), so this hand-validates the exact same shape
 * the schema describes rather than loading it at request time. The schema
 * file itself remains the single source of truth for what a *producer* must
 * satisfy; this module is the importer's own independent check, on purpose —
 * the contract's README is explicit that "a schema-valid manifest can still
 * be handed to code that resolves paths carelessly", so
 * `assertPathStaysWithinRoot` below is never skipped just because
 * `RELATIVE_PATH_PATTERN` already matched.
 *
 * Used by `../api/session-package-import.js`:
 * `POST /v1/sessions/{id}/imports/preview` and
 * `.../imports/confirm`.
 */

export class SessionPackageManifestError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "SessionPackageManifestError";
    this.code = code;
    Object.assign(this, details);
  }
}

function invalid(message, details) {
  return new SessionPackageManifestError("invalid_request", message, details);
}

function invalidPath(message, details) {
  return new SessionPackageManifestError("invalid_path", message, details);
}

function checksumError(message, details) {
  return new SessionPackageManifestError("checksum_mismatch", message, details);
}

// Mirrors manifest.schema.json's $defs.assetKind enum exactly.
export const ASSET_KINDS = Object.freeze([
  "image",
  "metric-log",
  "event-log",
  "progression",
  "other",
]);
const ASSET_KIND_SET = new Set(ASSET_KINDS);

// The two ways an asset's bytes are handled by the importer: an image or a
// derived progression is stored media and goes through the exact same
// capture path a manual upload does (quota, entitlement, content-addressed
// dedup by sha256) — this module never carries those bytes itself, only
// their declared identity; the importer resolves them against the tenant's
// own capture store. A metric/event/other file is not stored media — no
// gallery entry, no quota — and is instead attached to the session as a
// small document, its actual bytes carried inline in the same request (see
// `session-package-import.js` for why: neither transport skips SHA-256
// verification, this module's `verifyInlineDocumentBytes` below does it for
// the inline half).
export const CAPTURE_LIKE_KINDS = Object.freeze(["image", "progression"]);
export const DOCUMENT_KINDS = Object.freeze([
  "metric-log",
  "event-log",
  "other",
]);
const CAPTURE_LIKE_KIND_SET = new Set(CAPTURE_LIKE_KINDS);

export function isCaptureLikeKind(kind) {
  return CAPTURE_LIKE_KIND_SET.has(kind);
}

// manifest.schema.json's $defs.relativePath.pattern, restated verbatim: no
// leading slash, no drive letter, no "." or ".." segment. The first line of
// defense — see the file comment for the second.
const RELATIVE_PATH_PATTERN =
  /^(?![A-Za-z]:)(?!\/)(?!\.\.?(?:\/|$))[^/]+(?:\/(?!\.\.?(?:\/|$))[^/]+)*$/;

function assertSchemaValidPath(path, label) {
  if (
    typeof path !== "string" ||
    path.length < 1 ||
    path.length > 4096 ||
    !RELATIVE_PATH_PATTERN.test(path)
  )
    throw invalidPath(
      `${label} is not a safe package-relative path: ${JSON.stringify(path)}.`,
      { path },
    );
}

// The importer's own, independent traversal check (README, "Hard rules for
// importers", rule 1): resolves the path against a fixed virtual root and
// asserts the result never leaves it. Deliberately separate code from the
// regex above — a schema-valid string is not trusted just because it
// already passed a different check.
const VIRTUAL_ROOT = "/astro-session-package";
export function assertPathStaysWithinRoot(path) {
  if (path.startsWith("/") || path.startsWith("\\"))
    throw invalidPath(`Path must be relative: ${JSON.stringify(path)}.`, {
      path,
    });
  const normalized = posix.normalize(path);
  const resolved = posix.resolve(VIRTUAL_ROOT, normalized);
  if (
    normalized !== path ||
    normalized.split("/").includes("..") ||
    resolved !== posix.join(VIRTUAL_ROOT, normalized)
  )
    throw invalidPath(
      `Path escapes the package root: ${JSON.stringify(path)}.`,
      { path },
    );
}

export function assertSafeRelativePath(path, label = "path") {
  assertSchemaValidPath(path, label);
  assertPathStaysWithinRoot(path);
}

function isIsoTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function parseAsset(asset, index) {
  if (asset === null || typeof asset !== "object" || Array.isArray(asset))
    throw invalid(`assets[${index}] must be an object.`);
  const allowed = new Set([
    "path",
    "kind",
    "bytes",
    "capturedAt",
    "addedAt",
    "mimeType",
  ]);
  for (const key of Object.keys(asset))
    if (!allowed.has(key))
      throw invalid(`Unexpected property on assets[${index}]: "${key}".`);

  assertSafeRelativePath(asset.path, `assets[${index}].path`);
  if (!ASSET_KIND_SET.has(asset.kind))
    throw invalid(
      `assets[${index}].kind must be one of ${ASSET_KINDS.join(", ")}.`,
    );
  if (!Number.isInteger(asset.bytes) || asset.bytes < 0)
    throw invalid(`assets[${index}].bytes must be a non-negative integer.`);
  if (!isIsoTimestamp(asset.addedAt))
    throw invalid(`assets[${index}].addedAt must be an ISO 8601 timestamp.`);
  if (
    asset.capturedAt !== undefined &&
    asset.capturedAt !== null &&
    !isIsoTimestamp(asset.capturedAt)
  )
    throw invalid(
      `assets[${index}].capturedAt must be an ISO 8601 timestamp or null.`,
    );
  if (
    asset.mimeType !== undefined &&
    (typeof asset.mimeType !== "string" || asset.mimeType.length < 1)
  )
    throw invalid(`assets[${index}].mimeType must be a non-empty string.`);

  return {
    path: asset.path,
    kind: asset.kind,
    bytes: asset.bytes,
    capturedAt: asset.capturedAt ?? null,
    addedAt: asset.addedAt,
    mimeType: asset.mimeType ?? null,
  };
}

function parseSession(session) {
  if (session === undefined) return null;
  if (session === null || typeof session !== "object" || Array.isArray(session))
    throw invalid("manifest.session must be an object.");
  const allowed = new Set(["label", "startedAt", "finishedAt"]);
  for (const key of Object.keys(session))
    if (!allowed.has(key))
      throw invalid(`Unexpected property on manifest.session: "${key}".`);
  if (
    session.label !== undefined &&
    (typeof session.label !== "string" ||
      session.label.length < 1 ||
      session.label.length > 200)
  )
    throw invalid("manifest.session.label must be 1 to 200 characters.");
  for (const key of ["startedAt", "finishedAt"])
    if (
      session[key] !== undefined &&
      session[key] !== null &&
      !isIsoTimestamp(session[key])
    )
      throw invalid(`manifest.session.${key} must be an ISO 8601 timestamp.`);
  return {
    label: session.label ?? null,
    startedAt: session.startedAt ?? null,
    finishedAt: session.finishedAt ?? null,
  };
}

function parseProducer(producer) {
  if (producer === undefined) return null;
  if (
    producer === null ||
    typeof producer !== "object" ||
    Array.isArray(producer)
  )
    throw invalid("manifest.producer must be an object.");
  const allowed = new Set(["name", "version"]);
  for (const key of Object.keys(producer))
    if (!allowed.has(key))
      throw invalid(`Unexpected property on manifest.producer: "${key}".`);
  if (
    typeof producer.name !== "string" ||
    producer.name.length < 1 ||
    producer.name.length > 200
  )
    throw invalid("manifest.producer.name must be 1 to 200 characters.");
  if (
    producer.version !== undefined &&
    (typeof producer.version !== "string" ||
      producer.version.length < 1 ||
      producer.version.length > 100)
  )
    throw invalid("manifest.producer.version must be 1 to 100 characters.");
  return { name: producer.name, version: producer.version ?? null };
}

/**
 * Parses and validates the *raw text* of a `manifest.json` file — never a
 * pre-parsed object — so the manifest fingerprint below is always computed
 * over the exact same bytes a producer wrote to disk (README, "Idempotency
 * is keyed on the manifest: ... the SHA-256 of manifest.json's exact
 * bytes"). Throws `SessionPackageManifestError` on the first violation.
 */
export function parseManifestJson(manifestJsonText) {
  if (typeof manifestJsonText !== "string" || manifestJsonText.length < 1)
    throw invalid("manifestJson must be a non-empty string.");
  let parsed;
  try {
    parsed = JSON.parse(manifestJsonText);
  } catch {
    throw invalid("manifestJson must be valid JSON.");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
    throw invalid("The manifest must be a JSON object.");
  const allowed = new Set([
    "packageVersion",
    "generatedAt",
    "producer",
    "session",
    "assets",
  ]);
  for (const key of Object.keys(parsed))
    if (!allowed.has(key))
      throw invalid(`Unexpected manifest property "${key}".`);

  if (parsed.packageVersion !== 1)
    throw invalid("manifest.packageVersion must be exactly 1.");
  if (!isIsoTimestamp(parsed.generatedAt))
    throw invalid("manifest.generatedAt must be an ISO 8601 timestamp.");
  if (!Array.isArray(parsed.assets) || parsed.assets.length < 1)
    throw invalid(
      "manifest.assets must be a non-empty array (the minimal package is a manifest plus one asset).",
    );

  const assets = parsed.assets.map(parseAsset);
  const seenPaths = new Set();
  for (const asset of assets) {
    if (seenPaths.has(asset.path))
      throw invalid(`Duplicate asset path in manifest: ${asset.path}`);
    seenPaths.add(asset.path);
  }

  const manifestSha256 = createHash("sha256")
    .update(manifestJsonText, "utf8")
    .digest("hex");

  return {
    packageVersion: 1,
    generatedAt: parsed.generatedAt,
    producer: parseProducer(parsed.producer),
    session: parseSession(parsed.session),
    assets,
    manifestSha256,
  };
}

// checksums.sha256's own format (README): "<hex digest>  <relative path>",
// exactly two spaces (the binary-mode marker), LF-separated, UTF-8.
const CHECKSUM_LINE_PATTERN = /^([0-9a-f]{64}) [* ](.+)$/;

/**
 * Parses `checksums.sha256`'s raw text into a `Map<path, sha256>`. This
 * file, not the manifest, is the single source of truth for asset hashes
 * (the manifest never repeats a checksum field) — see the contract
 * README's `checksums.sha256` section.
 */
export function parseChecksumsText(checksumsText) {
  if (typeof checksumsText !== "string" || checksumsText.length < 1)
    throw checksumError("checksums must be a non-empty string.");
  const lines = checksumsText.split("\n").filter((line) => line.length > 0);
  const byPath = new Map();
  for (const rawLine of lines) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const match = CHECKSUM_LINE_PATTERN.exec(line);
    if (!match)
      throw checksumError(
        `Malformed checksums.sha256 line: ${JSON.stringify(line)}.`,
      );
    const [, sha256, path] = match;
    if (byPath.has(path))
      throw checksumError(`Duplicate checksums.sha256 entry for ${path}.`);
    byPath.set(path, sha256);
  }
  return byPath;
}

/**
 * Cross-checks every manifest asset against `checksums.sha256` (README,
 * hard rule 2: "any asset missing its checksum line" is a whole-package
 * rejection) and returns each asset paired with its verified sha256. Also
 * rejects a checksums file naming a path the manifest never lists — a
 * checksum for a file the manifest doesn't declare is exactly the kind of
 * drift this file exists to prevent.
 */
export function pairAssetsWithChecksums(assets, checksumsByPath) {
  const paired = assets.map((asset) => {
    const sha256 = checksumsByPath.get(asset.path);
    if (!sha256)
      throw checksumError(
        `No checksums.sha256 entry for asset "${asset.path}".`,
        { path: asset.path },
      );
    return { ...asset, sha256 };
  });
  const manifestPaths = new Set(assets.map((asset) => asset.path));
  for (const path of checksumsByPath.keys())
    if (!manifestPaths.has(path))
      throw checksumError(
        `checksums.sha256 names a path absent from the manifest: "${path}".`,
        { path },
      );
  return paired;
}

/**
 * Verifies one document-kind asset's inline bytes (base64) against its
 * manifest-declared size and its `checksums.sha256` digest — the direct,
 * on-the-spot SHA-256 verification for the one asset category whose bytes
 * this module's caller ever actually holds. Capture-like assets (image/
 * progression) are verified differently: their bytes were already hashed
 * once, by the same finalize step every other upload goes through
 * (`api/upload-resources.js#finalizeUpload`), when they were uploaded ahead
 * of the import; see `session-package-import.js`'s own comment for why
 * re-hashing them here is neither necessary nor possible without a second
 * copy of the bytes.
 */
export function verifyInlineDocumentBytes(asset, base64Content) {
  if (typeof base64Content !== "string" || base64Content.length < 1)
    throw invalid(
      `Missing inline content for document asset "${asset.path}".`,
      {
        path: asset.path,
      },
    );
  let buffer;
  try {
    buffer = Buffer.from(base64Content, "base64");
  } catch {
    throw invalid(`Malformed base64 content for "${asset.path}".`, {
      path: asset.path,
    });
  }
  if (buffer.length !== asset.bytes)
    throw checksumError(
      `Asset "${asset.path}" declares ${asset.bytes} bytes but ${buffer.length} were received.`,
      { path: asset.path },
    );
  const actualSha256 = createHash("sha256").update(buffer).digest("hex");
  if (actualSha256 !== asset.sha256)
    throw checksumError(
      `Asset "${asset.path}" does not hash to its checksums.sha256 digest.`,
      { path: asset.path },
    );
  return buffer;
}
