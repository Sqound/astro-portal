// The proposal rule of "Prise de vue par cible": the effective acquisition
// lines of a plan item, with, for every field of every line, the value and
// where it comes from. Pure; no screen.
//
// The order of a field, from the most to the least authoritative:
//
//   1. the target's line (`item.acquisition.lines[i]`)           chosen-target
//   2. `item.filter`, for the filter of the FIRST line only      chosen-target
//   3. the plan's defaults (`plan.acquisitionDefaults`)          chosen-plan
//   4. the rule below                                            suggested
//   5. nothing: the device's own setting                         device
//
// A choice is never rewritten by the rule. Photo mode only: in visual mode
// `effectiveAcquisition` returns `null` and nothing is proposed.
//
// Every value that is not yet confirmed is marked `// à confirmer` in `rule`;
// they change in this one place together with a bump of `acquisitionRuleVersion`.
import {
  broadbandFilterFamilies,
  filterFamily,
  filterMoonIlluminationPercent,
  narrowbandFilterFamilies,
  recommendedFilterFamilies,
} from "./filters.js";
import { cameraProfiles, telescopeProfiles } from "./planner.js";
import {
  acquisitionLimits,
  planAcquisitionDefaults,
  planItemAcquisitionLines,
} from "./plan-acquisition.js";

// Written into `launchedSchedule[].ruleVersion` at the launch. Bump it
// whenever `rule` changes: a plan launched under an older rule keeps what it
// froze.
export const acquisitionRuleVersion = "expo-b-1";

// The ONE table. Exposures are in seconds.
const rule = {
  version: acquisitionRuleVersion,
  // The camera's read-out between two exposures: ⌊slot ÷ (exposure + this)⌋.
  readOutSeconds: 2, // à confirmer
  // A video of a planet or of the Moon lasts this long at most.
  videoSeconds: 90, // à confirmer
  // The exposures the rule rounds to (nearest, never above a cap).
  steps: [10, 15, 20, 30, 60, 90, 120, 180, 240, 300, 600],
  // Base exposure by kind of target (rows) and by camera × filter (columns):
  // a colour camera behind a broadband filter, a colour camera behind a dual
  // band, a mono camera behind L or a colour channel, a mono camera behind a
  // narrowband filter. `null` is "—": the column does not apply and the
  // broadband column of the same camera is read. `gain` is what the gain
  // follows: `unity` (the profile's unity or HCG gain), `high` or `low` (a
  // video).
  kinds: {
    emission: {
      colourBroadband: 120, // à confirmer
      colourDual: 300, // à confirmer
      monoBroadband: 120, // à confirmer
      monoNarrow: 300, // à confirmer
      gain: "unity",
      video: false,
    },
    planetary: {
      colourBroadband: 120, // à confirmer
      colourDual: 300, // à confirmer
      monoBroadband: 60, // à confirmer
      monoNarrow: 300, // à confirmer
      gain: "unity",
      video: false,
    },
    reflection: {
      colourBroadband: 180, // à confirmer
      colourDual: null,
      monoBroadband: 180, // à confirmer
      monoNarrow: null,
      gain: "unity",
      video: false,
    },
    galaxy: {
      colourBroadband: 120, // à confirmer
      colourDual: null,
      monoBroadband: 120, // à confirmer
      monoNarrow: 300, // à confirmer -- Hα in support
      gain: "unity",
      video: false,
    },
    cluster: {
      colourBroadband: 60, // à confirmer
      colourDual: null,
      monoBroadband: 60, // à confirmer
      monoNarrow: null,
      gain: "unity",
      video: false,
    },
    comet: {
      colourBroadband: 60, // à confirmer
      colourDual: null,
      monoBroadband: 60, // à confirmer
      monoNarrow: null,
      gain: "unity",
      video: false,
    },
    planet: {
      colourBroadband: 0.01, // à confirmer
      colourDual: null,
      monoBroadband: 0.01, // à confirmer
      monoNarrow: null,
      gain: "high", // à confirmer
      video: true,
    },
    moon: {
      colourBroadband: 0.003, // à confirmer
      colourDual: null,
      monoBroadband: 0.002, // à confirmer
      monoNarrow: null,
      gain: "low", // à confirmer
      video: true,
    },
  },
  // The corrections, applied to a deep-sky exposure in this order.
  // 1. The sky (the place's SQM, measured > entered > model): dark from `dark`,
  //    bright under `bright`.
  sky: {
    dark: 21.3,
    bright: 20.3,
    broadband: {
      dark: 1.5, // à confirmer
      medium: 1,
      bright: 0.5, // à confirmer
    },
    narrowband: {
      dark: 1,
      medium: 1,
      bright: 0.75, // à confirmer
    },
  },
  // 2. The focal ratio N: × (N ÷ reference)², bounded. A telescope is `fast`
  //    up to f/`fast`, `slow` from f/`slow`.
  focalRatio: { reference: 5, minimum: 0.5, maximum: 2, fast: 4, slow: 7 },
  // 3. The mount: the longest exposure it holds. A mount that is not known
  //    caps nothing.
  mountCaps: {
    altaz: 30, // à confirmer
    equatorial: 60, // à confirmer
    guided: 600,
  },
  // 4. The maker's cap of the device (`maxExposureSeconds` of its profile):
  //    strict.
  // 5. Rounding to `steps`.
  // Binning: 2 on a mono camera that samples finer than this (″/pixel).
  binning: { monoBelowArcsecPerPixel: 0.6 }, // à confirmer
  // Gain: a DSLR's ISO; a smart telescope has no gain to propose.
  gain: { dslrIso: 800 }, // à confirmer
  // The Moon decides the filter above this share of the disc lit (percent):
  // the existing rule of `filters.js`.
  moonBrightPercent: filterMoonIlluminationPercent,
};

