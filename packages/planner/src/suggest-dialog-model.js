import { suggestMessage } from "./suggest-messages.js";
import { message } from "portal/i18n.js";
import { durationText } from "portal/written-forms.js";
import {
  autoFillTargetName,
  autoFillItemReason,
  autoFillFreeLine,
} from "./auto-fill-copy.js";
import { clock } from "./wind-section.js";
import { previousSky } from "./suggestion-ranking.js";

export const suggestionCount = (value) => Math.max(1, Math.min(20, value));
// What the dialog opens on, by the plan's mode: the count (8 in visual, 3 in
// photo) and the placement — "Rapproché" (`chained`) in visual,
// where one rarely waits three hours to observe again, "Idéal" (`ideal`,
// today's computation) in photo. The proposal a page computes before the
// dialog opens is made with it, so the dialog never opens on one placement
// and recomputes to the other.
export const suggestionDefaults = (visual) => ({
  count: visual ? 8 : 3,
  segments: visual ? [5, 8, 12] : [2, 3, 4],
  placement: visual ? "chained" : "ideal",
});
export const suggestionPlacements = Object.freeze(["ideal", "chained"]);

// Why the dialog has nothing to propose. The
// cause decides the sentence and the one gesture that leads somewhere — the
// next night, or the plan that fills this one — never a button that closes
// the dialog on the page it came from. Pure, in minutes.
//
// - `nightEnding`: the night that is running ends before one target fits (the
//   window starts after the start of the night);
// - `nightShort`: the night taken whole is shorter than one target;
// - `planFull`: enough night, the plan(s) hold it;
// - `takenByOtherPlans`: time, and the targets that could be
//   placed are all held by the other plans of the night, of the same nature
//   (photo with photo, visual with visual); it comes after `planFull`;
// - `noTarget`: time, and no target (Moon, horizon, minimum altitude).
export function suggestNothingState({
  windowMinutes,
  windowStartMinute,
  freeMinutes,
  minimumMinutes,
  hasPlans,
  takenByOtherPlans = false,
  // SUGGEST-FILTERS-01: filters of the suggestions are in use; they come
  // first (a period that is over leaves an empty window), after a plan that
  // fills the night.
  filtered = false,
}) {
  const window = Math.max(0, windowMinutes);
  if (filtered && !(hasPlans && freeMinutes < minimumMinutes && window > 0))
    return { cause: "filters", minutes: window };
  if (window < minimumMinutes)
    return {
      cause: windowStartMinute > 0 ? "nightEnding" : "nightShort",
      minutes: window,
    };
  if (hasPlans && freeMinutes < minimumMinutes)
    return { cause: "planFull", minutes: Math.max(0, freeMinutes) };
  if (takenByOtherPlans) return { cause: "takenByOtherPlans", minutes: window };
  return { cause: "noTarget", minutes: window };
}

// The ISO day after `isoDate`, on the calendar day alone: a night's date is the
// evening's, written without a time zone. `null` when it is not a date.
export function nextNightDate(isoDate) {
  const day = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(day.getTime())) return null;
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

// A change of count waits this long for the
// next one before the list is recomputed.
export const SUGGEST_RECOMPUTE_DELAY = 250;

// "Rapproché": the ticked targets are chained again at every tick (the
// request of the chain over the ticked ones, pure and at once), so that the
// hours the dialog shows are the hours it adds.
export function suggestChainRequest({ proposal, selected, tier = 1 }) {
  const ids = proposal.items
    .map((entry) => entry.target.id)
    .filter((id) => selected.has(id));
  return {
    count: ids.length,
    only: ids,
    tier,
    placement: "chained",
  };
}

