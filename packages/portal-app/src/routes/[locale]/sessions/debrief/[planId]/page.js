import { notFound } from "next/navigation";
import { DebriefSurface } from "planner/components/DebriefSurface.js";
import { planTargetIds } from "planner/plan-target-pictures.js";
import { targetPicturesOf } from "../../../../../lib/target-pictures.server.js";
import { debriefContextForCurrentUser } from "../../../../../lib/debrief.server.js";
import { pageMetadata } from "../../../../../lib/page-title.server.js";

// The browser title of the page (the locale layout carries the gallery's).
export const generateMetadata = pageMetadata("debriefScreenTitle");

/**
 * The debriefing of one plan, the first moment of its session, under a stable
 * route of its own so a queue entry, a bookmark or a shared link all resolve
 * the same way. `debriefContextForCurrentUser` reads
 * the plan directly (not only through the queue), so this still renders for a
 * plan that has already left the queue — see DebriefScreen.js's own "already
 * debriefed" branch.
 *
 * A composition may draw it through its own surface (`Debrief`), the way it
 * does the planner and account pages.
 */
export function createDebriefPlanPage({ Debrief = DebriefSurface } = {}) {
  return async function DebriefPlanPage({ params }) {
    const { locale, planId } = await params;
    const context = await debriefContextForCurrentUser(planId);
    if (!context) notFound();
    // The catalogue's picture of each target of the plan, read here, once.
    const items = context.plan?.payload?.items ?? [];
    const pictures = await targetPicturesOf(
      [
        ...planTargetIds(context.plan?.payload),
        ...items.map((item) => item?.targetId),
      ],
      locale,
    );
    return (
      <Debrief
        locale={locale}
        planId={planId}
        plan={context.plan}
        queueEntry={context.queueEntry}
        summaryInput={context.summaryInput}
        spacePlaces={context.spacePlaces ?? []}
        pictures={pictures}
      />
    );
  };
}

export default createDebriefPlanPage();
