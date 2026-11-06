/**
 * The plan's fields kept with its image (`captures.plan_json`). Apart from
 * `project-integration-repository.js`, which writes the declared lines of a
 * night through the debriefing service (and so loads the night-window
 * computation), so that the capture repository, which `server.mjs` loads
 * through the upload maintenance, reads it without that chain.
 */
export function planCaptureFieldsOf(text) {
  let plan;
  try {
    plan = JSON.parse(text || "null");
  } catch {
    plan = null;
  }
  return {
    combinedNightIds: Array.isArray(plan?.combinedNightIds)
      ? plan.combinedNightIds
      : [],
    totalsByFilter: Array.isArray(plan?.totalsByFilter)
      ? plan.totalsByFilter
      : [],
    render: plan?.render ?? null,
  };
}