// The request of another placement; `count` is the count asked for, so that a
// shortfall still reads against it. "Idéal": the same targets, the
// ticked ones staying ticked, their slots made again. "Rapproché": a
// chain made again from the pool (the targets "Idéal" spread over the night
// cannot follow one another within 10 min), without the unticked ones.
export function suggestPlacementRequest({
  proposal,
  count,
  tier = 1,
  placement,
  selected = null,
  excludeCaptured = false,
}) {
  if (placement === "chained")
    return {
      count,
      excluded: proposal.items
        .map((entry) => entry.target.id)
        .filter((id) => selected && !selected.has(id)),
      excludeCaptured,
      tier,
      placement,
    };
  return {
    count,
    only: proposal.items.map((entry) => entry.target.id),
    tier,
    placement,
  };
}

// The entries as the dialog shows them: in "Rapproché" a ticked
// target stands at the slot, with the score and the reason, of the chain over
// the ticked targets; an unticked one is as it was. The list is "Dans l'ordre
// de la nuit": once the chain is made again the proposal's own order is no
// longer the night's (the ticked ones moved, the unticked ones did not), so
// the entries — and with them the numbers of the list and of the timeline —
// follow the hours of their slots, the proposal's order breaking ties.
export function suggestShownItems({ proposal, chain, selected, placement }) {
  if (placement !== "chained" || !chain) return proposal.items;
  const chained = new Map(chain.items.map((entry) => [entry.target.id, entry]));
  return proposal.items
    .map((entry, index) => ({
      index,
      entry:
        selected.has(entry.target.id) && chained.has(entry.target.id)
          ? { ...entry, ...chained.get(entry.target.id) }
          : entry,
    }))
    .sort(
      (a, b) =>
        (a.entry.startMinute ?? 0) - (b.entry.startMinute ?? 0) ||
        a.index - b.index,
    )
    .map(({ entry }) => entry);
}

// The request of a new count: the ticked targets stay ticked, keeping their
// places (the rule of "En proposer d'autres"), and the count is filled
// around them; asked for fewer than are ticked, a list made again.
export function suggestRecountRequest({
  proposal,
  selected,
  count,
  excludeCaptured = false,
  tier = 1,
  placement = "ideal",
  chain = null,
}) {
  const ticked = suggestShownItems({
    proposal,
    chain,
    selected,
    placement,
  }).filter((entry) => selected.has(entry.target.id));
  const keep = count === "all" || ticked.length <= count;
  return {
    count,
    kept: keep ? ticked : [],
    excluded: [],
    excludeCaptured,
    tier,
    placement,
  };
}

// The numbers the mini-frise writes. With a dozen targets the boxes are
// narrower than a two-digit number and the numbers ran into one another: a
// number is written only if it stays clear of the one written before it
// (`SUGGEST_NUMBER_GAP` between them), the rest are left out — the rule the
// frise already has for its times, thinned until they stop touching — while the
// boxes, the list and the label keep every number. `centre(entry)` is the x of
// the middle of a box in the drawing; a digit of the 12 px bold figures takes
// `SUGGEST_DIGIT_WIDTH`. Returns the rectangles [number, left, right], left to
// right.
export const SUGGEST_DIGIT_WIDTH = 7.5;
export const SUGGEST_NUMBER_GAP = 2;
export function suggestTimelineNumbers(entries, centre) {
  const labels = [];
  let lastRight = -Infinity;
  for (const entry of [...entries].sort(
    (a, b) => a.startMinute - b.startMinute,
  )) {
    const width = String(entry.number).length * SUGGEST_DIGIT_WIDTH;
    const left = centre(entry) - width / 2;
    if (left < lastRight + SUGGEST_NUMBER_GAP) continue;
    lastRight = left + width;
    labels.push({ number: entry.number, left, right: left + width });
  }
  return labels;
}

