import { createHash } from "node:crypto";

/**
 * The offline pack manifest's own notation version — a `GET /v1/offline-pack`
 * concern, independent of the target-index notation's own `v`
 * (`targetIndexNotation`, `portal-app/lib/target-library.server.js`).
 */
export const offlinePackNotation = 1;

/**
 * Assembles the offline pack manifest envelope (`{ v, catalogue, components
 * }`) and computes the strong `ETag` that identifies it, from an already
 * fully-built `catalogue` summary and `components` array — this function
 * itself never touches the filesystem, a database, or the network. It is the
 * one place the envelope's shape and its `ETag` algorithm live, so
 * `GET /v1/offline-pack` (`portal-app/lib/offline-pack.server.js`, which probes the
 * live catalogue/raster/tile-mirror state to build `catalogue`/`components`)
 * and a static pack (the very same shapes, built from a static-data package
 * instead) can never drift apart on either one.
 *
 * `ETag` is a digest of the serialized text — exactly the same recipe
 * `GET /v1/target-index` keeps for its own document (`targetIndexDocument`,
 * `portal-app/lib/target-library.server.js`) — deliberately excluding any
 * generation timestamp, which would make it change on every call even when
 * nothing the manifest describes actually changed.
 */
export function offlinePackManifestDocument({ catalogue, components }) {
  const manifest = { v: offlinePackNotation, catalogue, components };
  const json = JSON.stringify(manifest);
  const etag = `"${createHash("sha256").update(json).digest("base64url").slice(0, 27)}"`;
  return { manifest, json, etag };
}
