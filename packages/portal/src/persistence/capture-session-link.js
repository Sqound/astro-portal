import { nightEveningDate } from "./night-evening-date.js";
import { planItemTargetKeys, text } from "./plan-project-links.js";

/**
 * The session a capture joins when it arrives without one (api/v1.md « A
 * capture and its session »): the session of the capture's night — its
 * `eveningDate`, the definition of the integrations — that carries one of
 * the capture's targets. The place breaks a tie (a session whose place is
 * the plan's), then the earliest start, then the id. `null` when no session
 * of the space is of that night and carries the target: **no session is
 * invented for a capture**.
 *
 * A session carries a target when its own list, its plan's items, its
 * acquisition steps or its field events name it. Every query is bounded by
 * the space.
 */

const DAY_MS = 86_400_000;
const parseJson = (value, fallback = null) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};
const finite = (value) => {
  const number = Number(value);
  return value !== null && value !== undefined && Number.isFinite(number)
    ? number
    : null;
};

/** The calendar date `YYYY-MM-DD` of an ISO instant or date, or `null`. */
export const calendarDay = (value) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)
    ? value.slice(0, 10)
    : null;

/**
 * @param {object} db a driver (or a transaction): `query`
 * @param {string} tenantId
 * @param {{ eveningDate: string, targetIds: string[], placeName?: string|null }} night
 * @returns {Promise<{ id: string, planId: string|null }|null>}
 */
export async function sessionCarryingTarget(
  db,
  tenantId,
  { eveningDate, targetIds, placeName = null },
) {
  const day = calendarDay(eveningDate);
  const wanted = new Set((targetIds ?? []).map(text).filter(Boolean));
  const middle = Date.parse(`${day}T12:00:00Z`);
  if (!day || !wanted.size || !Number.isFinite(middle)) return null;
  const from = new Date(middle - 2 * DAY_MS).toISOString();
  const to = new Date(middle + 3 * DAY_MS).toISOString();
  const rows = (
    await db.query(
      `SELECT s.id, s.plan_id, s.started_at, s.place_json, s.target_ids_json,
              p.plan_date, p.payload_json, p.location_json
       FROM observation_sessions s LEFT JOIN plans p ON p.id = s.plan_id
       WHERE s.tenant_id = ?
         AND (p.plan_date = ? OR (s.started_at >= ? AND s.started_at < ?))`,
      [tenantId, day, from, to],
    )
  ).rows;
  const wantedPlace = text(placeName)?.toLowerCase() ?? null;
  const found = [];
  for (const row of rows) {
    const place = parseJson(row.place_json, null);
    if (
      nightEveningDate({
        planDate: row.plan_date ?? null,
        startedAt: row.started_at,
        longitude: finite(place?.longitude),
      }) !== day
    )
      continue;
    const met = new Set();
    for (const id of parseJson(row.target_ids_json, null) ?? [])
      if (text(id)) met.add(text(id));
    const payload = parseJson(row.payload_json, null);
    for (const item of Array.isArray(payload?.items) ? payload.items : [])
      for (const key of planItemTargetKeys(item)) met.add(key);
    for (const step of (
      await db.query(
        "SELECT DISTINCT target_id FROM acquisition_steps WHERE session_id = ? AND target_id IS NOT NULL",
        [row.id],
      )
    ).rows)
      met.add(step.target_id);
    for (const event of (
      await db.query(
        "SELECT payload FROM session_events WHERE session_id = ? AND type IN ('target_started', 'target_finished')",
        [row.id],
      )
    ).rows) {
      const id = text(parseJson(event.payload, null)?.targetId);
      if (id) met.add(id);
    }
    if (![...wanted].some((id) => met.has(id))) continue;
    const planPlace = text(parseJson(row.location_json, null)?.name);
    const sessionPlace = text(place?.name);
    const samePlace =
      wantedPlace !== null &&
      [planPlace, sessionPlace].some(
        (name) => name && name.toLowerCase() === wantedPlace,
      );
    found.push({
      id: row.id,
      planId: row.plan_id ?? null,
      startedAt: row.started_at ?? "",
      samePlace,
    });
  }
  found.sort(
    (left, right) =>
      Number(right.samePlace) - Number(left.samePlace) ||
      left.startedAt.localeCompare(right.startedAt) ||
      left.id.localeCompare(right.id),
  );
  return found[0] ? { id: found[0].id, planId: found[0].planId } : null;
}
