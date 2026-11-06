import { readJsonBody } from "portal/api/json-body.js";
import {
  calibrationAvailable,
  calibrationContributionRepository,
} from "../../../../../lib/calibration-contributions.server.js";
import {
  deviceOrSessionReadV1Access,
  deviceOrSessionWriteV1Access,
} from "../../../../../lib/v1/access.js";
import { v1Error, v1Json } from "../../../../../lib/v1/response.js";

// `{ "enabled": true }`, nothing else.
const BODY_LIMIT_BYTES = 1024;

const notAvailable = () =>
  v1Json(
    {
      error: {
        code: "not_available",
        message:
          "This service keeps no calibration set: a private server never contributes.",
      },
    },
    { status: 404 },
  );

const storageUnavailable = () =>
  Object.assign(new Error("Calibration storage is unavailable."), {
    code: "calibration_storage_unavailable",
    status: 503,
  });

async function repository() {
  const store = await calibrationContributionRepository();
  if (!store) throw storageUnavailable();
  return store;
}

const failure = (error, message) =>
  v1Error(error, {
    code: "calibration_storage_unavailable",
    message,
    status: 503,
  });

/**
 * `GET /v1/space/calibration` (docs/CONTRIBUTION_RULES.md): the consent of the
 * credential's space to the project's sky-brightness calibration set — whether
 * it is on, since when, how many records the space has in the set and when the
 * last was kept. Either credential. Only where spaces are open: a private
 * server answers `404` `not_available`.
 */
export async function GET(request) {
  if (!calibrationAvailable()) return notAvailable();
  const access = await deviceOrSessionReadV1Access(request);
  if (access.response) return access.response;
  try {
    const store = await repository();
    return v1Json({ consent: await store.status(access.tenantId) });
  } catch (error) {
    return failure(error, "The consent could not be read.");
  }
}

/**
 * `PUT /v1/space/calibration` `{ enabled }`: switches the consent. On: the
 * values the space already holds are kept at once. Off: nothing new is
 * kept; what is kept stays until it is withdrawn.
 */
export async function PUT(request) {
  if (!calibrationAvailable()) return notAvailable();
  const access = await deviceOrSessionWriteV1Access(request);
  if (access.response) return access.response;
  let enabled;
  try {
    const body = await readJsonBody(request, { limit: BODY_LIMIT_BYTES });
    const keys =
      body && typeof body === "object" && !Array.isArray(body)
        ? Object.keys(body)
        : null;
    if (
      !keys ||
      keys.length !== 1 ||
      keys[0] !== "enabled" ||
      typeof body.enabled !== "boolean"
    )
      throw Object.assign(new Error('The body is { "enabled": true|false }.'), {
        code: "invalid_request",
        status: 400,
      });
    enabled = body.enabled;
  } catch (error) {
    return v1Error(error, {
      code: "invalid_request",
      message: 'The body is { "enabled": true|false }.',
      status: 400,
    });
  }
  try {
    const store = await repository();
    return v1Json({
      consent: await store.setConsent({ tenantId: access.tenantId, enabled }),
    });
  } catch (error) {
    return failure(error, "The consent could not be changed.");
  }
}

/**
 * `DELETE /v1/space/calibration` — « Retirer mes contributions »: the
 * space's records and their ledger are deleted, and the consent is switched
 * off. A release of the set already made keeps its own.
 */
export async function DELETE(request) {
  if (!calibrationAvailable()) return notAvailable();
  const access = await deviceOrSessionWriteV1Access(request);
  if (access.response) return access.response;
  try {
    const store = await repository();
    return v1Json(await store.withdraw(access.tenantId));
  } catch (error) {
    return failure(error, "The contributions could not be withdrawn.");
  }
}
