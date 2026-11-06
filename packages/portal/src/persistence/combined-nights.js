import { nightEveningDate } from "./night-evening-date.js";
import { planCaptureFieldsOf } from "./plan-capture-fields.js";

// The longitude of the place a night names itself, or `null`. Read here, not
// through `session-derived.js`, which the image server (`server.mjs`) must
// not load for it.
function longitudeOf(placeJson) {
  try {
    const longitude = Number(JSON.parse(placeJson || "null")?.longitude);
    return Number.isFinite(longitude) ? longitude : null;
  } catch {
    return null;
  }
}

/**
 * The evenings (`YYYY-MM-DD`, oldest first, each once) of the nights the
 * image of a multi-night plan combines (`captures.plan_json.combinedNightIds`):
 * the date of a night is its plan's date, else the evening of its start at
 * its longitude (the definition of the integrations). A capture of one
 * night, and a plan image that names no night the space holds, answer `[]`.
 * Bounded by the capture's space: a night of another space is never read.
 */
export async function combinedEveningDates(db, tenantId, capture) {
  if (capture?.session_id || !capture?.plan_json) return [];
  const ids = planCaptureFieldsOf(capture.plan_json)
    .combinedNightIds.filter((id) => typeof id === "string" && id)
    .slice(0, 100);
  if (!ids.length) return [];
  const rows = (
    await db.query(
      `SELECT s.started_at, s.place_json, p.plan_date
       FROM observation_sessions s
       LEFT JOIN plans p ON p.id = s.plan_id AND p.tenant_id = s.tenant_id
       WHERE s.tenant_id = ? AND s.id IN (${ids.map(() => "?").join(", ")})`,
      [tenantId, ...ids],
    )
  ).rows;
  const dates = rows
    .map((row) =>
      nightEveningDate({
        planDate: row.plan_date,
        startedAt: row.started_at,
        longitude: longitudeOf(row.place_json),
      }),
    )
    .filter(Boolean);
  return [...new Set(dates)].sort();
}
