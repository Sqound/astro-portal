// The words of "Pourquoi cette cible ce soir" (the dialog
// `components/TargetScoreExplained.js`, the chip of a target card): one
// sentence of facts per criterion, the verdict, the chip. Kept apart from the
// components so they are tested without rendering. The rules themselves are
// `target-score.js`.
import { message, sentenceSeparator } from "portal/i18n.js";
import { durationText, scoreOn100 } from "portal/written-forms.js";
import { targetArcminLabel } from "./target-facts-model.js";
import { clock, fill, windPresetLabelKey } from "./wind-section.js";

const nbsp = " ";

// The message key of each criterion's label, in the order of the sheet.
export const targetScoreLabelKeys = Object.freeze({
  "altitude-window": "targetScoreAltitudeWindow",
  moon: "targetScoreMoon",
  weather: "targetScoreWeather",
  "sky-quality": "targetScoreSkyQuality",
  "horizon-mask": "targetScoreHorizonMask",
  "field-fit": "targetScoreFieldFit",
  wind: "targetScoreWind",
});

const unavailableKeys = Object.freeze({
  "no-series": "targetScoreUnavailableSeries",
  "no-moon": "targetScoreUnavailableMoon",
  "no-forecast": "targetScoreUnavailableForecast",
  "no-sky-quality": "targetScoreUnavailableSky",
  "no-mask": "targetScoreUnavailableMask",
  "no-field": "targetScoreUnavailableField",
  "no-size": "targetScoreUnavailableSize",
});

const verdictKeys = Object.freeze({
  good: "targetScoreVerdictGood",
  possible: "targetScoreVerdictPossible",
  difficult: "targetScoreVerdictDifficult",
});

function decimal(value, locale, digits = 1) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: digits,
  }).format(value);
}

function fieldLabel(facts, locale) {
  return facts.fieldShape === "circle"
    ? `${decimal(facts.fieldWidth, locale)}°`
    : `${decimal(facts.fieldWidth, locale)}°${nbsp}×${nbsp}${decimal(facts.fieldHeight, locale)}°`;
}

function sentence(parts, locale) {
  return (
    parts.filter(Boolean).join(message(locale, "targetScoreJoin")) +
    message(locale, "targetScoreEnd")
  );
}

