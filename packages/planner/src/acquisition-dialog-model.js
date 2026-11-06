// What the dialog "Paramètres de la pose" is opened with ("Prise de vue par
// cible"): the model of `AcquisitionDialog`, whichever screen opens it —
// the card or the interval editor of the planner's active plan, step 2, the
// dialog of a plan of the library. Kept apart from the component so it is
// tested without rendering.
import { message } from "portal/i18n.js";
import { durationText } from "portal/written-forms.js";
import {
  acquisitionExampleItem,
  acquisitionItemView,
  chosenDefaults,
  chosenLineOf,
} from "./acquisition-reading.js";
import { fill } from "./wind-section.js";

/**
 * The model for one target (G1).
 *
 * @param {object} input
 * @param {string} input.locale
 * @param {object} input.basis the `acquisitionBasisOf` of the plan.
 * @param {string} input.itemId the plan item.
 * @param {boolean} input.editable the plan can still be changed.
 * @param {string} input.targetName the name quoted in the dialog.
 * @param {string | null} [input.slot] "20:59 → 22:19", in the place's time.
 * @param {number | null} [input.minutes] the length of the slot.
 * @param {(itemId: string, line: object | null) => void} input.writeItemLine
 */
export function targetDialogModel({
  locale,
  basis,
  itemId,
  editable,
  targetName,
  slot = null,
  minutes = null,
  writeItemLine,
}) {
  const item = (basis.plan.items ?? []).find(
    (entry) => String(entry?.id) === String(itemId),
  );
  if (!item) return null;
  const view = acquisitionItemView(basis, item);
  const frozen = Boolean(view?.frozen);
  return {
    scope: "target",
    basis,
    item,
    targetName,
    subtitle: slot
      ? fill(message(locale, "acqSheetTargetSubtitle"), {
          target: targetName,
          slot,
          duration: Number.isFinite(minutes)
            ? durationText(minutes, locale)
            : "",
        })
      : fill(message(locale, "acqSheetTargetNoSlotSubtitle"), {
          target: targetName,
        }),
    initial: frozen ? view.frozenLine : chosenLineOf(item),
    readOnly: frozen || !editable,
    frozen,
    onUse: (line) => writeItemLine(String(item.id), line),
  };
}

/**
 * The model for the whole plan (G2): the plan's defaults, the suggestions
 * quoted for its first target.
 *
 * @param {object} input
 * @param {string} input.locale
 * @param {object} input.basis
 * @param {boolean} input.editable
 * @param {(item: object) => string} input.nameOf the name of a target.
 * @param {string} input.planName
 * @param {(line: object | null) => void} input.writeDefaults
 */
export function planDialogModel({
  locale,
  basis,
  editable,
  nameOf,
  planName,
  writeDefaults,
}) {
  const example = acquisitionExampleItem(basis.plan);
  return {
    scope: "plan",
    basis,
    item: example,
    targetName: example ? nameOf(example) : "",
    subtitle: fill(message(locale, "acqSheetPlanSubtitle"), {
      plan: planName,
    }),
    initial: chosenDefaults(basis.plan),
    readOnly: !editable,
    frozen: false,
    onUse: (line) => writeDefaults(line),
  };
}
