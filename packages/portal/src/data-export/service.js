import { createEquipmentReader } from "../persistence/equipment-reader.js";
import { createFramingResourceRepository } from "../persistence/framing-repository.js";
import { debriefRecordForPlanRow } from "../persistence/debrief-repository.js";
import { parseLayer, replacedByMap } from "../journal/session-rework-layer.js";
import {
  eventResourceForRow,
  sessionResourceForRow,
} from "../persistence/observation-session-repository.js";
import { derivedFieldsForRows } from "../persistence/session-derived.js";
import { listLivePlaces } from "../persistence/place-repository.js";
import { createPlaceSkyMeasureRepository } from "../persistence/place-sky-measure-repository.js";
import {
  createPlanResourceRepository,
  createPlannerStateRepository,
} from "../persistence/planner-state-repository.js";
import { projectResourceForRow } from "../persistence/project-reader.js";
import {
  DATA_EXPORT_FORMAT_VERSION,
  DATA_EXPORT_PARTS,
  dataExportCounts,
  dataExportDocuments,
  dataExportFileText,
  dataExportFilename,
} from "./rules.js";
import { ZIP_END_SIZE, zipArchive, zipEntrySize } from "./zip.js";

/**
 * « Exporter mes données » on the service: what one space holds, gathered
 * from the repositories into the `source` of the rule (`./rules.js`),
 * counted for `GET /v1/data-export/summary` and written as the ZIP of
 * `GET /v1/data-export`. Only the space of the credential is ever read:
 * every query is bounded by its `tenantId`. The gallery's images and the
 * capture records stay in the space.
 */

/** The service's UTC date, when the browser sent none. */
const utcDate = (now) => now().toISOString().slice(0, 10);