// The one sentence of facts of a criterion (or why it is not scored).
//
// `moonSeparation`: `{ min, max }`, the Moon's two extreme separations over the
// night shown (`targetNightMoon`), so the note writes the very figures of the
// line "Écart avec la Lune"; `null` writes no angle (the Moon is down while the
// target is up); left out, the criterion's own figure.
export function targetScoreSentence(
  criterion,
  { locale, timeZone, moonSeparation } = {},
) {
  if (!criterion?.available)
    return message(
      locale,
      unavailableKeys[criterion?.reason] || "targetScoreUnavailableForecast",
    );
  const facts = criterion.facts || {};
  const time = (value) => clock(value, locale, timeZone);
  switch (criterion.key) {
    case "altitude-window": {
      const usable = Number(facts.usableMinutes) || 0;
      const bonus = facts.eveningBonus;
      return sentence(
        [
          fill(message(locale, "targetScoreAltitudeCulmination"), {
            altitude: facts.culminationAltitude,
            time: time(facts.culminationAt),
          }),
          usable > 0
            ? fill(message(locale, "targetScoreAltitudeUsable"), {
                altitude: facts.minAltitude,
                duration: durationText(usable, locale),
              })
            : fill(message(locale, "targetScoreAltitudeNeverUsable"), {
                altitude: facts.minAltitude,
              }),
          fill(
            message(
              locale,
              facts.mode === "visual"
                ? "targetScoreAltitudeFullVisual"
                : "targetScoreAltitudeFullPhoto",
            ),
            { duration: durationText(facts.fullMinutes, locale) },
          ),
          bonus?.points > 0
            ? fill(message(locale, "targetScoreEveningBonus"), {
                points: bonus.points,
                duration: durationText(bonus.minutes, locale),
                from: time(bonus.from),
                to: time(bonus.to),
              })
            : null,
        ],
        locale,
      );
    }
    case "moon": {
      const separation =
        moonSeparation === undefined
          ? facts.separation
          : moonSeparation
            ? moonSeparation.min === moonSeparation.max
              ? moonSeparation.min
              : // "120°–168°": the sentence adds the last degree sign.
                `${moonSeparation.min}°–${moonSeparation.max}`
            : null;
      return sentence(
        [
          separation === null || separation === undefined
            ? fill(message(locale, "targetScoreMoonLitOnly"), {
                illumination: facts.illumination,
              })
            : fill(message(locale, "targetScoreMoonLit"), {
                illumination: facts.illumination,
                separation,
                target: facts.targetName,
              }),
          facts.state === "sets" && facts.setAt
            ? fill(message(locale, "targetScoreMoonSets"), {
                time: time(facts.setAt),
              })
            : facts.state === "rises" && facts.riseAt
              ? fill(message(locale, "targetScoreMoonRises"), {
                  time: time(facts.riseAt),
                })
              : facts.state === "up"
                ? message(locale, "targetScoreMoonUp")
                : facts.state === "down"
                  ? message(locale, "targetScoreMoonDown")
                  : null,
          facts.narrowbandFilter && facts.state !== "down"
            ? message(locale, "targetScoreMoonFilter")
            : null,
        ],
        locale,
      );
    }
    case "weather":
      return sentence(
        [
          fill(message(locale, "targetScoreWeatherClouds"), {
            cloud: facts.cloudMean,
          }),
          facts.dewRisk === "high"
            ? fill(message(locale, "targetScoreWeatherDewHigh"), {
                time: time(facts.dewRiskFrom),
              })
            : facts.dewRisk === "moderate"
              ? fill(message(locale, "targetScoreWeatherDewModerate"), {
                  time: time(facts.dewRiskFrom),
                })
              : facts.humidity === "rising"
                ? fill(message(locale, "targetScoreWeatherHumidityRising"), {
                    time: time(facts.humidityRiseAt),
                  })
                : facts.humidity === "steady"
                  ? message(locale, "targetScoreWeatherHumiditySteady")
                  : null,
        ],
        locale,
      );
    case "sky-quality": {
      const sqm =
        facts.sqm === null || facts.sqm === undefined
          ? null
          : new Intl.NumberFormat(locale, {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            }).format(facts.sqm);
      const key =
        facts.bortleClass !== null && sqm !== null
          ? facts.source === "measured"
            ? "targetScoreSkyBothMeasured"
            : facts.source === "entered"
              ? "targetScoreSkyBothEntered"
              : "targetScoreSkyBoth"
          : sqm !== null
            ? "targetScoreSkySqm"
            : "targetScoreSkyBortle";
      const base = fill(message(locale, key), {
        bortle: facts.bortleClass,
        sqm,
      });
      // One more sentence of facts when the target's window crosses a
      // bright zone (the points it cost are in the row).
      const zone = facts.brightZone;
      if (!zone || !zone.compass) return base;
      // Japanese and Chinese run their sentences together; the others take
      // a space.
      return `${base}${sentenceSeparator(locale)}${fill(
        message(locale, "targetScoreBrightZone"),
        {
          compass: message(locale, `targetScoreCompass${zone.compass}`),
          from: time(zone.from),
          to: time(zone.to),
          sqm: new Intl.NumberFormat(locale, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }).format(zone.worstSqm),
        },
      )}`;
    }
    case "horizon-mask":
      if (facts.state === "hidden")
        return fill(message(locale, "targetScoreMaskHidden"), {
          altitude: facts.minAltitude,
        });
      if (facts.state === "below-minimum")
        return fill(message(locale, "targetScoreMaskBelowMinimum"), {
          altitude: facts.minAltitude,
        });
      return sentence(
        [
          fill(message(locale, "targetScoreMaskClear"), {
            from: time(facts.clearFrom),
            to: time(facts.clearTo),
          }),
          facts.maskedMinutes > 0
            ? fill(message(locale, "targetScoreMaskLost"), {
                minutes: durationText(facts.maskedMinutes, locale),
                altitude: facts.minAltitude,
              })
            : null,
        ],
        locale,
      );
    case "field-fit": {
      const key = {
        comfortable: "targetScoreFieldComfortable",
        small: "targetScoreFieldSmall",
        tight: "targetScoreFieldTight",
        mosaic: "targetScoreFieldMosaic",
      }[facts.fit];
      return fill(message(locale, key || "targetScoreFieldTight"), {
        target: facts.targetName,
        size: fill(message(locale, "targetScoreSizeApprox"), {
          size: targetArcminLabel(facts.sizeArcmin, locale),
        }),
        occupancy: facts.occupancy,
        dimension: message(
          locale,
          facts.dimension === "height"
            ? "targetScoreFieldHeight"
            : "targetScoreFieldWidth",
        ),
        field: fieldLabel(facts, locale),
      });
    }
    case "wind":
      return fill(
        message(
          locale,
          facts.subject === "sustained"
            ? "targetScoreWindSustained"
            : "targetScoreWindGust",
        ),
        {
          value: facts.value ?? "—",
          time: facts.at ? time(facts.at) : "—",
          limit: facts.limit,
          preset: message(
            locale,
            facts.preset === "custom"
              ? "targetScoreWindPresetCustom"
              : windPresetLabelKey(facts.preset),
          ),
        },
      );
    default:
      return "";
  }
}

