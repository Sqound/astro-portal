// What a screen reads of "Prise de vue par cible" on the web: the effective
// acquisition of one plan item, typed, with, for every field, the value and
// where it comes from. A thin reading over the rule of `acquisition.js`
// (`effectiveAcquisition`): no component, no sentence — the words are
// `acquisition-words.js`'s.
//
// Photo mode only: in visual mode `basis.read` answers `null` and nothing is
// shown or proposed. The launched plan's lines are frozen
// (`launchedSchedule[].acquisition`): `acquisitionItemView` shows them,
// read-only, and never recomputes them.
import { Body, Illumination } from "astronomy-engine";
import {
  acquisitionEquipment,
  acquisitionRuleVersion,
  effectiveAcquisition,
  effectiveAcquisitionLines,
} from "./acquisition.js";
import {
  launchedAcquisitionByItem,
  normalizePlanAcquisition,
  planAcquisitionDefaults,
  planItemAcquisitionLines,
} from "./plan-acquisition.js";
import {
  bundledPlannerFilters,
  planNightWindow,
  resolveEquipment,
  resolveEquipmentProfiles,
} from "./planner.js";
import {
  filterPool,
  planFilterOwners,
  planOfferedFilters,
  poseFilterGroups,
} from "./offered-filters.js";
import {
  acquisitionBlockLineMinWidth,
  acquisitionLineText,
} from "./acquisition-words.js";

const plain = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** One field of a line: its [value] (`null` when none), [source] and [reason] keys. */
function fieldOf(wire, kind) {
  const field = plain(wire) ? wire : {};
  const raw = field.value;
  const value =
    kind === "string" ? (typeof raw === "string" ? raw : null) : finite(raw);
  const source =
    field.source === "chosen-target" ||
    field.source === "chosen-plan" ||
    field.source === "suggested"
      ? field.source
      : "device";
  return {
    value,
    source,
    reason: plain(field.reason) ? { ...field.reason } : {},
    chosen: source === "chosen-target" || source === "chosen-plan",
    suggested: source === "suggested",
  };
}

/** One effective line, typed. */
export function lineReadingOf(line) {
  const value = plain(line) ? line : {};
  const reading = {
    filter: fieldOf(value.filter, "string"),
    exposureSeconds: fieldOf(value.exposureSeconds, "number"),
    gain: fieldOf(value.gain, "number"),
    binning: fieldOf(value.binning, "number"),
    frameCount: fieldOf(value.frameCount, "number"),
    // A frame count the person chose that does not fit the slot (the slot
    // never moves: the screen says so).
    fitsSlot: value.fitsSlot !== false,
  };
  const shown = [reading.filter, reading.exposureSeconds, reading.gain];
  return {
    ...reading,
    /** Whether the line has something to show: an exposure, a gain or a filter. */
    hasContent:
      reading.exposureSeconds.value !== null ||
      reading.gain.value !== null ||
      reading.filter.value !== null ||
      reading.gain.source !== "device",
    /** "suggéré": at least one field is the rule's and none is a choice. */
    allSuggested:
      shown.every((field) => !field.chosen) &&
      shown.some((field) => field.suggested),
    /** Whether the person chose any of the three shown fields. */
    anyChosen: shown.some((field) => field.chosen),
  };
}

/** The share of the Moon's disc lit at the start of the plan's dark night, in percent. */
const moonCache = new Map();
export function planMoonIllumination(plan) {
  const place = plan?.location;
  const key = [
    plan?.date,
    place?.latitude,
    place?.longitude,
    place?.timeZone,
    plan?.darkness,
  ].join("|");
  if (moonCache.has(key)) return moonCache.get(key);
  let value = null;
  try {
    const window = planNightWindow(plan);
    const start = window ? new Date(window.darkStart) : null;
    if (start && Number.isFinite(start.getTime()))
      value = Math.round(Illumination(Body.Moon, start).phase_fraction * 100);
  } catch {
    value = null;
  }
  if (moonCache.size > 200) moonCache.clear();
  moonCache.set(key, value);
  return value;
}

/** The SQM the rule reads, from the place's sky (measured, else entered, else
 * modelled). */
export const skySqmOf = (choice) => finite(choice?.shown?.sqm);

const gainChoicesOf = (equipment) => {
  const choices = [];
  if (finite(equipment?.unityGain) !== null)
    choices.push({ kind: "unity", value: Math.round(equipment.unityGain) });
  if (finite(equipment?.hcgGain) !== null)
    choices.push({ kind: "hcg", value: Math.round(equipment.hcgGain) });
  return choices;
};

/**
 * What a screen needs to read the acquisition of the items of ONE plan: the
 * plan itself (its defaults, its mode, its items) and the context
 * `effectiveAcquisition` reads (the equipment, the filters, the sky, the
 * Moon).
 *
 * @param {object} input
 * @param {object} input.plan the plan as the planner holds it.
 * @param {object} [input.profileSets] the profile sets `resolveEquipment` reads.
 * @param {object[]} [input.ownedFilters] the filters the person owns
 *   (`{ name, family? }`), used when the plan checks none.
 * @param {number | null} [input.sqm] the place's sky.
 * @param {number | null} [input.moonIllumination] the Moon of the night, in
 *   percent; read from the plan's night when absent.
 */
