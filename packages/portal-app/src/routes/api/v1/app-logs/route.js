import {
  APP_LOG_BODY_LIMIT_BYTES,
  validateAppLogBatch,
} from "portal/app-log-batch.js";
import { findUnsafeAppLogEntry } from "portal/app-log-redaction.js";
import { readJsonBody } from "portal/api/json-body.js";
import { APPLICATION_LOG_RETENTION_DAYS } from "portal/persistence/application-log-repository.js";
import {
  appLogRepository,
  recordBackendLog,
} from "../../../../lib/app-log.server.js";
import {
  appLogsAccepted,
  appLogsNotAvailable,
} from "../../../../lib/mobile-app-logs.server.js";
import { enabledServiceExtension } from "../../../../lib/service-extensions.js";
import { anonymousOrDeviceV1Access } from "../../../../lib/v1/access.js";
import { createWithoutSpaceLimits } from "../../../../lib/v1/without-space-limits.js";
import { v1Error, v1Json } from "../../../../lib/v1/response.js";

/**
 * The application's error logs (`packages/astro-contracts/schemas/api/v1.md`, « Application error logs »).
 * A device token only: a request without one, or with a web session alone,
 * answers `401`; a private server that did not opt in answers
 * `404 not_available` before reading any credential.
 *
 * `GET /api/v1/app-logs` → `200 { accepting: true, retentionDays }`: the
 * phone asks it before it sends anything.
 */
// A phone with no space sends its logs with its anonymous
// bearer: thirty batches an hour per device (each of twenty entries at
// most, under the token's 500 a day) and 120 per network origin.
const withoutSpaceLimits = createWithoutSpaceLimits({
  perDevice: 30,
  perOrigin: 120,
  code: "app_log_limit",
  message: "Too many entries from this device: try again later.",
});

export async function GET(request) {
  if (!appLogsAccepted()) return appLogsNotAvailable();
  const access = await anonymousOrDeviceV1Access(request, {
    synchronize: false,
  });
  if (access.response) return access.response;
  return v1Json({
    accepting: true,
    retentionDays: APPLICATION_LOG_RETENTION_DAYS,
  });
}

/**
 * `POST /api/v1/app-logs` `{ token, entries }` (1 to 20 entries, 64 KiB at
 * most): checked against the contract (`400 invalid_request`, a token that is
 * not a UUID included), every entry checked by the sanitizer's rules
 * (`422 app_log_unredacted` with the index of the first entry and the rules'
 * names, never the value, and nothing kept), at most 500 entries of a
 * diagnostic token in 24 hours (`429 app_log_limit`, `Retry-After`), then
 * `201 { received, duplicates }`. An entry `device.incident` carries its
 * `incident`, kept with it; a composition that keeps the incidents apart
 * (`appLogs.incidents`) checks them more strictly first and records them
 * after. Kept 30 days under the diagnostic token
 * alone: the device token only opens the door, its space and
 * its device are never stored with a line, and the lines are not erased with
 * the space: they expire by age.
 */
export async function POST(request) {
  if (!appLogsAccepted()) return appLogsNotAvailable();
  const access = await anonymousOrDeviceV1Access(request, {
    synchronize: false,
  });
  if (access.response) return access.response;
  const limited = withoutSpaceLimits(request, access);
  if (limited) return limited;
  let batch;
  try {
    if (
      !/^application\/json\b/i.test(request.headers.get("content-type") || "")
    )
      throw new Error("not json");
    batch = validateAppLogBatch(
      await readJsonBody(request, { limit: APP_LOG_BODY_LIMIT_BYTES }),
    );
  } catch (error) {
    return v1Error(error?.code === "invalid_request" ? error : null, {
      code: "invalid_request",
      message: "A JSON batch { token, entries } of 64 KiB at most is required.",
      status: 400,
    });
  }
  // The device incidents of a composition that keeps them apart
  // (`appLogs.incidents`): its stricter reading refuses the batch as the
  // core's does, before anything is kept.
  const incidents = enabledServiceExtension("appLogs.incidents");
  for (const [index, entry] of batch.entries.entries()) {
    let rules = findUnsafeAppLogEntry(entry);
    if (!rules.length && incidents && entry.incident)
      rules = [...new Set(incidents.check(entry))];
    if (rules.length)
      return v1Json(
        {
          error: {
            code: "app_log_unredacted",
            message:
              "An entry still holds a value the application's logs never send: the batch was not kept.",
            entry: index,
            rules,
          },
        },
        { status: 422 },
      );
  }
  try {
    const repository = await appLogRepository();
    if (!repository) throw new Error("Logging storage is unavailable.");
    const outcome = await repository.recordMobileLogs({
      token: batch.token,
      entries: batch.entries,
    });
    if (outcome.status === "limited")
      return v1Json(
        {
          error: {
            code: "app_log_limit",
            message:
              "Too many entries from this device in 24 hours: try again later.",
          },
        },
        {
          status: 429,
          headers: { "Retry-After": String(outcome.retryAfterSeconds) },
        },
      );
    if (incidents && batch.entries.some((entry) => entry.incident))
      try {
        await incidents.record({
          token: batch.token,
          entries: batch.entries,
          now: new Date(),
        });
      } catch (error) {
        // The entries are kept in « Journaux »: the answer stays a success.
        recordBackendLog({
          level: "warning",
          event: "app-logs.incidents",
          message: `The device incidents of a batch were not recorded (${error?.message || "unknown error"}).`,
        });
      }
    return v1Json(
      { received: outcome.received, duplicates: outcome.duplicates },
      { status: 201 },
    );
  } catch (error) {
    return v1Error(error, {
      code: "app_log_storage_unavailable",
      message: "The entries could not be recorded.",
      status: 503,
    });
  }
}
