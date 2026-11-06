"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { message } from "portal/i18n.js";
import { LoadingState } from "portal/components/LoadingState.js";
import { WebDialog } from "../dialog/WebDialog.js";
import { csrfToken, postJson, responseData } from "./portal-fetch.js";

// The package contract is packages/astro-contracts/schemas/session-package/.
// The portal's import routes (POST /v1/sessions/{id}/imports/preview and
// .../imports/confirm, portal-app/lib/v1/session-package-import-service.js)
// never accept a ZIP: image/progression assets must already be uploaded
// through the existing POST /v1/uploads, and metric-log/event-log/other
// assets travel inline as base64 in the same JSON body (see that service's
// own comment for why). This dialog is the browser-side half of that
// transport: a person picks the astro-session-package FOLDER (not an
// archive) with a `webkitdirectory` file input, which the browser hands
// back as every file inside it with its relative path attached — this
// component reads manifest.json/checksums.sha256 from that list, uploads
// every image/progression asset the ordinary way, inlines everything else,
// and only then calls preview/confirm.

const CAPTURE_LIKE_KINDS = new Set(["image", "progression"]);
const KIND_LABEL_KEY = {
  image: "sessionImportKindImage",
  "metric-log": "sessionImportKindMetricLog",
  "event-log": "sessionImportKindEventLog",
  progression: "sessionImportKindProgression",
  other: "sessionImportKindOther",
};
const WARNING_TEMPLATE_KEY = {
  capture_attached_elsewhere: "sessionImportWarningCaptureAttachedElsewhere",
  capture_session_unset: "sessionImportWarningCaptureSessionUnset",
};
const ERROR_MESSAGE_KEY = {
  asset_not_uploaded: "sessionImportErrorAssetNotUploaded",
  checksum_mismatch: "sessionImportErrorChecksumMismatch",
  invalid_path: "sessionImportErrorInvalidPath",
  entitlement_read_only: "sessionImportErrorEntitlementReadOnly",
  session_not_found: "sessionImportErrorSessionNotFound",
};

