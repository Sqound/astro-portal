// Shared target reasons, free-slot details and applied notices.
import { message } from "portal/i18n.js";
import { autoFillRule } from "./auto-fill.js";
import { fillMessage } from "./night-span-copy.js";
import { clock } from "./wind-section.js";
const say = (locale, key, values) => fillMessage(message(locale, key), values);

// "IC 1396" and "Trompe d’éléphant": the designation, then the common
// name (a catalogue title already written "M31 — Galaxie d’Andromède" gives
// its name once).
export function autoFillTargetName(target) {
  const designation = String(target?.designation || "").trim();
  let title = String(target?.title || "").trim();
  for (const separator of [" — ", " - ", " · "])
    if (designation && title.startsWith(`${designation}${separator}`))
      title = title.slice(designation.length + separator.length).trim();
  if (designation && title && designation !== title)
    return { designation, common: title };
  return {
    designation: designation || title || String(target?.id || ""),
    common: "",
  };
}

// The sentence of a proposed target's reason (`autoFillNight`'s `reason`).
export function autoFillItemReason(reason, { locale, timeZone } = {}) {
  const time = (value) => clock(value, locale, timeZone);
  switch (reason?.kind) {
    case "culmination-before-dew":
      return say(locale, "autoFillReasonBeforeDew", {
        time: time(reason.time),
      });
    case "meridian":
      return say(locale, "autoFillReasonMeridian", { time: time(reason.time) });
    case "high-from-dusk":
      return say(
        locale,
        reason.dualBand
          ? "autoFillReasonHighFromDuskDual"
          : "autoFillReasonHighFromDusk",
      );
    case "follows":
      return say(locale, "autoFillReasonFollows", {
        altitude: reason.altitude,
      });
    default:
      return say(locale, "autoFillReasonBestWindow", {
        altitude: reason?.altitude,
      });
  }
}

const freeReasonKeys = Object.freeze({
  dew: "autoFillFreeDew",
  clouds: "autoFillFreeClouds",
  moon: "autoFillFreeMoon",
  "no-target": "autoFillFreeNoTarget",
  nothing: "autoFillFreeNothing",
  limit: "autoFillFreeLimit",
  short: "autoFillFreeShort",
  // "Rapproché": where the chain stopped.
  "no-follower": "autoFillFreeNoFollower",
});

// "rien de satisfaisant, rosée probable": why a free slot is empty.
export function autoFillFreeReason(reason, { locale } = {}) {
  return say(locale, freeReasonKeys[reason?.kind] || freeReasonKeys.nothing, {
    max: autoFillRule.maximumTargets,
    minutes: reason?.wait ?? autoFillRule.chainedWaitMaximumMinutes,
  });
}

// "02:50 → 04:31 : rien de satisfaisant, rosée probable"
export function autoFillFreeLine(slot, { locale, timeZone } = {}) {
  return say(locale, "autoFillFreeLine", {
    start: clock(slot.start, locale, timeZone),
    end: clock(slot.end, locale, timeZone),
    reason: autoFillFreeReason(slot.reason, { locale }),
  });
}

// "2 cibles ajoutées au plan."
export function autoFillAppliedNotice(count, locale) {
  return count === 1
    ? say(locale, "autoFillAppliedOne")
    : say(locale, "autoFillAppliedMany", { count });
}