const clone = (value) => JSON.parse(JSON.stringify(value));

/** The rule as data (a copy). */
export function acquisitionRuleTable() {
  return clone(rule);
}

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const positive = (value) => {
  const number = finite(value);
  return number !== null && number > 0 ? number : null;
};
const has = (line, key) => Object.hasOwn(line, key);
const normalize = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * The kind of target the table is read by, from its type, or `null` for a
 * star, the Sun or a target of no type (nothing is proposed for it).
 */
export function acquisitionTargetKind(target) {
  const type = normalize(
    target?.skyTarget?.typeKey || target?.typeKey || target?.skyTarget?.type,
  );
  if (/planetary nebula|nebuleuse planetaire/.test(type)) return "planetary";
  if (/comet/.test(type)) return "comet";
  if (/lune|moon/.test(type)) return "moon";
  if (/planet|systeme solaire|solar system/.test(type)) return "planet";
  if (/reflection|reflexion|dark|sombre/.test(type)) return "reflection";
  if (/emission|supernova|remnant|remanent|h ii|hii/.test(type))
    return "emission";
  if (/galax/.test(type)) return "galaxy";
  if (/cluster|amas/.test(type)) return "cluster";
  return null;
}

const skyClassOf = (sqm) =>
  sqm === null
    ? null
    : sqm >= rule.sky.dark
      ? "dark"
      : sqm < rule.sky.bright
        ? "bright"
        : "medium";

const focalRatioClassOf = (ratio) =>
  ratio === null
    ? null
    : ratio <= rule.focalRatio.fast
      ? "fast"
      : ratio >= rule.focalRatio.slow
        ? "slow"
        : "medium";

// The nearest step; the lower one on a tie. Never above `ceiling`: the
// largest step under it, or the ceiling itself when it is under every step.
function roundToStep(value, ceiling) {
  const steps = rule.steps;
  let nearest = steps[0];
  for (const step of steps)
    if (Math.abs(step - value) < Math.abs(nearest - value)) nearest = step;
  if (ceiling === null || nearest <= ceiling) return nearest;
  const under = steps.filter((step) => step <= ceiling);
  return under.length ? under[under.length - 1] : ceiling;
}

