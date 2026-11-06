// Turning the frame in the web framing editor: the "Rotation" tool -- a
// slider from 0 to 359°, a field, "Remettre à 0°" -- and Alt + the wheel over
// the map (1°, 15° with Shift) turn the frame; its caption ends with the
// angle, even at 0°. The angle is N.I.N.A.'s position angle, north towards
// east: on the north-up, east-left map it turns the frame
// counter-clockwise. The web never turns the map itself (its sky engine is not
// driven in roll).
import { normalizeFramingAngle } from "./framings.js";

export { normalizeFramingAngle };

// The step of the wheel, Alt alone and Alt with Shift.
export const framingWheelStepDegrees = 1;
export const framingWheelLargeStepDegrees = 15;

// The angle a saved framing reopens with: its own, 0° without one.
export function framingAngleOf(target) {
  return normalizeFramingAngle(target?.framing?.angleDegrees);
}

// The angle after one notch of the wheel over the map, or `null` when the
// wheel is not turning the frame (no Alt: it zooms, as always). Rolling up
// turns the frame counter-clockwise, as the angle grows; rolling down turns
// it back.
export function framingAngleAfterWheel(angleDegrees, event) {
  if (!event?.altKey) return null;
  const deltaY = Number(event.deltaY) || 0;
  if (deltaY === 0) return null;
  const step = event.shiftKey
    ? framingWheelLargeStepDegrees
    : framingWheelStepDegrees;
  return normalizeFramingAngle(
    Math.round(normalizeFramingAngle(angleDegrees)) +
      (deltaY < 0 ? step : -step),
  );
}

// What the field of the tool holds, as an angle: a whole number of degrees
// brought into [0, 360); `null` while it holds nothing to read.
export function framingAngleFromInput(value) {
  const text = String(value ?? "")
    .replace("°", "")
    .replace(",", ".")
    .trim();
  if (!text) return null;
  const number = Number(text);
  if (!Number.isFinite(number)) return null;
  return normalizeFramingAngle(Math.round(number));
}

// The frame's caption with its angle: "1,39° × 1,04° · 30°". A whole
// number of degrees.
export function framingCaptionWithAngle(caption, angleDegrees) {
  if (!caption) return caption;
  return `${caption} · ${Math.round(normalizeFramingAngle(angleDegrees)) % 360}°`;
}

// The CSS turn of the frame layer: CSS `rotate()` turns clockwise, the angle
// counter-clockwise. `undefined` while the frame is straight, so a 0° frame is
// drawn exactly as it always was.
export function framingTurnStyle(angleDegrees) {
  const angle = normalizeFramingAngle(angleDegrees);
  if (!angle) return undefined;
  return {
    "--planner-frame-turn": `${-angle}deg`,
    "--planner-frame-turn-back": `${angle}deg`,
  };
}

// Half the height of the box a `pixelWidth` x `pixelHeight` frame fills once
// turned: the captions stay horizontal, above and below it.
export function turnedFrameHalfHeight(pixelWidth, pixelHeight, angleDegrees) {
  const radians = (normalizeFramingAngle(angleDegrees) * Math.PI) / 180;
  const width = Number(pixelWidth) || 0;
  const height = Number(pixelHeight) || 0;
  return (
    (width * Math.abs(Math.sin(radians)) +
      height * Math.abs(Math.cos(radians))) /
    2
  );
}
