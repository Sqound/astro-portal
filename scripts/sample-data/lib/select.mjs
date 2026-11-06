// Which observation sessions the sample is made of: an explicit list, or a
// filter on the instrument (--equipment), on the dates (--from/--to), on the
// space (--tenant). The filters combine; an explicit list excludes them.
import { fold, isPlainObject } from "./patterns.mjs";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class SelectionError extends Error {
  constructor(message) {
    super(message);
    this.name = "SelectionError";
  }
}

function stringsIn(value, into) {
  if (typeof value === "string") into.add(value);
  else if (Array.isArray(value))
    for (const item of value) stringsIn(item, into);
  else if (isPlainObject(value))
    for (const item of Object.values(value)) stringsIn(item, into);
  return into;
}

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/**
 * @returns {{ tenantId: string, sessions: object[] }} the selected session
 * rows (id, tenant_id, plan_id, started_at, ...), all from one space.
 */
export async function selectSessions(
  source,
  { sessions = [], equipment = [], from = null, to = null, tenant = null } = {},
) {
  const explicit = sessions.length > 0;
  const filtered = equipment.length > 0 || from || to;
  if (explicit && filtered)
    throw new SelectionError(
      "--sessions cannot be combined with --equipment, --from or --to.",
    );
  if (!explicit && !filtered && !tenant)
    throw new SelectionError(
      "Say which sessions to export: --sessions <ids>, or --equipment <name>, --from/--to.",
    );
  for (const date of [from, to])
    if (date && !DATE.test(date))
      throw new SelectionError("--from and --to expect YYYY-MM-DD dates.");

  let rows = await source.select("observation_sessions", [
    "id",
    "tenant_id",
    "plan_id",
    "started_at",
    "finished_at",
    "status",
    "created_at",
    "updated_at",
  ]);
  if (tenant) rows = rows.filter((row) => row.tenant_id === tenant);

  if (explicit) {
    const wanted = new Set(sessions);
    const found = new Set(rows.map((row) => row.id));
    const missing = [...wanted].filter((id) => !found.has(id));
    if (missing.length)
      throw new SelectionError(
        `${missing.length} session(s) not found in the database: ${missing.join(", ")}.`,
      );
    rows = rows.filter((row) => wanted.has(row.id));
  }
  if (from)
    rows = rows.filter((row) => String(row.started_at).slice(0, 10) >= from);
  if (to)
    rows = rows.filter((row) => String(row.started_at).slice(0, 10) <= to);

  if (equipment.length) {
    const names = new Set(equipment.map((name) => fold(name.trim())));
    const items = await source.select("equipment", ["id", "tenant_id", "name"]);
    const matched = items.filter((item) => names.has(fold(item.name)));
    for (const name of names)
      if (!matched.some((item) => fold(item.name) === name))
        throw new SelectionError(
          "No equipment item has the name given to --equipment.",
        );
    const equipmentIds = new Set(matched.map((item) => item.id));

    // Sessions with a capture assigned to it...
    const assigned = await source.selectIn(
      "capture_equipment",
      ["capture_id", "equipment_id"],
      "equipment_id",
      [...equipmentIds],
    );
    const capturesOf = new Set(assigned.map((row) => row.capture_id));
    const captureRows = await source.select("captures", ["id", "session_id"]);
    const viaCaptures = new Set(
      captureRows
        .filter((row) => capturesOf.has(row.id) && row.session_id)
        .map((row) => row.session_id),
    );
    // ... or whose plan names it.
    const planIds = rows.map((row) => row.plan_id).filter(Boolean);
    const viaPlans = new Set();
    for (const plan of await source.selectIn(
      "plans",
      ["id", "equipment_json", "settings_json", "payload_json"],
      "id",
      planIds,
    )) {
      const strings = new Set();
      for (const column of ["equipment_json", "settings_json", "payload_json"])
        stringsIn(parseJson(plan[column]), strings);
      if ([...equipmentIds].some((id) => strings.has(id)))
        viaPlans.add(plan.id);
    }
    rows = rows.filter(
      (row) =>
        viaCaptures.has(row.id) || (row.plan_id && viaPlans.has(row.plan_id)),
    );
  }

  if (!rows.length)
    throw new SelectionError("No session matches the selection.");
  const tenants = new Set(rows.map((row) => row.tenant_id));
  if (tenants.size > 1)
    throw new SelectionError(
      `The selection spans ${tenants.size} spaces; restrict it with --tenant <space id>.`,
    );
  rows.sort((a, b) =>
    `${a.started_at}|${a.id}` < `${b.started_at}|${b.id}` ? -1 : 1,
  );
  return { tenantId: rows[0].tenant_id, sessions: rows };
}
