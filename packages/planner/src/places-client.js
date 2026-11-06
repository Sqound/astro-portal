// Device-only last-result cache, bounded to 30 days; never shared or bundled.
import { requestJson } from "portal/components/sessions/portal-fetch.js";
import { normaliseHorizonMask } from "portal/planner/horizon-mask.js";
import {
  knownElevation,
  normalizeKnownPlaceLink,
  normalizePlace,
  placeCoordinates,
} from "portal/planner/state.js";
import { normalizeSkyEntered } from "portal/sky-brightness-source.js";
import {
  normalizeSuggestedPage,
  normalizeSuggestedPlace,
  ownPlaceKinds,
  placeKinds,
  roundPlacesCentre,
} from "./places-rules.js";

/** Why a read of the service did not give fresh places. */
export const placesFailures = Object.freeze([
  "offline", // no network: the UI asks for a connection
  "disabled", // the service switched the source off
  "source", // the source failed or was too slow
  "gone", // the known place is no longer offered (404)
]);

export const placesSessionKey = "astro-portal:places:suggested:v1";
/** How many searches the tab remembers. */
export const placesSessionSearches = 8;

/** The kinds of [kinds], in the service's order. */
export const placesTypesOf = (kinds) =>
  placeKinds.filter((kind) => (kinds || []).includes(kind));

/**
 * What the memory and the service see of a search: the rounded centre, never
 * the reference itself.
 */
export function placesSearchKey({ latitude, longitude, radiusKm, locale }) {
  const centre = roundPlacesCentre({ latitude, longitude });
  return centre
    ? `${centre.latitude.toFixed(2)},${centre.longitude.toFixed(2)}|${radiusKm}|${locale}`
    : null;
}

/** What a refusal of the service means for the screens. */
export function placesFailureOf({ status = null, code = null, reason = null }) {
  if (code === "known_place_gone" || status === 404) return "gone";
  if (code === "places_unavailable")
    return reason === "disabled" ? "disabled" : "source";
  if (status === null) return "offline";
  return "source";
}

/** The browser's device storage, or `null` when there is none (private window, blocked). */
export function defaultPlacesStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export const placesCacheLifetimeMs = 30 * 24 * 60 * 60 * 1000;

function readEntries(storage, now) {
  try {
    const stored = JSON.parse(storage?.getItem(placesSessionKey) ?? "null");
    return Array.isArray(stored)
      ? stored.filter(
          (entry) =>
            entry &&
            typeof entry.key === "string" &&
            entry.page?.places &&
            Number.isFinite(Date.parse(entry.savedAt)) &&
            now - Date.parse(entry.savedAt) >= 0 &&
            now - Date.parse(entry.savedAt) <= placesCacheLifetimeMs,
        )
      : [];
  } catch {
    return [];
  }
}

function writeEntries(storage, entries) {
  try {
    storage?.setItem(
      placesSessionKey,
      JSON.stringify(entries.slice(0, placesSessionSearches)),
    );
  } catch {
    // A full or blocked store: the page works without a memory.
  }
}

const pageOnly = (page, kinds) => ({
  ...page,
  places: page.places.filter((place) => kinds.includes(place.type)),
});

async function failureOfResponse(response) {
  let body = null;
  try {
    body = await response.json();
  } catch {
    // Not JSON: the status says enough.
  }
  return placesFailureOf({
    status: response.status,
    code: body?.error?.code ?? null,
    reason: body?.error?.reason ?? null,
  });
}

/**
 * The service's reads, with the tab's memory. `fetchImpl` and `storage` are
 * the seams of the tests: no test reaches the network.
 */
