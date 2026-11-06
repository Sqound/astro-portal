import commonEquipmentData from "./common-equipment-profiles.json" with { type: "json" };
import { filterBelongsTo } from "./planner.js";

// The order and the names of the telescopes in every list that offers them:
// by MAKER, then by MODEL in the maker's own numbering, and the maker
// written before the model.

const commonMakerById = new Map(
  commonEquipmentData.telescopes.map((telescope) => [
    telescope.id,
    telescope.maker,
  ]),
);

// The kinds of the common telescopes, in the order the pickers list them.
export const telescopeGroupOrder = Object.freeze([
  "connected",
  "refractors",
  "reflectors",
  // EQUIPMENT-INSTRUMENTS-01: the common binoculars, after the telescopes.
  "binoculars",
]);

const romanNumerals = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
};

const foldedCharacters = { œ: "oe", æ: "ae", ß: "ss", ø: "o", ł: "l" };

const fold = (text) =>
  String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[œæßøł]/g, (character) => foldedCharacters[character]);

// The maker of a telescope: the one its profile names, else the one the
// common profile of the same identifier names (the administration's default
// rows predate the field), else none.
export function telescopeMaker(profile) {
  const own = typeof profile?.maker === "string" ? profile.maker.trim() : "";
  if (own) return own;
  return commonMakerById.get(profile?.id) ?? "";
}

// The model: the name without the maker written before it.
export function telescopeModel(profile) {
  const name = String(profile?.name ?? "").trim();
  const maker = telescopeMaker(profile);
  if (maker && fold(name).startsWith(`${fold(maker)} `))
    return name.slice(maker.length).trim();
  return name;
}

// What a picker writes for a telescope: "ZWO Seestar S50",
// "Sky-Watcher Evostar 72 ED" -- the maker before the model, once.
export function telescopeDisplayName(profile) {
  const name = String(profile?.name ?? "").trim();
  const maker = telescopeMaker(profile);
  if (
    !maker ||
    fold(name).startsWith(`${fold(maker)} `) ||
    fold(name) === fold(maker)
  )
    return name;
  return `${maker} ${name}`;
}

// A name as a list of pieces to compare: runs of letters and runs of digits,
// case and accents ignored; a number is a number ("S30" before "S50",
// "72" before "102"), a roman numeral standing alone is the number it
// writes ("II" is 2: "DWARF II" before "DWARF 3").
function pieces(text) {
  return (fold(text).match(/\d+|[^\W\d_]+/gu) ?? []).map((piece) => {
    if (/^\d+$/.test(piece)) return Number(piece);
    return Object.hasOwn(romanNumerals, piece) ? romanNumerals[piece] : piece;
  });
}

// Numbers before words; numbers by value, words by their letters.
function comparePiece(a, b) {
  const aNumber = typeof a === "number";
  const bNumber = typeof b === "number";
  if (aNumber && bNumber) return a - b;
  if (aNumber) return -1;
  if (bNumber) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function naturalCompare(a, b) {
  const left = pieces(a);
  const right = pieces(b);
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const order = comparePiece(left[index], right[index]);
    if (order) return order;
  }
  return left.length - right.length;
}

// Maker (alphabetical), then model (natural order). A telescope whose maker
// is not known (a row the administration typed in) comes after the ones that
// have one, by its name.
export function compareTelescopes(a, b) {
  const makerA = telescopeMaker(a);
  const makerB = telescopeMaker(b);
  if (Boolean(makerA) !== Boolean(makerB)) return makerA ? -1 : 1;
  return (
    naturalCompare(makerA, makerB) ||
    naturalCompare(telescopeModel(a), telescopeModel(b))
  );
}

// A copy of `profiles` in that order; the sort is stable, so profiles that
// compare equal (two of one's own with the same name) keep their order.
export function sortTelescopes(profiles = []) {
  return [...profiles].sort(compareTelescopes);
}

// The groups of the common telescopes in the order the pickers list them:
// connected, refractors, reflectors, then any other in the order met.
export function orderedTelescopeGroups(groups = []) {
  const known = telescopeGroupOrder.filter((group) => groups.includes(group));
  return [...known, ...groups.filter((group) => !known.includes(group))];
}

// A filter as a list shows it: the bare name of the data ("Duo-Band"), with
// the equipment it belongs to written before it when the list mixes equipment,
// composed here from `equipmentIds` (the person's own telescopes and cameras,
// `equipment`) or `telescopeIds` (the maker's profiles) and never stored in
// the name or parsed from it (no string processing). A filter of several
// telescopes of one maker names the maker ("Vaonis · Dual Band"); a filter
// that belongs to no equipment (the generic ones) is its name, and so is a
// filter that belongs to one of `within` -- inside a telescope's own list the
// bare name is enough.
export function filterDisplayName(
  filter,
  telescopes,
  { equipment = [], within = [] } = {},
) {
  const name = String(filter?.name ?? "");
  if (within.some((piece) => filterBelongsTo(filter, piece))) return name;
  const attached = Array.isArray(filter?.equipmentIds)
    ? filter.equipmentIds
    : [];
  if (attached.length) {
    const pieces = equipment.filter((piece) => attached.includes(piece?.id));
    if (pieces.length === 1) return `${pieces[0].name} · ${name}`;
    if (pieces.length > 1) return name;
  }
  const ids = Array.isArray(filter?.telescopeIds) ? filter.telescopeIds : [];
  if (!ids.length) return name;
  const known = new Map(
    (telescopes ?? commonEquipmentData.telescopes).map((telescope) => [
      telescope.id,
      telescope,
    ]),
  );
  const owners = ids.map((id) => known.get(id)).filter(Boolean);
  if (!owners.length) return name;
  if (owners.length === 1)
    return `${telescopeDisplayName(owners[0])} · ${name}`;
  const makers = new Set(owners.map(telescopeMaker));
  const [maker] = [...makers];
  return makers.size === 1 && maker ? `${maker} · ${name}` : name;
}
