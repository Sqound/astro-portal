// The suggestion filters on the web: the filters of the
// suggestions kept in this browser (localStorage, like the photo / visual
// mode: never sent to a server, never part of a space or of a plan), their
// words — the summary fused into the line under « À voir ce soir », the
// badges of the bar « Filtres » — and the line under the title. The rules
// (pool, periods, mask) are `suggest-filters.js`, shared with the app.
import { message } from "portal/i18n.js";
import { countedText } from "portal/components/filters/FilterControls.js";
import {
  normalizeSuggestFilters,
  suggestFiltersActiveCount,
} from "./suggest-filters.js";

export const suggestFiltersStorageKey = "astro-portal:suggest:filters:v1";

const store = () => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
};

const listeners = new Set();

/** The filters kept in this browser (none when nothing is kept). */
export function readSuggestFilters(storage = store()) {
  try {
    const raw = storage?.getItem(suggestFiltersStorageKey);
    return normalizeSuggestFilters(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeSuggestFilters(null);
  }
}

/**
 * Keeps `filters`; answers whether they could be kept. The page is told
 * either way: filters that cannot be written hold for this page.
 */
export function writeSuggestFilters(filters, storage = store()) {
  const value = normalizeSuggestFilters(filters);
  let kept = true;
  try {
    storage.setItem(suggestFiltersStorageKey, JSON.stringify(value));
  } catch {
    kept = false;
  }
  for (const listener of [...listeners]) listener(value);
  return kept;
}

/**
 * Calls `listener` when the filters change, in this page or in another tab;
 * answers the function that stops it.
 */
export function subscribeSuggestFilters(
  listener,
  target = typeof window !== "undefined" ? window : null,
) {
  const onStorage = (event) => {
    if (event?.key === null || event?.key === suggestFiltersStorageKey)
      listener(readSuggestFilters());
  };
  listeners.add(listener);
  target?.addEventListener?.("storage", onStorage);
  return () => {
    listeners.delete(listener);
    target?.removeEventListener?.("storage", onStorage);
  };
}

const fill = (template, values) =>
  Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value ?? "")),
    template,
  );

const familyKey = {
  nebulae: "suggestFiltersNebulae",
  clusters: "suggestFiltersClusters",
  galaxies: "suggestFiltersGalaxies",
};
const periodKey = {
  start: "suggestFiltersStart",
  middle: "suggestFiltersMiddle",
  end: "suggestFiltersEnd",
};
const periodLongKey = {
  start: "suggestFiltersStartLong",
  middle: "suggestFiltersMiddleLong",
  end: "suggestFiltersEndLong",
};

export const suggestFamilyWord = (locale, family) =>
  message(locale, familyKey[family]);
export const suggestPeriodWord = (locale, period) =>
  message(locale, periodKey[period]);
export const suggestPeriodLongWord = (locale, period) =>
  message(locale, periodLongKey[period]);

/**
 * The filters in use as one line (« Messier, NGC · Nébuleuses · Milieu de
 * nuit · Sans masque d'horizon »); `null` when none is.
 */
export function suggestFiltersSummary(locale, raw) {
  const filters = normalizeSuggestFilters(raw);
  const parts = [
    filters.catalogues.join(", "),
    filters.families
      .map((value) => suggestFamilyWord(locale, value))
      .join(", "),
    filters.periods
      .map((value) => suggestPeriodLongWord(locale, value))
      .join(", "),
    filters.ignoreMask ? message(locale, "suggestFiltersMaskBadge") : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * The line under « À voir ce soir » when filters are in use: « Photo ·
 * Maison · Messier · Milieu de nuit » (from the second ten « 11 à 20 · … »);
 * `null` without filters or without a place name (the line of before).
 */
export function suggestFiltersLine(
  locale,
  { mode, tier = 1, placeName, filters },
) {
  const summary = suggestFiltersSummary(locale, filters);
  if (!summary || !placeName) return null;
  const line = fill(
    message(
      locale,
      mode === "visual"
        ? "suggestFiltersVisualLine"
        : "suggestFiltersPhotoLine",
    ),
    { place: placeName, filters: summary },
  );
  return tier > 1
    ? fill(message(locale, "suggestFiltersPositionsLine"), {
        from: (tier - 1) * 10 + 1,
        to: tier * 10,
        line,
      })
    : line;
}

/**
 * The badges of the bar « Filtres » (`FilterBadges`): one per category in
 * use, each taken off by its × (`onChange` gets the filters without it).
 */
export function suggestFilterBadges(locale, raw, onChange) {
  const filters = normalizeSuggestFilters(raw);
  return [
    filters.catalogues.length && {
      id: "catalogues",
      category: message(locale, "suggestFiltersCatalogues"),
      value: filters.catalogues.join(", "),
      onRemove: () => onChange({ ...filters, catalogues: [] }),
    },
    filters.families.length && {
      id: "families",
      category: message(locale, "suggestFiltersTypeShort"),
      value: filters.families
        .map((value) => suggestFamilyWord(locale, value))
        .join(", "),
      onRemove: () => onChange({ ...filters, families: [] }),
    },
    filters.periods.length && {
      id: "periods",
      category: message(locale, "suggestFiltersPeriodShort"),
      value: filters.periods
        .map((value) => suggestPeriodLongWord(locale, value))
        .join(", "),
      onRemove: () => onChange({ ...filters, periods: [] }),
    },
    filters.ignoreMask && {
      id: "mask",
      category: message(locale, "suggestFiltersMaskBadge"),
      value: null,
      onRemove: () => onChange({ ...filters, ignoreMask: false }),
    },
  ].filter(Boolean);
}

/** The name of the filter icon of « À voir ce soir », with its count. */
export function suggestFiltersButtonLabel(locale, raw) {
  const count = suggestFiltersActiveCount(raw);
  return count
    ? countedText(locale, "suggestFiltersButtonActive", count)
    : message(locale, "suggestFiltersButton");
}
