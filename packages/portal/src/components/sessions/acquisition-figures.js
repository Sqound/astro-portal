// What was planned and what was shot, per target, as one line (« Prise de vue
// par cible »): « 28 × 120 s · gain 100 · L », written the same way
// everywhere it appears. The service gives
// the figures (`journal.schema.json`, `target.planned` and `target.measured`);
// the debriefing form reads the frozen lines of the plan itself, offline, with
// the same reader (`launchedAcquisitionByItem`).
import { launchedAcquisitionByItem } from "portal/planner/plan-acquisition.js";
import { message } from "../../i18n.js";
import { say } from "./night-detail-view.js";

// Between the lines of a block (a camera with several filters).
const LINES_JOINER = " + ";

const finite = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function numberText(value, locale) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(value);
}

/** An exposure in the unit that reads best under a second: « 120 s », « 1,5 s », « 1/250 s », « 4 ms ». */
export function exposureText(seconds, locale) {
  if (seconds >= 1)
    return say(locale, "sessionAcqSeconds", {
      value: numberText(seconds, locale),
    });
  const inverse = 1 / seconds;
  const rounded = Math.round(inverse);
  if (rounded >= 2 && rounded <= 8000 && Math.abs(inverse - rounded) < 1e-6)
    return say(locale, "sessionAcqSeconds", { value: `1/${rounded}` });
  return say(locale, "sessionAcqMilliseconds", {
    value: numberText(seconds * 1000, locale),
  });
}

const framesOnly = (count, locale) =>
  say(locale, count === 1 ? "sessionPageFramesOne" : "sessionPageFramesOther", {
    count,
  });

/**
 * One line of a block: « 28 × 120 s · gain 100 · L ». A field the line does
 * not say is left out, except `explicitNulls`: a planned line says « gain de
 * l’appareil » and « sans filtre » when the plan chose them; the filter of a
 * line Astro Sync measured says « sans filtre » too.
 */
export function figureText(
  line,
  locale,
  { gainNull = false, filterNull = false } = {},
) {
  const frames = finite(line?.frameCount);
  const exposure = finite(line?.exposureSeconds);
  const parts = [];
  if (frames !== null && exposure !== null)
    parts.push(
      say(locale, "sessionAcqFramesTimes", {
        count: frames,
        exposure: exposureText(exposure, locale),
      }),
    );
  else if (exposure !== null) parts.push(exposureText(exposure, locale));
  else if (frames !== null) parts.push(framesOnly(frames, locale));
  const gain = Number.isSafeInteger(line?.gain) ? line.gain : null;
  if (gain !== null)
    parts.push(say(locale, "sessionAcqGain", { value: String(gain) }));
  else if (gainNull && parts.length)
    parts.push(message(locale, "sessionAcqGainDevice"));
  const filter =
    typeof line?.filter === "string" && line.filter.trim()
      ? line.filter.trim()
      : null;
  if (filter) parts.push(filter);
  else if (filterNull && parts.length)
    parts.push(message(locale, "sessionAcqNoFilter"));
  return parts.join(" · ");
}

/**
 * The lines of a block on one line of text: « 30 × 60 s · L + 20 × 180 s · R »
 * (a mono camera has several), `null` when it says nothing.
 */
function blockText(block, locale, options) {
  const lines = (block?.lines ?? [])
    .map((line) => figureText(line, locale, options))
    .filter(Boolean);
  return lines.length ? lines.join(LINES_JOINER) : null;
}

/** « Prévu 28 × 120 s · gain 100 · L », or `null` without a planned block. */
export function plannedShootingText(planned, locale) {
  const text = blockText(planned, locale, {
    gainNull: true,
    filterNull: true,
  });
  return text ? say(locale, "sessionAcqPlanned", { line: text }) : null;
}

/**
 * « Mesuré (Astro Sync) 27 × 120 s · gain 100 · L » or « Déclaré 27 × 120 s »;
 * `null` without a measured block.
 */
export function measuredShootingText(measured, locale) {
  if (!measured) return null;
  const astroSync = measured.source === "astro-sync";
  const text = blockText(measured, locale, { filterNull: astroSync });
  return text
    ? say(locale, astroSync ? "sessionAcqMeasured" : "sessionAcqDeclared", {
        line: text,
      })
    : null;
}

/**
 * What the launch froze for a plan item, from the plan's payload, for the
 * debriefing form (it reads the plan, not the Journal): the lines, or
 * `null` for a plan launched before the freezing, a free execution or a night
 * at the eyepiece.
 */
export function frozenShooting(payload, itemId) {
  if (!payload || payload.blankExecution === true) return null;
  if (payload.equipment?.mode === "visual") return null;
  const frozen = launchedAcquisitionByItem(payload)[itemId];
  if (!frozen?.lines?.length) return null;
  return {
    ruleVersion: frozen.ruleVersion ?? null,
    lines: frozen.lines.map((line) => ({
      filter: line.filter ?? null,
      exposureSeconds: line.exposureSeconds ?? null,
      gain: line.gain ?? null,
      frameCount: line.frameCount ?? null,
    })),
  };
}

/**
 * What the debriefing form starts with for a target: the planned number of
 * frames (the lines add up) and the planned exposure (when every line shares
 * it), which the person corrects. `null` fields stay empty.
 */
export function prefilledShooting(planned) {
  const lines = planned?.lines ?? [];
  if (!lines.length) return { frames: "", exposure: "" };
  const counts = lines.map((line) => finite(line.frameCount));
  const frames = counts.every((count) => count !== null)
    ? counts.reduce((sum, count) => sum + count, 0)
    : null;
  const exposures = new Set(lines.map((line) => finite(line.exposureSeconds)));
  const exposure = exposures.size === 1 ? [...exposures][0] : null;
  return {
    frames: frames === null ? "" : String(frames),
    exposure: exposure === null ? "" : String(exposure),
  };
}
