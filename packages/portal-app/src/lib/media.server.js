import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { Readable } from "node:stream";
import {
  RANGE_UNSATISFIABLE,
  parseByteRange,
} from "portal/offline-pack/file-response.js";
import { captureStore } from "portal/uploads/capture-store.js";
import { USER_FILE_SECURITY_HEADERS } from "portal/uploads/media-type.js";
import { imagesDir, mimeTypes, safePath } from "./catalog.server.js";

export function isExternalRequest(request) {
  return Boolean(
    request.headers.get("cf-connecting-ip") || request.headers.get("cf-ray"),
  );
}

export function isTiff(path) {
  return /\.tiff?$/i.test(path);
}

/**
 * Streams one file of a served directory. Every answer carries `nosniff`
 * and a content policy that forbids every load and sandboxes the document
 * the gallery's own SVG illustrations still display
 * in an `<img>` and on their own, but nothing in a served file can ever run
 * a script on the portal's origin. `Cache-Control` is always explicit —
 * `no-cache` (revalidate with `Last-Modified`) unless the caller names its
 * own. The type of the gallery's own files follows their extension: they
 * are the operator's, never a person's upload (those are served by
 * `portal/uploads/media-type.js`'s `userFileHeaders`, from their bytes).
 */
export async function fileResponse(root, segments, headers = {}, request) {
  const filePath = safePath(root, segments.join("/"));
  if (!filePath)
    return new Response("Accès refusé", {
      status: 403,
      headers: USER_FILE_SECURITY_HEADERS,
    });
  try {
    const info = await stat(filePath);
    if (!info.isFile())
      return new Response("Fichier introuvable", {
        status: 404,
        headers: USER_FILE_SECURITY_HEADERS,
      });
    const lastModified = new Date(
      Math.floor(info.mtimeMs / 1000) * 1000,
    ).toUTCString();
    const responseHeaders = {
      "Content-Type":
        mimeTypes[extname(filePath).toLowerCase()] ||
        "application/octet-stream",
      "Content-Length": String(info.size),
      "Cache-Control": "no-cache",
      "Last-Modified": lastModified,
      ...headers,
      ...USER_FILE_SECURITY_HEADERS,
    };
    const since = request?.headers?.get?.("if-modified-since");
    if (since && Date.parse(since) >= Date.parse(lastModified)) {
      const { "Content-Length": _length, ...notModified } = responseHeaders;
      return new Response(null, { status: 304, headers: notModified });
    }
    return new Response(Readable.toWeb(createReadStream(filePath)), {
      headers: responseHeaders,
    });
  } catch {
    return new Response("Fichier introuvable", {
      status: 404,
      headers: USER_FILE_SECURITY_HEADERS,
    });
  }
}

const fileNotFound = () =>
  new Response("Fichier introuvable", {
    status: 404,
    headers: USER_FILE_SECURITY_HEADERS,
  });

/**
 * Streams one file of a capture from the capture store
 * (`portal/uploads/capture-store.js`): `reference` is
 * `{ tenantId, sha256, file }`, `headers` the ones `userFileHeaders`
 * decided from its bytes. Like `fileResponse`: `nosniff` and the sandboxing
 * policy on every answer, `Last-Modified` and `304` on `If-Modified-Since`;
 * and one byte range honoured (`Accept-Ranges: bytes`, `206` with
 * `Content-Range`, `416` past the end; several ranges or a malformed header
 * get the whole file), so a download of an original can resume where it
 * stopped.
 */
export async function capturedFileResponse(
  reference,
  headers = {},
  request,
  store = captureStore(),
) {
  let info;
  try {
    info = await store.stat(reference);
  } catch {
    info = null;
  }
  if (!info) return fileNotFound();
  const lastModified = new Date(
    Math.floor(new Date(info.lastModified).getTime() / 1000) * 1000,
  ).toUTCString();
  const responseHeaders = {
    "Content-Type": "application/octet-stream",
    "Cache-Control": "no-cache",
    "Last-Modified": lastModified,
    "Accept-Ranges": "bytes",
    ...headers,
    ...USER_FILE_SECURITY_HEADERS,
  };
  const since = request?.headers?.get?.("if-modified-since");
  if (since && Date.parse(since) >= Date.parse(lastModified))
    return new Response(null, { status: 304, headers: responseHeaders });
  const range = parseByteRange(request?.headers?.get?.("range"), info.size);
  if (range === RANGE_UNSATISFIABLE)
    return new Response(null, {
      status: 416,
      headers: { ...responseHeaders, "Content-Range": `bytes */${info.size}` },
    });
  let read;
  try {
    read = await store.read(reference, range || {});
  } catch {
    read = null;
  }
  if (!read) return fileNotFound();
  if (range)
    return new Response(Readable.toWeb(read.stream), {
      status: 206,
      headers: {
        ...responseHeaders,
        "Content-Range": `bytes ${range.start}-${range.end}/${info.size}`,
        "Content-Length": String(range.end - range.start + 1),
      },
    });
  return new Response(Readable.toWeb(read.stream), {
    headers: { ...responseHeaders, "Content-Length": String(info.size) },
  });
}

export async function imageResponse(
  request,
  segments,
  { download = false } = {},
) {
  const requestedPath = segments.join("/");
  if (isExternalRequest(request) && isTiff(requestedPath)) {
    return new Response("Les TIFF sont réservés au réseau local.", {
      status: 403,
    });
  }
  return fileResponse(
    imagesDir,
    segments,
    download
      ? {
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(segments.at(-1) || "image.tiff")}`,
        }
      : {},
    request,
  );
}