/**
 * The equipment the rule reads, from the resolved profiles of a plan.
 *
 * @param {object} input
 * @param {object} [input.telescope] the telescope profile (a smart telescope
 *   carries `integratedCamera` and `mount`).
 * @param {object} [input.camera] the camera profile (ignored behind a smart
 *   telescope).
 * @param {number} [input.focalLengthMm] the focal length with the optical
 *   modifier applied; the telescope's own when absent.
 * @param {string} [input.mountKind] `altaz`, `equatorial` or `guided`; read
 *   from an integrated alt-az mount when absent.
 * @param {string} [input.deviceKind] `dslr`, `smart-telescope` or
 *   `dedicated`; `smart-telescope` behind an integrated camera.
 * @returns the `equipment` of an acquisition context. The traits a profile
 *   lacks are read from the common profile of the same id.
 */
export function acquisitionEquipment({
  telescope,
  camera,
  focalLengthMm,
  mountKind,
  deviceKind,
} = {}) {
  const smart = isObject(telescope?.integratedCamera);
  const sensor = smart ? telescope.integratedCamera : camera;
  const common = isObject(sensor)
    ? cameraProfiles.find((profile) => profile.id === sensor.id) || null
    : null;
  const commonTelescope = isObject(telescope)
    ? telescopeProfiles.find((profile) => profile.id === telescope.id) || null
    : null;
  const trait = (key) => sensor?.[key] ?? common?.[key];
  const sensorKind = trait("sensorKind");
  const mount = telescope?.mount;
  const mountText = normalize(`${mount?.id || ""} ${mount?.name || ""}`);
  const mountKindOf =
    mountKind === "altaz" ||
    mountKind === "equatorial" ||
    mountKind === "guided"
      ? mountKind
      : /alt.?az|azimut/.test(mountText)
        ? "altaz"
        : null;
  const maxExposureSeconds = positive(
    telescope?.maxExposureSeconds ?? commonTelescope?.maxExposureSeconds,
  );
  const unityGain = finite(trait("unityGain"));
  const hcgGain = finite(trait("hcgGain"));
  const pixelSizeUm = positive(sensor?.pixelSizeUm);
  const focal = positive(focalLengthMm) ?? positive(telescope?.focalLengthMm);
  const aperture = positive(telescope?.apertureMm);
  return {
    deviceKind:
      deviceKind === "dslr" ||
      deviceKind === "smart-telescope" ||
      deviceKind === "dedicated"
        ? deviceKind
        : smart
          ? "smart-telescope"
          : "dedicated",
    sensorKind:
      sensorKind === "mono" || sensorKind === "colour" ? sensorKind : null,
    pixelSizeUm,
    focalLengthMm: focal,
    apertureMm: aperture,
    unityGain,
    hcgGain,
    maxExposureSeconds,
    mountKind: mountKindOf,
  };
}

// The filters owned, as `{ name, family }` (the family read from the name
// when the entry names none).
function ownedFiltersOf(filters) {
  const list = [];
  for (const filter of Array.isArray(filters) ? filters : []) {
    const name = typeof filter === "string" ? filter : filter?.name;
    if (typeof name !== "string" || !name.trim()) continue;
    list.push({ name: name.trim(), family: filterFamily(filter) });
  }
  return list;
}

// The family of a filter named by the person: the owned filter of that name,
// else the family the name suggests; `null` for "no filter" or a name the
// planner cannot sort.
function familyOfFilterName(name, owned) {
  if (typeof name !== "string" || !name.trim()) return null;
  const wanted = name.trim().toLowerCase();
  const found = owned.find((filter) => filter.name.toLowerCase() === wanted);
  return found ? found.family : filterFamily(name);
}

