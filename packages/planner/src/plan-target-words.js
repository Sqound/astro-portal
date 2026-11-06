// The words of a target of tonight's plan on the web: its row in the
// details view and its dialog. Kept apart from the components so they are
// tested without rendering.
import { message } from "portal/i18n.js";
import { knowledgeSections } from "portal/knowledge-sections.js";
import { durationText, scoreOn100 } from "portal/written-forms.js";
import { planTargetTrend } from "./tonight-plan-targets.js";
import { targetArcminLabel } from "./target-facts-model.js";
import { fill } from "./wind-section.js";

const finite = (value) => typeof value === "number" && Number.isFinite(value);

function decimal(value, locale, digits = 1) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * The row of `item` (a `tonightPlanCard` item) in the details view: "19:49
 * → 21:49", "2 h dans ce plan · max 68°", "86/100". `at(iso)` writes a
 * clock time of the page's place.
 */
export function planTargetRowWords(item, night, { locale, at }) {
  const duration = finite(item?.minutes)
    ? durationText(item.minutes, locale)
    : null;
  const score = night?.score ? scoreOn100(night.score) : null;
  return {
    designation: item.designation,
    name: item.name,
    slot:
      item?.start && item?.end
        ? fill(message(locale, "tonightCandidateWindow"), {
            start: at(item.start),
            end: at(item.end),
          })
        : null,
    facts:
      duration === null
        ? null
        : finite(night?.maxAltitude)
          ? fill(message(locale, "tonightPlanTargetInPlanMax"), {
              duration,
              altitude: night.maxAltitude,
            })
          : fill(message(locale, "tonightPlanTargetInPlan"), { duration }),
    score: score === null ? null : `${score}/100`,
  };
}

const difficultyKeys = {
  easy: "plannerTargetGuideEasy",
  moderate: "plannerTargetGuideModerate",
  difficult: "plannerTargetGuideDifficult",
  challenging: "plannerTargetGuideChallenging",
};

/**
 * Everything the dialog of `item` shows, in order. `knowledge` is the
 * catalogue's card of the target (the item's frozen target when it carries a
 * description, else the one read from the service); `moonUp` the night's Moon
 * intervals (`[{start, end}]`, ISO), `dew` the night's dew (`{level, from}`).
 */
export function planTargetSheetWords({
  item,
  night = null,
  knowledge = null,
  locale,
  at,
  moonUp = [],
  dew = null,
}) {
  const target = item?.target || {};
  const source = { ...target, ...(knowledge || {}) };
  const say = (key, values = {}) => fill(message(locale, key), values);
  const size = targetArcminLabel(target.apparentSizeArcmin, locale);
  const magnitude = Number(
    target.integratedMagnitude ?? knowledge?.magnitude ?? Number.NaN,
  );
  const type = target.skyTarget?.type || knowledge?.type || "";
  const score = night?.score ? scoreOn100(night.score) : null;
  const start = item?.start ? Date.parse(item.start) : null;
  const end = item?.end ? Date.parse(item.end) : null;
  const slotted = Number.isFinite(start) && Number.isFinite(end);
  const tiles = slotted
    ? [
        {
          key: "slot",
          label: message(locale, "planTargetSheetSlot"),
          value: say("tonightCandidateWindow", {
            start: at(item.start),
            end: at(item.end),
          }),
        },
        {
          key: "duration",
          label: message(locale, "planTargetSheetDuration"),
          value: durationText(item.minutes, locale),
        },
        ...(finite(night?.startAltitude) && finite(night?.endAltitude)
          ? [
              {
                key: "height",
                label: message(locale, "planTargetSheetHeight"),
                value: say("tonightCandidateWindow", {
                  start: `${night.startAltitude}°`,
                  end: `${night.endAltitude}°`,
                }),
              },
            ]
          : []),
        ...(score !== null
          ? [
              {
                key: "score",
                label: message(locale, "planTargetSheetScore"),
                value: String(score),
                outOf: "/100",
              },
            ]
          : []),
      ]
    : [];
  const sentences = [];
  const trend = slotted ? planTargetTrend(night) : null;
  if (trend) {
    const moon = moonUp.some(
      (span) => Date.parse(span.start) < end && Date.parse(span.end) > start,
    );
    sentences.push(
      say("planTargetSheetFacts", {
        trend: message(
          locale,
          {
            rising: "planTargetSheetTrendRising",
            culminating: "planTargetSheetTrendCulminating",
            setting: "planTargetSheetTrendSetting",
          }[trend],
        ),
        moon: message(locale, moon ? "tonightMoonRisen" : "tonightMoonSet"),
      }),
    );
  }
  if (
    slotted &&
    dew?.from &&
    (dew.level === "moderate" || dew.level === "high")
  ) {
    sentences.push(
      say(
        Date.parse(dew.from) < end
          ? "planTargetSheetDewDuring"
          : "planTargetSheetDewAfter",
        { time: at(dew.from) },
      ),
    );
  }
  const paragraphs = Array.isArray(source.storyParagraphs)
    ? source.storyParagraphs.filter(Boolean)
    : [source.story].filter(Boolean);
  // A target with a published page (intertitled sections): the dialog shows
  // the page of the detail page, folded; the others keep their flat text.
  const page = knowledgeSections(source).length > 0 ? source : null;
  const guide = source.observingGuide;
  const credit = String(source.photoImageCredit || "").trim();
  const sourceUrl = String(source.photoImageSourceUrl || "").trim();
  return {
    title: item?.name
      ? `${item.designation} · ${item.name}`
      : item?.designation,
    photo: say("planTargetSheetPhoto", { target: item?.designation }),
    facts: [
      type,
      size ? say("targetScoreSizeApprox", { size }) : "",
      Number.isFinite(magnitude)
        ? say("targetScoreMagnitude", { value: decimal(magnitude, locale) })
        : "",
    ]
      .filter(Boolean)
      .join(" · "),
    tonight: slotted ? message(locale, "planTargetSheetTonight") : null,
    tiles,
    curveLabel:
      slotted && finite(night?.startAltitude) && finite(night?.endAltitude)
        ? say("planTargetSheetCurve", {
            target: item.designation,
            start: night.startAltitude,
            startTime: at(item.start),
            end: night.endAltitude,
            endTime: at(item.end),
          })
        : null,
    nightFacts: sentences.length ? sentences.join(" ") : null,
    description:
      paragraphs.length || page
        ? {
            title: message(locale, "planTargetSheetDescription"),
            paragraphs,
            page,
          }
        : null,
    guide:
      guide && typeof guide === "object"
        ? {
            title: message(locale, "plannerTargetObservingGuide"),
            focalLabel: message(locale, "plannerTargetGuideFocalLength"),
            focal: `${decimal(guide.focalLengthMinimumMm, locale, 0)}–${decimal(guide.focalLengthMaximumMm, locale, 0)} mm`,
            visualLabel: message(locale, "plannerTargetGuideVisualAperture"),
            visual: [
              `${decimal(guide.visualMinimumApertureMm, locale, 0)} mm`,
              difficultyKeys[guide.visualDifficulty]
                ? message(locale, difficultyKeys[guide.visualDifficulty])
                : "",
            ]
              .filter(Boolean)
              .join(" · "),
            note: message(locale, "plannerTargetGuideSensorNote"),
          }
        : null,
    credit: credit
      ? `${message(locale, "plannerTargetImageCredit")} ${credit}`
      : null,
    sourceUrl: sourceUrl || null,
    sourceLabel: message(locale, "plannerTargetImageSource"),
    close: message(locale, "targetScoreClose"),
  };
}
