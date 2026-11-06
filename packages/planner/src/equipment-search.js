// The search and the two menus « Marque » and « Type » of every equipment
// picker (telescope, camera, eyepiece, reducer or Barlow, filters): which
// rows a picker shows for a text typed and a maker and a kind chosen, the
// values the menus offer with their counts, the count line and when the
// search field and the menus are drawn. One pure rule, the phone's twin reads
// the same cases (`astro-contracts/fixtures/equipment-picker-filter.json`).
//
// - The search folds case and accents, splits the text on spaces, and keeps a
//   row whose folded display name holds every word (the name carries the
//   maker and the series: « tele vue 13 » finds the Ethos 13 mm).
// - One's own equipment (`mine`) follows the search only: the menus never
//   take it away (its name is free, its maker and kind unknown).
// - The default equipment (`defaults`, empty when the space hides it) follows
//   the search, the maker and the kind.
// - The menus are faceted: the makers offered are those of the defaults the
//   search and the kind keep, each with its count, by count then name; the
//   kinds are those of the defaults the search and the maker keep, in the
//   catalogue's order. A chosen value whose count fell to 0 stays offered.
//   A row without a maker counts only in « Toutes les marques ».
// - The search field is drawn over more than 12 rows (own and default); the
//   menus over more than 12 default rows, and a menu only when the defaults
//   hold two values of it at least. A menu that is not drawn does not filter.

/** More rows than this, and the picker draws its search field. */
export const equipmentSearchThreshold = 12;
/** More default rows than this, and the picker draws « Marque » and « Type ». */
export const equipmentMenusThreshold = 12;

/** The kinds of each category, in the order the « Type » menu lists them. */
export const equipmentKindOrder = Object.freeze({
  telescope: Object.freeze([
    "refractor",
    "newtonian",
    "schmidt-cassegrain",
    "maksutov",
    "ritchey-chretien",
    "cassegrain",
    "smart",
    "binoculars",
    "smartphone",
  ]),
  eyepiece: Object.freeze([
    "zoom",
    "plossl",
    "orthoscopic",
    "standard",
    "wide-field",
    "ultra-wide-field",
  ]),
  camera: Object.freeze(["colour", "mono"]),
  modifier: Object.freeze(["reducer", "barlow", "flattener"]),
  filter: Object.freeze([
    "dual",
    "ha",
    "oiii",
    "sii",
    "uhc",
    "hb",
    "broadband",
    "solar",
  ]),
});

const foldedCharacters = { œ: "oe", æ: "ae", ß: "ss", ø: "o", ł: "l" };

/** The text in lower case without accents: what the search compares. */
export function foldForSearch(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[œæßøł]/g, (character) => foldedCharacters[character]);
}

/** The words of a search, folded; none for an empty text. */
export function searchTokens(query) {
  return foldForSearch(query)
    .split(/\s+/)
    .filter((token) => token !== "");
}

/** The maker a row names, trimmed; "" when it names none. */
export const equipmentMaker = (profile) =>
  typeof profile?.maker === "string" ? profile.maker.trim() : "";

/**
 * The name a picker writes for a row: its maker before its name, once
 * (« ZWO Seestar S50 » for « Seestar S50 » of ZWO).
 */
export function equipmentDisplayName(profile, makerOf = equipmentMaker) {
  const name = String(profile?.name ?? "").trim();
  const maker = makerOf(profile);
  if (
    !maker ||
    foldForSearch(name).startsWith(`${foldForSearch(maker)} `) ||
    foldForSearch(name) === foldForSearch(maker)
  )
    return name;
  return `${maker} ${name}`;
}

/** Where a category keeps its « Type »: `family` for the filters. */
export const equipmentKindField = (category) =>
  category === "filter" ? "family" : "kind";

const kindOf = (profile, field) =>
  typeof profile?.[field] === "string" && profile[field] ? profile[field] : "";

const foldedOrder = (a, b) => {
  const left = foldForSearch(a);
  const right = foldForSearch(b);
  if (left !== right) return left < right ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
};