export function acquisitionBasisOf({
  plan,
  profileSets = null,
  ownedFilters = [],
  sqm = null,
  moonIllumination,
}) {
  const selection = plan?.equipment ?? {};
  const mode = selection.mode === "visual" ? "visual" : "imaging";
  const resolved = resolveEquipment(selection, profileSets);
  const { telescope, camera } = resolveEquipmentProfiles(
    selection,
    profileSets,
  );
  // The filters of the plan: what the plan offers for its telescope and its
  // camera (`filtersOfferedFor`), those ticked at step 2 and the telescope's
  // built-in ones first (`carried`), the rest after a thin rule (`others`);
  // with nothing ticked the whole offered list is carried. The rule reads the
  // carried ones.
  const selectedIds = Array.isArray(selection.filterIds)
    ? selection.filterIds
    : [];
  const owners = planFilterOwners({ telescope, camera, mode });
  const pool = filterPool({
    // The planner always hands its full list; a caller without one (a test, a
    // device with nothing) is offered the generic filters unless it names the
    // person's own.
    profileFilters: profileSets?.filters?.length
      ? profileSets.filters
      : ownedFilters.length
        ? []
        : bundledPlannerFilters,
    ownedFilters,
  });
  const offered = planOfferedFilters({ pool, owners, selectedIds });
  const named = (filter) =>
    typeof filter?.name === "string" && filter.name.trim();
  const { carried, others } = poseFilterGroups({
    offered: offered.filter(named),
    selectedIds,
    owners,
  });
  const filters = carried;
  const moon =
    moonIllumination === undefined
      ? planMoonIllumination(plan)
      : finite(moonIllumination);
  const equipment = acquisitionEquipment({
    telescope,
    camera,
    focalLengthMm: Number.isFinite(resolved.focalLengthMm)
      ? resolved.focalLengthMm
      : undefined,
  });
  const context = {
    equipment,
    filters: filters.map((filter) => ({
      name: filter.name,
      ...(filter.family ? { family: filter.family } : {}),
    })),
    sky: { sqm },
    moon: { illumination: moon },
    mode,
  };
  const focal = finite(equipment.focalLengthMm);
  const aperture = finite(equipment.apertureMm);
  const facts = {
    cameraName:
      (plain(telescope?.integratedCamera)
        ? telescope.integratedCamera.name
        : camera?.name) ?? null,
    focalRatio:
      focal !== null && aperture !== null && aperture > 0
        ? focal / aperture
        : null,
    sensorKind: equipment.sensorKind ?? null,
    mountKind: equipment.mountKind ?? null,
    moonIllumination: moon,
  };
  return makeBasis({
    plan,
    context,
    facts,
    filterNames: uniqueNames(carried),
    otherFilterNames: uniqueNames(others).filter(
      (name) => !uniqueNames(carried).includes(name),
    ),
    builtInFilterNames: uniqueNames(
      [...carried, ...others].filter((filter) =>
        Array.isArray(filter.telescopeIds),
      ),
    ),
    ownFiltersOnlyName: ownFiltersOnlyName(owners),
    gainChoices: gainChoicesOf(equipment),
  });
}

const uniqueNames = (filters) => [
  ...new Set(filters.map((filter) => String(filter.name).trim())),
];

// The name of the plan's telescope or camera when it offers its own filters
// only (`acqFilterOwnLine`), `null` otherwise.
const ownFiltersOnlyName = (owners) => {
  const piece = [owners.telescope, owners.camera].find(
    (equipment) => equipment?.ownFiltersOnly === true,
  );
  return piece ? String(piece.name ?? "") || null : null;
};

