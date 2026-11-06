// Builds the records of the sample from a source database and a selection of
// sessions: each table is read through a whitelist of columns, every
// identifier is renumbered, every place becomes the sample place, the images
// of the captures are cleaned. What is built is then held to the same rules
// the verifier applies (record-checks.mjs); a hit stops the export.
import { createHash } from "node:crypto";
import { astronomicalNightWindow } from "astro-core/night-window.js";
import {
  DOCUMENT_KINDS_KEPT,
  EPOCH,
  INTEGER_COLUMNS,
  PACK_ROOT,
  REAL_COLUMNS,
  RECORD_TABLES,
  SAMPLE_PLACE,
  TABLE_COLUMNS,
} from "./constants.mjs";
import {
  IdMap,
  OWNER_PLACEHOLDER,
  TENANT_PLACEHOLDER,
  sampleUuid,
} from "./ids.mjs";
import {
  ImageError,
  cleanImage,
  imageExtension,
  sniffImage,
} from "./images.mjs";
import { isPlaceObject, isPlainObject } from "./patterns.mjs";
import {
  formatFinding,
  imageListFindings,
  recordFindings,
  structureFindings,
} from "./record-checks.mjs";
import {
  Report,
  samplePlace,
  scrubAnalysisReport,
  scrubValue,
} from "./scrub.mjs";

export class LeakError extends Error {
  constructor(findings) {
    const shown = findings.slice(0, 40).map(formatFinding);
    super(
      `${findings.length} value(s) break the anonymisation rules; nothing was written.\n` +
        shown.map((line) => `  - ${line}`).join("\n") +
        (findings.length > shown.length
          ? `\n  … and ${findings.length - shown.length} more`
          : ""),
    );
    this.name = "LeakError";
    this.findings = findings;
  }
}

const pad = (rank, width = 2) => String(rank).padStart(width, "0");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const byKey =
  (...keys) =>
  (a, b) => {
    for (const key of keys) {
      const left = String(a[key] ?? "");
      const right = String(b[key] ?? "");
      if (left !== right) return left < right ? -1 : 1;
    }
    return 0;
  };

