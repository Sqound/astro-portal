// Indicative observing recommendations, not a hard physical feasibility test.
// Explicit catalogue families take precedence over the type-based fallback.
import { visualFilterFamiliesByGain } from "./visual-model.js";

export const genericPlannerFilters = [
  { id: "filter-broadband", name: "UV/IR-cut · RGB", family: "broadband" },
  { id: "filter-dual", name: "Duo-band", family: "dual" },
  { id: "filter-ha", name: "Hα", family: "ha" },
  { id: "filter-oiii", name: "O III", family: "oiii" },
  { id: "filter-sii", name: "S II", family: "sii" },
  { id: "filter-uhc", name: "UHC", family: "uhc" },
  { id: "filter-hb", name: "Hβ", family: "hb" },
];
// The channel filters of a mono camera (`l` luminance, `r`, `g`, `b`) and the
// solar filters (`solar`) are sorted into families of their own ("Prise de vue
// par cible"): the exposure rule reads the column of a mono camera from them.
// They are not in `genericPlannerFilters`, which lists the generic filters a
// guest is offered.
export const channelFilterFamilies = Object.freeze(["l", "r", "g", "b"]);
// The families a filter is sorted into, in the order the catalogue lists them.
export const plannerFilterFamilies = Object.freeze([
  ...genericPlannerFilters.map((filter) => filter.family),
  ...channelFilterFamilies,
  "solar",
]);
// The families that satisfy a recommendation of `broadband`, most direct
// first: a luminance or a colour-channel filter is a broadband filter for the
// compatibility and the advice, as the name "Luminance" always was.
export const broadbandFilterFamilies = Object.freeze([
  "broadband",
  ...channelFilterFamilies,
]);
// Whether a filter of family `owned` meets the recommended family.
export const filterFamilyMeets = (owned, recommended) =>
  owned === recommended ||
  (recommended === "broadband" && broadbandFilterFamilies.includes(owned));
const normalize = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function filterFamily(filter) {
  if (filter?.family) return filter.family;
  const name = normalize(typeof filter === "string" ? filter : filter?.name);
  if (
    /duo|dual|double.?band|bi.?band|tri.?band|quad.?band|l.extreme|l.enhance|sv220|sv240/.test(
      name,
    )
  )
    return "dual";
  if (/h.?alpha|hα|\bha\b/.test(name)) return "ha";
  if (/h.?beta|hβ|\bhb\b/.test(name)) return "hb";
  if (/o[ -]?(iii|3)/.test(name)) return "oiii";
  if (/s[ -]?(ii|2)/.test(name)) return "sii";
  if (/uhc/.test(name)) return "uhc";
  if (/solar|soleil/.test(name)) return "solar";
  if (/uv|ir.cut|rgb|clear|broadband|l.pro/.test(name)) return "broadband";
  // A mono camera's own filters: luminance and the three colour channels.
  if (/luminance|\blum\b|^\s*l\s*$/.test(name)) return "l";
  if (/\b(red|rouge)\b|^\s*r\s*$/.test(name)) return "r";
  if (/\b(green|vert)\b|^\s*g\s*$/.test(name)) return "g";
  if (/\b(blue|bleu)\b|^\s*b\s*$/.test(name)) return "b";
  return null;
}
export function recommendedFilterFamilies(target, mode = "imaging") {
  const guide =
    target?.knowledge?.observingGuide || target?.observingGuide || {};
  const explicit =
    mode === "visual" ? guide.visualFilterFamilies : guide.photoFilterFamilies;
  if (Array.isArray(explicit)) return explicit;
  const type = normalize(
    target?.skyTarget?.typeKey || target?.typeKey || target?.skyTarget?.type,
  );
  if (
    /reflection|reflexion|dark|sombre|galax|cluster|amas|etoile|star/.test(type)
  )
    return ["broadband"];
  // At the eyepiece, the families of the visual model's gains, the largest
  // first (`visual-model.js`): OIII then UHC on a remnant or a planetary
  // nebula, UHC, OIII then Hβ on an emission nebula, Hβ on the California.
  if (/planetary nebula|nebuleuse planetaire/.test(type))
    return mode === "visual"
      ? visualFilterFamiliesByGain(target) || ["oiii", "uhc"]
      : ["dual", "ha", "oiii"];
  if (/emission|supernova|remnant|remanent|h ii/.test(type))
    return mode === "visual"
      ? visualFilterFamiliesByGain(target) || ["uhc", "oiii", "hb"]
      : ["dual", "ha", "oiii", "sii"];
  if (/planet|planete|lune|moon|comet/.test(type)) return ["broadband"];
  return null;
}
export function targetFilterCompatibility(target, profile) {
  const selected = profile?.filterProfiles || profile?.filters || [];
  if (!selected.length)
    return profile?.unresolvedFilterIds?.length ? null : true;
  const recommended = recommendedFilterFamilies(target, profile?.mode);
  if (!recommended) return null;
  const families = selected.map(filterFamily);
  if (
    families.some((family) =>
      recommended.some((wanted) => filterFamilyMeets(family, wanted)),
    )
  )
    return true;
  return families.some((family) => !family) ? null : false;
}