export function createPlacesClient({
  fetchImpl = (...args) => globalThis.fetch(...args),
  storage = defaultPlacesStorage(),
  now = () => Date.now(),
} = {}) {
  async function get(path, params, signal) {
    try {
      const response = await fetchImpl(`${path}?${params}`, {
        cache: "no-store",
        signal,
      });
      if (!response.ok) return { failure: await failureOfResponse(response) };
      return { body: await response.json() };
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      return { failure: "offline" };
    }
  }

  function kept(key, kinds, failure) {
    const entries = readEntries(storage, now());
    writeEntries(storage, entries);
    for (const entry of entries) {
      if (entry.key !== key) continue;
      const keptKinds = String(entry.types).split(",");
      if (!kinds.every((kind) => keptKinds.includes(kind))) continue;
      // What was kept is read again as strictly as what the service sends.
      const places = entry.page.places
        .map(normalizeSuggestedPlace)
        .filter(Boolean);
      const fetched = Date.parse(entry.page.fetchedAt);
      if (!Number.isFinite(fetched)) continue;
      return {
        page: pageOnly(
          {
            places,
            truncated: entry.page.truncated === true,
            fetchedAt: new Date(fetched).toISOString(),
          },
          kinds,
        ),
        failure,
      };
    }
    return { page: null, failure };
  }

  return {
    /**
     * Asks the service around the rounded centre of [query]; on a refusal,
     * the last places this tab kept for the same centre, radius and language
     * (filtered to the kinds asked for when the kept search held them all).
     * `{ page, failure }`: `failure` is `null` for fresh places.
     */
    async search(
      { latitude, longitude, radiusKm, kinds, locale },
      { signal } = {},
    ) {
      const types = placesTypesOf(kinds);
      const centre = roundPlacesCentre({ latitude, longitude });
      if (!centre) return { page: null, failure: "source" };
      if (!types.length)
        return {
          page: {
            places: [],
            truncated: false,
            fetchedAt: new Date(now()).toISOString(),
          },
          failure: null,
        };
      const key = placesSearchKey({ latitude, longitude, radiusKm, locale });
      const { body, failure } = await get(
        "/api/v1/places/suggested",
        new URLSearchParams({
          latitude: centre.latitude.toFixed(2),
          longitude: centre.longitude.toFixed(2),
          radiusKm: String(radiusKm),
          types: types.join(","),
          locale,
        }),
        signal,
      );
      if (failure) return kept(key, types, failure);
      const page = normalizeSuggestedPage(body, new Date(now()).toISOString());
      if (!page) return kept(key, types, "source");
      const entries = readEntries(storage, now()).filter(
        (entry) => !(entry.key === key && entry.types === types.join(",")),
      );
      entries.unshift({
        key,
        types: types.join(","),
        savedAt: new Date(now()).toISOString(),
        page,
      });
      writeEntries(storage, entries);
      return { page, failure: null };
    },

    /**
     * The details of the known place `node/123`, read when shown. `{ place,
     * fetchedAt, failure }`; `failure` is `"gone"` for a place the source
     * dropped (the personal place is never touched).
     */
    async known(linkId, { locale, signal } = {}) {
      const { body, failure } = await get(
        "/api/v1/places/known",
        new URLSearchParams({ source: "osm", id: linkId, locale }),
        signal,
      );
      if (failure) return { place: null, fetchedAt: null, failure };
      const place = normalizeSuggestedPlace(body?.place);
      if (!place) return { place: null, fetchedAt: null, failure: "source" };
      const fetched = Date.parse(body.fetchedAt);
      return {
        place,
        fetchedAt: new Date(
          Number.isFinite(fetched) ? fetched : now(),
        ).toISOString(),
        failure: null,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// The places of a space: `/api/v1/places`
// (`place.schema.json`, `v1.md` "Places"). The most recent edit wins, the
// place as one block, so every write carries the whole place and `editedAt`,
// the instant of the person's gesture; the service answers `{ place, applied }`
// and the page adopts the answer, never a dialog, never a copy.
// ---------------------------------------------------------------------------

/** The most places a space holds (`409 place_limit_reached` beyond it). */
export const spacePlacesLimit = 200;

const decimalText = /^-?[0-9]+(\.[0-9]+)?$/;

/**
 * The body of `PUT /v1/places/{id}` for one of my places as the page keeps it
 * (latitude and longitude as text, the elevation as text, `""` for none): the
 * whole place and `editedAt`. `note` and `kind` live here and never in a
 * plan; fields the page does not know stay out. `null` for a place with no
 * usable position or name.
 */
export function placeWriteBody(place, editedAt) {
  const coordinates = placeCoordinates(place);
  const name = String(place?.name ?? "").trim();
  if (!coordinates || !name || !place?.id) return null;
  const elevation = knownElevation(place.elevation);
  const skyEntered = normalizeSkyEntered(place.skyEntered);
  const knownPlace = normalizeKnownPlaceLink(place.knownPlace);
  const locality = String(place.locality ?? "").trim();
  const note = String(place.note ?? "").trim();
  return {
    id: String(place.id),
    name: name.slice(0, 100),
    ...(locality ? { locality: locality.slice(0, 200) } : {}),
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    ...(elevation !== null
      ? {
          elevation: decimalText.test(elevation)
            ? elevation
            : String(Math.round(Number(elevation))),
        }
      : {}),
    ...(place.timeZone ? { timeZone: String(place.timeZone) } : {}),
    // The zone the person picked stays theirs.
    ...(place.timeZone && place.timeZoneSource === "chosen"
      ? { timeZoneSource: "chosen" }
      : {}),
    horizonMask: place.horizonMask
      ? normaliseHorizonMask(place.horizonMask)
      : null,
    ...(place.horizonStatus === "verified" ||
    place.horizonStatus === "unverified"
      ? { horizonStatus: place.horizonStatus }
      : {}),
    ...(skyEntered ? { skyEntered } : {}),
    ...(ownPlaceKinds.includes(place.kind) ? { kind: place.kind } : {}),
    ...(knownPlace ? { knownPlace } : {}),
    ...(note ? { note: note.slice(0, 500) } : {}),
    editedAt: new Date(editedAt).toISOString(),
  };
}

/**
 * A place of the service in the shape of the page (text coordinates, `""`
 * for an absent locality, elevation or time zone), with what only the service
 * knows (`usage`, `editedAt`) kept beside it. `null` for anything else.
 */
export function placeOfService(value) {
  if (!value || typeof value !== "object" || !value.id) return null;
  const place = normalizePlace({
    ...value,
    latitude: String(value.latitude),
    longitude: String(value.longitude),
    locality: value.locality ?? "",
    elevation: value.elevation ?? "",
    timeZone: value.timeZone ?? "",
    horizonMask: value.horizonMask ?? undefined,
    horizonStatus:
      value.horizonStatus ?? (value.horizonMask ? "verified" : "unverified"),
  });
  if (!place) return null;
  if (!value.horizonMask) delete place.horizonMask;
  if (!value.timeZone) delete place.timeZone;
  return place;
}

/**
 * What a plan keeps of a place of mine: the place without the service's
 * bookkeeping (`usage`, `editedAt`, `createdAt`, `updatedAt`), and without
 * its `kind` and `note`, which never enter a plan.
 */
export function planCopyOfPlace(place) {
  const {
    usage: _usage,
    editedAt: _editedAt,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    kind: _kind,
    note: _note,
    ...copy
  } = place ?? {};
  return copy;
}

async function failureOf(response, fallbackMessage) {
  const payload = await response.json().catch(() => null);
  const error = new Error(payload?.error?.message || fallbackMessage);
  error.code = payload?.error?.code || null;
  error.status = response.status;
  error.pendingPlans =
    payload?.pendingPlans || payload?.error?.pendingPlans || [];
  return error;
}

/**
 * The service's places, for a signed-in person (the web session, with its CSRF
 * token on a write). Every method rejects with `.status` and `.code` from the
 * body; a network failure rejects with the `TypeError` of `fetch` (no
 * `.status`): the page reads that as "offline".
 */
export function createSpacePlacesClient({ request = requestJson } = {}) {
  return {
    /** `GET /v1/places`: `{ places, defaultPlaceId, defaultPlaceEditedAt }`. */
    async list() {
      const response = await request("/api/v1/places");
      if (!response.ok) throw await failureOf(response, "place_list_failed");
      const body = await response.json();
      return {
        places: (body.places ?? []).map(placeOfService).filter(Boolean),
        defaultPlaceId: body.defaultPlaceId ?? null,
        defaultPlaceEditedAt: body.defaultPlaceEditedAt ?? null,
      };
    },
    /** `PUT /v1/places/{id}`: `{ place, applied }`, `place` `null` for a place the service keeps deleted. */
    async put(place, editedAt = Date.now()) {
      const body = placeWriteBody(place, editedAt);
      if (!body) throw Object.assign(new Error("place_invalid"), { status: 0 });
      const response = await request(
        `/api/v1/places/${encodeURIComponent(body.id)}`,
        { method: "PUT", body },
      );
      if (!response.ok) throw await failureOf(response, "place_write_failed");
      const answer = await response.json();
      return {
        place: answer.place ? placeOfService(answer.place) : null,
        applied: answer.applied === true,
      };
    },
    /**
     * `DELETE /v1/places/{id}?at=`: `{ deleted: true }`, or `{ deleted: false,
     * place }` for a place edited later; `409 place_in_use` rejects with
     * `.pendingPlans` (`{ planId, name, planDate, status }`).
     */
    async remove(id, at = Date.now()) {
      const response = await request(
        `/api/v1/places/${encodeURIComponent(id)}?at=${encodeURIComponent(new Date(at).toISOString())}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw await failureOf(response, "place_delete_failed");
      const answer = await response.json();
      return answer.deleted === true
        ? { deleted: true }
        : { deleted: false, place: placeOfService(answer.place) };
    },
    /** `PUT /v1/places/default`: `{ defaultPlaceId, defaultPlaceEditedAt, applied }`. */
    async setDefault(placeId, editedAt = Date.now()) {
      const response = await request("/api/v1/places/default", {
        method: "PUT",
        body: { placeId, editedAt: new Date(editedAt).toISOString() },
      });
      if (!response.ok) throw await failureOf(response, "place_default_failed");
      const answer = await response.json();
      return {
        defaultPlaceId: answer.defaultPlaceId ?? null,
        defaultPlaceEditedAt: answer.defaultPlaceEditedAt ?? null,
        applied: answer.applied === true,
      };
    },
    /**
     * `POST /v1/places/import`: what a browser kept without a space, sent once
     * with its own identifiers; the space's places after it and `imported`.
     */
    async importPlaces(places, editedAt = Date.now()) {
      const bodies = places
        .map((place) => placeWriteBody(place, place.editedAt ?? editedAt))
        .filter(Boolean);
      const response = await request("/api/v1/places/import", {
        method: "POST",
        body: { places: bodies },
      });
      if (!response.ok) throw await failureOf(response, "place_import_failed");
      const answer = await response.json();
      return {
        places: (answer.places ?? []).map(placeOfService).filter(Boolean),
        imported: answer.imported ?? [],
      };
    },
  };
}
