// The filters of the suggestions —
// « À voir ce soir », the sheet « Suggérer les meilleures cibles » and the
// planner share one setting per device.
//
//   - catalogues (several, « ou »): Messier, NGC, IC, Caldwell, Sharpless,
//     Barnard, Abell; a target in several catalogues passes as soon as one
//     ticked catalogue holds it (M31 = Messier + NGC 224). None ticked: all.
//   - type of target (several, « ou »): three families — nebulae (emission,
//     reflection, planetary, supernova remnant, dark), clusters (open,
//     globular), galaxies. None ticked: all. No planets (none is suggested).
//   - period of the night (several, « ou »): the thirds of the dark night of
//     the place and the night shown (« Début », « Milieu », « Fin »), never
//     fixed hours; two thirds that touch make one stretch (« Début + Milieu »
//     = 18:09 → 01:08), « Début + Fin » two stretches. The engine places a
//     target only inside them (`spans` of `autoFillNight`), cut by the
//     person's own window (« Nuit en cours », a plan's span).
//   - « Ignorer le masque d'horizon »: the candidates are made without the
//     place's mask (the mask itself is never touched); the time a target
//     spends behind it is kept on its card (`maskHidden`) so that its line
//     can say « Derrière le masque de 19:10 à 20:25 ».
//
// The catalogue and type filters are laid on the pool **before** its cut to
// the first 48 (`filterSuggestionPool`): after the cut, a rare catalogue
// would leave nothing. Pure (JSON in, JSON out); the mobile application
// holds the same rules, pinned by the fixtures
// `suggest-filter-matches`, `suggest-period-spans`, `suggest-mask-hidden`
// and `suggest-filtered-count`.
import {
  recommendationCataloguesFor,
  recommendationTypeFor,
} from "./recommendations.js";

export const suggestFilterCatalogues = Object.freeze([
  "Messier",
  "NGC",
  "IC",
  "Caldwell",
  "Sharpless",
  "Barnard",
  "Abell",
]);

export const suggestFilterFamilies = Object.freeze([
  "nebulae",
  "clusters",
  "galaxies",
]);

export const suggestFilterPeriods = Object.freeze(["start", "middle", "end"]);

// The family of each type of the taxonomy (`catalog-taxonomy.ts`).
const familyOfType = Object.freeze({
  Galaxie: "galaxies",
  "Amas globulaire": "clusters",
  "Amas ouvert": "clusters",
  "Nébuleuse en émission": "nebulae",
  "Nébuleuse en réflexion": "nebulae",
  "Nébuleuse planétaire": "nebulae",
  "Rémanent de supernova": "nebulae",
  "Nébuleuse sombre": "nebulae",
});

const minuteMs = 60000;

