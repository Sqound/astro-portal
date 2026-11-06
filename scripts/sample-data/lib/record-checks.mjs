// The rules a set of records must satisfy, applied by the exporter to what it
// has just built and by the verifier to what is on disk. They look at the
// records only (not at how they were made): every table and column must be on
// the whitelist, the only place is the sample place, and no value of any kind
// may match a leak pattern.
import { PACK_ROOT, RECORD_TABLES, TABLE_COLUMNS } from "./constants.mjs";
import { OWNER_PLACEHOLDER, TENANT_PLACEHOLDER } from "./ids.mjs";
import {
  isPlainObject,
  isSamplePlaceObject,
  jsonFindings,
  textHasCoordinateNear,
  textRules,
} from "./patterns.mjs";

export const IMAGE_PATH = new RegExp(
  `^${PACK_ROOT}/session-\\d{2}/image-\\d{4}\\.(?:jpg|png)$`,
);

/** Findings are `{ table, row, column, path, rule }`: where, never what. */
export function structureFindings(records) {
  const findings = [];
  for (const [table, rows] of Object.entries(records)) {
    if (table === "images") continue;
    if (!RECORD_TABLES.includes(table)) {
      findings.push({
        table,
        row: null,
        column: null,
        path: "",
        rule: "table-not-on-the-whitelist",
      });
      continue;
    }
    if (!Array.isArray(rows)) {
      findings.push({
        table,
        row: null,
        column: null,
        path: "",
        rule: "not-a-list-of-rows",
      });
      continue;
    }
    const allowed = new Set(TABLE_COLUMNS[table]);
    rows.forEach((row, index) => {
      if (!isPlainObject(row)) {
        findings.push({
          table,
          row: index,
          column: null,
          path: "",
          rule: "row-is-not-an-object",
        });
        return;
      }
      for (const column of Object.keys(row))
        if (!allowed.has(column))
          findings.push({
            table,
            row: index,
            column,
            path: "",
            rule: "column-not-on-the-whitelist",
          });
      if (
        table === "captures" &&
        Object.hasOwn(row, "visibility") &&
        !["private", "public"].includes(row.visibility)
      )
        findings.push({
          table,
          row: index,
          column: "visibility",
          path: "",
          rule: "visibility-not-private-or-public",
        });
      // The sample has no space and no person of its own: `install` puts these two
      // placeholders on those of the portal it goes into, and nothing else may stand there.
      if (
        Object.hasOwn(row, "tenant_id") &&
        row.tenant_id !== TENANT_PLACEHOLDER
      )
        findings.push({
          table,
          row: index,
          column: "tenant_id",
          path: "",
          rule: "space-id-not-the-placeholder",
        });
      if (
        row.created_by_user_id !== undefined &&
        row.created_by_user_id !== null &&
        row.created_by_user_id !== OWNER_PLACEHOLDER
      )
        findings.push({
          table,
          row: index,
          column: "created_by_user_id",
          path: "",
          rule: "person-id-not-the-placeholder",
        });
    });
  }
  const locations = records.known_locations || [];
  if (locations.length > 1)
    findings.push({
      table: "known_locations",
      row: null,
      column: null,
      path: "",
      rule: "more-than-one-place",
    });
  locations.forEach((row, index) => {
    if (!isSamplePlaceObject(row?.details_json))
      findings.push({
        table: "known_locations",
        row: index,
        column: "details_json",
        path: "",
        rule: "place-not-the-sample-place",
      });
  });
  return findings;
}

/** Every value of every record against the leak patterns. */
export function recordFindings(
  records,
  { forbid = [], near = null, allowUrls = false } = {},
) {
  const findings = [];
  for (const [table, rows] of Object.entries(records)) {
    if (table === "images" || !Array.isArray(rows)) continue;
    rows.forEach((row, index) => {
      if (!isPlainObject(row)) return;
      for (const [column, value] of Object.entries(row)) {
        if (typeof value === "string") {
          for (const rule of textRules(value, { forbid, allowUrls }))
            findings.push({ table, row: index, column, path: "", rule });
          if (textHasCoordinateNear(value, near))
            findings.push({
              table,
              row: index,
              column,
              path: "",
              rule: "near-forbidden-point",
            });
        } else if (value !== null && typeof value === "object") {
          for (const finding of jsonFindings(value, {
            forbid,
            near,
            allowUrls,
          }))
            findings.push({
              table,
              row: index,
              column,
              path: finding.path,
              rule: finding.rule,
            });
        }
      }
    });
  }
  return findings;
}

/** The list of images against the captures it points at. */
export function imageListFindings(images, captures) {
  const findings = [];
  const ids = new Set((captures || []).map((row) => row.id));
  const paths = new Set();
  const used = new Set();
  (images || []).forEach((entry, index) => {
    const add = (rule) =>
      findings.push({
        table: "images",
        row: index,
        column: null,
        path: "",
        rule,
      });
    if (!IMAGE_PATH.test(String(entry?.path)))
      add("image-path-not-of-the-stable-pattern");
    if (!ids.has(entry?.captureId)) add("image-of-an-unknown-capture");
    if (paths.has(entry?.path)) add("image-path-listed-twice");
    if (used.has(entry?.captureId)) add("capture-with-two-images");
    paths.add(entry?.path);
    used.add(entry?.captureId);
  });
  for (const capture of captures || [])
    if (!used.has(capture.id))
      findings.push({
        table: "captures",
        row: captures.indexOf(capture),
        column: null,
        path: "",
        rule: "capture-without-an-image",
      });
  return findings;
}

export function formatFinding(finding) {
  const where = [
    finding.table,
    finding.row === null || finding.row === undefined
      ? null
      : `#${finding.row}`,
    finding.column ? `.${finding.column}` : null,
    finding.path ? ` (${finding.path})` : null,
  ]
    .filter(Boolean)
    .join("");
  return `${where}: ${finding.rule}`;
}