// The owned filter the rule proposes, and the family it wanted.
//
// - Emission nebula, planetary nebula: the first owned filter of the families
//   the catalogue recommends, in its order (a dual band first); when none is
//   owned and the Moon is not bright, a broadband filter will do; otherwise
//   none.
// - Galaxy, cluster, reflection or dark nebula, comet, planet, Moon: a
//   broadband filter, a luminance first, a colour channel last.
function suggestFilter(target, owned, moonBright) {
  const recommended = recommendedFilterFamilies(target, "imaging");
  if (!recommended?.length) return { name: null, family: null, missing: false };
  const wantsNarrowband = recommended.some((family) =>
    narrowbandFilterFamilies.includes(family),
  );
  const order = wantsNarrowband
    ? recommended
    : recommended.flatMap((family) =>
        family === "broadband" ? broadbandFilterFamilies : [family],
      );
  for (const family of order) {
    const found = owned.find((filter) => filter.family === family);
    if (found) return { name: found.name, family, missing: false };
  }
  if (wantsNarrowband && !moonBright) {
    for (const family of broadbandFilterFamilies) {
      const found = owned.find((filter) => filter.family === family);
      if (found) return { name: found.name, family, missing: false };
    }
  }
  return { name: null, family: recommended[0], missing: true };
}

const isNarrowband = (family) => narrowbandFilterFamilies.includes(family);

// The slot, in seconds, of an item; `null` when it has none.
function slotSecondsOf(item) {
  const start = finite(item?.startMinute);
  const end = finite(item?.endMinute);
  return start !== null && end !== null && end > start
    ? (end - start) * 60
    : null;
}

const entry = (value, source, reason) =>
  reason === undefined ? { value, source } : { value, source, reason };

/**
 * The effective acquisition of a plan item.
 *
 * @param {object} plan the plan (`acquisitionDefaults`, `equipment.mode`).
 * @param {object} item the plan item (`filter`, `startMinute`, `endMinute`,
 *   `acquisition`).
 * @param {object} context
 * @param {object} [context.target] the catalogue target, as
 *   `recommendedFilterFamilies` reads it (`skyTarget.typeKey`).
 * @param {object} [context.equipment] see `acquisitionEquipment`.
 * @param {object[]} [context.filters] the filters owned, `{ name, family? }`.
 * @param {{sqm?: number}} [context.sky] the place's sky (measured, else
 *   entered, else the estimate).
 * @param {{illumination?: number, bright?: boolean}} [context.moon] the
 *   Moon of the night, its disc lit in percent.
 * @param {string} [context.mode] overrides `plan.equipment.mode`.
 * @returns `null` in visual mode; otherwise
 *   `{ ruleVersion, slotSeconds, lines }`, one to eight lines, each
 *   `{ filter, exposureSeconds, gain, binning, frameCount, fitsSlot }`, each
 *   field `{ value, source, reason? }` with `source` one of `chosen-target`,
 *   `chosen-plan`, `suggested`, `device`. `reason` holds keys, never
 *   sentences.
 */