function instant(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

const iso = (ms) => new Date(ms).toISOString();

function chosen(values, offered) {
  const set = new Set(Array.isArray(values) ? values : []);
  return offered.filter((value) => set.has(value));
}

/**
 * The filters as stored, made whole: `{ catalogues, families, periods,
 * ignoreMask }`, each list in the order the sheet offers it, an unknown value
 * dropped. Nothing chosen is the default (no filter).
 */
export function normalizeSuggestFilters(raw) {
  const value = raw && typeof raw === "object" ? raw : {};
  return {
    catalogues: chosen(value.catalogues, suggestFilterCatalogues),
    families: chosen(value.families, suggestFilterFamilies),
    periods: chosen(value.periods, suggestFilterPeriods),
    ignoreMask: value.ignoreMask === true,
  };
}

/** The number of categories in use (the badge on the filter icon). */
export function suggestFiltersActiveCount(raw) {
  const filters = normalizeSuggestFilters(raw);
  return (
    (filters.catalogues.length ? 1 : 0) +
    (filters.families.length ? 1 : 0) +
    (filters.periods.length ? 1 : 0) +
    (filters.ignoreMask ? 1 : 0)
  );
}

/** The family of a target (`nebulae`, `clusters`, `galaxies`), else `null`. */
export function suggestionTargetFamily(target) {
  return familyOfType[recommendationTypeFor(target)] ?? null;
}

/**
 * Whether `target` passes the catalogue and type filters of `filters` (the
 * period and the mask are the engine's and the candidates' own).
 */
export function suggestionTargetMatches(target, raw) {
  const filters = normalizeSuggestFilters(raw);
  if (filters.catalogues.length) {
    const own = new Set(recommendationCataloguesFor(target));
    if (!filters.catalogues.some((catalogue) => own.has(catalogue)))
      return false;
  }
  if (filters.families.length) {
    const family = suggestionTargetFamily(target);
    if (!family || !filters.families.includes(family)) return false;
  }
  return true;
}

// The pool of the suggestions (a catalogue ticked as a filter brings the
// whole of that catalogue): by default every target of the two
// editorial selections (`extended`, the planner's pool: « Essentielles » and
// « Étendues », disjoint lists) that culminates high enough at the place,
// kept to the profile's mode (TARGET-SELECTIONS-TAGS-01); a catalogue
// ticked, that whole catalogue (several: their union) ranked for the place,
// whatever the mode, up to `suggestionCataloguePoolLimit` (NGC and IC hold
// thousands of objects).
export const suggestionPoolSelection = "extended";
export const suggestionPoolLimit = 1000;
export const suggestionCataloguePoolLimit = 600;

/**
 * What the pool of the suggestions is asked with for `filters`: `{
 * selection, catalogues, limit }` (`/api/planner-targets`, the device's
 * catalogue). The types ticked filter the answer (`filterSuggestionPool`).
 */
export function suggestionPoolQuery(raw) {
  const { catalogues } = normalizeSuggestFilters(raw);
  return catalogues.length
    ? { selection: "", catalogues, limit: suggestionCataloguePoolLimit }
    : {
        selection: suggestionPoolSelection,
        catalogues: [],
        limit: suggestionPoolLimit,
      };
}

/**
 * The pool of the suggestions: the targets that pass the catalogue and type
 * filters, in their order, the first `size` of them — the filter before the
 * cut, never after.
 */
export function filterSuggestionPool(targets, raw, size) {
  const list = Array.isArray(targets) ? targets : [];
  const kept = list.filter((target) => suggestionTargetMatches(target, raw));
  return Number.isInteger(size) && size >= 0 ? kept.slice(0, size) : kept;
}

/**
 * The three thirds of the dark night `night` (`{ start, end }`): `[{ key,
 * start, end }]` in ISO, each edge on the whole minute (half up); `null` when
 * the night cannot be read.
 */
export function nightPeriods(night) {
  const start = instant(night?.start);
  const end = instant(night?.end);
  if (start === null || end === null || !(end > start)) return null;
  const edge = (fraction) =>
    Math.floor((start + (end - start) * fraction) / minuteMs + 0.5) * minuteMs;
  const edges = [start, edge(1 / 3), edge(2 / 3), end];
  return suggestFilterPeriods.map((key, index) => ({
    key,
    start: iso(edges[index]),
    end: iso(edges[index + 1]),
  }));
}

/**
 * The stretches of the night the chosen periods make (`[{ start, end }]`,
 * ISO, earliest first; two thirds that touch make one): what `autoFillNight`
 * takes as `spans`. `null` when no period is chosen or the night cannot be
 * read — the whole night, never nothing.
 */
export function suggestionPeriodSpans(night, periods) {
  const wanted = chosen(periods, suggestFilterPeriods);
  const thirds = nightPeriods(night);
  if (!wanted.length || !thirds) return null;
  const spans = [];
  for (const third of thirds) {
    if (!wanted.includes(third.key)) continue;
    const last = spans[spans.length - 1];
    if (last && last.end === third.start) last.end = third.end;
    else spans.push({ start: third.start, end: third.end });
  }
  return spans;
}

// `[{ start, end }]` in epoch ms, earliest first, overlaps merged.
function intervalsOf(list) {
  const read = (Array.isArray(list) ? list : [])
    .map((entry) => ({
      start: instant(entry?.start),
      end: instant(entry?.end),
    }))
    .filter(
      (entry) =>
        entry.start !== null && entry.end !== null && entry.end > entry.start,
    )
    .sort((a, b) => a.start - b.start);
  const merged = [];
  for (const entry of read) {
    const last = merged[merged.length - 1];
    if (last && entry.start <= last.end)
      last.end = Math.max(last.end, entry.end);
    else merged.push({ ...entry });
  }
  return merged;
}

/**
 * `card` with its visibility windows cut to `spans` (and its usable start and
 * end to what is left): the target as the engine sees it inside the chosen
 * periods. A card without windows, or `spans` that is not a list, is
 * returned as it is.
 */
export function cardWithinSpans(card, spans) {
  if (!card || typeof card !== "object" || !Array.isArray(spans)) return card;
  const ranges = intervalsOf(spans);
  const next = { ...card };
  if (Array.isArray(card.visibilityWindows)) {
    next.visibilityWindows = card.visibilityWindows.flatMap((window) => {
      const from = instant(window?.start);
      const to = instant(window?.end);
      if (from === null || to === null || !(to > from)) return [];
      return ranges.flatMap((range) => {
        const start = Math.max(from, range.start);
        const end = Math.min(to, range.end);
        return end > start
          ? [{ ...window, start: iso(start), end: iso(end) }]
          : [];
      });
    });
    const windows = next.visibilityWindows;
    if (
      instant(card.usableStart) !== null &&
      instant(card.usableEnd) !== null &&
      windows.length
    ) {
      next.usableStart = windows[0].start;
      next.usableEnd = windows[windows.length - 1].end;
    }
  }
  return next;
}

/**
 * The stretches during which a target is up for the night (`unmasked`, its
 * visibility windows without the mask) but behind the mask (not in `masked`,
 * its windows with the mask): `[{ start, end }]`, ISO, earliest first, each a
 * minute or longer.
 */
export function maskHiddenWindows(unmasked, masked) {
  const clear = intervalsOf(masked);
  const hidden = [];
  for (const window of intervalsOf(unmasked)) {
    let cursor = window.start;
    for (const range of clear) {
      if (range.end <= cursor || range.start >= window.end) continue;
      if (range.start > cursor)
        hidden.push({ start: cursor, end: range.start });
      cursor = Math.max(cursor, range.end);
    }
    if (cursor < window.end) hidden.push({ start: cursor, end: window.end });
  }
  return hidden
    .filter((entry) => entry.end - entry.start >= minuteMs)
    .map((entry) => ({ start: iso(entry.start), end: iso(entry.end) }));
}

/**
 * « Voir N cibles »: how many of `candidates` (`[{ card }]`, the pool already
 * filtered by catalogue and type and made with or without the mask) have, in
 * `spans` (all the night when `null`), a visibility window of
 * `minimumMinutes` or more.
 */
export function suggestionFilteredCount({
  candidates,
  spans = null,
  minimumMinutes = 45,
} = {}) {
  let count = 0;
  for (const entry of Array.isArray(candidates) ? candidates : []) {
    const card = Array.isArray(spans)
      ? cardWithinSpans(entry?.card, spans)
      : entry?.card;
    const longest = intervalsOf(card?.visibilityWindows).reduce(
      (best, window) => Math.max(best, window.end - window.start),
      0,
    );
    if (longest >= minimumMinutes * minuteMs) count += 1;
  }
  return count;
}