export class DataExportError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function createDataExportService({
  driver,
  dialect = driver?.dialect,
  now = () => new Date(),
}) {
  const plannerState = await createPlannerStateRepository({ driver, dialect });
  const planResources = await createPlanResourceRepository({ driver, dialect });
  const framings = await createFramingResourceRepository({ driver, dialect });
  const equipment = await createEquipmentReader({ driver, dialect });
  const skyMeasures = await createPlaceSkyMeasureRepository({
    driver,
    dialect,
  });

  async function journal(tenantId) {
    const sessionRows = (
      await driver.query(
        "SELECT * FROM observation_sessions WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY started_at, id",
        [tenantId],
      )
    ).rows;
    const sessions = [];
    const derived = await derivedFieldsForRows(driver, tenantId, sessionRows);
    for (const row of sessionRows) {
      const layer = parseLayer(row.rework_json);
      // A signal a rework replaced stays in the export (the log is never
      // erased), marked with the event that replaces it.
      const replacedBy = replacedByMap(layer);
      const hidden = new Set(layer.hidden);
      const events = (
        await driver.query(
          "SELECT * FROM session_events WHERE session_id = ? ORDER BY recorded_at, event_id",
          [row.id],
        )
      ).rows
        .map(eventResourceForRow)
        .map((event) =>
          replacedBy.has(event.eventId) || hidden.has(event.eventId)
            ? {
                ...event,
                rework: {
                  added: false,
                  targetId: layer.moves[event.eventId] ?? null,
                  ...(replacedBy.has(event.eventId)
                    ? { replacedBy: replacedBy.get(event.eventId) }
                    : {}),
                  ...(hidden.has(event.eventId) ? { removed: true } : {}),
                },
              }
            : event,
        );
      // The log stays as it was recorded; the rework is given beside it, as
      // the correction layer it is, with the outcome and the origin the
      // session resource already carries.
      sessions.push({
        ...sessionResourceForRow(row, derived.get(row.id)),
        events,
        ...(Number(row.rework_revision || 0) > 0
          ? {
              rework: {
                revision: Number(row.rework_revision),
                reworkedAt: row.reworked_at || null,
                targets: layer.targets,
                addedEvents: layer.addedEvents.map((event) =>
                  replacedBy.has(event.eventId)
                    ? { ...event, replacedBy: replacedBy.get(event.eventId) }
                    : event,
                ),
                eventMoves: layer.moves,
              },
            }
          : {}),
      });
    }
    const debriefs = (
      await driver.query(
        "SELECT * FROM plans WHERE tenant_id = ? AND deleted_at IS NULL AND frozen_at IS NOT NULL ORDER BY frozen_at, id",
        [tenantId],
      )
    ).rows
      .map((row) => {
        const record = debriefRecordForPlanRow(row);
        return record ? { planId: row.id, ...record } : null;
      })
      .filter(Boolean);
    return { sessions, debriefs };
  }

  async function projects(tenantId) {
    return (
      await driver.query(
        "SELECT * FROM projects WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY created_at, id",
        [tenantId],
      )
    ).rows.map(projectResourceForRow);
  }

  /** Everything the space holds, as the rule reads it. */
  async function source(tenantId) {
    const state = await plannerState.plannerState(tenantId);
    const plans = (await planResources.listPlanResources({ tenantId })).map(
      (resource) => ({
        ...resource.payload,
        resourceId: resource.id,
        status: resource.status,
      }),
    );
    const { sessions, debriefs } = await journal(tenantId);
    return {
      plans,
      // The planner's nights, as its document keeps them (a plan names its
      // night by `nightId`).
      nights: Array.isArray(state.nights) ? state.nights : [],
      projects: await projects(tenantId),
      // The space's live places, as the person wrote them, with the instant
      // of their last edit: never the usage, computed at read.
      places: (await listLivePlaces(driver, tenantId)).map(
        ({
          usage: _usage,
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          ...place
        }) => place,
      ),
      horizonProfiles: state.horizonProfiles || [],
      equipment: await equipment.listEquipment(tenantId),
      framings: await framings.list({ tenantId }),
      sessions,
      debriefs,
      skyMeasurements: (await skyMeasures.list({ tenantId })).places,
    };
  }

  function dateOf(date) {
    const day = date || utcDate(now);
    if (!dataExportFilename(day))
      throw new DataExportError(
        "invalid_request",
        "date must be a day written AAAA-MM-JJ.",
        400,
      );
    return day;
  }

  return {
    /**
     * The counts of the six boxes and what each adds to the ZIP (its entry,
     * deflated), plus what every archive carries anyway (the README and
     * the end record): the « environ » of the file line.
     */
    async summary({ tenantId, date = null }) {
      const day = dateOf(date);
      const data = await source(tenantId);
      const counts = dataExportCounts(data);
      const { files } = dataExportDocuments({
        parts: DATA_EXPORT_PARTS,
        exportedAt: now(),
        source: data,
      });
      const sizeOf = (file) =>
        zipEntrySize(file.name, dataExportFileText(file));
      const parts = {};
      for (const file of files.slice(1))
        parts[file.document.part] = {
          ...counts[file.document.part],
          estimatedBytes: sizeOf(file),
        };
      return {
        formatVersion: DATA_EXPORT_FORMAT_VERSION,
        date: day,
        filename: dataExportFilename(day),
        overheadBytes: sizeOf(files[0]) + ZIP_END_SIZE,
        parts,
      };
    },

    /** The ZIP of the ticked boxes, named with the day of the export. */
    async archive({ tenantId, parts, date = null }) {
      const day = dateOf(date);
      if (!Array.isArray(parts) || parts.length === 0)
        throw new DataExportError(
          "invalid_request",
          "Tick at least one box (parts).",
          400,
        );
      const exportedAt = now();
      const { files } = dataExportDocuments({
        parts,
        exportedAt,
        source: await source(tenantId),
      });
      return {
        filename: dataExportFilename(day),
        bytes: zipArchive(
          files.map((file) => ({
            name: file.name,
            data: dataExportFileText(file),
          })),
          { modifiedAt: exportedAt },
        ),
      };
    },
  };
}
