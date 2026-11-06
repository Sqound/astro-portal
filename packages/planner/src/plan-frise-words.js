// The words of the plan frise on the web: the caption and the
// two sentences a screen reader reads in place of the drawing. Kept apart
// from the components, like `tonight-words.js`, so they are tested without
// rendering. The hours, the heights and the names are never translated; the
// hours are written by the `clock` the caller gives (the card's own,
// `clock(value, locale, timeZone)` of `wind-section.js`), never by a second
// formatter.
import { message } from "portal/i18n.js";
import { fill } from "./wind-section.js";

/** The caption under the full frise. */
export function planFriseCaption(locale) {
  return message(locale, "planFriseCaption");
}

function blockSentence(locale, block, clock) {
  const values = {
    name: block.label ?? "",
    start: clock(block.start),
    end: clock(block.end),
  };
  if (!Number.isFinite(block.from) || !Number.isFinite(block.to))
    return fill(message(locale, "planFriseBlockPlain"), values);
  const key =
    block.trend === "rises"
      ? "planFriseBlockRises"
      : block.trend === "falls"
        ? "planFriseBlockFalls"
        : "planFriseBlockHeights";
  return fill(message(locale, key), {
    ...values,
    fromDegrees: Math.round(block.from),
    toDegrees: Math.round(block.to),
  });
}

/**
 * The sentence of the full frise: "Frise du plan : M31 de 19:49 à 21:49,
 * monte de 48° à 68° ; … Crépuscule jusqu’à 18:54 et à partir de 04:38.
 * Repères de hauteur à 30° et 60°.". "monte" and "descend" only for
 * `rises` and `falls`; a block with no curve is "M31 de 19:49 à 21:49"
 * alone. `frise` is the result of `planFrise`.
 */
export function planFriseSentence(frise, { locale, clock }) {
  const blocks = frise.blocks.map((block) =>
    blockSentence(locale, block, clock),
  );
  return fill(message(locale, "planFriseFull"), {
    blocks: blocks.join(message(locale, "planFriseBlocksJoin")),
    start: clock(frise.night.start),
    end: clock(frise.night.end),
    first: Math.round(frise.heights[0]?.degrees ?? 0),
    second: Math.round(frise.heights[1]?.degrees ?? 0),
  });
}

/**
 * The sentence of the reduced frise: "Frise réduite : M31, NGC 7000, M33,
 * M45, de 19:49 à 03:49." — two names joined with "puis", three or more
 * with commas.
 */
export function planFriseReducedSentence(frise, { locale, clock }) {
  const names = frise.blocks.map((block) => block.label ?? "");
  const joined =
    names.length === 2
      ? fill(message(locale, "planFriseNamesTwo"), {
          first: names[0],
          second: names[1],
        })
      : names.join(message(locale, "planFriseNamesJoin"));
  const starts = frise.blocks.map((block) => Date.parse(block.start));
  const ends = frise.blocks.map((block) => Date.parse(block.end));
  return fill(message(locale, "planFriseReduced"), {
    names: joined,
    start: clock(new Date(Math.min(...starts)).toISOString()),
    end: clock(new Date(Math.max(...ends)).toISOString()),
  });
}

/**
 * "Nuit choisie de 20:40 à 00:40.": closes the sentence of a frise
 * whose plan chose a night; `""` for the whole night.
 */
export function planFriseSpanSentence(frise, { locale, clock }) {
  if (!frise?.span) return "";
  return fill(message(locale, "planFriseSpanAria"), {
    start: clock(frise.span.start),
    end: clock(frise.span.end),
  });
}

/**
 * "Nuit choisie : 20:40 → 00:40 · 2 cibles au-delà": the line of
 * the plan's card on "Cette nuit"; the part beyond is left out when no
 * target lies there; `""` for the whole night.
 */
export function planFriseSpanLine(frise, { locale, clock }) {
  if (!frise?.span) return "";
  const chosen = fill(message(locale, "planFriseSpanLine"), {
    start: clock(frise.span.start),
    end: clock(frise.span.end),
  });
  const beyond = frise.span.beyond ?? 0;
  return beyond > 0
    ? `${chosen} · ${fill(
        message(
          locale,
          beyond === 1 ? "planFriseSpanBeyondOne" : "planFriseSpanBeyondOther",
        ),
        { count: beyond },
      )}`
    : chosen;
}
