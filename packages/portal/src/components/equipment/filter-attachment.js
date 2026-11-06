import { builtInFilterRows, smartProfileIds } from "./built-in-filters.js";

/**
 * Filters attached to equipment on the forms of « Mon matériel ». Kept
 * in the item's free `planner` object: a filter's
 * `equipmentIds` and `forAllEquipment` (default true), a telescope's or a
 * camera's `ownFiltersOnly`, a telescope's `profileId` (the maker's profile
 * it was made from, which gives it its built-in filters). The rule that
 * offers filters in a plan is `filtersOfferedFor` of the planner.
 */

const isObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const plannerOf = (item) => (isObject(item?.planner) ? item.planner : {});

/** Whether the filter is « Proposé pour tout le matériel » (the default). */
export const filterOfferedForAll = (item) =>
  plannerOf(item).forAllEquipment !== false;

/** The identifiers of the equipment a filter is attached to. */
export function attachedEquipmentIds(item) {
  const ids = plannerOf(item).equipmentIds;
  return [
    ...new Set(
      (Array.isArray(ids) ? ids : []).filter(
        (id) => typeof id === "string" && id !== "",
      ),
    ),
  ];
}

/**
 * Rule (1): « Proposé pour tout le matériel » cannot be switched off while no
 * equipment is ticked (the switch is disabled, not an error after the fact).
 */
export const canLimitFilter = (item) => attachedEquipmentIds(item).length > 0;

/** The draft with the switch set; refused (returned as it was) by rule (1). */
export function withFilterOfferedForAll(draft, forAll) {
  if (!forAll && !canLimitFilter(draft)) return draft;
  const planner = { ...plannerOf(draft) };
  if (forAll) delete planner.forAllEquipment;
  else planner.forAllEquipment = false;
  return { ...draft, planner };
}

/** The draft with `id` ticked or unticked in the filter's equipment list. */
export function withFilterEquipment(draft, id, ticked) {
  const current = attachedEquipmentIds(draft);
  const ids = ticked
    ? [...new Set([...current, id])]
    : current.filter((entry) => entry !== id);
  const planner = { ...plannerOf(draft), equipmentIds: ids };
  // Unticking the last equipment of a limited filter puts it back for all:
  // « proposé nulle part » cannot be written.
  if (!ids.length) delete planner.forAllEquipment;
  return { ...draft, planner };
}

/** The built-in filters of a telescope made from a maker's profile. */
export function builtInFiltersFor(item) {
  const profileId = plannerOf(item).profileId;
  if (item?.type !== "telescope" || typeof profileId !== "string") return [];
  return builtInFilterRows.filter((row) =>
    row.telescopeIds.includes(profileId),
  );
}

/** The active filters of `equipment` attached to the piece `id`. */
export const filtersAttachedTo = (equipment, id) =>
  (Array.isArray(equipment) ? equipment : []).filter(
    (item) =>
      item?.type === "filter" &&
      !item.archivedAt &&
      attachedEquipmentIds(item).includes(id),
  );

/**
 * « Ne proposer que ses filtres » of a telescope or a camera: what it says,
 * else on for a telescope made from a smart-telescope profile.
 */
export function ownFiltersOnlyOf(item) {
  const own = plannerOf(item).ownFiltersOnly;
  if (typeof own === "boolean") return own;
  return (
    item?.type === "telescope" &&
    smartProfileIds.includes(plannerOf(item).profileId)
  );
}

/** The draft with « Ne proposer que ses filtres » written. */
export const withOwnFiltersOnly = (draft, value) => ({
  ...draft,
  planner: { ...plannerOf(draft), ownFiltersOnly: Boolean(value) },
});

/**
 * The read-only rows the « Filtres » list of « Mon matériel » adds for the
 * telescopes of the space: each built-in filter of each active telescope made
 * from a profile, `{ id, name, label, builtIn, owner }`, `label` being the
 * owner's name composed with the bare filter name.
 */
export function builtInRowsOf(equipment) {
  return (Array.isArray(equipment) ? equipment : [])
    .filter((item) => item?.type === "telescope" && !item.archivedAt)
    .flatMap((owner) =>
      builtInFiltersFor(owner).map((filter) => ({
        key: `${owner.id}:${filter.id}`,
        id: filter.id,
        name: filter.name,
        family: filter.family,
        label: `${owner.name} · ${filter.name}`,
        builtIn: true,
        owner,
      })),
    );
}

/** The item a form saves: the keys of other kinds are dropped. */
export function filterFieldsToSave(draft) {
  const planner = { ...plannerOf(draft) };
  if (draft?.type !== "filter") {
    delete planner.equipmentIds;
    delete planner.forAllEquipment;
  }
  if (draft?.type !== "telescope" && draft?.type !== "camera")
    delete planner.ownFiltersOnly;
  if (draft?.type !== "telescope") delete planner.profileId;
  return { ...draft, planner };
}
