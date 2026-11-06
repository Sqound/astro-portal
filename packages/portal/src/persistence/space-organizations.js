import { PLATFORM_ORGANIZATION_ID } from "./default-equipment-seed.js";

/**
 * Which `organizations` rows are spaces: every one but the platform
 * organisation, which holds the « Matériel par défaut » and is no one's space
 * (migration 55). The one rule for whatever looks for a space, lists spaces or
 * counts them — `equipment-reader.js` (`firstTenantId`, `spaceExists`), the
 * sample-data installer, the administration's lists of spaces. A raw count of
 * a table's rows (a backup's `tableCounts`, an integrity check) is not a list
 * of spaces and keeps every row.
 */
export { PLATFORM_ORGANIZATION_ID };

/** Whether the organisation `id` is a space. */
export const isSpaceOrganization = (id) =>
  Boolean(id) && String(id) !== PLATFORM_ORGANIZATION_ID;

/**
 * The SQL condition that keeps the spaces, on the column that names an
 * organisation (`id` of `organizations`, `tenant_id` of a space's tables).
 * The id is a constant of the code, never a value from a request.
 */
export const spaceOrganizationCondition = (column = "id") =>
  `${column} <> '${PLATFORM_ORGANIZATION_ID}'`;
