import { debriefStripSegments } from "../../debrief-summary.js";
// What « Bilan de la nuit » draws on the web, worked out from the summary of a
// night (`../../debrief-summary.js`): durations as the French copy
// writes them (« 5 h 40 »), the labels of the loss causes, the lines that say
// where each loss happened, and the strip of the night (every planned slot,
// and what really happened inside it). Framework-free, so it is tested
// without React (packages/portal/tests/debrief-summary-section.test.mjs);
// the page of a session (SessionDetailPage.js) and the debriefing draw what is
// worked out here.
//
// Durations and causes only — never a score or an overall mark.

import { message } from "../../i18n.js";
import {
  clockText,
  durationText as writtenDuration,
} from "../../written-forms.js";
import {
  debriefTimeZone,
  toDateTimeLocalInputValue,
} from "./debrief-decision.js";

const NBSP = " ";

function fill(template, values) {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value ?? "")),
    template,
  );
}

const text = (locale, key, values = {}) => fill(message(locale, key), values);

/** `clouds` -> `Clouds`, `meridian_flip` -> `MeridianFlip`, `time` -> `Time`. */
export function causeKey(cause) {
  return String(cause)
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/** « 5 h 40 », « 40 min », « 0 min » (Japanese « 2時間5分 »): the one duration writing. */
export function durationText(locale, minutes) {
  return writtenDuration(minutes, locale);
}

/** « Nuages », « Retournement au méridien »… */
export const causeLabel = (locale, cause) =>
  message(locale, `nightSummaryCause${causeKey(cause)}`);

/**
 * « vent », « nuages »: the label of a cause inside a sentence, lower-cased —
 * except in German, whose labels are nouns (« Wolken », « Wind ») that keep
 * their capital.
 */
export function causeLabelInSentence(locale, cause) {
  const label = causeLabel(locale, cause);
  return locale === "de" ? label : label.toLocaleLowerCase(locale);
}

/** « Nuages », « Retournement » — the short name written under the strip. */
export const stripCauseLabel = (locale, cause) =>
  message(locale, `nightSummaryStripCause${causeKey(cause)}`);

/** « 01:10 » in the plan's observing-place zone. */
export function clockOf(timeZone) {
  const zone = debriefTimeZone(timeZone);
  return (instant) => clockText(instant, zone);
}

/**
 * The whole hours of the plan's zone inside (`start`, `end`] — every hour, or
 * every second one when the night is longer than seven — as epoch
 * milliseconds: the marks written above the strip.
 */
export function hourMarks(timeZone, start, end) {
  const zone = debriefTimeZone(timeZone);
  const step = end - start > 7 * 3600_000 ? 2 : 1;
  const marks = [];
  const quarter = 15 * 60_000;
  let hours = 0;
  for (
    let at = Math.ceil((start + 1) / quarter) * quarter;
    at <= end;
    at += quarter
  ) {
    const wall = toDateTimeLocalInputValue(new Date(at).toISOString(), zone);
    if (wall.slice(14) !== "00") continue;
    if (hours % step === 0) marks.push(at);
    hours += 1;
  }
  return marks;
}

const minuteOf = (iso) => {
  const at = Date.parse(iso);
  return Number.isNaN(at) ? null : Math.round(at / 60_000);
};

/** Attach catalogue titles to the already computed summary geometry. */
export function buildNightStrip(summary, { titleOf = (id) => id } = {}) {
  const strip = summary?.segments ?? debriefStripSegments(summary);
  return strip
    ? {
        ...strip,
        targets: strip.targets.map((target) => ({
          ...target,
          title: titleOf(target.targetId),
        })),
      }
    : null;
}

const atMs = (minute) => minute * 60_000;

/** The strip in words, as its `aria-label` says it. */
export function stripDescription(locale, strip, clock) {
  const sentences = strip.targets.map((target) => {
    const parts = [];
    for (const segment of target.segments) {
      const from = clock(atMs(segment.start));
      const to = clock(atMs(segment.end));
      if (segment.kind === "pause")
        parts.push(
          !segment.cause || segment.cause === "unexplained"
            ? text(locale, "nightSummaryStripPauseNoCause", {
                start: from,
                end: to,
              })
            : text(locale, "nightSummaryStripPause", {
                start: from,
                end: to,
                cause: message(
                  locale,
                  `nightSummaryFor${causeKey(segment.cause)}`,
                ),
              }),
        );
      else if (segment.kind === "rejected")
        parts.push(
          text(locale, "nightSummaryStripRejected", { start: from, end: to }),
        );
      else if (segment.kind === "abandoned")
        parts.push(
          !segment.cause || segment.cause === "unexplained"
            ? message(locale, "nightSummaryStripAbandonedPlain")
            : text(locale, "nightSummaryStripAbandoned", {
                cause: causeLabelInSentence(locale, segment.cause),
              }),
        );
    }
    const lines = [];
    if (target.start !== null) {
      const slot = {
        target: target.title,
        start: clock(atMs(target.start)),
        end: clock(atMs(target.end)),
      };
      lines.push(
        parts.length
          ? text(locale, "nightSummaryStripTarget", {
              ...slot,
              parts: parts.join(", "),
            })
          : text(locale, "nightSummaryStripTargetPlain", slot),
      );
    }
    // The passages in words, where the box and its lost stretches do not say
    // it all: a target observed several times, time still waiting for its
    // confirmation, a target the plan did not have.
    const passages = target.passages ?? [];
    if (
      passages.length &&
      (passages.length > 1 ||
        target.start === null ||
        passages.some((passage) => passage.auto))
    ) {
      const listed = passages.map((passage) =>
        text(
          locale,
          passage.auto
            ? "nightSummaryStripPassagePartAuto"
            : "nightSummaryStripPassagePart",
          {
            start: clock(atMs(passage.start)),
            end: clock(atMs(passage.end)),
          },
        ),
      );
      lines.push(
        passages.length > 1
          ? text(locale, "nightSummaryStripPassages", {
              target: target.title,
              count: passages.length,
              parts: listed.join(", "),
            })
          : text(locale, "nightSummaryStripPassageOne", {
              target: target.title,
              parts: listed.join(", "),
            }),
      );
    }
    return lines.join(" ");
  });
  return text(locale, "nightSummaryStripLabel", {
    start: clock(atMs(strip.start)),
    end: clock(atMs(strip.end)),
    details: sentences.filter(Boolean).join(" "),
  });
}

/** One line under a cause: where the time was lost. */
export function spanText(locale, span, cause, { titleOf, clock }) {
  const start = Date.parse(span.start);
  const end = Date.parse(span.end);
  const target = titleOf(span.targetId);
  if (span.kind === "pause")
    return text(locale, "nightSummarySpanPause", {
      start: clock(start),
      end: clock(end),
      target,
    });
  if (span.kind === "rejected")
    return text(locale, "nightSummarySpanRejected", {
      start: clock(start),
      end: clock(end),
      target,
    });
  return cause === "unexplained"
    ? text(locale, "nightSummarySpanAbandoned", {
        target,
        time: clock(start),
      })
    : text(locale, "nightSummarySpanAbandonedBecause", {
        target,
        time: clock(start),
        reason: message(locale, `nightSummaryAbandonReason${causeKey(cause)}`),
      });
}

/** « Abandonnée · météo » — the outcome of a given-up target, with its reason. */
export function outcomeText(locale, outcome, skipReason = null) {
  if (outcome === "done") return message(locale, "nightSummaryOutcomeDone");
  if (outcome === "partial")
    return message(locale, "nightSummaryOutcomePartial");
  return skipReason
    ? text(locale, "nightSummaryOutcomeAbandonedBecause", {
        reason: message(
          locale,
          `nightSummarySkipReason${causeKey(skipReason)}`,
        ),
      })
    : message(locale, "nightSummaryOutcomeAbandoned");
}

/** « Nuit du sam. 10 oct. » from the plan's calendar date. */
export function nightOfText(locale, isoDate) {
  const match = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  const date = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(
    new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    ),
  );
  return text(locale, "nightSummaryNightOf", { date });
}

