import { optionalDeviceV1Access } from "../../../../../lib/v1/access.js";
import { v1Error, v1Json } from "../../../../../lib/v1/response.js";
import { placesFailure } from "../../../../../lib/v1/places-response.js";
import { knownPlaceDetails } from "portal/places/suggested.js";

/**
 * The current details of one known place, the place a personal place is
 * linked to (`knownPlace` in the planner document): read through the
 * service at the moment they are shown, never stored in a plan.
 * `404 known_place_gone` when the source no longer has it as a named place
 * of a supported type; the personal place itself is untouched. Same access,
 * throttle and cache as GET /v1/places/suggested.
 */
export async function GET(request) {
  const access = await optionalDeviceV1Access(request, { synchronize: false });
  if (access.response) return access.response;
  const params = new URL(request.url).searchParams;
  if ((params.get("source") || "osm") !== "osm")
    return placesFailure(
      Object.assign(new Error("The only known-place source is osm."), {
        code: "invalid",
      }),
    );
  try {
    const known = await knownPlaceDetails({
      id: params.get("id"),
      locale: params.get("locale") || "en",
    });
    if (!known)
      return v1Error(
        Object.assign(new Error("The source no longer lists this place."), {
          code: "known_place_gone",
          status: 404,
        }),
      );
    return v1Json(known, {
      headers: {
        Link: '</api/v1/places/extract>; rel="alternate"; type="application/vnd.sqlite3"',
      },
    });
  } catch (error) {
    return placesFailure(error);
  }
}
