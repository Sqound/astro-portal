import { nightsCumulative } from "../sessions/night-summary.js";

/**
 * `GET /v1/projects/{projectId}/analyses`: the statistics of the nights of a
 * multi-night plan, night by night and together — what « Les nuits de cette
 * image » of a capture of the plan shows (`project.schema.json`,
 * `nightsStatistics`). Each night run (`sessionId`) is read as
 * `GET /v1/sessions/{id}` reads it (`night-resources.js`, `read`): its
 * guiding summary, its frames, its zone; a night without an analysis says
 * so (`analysed: false`) and counts in `nights` only. The cumulative RMS is
 * each axis weighted by the night's guided time (`nightsCumulative`). The
 * traces stay on each night's own read: this answer is a summary.
 *
 * Framework-free: `projectNights` is the project night service's
 * `projectNights`, `readNight` the night service's `read`; a night whose
 * read fails is left out of the figures, never an error of the answer.
 */
export async function projectAnalysesBody({
  tenantId,
  projectId,
  projectNights,
  readNight,
}) {
  const { nights } = await projectNights({ tenantId, projectId });
  const run = (Array.isArray(nights) ? nights : []).filter(
    (night) => typeof night?.sessionId === "string" && night.sessionId,
  );
  const lines = [];
  for (const night of run) {
    let read = null;
    try {
      read = await readNight({ tenantId, sessionId: night.sessionId });
    } catch {
      read = null;
    }
    const guiding = read?.guidingSummary ?? null;
    const poses = read?.posesSummary ?? null;
    lines.push({
      sessionId: night.sessionId,
      eveningDate: night.eveningDate ?? null,
      startedAt: read?.night?.startedAt?.value ?? null,
      zone: read?.zone ?? { timeZone: null, utcOffsetMinutes: null },
      analysed: Boolean(guiding || poses || read?.qualitySummary),
      guidingSummary: guiding,
      posesSummary: poses,
      fwhmPixels: read?.qualitySummary?.night?.fwhmPixels ?? null,
      eccentricity: read?.qualitySummary?.night?.eccentricity ?? null,
    });
  }
  return {
    projectId,
    nights: lines,
    cumulative: nightsCumulative(
      lines
        .filter((line) => line.analysed)
        .map((line) => ({
          guiding: line.guidingSummary,
          poses: line.posesSummary,
        })),
    ),
  };
}
