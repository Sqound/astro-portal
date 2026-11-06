// The sentence of the advice on a magnification (`magnification-advice.js`):
// what a person reads under the equipment's magnification when it goes past
// what the telescope can show, or `null` when all is well.
import { message } from "portal/i18n.js";
import { magnificationAdvice } from "./magnification-advice.js";
import { fillMessage } from "./night-span-copy.js";

const keys = {
  "near-limit": "plannerMagnificationAdviceNearLimit",
  beyond: "plannerMagnificationAdviceBeyond",
  "far-beyond": "plannerMagnificationAdviceFarBeyond",
  "low-power": "plannerMagnificationAdviceLowPower",
};

const number = (value, locale, digits) =>
  new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

/**
 * The advice for `magnification` through a telescope of `apertureMm`, in
 * `locale`, or `null` (nothing to say, or a missing value).
 */
export function magnificationAdviceLine(locale, apertureMm, magnification) {
  const advice = magnificationAdvice(apertureMm, magnification);
  const key = advice ? keys[advice.level] : null;
  if (!key) return null;
  return fillMessage(message(locale, key), {
    max: number(advice.usefulMaxMagnification, locale, 0),
    pupil: number(advice.exitPupilMm, locale, 1),
  });
}
