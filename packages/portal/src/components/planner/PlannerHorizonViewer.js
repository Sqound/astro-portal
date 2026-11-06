"use client";
import { PlannerHorizonEditor } from "./PlannerHorizonEditor.js";
import { plannerFlowMessage as flow } from "../../planner/flow-messages.js";
import { WebDialog } from "../dialog/WebDialog.js";

// The shared web dialog shell (`WebDialog`) opens, stacks and closes this,
// and hands the focus back to the button that opened it.
export function PlannerHorizonViewer({ locale, place, onClose }) {
  return (
    <WebDialog
      className="planner-place-dialog planner-horizon-viewer"
      closeLabel={flow(locale, "close")}
      closeOnBackdrop
      eyebrow={flow(locale, "viewHorizon")}
      onClose={onClose}
      title={place.name || flow(locale, "position")}
    >
      <PlannerHorizonEditor locale={locale} mask={place.horizonMask} readOnly />
    </WebDialog>
  );
}
