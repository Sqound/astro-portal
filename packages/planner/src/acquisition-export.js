// What the exports carry of "Prise de vue par cible": for every plan item,
// the EFFECTIVE acquisition lines -- the lines the launch froze for a plan
// that was launched, else what `effectiveAcquisition` answers (a choice of
// the person, the plan's defaults, the suggestion of the rule) -- turned
// into plain export lines and, with the words of a language, into the one
// line a person copies ("120 s · gain 100 · UV/IR-cut · ≈ 28 frames ·
// suggested").
//
// Photo mode only: in visual mode nothing is resolved and every export stays
// as it was. No component, no clock: the sky and the Moon come in through the
// context the caller builds (`exportAcquisitionContext`).
import { Body, Illumination } from "astronomy-engine";
import { effectiveAcquisition, acquisitionEquipment } from "./acquisition.js";
import { launchedAcquisitionByItem } from "./plan-acquisition.js";
import {
  cameraProfiles,
  planNightWindow,
  telescopeProfiles,
} from "./planner.js";

const plain = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const text = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const chosenSource = (source) =>
  source === "chosen-target" || source === "chosen-plan";

/**
 * One line as an export writes it.
 *
 * @typedef {object} ExportAcquisitionLine
 * @property {string | null} filter The filter's name, `null` for none.
 * @property {boolean} noFilter The person chose "no filter".
 * @property {number | null} exposureSeconds
 * @property {number | null} gain
 * @property {boolean} gainDevice The person chose the device's own gain.
 * @property {number | null} binning
 * @property {number | null} frameCount
 * @property {boolean} approximate The frame count is the slot's, not a choice.
 * @property {boolean} suggested At least one of exposure, gain and filter is
 *   the rule's and none is a choice.
 */

function lineOfEffective(line) {
  const filter = plain(line?.filter) ? line.filter : {};
  const exposure = plain(line?.exposureSeconds) ? line.exposureSeconds : {};
  const gain = plain(line?.gain) ? line.gain : {};
  const binning = plain(line?.binning) ? line.binning : {};
  const frames = plain(line?.frameCount) ? line.frameCount : {};
  const shown = [filter, exposure, gain];
  return {
    filter: text(filter.value),
    noFilter: filter.value === null && chosenSource(filter.source),
    exposureSeconds: finite(exposure.value),
    gain: finite(gain.value),
    gainDevice: gain.value === null && chosenSource(gain.source),
    binning: finite(binning.value),
    frameCount: finite(frames.value),
    approximate: !chosenSource(frames.source),
    suggested:
      shown.every((field) => !chosenSource(field.source)) &&
      shown.some((field) => field.source === "suggested"),
  };
}

// A line the launch froze: every value in it was settled at the launch, so
// none is "suggested" and the frame count is exact.
function lineOfFrozen(line) {
  const value = plain(line) ? line : {};
  const has = (key) => Object.hasOwn(value, key);
  return {
    filter: text(value.filter),
    noFilter: has("filter") && value.filter === null,
    exposureSeconds: finite(value.exposureSeconds),
    gain: finite(value.gain),
    gainDevice: has("gain") && value.gain === null,
    binning: finite(value.binning),
    frameCount: finite(value.frameCount),
    approximate: false,
    suggested: false,
  };
}

const hasContent = (line) =>
  line.exposureSeconds !== null ||
  line.gain !== null ||
  line.filter !== null ||
  line.gainDevice;

/**
 * The telescope and the camera a plan's equipment selection resolves to
 * (the lookups of `resolveEquipment`, which answers their names only).
 */
export function exportEquipmentProfiles(selection = {}, profileSets = null) {
  const byId = (profiles, id) =>
    (profiles || []).find((profile) => profile?.id === id);
  const telescopes = profileSets?.telescopes?.length
    ? profileSets.telescopes
    : telescopeProfiles;
  const cameras = profileSets?.cameras?.length
    ? profileSets.cameras
    : cameraProfiles;
  // Nothing chosen (or an id no list holds) is no profile, as there.
  const telescope =
    byId(telescopes, selection.telescopeId) ||
    byId(
      profileSets?.commonTelescopes || telescopeProfiles,
      selection.telescopeId,
    );
  const camera = telescope?.integratedCamera
    ? telescope.integratedCamera
    : byId(cameras, selection.cameraId);
  return { telescope, camera };
}

/** The share of the Moon's disc lit at the start of the plan's dark night, in percent. */
export function planMoonIllumination(plan) {
  try {
    const window = planNightWindow(plan);
    const start = window ? new Date(window.darkStart) : null;
    return start && Number.isFinite(start.getTime())
      ? Math.round(Illumination(Body.Moon, start).phase_fraction * 100)
      : null;
  } catch {
    return null;
  }
}

/**
 * The context `effectiveAcquisition` reads for an export, from what the
 * caller already holds: the plan, the profile sets, the resolved equipment
 * (`resolveEquipment`), the filters owned, the place's sky (SQM) and the
 * Moon of the night, in percent.
 */