// The times the mini-frise writes under the night. A time is written only if
// it stays clear (`SUGGEST_TIME_GAP` px) of the one written before it, and the
// last one of the night is always written: when it is too close to the one
// before, that one gives way — the two ends of a short last stretch ("04:00"
// and "04:14") never print on top of each other. `at(tick)` is the x of a tick
// in the drawing, already held inside the frame. Returns the ticks to write.
export const SUGGEST_TIME_GAP = 40;
export function suggestVisibleTicks(ticks, at, gap = SUGGEST_TIME_GAP) {
  if (ticks.length < 3) return [...ticks];
  const last = ticks[ticks.length - 1];
  const kept = [ticks[0]];
  for (const tick of ticks.slice(1, -1))
    if (
      at(tick) - at(kept[kept.length - 1]) >= gap &&
      at(last) - at(tick) >= gap
    )
      kept.push(tick);
  while (kept.length > 1 && at(last) - at(kept[kept.length - 1]) < gap)
    kept.pop();
  kept.push(last);
  return kept;
}

// The line of a target already done, "M31, faite le 12 sept. sous un
// ciel moins bon que ce soir." — the three forms by the skies' notes, the
// date alone when a note is unknown; empty for a target with no last time and
// for one of the continuing group, which says its progress instead.
const previousForms = { worse: "Worse", same: "Same", better: "Better" };
export function suggestPreviousLine({ entry, visual, locale }) {
  const previous = entry.previous;
  if (!previous || entry.group === "continue") return "";
  const moment = new Date(`${previous.date}T12:00:00Z`);
  const day = Number.isNaN(moment.getTime())
    ? ""
    : new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }).format(moment);
  const form = previousForms[previousSky(previous)];
  return suggestMessage(
    locale,
    `suggestPrevious${visual ? "Visual" : "Photo"}${form ?? "Date"}`,
    {
      name: autoFillTargetName(entry.target).designation,
      // The date ends the date-only sentence: an abbreviated month's own full
      // stop ("12 sept.") is not written twice.
      date: form ? day : day.replace(/\.$/, ""),
    },
  );
}

