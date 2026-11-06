#!/usr/bin/env node
import { staticDataRepository } from "portal-app/lib/static-data.server.js";
import { targetCatalogueRepository } from "portal-app/lib/target-library-database.server.js";
import { targetLibraryAdministrationSearch } from "portal-app/lib/target-library.server.js";

const staticData = await staticDataRepository();
if (!staticData)
  throw new Error(
    "ASTRO_PORTAL_DATABASE_URL or ASTRO_PORTAL_DATABASE_PATH is required.",
  );

await staticData.seed();
const targets = await targetCatalogueRepository();
// Import when the target table is empty, and bring it up to date with the
// library file (a re-import adds distances to the records, but the table kept
// the older ones, so the export carried none) unless an explicitly
// synchronized runtime source is in place: re-exporting must reflect that
// instance state.
const explicitRuntimeSource = String(
  (await targets.state())?.source_revision || "",
).startsWith("runtime:");
if (!(await targets.list({ limit: 1 })).total || !explicitRuntimeSource)
  await targetLibraryAdministrationSearch({ locale: "en", limit: 1 });
const targetCatalogue = await targets.exportSeed({
  source: "PlanAstro exported target catalogue",
});
const exported = await staticData.export({
  additionalDocuments: [
    {
      key: "target-library",
      title: "Catalogue local de cibles",
      schemaVersion: 1,
      revision: targetCatalogue.exportedAt,
      path: "target-library/catalogue.json",
    },
  ],
});
console.log(
  JSON.stringify({
    status: "exported",
    directory: exported.directory,
    packageRevision: exported.packageRevision,
    documents: exported.manifest.documents.length,
    targetEntries: targetCatalogue.entries,
  }),
);
