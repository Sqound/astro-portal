// The words of "Prise de vue par cible" on the web: the line of a target
// ("120 s · gain 100 · UV/IR-cut"), its provenance, and the reason keys of
// the rule turned into short sentences. The dictionaries hold the words
// (`acq*` keys); this file only chooses which and joins them.
//
// Units under the second: "120 s", "1/250 s", "4 ms".
import { message } from "portal/i18n.js";
import { durationText } from "portal/written-forms.js";
import { acquisitionRuleTable } from "./acquisition.js";
import { fill } from "./wind-section.js";

/**
 * The width (px) from which a block of the timeline carries the short line
 * of its target inside its label (M31 at 118 px has it, a narrower label has
 * nothing).
 */
export const acquisitionBlockLineMinWidth = 118;

/** The extra height (px) a label that carries the short line grows by, downward. */
export const acquisitionBlockLineExtraHeight = 12;

/** A number with the decimal separator of the language, two decimals at most. */
export function acquisitionNumber(locale, value) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
    value,
  );
}

/**
 * An exposure in the unit that reads best under a second:
 * "120 s", "1,5 s", "1/250 s", "4 ms".
 */
export function acquisitionExposureText(locale, seconds) {
  if (seconds >= 1)
    return fill(message(locale, "acqSecondsValue"), {
      value: acquisitionNumber(locale, seconds),
    });
  const inverse = 1 / seconds;
  const rounded = Math.round(inverse);
  if (rounded >= 2 && rounded <= 8000 && Math.abs(inverse - rounded) < 1e-6)
    return fill(message(locale, "acqSecondsValue"), { value: `1/${rounded}` });
  return fill(message(locale, "acqMillisecondsValue"), {
    value: acquisitionNumber(locale, seconds * 1000),
  });
}

const codePoints = (text) => [...text].length;

/**
 * The filter name as the short line of the timeline writes it: the name of a
 * smart telescope's filter without its telescope ("Seestar S50 · Duo-Band"),
 * a trailing "cut" left out ("UV/IR cut" is "UV/IR"), whole when it
 * holds nine characters, else the words that fit them.
 */
export function shortFilterName(name) {
  const segments = String(name)
    .split("·")
    .map((segment) => segment.trim())
    .filter(Boolean);
  // "Seestar S50 · UV/IR-Cut filter": the filter is the part after the
  // telescope; "UV/IR-cut · RGB": a short last part is a qualifier.
  let trimmed = !segments.length
    ? String(name).trim()
    : segments.length > 1 && codePoints(segments[segments.length - 1]) > 3
      ? segments[segments.length - 1]
      : segments[0];
  trimmed = trimmed.replace(/[-\s]cut$/i, "").trim();
  if (codePoints(trimmed) <= 9) return trimmed;
  const words = trimmed.split(/\s+/);
  let kept = words[0];
  for (const word of words.slice(1)) {
    const next = `${kept} ${word}`;
    if (codePoints(next) > 9) break;
    kept = next;
  }
  return kept;
}

/**
 * "120 s · gain 100 · UV/IR-cut" (long) or "120 s · g100 · UV/IR"
 * (short). A field left to the device says nothing, except a gain the person
 * set to the device's own and a filter the person set to none.
 */
export function acquisitionLineText(locale, line, { short = false } = {}) {
  const parts = [];
  const exposure = line.exposureSeconds.value;
  if (exposure !== null) parts.push(acquisitionExposureText(locale, exposure));
  const gain = line.gain.value;
  if (gain !== null) {
    const value = acquisitionNumber(locale, gain);
    parts.push(
      fill(message(locale, short ? "acqLineGainShort" : "acqLineGain"), {
        value,
      }),
    );
  } else if (line.gain.chosen && !short) {
    parts.push(message(locale, "acqLineGainDevice"));
  }
  const filter = line.filter.value;
  if (typeof filter === "string" && filter.trim())
    parts.push(short ? shortFilterName(filter) : filter.trim());
  else if (line.filter.chosen && !short)
    parts.push(message(locale, "acqLineNoFilter"));
  return parts.join(" · ");
}

/** "39 poses" in the language's plural form (`Intl.PluralRules`). */
export function acquisitionCountText(locale, count) {
  const category = new Intl.PluralRules(locale).select(count);
  const key =
    count === 1
      ? "acqFramesOne"
      : category === "few"
        ? "acqFramesFew"
        : category === "many"
          ? "acqFramesMany"
          : category === "one" && count !== 0
            ? "acqFramesOne"
            : "acqFramesOther";
  return fill(message(locale, key), { count: String(count) });
}

/**
 * "≈ 39 poses" (suggested count) or "39 poses" (chosen); `null` when the
 * slot gives none.
 */