// A drawing model only: toggling leaves each proposed start/end untouched.
export function suggestDialogModel({
  proposal,
  selected,
  locale,
  timeZone,
  visual = false,
  placement = "ideal",
  chain = null,
  planCount = 0,
  filtered = false,
}) {
  const say = (key, values) => suggestMessage(locale, key, values);
  const duration = (minutes) =>
    durationText(minutes, locale).replaceAll("\u00a0", " ");
  const time = (value) => clock(value, locale, timeZone);
  const chosen = (entry) => selected.has(entry.target.id);
  // "Rapproché": the chain over the ticked targets is drawn, its own free
  // time with it; an unticked target has no slot left (its number stays).
  const chained = placement === "chained" && Boolean(chain);
  const shown = suggestShownItems({ proposal, chain, selected, placement });
  const items = shown.map((entry, index) => ({
    ...entry,
    number: index + 1,
    name: autoFillTargetName(entry.target),
    reasonText: autoFillItemReason(entry.reason, { locale, timeZone }),
    previousText: suggestPreviousLine({ entry, visual, locale }),
    windowText: `${time(entry.start)} → ${time(entry.end)}`,
    // SUGGEST-FILTERS-01: the mask ignored, the stretch of its slot behind it.
    maskHiddenText: entry.maskHidden
      ? message(locale, "horizonPathMaskedBetween")
          .replace("{start}", time(entry.maskHidden.start))
          .replace("{end}", time(entry.maskHidden.end))
          // The hour held to the word before it.
          .replace(
            ` ${time(entry.maskHidden.end)}`,
            `\u00a0${time(entry.maskHidden.end)}`,
          )
      : null,
    selected: chosen(entry),
  }));
  const free = [
    ...(chained ? chain.free : proposal.free),
    ...(chained ? [] : proposal.items.filter((entry) => !chosen(entry))),
  ]
    .sort((a, b) => a.startMinute - b.startMinute)
    .reduce((slots, slot) => {
      const previous = slots.at(-1);
      if (previous && previous.endMinute >= slot.startMinute) {
        previous.endMinute = Math.max(previous.endMinute, slot.endMinute);
        previous.end =
          previous.endMinute === slot.endMinute ? slot.end : previous.end;
      } else slots.push({ ...slot });
      return slots;
    }, []);
  const available = proposal.imagingMinutes + proposal.freeMinutes;
  const minimum = visual ? 20 : 45;
  const nothingState = suggestNothingState({
    windowMinutes: proposal.window.endMinute - proposal.window.startMinute,
    windowStartMinute: proposal.window.startMinute,
    freeMinutes: available,
    minimumMinutes: minimum,
    hasPlans: planCount > 0,
    takenByOtherPlans: proposal.takenByOtherPlans === true,
    filtered,
  });
  const nothingTitle =
    nothingState.cause === "filters"
      ? message(locale, "suggestFiltersEmpty")
      : say(
          {
            nightEnding: "suggestNightEnding",
            nightShort: "suggestNightShort",
            planFull: "suggestPlanFull",
            takenByOtherPlans: "suggestTakenByOtherPlans",
            noTarget: "suggestNoTarget",
          }[nothingState.cause],
          { duration: duration(nothingState.minutes) },
        );
  const nothingDetail =
    nothingState.cause === "filters"
      ? message(locale, "suggestFiltersEmptyHint")
      : nothingState.cause === "planFull"
        ? say("suggestPlanFullDetail", { minimum: duration(minimum) })
        : nothingState.cause === "takenByOtherPlans"
          ? say("suggestTakenByOtherPlansDetail")
          : nothingState.cause === "noTarget"
            ? say("suggestNoTargetDetail")
            : "";
  const estimate = say(
    visual ? "suggestEstimateVisual" : "suggestEstimatePhoto",
    {
      count: proposal.estimate.count,
      duration: duration(proposal.estimate.slotMinutes),
    },
  );
  const estimateDetail = say(
    visual ? "suggestEstimateDetailVisual" : "suggestEstimateDetailPhoto",
    {
      free: duration(available),
      duration: duration(proposal.estimate.slotMinutes),
    },
  );
  const reason = proposal.shortfall;
  const shortfallReason = reason
    ? reason.kind === "no-follower"
      ? // "Rapproché": the chain stopped, nothing following within
        // the wait.
        say("suggestAfterNoFollower", {
          time: time(reason.start),
          minutes: reason.wait,
        })
      : ["dew", "clouds", "moon"].includes(reason.kind)
        ? say(
            {
              dew: "suggestAfterDew",
              clouds: "suggestAfterClouds",
              moon: "suggestAfterMoon",
            }[reason.kind],
            { time: time(reason.start) },
          )
        : say(
            reason.kind === "short"
              ? "suggestTooShort"
              : reason.kind === "no-target"
                ? "suggestNoAltitude"
                : "suggestExhausted",
          )
    : "";
  return {
    items,
    free,
    duration,
    estimate,
    estimateDetail,
    available,
    minimum,
    nothingCause: nothingState.cause,
    nothingTitle,
    nothingDetail,
    shortfallReason,
    shortfallDetail: proposal.free.map((slot) =>
      autoFillFreeLine(slot, { locale, timeZone }),
    ),
    timelineTicks: Array.from(
      new Map([
        [proposal.window.startMinute, time(proposal.window.start)],
        ...items
          .filter((entry) => !chained || entry.selected)
          .flatMap((entry) => [
            [entry.startMinute, time(entry.start)],
            [entry.endMinute, time(entry.end)],
          ]),
        ...free.flatMap((slot) => [
          [slot.startMinute, time(slot.start)],
          [slot.endMinute, time(slot.end)],
        ]),
        [proposal.window.endMinute, time(proposal.window.end)],
      ]).entries(),
    )
      .map(([minute, label]) => ({ minute, label }))
      .sort((a, b) => a.minute - b.minute),
    timelineLabel: say("suggestTimelineLabel", {
      items: [
        ...items.map((entry) =>
          entry.selected
            ? `${entry.number} ${entry.name.designation}`
            : say("suggestUnticked", { name: entry.name.designation }),
        ),
        ...free.map((slot) =>
          say("suggestFree", { from: time(slot.start), to: time(slot.end) }),
        ),
      ].join(" ; "),
    }),
  };
}
