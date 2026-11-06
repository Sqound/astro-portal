import { PlannerSurface } from "planner/components/PlannerSurface.js";
import { currentPortalSession } from "../../../lib/debrief.server.js";
import {
  plannerCapabilitiesForSession,
  plannerReadOnlyWindowForSession,
} from "../../../lib/planner-capabilities.server.js";
import { staticDataDocument } from "../../../lib/static-data.server.js";
import { pageMetadata } from "../../../lib/page-title.server.js";

// The browser title of the page (the locale layout carries the gallery's).
export const generateMetadata = pageMetadata("pageTitlePlanner");

/**
 * The planner page (`/<locale>/planner`): the open core's planner, with the
 * person's capabilities and the reference data it starts from. A
 * composition may draw it through its own surface (`Planner`); the
 * open-source composition draws the core's `PlannerSurface`.
 * `extraProps({ locale })` lets it hand the surface more properties read per
 * request; the core reads nothing of them.
 */
export function createPlannerPage({
  Planner = PlannerSurface,
  extraProps = null,
} = {}) {
  return async function Page(props) {
    return renderPlanner(Planner, props, extraProps);
  };
}

export default createPlannerPage();

async function renderPlanner(Planner, { params }, extraProps) {
  const { locale } = await params;
  const extra = extraProps ? await extraProps({ locale }) : null;
  // The person's real capabilities: a private server's open-source profile,
  // or those a registered provider gives the person (the free account's for a
  // visitor).
  const session = await currentPortalSession();
  const capabilities = await plannerCapabilitiesForSession(session);
  // The read-only window of an ended subscription
  // keeps what the person created visible, the multi-night plans included.
  const readOnlyWindow = await plannerReadOnlyWindowForSession(session);
  const [
    instanceSettings,
    taxonomy,
    plannerTargets,
    plannerEquipment,
    plannerPlanets,
  ] = await Promise.all([
    staticDataDocument("instance-settings"),
    staticDataDocument("reference-taxonomy"),
    staticDataDocument("planner-curated-targets"),
    staticDataDocument("planner-equipment-presets"),
    staticDataDocument("planner-planets"),
  ]);
  return (
    <Planner
      capabilities={capabilities}
      {...extra}
      readOnlyWindow={readOnlyWindow}
      locale={locale}
      initialization={{
        instanceSettings: instanceSettings?.payload || null,
        taxonomy: taxonomy?.payload || null,
        plannerTargets: plannerTargets?.payload || null,
        plannerEquipment: plannerEquipment?.payload || null,
        plannerPlanets: plannerPlanets?.payload || null,
      }}
    />
  );
}