function parseJsonColumn(table, column, text) {
  if (text === null || text === undefined || text === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON in ${table}.${column}.`);
  }
}

function stringsIn(value, into = new Set()) {
  if (typeof value === "string") into.add(value);
  else if (Array.isArray(value))
    for (const item of value) stringsIn(item, into);
  else if (isPlainObject(value))
    for (const item of Object.values(value)) stringsIn(item, into);
  return into;
}

function placeIdsIn(value, into = new Set()) {
  if (Array.isArray(value)) for (const item of value) placeIdsIn(item, into);
  else if (isPlainObject(value)) {
    if (isPlaceObject(value) && typeof value.id === "string")
      into.add(value.id);
    else for (const item of Object.values(value)) placeIdsIn(item, into);
  }
  return into;
}

/** Only the whitelisted columns, in their order, with numbers as numbers. */
function pick(table, row) {
  const record = {};
  for (const column of TABLE_COLUMNS[table]) {
    if (!(column in row)) continue;
    let value = row[column];
    if (value !== null && value !== undefined) {
      if (INTEGER_COLUMNS[table]?.includes(column)) value = Number(value);
      else if (REAL_COLUMNS[table]?.includes(column)) value = Number(value);
    }
    record[column] = value ?? null;
  }
  return record;
}

const truncatedToSecond = (iso) =>
  new Date(Math.floor(new Date(iso).getTime() / 1000) * 1000).toISOString();

/** The night of a date at the sample place, computed by the core's own function. */
function nightBounds(date) {
  const window = astronomicalNightWindow({
    date,
    latitude: SAMPLE_PLACE.latitude,
    longitude: SAMPLE_PLACE.longitude,
    elevation: SAMPLE_PLACE.elevation,
  });
  return window
    ? {
        start: truncatedToSecond(window.start),
        end: truncatedToSecond(window.end),
      }
    : { start: null, end: null };
}

const SESSION_COLUMNS = [
  "id",
  "tenant_id",
  "plan_id",
  "started_at",
  "finished_at",
  "status",
  "created_at",
  "client_session_id",
  "updated_at",
  "package_documents_json",
];

/**
 * @returns {{ records: object, images: {captureId: string, path: string, bytes: Buffer}[], report: Report, sourceSchemaVersion: number|null }}
 */
export async function buildRecords({
  source,
  selection,
  captureFiles,
  options = {},
}) {
  const {
    forbid = [],
    near = null,
    allowUrls = false,
    allowMediaLicences = [],
    withSessionDocuments = false,
    maxPackBytes = Infinity,
  } = options;
  const report = new Report();
  const ids = new IdMap();
  const context = { ids, report };
  const oldTenant = selection.tenantId;
  const TENANT = TENANT_PLACEHOLDER;
  const USER = OWNER_PLACEHOLDER;
  ids.alias("tenant", oldTenant, TENANT);
  ids.issue(USER);
  ids.issue(sampleUuid("place", 1));

  // ---- sessions
  const sessions = [...selection.sessions].sort(byKey("started_at", "id"));
  const sessionIds = sessions.map((row) => row.id);
  ids.register("session", sessionIds);
  const sessionRank = new Map(sessionIds.map((id, index) => [id, index + 1]));
  const sessionRows = await source.selectIn(
    "observation_sessions",
    SESSION_COLUMNS,
    "id",
    sessionIds,
  );
  const sessionById = new Map(sessionRows.map((row) => [row.id, row]));

  // ---- captures: the bytes decide which ones travel
  const captureRows = (
    await source.selectIn(
      "captures",
      TABLE_COLUMNS.captures,
      "session_id",
      sessionIds,
    )
  ).sort(
    (a, b) =>
      sessionRank.get(a.session_id) - sessionRank.get(b.session_id) ||
      byKey("created_at", "id")(a, b),
  );
  const keptCaptures = [];
  const images = [];
  const usedDigests = new Set();
  const perSession = new Map();
  let notFound = 0;
  let imageBytes = 0;
  for (const row of captureRows) {
    const bytes = await captureFiles.find({
      tenantId: oldTenant,
      sha256: row.sha256,
      byteSize: Number(row.byte_size),
    });
    if (!bytes) {
      notFound += 1;
      report.add("capture-excluded:file-not-found");
      continue;
    }
    if (!sniffImage(bytes)) {
      report.add("capture-excluded:not-a-jpeg-or-png");
      continue;
    }
    let cleaned;
    try {
      cleaned = cleanImage(bytes);
    } catch (error) {
      if (!(error instanceof ImageError)) throw error;
      report.add("capture-excluded:unreadable-image");
      continue;
    }
    const digest = sha256(cleaned.bytes);
    if (usedDigests.has(digest)) {
      report.add("capture-excluded:duplicate-after-cleaning");
      continue;
    }
    usedDigests.add(digest);
    for (const removed of cleaned.removed)
      report.add(`image-part-removed:${removed.part}`);
    const rank = (perSession.get(row.session_id) || 0) + 1;
    perSession.set(row.session_id, rank);
    const name = `image-${pad(rank, 4)}${imageExtension(cleaned.format)}`;
    imageBytes += cleaned.bytes.length;
    keptCaptures.push({
      row,
      digest,
      byteSize: cleaned.bytes.length,
      name,
      path: `${PACK_ROOT}/session-${pad(sessionRank.get(row.session_id))}/${name}`,
    });
    images.push({
      oldId: row.id,
      path: keptCaptures.at(-1).path,
      bytes: cleaned.bytes,
    });
  }
  if (captureRows.length && notFound === captureRows.length)
    throw new Error(
      `None of the ${captureRows.length} capture files was found under the folders given (--captures-dir, --images-dir).`,
    );
  if (imageBytes > maxPackBytes)
    throw new Error(
      `The images weigh ${imageBytes} bytes: more than the ${maxPackBytes} allowed for the pack. Select fewer sessions.`,
    );
  ids.register(
    "capture",
    keptCaptures.map((entry) => entry.row.id),
  );
  const captureIds = keptCaptures.map((entry) => entry.row.id);
  for (const image of images) {
    image.captureId = ids.require("capture", image.oldId);
    delete image.oldId;
  }

  // ---- plans and what hangs from them
  const hasDeletedAt =
    (await source.existing("plans", ["deleted_at"])).length > 0;
  const planIdSet = new Set(sessions.map((row) => row.plan_id).filter(Boolean));
  for (const entry of keptCaptures)
    if (entry.row.plan_id) planIdSet.add(entry.row.plan_id);
  const planRows = (
    await source.selectIn("plans", TABLE_COLUMNS.plans, "id", [...planIdSet], {
      where: hasDeletedAt ? "deleted_at IS NULL" : "",
    })
  ).sort(byKey("plan_date", "created_at", "id"));
  const planIds = planRows.map((row) => row.id);
  ids.register("plan", planIds);
  ids.register(
    "planClient",
    planRows.map((row) => row.client_id),
    { readable: "sample-plan" },
  );
  const parsedPlans = new Map();
  for (const row of planRows)
    parsedPlans.set(row.id, {
      location: parseJsonColumn("plans", "location_json", row.location_json),
      equipment: parseJsonColumn("plans", "equipment_json", row.equipment_json),
      settings: parseJsonColumn("plans", "settings_json", row.settings_json),
      payload: parseJsonColumn("plans", "payload_json", row.payload_json),
    });
  // Places and nights are named by hashes of their coordinates: alias every one.
  const oldPlaceIds = new Set();
  for (const parsed of parsedPlans.values())
    for (const value of Object.values(parsed)) placeIdsIn(value, oldPlaceIds);
  for (const row of await source.select("known_locations", ["client_id"], {
    where: "tenant_id = ?",
    params: [oldTenant],
  }))
    oldPlaceIds.add(row.client_id);
  for (const id of oldPlaceIds) ids.alias("place", id, SAMPLE_PLACE.id);
  const nightDates = new Map();
  for (const row of planRows) {
    const parsed = parsedPlans.get(row.id);
    for (const nightId of [parsed.settings?.nightId, parsed.payload?.nightId])
      if (typeof nightId === "string") nightDates.set(nightId, row.plan_date);
  }
  for (const [nightId, date] of nightDates)
    ids.alias("night", nightId, `sample-night-${date}`);

  const planItemRows = (
    await source.selectIn(
      "plan_items",
      TABLE_COLUMNS.plan_items,
      "plan_id",
      planIds,
    )
  ).sort(
    (a, b) =>
      planIds.indexOf(a.plan_id) - planIds.indexOf(b.plan_id) ||
      byKey("created_at", "client_id", "id")(a, b),
  );
  ids.register(
    "planItem",
    planItemRows.map((row) => row.id),
  );
  const planFramingRows = await source.selectIn(
    "plan_framings",
    TABLE_COLUMNS.plan_framings,
    "plan_id",
    planIds,
  );
  const framingRows = (
    await source.selectIn(
      "framings",
      TABLE_COLUMNS.framings,
      "id",
      [...new Set(planFramingRows.map((row) => row.framing_id))],
      {
        where: (await source.existing("framings", ["deleted_at"])).length
          ? "deleted_at IS NULL"
          : "",
      },
    )
  ).sort(byKey("created_at", "id"));
  ids.register(
    "framing",
    framingRows.map((row) => row.id),
  );
  const framingIdSet = new Set(framingRows.map((row) => row.id));

  // ---- events, supplements, analyses
  const eventRows = (
    await source.selectIn(
      "session_events",
      TABLE_COLUMNS.session_events,
      "session_id",
      sessionIds,
    )
  ).sort(
    (a, b) =>
      sessionRank.get(a.session_id) - sessionRank.get(b.session_id) ||
      byKey("received_at", "event_id")(a, b),
  );
  const supplementRows = (
    await source.selectIn(
      "session_supplements",
      TABLE_COLUMNS.session_supplements,
      "session_id",
      sessionIds,
    )
  ).sort(
    (a, b) =>
      sessionRank.get(a.session_id) - sessionRank.get(b.session_id) ||
      byKey("created_at", "id")(a, b),
  );
  ids.register(
    "supplement",
    supplementRows.map((row) => row.id),
  );
  const analysisRows = (
    await source.selectIn(
      "session_analyses",
      TABLE_COLUMNS.session_analyses,
      "session_id",
      sessionIds,
    )
  ).sort(
    (a, b) =>
      sessionRank.get(a.session_id) - sessionRank.get(b.session_id) ||
      byKey("created_at", "id")(a, b),
  );
  ids.register(
    "analysis",
    analysisRows.map((row) => row.id),
  );

  // ---- equipment: only what the retained things use
  const tenantEquipment = await source.select(
    "equipment",
    TABLE_COLUMNS.equipment,
    {
      where: "tenant_id = ?",
      params: [oldTenant],
    },
  );
  const equipmentIdsOfTenant = new Set(tenantEquipment.map((row) => row.id));
  const referenced = new Set();
  const consider = (value) => {
    for (const text of stringsIn(value))
      if (equipmentIdsOfTenant.has(text)) referenced.add(text);
  };
  const assignmentRows = await source.selectIn(
    "capture_equipment",
    TABLE_COLUMNS.capture_equipment,
    "capture_id",
    captureIds,
  );
  for (const row of assignmentRows) referenced.add(row.equipment_id);
  for (const parsed of parsedPlans.values()) consider(Object.values(parsed));
  for (const row of eventRows)
    consider(parseJsonColumn("session_events", "payload", row.payload));
  for (const row of supplementRows)
    consider(parseJsonColumn("session_supplements", "payload", row.payload));
  const equipmentRows = tenantEquipment
    .filter((row) => referenced.has(row.id))
    .sort(
      byKey("equipment_type", "preference_order", "name", "created_at", "id"),
    );
  ids.register(
    "equipment",
    equipmentRows.map((row) => row.id),
  );
  const equipmentKept = new Set(equipmentRows.map((row) => row.id));

  // ---- target media (records only, by licence)
  const targetIds = new Set();
  const captureTargetRows = await source.selectIn(
    "capture_targets",
    TABLE_COLUMNS.capture_targets,
    "capture_id",
    captureIds,
  );
  for (const row of captureTargetRows) targetIds.add(row.target_id);
  for (const row of framingRows)
    if (row.catalogue_target_id) targetIds.add(row.catalogue_target_id);
  const mediaRows = [];
  for (const row of await source.selectIn(
    "target_media",
    TABLE_COLUMNS.target_media,
    "target_id",
    [...targetIds],
  )) {
    const metadata =
      parseJsonColumn("target_media", "metadata_json", row.metadata_json) || {};
    const licence =
      typeof metadata.license === "string" ? metadata.license : "";
    if (!allowMediaLicences.some((pattern) => pattern.test(licence))) {
      report.add("target-media-excluded:licence-not-allowed");
      continue;
    }
    mediaRows.push({ row, metadata });
  }
  mediaRows.sort((a, b) => byKey("target_id", "variant", "id")(a.row, b.row));
  ids.register(
    "targetMedia",
    mediaRows.map((entry) => entry.row.id),
  );

  // ================================================================ records
  const records = Object.fromEntries(RECORD_TABLES.map((table) => [table, []]));
  const scrub = (value) => scrubValue(value, context);

  for (const row of equipmentRows)
    records.equipment.push({
      ...pick("equipment", row),
      id: ids.require("equipment", row.id),
      tenant_id: TENANT,
      specifications_json: scrub(
        parseJsonColumn(
          "equipment",
          "specifications_json",
          row.specifications_json,
        ) ?? {},
      ),
      planner_json: scrub(
        parseJsonColumn("equipment", "planner_json", row.planner_json) ?? {},
      ),
    });

  if (planRows.length || sessions.length)
    records.known_locations.push({
      id: sampleUuid("place", 1),
      tenant_id: TENANT,
      client_id: SAMPLE_PLACE.id,
      details_json: samplePlace(),
      created_at: EPOCH,
      updated_at: EPOCH,
      edited_at: EPOCH,
    });

  if (planRows.length) {
    const nights = new Map();
    for (const row of planRows) {
      const id = `sample-night-${row.plan_date}`;
      nights.set(id, { id, date: row.plan_date, location: samplePlace() });
    }
    const last = planRows.at(-1);
    records.planner_contexts.push({
      tenant_id: TENANT,
      details_json: {
        schemaVersion: 2,
        nights: [...nights.values()].sort(byKey("date", "id")),
        activeNightId: `sample-night-${last.plan_date}`,
        activePlanId: ids.require("planClient", last.client_id),
        date: last.plan_date,
      },
      updated_at: EPOCH,
    });
  }

  for (const row of framingRows)
    records.framings.push({
      ...pick("framings", row),
      id: ids.require("framing", row.id),
      tenant_id: TENANT,
      created_by_user_id: USER,
      origin_device_id: null,
      payload_json: scrub(
        parseJsonColumn("framings", "payload_json", row.payload_json) ?? {},
      ),
    });

  for (const row of planRows) {
    const parsed = parsedPlans.get(row.id);
    const bounds = nightBounds(row.plan_date);
    const clean = (value) => (value === null ? null : scrub(value));
    records.plans.push({
      ...pick("plans", row),
      id: ids.require("plan", row.id),
      tenant_id: TENANT,
      created_by_user_id: USER,
      client_id: ids.require("planClient", row.client_id),
      location_json: clean(parsed.location),
      equipment_json: clean(parsed.equipment),
      settings_json: clean(parsed.settings),
      payload_json: clean(parsed.payload),
      night_start_at: bounds.start,
      night_end_at: bounds.end,
      night_bounds_resolved_at: row.updated_at,
      deleted_at: null,
    });
  }
  for (const row of planItemRows)
    records.plan_items.push({
      ...pick("plan_items", row),
      id: ids.require("planItem", row.id),
      tenant_id: TENANT,
      plan_id: ids.require("plan", row.plan_id),
      details_json: scrub(
        parseJsonColumn("plan_items", "details_json", row.details_json) ?? {},
      ),
    });
  for (const row of planFramingRows)
    if (framingIdSet.has(row.framing_id))
      records.plan_framings.push({
        tenant_id: TENANT,
        plan_id: ids.require("plan", row.plan_id),
        framing_id: ids.require("framing", row.framing_id),
      });

  for (const row of sessions) {
    const full = sessionById.get(row.id);
    let documents = null;
    const declared = parseJsonColumn(
      "observation_sessions",
      "package_documents_json",
      full?.package_documents_json,
    );
    if (Array.isArray(declared)) {
      if (withSessionDocuments) {
        documents = [];
        for (const document of declared) {
          if (
            !DOCUMENT_KINDS_KEPT.includes(document?.kind) ||
            !/^(?:metrics|events)\/[a-z0-9._-]+$/.test(String(document?.path))
          ) {
            report.add("session-document-excluded:kind-or-name");
            continue;
          }
          let text;
          try {
            text = new TextDecoder("utf-8", { fatal: true }).decode(
              Buffer.from(String(document.content || ""), "base64"),
            );
          } catch {
            report.add("session-document-excluded:not-text");
            continue;
          }
          documents.push({
            path: document.path,
            kind: document.kind,
            mimeType: document.mimeType ?? null,
            capturedAt: document.capturedAt ?? null,
            addedAt: document.addedAt,
            text,
          });
        }
        if (!documents.length) documents = null;
      } else if (declared.length)
        report.add("session-document-excluded:not-requested", declared.length);
    }
    records.observation_sessions.push({
      ...pick("observation_sessions", full || row),
      id: ids.require("session", row.id),
      tenant_id: TENANT,
      plan_id:
        row.plan_id && ids.get("plan", row.plan_id)
          ? ids.get("plan", row.plan_id)
          : null,
      client_session_id: null,
      package_documents_json: documents,
    });
  }
  for (const row of eventRows)
    records.session_events.push({
      ...pick("session_events", row),
      session_id: ids.require("session", row.session_id),
      payload: scrub(
        parseJsonColumn("session_events", "payload", row.payload) ?? {},
      ),
      origin_device_id: null,
    });
  for (const row of supplementRows)
    records.session_supplements.push({
      ...pick("session_supplements", row),
      id: ids.require("supplement", row.id),
      session_id: ids.require("session", row.session_id),
      origin_device_id: null,
      payload: scrub(
        parseJsonColumn("session_supplements", "payload", row.payload) ?? {},
      ),
      event_ids_json: scrub(
        parseJsonColumn(
          "session_supplements",
          "event_ids_json",
          row.event_ids_json,
        ),
      ),
      payload_fingerprint: null,
    });
  for (const row of analysisRows)
    records.session_analyses.push({
      ...pick("session_analyses", row),
      id: ids.require("analysis", row.id),
      tenant_id: TENANT,
      session_id: ids.require("session", row.session_id),
      report_json: scrub(
        scrubAnalysisReport(
          parseJsonColumn("session_analyses", "report_json", row.report_json) ??
            {},
          context,
        ),
      ),
    });

  keptCaptures.forEach((entry, index) => {
    const { row } = entry;
    records.captures.push({
      ...pick("captures", row),
      id: ids.require("capture", row.id),
      tenant_id: TENANT,
      session_id: ids.require("session", row.session_id),
      plan_id:
        row.plan_id && ids.get("plan", row.plan_id)
          ? ids.get("plan", row.plan_id)
          : null,
      original_name: entry.name,
      sha256: entry.digest,
      byte_size: entry.byteSize,
    });
  });
  for (const row of captureTargetRows.sort(
    (a, b) =>
      captureIds.indexOf(a.capture_id) - captureIds.indexOf(b.capture_id) ||
      Number(a.position) - Number(b.position),
  ))
    records.capture_targets.push({
      ...pick("capture_targets", row),
      capture_id: ids.require("capture", row.capture_id),
    });
  const assignments = assignmentRows
    .filter((row) => equipmentKept.has(row.equipment_id))
    .sort(
      (a, b) =>
        captureIds.indexOf(a.capture_id) - captureIds.indexOf(b.capture_id) ||
        byKey("assignment_role")(a, b) ||
        equipmentRows.findIndex((row) => row.id === a.equipment_id) -
          equipmentRows.findIndex((row) => row.id === b.equipment_id),
    );
  ids.register(
    "captureEquipment",
    assignments.map((row) => row.id),
  );
  for (const row of assignments)
    records.capture_equipment.push({
      ...pick("capture_equipment", row),
      id: ids.require("captureEquipment", row.id),
      tenant_id: TENANT,
      capture_id: ids.require("capture", row.capture_id),
      equipment_id: ids.require("equipment", row.equipment_id),
    });

  const KEPT_MEDIA_KEYS = [
    "file",
    "survey",
    "source",
    "credit",
    "license",
    "title",
    "generatedAt",
    "kind",
  ];
  for (const { row, metadata } of mediaRows)
    records.target_media.push({
      ...pick("target_media", row),
      id: ids.require("targetMedia", row.id),
      metadata_json: Object.fromEntries(
        KEPT_MEDIA_KEYS.filter((key) => key in metadata).map((key) => [
          key,
          metadata[key],
        ]),
      ),
    });

  report.add("identifier-unexported-reference", ids.danglingCount());
  const imageList = images.map(({ captureId, path }) => ({ captureId, path }));
  records.images = imageList;

  // ---- the same rules the verifier applies
  const findings = [
    ...structureFindings(records),
    ...recordFindings(records, { forbid, near, allowUrls }),
    ...imageListFindings(imageList, records.captures),
  ];
  if (findings.length) throw new LeakError(findings);

  return {
    records,
    images: images.map(({ captureId, path, bytes }) => ({
      captureId,
      path,
      bytes,
    })),
    report,
    sourceSchemaVersion: await source.schemaVersion(),
  };
}
