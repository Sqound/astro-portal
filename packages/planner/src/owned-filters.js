// The filters the observer owns.
//
// What the filter advice reads is the union of two lists: the filters of the
// portal inventory (read only here: the planner never writes the inventory)
// and the filters added on this browser (`localStorage`, `planner.ownedFilters`,
// a list of `{ id, name, family }`). A filter added here never leaves the
// browser.
import { filterFamily, plannerFilterFamilies } from "./filters.js";

// `localStorage` key of the browser list.
export const ownedFiltersStorageKey = "planner.ownedFilters";
export const ownedFilterNameMaxLength = 60;
// What marks a filter added on this browser; no inventory id starts with it.
const localIdPrefix = "local-";

// A name as typed: trimmed, inner runs of spaces folded into one, cut at 60
// characters. Empty when it is not text.
function cleanName(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, ownedFilterNameMaxLength)
    .trim();
}

// `{ id, name, family }` from anything, or `null` when the value is not a
// usable filter: no id, no name, or a family outside the seven of the planner.
export function normalizeOwnedFilter(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  const name = cleanName(value.name);
  const family = plannerFilterFamilies.includes(value.family)
    ? value.family
    : null;
  if (!id || !name || !family) return null;
  return { id, name, family };
}

// The list of filters added on this browser: every entry normalised, the ones
// that are not filters or repeat an id dropped. An unreadable store gives an
// empty list.
export function normalizeOwnedFilters(value) {
  const seen = new Set();
  const filters = [];
  for (const entry of Array.isArray(value) ? value : []) {
    const filter = normalizeOwnedFilter(entry);
    if (!filter || seen.has(filter.id)) continue;
    seen.add(filter.id);
    filters.push(filter);
  }
  return filters;
}

export function readOwnedFilters(storage) {
  try {
    return normalizeOwnedFilters(
      JSON.parse(storage?.getItem(ownedFiltersStorageKey) || ""),
    );
  } catch {
    return [];
  }
}

// Whether the list was stored; a refusing storage keeps the list in memory
// for the page.
export function writeOwnedFilters(storage, filters) {
  try {
    storage.setItem(
      ownedFiltersStorageKey,
      JSON.stringify(normalizeOwnedFilters(filters)),
    );
    return true;
  } catch {
    return false;
  }
}

// The id of a filter added now: `local-` and the time in base 36, a counter
// after it when that id is taken.
export function newOwnedFilterId(filters, now) {
  const taken = new Set((filters || []).map((filter) => String(filter?.id)));
  const base = `${localIdPrefix}${Math.max(0, Math.trunc(Number(now) || 0)).toString(36)}`;
  let id = base;
  for (let counter = 2; taken.has(id); counter += 1) id = `${base}-${counter}`;
  return id;
}

// The list with the filter `{ name, family }` added at the end: `{ filters,
// added }`, `added` being `null` (and `filters` the same array) when the name
// is empty or the family unknown.
export function addOwnedFilter(filters, { name, family } = {}, { now } = {}) {
  const current = filters || [];
  const filter = normalizeOwnedFilter({
    id: newOwnedFilterId(current, now),
    name,
    family,
  });
  if (!filter) return { filters: current, added: null };
  return { filters: [...current, filter], added: filter };
}

// The list with the filter `id` renamed; the same array when there is no such
// filter, the name is empty or it did not change.
export function renameOwnedFilter(filters, id, name) {
  const current = filters || [];
  const next = cleanName(name);
  if (!next) return current;
  const index = current.findIndex((filter) => filter.id === id);
  if (index < 0 || current[index].name === next) return current;
  return current.map((filter, position) =>
    position === index ? { ...filter, name: next } : filter,
  );
}

// The list without the filter `id`; the same array when there is none.
export function removeOwnedFilter(filters, id) {
  const current = filters || [];
  return current.some((filter) => filter.id === id)
    ? current.filter((filter) => filter.id !== id)
    : current;
}

// The filters the advice reads: `{ id, name, family, source }`, the
// inventory's first (`source: "inventory"`, family from the name when the item
// names none, `null` when it cannot be told), then the ones of this device
// (`source: "device"`). An inventory item without id or name is skipped; a
// local filter that repeats an inventory id is skipped.
export function ownedFiltersUnion({ inventory, local } = {}) {
  const union = [];
  const seen = new Set();
  for (const item of Array.isArray(inventory) ? inventory : []) {
    const id = typeof item?.id === "string" ? item.id.trim() : "";
    const name = cleanName(item?.name);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    union.push({
      id,
      name,
      family: plannerFilterFamilies.includes(item.family)
        ? item.family
        : filterFamily(name),
      source: "inventory",
    });
  }
  for (const filter of normalizeOwnedFilters(local)) {
    if (seen.has(filter.id)) continue;
    seen.add(filter.id);
    union.push({ ...filter, source: "device" });
  }
  return union;
}

/**
 * For a person signed in to a space, the
 * browser's "Filtres possédés" become filters of "Mon matériel" — the
 * items `PATCH /api/v1/manage/equipment` `{ action: "import", items }` sends
 * once, without duplicates (the same name and family is the same filter),
 * after which the browser's list is emptied. Each keeps its id and its
 * family (`planner.family`).
 */
export function ownedFiltersAsEquipment(filters) {
  return normalizeOwnedFilters(filters).map((filter) => ({
    id: filter.id,
    type: "filter",
    name: filter.name,
    planner: { family: filter.family },
  }));
}

/**
 * The filters the advice reads on the web: a signed-in person's are the
 * filters of "Mon matériel" alone (one list); a visitor's are the
 * browser's.
 */
export function plannerOwnedFilters({ signedIn, inventory, local } = {}) {
  return signedIn
    ? ownedFiltersUnion({ inventory, local: [] })
    : ownedFiltersUnion({ inventory: [], local });
}
