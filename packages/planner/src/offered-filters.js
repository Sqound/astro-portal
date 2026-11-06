import { equipmentChoiceGroups } from "./equipment-groups.js";
import {
  acquisitionFilterGroups,
  filterBelongsTo,
  filtersOfferedFor,
  smartTelescopeFilterProfiles,
} from "./planner.js";

// The filters a plan offers on the web: one reading of "which filters go
// with this telescope and this camera", shared by step 2's field, the dialog
// "Paramètres de la pose" and the acquisition basis, so that they always
// agree. The rule itself is `filtersOfferedFor` (`planner.js`).

/**
 * The telescope and the camera whose filters a plan offers. A smart
 * telescope's built-in camera is no separate equipment, and a visual plan has
 * no camera.
 */
export function planFilterOwners({ telescope, camera, mode } = {}) {
  const connected = Boolean(telescope?.integratedCamera);
  return {
    telescope: telescope ?? null,
    camera: mode === "visual" || connected ? null : (camera ?? null),
  };
}

/** The ids of a list of filters, once each. */
const uniqueById = (lists) => {
  const seen = new Set();
  return lists
    .flat()
    .filter(
      (filter) =>
        filter &&
        (filter.id === undefined ||
          (!seen.has(filter.id) && seen.add(filter.id))),
    );
};

/**
 * The pool of filters a plan can draw from: the profile sets' own, the
 * filters the person typed in this browser, and the smart telescopes'
 * built-in ones (offered only to the telescope they belong to).
 */
export function filterPool({ profileFilters = [], ownedFilters = [] } = {}) {
  return uniqueById([
    profileFilters,
    ownedFilters,
    smartTelescopeFilterProfiles,
  ]);
}

/** The filters of `pool` the plan offers; the chosen ones stay. */
export function planOfferedFilters({ pool, owners, selectedIds = [] }) {
  return filtersOfferedFor({
    filters: pool,
    telescope: owners?.telescope ?? null,
    camera: owners?.camera ?? null,
    selectedIds,
  });
}

/**
 * The dialog's groups of step 2, from the offered filters: a visitor has one
 * group without a label; a signed-in person's two, "Mon matériel" then
 * "Matériel par défaut". A default filter stays shown while the space hides
 * the group when it is chosen or attached to the plan's telescope or camera
 * (a smart telescope's built-in ones).
 */
export function offeredFilterGroups(
  locale,
  {
    offered,
    owners,
    selectedIds = [],
    authenticated = false,
    defaultFilters = [],
    hideDefaults = false,
  },
) {
  if (!authenticated) return [{ key: "all", label: "", profiles: offered }];
  const defaultIds = new Set(defaultFilters.map((filter) => filter.id));
  const kept = (filter) =>
    selectedIds.includes(filter.id) ||
    filterBelongsTo(filter, owners?.telescope) ||
    filterBelongsTo(filter, owners?.camera);
  return equipmentChoiceGroups(locale, {
    mine: offered.filter((filter) => !defaultIds.has(filter.id)),
    defaults: offered.filter(
      (filter) => defaultIds.has(filter.id) && (!hideDefaults || kept(filter)),
    ),
  });
}

/**
 * "{name} only offers its own filters.": the piece of the plan's equipment
 * that offers its own filters only, `{ name, owned }` -- `owned` when the
 * person has it in "My equipment" (the line then links to the page where it
 * is edited) -- or `null`.
 */
export function ownFiltersOnlyNote(owners, inventoryIds = []) {
  const piece = [owners?.telescope, owners?.camera].find(
    (equipment) => equipment?.ownFiltersOnly === true && equipment?.id,
  );
  if (!piece) return null;
  return {
    name: String(piece.name ?? ""),
    owned: inventoryIds.includes(piece.id),
  };
}

/** The pose dialog's two lists, from the offered filters. */
export function poseFilterGroups({ offered, selectedIds = [], owners }) {
  return acquisitionFilterGroups({
    offered,
    selectedIds,
    telescope: owners?.telescope ?? null,
  });
}
