// The draft of the dialog "Paramètres de la pose" ("Prise de vue par
// cible"): what the fields hold as text and chips, the line they make, and
// which of them the contract would refuse. Kept apart from the component so
// it is tested without rendering.
import {
  exposureFromText,
  exposureIsValid,
  exposureToText,
  lineIsEmpty,
} from "./acquisition-edit.js";
import { acquisitionLimits } from "./plan-acquisition.js";

export const emptyDraft = {
  exposure: "",
  gainNamed: null,
  gainOther: false,
  gain: "",
  filter: "advised",
  filterName: null,
  binning: null,
  frames: "",
};

export function draftOf(line, basis) {
  const draft = { ...emptyDraft };
  if (!line) return draft;
  draft.exposure = exposureToText(line.exposureSeconds);
  if (Object.hasOwn(line, "gain")) {
    const gain = line.gain;
    const named =
      gain !== null &&
      basis.gainChoices.some((choice) => choice.value === gain);
    if (named) draft.gainNamed = gain;
    else {
      draft.gainOther = true;
      draft.gain = gain === null ? "" : String(gain);
    }
  }
  if (Object.hasOwn(line, "filter")) {
    draft.filterName = line.filter;
    draft.filter = line.filter === null ? "none" : "named";
  }
  draft.binning = line.binning ?? null;
  draft.frames = line.frameCount === undefined ? "" : String(line.frameCount);
  return draft;
}

const integerOf = (text) => {
  const clean = String(text).trim();
  return /^-?\d+$/.test(clean) ? Number(clean) : null;
};

export function problems(draft) {
  const exposure = exposureFromText(draft.exposure);
  const gain = draft.gain.trim();
  const frames = draft.frames.trim();
  return {
    exposure: draft.exposure.trim() !== "" && !exposureIsValid(exposure),
    gain:
      draft.gainOther &&
      gain !== "" &&
      !(
        integerOf(gain) !== null &&
        integerOf(gain) >= acquisitionLimits.gainMin &&
        integerOf(gain) <= acquisitionLimits.gainMax
      ),
    frames:
      frames !== "" &&
      !(
        integerOf(frames) !== null &&
        integerOf(frames) >= 1 &&
        integerOf(frames) <= acquisitionLimits.frameCountMax
      ),
  };
}

/** The draft as a line; `null` when nothing is chosen. */
export function lineOf(draft, { withFrames = true } = {}) {
  const bad = problems(draft);
  const line = {};
  if (draft.filter !== "advised")
    line.filter = draft.filter === "named" ? draft.filterName : null;
  if (draft.exposure.trim() !== "" && !bad.exposure)
    line.exposureSeconds = exposureFromText(draft.exposure);
  if (draft.gainNamed !== null || draft.gainOther)
    line.gain =
      draft.gainNamed !== null
        ? draft.gainNamed
        : bad.gain || draft.gain.trim() === ""
          ? null
          : integerOf(draft.gain);
  if (draft.binning !== null) line.binning = draft.binning;
  if (withFrames && draft.frames.trim() !== "" && !bad.frames)
    line.frameCount = integerOf(draft.frames);
  return lineIsEmpty(line) ? null : line;
}
