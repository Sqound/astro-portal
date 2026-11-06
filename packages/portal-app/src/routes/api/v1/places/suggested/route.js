import { optionalDeviceV1Access } from "../../../../../lib/v1/access.js";
import { v1Json } from "../../../../../lib/v1/response.js";
import { placesFailure } from "../../../../../lib/v1/places-response.js";
import { suggestPlaces } from "portal/places/suggested.js";

/**
 * Public suggested places around a centre: named viewpoints, campsites, parks
 * and picnic sites from OpenStreetMap, relayed by the service so the source
 * never sees the observer. The centre is rounded to 0.05° before any query;
 * the radius is 10, 30, 60 or 100 km; at most 50 places, each with the
 * darkness estimate of the installed raster. No distance: the client computes
 * it from its own reference. Throttled and cached like the address search (GET
 * /v1/places/search). A supplied bearer must still be valid — see
 * optionalDeviceV1Access.
 */
export async function GET(request) {
  const access = await optionalDeviceV1Access(request, { synchronize: false });
  if (access.response) return access.response;
  const params = new URL(request.url).searchParams;
  try {
    return v1Json(
      await suggestPlaces({
        latitude: params.get("latitude"),
        longitude: params.get("longitude"),
        radiusKm: params.get("radiusKm"),
        types: params.get("types"),
        locale: params.get("locale") || "en",
      }),
      {
        headers: {
          Link: '</api/v1/places/extract>; rel="alternate"; type="application/vnd.sqlite3"',
        },
      },
    );
  } catch (error) {
    return placesFailure(error);
  }
}
