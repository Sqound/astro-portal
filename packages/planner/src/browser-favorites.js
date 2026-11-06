// "Mes préférées" of a person who has no space in this browser (a space only
// holds personal data that is synchronised, and a function that does not need
// one is never blocked without it). They live in the browser, like the plans and the places a visitor
// keeps there, and go to the space at the first sign-in, as the plans do
// (`browser-plans.js`).
//
// This module holds the rules and the carry, with no page: the storage and the
// network are given, so that the same code runs on the page and in the tests.
//
// What is stored is the shape the service answers (`GET /api/target-favorites`):
// `{ photoTargetIds: [...], visualTargetIds: [...] }`, each list in the order
// the targets were ticked.

export const browserFavoritesStorageKey = "astro-portal:planner:favorites:v1";

/** The most favorites one browser sends. */
export const browserFavoritesCarryMaximum = 500;

const MODES = ["photo", "visual"];
const LISTS = { photo: "photoTargetIds", visual: "visualTargetIds" };

const idsOf = (value) =>
  Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((id) => typeof id === "string" && id.trim() !== "")
            .map((id) => id.trim()),
        ),
      ]
    : [];

export const emptyBrowserFavorites = () => ({
  photoTargetIds: [],
  visualTargetIds: [],
});

/** The favorites this browser holds; nothing, when the storage fails or holds
 * something else. */
export function readBrowserFavorites(storage) {
  try {
    const stored = JSON.parse(storage.getItem(browserFavoritesStorageKey));
    return {
      photoTargetIds: idsOf(stored?.photoTargetIds),
      visualTargetIds: idsOf(stored?.visualTargetIds),
    };
  } catch {
    return emptyBrowserFavorites();
  }
}

/** Keeps `favorites`; an empty set leaves nothing behind. Returns whether the
 * storage took it. */
export function writeBrowserFavorites(storage, favorites) {
  try {
    if (!favorites.photoTargetIds.length && !favorites.visualTargetIds.length)
      storage.removeItem(browserFavoritesStorageKey);
    else
      storage.setItem(
        browserFavoritesStorageKey,
        JSON.stringify({
          photoTargetIds: favorites.photoTargetIds,
          visualTargetIds: favorites.visualTargetIds,
        }),
      );
    return true;
  } catch {
    return false;
  }
}

/** `favorites` with one target ticked (`favorite` true) or unticked in one
 * mode. */
export function withBrowserFavorite(favorites, targetId, mode, favorite) {
  const list = LISTS[mode];
  if (!list) return favorites;
  const others = favorites[list].filter((id) => id !== targetId);
  return {
    ...favorites,
    [list]: favorite ? [...others, targetId] : others,
  };
}

/** The identifiers of the favorites in `mode` (`""`: both), as the page and the
 * planner read them. */
export function browserFavoriteIds(favorites, mode = "") {
  return new Set(
    MODES.filter((entry) => !mode || entry === mode).flatMap(
      (entry) => favorites[LISTS[entry]],
    ),
  );
}

/** The `{ photoTargetIds, visualTargetIds }` a screen reads, as the service
 * would have answered it. */
export const browserFavoritesPayload = (favorites) => ({
  photoTargetIds: [...favorites.photoTargetIds],
  visualTargetIds: [...favorites.visualTargetIds],
});

/** Each tick, once per target and mode, for the carry. */
export const browserFavoriteItems = (favorites) =>
  MODES.flatMap((mode) =>
    favorites[LISTS[mode]].map((targetId) => ({ targetId, mode })),
  );

let carrying = null;

/**
 * Sends the favorites of this browser to the space the person signed in to
 * (`PUT /api/target-favorites`, idempotent, one tick at a time), then lets
 * them leave the browser: a favorite is never in both. A tick the space
 * refuses for good (a target it no longer has, 404) is dropped; a cut — no
 * network, a service asleep — stops at that tick and leaves it and the ones
 * after it in the browser for the next sign-in or launch. Only one carry runs
 * at a time: a second call waits for the first.
 *
 * `request(body)` answers the service's `fetch` response of the PUT.
 * Returns `{ sent, kept }`: the number of favorites that reached the space
 * and the number still in the browser.
 */
export function carryBrowserFavorites({ storage, request }) {
  if (!carrying)
    carrying = carry({ storage, request }).finally(() => {
      carrying = null;
    });
  return carrying;
}

async function carry({ storage, request }) {
  const items = browserFavoriteItems(readBrowserFavorites(storage)).slice(
    0,
    browserFavoritesCarryMaximum,
  );
  let sent = 0;
  for (const item of items) {
    let response;
    try {
      response = await request({ ...item, favorite: true });
    } catch {
      break;
    }
    if (!response.ok && response.status !== 404) break;
    if (response.ok) sent += 1;
    // What reached the space (or is refused for good) leaves the browser; the
    // read is repeated so that a tick made meanwhile is not lost.
    const held = readBrowserFavorites(storage);
    writeBrowserFavorites(
      storage,
      withBrowserFavorite(held, item.targetId, item.mode, false),
    );
  }
  const kept = browserFavoriteItems(readBrowserFavorites(storage)).length;
  return { sent, kept };
}
