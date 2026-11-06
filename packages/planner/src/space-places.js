// The places of the signed-in person, kept in memory by the planner page. The
// service (`/v1/places`) is the source: the page reads the list at launch and
// at each change signal, writes at once (the page shows the gesture first and
// adopts the service's answer), and tells a failure by the planner's one-line
// notice. A visitor has no store here: the browser's document is theirs, as
// before.
//
// The browser's own places go to the space once, at the first sign-in
// (`POST /v1/places/import`), each with its own identifier; a marker in the
// browser says which were sent, so a second sign-in sends nothing again.
import { randomUuid } from "portal/random-uuid.js";
import { placeWriteBody } from "./places-client.js";

export const spacePlacesCacheKey = "astro-portal:places:space:v1";
export const spacePlacesSentKey = "astro-portal:places:sent:v1";
const placeIdPattern = /^[A-Za-z0-9._:-]{1,120}$/;
// The segments of other routes: refused by the service as identifiers.
const reservedIds =
  /^(?:known|search|suggested|resolve|extract|default|import)$/;

const emailKey = (email) =>
  String(email ?? "")
    .trim()
    .toLowerCase();

function storageOf(storage) {
  if (storage !== undefined) return storage;
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** The identifiers of the browser's places already sent to the space of [email]. */
export function readSentPlaceIds(email, storage) {
  try {
    const stored = JSON.parse(
      storageOf(storage)?.getItem(`${spacePlacesSentKey}:${emailKey(email)}`) ??
        "null",
    );
    return new Set(Array.isArray(stored) ? stored.map(String) : []);
  } catch {
    return new Set();
  }
}

/** Remembers that these identifiers were sent to the space of [email]. */
export function writeSentPlaceIds(email, ids, storage) {
  try {
    storageOf(storage)?.setItem(
      `${spacePlacesSentKey}:${emailKey(email)}`,
      JSON.stringify([...ids]),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * What the browser sends at its first sign-in: its places that have a position
 * and a name and were not sent yet (at most 200), each with **its own**
 * identifier — except one the service would refuse (a reserved word, a
 * character outside the pattern), which is given a new one: the place is kept,
 * not the old reference. Answers `{ places, sent }`: the places to send, and the
 * original identifiers they stand for.
 */
export function placesToSend(browserPlaces, sentIds = new Set()) {
  const seen = new Set();
  const places = [];
  const sent = [];
  for (const place of Array.isArray(browserPlaces) ? browserPlaces : []) {
    const original = String(place?.id ?? "");
    if (!original || seen.has(original) || sentIds.has(original)) continue;
    if (!placeWriteBody(place, 0)) continue;
    seen.add(original);
    places.push(
      placeIdPattern.test(original) && !reservedIds.test(original)
        ? place
        : { ...place, id: randomUuid() },
    );
    sent.push(original);
    if (places.length === 200) break;
  }
  return { places, sent };
}

/** [places] with [place] first (replaced when it was there). */
export const withPlace = (places, place) => [
  place,
  ...places.filter((entry) => entry.id !== place.id),
];

/** [places] without the place [id]. */
export const withoutPlace = (places, id) =>
  places.filter((entry) => entry.id !== id);

function readCache(storage, email) {
  try {
    const stored = JSON.parse(
      storageOf(storage)?.getItem(spacePlacesCacheKey) ?? "null",
    );
    return stored &&
      emailKey(stored.email) === emailKey(email) &&
      Array.isArray(stored.places)
      ? {
          places: stored.places,
          defaultId:
            typeof stored.defaultPlaceId === "string"
              ? stored.defaultPlaceId
              : null,
        }
      : null;
  } catch {
    return null;
  }
}

function writeCache(storage, email, { places, defaultId }) {
  try {
    storageOf(storage)?.setItem(
      spacePlacesCacheKey,
      JSON.stringify({
        email: emailKey(email),
        places,
        defaultPlaceId: defaultId,
      }),
    );
  } catch {
    // A full or blocked store: the page works without a memory.
  }
}

/** The copy of a space's places leaves the browser with its person. */
export function clearSpacePlacesCache(storage) {
  try {
    storageOf(storage)?.removeItem(spacePlacesCacheKey);
  } catch {
    // Nothing to clear in a blocked store.
  }
}

/**
 * The store of the signed-in person's places. `client` is
 * `createSpacePlacesClient()`; `onError(kind, error)` is the planner's
 * one-line notice (`kind`: `"read"`, `"write"`, `"delete"`, `"default"`,
 * `"import"`); `getSnapshot()` / `subscribe()` follow the
 * `useSyncExternalStore` contract.
 */
export function createSpacePlacesStore({
  client,
  storage,
  now = () => Date.now(),
  onError = () => {},
} = {}) {
  let snapshot = {
    places: [],
    defaultId: null,
    loaded: false,
    offline: false,
  };
  let email = null;
  let started = false;
  let tail = Promise.resolve();
  const listeners = new Set();
  const set = (patch) => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  };
  const keep = () => {
    if (email) writeCache(storage, email, snapshot);
  };
  // One request of the store at a time: a reload never overtakes a write.
  const queued = (task) => {
    const run = tail.catch(() => {}).then(task);
    tail = run;
    return run;
  };

  async function read() {
    try {
      const list = await client.list();
      set({
        places: list.places,
        defaultId: list.defaultPlaceId,
        loaded: true,
        offline: false,
      });
      keep();
      return true;
    } catch (error) {
      set({ loaded: true, offline: error?.status === undefined });
      onError("read", error);
      return false;
    }
  }

  async function importBrowser(browserPlaces) {
    const sentIds = readSentPlaceIds(email, storage);
    const { places, sent } = placesToSend(browserPlaces, sentIds);
    if (!places.length) return;
    try {
      const answer = await client.importPlaces(places, now());
      set({ places: answer.places });
      writeSentPlaceIds(email, new Set([...sentIds, ...sent]), storage);
    } catch (error) {
      // Nothing is marked: the next launch sends them again (idempotent).
      onError("import", error);
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    /**
     * Starts for the person [signedInEmail]: the copy this browser keeps, then
     * the browser's places sent once, then the space read. Safe to call again
     * for the same person (it reads again).
     */
    start({ email: signedInEmail, browserPlaces = [] }) {
      const same = started && emailKey(email) === emailKey(signedInEmail);
      email = signedInEmail;
      started = true;
      if (!same) {
        const cached = readCache(storage, email);
        set({
          places: cached?.places ?? [],
          defaultId: cached?.defaultId ?? null,
          loaded: false,
          offline: false,
        });
      }
      return queued(async () => {
        if (!same) await importBrowser(browserPlaces);
        await read();
      });
    },
    /** Reads the space again (a change signal, the return of the network). */
    reload: () => (started ? queued(read) : Promise.resolve(false)),
    stop() {
      started = false;
      email = null;
      set({ places: [], defaultId: null, loaded: false, offline: false });
    },
    /**
     * Keeps [place] now (the gesture shows at once) and sends it; adopts the
     * service's answer. Answers the place the service keeps, or `null`.
     */
    save(place) {
      const before = snapshot;
      const editedAt = now();
      const optimistic = {
        ...place,
        editedAt: new Date(editedAt).toISOString(),
        usage:
          place.usage ??
          before.places.find((entry) => entry.id === place.id)?.usage,
      };
      if (!optimistic.usage) delete optimistic.usage;
      set({ places: withPlace(before.places, optimistic) });
      return queued(async () => {
        try {
          const answer = await client.put(optimistic, editedAt);
          set({
            places: answer.place
              ? withPlace(snapshot.places, answer.place)
              : withoutPlace(snapshot.places, place.id),
          });
          keep();
          return answer.place;
        } catch (error) {
          set({ places: before.places, defaultId: before.defaultId });
          onError("write", error);
          return null;
        }
      });
    },
    /**
     * Deletes the place [id]. `{ ok: true }`, or `{ inUse: true, pendingPlans }`
     * when plans to execute still use it — decided from the `usage` read with
     * the place, then said again by the service (`409 place_in_use`) — or
     * `{ ok: false }` on a failure (told by `onError`).
     */
    remove(id) {
      const place = snapshot.places.find((entry) => entry.id === id);
      const pending = place?.usage?.pendingPlans ?? [];
      if (pending.length)
        return Promise.resolve({ inUse: true, pendingPlans: pending });
      return queued(async () => {
        try {
          const answer = await client.remove(id, now());
          set({
            places: answer.deleted
              ? withoutPlace(snapshot.places, id)
              : withPlace(snapshot.places, answer.place),
            defaultId: snapshot.defaultId === id ? null : snapshot.defaultId,
          });
          keep();
          return { ok: answer.deleted === true };
        } catch (error) {
          if (error?.code === "place_in_use") {
            await read();
            return {
              inUse: true,
              pendingPlans:
                error.pendingPlans?.length > 0
                  ? error.pendingPlans
                  : (snapshot.places.find((entry) => entry.id === id)?.usage
                      ?.pendingPlans ?? []),
            };
          }
          if (error?.code === "place_not_found") {
            set({ places: withoutPlace(snapshot.places, id) });
            keep();
            return { ok: true };
          }
          onError("delete", error);
          return { ok: false };
        }
      });
    },
    /** Makes [id] the default place of the space. */
    setDefault(id) {
      const before = snapshot;
      set({ defaultId: id });
      return queued(async () => {
        try {
          const answer = await client.setDefault(id, now());
          set({ defaultId: answer.defaultPlaceId });
          keep();
          return true;
        } catch (error) {
          set({ defaultId: before.defaultId });
          onError("default", error);
          return false;
        }
      });
    },
  };
}
