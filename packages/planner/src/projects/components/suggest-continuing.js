import { loadProjects, loadSummaries, multiNightSnapshot } from "./client.js";
import { multiNightView } from "./model.js";

// Optional reader at the existing project extension, in the engine's format.
export function continuingSuggestions({
  projects,
  summaries = {},
  plans,
  today,
}) {
  return projects
    .filter(
      (project) =>
        !project.archivedAt &&
        project.status !== "archived" &&
        project.target?.targetId,
    )
    .flatMap((project) => {
      const { progress } = multiNightView({ project, plans, summaries, today });
      return progress.acquiredMinutes < progress.goalMinutes
        ? [
            {
              id: project.target.targetId,
              acquiredMinutes: progress.acquiredMinutes,
              goalMinutes: progress.goalMinutes,
              projectName: project.target.name || "",
            },
          ]
        : [];
    });
}
export async function loadContinuingSuggestions({ plans, today }) {
  await loadProjects();
  await loadSummaries(plans.map((plan) => plan.id));
  return continuingSuggestions({ ...multiNightSnapshot(), plans, today });
}
