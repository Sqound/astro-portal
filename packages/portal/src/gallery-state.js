import { signInHrefFor } from "./sign-in-href.js";

export const GALLERY_BATCH_SIZE = 24;
export const GALLERY_MAX_BATCH_SIZE = 48;

export const galleryStateStorageKey = (locale) =>
  `astro-portal:gallery-state:${locale}`;

export const galleryViewFromRoute = (value) =>
  value === "map" ? "map" : "gallery";

const safeNumber = (value) =>
  Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

export function createGalleryState({
  locale,
  query,
  tag,
  newestFirst,
  scrollY,
  loadedCount,
}) {
  return {
    version: 1,
    locale,
    query: typeof query === "string" ? query : "",
    tag: typeof tag === "string" ? tag : "",
    newestFirst: newestFirst !== false,
    scrollY: safeNumber(scrollY),
    loadedCount: Math.floor(safeNumber(loadedCount)),
  };
}

export function parseGalleryState(value, locale) {
  try {
    const state = JSON.parse(value);
    if (!state || state.version !== 1 || state.locale !== locale) return null;
    return createGalleryState(state);
  } catch {
    return null;
  }
}

export function initialGalleryLoadLimit(state) {
  return Math.min(
    GALLERY_MAX_BATCH_SIZE,
    Math.max(GALLERY_BATCH_SIZE, state?.loadedCount || 0),
  );
}

export function galleryRestoreTargetCount(state, total) {
  return Math.min(Math.max(0, total || 0), state?.loadedCount || 0);
}

/**
 * What the gallery shows in place of its list: an empty state is only ever
 * *empty*. A failed read is an error (`error`), a read in progress is not an
 * answer (`results`, the list with its « Chargement… »), a search or a filter
 * that finds nothing keeps its counter (`results`), and only a gallery that
 * holds no image at all, with no search nor filter active and nothing loading,
 * is `empty`.
 */
export function galleryDisplay({
  loading,
  filterLoading,
  loadError,
  total,
  catalogTotal,
  query,
  tag,
}) {
  if (loadError) return "error";
  const filtered = Boolean(String(query || "").trim()) || Boolean(tag);
  return !loading &&
    !filterLoading &&
    !filtered &&
    total === 0 &&
    catalogTotal === 0
    ? "empty"
    : "results";
}

/**
 * The most recent finished night among `sessions` (`GET /api/v1/sessions`
 * resources): the one whose end — else start — is the latest. `null` when no
 * night is finished.
 */
export function latestFinishedNightId(sessions) {
  let best = null;
  let bestAt = -Infinity;
  for (const session of Array.isArray(sessions) ? sessions : []) {
    if (session?.status !== "finished" || typeof session.id !== "string")
      continue;
    const at = Date.parse(session.finishedAt || session.startedAt || "");
    const rank = Number.isFinite(at) ? at : -Infinity;
    if (best === null || rank >= bestAt) {
      best = session.id;
      bestAt = rank;
    }
  }
  return best;
}

/**
 * Where « Importer une première image » leads: the page of the most recent
 * finished night, where the package is imported, or the journal when there
 * is none (or when it could not be read: the journal is always there).
 */
export function galleryImportHref(locale, nightId) {
  return nightId
    ? `/${locale}/sessions/${encodeURIComponent(nightId)}`
    : `/${locale}/sessions`;
}

/**
 * Where the home gallery reads its list: the public captures of every space
 * (`captures`, the default of `ASTRO_PORTAL_GALLERY_SOURCE`), or the
 * operator's file gallery (`files`), whose page, detail and editor stay as
 * they were.
 */
export const gallerySourceOf = (value) =>
  value === "files" ? "files" : "captures";
export const galleryListPath = (source) =>
  gallerySourceOf(source) === "files" ? "/api/catalog" : "/api/v1/gallery";

/** The detail page of a public capture. */
export const publicCaptureHref = (locale, captureId) =>
  `/${locale}/gallery/${encodeURIComponent(captureId)}`;

/**
 * Where the button of the empty public gallery leads (its two empty
 * frames): a signed-in person to « Mon espace » → « Captures », where a
 * capture is made public; a visitor to the sign-in page, which creates a
 * space, and from there to the same tab.
 */
export function publicGalleryEmptyHref(
  locale,
  { signedIn, authentication } = {},
) {
  const captures = `/${locale}/manage/captures`;
  return signedIn ? captures : signInHrefFor(authentication, captures);
}