function fillTemplate(template, values) {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value ?? "")),
    template,
  );
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let scaled = value / 1024;
  let unitIndex = 0;
  while (scaled >= 1024 && unitIndex < units.length - 1) {
    scaled /= 1024;
    unitIndex += 1;
  }
  return `${scaled.toFixed(scaled >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function bufferToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize)
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  return btoa(binary);
}

/** Indexes a `webkitdirectory` FileList by the path *inside* the chosen folder (strips the folder's own name, the list's shared first path segment). */
function indexSelectedFiles(fileList) {
  const byPath = new Map();
  for (const file of Array.from(fileList)) {
    const relative = (file.webkitRelativePath || file.name)
      .split("/")
      .slice(1)
      .join("/");
    if (relative) byPath.set(relative, file);
  }
  return byPath;
}

async function uploadCaptureAsset({ sessionId, file, sha256 }) {
  const metadata = {
    sessionId,
    originalName: file.name,
    sha256,
    byteSize: file.size,
  };
  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" }),
  );
  form.append("file", file, file.name);
  const response = await fetch("/api/v1/uploads", {
    method: "POST",
    headers: { "x-astro-csrf": csrfToken() },
    body: form,
  });
  return responseData(response, "Upload failed.");
}

/**
 * Reads the selected folder, uploads every image/progression asset it lists
 * (the normal upload path — quota, capability checks, content-addressed dedup
 * all apply exactly as for a normal capture upload), and inlines every
 * other asset. Returns the exact
 * `{ manifestJson, checksums, documents }` body both import routes
 * take.
 */
async function preparePackagePayload({ sessionId, byPath, locale }) {
  const manifestFile = byPath.get("manifest.json");
  const checksumsFile = byPath.get("checksums.sha256");
  if (!manifestFile || !checksumsFile)
    throw new Error(message(locale, "sessionImportMissingFiles"));

  const manifestJson = await manifestFile.text();
  const checksums = await checksumsFile.text();
  let manifest;
  try {
    manifest = JSON.parse(manifestJson);
  } catch {
    throw new Error(message(locale, "sessionImportMissingFiles"));
  }

  const documents = {};
  for (const asset of manifest?.assets || []) {
    const file = byPath.get(asset.path);
    if (!file) continue; // preview reports the precise missing/mismatched asset.
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (CAPTURE_LIKE_KINDS.has(asset.kind)) {
      const sha256 = await sha256Hex(bytes);
      await uploadCaptureAsset({ sessionId, file, sha256 });
    } else {
      documents[asset.path] = bufferToBase64(bytes);
    }
  }
  return { manifestJson, checksums, documents };
}

function localizedErrorMessage(locale, error) {
  const key = ERROR_MESSAGE_KEY[error?.code];
  return key
    ? message(locale, key)
    : error?.message || message(locale, "sessionImportErrorGeneric");
}

function RecognizedReport({ locale, report }) {
  const kindRows = Object.entries(report.recognized.byKind || {});
  return (
    <div className="session-import-report">
      {report.alreadyImported && (
        <p className="debrief-muted">
          {fillTemplate(message(locale, "sessionImportAlreadyImported"), {
            date: report.previousImport?.importedAt || "",
          })}
        </p>
      )}
      <p>
        {fillTemplate(message(locale, "sessionImportAssetCount"), {
          count: report.recognized.assetCount,
        })}
        {" — "}
        {fillTemplate(message(locale, "sessionImportTotalSize"), {
          size: formatBytes(report.recognized.totalBytes),
        })}
      </p>
      <ul className="debrief-equipment-list">
        {kindRows.map(([kind, counts]) => (
          <li key={kind}>
            <strong>
              {message(
                locale,
                KIND_LABEL_KEY[kind] || "sessionImportKindOther",
              )}
            </strong>
            <span>
              {fillTemplate(message(locale, "sessionImportAssetCount"), {
                count: counts.count,
              })}
              {" — "}
              {formatBytes(counts.bytes)}
            </span>
          </li>
        ))}
      </ul>
      <p className="debrief-muted">
        {message(locale, "sessionImportVisibilityPrivate")}
      </p>
      {report.warnings?.length > 0 && (
        <div>
          <strong>{message(locale, "sessionImportWarningsTitle")}</strong>
          <ul className="debrief-equipment-list">
            {report.warnings.map((warning, index) => (
              <li key={`${warning.code}-${warning.path || index}`}>
                {fillTemplate(
                  message(
                    locale,
                    WARNING_TEMPLATE_KEY[warning.code] ||
                      "sessionImportErrorGeneric",
                  ),
                  { path: warning.path || "" },
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * The session page's "Import a session package" action: choose the package
 * folder, review the preview report, confirm explicitly. Shares the
 * portal's `WebDialog` shell (cross top right, actions at the bottom).
 */
export function SessionPackageImportDialog({
  locale = "en",
  sessionId,
  onClose,
}) {
  const router = useRouter();
  const inputRef = useRef(null);
  const [step, setStep] = useState("choose"); // choose | busy | review | done
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);
  const [preview, setPreview] = useState(null);
  const [confirmation, setConfirmation] = useState(null);

  const handleFilesSelected = async (event) => {
    const fileList = event.target.files;
    event.target.value = ""; // allow re-choosing the same folder after an error
    if (!fileList || fileList.length === 0) return;
    setError("");
    setStep("busy");
    try {
      const byPath = indexSelectedFiles(fileList);
      const preparedPayload = await preparePackagePayload({
        sessionId,
        byPath,
        locale,
      });
      const previewResult = await responseData(
        await postJson(
          `/api/v1/sessions/${encodeURIComponent(sessionId)}/imports/preview`,
          preparedPayload,
        ),
        message(locale, "sessionImportErrorGeneric"),
      );
      setPayload(preparedPayload);
      setPreview(previewResult);
      setStep("review");
    } catch (prepareError) {
      setError(localizedErrorMessage(locale, prepareError));
      setStep("choose");
    }
  };

  const handleConfirm = async () => {
    setError("");
    setStep("busy");
    try {
      const result = await responseData(
        await postJson(
          `/api/v1/sessions/${encodeURIComponent(sessionId)}/imports/confirm`,
          payload,
        ),
        message(locale, "sessionImportErrorGeneric"),
      );
      setConfirmation(result);
      setStep("done");
      router.refresh();
    } catch (confirmError) {
      setError(localizedErrorMessage(locale, confirmError));
      setStep("review");
    }
  };

  const busy = step === "busy";
  return (
    <WebDialog
      ariaLabel={message(locale, "sessionImportDialogTitle")}
      className="session-import-dialog"
      closeDisabled={busy}
      closeLabel={message(locale, "sessionImportCancelButton")}
      eyebrow={message(locale, "sessionImportDialogEyebrow")}
      onClose={onClose}
      title={message(locale, "sessionImportDialogTitle")}
      footer={
        step === "done" ? (
          <button type="button" className="btn-link" onClick={onClose}>
            {message(locale, "sessionImportCloseButton")}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn-link"
              disabled={busy}
              onClick={onClose}
            >
              {message(locale, "sessionImportCancelButton")}
            </button>
            {step === "review" && (
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={handleConfirm}
              >
                {message(locale, "sessionImportConfirmButton")}
              </button>
            )}
          </>
        )
      }
    >
      {step === "choose" && (
        <>
          <p>{message(locale, "sessionImportIntro")}</p>
          <input
            ref={inputRef}
            type="file"
            webkitdirectory=""
            directory=""
            multiple
            style={{ display: "none" }}
            onChange={handleFilesSelected}
          />
          <button
            type="button"
            className="btn-primary"
            data-autofocus=""
            onClick={() => inputRef.current?.click()}
          >
            {message(locale, "sessionImportChooseFolder")}
          </button>
          {error && (
            <p className="debrief-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
      {step === "busy" && (
        <LoadingState>{message(locale, "sessionImportPreparing")}</LoadingState>
      )}
      {step === "review" && preview && (
        <>
          <RecognizedReport locale={locale} report={preview} />
          {error && (
            <p className="debrief-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
      {step === "done" && confirmation && (
        <div>
          <p>
            <strong>{message(locale, "sessionImportSuccessTitle")}</strong>
          </p>
          <p>
            {fillTemplate(message(locale, "sessionImportSuccessSummary"), {
              captures: confirmation.capturesLinked ?? 0,
              documents: confirmation.documentsAttached ?? 0,
            })}
          </p>
        </div>
      )}
    </WebDialog>
  );
}