export function acquisitionFramesText(locale, line) {
  const count = line.frameCount.value;
  if (count === null) return null;
  const text = acquisitionCountText(locale, Math.trunc(count));
  return line.frameCount.chosen ? text : `≈ ${text}`;
}

const kindKeys = {
  galaxy: "acqKindGalaxy",
  emission: "acqKindEmission",
  planetary: "acqKindPlanetary",
  reflection: "acqKindReflection",
  cluster: "acqKindCluster",
  comet: "acqKindComet",
  planet: "acqKindPlanet",
  moon: "acqKindMoon",
};
const sensorKeys = {
  colour: "acqSensorColour",
  mono: "acqSensorMono",
};
const skyKeys = {
  dark: "acqSkyDark",
  medium: "acqSkyMedium",
  bright: "acqSkyBright",
};
// The words of the filters' families the portal already has.
const familyKeys = {
  dual: "plannerFilterFamilyDual",
  ha: "plannerFilterFamilyHa",
  oiii: "plannerFilterFamilyOiii",
  sii: "plannerFilterFamilySii",
  uhc: "plannerFilterFamilyUhc",
  hb: "plannerFilterFamilyHb",
  broadband: "plannerFilterFamilyBroadband",
};

const word = (locale, keys, value) =>
  Object.hasOwn(keys, value) ? message(locale, keys[value]) : null;

/** "f/5" (one decimal when it is not whole). */
export function acquisitionFocalRatioText(locale, ratio) {
  const rounded = Math.round(ratio * 10) / 10;
  return `f/${acquisitionNumber(locale, rounded)}`;
}

/**
 * The reasons the rule gave the exposure of the first line of [reading], as
 * short words in the order a person weighs them: the kind of target, the
 * camera or the focal ratio, the sky, the Moon, the cap. [forSheet] adds the
 * focal ratio, the sky and the cap ("galaxie, f/5, ciel moyen"); the line's
 * own provenance keeps the kind and the camera ("galaxie, caméra couleur").
 */
export function acquisitionExposureReasons(
  locale,
  reading,
  { forSheet = false } = {},
) {
  const field = reading.first.exposureSeconds;
  const reason = field.reason;
  const words = [];
  const kind = word(locale, kindKeys, reason.targetKind);
  if (kind) words.push(kind);
  if (forSheet) {
    const ratio = reading.facts.focalRatio;
    if (ratio !== null) words.push(acquisitionFocalRatioText(locale, ratio));
    const sky = word(locale, skyKeys, reason.skyClass);
    if (sky) words.push(sky);
    if (reason.moonBright === true)
      words.push(message(locale, "acqMoonBrightReason"));
    const cap = field.value;
    if (reason.capped === "mount" && cap !== null)
      words.push(
        fill(message(locale, "acqCappedMount"), {
          seconds: acquisitionExposureText(locale, cap),
        }),
      );
    else if (reason.capped === "device" && cap !== null)
      words.push(
        fill(message(locale, "acqCappedDevice"), {
          seconds: acquisitionExposureText(locale, cap),
        }),
      );
  } else {
    const sensor = word(
      locale,
      sensorKeys,
      reason.sensorKind ?? reading.facts.sensorKind,
    );
    if (sensor) words.push(sensor);
  }
  return words;
}

/**
 * What stands under the line in the interval editor: where the line comes
 * from. "suggéré : galaxie, caméra couleur" while the rule settled the line;
 * "choisi pour cette cible" / "… pour tout le plan" once the person did.
 */
export function acquisitionProvenanceText(locale, reading) {
  const line = reading.first;
  const fields = [line.exposureSeconds, line.gain, line.filter];
  const target = fields.some((field) => field.source === "chosen-target");
  const plan = fields.some((field) => field.source === "chosen-plan");
  const suggested = fields.some((field) => field.suggested);
  if ((target || plan) && suggested)
    return message(locale, "acqProvenanceMixed");
  if (target) return message(locale, "acqProvenanceTarget");
  if (plan) return message(locale, "acqProvenancePlan");
  const reasons = acquisitionExposureReasons(locale, reading);
  return reasons.length
    ? fill(message(locale, "acqProvenanceSuggested"), {
        reasons: reasons.join(", "),
      })
    : message(locale, "acqNothingSuggested");
}

/**
 * "120 s · galaxie, f/5, ciel moyen" for the help under the exposure field
 * of the dialog; `null` when the rule proposes no exposure.
 */
export function acquisitionSuggestedExposureText(locale, suggestion) {
  const value = suggestion?.first.exposureSeconds.value ?? null;
  if (!suggestion || value === null) return null;
  const reasons = acquisitionExposureReasons(locale, suggestion, {
    forSheet: true,
  });
  const exposure = acquisitionExposureText(locale, value);
  return reasons.length ? `${exposure} · ${reasons.join(", ")}` : exposure;
}

