// A small magnifier in the framing editor opens a search field and a list of
// targets below it. Tapping a card in the result list displays that
// target with its name even if the display setting is not to show targets, and
// the selection reticle breathes over it.
//
// The framing editor's search is the catalogue's own. `GET /v1/target-index`
// is the compact form of the search the target library already runs -- same
// filters, same case- and accent-insensitive match on the designation, its
// aliases, the common names, the type and the constellation. What a browser needs around it is here, free of any
// framework so it can be tested without rendering anything: the request, the
// reading of the compact rows, the order the list is shown in, the match to
// highlight, the two figures a row prints, and the field a chosen target is
// shown in.

import { catalogueDesignation } from "astro-core/catalogue-designation.js";
import { cataloguePlannerCoordinate } from "astro-core/planner-coordinates.js";
import { normalizeSearch } from "portal/i18n.js";
import { clampMapFov } from "./sky-projection.js";
import { solarSystemEquatorJ2000 } from "./solar-system-position.js";

// A list the eye can take in at once. The server ranks the whole catalogue
// before it cuts the page (`sort=planner`), so these are the best answers to
// what was typed, not the alphabetically first ones.
export const framingSearchLimit = 24;

// Typing pauses between two letters; a request per keystroke would be a
// request per letter of a name.
export const framingSearchDelayMs = 220;

export function framingSearchQueryReady(query) {
  return typeof query === "string" && query.trim().length > 0;
}

// Search queries use the catalogue writing; stored user-authored text stays intact.
export function framingSearchQueryText(query) {
  return catalogueDesignation(String(query ?? "").trim());
}

// No `latitude` and no `minimumAltitude`: a framing is J2000-absolute, so
// nothing is left out for being low tonight -- that is the observing plan's
// business, not the framing's.
export function framingSearchPath({
  locale = "en",
  query = "",
  limit = framingSearchLimit,
} = {}) {
  const parameters = new URLSearchParams({
    locale,
    q: framingSearchQueryText(query),
    sort: "planner",
    limit: String(limit),
  });
  return `/api/v1/target-index?${parameters}`;
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function dictionaryEntry(dictionary, index) {
  const entry = Number.isInteger(index) ? dictionary?.[index] : null;
  return Array.isArray(entry)
    ? { key: entry[0] ?? null, label: entry[1] ?? entry[0] ?? null }
    : { key: null, label: null };
}

// The index is columnar: the column names are stated once in `fields` and a
// target is a positional array in `rows`. A column is read by name, so one a
// later version adds is ignored and one an older portal lacks is tolerated.
export function decodeTargetIndex(document) {
  const rows = Array.isArray(document?.rows) ? document.rows : [];
  const fields = Array.isArray(document?.fields) ? document.fields : [];
  const column = new Map(fields.map((name, index) => [name, index]));
  const read = (row, name) =>
    column.has(name) ? row?.[column.get(name)] : undefined;
  const targets = rows
    .filter(Array.isArray)
    .map((row) => {
      const type = dictionaryEntry(document?.types, read(row, "type"));
      const constellation = dictionaryEntry(
        document?.constellations,
        read(row, "constellation"),
      );
      const sizes = read(row, "sizeArcmin");
      return {
        id: read(row, "id") ?? null,
        designation: read(row, "designation") ?? null,
        name: read(row, "name") || null,
        title: read(row, "title") ?? null,
        aliases: Array.isArray(read(row, "aliases"))
          ? read(row, "aliases")
          : [],
        catalogue: read(row, "catalogue") ?? null,
        catalogues: Array.isArray(read(row, "catalogues"))
          ? read(row, "catalogues")
          : [],
        ra: finiteOrNull(read(row, "ra")),
        dec: finiteOrNull(read(row, "dec")),
        sizeArcmin: Array.isArray(sizes) ? sizes : [],
        magnitude: finiteOrNull(read(row, "magnitude")),
        photoUrl: read(row, "photoUrl") || null,
        typeKey: type.key,
        typeLabel: type.label,
        constellationKey: constellation.key,
        constellationLabel: constellation.label,
      };
    })
    .filter((target) => target.id !== null && target.designation !== null);
  const total = Number(document?.total);
  return {
    total: Number.isFinite(total) ? total : targets.length,
    targets,
  };
}

// A row as the map draws a target: the same fields the planner's own targets
// carry, in J2000 degrees (the catalogue's right ascension is in hours). A row
// with no position cannot be centred, so it is not a target at all -- except a
// Solar System body, which has no catalogue coordinate: its place is the
// ephemeris's at [now], and the row says so (`ephemeris`).
export function framingSearchTarget(row, now = new Date()) {
  if (!row?.id || !row?.designation) return null;
  const catalogueCoordinate = cataloguePlannerCoordinate({
    ra: row?.ra,
    dec: row?.dec,
  });
  const place = catalogueCoordinate
    ? null
    : solarSystemEquatorJ2000(row.id, now);
  const coordinate = catalogueCoordinate ?? place;
  if (!coordinate) return null;
  return {
    id: row.id,
    source: row.designation,
    designation: row.designation,
    name: row.name || null,
    title: row.title || row.designation,
    objects: [...new Set([row.designation, ...(row.aliases || [])])],
    catalogue: row.catalogue || null,
    catalogues: row.catalogues || [],
    coordinate,
    coordinateUnit: "degrees",
    coordinateOrigin: place ? "ephemeris" : "catalogue-hours",
    ...(place ? { ephemeris: true } : {}),
    apparentSizeArcmin: Array.isArray(row.sizeArcmin)
      ? [...row.sizeArcmin]
      : [],
    integratedMagnitude: row.magnitude ?? null,
    skyTarget: {
      typeKey: row.typeKey,
      constellationKey: row.constellationKey,
      type: row.typeLabel,
      constellation: row.constellationLabel,
    },
    tags: (row.catalogues || []).map((entry) => String(entry).toLowerCase()),
  };
}

// "M31 · Galaxie d’Andromède": what the map writes beside the highlighted
// target and what the chip names. The designation alone when the target has no
// common name.
export function framingSearchLabel(target) {
  if (!target) return "";
  const designation = target.designation || target.title || "";
  const name = target.name || "";
  return name && name !== designation
    ? `${designation} · ${name}`
    : designation;
}

function compact(value, locale) {
  return normalizeSearch(value, locale).replace(/[\s ._-]+/g, "");
}

function startsAWord(value, needle) {
  return (
    value === needle ||
    value.startsWith(needle) ||
    value.split(/[\s '’·—-]+/).some((word) => word.startsWith(needle))
  );
}

// What the visitor typed goes ahead of what the catalogue finds most
// noteworthy: the exact designation, then an alias spelt the same way, then a
// designation that begins with it, then a name that does, then the rest. Within
// a rank the server's own order is kept (the sort is stable).
function matchRank(result, query, locale) {
  const needle = compact(query, locale);
  if (!needle) return 4;
  const designation = compact(result?.designation, locale);
  if (designation === needle) return 0;
  const aliases = (result?.aliases || []).map((alias) =>
    compact(alias, locale),
  );
  if (aliases.includes(needle)) return 1;
  if (designation.startsWith(needle)) return 2;
  if (aliases.some((alias) => alias.startsWith(needle))) return 2;
  const spaced = normalizeSearch(query, locale).trim();
  const names = [result?.name, ...(result?.aliases || [])]
    .filter(Boolean)
    .map((name) => normalizeSearch(name, locale));
  if (names.some((name) => startsAWord(name, spaced))) return 3;
  return 4;
}

export function rankFramingSearchResults(results, query, locale = "en") {
  return (results || [])
    .map((result, index) => ({
      result,
      index,
      rank: matchRank(result, query, locale),
    }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ result }) => result);
}

function isCombiningMark(character) {
  return /\p{M}/u.test(character);
}

// The text cut in pieces around the first place the query matches, ignoring
// case and accents the way the search itself does. A ligature the search reads
// as two letters ("œ" for "oe") is highlighted whole, and an accent written as
// a separate combining mark stays with its letter.
export function framingSearchHighlight(text, query, locale = "en") {
  const source = typeof text === "string" ? text : "";
  if (!source) return [];
  const needle = normalizeSearch(query, locale).trim();
  if (!needle) return [{ text: source, match: false }];
  let folded = "";
  const origin = [];
  let index = 0;
  for (const character of source) {
    const piece = normalizeSearch(character, locale);
    for (let offset = 0; offset < piece.length; offset += 1)
      origin.push({ start: index, end: index + character.length });
    folded += piece;
    index += character.length;
  }
  const found = folded.indexOf(needle);
  if (found < 0) return [{ text: source, match: false }];
  const start = origin[found].start;
  let end = origin[found + needle.length - 1].end;
  while (end < source.length) {
    const next = String.fromCodePoint(source.codePointAt(end));
    if (!isCombiningMark(next)) break;
    end += next.length;
  }
  return [
    ...(start > 0 ? [{ text: source.slice(0, start), match: false }] : []),
    { text: source.slice(start, end), match: true },
    ...(end < source.length ? [{ text: source.slice(end), match: false }] : []),
  ];
}

function formatAngle(arcminutes, locale) {
  const formatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: arcminutes >= 1 && arcminutes < 10 ? 1 : 0,
  });
  return arcminutes < 1
    ? `${formatter.format(arcminutes * 60)}″`
    : `${formatter.format(arcminutes)}′`;
}

