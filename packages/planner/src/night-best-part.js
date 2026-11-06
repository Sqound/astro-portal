// The best estimated part of the
// night. It is
// `nightStory`'s ideal slot (`_idealSlot`, unchanged: the longest run of hours
// scored 64 or more, two hours at least, never 90 % of the night); without
// one, why: `whole` (the whole night already is the best part), `none` (no
// run of two hours at 64 or more) or `noForecast`.
import {
  nightStory,
  nightStoryIdealHiddenShare,
  nightStoryQualityBounds,
} from "portal/night-story.js";

const instant = (value) =>
  typeof value === "number" ? value : Date.parse(value ?? "");

/** `{ start, end }` (ISO) or `{ block }`. */
export function nightBestPart({ hours = [], darkStart, darkEnd }) {
  const from = instant(darkStart);
  const to = instant(darkEnd);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from)
    return { block: "noForecast" };
  const inside = (hours || []).filter((hour) => {
    const time = instant(hour?.time);
    return (
      Number.isFinite(time) &&
      time >= from &&
      time <= to &&
      Number.isFinite(hour?.score)
    );
  });
  if (!inside.length) return { block: "noForecast" };
  const ideal = nightStory({
    hours: inside,
    night: {
      start: new Date(from).toISOString(),
      end: new Date(to).toISOString(),
    },
  }).ideal;
  if (ideal?.start && ideal?.end) return { start: ideal.start, end: ideal.end };
  let best = 0;
  let run = 0;
  for (const hour of inside) {
    run = hour.score >= nightStoryQualityBounds.good ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return {
    block:
      (best * 3600000) / (to - from) >= nightStoryIdealHiddenShare
        ? "whole"
        : "none",
  };
}