/**
 * "100 · gain unitaire de la caméra ZWO …" for the help under the gain;
 * `null` when there is no suggestion at all.
 */
export function acquisitionSuggestedGainText(locale, suggestion) {
  if (!suggestion) return null;
  const gain = suggestion.first.gain;
  const reason = gain.reason;
  const camera = suggestion.facts.cameraName;
  let source = null;
  switch (reason.gainSource) {
    case "unity":
      source = camera
        ? fill(message(locale, "acqGainUnityOf"), { camera })
        : message(locale, "acqGainUnity");
      break;
    case "hcg":
      source = camera
        ? fill(message(locale, "acqGainHcgOf"), { camera })
        : message(locale, "acqGainHcg");
      break;
    case "iso":
      source = fill(message(locale, "acqGainIso"), {
        value: acquisitionNumber(locale, gain.value ?? 0),
      });
      break;
    case "intent":
      source = message(
        locale,
        reason.gainIntent === "high" ? "acqGainIntentHigh" : "acqGainIntentLow",
      );
      break;
    case "device":
      source = message(locale, "acqGainSetOnDevice");
      break;
    default:
      source = null;
  }
  const value = gain.value;
  if (value === null) return source ?? message(locale, "acqNothingSuggested");
  const number = acquisitionNumber(locale, value);
  return source === null ? number : `${number} · ${source}`;
}

/**
 * "UV/IR cut (Lune à 17 %)" for the help under the filter; `null` when the
 * rule proposes none (the help then says so).
 */
export function acquisitionAdvisedFilterText(locale, suggestion) {
  const name = suggestion?.first.filter.value ?? null;
  if (!suggestion || typeof name !== "string" || !name) return null;
  const moon = suggestion.facts.moonIllumination;
  return moon !== null
    ? `${name} (${fill(message(locale, "acqFilterMoonReason"), {
        percent: acquisitionNumber(locale, moon),
      })})`
    : name;
}

/** The family the rule wanted for a filter it could not find (`filterMissing`). */
export function acquisitionMissingFilterText(locale, suggestion) {
  const reason = suggestion?.first.filter.reason;
  if (!reason || reason.filterMissing !== true) return null;
  const family = word(locale, familyKeys, reason.filterFamily);
  return family
    ? fill(message(locale, "acqFilterMissingReason"), { family })
    : null;
}

/** A duration in minutes as the sentence under the frame count writes it. */
export function acquisitionSlotDuration(locale, seconds) {
  return durationText(seconds / 60, locale);
}

/** "≈ 39 poses sur 1 h 20 (pose + 2 s de lecture)." */
export function acquisitionFramesOverSlotText(locale, count, slotSeconds) {
  return fill(message(locale, "acqFramesOverSlot"), {
    count,
    duration: acquisitionSlotDuration(locale, slotSeconds),
    readout: acquisitionRuleTable().readOutSeconds,
  });
}

/** "120 frames do not fit in this slot: 98 at most. The slot does not move." */
export function acquisitionFramesNoFitText(locale, count, max) {
  return fill(message(locale, "acqFramesNoFit"), { count, max });
}

/**
 * The plan's defaults in the facts of its dialog: "Prise de vue · pose
 * suggérée · gain 100 · filtre conseillé". [defaults] is the plan's chosen
 * line (`null` for none), [suggestion] the rule's reading of the plan's
 * first target (`null` for a plan with none).
 */
export function acquisitionPlanLineText(locale, defaults, suggestion) {
  const has = (key) => defaults && Object.hasOwn(defaults, key);
  const parts = [message(locale, "acqBlockTitle")];
  parts.push(
    typeof defaults?.exposureSeconds === "number"
      ? fill(message(locale, "acqPlanExposure"), {
          value: acquisitionExposureText(locale, defaults.exposureSeconds),
        })
      : message(locale, "acqPlanExposureSuggested"),
  );
  if (has("gain")) {
    parts.push(
      defaults.gain === null
        ? message(locale, "acqLineGainDevice")
        : fill(message(locale, "acqLineGain"), {
            value: acquisitionNumber(locale, defaults.gain),
          }),
    );
  } else {
    const gain = suggestion?.first.gain.value ?? null;
    parts.push(
      gain === null
        ? message(locale, "acqPlanGainSuggested")
        : fill(message(locale, "acqLineGain"), {
            value: String(Math.round(gain)),
          }),
    );
  }
  if (has("filter")) {
    parts.push(
      defaults.filter === null
        ? message(locale, "acqLineNoFilter")
        : fill(message(locale, "acqPlanFilter"), { name: defaults.filter }),
    );
  } else parts.push(message(locale, "acqPlanFilterAdvised"));
  return parts.join(" · ");
}
