import {
  captureCategories,
  constellationLabels,
  constellations,
  objectTypeAliases,
  objectTypes,
  taxonomyLabels,
} from "astro-core/catalog-taxonomy.js";
import { targetCatalogueInfo } from "astro-core/target-catalogues.js";
import { caldwellCrossReferenceEntries } from "astro-core/target-catalogue-crossrefs.js";
import { targetCommonNameLabels } from "astro-core/target-common-names.js";
import { solarSystemCatalogueTargets } from "astro-core/solar-system-catalogue.js";
import {
  plannerCatalogue,
  plannerNameLabels,
} from "astro-core/planner-targets.js";
import {
  cameraProfiles,
  eyepieceProfiles,
  opticalModifiers,
  plannerPlanetDefinitions,
  telescopeProfiles,
} from "planner/planner.js";

const document = (key, title, payload) => ({
  key,
  title,
  schemaVersion: 1,
  payload,
});

// These are domain/reference data, deliberately separate from calculation
// constants and UI strings. A private seed package can override them when an
// instance is initialized, and administration can export its latest revision.
export function defaultStaticDataDocuments() {
  return [
    document("instance-settings", "Paramètres généraux de l’instance", {
      planner: {
        defaultCatalogueSelection: "best",
      },
    }),
    document("reference-taxonomy", "Taxonomie astronomique", {
      captureCategories,
      objectTypes,
      constellations,
      objectTypeAliases,
      taxonomyLabels,
      constellationLabels,
    }),
    document("target-catalogue-descriptions", "Descriptions des catalogues", {
      catalogues: targetCatalogueInfo,
    }),
    document("target-common-names", "Noms communs localisés", {
      labels: targetCommonNameLabels,
    }),
    document("caldwell-crossreferences", "Correspondances Caldwell", {
      entries: caldwellCrossReferenceEntries,
    }),
    document("planner-curated-targets", "Cibles proposées par défaut", {
      targets: plannerCatalogue,
      nameLabels: plannerNameLabels,
    }),
    document("planner-equipment-presets", "Préréglages matériel", {
      telescopes: telescopeProfiles,
      cameras: cameraProfiles,
      eyepieces: eyepieceProfiles,
      opticalModifiers,
    }),
    document("planner-planets", "Référentiel des planètes", {
      planets: plannerPlanetDefinitions,
    }),
    document("solar-system-targets", "Cibles du Système solaire", {
      targets: solarSystemCatalogueTargets,
    }),
  ];
}

export const staticDataDocumentKeys = () =>
  defaultStaticDataDocuments().map((item) => item.key);

const array = (value) => Array.isArray(value);
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value);

export function validateStaticDataPayload(dataKey, value) {
  const valid =
    (dataKey === "instance-settings" &&
      object(value) &&
      object(value.planner) &&
      ["all", "best", "extended"].includes(
        value.planner.defaultCatalogueSelection,
      )) ||
    (dataKey === "reference-taxonomy" &&
      object(value) &&
      array(value.captureCategories) &&
      array(value.objectTypes) &&
      array(value.constellations) &&
      object(value.taxonomyLabels) &&
      object(value.constellationLabels)) ||
    (dataKey === "target-catalogue-descriptions" &&
      object(value) &&
      object(value.catalogues)) ||
    (dataKey === "target-common-names" &&
      object(value) &&
      object(value.labels)) ||
    (dataKey === "caldwell-crossreferences" &&
      object(value) &&
      array(value.entries)) ||
    (dataKey === "planner-curated-targets" &&
      object(value) &&
      array(value.targets) &&
      object(value.nameLabels)) ||
    (dataKey === "planner-equipment-presets" &&
      object(value) &&
      array(value.telescopes) &&
      array(value.cameras) &&
      array(value.eyepieces) &&
      array(value.opticalModifiers)) ||
    (dataKey === "planner-planets" && object(value) && array(value.planets)) ||
    (dataKey === "solar-system-targets" &&
      object(value) &&
      array(value.targets));
  if (!valid)
    throw new Error(
      `Invalid payload for static data ${JSON.stringify(dataKey)}.`,
    );
  return value;
}
