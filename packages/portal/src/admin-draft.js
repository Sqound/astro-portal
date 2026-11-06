export const emptyAdminRecord = {
  id: "",
  title: "",
  category: "Ciel profond",
  objects: [],
  tags: [],
  assetBaseNames: [],
  skyTarget: {},
  acquisition: {},
  processing: {},
  description: [],
  technicalDescription: [],
  integrations: [],
  assetMetadata: [],
  progressions: [],
};

const arrayFields = [
  "objects",
  "tags",
  "assetBaseNames",
  "description",
  "technicalDescription",
  "integrations",
  "assetMetadata",
  "progressions",
];

// These fields already have a dedicated control in the capture editor. Every
// other top-level property remains visible through the complementary metadata
// editor so a record never silently loses an uncommon or legacy property.
export const structuredAdminMetadataKeys = [
  "acquisition",
  "processing",
  "integrations",
  "assetMetadata",
  "progressions",
  "stellarium",
  "skyMap",
  "plateSolveHints",
];

const dedicatedEditorKeys = new Set([
  "id",
  "title",
  "content",
  "category",
  "objects",
  "tags",
  "assetBaseNames",
  "featuredBaseName",
  "referenceBaseName",
  "skyTarget",
  "description",
  "technicalDescription",
  // Legacy public free-form equipment is intentionally ignored. Equipment is
  // now rendered from the authenticated inventory associations instead.
  "equipment",
  ...structuredAdminMetadataKeys,
]);

export function additionalAdminMetadata(record) {
  return Object.fromEntries(
    Object.entries(record || {}).filter(
      ([key]) => !dedicatedEditorKeys.has(key),
    ),
  );
}

// Catalog documents may associate files with assetPaths or matchPatterns rather
// than assetBaseNames. The editor always needs editable arrays, without
// changing those other associations when the record is saved.
export function normalizeAdminRecord(record) {
  const next = { ...structuredClone(emptyAdminRecord), ...(record || {}) };
  for (const key of arrayFields) {
    if (!Array.isArray(next[key])) next[key] = [];
  }
  if (!next.skyTarget || Array.isArray(next.skyTarget)) next.skyTarget = {};
  return next;
}
