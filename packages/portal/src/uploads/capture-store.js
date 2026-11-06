/**
 * The storage seam of the captures:
 * where a capture's original and the files derived from it live, behind one
 * interface, chosen once by ASTRO_PORTAL_CAPTURE_STORE when the service
 * starts. The core has one store, the disk (`disk`, the default,
 * `capture-storage.js`), complete: a private server keeps the whole
 * mechanism on its own disk. A composition of the service may register
 * another kind on this seam, the way it registers a sign-in method
 * (`auth/sign-in-extension.js`): the core never imports such a package, it
 * only reads this registry.
 *
 * A **reference** names one file: `{ tenantId, sha256, file }`, `file`
 * being `"original"` (the bytes the person sent, never modified),
 * `"thumbnail"` (`thumbnail.webp`) or `"shared"` (`shared.jpg`, the only
 * file a gallery serves). An **upload** names the bytes of one transfer
 * still being received: `{ tenantId, uploadId }`.
 *
 * The four gestures, and what each needs around it (then a listing):
 *
 * 1. **write a chunk** — `write(upload, chunk, offset)`, with
 *    `stagedBytes(upload)` (the durable offset), `stagedDigest(upload)`
 *    (the digest of what was received, without touching it),
 *    `stagedHead(upload, length)` and `discard(upload)`;
 * 2. **finalize** — `finalize({ ...upload, sha256, byteSize })` checks the
 *    size (and, where the bytes travel again, the digest) and publishes the
 *    received bytes as the original of `sha256`; finalizing bytes already
 *    published is not an error. `sink({ tenantId, sha256, maxBytes })` is
 *    the same pair for an upload received in one request (`write(chunk)`,
 *    `abort()`, `finish()`), and `put(reference, write)` publishes a
 *    derived file the caller writes to a temporary path;
 * 3. **read** — `read(reference, { start, end })` → `{ stream, size,
 *    lastModified }` or `null` (a range is inclusive, like HTTP's), with
 *    `stat(reference)`, `head(reference, length)` and
 *    `withLocalFile(reference, use)`, which gives `use` a path on this
 *    machine for the readers that need one (`sharp`, the sky check);
 * 4. **remove** — `remove({ tenantId, sha256, file })`, `file` absent for
 *    the original and every derived file, `"derived"` for the derived files
 *    only; `removeSpace(tenantId)` and `spaceHolds(tenantId)` for the
 *    erasure of a space;
 * 5. **list** (optional, for the sweep of orphans, `captures/orphans.js`) —
 *    `list(tenantId)` is an async iterable of `{ sha256, file, size,
 *    lastModified }` for each file the space holds as a capture's, and
 *    `listSpaces()` one of the spaces that hold any.
 *
 * A store's `kind` names it; `pathOf(reference)` exists on the disk store
 * only. The registry lives on `globalThis` under a registered symbol, like
 * the other seams: Next.js loads a module once per compilation layer and
 * `server.mjs` loads its own copy.
 */
import { createDiskCaptureStore } from "./capture-storage.js";

export const DISK_CAPTURE_STORE = "disk";

/** The kinds of file a reference names (a technical list, not copy). */
export const CAPTURE_FILES = Object.freeze({
  original: "original",
  thumbnail: "thumbnail",
  shared: "shared",
});

const registryKey = Symbol.for("astro-portal.capture-stores");

function registry() {
  if (!(globalThis[registryKey] instanceof Map))
    globalThis[registryKey] = new Map();
  return globalThis[registryKey];
}

/** The kind of store these settings ask for (`disk` when unset). */
export function captureStoreKind(env = process.env) {
  return (
    String(env.ASTRO_PORTAL_CAPTURE_STORE ?? "")
      .trim()
      .toLowerCase() || DISK_CAPTURE_STORE
  );
}

/**
 * Registers a kind of store. `registration` is `{ create(env), problems?(env),
 * key?(env) }`: `create` builds the store from the settings, `problems`
 * names the settings without which it cannot work (the service then refuses
 * to start), `key` says which settings it depends on (one store is kept per
 * key). `disk` is the core's and cannot be taken over.
 */
export function registerCaptureStore(kind, registration) {
  const name = String(kind || "")
    .trim()
    .toLowerCase();
  if (!/^[a-z][a-z0-9-]{0,40}$/.test(name))
    throw new Error(`"${kind}" is not the name of a capture store.`);
  if (name === DISK_CAPTURE_STORE)
    throw new Error("The disk capture store is the core's own.");
  if (typeof registration?.create !== "function")
    throw new Error(`The capture store "${name}" lacks create().`);
  registry().set(name, { registration, store: null, key: null });
}

/** The kinds a composition registered, besides `disk`. */
export function registeredCaptureStores() {
  return [...registry().keys()];
}

/**
 * What keeps the service from starting with these settings: a kind nobody
 * registered, or the registered kind's own problems. Empty when the store
 * can be built.
 */
export function captureStoreProblems(env = process.env) {
  const kind = captureStoreKind(env);
  if (kind === DISK_CAPTURE_STORE) return [];
  const entry = registry().get(kind);
  if (!entry)
    return [
      `ASTRO_PORTAL_CAPTURE_STORE=${kind} is not a capture store of this service (${[DISK_CAPTURE_STORE, ...registeredCaptureStores()].join(", ")})`,
    ];
  return entry.registration.problems?.(env) || [];
}

let diskStore = null;

/** The core's store: the captures directory of this machine. */
export function diskCaptureStore() {
  diskStore ||= createDiskCaptureStore();
  return diskStore;
}

/**
 * The store of the service, for these settings. The disk store reads its
 * directory at each call (ASTRO_PORTAL_CAPTURES_DIR, or the runtime
 * directory's `captures/`); another kind is built once per `key(env)`.
 */
export function captureStore(env = process.env) {
  const kind = captureStoreKind(env);
  if (kind === DISK_CAPTURE_STORE) return diskCaptureStore();
  const entry = registry().get(kind);
  if (!entry)
    throw new Error(
      `ASTRO_PORTAL_CAPTURE_STORE=${kind} is not a capture store of this service.`,
    );
  const key = entry.registration.key?.(env) ?? "";
  if (!entry.store || entry.key !== key) {
    entry.store = entry.registration.create(env);
    entry.key = key;
  }
  return entry.store;
}

/** Tests only: forgets every registration. */
export function clearCaptureStores() {
  registry().clear();
}