function counted(rows, valueOf) {
  const counts = new Map();
  for (const row of rows) {
    const value = valueOf(row);
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

/**
 * What a picker shows. `mine` and `defaults` are the rows of one category
 * (one's own already without the archived ones; the defaults empty when the
 * space hides them); `query` the text typed; `maker` and `kind` the menus'
 * values (`null`: all). `nameOf` and `makerOf` read a row (the telescopes
 * pass their own, which know the catalogue's makers).
 *
 * Returns the rows shown (`mine`, `defaults`, in the order given), the menus'
 * values with their counts (`makers`, `kinds`: `{ value, count }`), the count
 * line (`count`: the default rows shown), whether the search field and the
 * menus are drawn, whether a menu filters (`filtered`: « Effacer les
 * filtres ») and whether nothing matches (`noMatch`).
 */
export function equipmentSearch({
  category,
  mine = [],
  defaults = [],
  query = "",
  maker = null,
  kind = null,
  nameOf,
  makerOf = equipmentMaker,
} = {}) {
  const field = equipmentKindField(category);
  const name = nameOf ?? ((profile) => equipmentDisplayName(profile, makerOf));
  const tokens = searchTokens(query);
  const matches = (profile) => {
    if (!tokens.length) return true;
    const folded = foldForSearch(name(profile));
    return tokens.every((token) => folded.includes(token));
  };

  const makerValues = counted(defaults, makerOf);
  const kindValues = counted(defaults, (profile) => kindOf(profile, field));
  const showsSearch = mine.length + defaults.length > equipmentSearchThreshold;
  const showsMenus = defaults.length > equipmentMenusThreshold;
  const showsMakerMenu = showsMenus && makerValues.size >= 2;
  const showsKindMenu = showsMenus && kindValues.size >= 2;
  const chosenMaker = showsMakerMenu && maker ? maker : null;
  const chosenKind = showsKindMenu && kind ? kind : null;

  const searched = defaults.filter(matches);
  const ofMaker = (profile) => !chosenMaker || makerOf(profile) === chosenMaker;
  const ofKind = (profile) =>
    !chosenKind || kindOf(profile, field) === chosenKind;

  const makerCounts = counted(searched.filter(ofKind), makerOf);
  if (chosenMaker && !makerCounts.has(chosenMaker))
    makerCounts.set(chosenMaker, 0);
  const makers = [...makerCounts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || foldedOrder(a.value, b.value));

  const kindCounts = counted(searched.filter(ofMaker), (profile) =>
    kindOf(profile, field),
  );
  if (chosenKind && !kindCounts.has(chosenKind)) kindCounts.set(chosenKind, 0);
  const order = equipmentKindOrder[category] ?? [];
  const rank = (value) =>
    order.includes(value) ? order.indexOf(value) : order.length;
  const kinds = [...kindCounts]
    .map(([value, count]) => ({ value, count }))
    .sort(
      (a, b) => rank(a.value) - rank(b.value) || foldedOrder(a.value, b.value),
    );

  const shownMine = mine.filter(matches);
  const shownDefaults = searched.filter(
    (profile) => ofMaker(profile) && ofKind(profile),
  );
  const filtered = Boolean(chosenMaker || chosenKind);
  return {
    mine: shownMine,
    defaults: shownDefaults,
    makers: showsMakerMenu ? makers : [],
    kinds: showsKindMenu ? kinds : [],
    maker: chosenMaker,
    kind: chosenKind,
    count: shownDefaults.length,
    showsSearch,
    showsMenus,
    showsMakerMenu,
    showsKindMenu,
    filtered,
    noMatch:
      (tokens.length > 0 || filtered) &&
      shownMine.length === 0 &&
      shownDefaults.length === 0,
  };
}

/**
 * The same rule with identifiers for rows: what the shared cases
 * (`equipment-picker-filter`) record, so the phone reads the same answers.
 */
export function equipmentPickerFilterCase(input = {}) {
  const result = equipmentSearch(input);
  const ids = (rows) => rows.map((row) => row.id);
  return {
    mine: ids(result.mine),
    defaults: ids(result.defaults),
    makers: result.makers,
    kinds: result.kinds,
    count: result.count,
    showsSearch: result.showsSearch,
    showsMenus: result.showsMenus,
    showsMakerMenu: result.showsMakerMenu,
    showsKindMenu: result.showsKindMenu,
    filtered: result.filtered,
    noMatch: result.noMatch,
  };
}