/** « 3 cibles ». */
export function targetCountText(locale, count) {
  return text(
    locale,
    count === 1 ? "nightSummaryTargetCountOne" : "nightSummaryTargetCountOther",
    { count },
  );
}

export { NBSP };

/** « 1 h 30 comptée automatiquement, pauses déduites »: a span that no longer ticks is a duration. */
export function autoCountedText(locale, minutes) {
  return text(locale, "nightSummaryAutoCounted", {
    duration: durationText(locale, minutes),
  });
}

/** The suffix of « Acquis 38 min » for a target observed in several passages: « en 2 passages ». */
export function passagesSuffixText(locale, count) {
  return count > 1 ? text(locale, "nightSummaryTargetPassages", { count }) : "";
}

/**
 * The `auto_time_confirmed` payloads that confirm every target still holding
 * unconfirmed automatic time — the one tap of a target's « Confirmer » (one
 * entry) and the debriefing's own « Confirmer » (all of them), written before
 * the plan is frozen so that no « auto » survives it. Each names the target as
 * its events did (`targetId`, with the plan item when it has one).
 */
export function autoConfirmationPayloads(summary, only = null) {
  return (summary?.perTarget ?? [])
    .filter(
      (entry) =>
        (!only ||
          (entry.planItemId ?? entry.targetId) ===
            (only.planItemId ?? only.targetId)) &&
        (entry.passages ?? []).some((passage) => passage.confirmed === false),
    )
    .map((entry) => ({
      targetId: entry.targetId,
      ...(entry.planItemId ? { planItemId: entry.planItemId } : {}),
    }));
}