function makeBasis({
  plan,
  context,
  facts,
  filterNames,
  otherFilterNames = [],
  builtInFilterNames = [],
  ownFiltersOnlyName = null,
  gainChoices,
}) {
  const readWith = (planObject, item) => {
    // `item.filter` is the recommendation of the day the target was added
    // (`plannedPlanItem`), not a choice: the only filter the person chose is
    // the one of the item's first line (which the write mirrors into
    // `item.filter`), so the rule reads that one alone.
    const unchosen = { ...item, filter: "" };
    const effective = effectiveAcquisition(planObject, unchosen, {
      ...context,
      target: item?.target ?? null,
    });
    if (
      !effective ||
      !Array.isArray(effective.lines) ||
      !effective.lines.length
    )
      return null;
    const lines = effective.lines.map(lineReadingOf);
    return {
      raw: effective,
      ruleVersion: String(effective.ruleVersion ?? acquisitionRuleVersion),
      slotSeconds: finite(effective.slotSeconds),
      lines,
      first: lines[0],
      facts,
    };
  };
  const basis = {
    plan,
    context,
    facts,
    /** The filters the person may name in a line, first the plan's own. */
    filterNames,
    /** The other filters the plan offers, drawn quieter after a thin rule. */
    otherFilterNames,
    /** The names of the built-in filters (the badge "intégré"). */
    builtInFilterNames,
    /** The plan's telescope or camera that offers its own filters only. */
    ownFiltersOnlyName,
    gainChoices,
    /** Photo mode: `false` in visual mode, where nothing is shown. */
    photo: context.mode !== "visual",
    /** The effective acquisition of [item] under the plan as it stands. */
    read: (item) => readWith(plan, item),
    /**
     * What the rule alone proposes for [item]: the plan's defaults and the
     * item's own choices left out ("Suggérée : 120 s · …" of the dialog,
     * and what "Revenir aux suggestions" goes back to).
     */
    suggestion: (item) => {
      const { acquisitionDefaults: _defaults, ...bare } = plan;
      const { acquisition: _acquisition, ...bareItem } = item;
      return readWith(bare, bareItem);
    },
    /** [read] with the item's slot replaced (the interval editor's draft). */
    readAt: (item, startMinute, endMinute) =>
      readWith(plan, { ...item, startMinute, endMinute }),
    /** The same basis over another plan object (a preview). */
    withPlan: (next) =>
      makeBasis({
        plan: next,
        context,
        facts,
        filterNames,
        otherFilterNames,
        builtInFilterNames,
        ownFiltersOnlyName,
        gainChoices,
      }),
    /**
     * The plain lines and the rule version to freeze for [item] at the launch
     * (`launchedSchedule[].acquisition` and `.ruleVersion`); `null` in visual
     * mode or when the rule has nothing to say. The web never launches a plan;
     * a plan launched elsewhere carries these lines.
     */
    frozen: (item) => {
      const reading = readWith(plan, item);
      if (!reading) return null;
      return {
        acquisition: { lines: effectiveAcquisitionLines(reading.raw) },
        ruleVersion: reading.ruleVersion,
      };
    },
  };
  return basis;
}

/** The first line the plan chose for [item] itself, `null` when it chose none. */
export function chosenLineOf(item) {
  const lines = planItemAcquisitionLines(item);
  return lines.length ? lines[0] : null;
}

/** The plan's defaults line, `null` for none. */
export function chosenDefaults(plan) {
  return planAcquisitionDefaults(plan) ?? null;
}

/** [plan] normalised the way a write stores it. */
export function normalisedPlan(plan) {
  const normalised = normalizePlanAcquisition(plan);
  return plain(normalised) ? normalised : plan;
}

/**
 * The frozen first line as a reading: every value of it was settled at the
 * launch, so each counts as chosen (the words write the gain left to the
 * device and the filter left out; no field is "suggéré").
 */
export function frozenLineReading(line) {
  const field = (key) => ({
    value: line[key] ?? null,
    source: Object.hasOwn(line, key) ? "chosen-target" : "device",
  });
  return lineReadingOf({
    filter: field("filter"),
    exposureSeconds: field("exposureSeconds"),
    gain: field("gain"),
    binning: field("binning"),
    frameCount: field("frameCount"),
    fitsSlot: true,
  });
}

/**
 * How [item] reads under [basis]: frozen when the launch froze it, else the
 * rule's effective line; `null` in visual mode or when there is nothing to
 * say. [slot] (`{ startMinute, endMinute }`) reads the item at another slot
 * (the interval editor's draft).
 */
export function acquisitionItemView(basis, item, slot = null) {
  if (!basis?.photo) return null;
  const launched = launchedAcquisitionByItem(basis.plan)[String(item.id)];
  if (launched && launched.lines.length) {
    return {
      line: frozenLineReading(launched.lines[0]),
      frozen: true,
      live: null,
      launched,
      frozenLine: launched.lines[0],
      suggested: false,
    };
  }
  const reading = slot
    ? basis.readAt(item, slot.startMinute, slot.endMinute)
    : basis.read(item);
  if (!reading || !reading.first.hasContent) return null;
  return {
    line: reading.first,
    frozen: false,
    live: reading,
    launched: null,
    frozenLine: null,
    /** The line shows "suggéré" (live, and no field chosen). */
    suggested: reading.first.allSuggested,
  };
}

/**
 * The short line a block of the timeline carries inside its label ("120 s ·
 * g100 · UV/IR"), only when the label is at least
 * `acquisitionBlockLineMinWidth` wide; `null` for a narrower one, for visual
 * mode and for a target with no line to say.
 */
export function acquisitionBlockLine(locale, { width, view }) {
  if (!view || !(width >= acquisitionBlockLineMinWidth)) return null;
  const text = acquisitionLineText(locale, view.line, { short: true });
  return text || null;
}

/**
 * The item the plan's own dialog quotes its suggestions for: the first
 * target of the night (G2: "Conseillé pour M31"), `null` for a plan with
 * none.
 */
export function acquisitionExampleItem(plan) {
  let best = null;
  let bestStart = Infinity;
  for (const item of Array.isArray(plan?.items) ? plan.items : []) {
    if (!plain(item) || !plain(item.target)) continue;
    const at =
      typeof item.startMinute === "number"
        ? item.startMinute
        : Number.MAX_VALUE;
    if (best === null || at < bestStart) {
      best = item;
      bestStart = at;
    }
  }
  return best;
}
