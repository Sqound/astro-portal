const cached = new Map();

export async function requestPlannerSkyQuality(coordinates, { signal } = {}) {
  // Three decimals are more precise than the source raster while avoiding an
  // unnecessarily exact observing position in the upstream request.
  const params = new URLSearchParams({
    latitude: Number(coordinates.latitude).toFixed(3),
    longitude: Number(coordinates.longitude).toFixed(3),
  });
  const key = params.toString();
  if (!cached.has(key)) {
    const request = fetch(`/api/planner-sky-quality?${params}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok)
          throw Object.assign(new Error("Sky-quality estimate unavailable"), {
            code: payload.error,
            retryAfterSeconds: payload.retryAfterSeconds,
          });
        return payload;
      })
      .catch((error) => {
        cached.delete(key);
        throw error;
      });
    cached.set(key, request);
    if (cached.size > 24) cached.delete(cached.keys().next().value);
  }
  const result = await cached.get(key);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return result;
}

// The brightness by direction around a place, for the light-pollution layer
// of the horizon map. Derived data: kept in memory for the page's life only,
// per place (coordinates rounded to 0.01°, as the service rounds them) and
// per raster checksum — an answer computed from another raster than the
// newest one seen is dropped. Never stored, never synchronized, never
// written into a plan.
const directionCache = new Map();

export function skyDirectionCacheKey(coordinates) {
  const latitude = Number(coordinates?.latitude);
  const longitude = Number(coordinates?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return `${latitude.toFixed(2)}:${longitude.toFixed(2)}`;
}

export async function requestPlannerSkyDirection(
  coordinates,
  { signal, fetchImpl = fetch } = {},
) {
  const key = skyDirectionCacheKey(coordinates);
  if (!key)
    throw Object.assign(new Error("Invalid coordinates."), {
      code: "invalid_request",
    });
  if (!directionCache.has(key)) {
    const [latitude, longitude] = key.split(":");
    const params = new URLSearchParams({ latitude, longitude });
    const request = fetchImpl(`/api/v1/sky-quality/direction?${params}`)
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok)
          throw Object.assign(
            new Error("Sky brightness by direction unavailable"),
            {
              code: payload?.error?.code || "sky_quality_unavailable",
              status: response.status,
            },
          );
        // A newer raster on the service: what was computed from the older
        // one is dropped.
        for (const [other, entry] of directionCache)
          if (
            other !== key &&
            entry.checksum &&
            entry.checksum !== payload.rasterChecksum
          )
            directionCache.delete(other);
        const entry = directionCache.get(key);
        if (entry) entry.checksum = payload.rasterChecksum;
        return payload;
      })
      .catch((error) => {
        directionCache.delete(key);
        throw error;
      });
    directionCache.set(key, { request, checksum: null });
    if (directionCache.size > 24)
      directionCache.delete(directionCache.keys().next().value);
  }
  const result = await directionCache.get(key).request;
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return result;
}

// Test seam.
export function resetPlannerSkyDirectionCache() {
  directionCache.clear();
}