// Filter advice for a night, from the Moon. Indicative, like the rest of
// this file; it names a family of filter, never a brand.

// From this share of the disc lit (excluded), a Moon above the horizon
// brightens the sky enough that a narrowband filter is worth its place;
// at or under it the Moon hardly matters.
export const filterMoonIlluminationPercent = 30;
// The families that isolate emission lines, in the order the advice prefers
// them on an emission nebula. `uhc` (a light-pollution filter) is not one.
export const narrowbandFilterFamilies = Object.freeze([
  "dual",
  "ha",
  "oiii",
  "sii",
  "hb",
]);
// A stretch of the night shorter than this is not worth a sentence: it
// is absorbed by the stretch before it (or after it, at the start).
export const filterAdviceMinimumMinutes = 15;
const minuteMs = 60000;

const instant = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};
const roundToMinute = (ms) => Math.round(ms / minuteMs) * minuteMs;

// The stretches of `[start, end]` the Moon is above the horizon (`up`) or not,
// from its altitude series (`{ time, altitude }`, the horizon crossings found
// by linear interpolation and rounded to the minute), as `[{ from, to, up }]`
// in epoch milliseconds; `null` when the series cannot tell.
function moonStretches(moonSeries, start, end) {
  const points = (Array.isArray(moonSeries) ? moonSeries : [])
    .map((point) => ({
      time: instant(point?.time),
      altitude:
        typeof point?.altitude === "number" && Number.isFinite(point.altitude)
          ? point.altitude
          : null,
    }))
    .filter((point) => point.time !== null && point.altitude !== null)
    .sort((a, b) => a.time - b.time);
  if (points.length < 2) return null;
  const stretches = [];
  let current = { from: -Infinity, up: points[0].altitude > 0 };
  for (let index = 1; index < points.length; index += 1) {
    const before = points[index - 1];
    const after = points[index];
    if (before.altitude > 0 === after.altitude > 0) continue;
    const crossing =
      before.time +
      ((0 - before.altitude) / (after.altitude - before.altitude)) *
        (after.time - before.time);
    stretches.push({ ...current, to: roundToMinute(crossing) });
    current = { from: roundToMinute(crossing), up: after.altitude > 0 };
  }
  stretches.push({ ...current, to: Infinity });
  return stretches
    .map((stretch) => ({
      up: stretch.up,
      from: Math.max(stretch.from, start),
      to: Math.min(stretch.to, end),
    }))
    .filter((stretch) => stretch.to > stretch.from);
}

// The neighbours of the same kind joined into one.
function joined(stretches) {
  const result = [];
  for (const stretch of stretches) {
    const last = result.at(-1);
    if (last && last.up === stretch.up) last.to = stretch.to;
    else result.push({ ...stretch });
  }
  return result;
}

