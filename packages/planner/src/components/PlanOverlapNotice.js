"use client";

import { useId, useState } from "react";
import { message } from "portal/i18n.js";
import { plannerFlowMessage as flow } from "portal/planner/flow-messages.js";

// The notice of a plan whose targets overlap, under the timeline's count line:
// "Des cibles se chevauchent", the count with the pairs folded behind "Voir le
// détail", then the buttons stacked, the strongest first — "Répartir les
// cibles" the primary (the targets are put one after the other, each in its
// window of visibility), "Modifier le plan" its secondary (the planner's own
// timeline, at the first pair), "Valider sans pouvoir lancer" a tertiary (the
// plan is kept as it is: the notice goes, the count stays on the timeline).
// When nothing can be spread (every target is without a window of visibility)
// "Modifier le plan" is the primary and "Valider sans pouvoir lancer" its
// secondary. A plan that cannot be edited shows the count and the pairs only.
export function PlanOverlapNotice({
  locale,
  overlaps,
  nameOf,
  clock,
  canSpread,
  editable,
  onSpread,
  onEdit,
  onKeep,
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const count = overlaps.length;
  const countLabel = message(
    locale,
    count === 1 ? "plannerTimelineOverlapOne" : "plannerTimelineOverlapOther",
  ).replace("{count}", String(count));
  const body =
    canSpread && editable
      ? flow(locale, "overlapBodySpread")
      : flow(locale, count === 1 ? "overlapBodyOne" : "overlapBodyOther");
  return (
    <div
      className="planner-plan-review planner-plan-overlap"
      data-testid="planner-plan-overlap"
      role="status"
    >
      <strong className="planner-plan-overlap-title">
        {flow(locale, "overlapTitle")}
      </strong>
      <p>{body}</p>
      <div className="planner-plan-overlap-count">
        <span data-testid="planner-plan-overlap-count">{countLabel}</span>
        <button
          className="btn-link"
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          data-testid="planner-plan-overlap-toggle"
          onClick={() => setOpen((current) => !current)}
        >
          {flow(locale, open ? "overlapDetailHide" : "overlapDetailShow")}
        </button>
      </div>
      {open && (
        <ul id={listId} className="planner-plan-overlap-pairs">
          {overlaps.map((overlap) => (
            <li
              key={`${overlap.firstId}-${overlap.secondId}`}
              data-testid="planner-plan-overlap-pair"
            >
              {flow(locale, "overlapPair")
                .replace("{first}", nameOf(overlap.firstId))
                .replace("{second}", nameOf(overlap.secondId))
                .replace("{start}", clock(overlap.start))
                .replace("{end}", clock(overlap.end))}
            </li>
          ))}
        </ul>
      )}
      <p className="planner-plan-overlap-consequence">
        {flow(locale, "overlapLaunch")}
      </p>
      {editable && (
        // The buttons are a zone of their own: the
        // « Voir le détail » link above belongs to the reading. Two shapes,
        // each with its levels spelled out: the spread, the edit and the keep
        // in three levels; with nothing to spread, the edit and the keep.
        <footer className="planner-plan-overlap-actions">
          {canSpread ? (
            <>
              <button
                className="btn-primary"
                type="button"
                data-testid="planner-plan-overlap-spread"
                onClick={onSpread}
              >
                {flow(locale, "overlapSpread")}
              </button>
              <button
                className="btn-secondary"
                type="button"
                data-testid="planner-plan-overlap-edit"
                onClick={onEdit}
              >
                {message(locale, "plannerEditPlan")}
              </button>
              <button
                className="btn-tertiary"
                type="button"
                data-testid="planner-plan-overlap-keep"
                onClick={onKeep}
              >
                {flow(locale, "overlapKeep")}
              </button>
            </>
          ) : (
            <>
              <button
                className="btn-primary"
                type="button"
                data-testid="planner-plan-overlap-edit"
                onClick={onEdit}
              >
                {message(locale, "plannerEditPlan")}
              </button>
              <button
                className="btn-secondary"
                type="button"
                data-testid="planner-plan-overlap-keep"
                onClick={onKeep}
              >
                {flow(locale, "overlapKeep")}
              </button>
            </>
          )}
        </footer>
      )}
    </div>
  );
}