export function effectiveAcquisition(plan, item, context = {}) {
  const mode = context?.mode ?? plan?.equipment?.mode;
  if (mode === "visual") return null;

  const equipment = isObject(context?.equipment) ? context.equipment : {};
  const owned = ownedFiltersOf(context?.filters);
  const target = context?.target ?? null;
  const kind = acquisitionTargetKind(target);
  const kindRow = kind ? rule.kinds[kind] : null;
  const sqm = finite(context?.sky?.sqm);
  const illumination = finite(context?.moon?.illumination);
  const moonBright =
    typeof context?.moon?.bright === "boolean"
      ? context.moon.bright
      : illumination === null
        ? null
        : illumination > rule.moonBrightPercent;

  const defaults = planAcquisitionDefaults(plan) ?? {};
  const chosenLines = planItemAcquisitionLines(item);
  const lines = chosenLines.length ? chosenLines : [{}];
  const slotSeconds = slotSecondsOf(item);
  const share =
    slotSeconds === null ? null : slotSeconds / Math.max(1, lines.length);
  const itemFilter =
    typeof item?.filter === "string" && item.filter.trim()
      ? item.filter.trim()
      : null;

  const sensorKind =
    equipment.sensorKind === "mono" || equipment.sensorKind === "colour"
      ? equipment.sensorKind
      : null;
  const smart = equipment.deviceKind === "smart-telescope";
  const dslr = equipment.deviceKind === "dslr";
  const focalRatio =
    positive(equipment.focalLengthMm) !== null &&
    positive(equipment.apertureMm) !== null
      ? equipment.focalLengthMm / equipment.apertureMm
      : null;
  const sampling =
    positive(equipment.pixelSizeUm) !== null &&
    positive(equipment.focalLengthMm) !== null
      ? (206.265 * equipment.pixelSizeUm) / equipment.focalLengthMm
      : null;
  const mountKind =
    equipment.mountKind === "altaz" ||
    equipment.mountKind === "equatorial" ||
    equipment.mountKind === "guided"
      ? equipment.mountKind
      : null;
  const deviceCap = positive(equipment.maxExposureSeconds);

  const suggestion = kind
    ? suggestFilter(target, owned, moonBright === true)
    : null;

  const resolved = lines.map((line, index) => {
    // --- the filter
    let filter;
    if (has(line, "filter")) filter = entry(line.filter, "chosen-target");
    else if (index === 0 && itemFilter !== null)
      filter = entry(itemFilter, "chosen-target");
    else if (has(defaults, "filter"))
      filter = entry(defaults.filter, "chosen-plan");
    else if (suggestion && suggestion.name !== null)
      filter = entry(suggestion.name, "suggested", {
        targetKind: kind,
        filterFamily: suggestion.family,
        moonBright,
        filterMissing: false,
      });
    else
      filter = entry(
        null,
        "device",
        suggestion
          ? {
              targetKind: kind,
              filterFamily: suggestion.family,
              moonBright,
              filterMissing: suggestion.missing,
            }
          : undefined,
      );
    const family = familyOfFilterName(filter.value, owned);

    // --- the exposure
    let exposureSeconds;
    if (has(line, "exposureSeconds"))
      exposureSeconds = entry(line.exposureSeconds, "chosen-target");
    else if (has(defaults, "exposureSeconds"))
      exposureSeconds = entry(defaults.exposureSeconds, "chosen-plan");
    else if (kindRow) {
      const narrow = isNarrowband(family);
      const mono = sensorKind === "mono";
      const broadColumn = mono ? "monoBroadband" : "colourBroadband";
      const column = narrow
        ? mono
          ? "monoNarrow"
          : "colourDual"
        : broadColumn;
      let value = kindRow[column] ?? kindRow[broadColumn];
      const usedNarrow = narrow && kindRow[column] !== null;
      let skyClass = null;
      let focalRatioClass = null;
      let capped = null;
      if (kindRow.video) {
        // A video: none of the deep-sky corrections reads.
      } else {
        skyClass = skyClassOf(sqm);
        if (skyClass)
          value *= rule.sky[usedNarrow ? "narrowband" : "broadband"][skyClass];
        focalRatioClass = focalRatioClassOf(focalRatio);
        if (focalRatio !== null) {
          const factor = Math.min(
            rule.focalRatio.maximum,
            Math.max(
              rule.focalRatio.minimum,
              (focalRatio / rule.focalRatio.reference) *
                (focalRatio / rule.focalRatio.reference),
            ),
          );
          value *= factor;
        }
        const mountCap = mountKind ? rule.mountCaps[mountKind] : null;
        if (mountCap !== null && value > mountCap) {
          value = mountCap;
          capped = "mount";
        }
        if (deviceCap !== null && value > deviceCap) {
          value = deviceCap;
          capped = "device";
        }
        const ceiling = Math.min(mountCap ?? Infinity, deviceCap ?? Infinity);
        value = roundToStep(value, Number.isFinite(ceiling) ? ceiling : null);
      }
      exposureSeconds = entry(value, "suggested", {
        targetKind: kind,
        sensorKind,
        filterFamily: family,
        focalRatioClass,
        skyClass,
        moonBright,
        mountKind,
        deviceCap,
        capped,
      });
    } else exposureSeconds = entry(null, "device");

    // --- the gain
    let gain;
    if (has(line, "gain")) gain = entry(line.gain, "chosen-target");
    else if (has(defaults, "gain")) gain = entry(defaults.gain, "chosen-plan");
    else if (kindRow && smart)
      gain = entry(null, "device", { sensorKind, gainSource: "device" });
    else if (kindRow && kindRow.gain !== "unity")
      gain = entry(null, "device", {
        sensorKind,
        gainSource: "intent",
        gainIntent: kindRow.gain,
      });
    else if (kindRow && dslr)
      gain = entry(rule.gain.dslrIso, "suggested", {
        sensorKind,
        gainSource: "iso",
      });
    else if (kindRow && finite(equipment.hcgGain) !== null)
      gain = entry(equipment.hcgGain, "suggested", {
        sensorKind,
        gainSource: "hcg",
      });
    else if (kindRow && finite(equipment.unityGain) !== null)
      gain = entry(equipment.unityGain, "suggested", {
        sensorKind,
        gainSource: "unity",
      });
    else gain = entry(null, "device", { sensorKind, gainSource: "device" });

    // --- the binning
    let binning;
    if (has(line, "binning")) binning = entry(line.binning, "chosen-target");
    else if (has(defaults, "binning"))
      binning = entry(defaults.binning, "chosen-plan");
    else if (kindRow) {
      const binned =
        !kindRow.video &&
        sensorKind === "mono" &&
        sampling !== null &&
        sampling < rule.binning.monoBelowArcsecPerPixel;
      binning = entry(binned ? 2 : 1, "suggested", {
        sensorKind,
        samplingArcsecPerPixel: sampling,
      });
    } else binning = entry(null, "device");

    // --- the number of exposures
    const readOut = kindRow?.video ? 0 : rule.readOutSeconds;
    const each = exposureSeconds.value;
    let frameCount;
    if (has(line, "frameCount"))
      frameCount = entry(line.frameCount, "chosen-target");
    else if (has(defaults, "frameCount"))
      frameCount = entry(defaults.frameCount, "chosen-plan");
    else if (kindRow && share !== null && each !== null && each > 0) {
      const window = kindRow.video ? Math.min(share, rule.videoSeconds) : share;
      const count = Math.floor(window / (each + readOut));
      const reason = { slotSeconds, lines: lines.length };
      frameCount =
        count >= 1
          ? entry(
              Math.min(count, acquisitionLimits.frameCountMax),
              "suggested",
              reason,
            )
          : entry(null, "device", { ...reason, tooShort: true });
    } else frameCount = entry(null, "device");

    const fitsSlot =
      frameCount.source.startsWith("chosen") &&
      share !== null &&
      each !== null &&
      each > 0
        ? frameCount.value * (each + readOut) <= share
        : true;

    return { filter, exposureSeconds, gain, binning, frameCount, fitsSlot };
  });

  return { ruleVersion: rule.version, slotSeconds, lines: resolved };
}

/**
 * The plain lines of an effective acquisition, as `launchedSchedule` freezes
 * them (`acquisition.lines`): the value of every field the person or the rule
 * settled; a field left to the device is left out, except the gain, whose
 * `null` is "the device's own setting".
 */
export function effectiveAcquisitionLines(effective) {
  if (!effective) return [];
  return effective.lines.map((line) => {
    const plain = {};
    for (const key of [
      "filter",
      "exposureSeconds",
      "gain",
      "binning",
      "frameCount",
    ]) {
      const { value, source } = line[key];
      if (source !== "device" || key === "gain") plain[key] = value;
    }
    return plain;
  });
}