// A stretch under `filterAdviceMinimumMinutes` is absorbed: by the one before
// it, or by the one after it at the start of the night.
function withoutShortStretches(stretches) {
  let list = joined(stretches);
  const minimum = filterAdviceMinimumMinutes * minuteMs;
  for (;;) {
    const index = list.findIndex(
      (stretch) => stretch.to - stretch.from < minimum,
    );
    if (index < 0 || list.length === 1) break;
    if (index > 0) {
      list[index - 1] = { ...list[index - 1], to: list[index].to };
      list.splice(index, 1);
    } else {
      list[1] = { ...list[1], from: list[0].from };
      list.shift();
    }
    list = joined(list);
  }
  return list.length === 1 && list[0].to - list[0].from < minimum ? [] : list;
}

// The advice for a night, as an ordered list of
// `{ key, from, to, span, filterFamily, targetKind }` — keys, not sentences:
// each platform words them in the reader's language.
//
// - `ownedFilters`: `{ name, family? }` entries (the family is read from the
//   name when absent);
// - `moonSeries`: `{ time, altitude }` samples of the Moon over the night;
// - `night`: `{ start, end, moonIllumination }`, the instants ISO-8601 or
//   epoch milliseconds, the illumination in percent. `start` and `end`
//   default to the first and last sample of the series.
//
// While the Moon is above the horizon and more than 30 % lit, a narrowband
// filter (a dual-band one first) is advised on emission nebulae
// (`moon-up-narrowband`; `moon-up-narrowband-missing` names the family that
// would help when none is owned). When the Moon is down, or 30 % lit or less
// all night (`moon-dim-…`), a broadband filter suffices for galaxies
// (`moon-down-broadband` and `moon-dim-broadband`, with their `-missing`
// forms). `span` says where the stretch sits in the night: `whole`, `start`
// (from the beginning to `to`), `end` (from `from` to the end) or `middle`.
// `from` and `to` are ISO-8601 UTC instants. Without the data to tell (no
// illumination, or a bright Moon and no usable series) the list is empty.
export function filterAdviceForNight({ ownedFilters, moonSeries, night } = {}) {
  const illumination = night?.moonIllumination;
  if (typeof illumination !== "number" || !Number.isFinite(illumination))
    return [];
  const series = (Array.isArray(moonSeries) ? moonSeries : [])
    .map((point) => instant(point?.time))
    .filter((time) => time !== null);
  const start =
    instant(night?.start) ?? (series.length ? Math.min(...series) : null);
  const end =
    instant(night?.end) ?? (series.length ? Math.max(...series) : null);
  if (start === null || end === null || end <= start) return [];
  const dim = illumination <= filterMoonIlluminationPercent;
  let stretches;
  if (dim) stretches = [{ from: start, to: end, up: false }];
  else {
    stretches = moonStretches(moonSeries, start, end);
    if (!stretches?.length) return [];
    stretches = withoutShortStretches(stretches);
  }
  const families = (Array.isArray(ownedFilters) ? ownedFilters : []).map(
    (filter) => filterFamily(filter),
  );
  const narrowband = narrowbandFilterFamilies.find((family) =>
    families.includes(family),
  );
  const hasBroadband = families.some((family) =>
    filterFamilyMeets(family, "broadband"),
  );
  return stretches.map((stretch) => {
    const span =
      stretch.from === start && stretch.to === end
        ? "whole"
        : stretch.from === start
          ? "start"
          : stretch.to === end
            ? "end"
            : "middle";
    const range = {
      from: new Date(stretch.from).toISOString(),
      to: new Date(stretch.to).toISOString(),
      span,
    };
    if (stretch.up)
      return narrowband
        ? {
            key: "moon-up-narrowband",
            ...range,
            filterFamily: narrowband,
            targetKind: "emission",
          }
        : {
            key: "moon-up-narrowband-missing",
            ...range,
            filterFamily: "dual",
            targetKind: "emission",
          };
    const kind = dim ? "moon-dim-broadband" : "moon-down-broadband";
    return {
      key: hasBroadband ? kind : `${kind}-missing`,
      ...range,
      filterFamily: "broadband",
      targetKind: "galaxy",
    };
  });
}