// The alert of the wind row when the gusts (or the sustained wind) come near
// or beyond the mount's limit, else null.
export function targetScoreWindAlert(criterion, locale) {
  const facts = criterion?.facts || {};
  if (
    criterion?.key !== "wind" ||
    !criterion.available ||
    (facts.level !== "near" && facts.level !== "over")
  )
    return null;
  const subject = facts.subject === "sustained" ? "Sustained" : "Gust";
  const level = facts.level === "over" ? "Over" : "Near";
  return message(locale, `targetScoreWindAlert${subject}${level}`);
}

// The chip of a target card: the score always on 100 ("82": 74 of the 90
// points of the rated criteria), and its accessible name "Score de ce
// soir : 82 sur 100".
export function targetScoreChip(score, locale) {
  const onHundred = scoreOn100(score);
  if (onHundred === null) return null;
  return {
    text: String(onHundred),
    label: fill(message(locale, "targetScoreChip"), {
      total: onHundred,
      max: 100,
    }),
    verdict: score.verdict,
  };
}

// "mercredi 14 octobre": the night's date without its year.
export function targetScoreNightDate(date, locale) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ""));
  if (!match) return "";
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

// "M31 · Galaxie d’Andromède": the designation, then the common name (a
// catalogue title already written "M31 — Galaxie d’Andromède" gives its
// name once).
export function targetScoreName(target) {
  const designation = String(target?.designation || "").trim();
  let title = String(target?.title || "").trim();
  for (const separator of [" — ", " - ", " · "])
    if (designation && title.startsWith(`${designation}${separator}`))
      title = title.slice(designation.length + separator.length).trim();
  if (designation && title && designation !== title)
    return `${designation} · ${title}`;
  return designation || title || String(target?.objects?.[0] || "");
}

// Everything the sheet shows, in its order (the dialog "Statistiques de la
// cible" — the head, "Pourquoi cette cible ce soir" with the note's total,
// then the blocks of `target-facts-model.js`, then "Détail de la note").
// The head's line of facts keeps the type only: the size, the magnitude
// and the distance are tiles of "Caractéristiques". `score` is `null` for
// the catalogue's version, which has no note.
export function targetScoreSheet({
  score = null,
  card,
  locale,
  timeZone,
  placeName = "",
  date = "",
  moonSeparation,
}) {
  const target = card?.target || {};
  const name = targetScoreName(target);
  const criteria = score?.criteria || [];
  const reduced = criteria.some((entry) => !entry.available);
  return {
    title: message(locale, "targetFactsTitle"),
    whyTitle: message(locale, "targetScoreTitle"),
    close: message(locale, "targetScoreClose"),
    about: message(locale, "plannerTargetKnowledgeTitle"),
    name,
    facts: target.skyTarget?.type || target.type || "",
    night: [placeName, targetScoreNightDate(date, locale)]
      .filter(Boolean)
      .join(" · "),
    total: String(score ? (scoreOn100(score) ?? "—") : ""),
    outOf: fill(message(locale, "targetScoreOutOf"), { max: 100 }),
    verdict: message(
      locale,
      verdictKeys[score?.verdict] || verdictKeys.difficult,
    ),
    sum: message(locale, reduced ? "targetScoreSumReduced" : "targetScoreSum"),
    // « Fenêtre courte : 31 min (moins de 45 min). La note est plafonnée à
    // 49. »: the cap of a useful window under 45 min, else null.
    shortWindow: score?.cap
      ? fill(message(locale, "targetScoreShortWindow"), {
          duration: durationText(score.cap.minutes, locale),
          limit: durationText(score.cap.limit, locale),
          ceiling: scoreOn100({ total: score.cap.ceiling, max: score.max }),
        })
      : null,
    detail: message(locale, "targetScoreDetail"),
    rows: criteria.map((criterion) => {
      const alert = targetScoreWindAlert(criterion, locale);
      return {
        key: criterion.key,
        label: message(locale, targetScoreLabelKeys[criterion.key]),
        available: criterion.available,
        points: criterion.available
          ? fill(message(locale, "targetScorePoints"), {
              points: criterion.points,
              max: criterion.max,
            })
          : message(locale, "targetScoreNotScored"),
        percent: criterion.available
          ? Math.round((criterion.points / criterion.max) * 100)
          : 0,
        tone: alert ? "alert" : "normal",
        alert,
        sentence: targetScoreSentence(criterion, {
          locale,
          timeZone,
          moonSeparation,
        }),
        windSettings:
          criterion.key === "wind" && Boolean(alert)
            ? message(locale, "targetScoreWindSettings")
            : null,
      };
    }),
    estimates: message(locale, "targetScoreEstimates"),
  };
}
