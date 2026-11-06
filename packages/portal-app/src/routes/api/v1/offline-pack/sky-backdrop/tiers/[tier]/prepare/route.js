import { skyTileMirrorEnabled } from "portal/sky-tiles/mirror.js";
import {
  SkyBackdropPrepareError,
  skyBackdropPrepareLimiter,
  skyBackdropPreparer,
} from "portal/sky-tiles/prepare.js";

import { requestOrigin } from "../../../../../../../../lib/rate-limit.server.js";
import { v1Json } from "../../../../../../../../lib/v1/response.js";

/**
 * The v1 error envelope, plus — as the sky-tile archive routes do, where the
 * phone's transport reads them — `code` and `retryAfterSeconds` at the top
 * of the body; `details` (a tier's sizes, say) are spread there too.
 */
function prepareError(
  status,
  code,
  message,
  { retryAfterSeconds, details } = {},
) {
  const seconds = retryAfterSeconds
    ? Math.max(1, Math.round(retryAfterSeconds))
    : null;
  return v1Json(
    {
      error: { code, message },
      code,
      ...(seconds ? { retryAfterSeconds: seconds } : {}),
      ...details,
    },
    { status, headers: seconds ? { "Retry-After": String(seconds) } : {} },
  );
}

function stateResponse(state, status) {
  return v1Json(state, {
    status,
    headers: state.retryAfterSeconds
      ? { "Retry-After": String(state.retryAfterSeconds) }
      : {},
  });
}

function failure(error) {
  if (error instanceof SkyBackdropPrepareError)
    return prepareError(error.status, error.code, error.message, {
      details: error.details,
    });
  return prepareError(
    503,
    "sky_backdrop_prepare_unavailable",
    "The sky-backdrop preparation is unavailable.",
    { retryAfterSeconds: 30 },
  );
}

function mirrorDisabled() {
  return prepareError(
    404,
    "sky_tiles_mirror_disabled",
    "The sky-tile mirror is disabled on this portal.",
  );
}

/**
 * Where a preparation stands: `GET` reads it and starts nothing. `state` is
 * `idle` (nothing runs for this tier — the case after every restart, whatever
 * the archives already on disk, counted in `archives`), `queued`, `running`,
 * `waiting` (the CDS does not answer: `reason`, `nextAttemptAt`), `failed`
 * (the CDS refuses a tile for good: `reason`) or `complete`. Read it every
 * `retryAfterSeconds`, and never less often than once a minute while a
 * preparation matters: a service that sleeps when idle stops preparing with
 * it.
 *
 * No device authentication: exactly the rule of the archive routes it feeds
 * (`portal-app/routes/api/v1/sky-tiles/[surveyId]/[...path]/route.js`) — nothing here
 * is personal to a device or a user.
 */
export async function GET(request, { params }) {
  if (!skyTileMirrorEnabled()) return mirrorDisabled();
  const { tier } = await params;
  try {
    return stateResponse(await skyBackdropPreparer().status(tier), 200);
  } catch (error) {
    return failure(error);
  }
}

/**
 * Starts the preparation of a tier — or joins the one in progress: the same
 * request twice is one task — and answers at once with its state (`202`
 * while there is something left to do, `200` when the tier is complete).
 * Every archive the tier lacks is built in the background, one after the
 * other, in the order the phone downloads them; an archive asked for
 * directly is still built and served as before, ahead of it. One task runs
 * at a time for the whole service: another tier waits in `queued`, or is
 * covered when the running one is larger.
 *
 * `409` `sky_backdrop_tier_exceeds_mirror_limit` when the tier could not fit
 * in the mirror's size limit (`ASTRO_PORTAL_SKY_TILE_MIRROR_MAX_BYTES`): it
 * would evict its own archives as it went, so it is not started. `429` past
 * ten requests a minute from one network origin (`requestOrigin`, the one
 * every limit of the service counts against: the visitor's, never the
 * proxy's).
 */
export async function POST(request, { params }) {
  if (!skyTileMirrorEnabled()) return mirrorDisabled();
  const { tier } = await params;
  const taken = skyBackdropPrepareLimiter().take(requestOrigin(request));
  if (!taken.allowed)
    return prepareError(
      429,
      "sky_backdrop_prepare_rate_limited",
      "Too many preparation requests; ask again after Retry-After.",
      { retryAfterSeconds: taken.retryAfterSeconds },
    );
  try {
    const state = await skyBackdropPreparer().prepare(tier);
    return stateResponse(state, state.state === "complete" ? 200 : 202);
  } catch (error) {
    return failure(error);
  }
}
