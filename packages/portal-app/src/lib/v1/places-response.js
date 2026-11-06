import { v1Error, v1Json } from "./response.js";

/**
 * The failures of the suggested-places routes (`GET /v1/places/suggested`,
 * `GET /v1/places/known`), from the codes of portal/places/suggested.js:
 * `invalid` → 400 `invalid_request`; `disabled` (switched off by
 * ASTRO_PORTAL_PLACES=off) and `source` (the source refused, failed or timed
 * out) → 503 `places_unavailable` with that `reason`.
 */
export function placesFailure(error) {
  if (error?.code === "invalid")
    return v1Error(
      Object.assign(new Error(error.message), {
        code: "invalid_request",
        status: 400,
      }),
    );
  const reason = error?.code === "disabled" ? "disabled" : "source";
  return v1Json(
    {
      error: {
        code: "places_unavailable",
        message:
          reason === "disabled"
            ? "Suggested places are switched off on this service."
            : "Suggested places are temporarily unavailable.",
        reason,
      },
    },
    { status: 503 },
  );
}
