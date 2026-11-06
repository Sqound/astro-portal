// The words of the "Tolérance au vent" section of the web planner
// (component `components/WindTolerance.js`): the limits of the chosen
// preset, the mount it is kept for, and the line on tonight's gusts. Kept
// apart from the component so they are tested without rendering.
import { message } from "portal/i18n.js";
import { clockText } from "portal/written-forms.js";
import { validTimeZone } from "./planner.js";
import { windTolerancePresets, windTonightSubject } from "./wind.js";

/** "21:13": an instant as the place's clock reads it (U4, one writing). */
export function clock(value, locale, timeZone) {
  return clockText(value, validTimeZone(timeZone));
}

export function fill(template, values) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

// The message key of a preset's label.
export function windPresetLabelKey(preset) {
  return (
    windTolerancePresets.find((entry) => entry.preset === preset)?.label ||
    "plannerWindPresetStandard"
  );
}

// "Limites du réglage Standard", "20 km/h", "30 km/h", the mount the
// setting is kept for ("Réglage de la monture : …", or the plans without a
// mount), and, for the row of stage 3: the setting ("Standard · 20 / 30
// km/h"), the mount ("Pour la monture : …") and the fact the folded stage
// adds ("vent Standard", "vent 22 / 34 km/h" in "Personnalisé").
export function windSectionLabels({ locale, tolerance, mountName = null }) {
  const kmh = (value) =>
    fill(message(locale, "plannerWindKmh"), { value: value ?? "—" });
  const pair = fill(message(locale, "plannerWindLimitsPair"), {
    sustained: tolerance?.sustainedKmh ?? "—",
    gust: tolerance?.gustKmh ?? "—",
  });
  const preset = message(locale, windPresetLabelKey(tolerance?.preset));
  return {
    value: `${preset} · ${pair}`,
    summary: fill(message(locale, "plannerWindSummary"), {
      value: tolerance?.preset === "custom" ? pair : preset,
    }),
    forMount: mountName
      ? fill(message(locale, "plannerWindForMount"), { mount: mountName })
      : message(locale, "plannerWindMountNone"),
    limitsOf: fill(message(locale, "plannerWindLimitsOf"), {
      preset: message(locale, windPresetLabelKey(tolerance?.preset)),
    }),
    sustained: kmh(tolerance?.sustainedKmh),
    gust: kmh(tolerance?.gustKmh),
    mount: mountName
      ? fill(message(locale, "plannerWindMount"), { mount: mountName })
      : message(locale, "plannerWindMountNone"),
  };
}

// The sentence on tonight's wind, and its tone: `near`, `over`, or `calm`
// (under the limit, or no forecast). It speaks of the gusts, or of the
// sustained wind when that is what sets the level (`windTonightSubject`).
// "Ce soir" when the planner's night begins this evening, "Cette nuit"
// otherwise.
export function windTonightLine({
  locale,
  assessment,
  tonight,
  timeZone,
} = {}) {
  const lead = message(
    locale,
    tonight ? "plannerWindLeadTonight" : "plannerWindLeadNight",
  );
  const subject = windTonightSubject(assessment);
  if (
    !subject ||
    subject.value === null ||
    subject.value === undefined ||
    subject.at === null ||
    subject.at === undefined
  )
    return {
      tone: "calm",
      text: message(
        locale,
        tonight
          ? "plannerWindForecastUnavailableTonight"
          : "plannerWindForecastUnavailableNight",
      ),
    };
  const form = subject.subject === "sustained" ? "Sustained" : "";
  const key = `plannerWindForecast${form}${
    subject.level === "over"
      ? "Over"
      : subject.level === "near"
        ? "Near"
        : "Under"
  }`;
  return {
    tone: subject.level === "ok" ? "calm" : subject.level,
    text: fill(message(locale, key), {
      lead,
      gust: Math.round(subject.value),
      wind: Math.round(subject.value),
      time: clock(subject.at, locale, timeZone),
    }),
  };
}
