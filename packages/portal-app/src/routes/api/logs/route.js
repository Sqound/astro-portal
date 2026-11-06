import {
  normalizeClientLog,
  appLogRepository,
} from "../../../lib/app-log.server.js";
import {
  createRateLimiter,
  requestOrigin,
} from "../../../lib/rate-limit.server.js";
import { readJsonBody } from "portal/api/json-body.js";

/**
 * `POST /api/logs`: a browser reports a client-side failure, anonymously,
 * into the application log the administration reads:
 *
 * - at most 8 000 bytes, read as a stream — never trusting Content-Length;
 * - 30 entries per 5 minutes from one network origin, and 300 per 5
 *   minutes for the whole process, so many origins together cannot flood
 *   the log either;
 * - stored as plain text: control and direction-changing characters are
 *   removed (`normalizeClientLog`), the source is always `client`, and the
 *   administration shows it as text, never as markup.
 */
const perOrigin = createRateLimiter({ windowMs: 5 * 60_000, max: 30 });
const perProcess = createRateLimiter({ windowMs: 5 * 60_000, max: 300 });

function tooMany(retryAfterSeconds) {
  return Response.json(
    { error: "Too many log entries." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

export async function POST(request) {
  const origin = perOrigin.check(requestOrigin(request));
  if (!origin.allowed) return tooMany(origin.retryAfterSeconds);
  const overall = perProcess.check("all");
  if (!overall.allowed) return tooMany(overall.retryAfterSeconds);
  perOrigin.record(requestOrigin(request));
  perProcess.record("all");
  let entry;
  try {
    entry = normalizeClientLog(await readJsonBody(request, { limit: 8_000 }));
  } catch (error) {
    if (error?.code === "payload_too_large")
      return Response.json(
        { error: "Log payload too large." },
        { status: 413 },
      );
    return Response.json({ error: "Invalid log payload." }, { status: 400 });
  }
  try {
    const repository = await appLogRepository();
    if (!repository)
      return Response.json(
        { error: "Logging storage is unavailable." },
        { status: 503 },
      );
    await repository.recordAppLog(entry);
    return Response.json({ accepted: true }, { status: 202 });
  } catch {
    return Response.json({ error: "Invalid log payload." }, { status: 400 });
  }
}