export function exportAcquisitionContext({
  plan,
  profileSets = null,
  resolvedEquipment = {},
  ownedFilters = [],
  sqm = null,
  moonIllumination = null,
} = {}) {
  const selection = plan?.equipment ?? {};
  const mode = selection.mode === "visual" ? "visual" : "imaging";
  const { telescope, camera } = exportEquipmentProfiles(selection, profileSets);
  const named = (filter) => text(filter?.name) !== null;
  const checked = (resolvedEquipment?.filterProfiles ?? []).filter(named);
  const filters = (checked.length ? checked : ownedFilters).filter(named);
  return {
    mode,
    equipment: acquisitionEquipment({
      telescope,
      camera,
      focalLengthMm: Number.isFinite(resolvedEquipment?.focalLengthMm)
        ? resolvedEquipment.focalLengthMm
        : undefined,
    }),
    filters: filters.map((filter) => ({
      name: filter.name,
      ...(filter.family ? { family: filter.family } : {}),
    })),
    sky: { sqm: finite(sqm) },
    moon: { illumination: finite(moonIllumination) },
  };
}

/**
 * The effective lines of every item of a plan, by item id:
 * `{ [id]: { frozen, lines } }`. An item with nothing to say (visual mode, a
 * target the rule knows nothing of and the person left alone) is absent.
 *
 * @param {object} plan
 * @param {object} [options]
 * @param {object} [options.context] see `exportAcquisitionContext`.
 * @param {(item: object) => object | null} [options.targetOf] the target of
 *   an item (the plan's saved target, else the catalogue's).
 * @returns {Record<string, {frozen: boolean, lines: ExportAcquisitionLine[]}>}
 */
export function exportAcquisitionByItem(
  plan,
  { context = {}, targetOf = (item) => item?.target ?? null } = {},
) {
  const result = {};
  const mode = context?.mode ?? plan?.equipment?.mode;
  if (mode === "visual") return result;
  const launched = launchedAcquisitionByItem(plan);
  for (const item of plan?.items || []) {
    const id = item?.id === undefined || item?.id === null ? "" : `${item.id}`;
    if (!id || Object.hasOwn(result, id)) continue;
    const frozen = launched[id];
    if (frozen?.lines?.length) {
      const lines = frozen.lines.map(lineOfFrozen).filter(hasContent);
      if (lines.length) result[id] = { frozen: true, lines };
      continue;
    }
    // `item.filter` is the recommendation of the day the target was added,
    // not a choice: the rule reads the filter of the item's first line only.
    const effective = effectiveAcquisition(
      plan,
      { ...item, filter: "" },
      { ...context, target: targetOf(item) ?? null },
    );
    if (!effective || !Array.isArray(effective.lines)) continue;
    const lines = effective.lines.map(lineOfEffective).filter(hasContent);
    if (lines.length) result[id] = { frozen: false, lines };
  }
  return result;
}

// ------------------------------------------------------------------ words

// "120 s", "1,5 s", "1/250 s", "4 ms" (units under the second).
function exposureText(words, seconds) {
  if (seconds >= 1) return words.seconds(words.number(seconds));
  const inverse = 1 / seconds;
  const rounded = Math.round(inverse);
  if (rounded >= 2 && rounded <= 8000 && Math.abs(inverse - rounded) < 1e-6)
    return words.seconds(`1/${rounded}`);
  return words.milliseconds(words.number(seconds * 1000));
}

/**
 * "120 s · gain 100 · UV/IR-cut · ≈ 28 poses · suggéré": one line in the
 * words of a language. `words` is `acquisitionExportWords(...)`.
 */
export function acquisitionLineText(line, words) {
  const parts = [];
  if (line.exposureSeconds !== null)
    parts.push(exposureText(words, line.exposureSeconds));
  if (line.gain !== null) parts.push(words.gain(words.number(line.gain)));
  else if (line.gainDevice) parts.push(words.gainDevice);
  if (line.filter !== null) parts.push(line.filter);
  else if (line.noFilter) parts.push(words.noFilter);
  if (line.frameCount !== null)
    parts.push(words.frames(line.frameCount, line.approximate));
  if (line.suggested) parts.push(words.suggested);
  return parts.join(" · ");
}

/**
 * The text of every item that has lines, by item id; several lines of a
 * target are joined with "/".
 */
export function acquisitionTextByItem(byItem, words) {
  const result = {};
  for (const [id, entry] of Object.entries(byItem || {})) {
    const lines = entry.lines
      .map((line) => acquisitionLineText(line, words))
      .filter(Boolean);
    if (lines.length) result[id] = lines.join(" / ");
  }
  return result;
}

/**
 * The words of the line in `locale`, read through `message(locale, key)` (the
 * portal's dictionaries): `expoE*` keys. The frame count is a plural
 * (`Intl.PluralRules`): `expoEFramesOne/Few/Many/Other`, "≈" before it when
 * the count is the slot's.
 */
export function acquisitionExportWords(locale, message) {
  const fill = (key, values) =>
    Object.entries(values).reduce(
      (written, [name, value]) => written.replaceAll(`{${name}}`, value),
      message(locale, key),
    );
  const numbers = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  let plural;
  try {
    plural = new Intl.PluralRules(locale);
  } catch {
    plural = new Intl.PluralRules("en");
  }
  return {
    number: (value) => numbers.format(value),
    seconds: (value) => fill("expoESeconds", { value }),
    milliseconds: (value) => fill("expoEMilliseconds", { value }),
    gain: (value) => fill("expoEGain", { value }),
    gainDevice: message(locale, "expoEGainDevice"),
    noFilter: message(locale, "expoENoFilter"),
    suggested: message(locale, "expoESuggested"),
    frames: (count, approximate) => {
      const category = count === 0 ? "other" : plural.select(count);
      const key = `expoEFrames${category[0].toUpperCase()}${category.slice(1)}`;
      const forms = message(locale, key);
      const written = fill(forms === key ? "expoEFramesOther" : key, {
        count: numbers.format(count),
      });
      return approximate ? `≈ ${written}` : written;
    },
  };
}