// "190′ × 60′", "75′", "32″ × 28″": arcminutes, and arcseconds for what is
// under one arcminute. Two axes that are the same to a hundredth of an
// arcminute are one figure.
export function formatFramingSearchSize(sizeArcmin, locale = "en") {
  const sizes = (Array.isArray(sizeArcmin) ? sizeArcmin : [])
    .map(Number)
    .filter((size) => Number.isFinite(size) && size > 0);
  if (!sizes.length) return "";
  const [major, minor] = sizes;
  if (minor === undefined || Math.abs(major - minor) <= 0.05)
    return formatAngle(major, locale);
  return `${formatAngle(major, locale)} × ${formatAngle(minor, locale)}`;
}

export function formatFramingSearchMagnitude(magnitude, locale = "en") {
  if (magnitude === null || magnitude === undefined || magnitude === "")
    return "";
  const value = Number(magnitude);
  if (!Number.isFinite(value)) return "";
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

// The field a chosen target is shown in: two and a half times its larger
// axis, so it fills two fifths of the map with sky around it. A target with no
// known size is taken to be ten arcminutes across. The frame the visitor is
// about to place is never left outside: the field keeps one and a half times
// its larger side, however small the target. Always inside the map's own
// bounds.
export const framingSearchFieldFactor = 2.5;
export const framingSearchFrameFactor = 1.5;
export const framingSearchDefaultSizeArcmin = 10;

export function framingSearchFieldDegrees(target, field = null) {
  const sizes = (target?.apparentSizeArcmin || [])
    .map(Number)
    .filter((size) => Number.isFinite(size) && size > 0);
  const targetDegrees =
    (sizes.length ? Math.max(...sizes) : framingSearchDefaultSizeArcmin) / 60;
  const frameSide = Math.max(
    Number(field?.width) || 0,
    Number(field?.height) || 0,
  );
  return clampMapFov(
    Math.max(
      targetDegrees * framingSearchFieldFactor,
      frameSide * framingSearchFrameFactor,
    ),
  );
}
