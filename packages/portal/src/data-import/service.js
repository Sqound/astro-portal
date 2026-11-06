import { publishChange } from "../api/change-bus.js";
import { calibrationValuesChanged } from "../calibration/refresh-hook.js";
import { applyMigrations } from "../persistence/migration-runner.js";
import {
  dataImportIdentifiers,
  dataImportPlan,
  dataImportReport,
} from "./plan.js";
import { readDataExport } from "./reader.js";
import { existingForImport, lockSpace, writeDataImport } from "./store.js";

/**
 * « Importer mes données » on a private portal: the file of « Exporter mes
 * données » read, then planned against what the credential's space holds.
 * `preview` (the dry run) writes nothing and answers the plan; `confirm`
 * runs the same plan again inside one transaction — every record « to
 * import » enters, or none — and answers it with what was written.
 * Idempotent by identifier: a second import of the same file writes nothing
 * and counts everything « déjà présent » -- also what entered with a new
 * identifier because another space of the portal held the file's. Only the
 * credential's space is ever written.
 */
export async function createDataImportService({
  driver,
  dialect = driver?.dialect,
  now = () => new Date(),
}) {
  await applyMigrations(driver, dialect);

  function planOf(file, existing, offer, tenantId) {
    return dataImportPlan({ file, existing, offer, tenantId });
  }

  return {
    async preview({ tenantId, bytes, offer = null, contentLimit }) {
      const file = readDataExport(bytes, { limit: contentLimit });
      const existing = await existingForImport(
        driver,
        tenantId,
        dataImportIdentifiers(file.documents, tenantId),
      );
      return dataImportReport(planOf(file, existing, offer, tenantId));
    },

    async confirm({ tenantId, userId, bytes, offer = null, contentLimit }) {
      const file = readDataExport(bytes, { limit: contentLimit });
      const identifiers = dataImportIdentifiers(file.documents, tenantId);
      const timestamp = now().toISOString();
      const { plan, domains } = await driver.transaction(async (tx) => {
        await lockSpace(tx, tenantId);
        const planned = planOf(
          file,
          await existingForImport(tx, tenantId, identifiers),
          offer,
          tenantId,
        );
        const written = await writeDataImport(tx, {
          tenantId,
          userId,
          writes: planned.writes,
          timestamp,
          counts: {
            toImport: planned.totals.toImport,
            alreadyThere: planned.totals.alreadyThere,
            reidentified: planned.notes.reidentified,
            missingReference: planned.notes.missingReference,
            unreadable: planned.notes.unreadable,
            unknownFiles: planned.notes.unknownFiles.length,
            archivedForNight: planned.notes.archivedForNight,
            archivedForPlanLimit: planned.notes.archivedForPlanLimit,
            archivedForCapability: planned.notes.archivedForCapability,
          },
        });
        return { plan: planned, domains: written };
      });
      // After the commit, never from inside it.
      if (domains.length) publishChange({ tenantId, domains });
      if (domains.includes("places")) await calibrationValuesChanged(tenantId);
      const report = dataImportReport(plan);
      return {
        ...report,
        written: {
          total: plan.totals.toImport,
          parts: Object.fromEntries(
            Object.entries(plan.parts).map(([part, row]) => [
              part,
              row.toImport,
            ]),
          ),
          kinds: Object.fromEntries(
            Object.entries(plan.kinds).map(([kind, row]) => [
              kind,
              row.toImport,
            ]),
          ),
        },
      };
    },
  };
}
