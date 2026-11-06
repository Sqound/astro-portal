import { astronomicalSeason } from "astro-core/astronomical-seasons.js";

// The reading of the Journal's list (`journal.schema.json`, `journal.md`):
// the order, the filters, the paging by cursor, the groups and the figures of
// the header, written once as plain functions over a table of lines. The
// service builds its lines from the database and hands them here; the shared
// fixture (`packages/astro-contracts/fixtures/journal-sessions.json`) hands
// them the same way in the tests. Pure: no database, no clock.

/** The seasons the filter knows. */
export const JOURNAL_SEASONS = Object.freeze([
  "winter",
  "spring",
  "summer",
  "autumn",
]);

/** The states of a line, which the filter « Issue » names. */
export const JOURNAL_STATES = Object.freeze([
  "to_debrief",
  "executed",
  "partial",
  "abandoned",
  "no_plan",
]);

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

/** The key of a line: its session, else the plan carried out without one. */
export const lineKey = (line) => line.sessionId ?? line.planId;

const compareText = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

/**
 * `eveningDate` descending, then `startedAt` descending (a line without one
 * last), then the line's key descending: the total order of the Journal.
 */
export function compareLines(left, right) {
  return (
    compareText(right.eveningDate, left.eveningDate) ||
    (left.startedAt === right.startedAt
      ? 0
      : left.startedAt === null
        ? 1
        : right.startedAt === null
          ? -1
          : compareText(right.startedAt, left.startedAt)) ||
    compareText(lineKey(right), lineKey(left))
  );
}

/**
 * Every multi-night plan a line is linked to, `projectId` first. A night of
 * two targets may serve two plans (`projectIds`, sent only then); a client
 * that does not know the field reads the one `projectId`.
 */
export const projectIdsOfLine = (line) =>
  Array.isArray(line.projectIds) && line.projectIds.length
    ? line.projectIds
    : line.projectId
      ? [line.projectId]
      : [];

/** Whether `line` passes the filters of `query` (they add up). */
export function lineMatches(line, query) {
  if (
    query.year !== undefined &&
    Number(line.eveningDate.slice(0, 4)) !== query.year
  )
    return false;
  if (
    query.instrument !== undefined &&
    line.instrumentLabel !== query.instrument
  )
    return false;
  if (
    query.season !== undefined &&
    astronomicalSeason(line.eveningDate) !== query.season
  )
    return false;
  if (query.outcome !== undefined && line.state !== query.outcome) return false;
  if (query.outcomes !== undefined && !query.outcomes.includes(line.state))
    return false;
  if (query.multiNightOnly === true && projectIdsOfLine(line).length === 0)
    return false;
  return true;
}

/** The lines `query` selects, in the order of the Journal. */
export function selectLines(lines, query = {}) {
  return lines.filter((line) => lineMatches(line, query)).sort(compareLines);
}

/** An opaque cursor for the line a page ends with. */
export function encodeCursor(line) {
  return Buffer.from(
    JSON.stringify({
      e: line.eveningDate,
      s: line.startedAt,
      k: lineKey(line),
    }),
  ).toString("base64url");
}

/** The position a cursor names, or `null` when it is not one. */
export function decodeCursor(cursor) {
  try {
    const value = JSON.parse(
      Buffer.from(String(cursor), "base64url").toString("utf8"),
    );
    if (
      typeof value?.e === "string" &&
      (value.s === null || typeof value.s === "string") &&
      typeof value.k === "string" &&
      value.k
    )
      return { eveningDate: value.e, startedAt: value.s, sessionId: value.k };
  } catch {
    // not a cursor
  }
  return null;
}

/**
 * The page of `selected` (already in order) that follows `after` (a decoded
 * cursor, or `null` for the first page): `{ page, nextCursor }`. A cursor is
 * exclusive: the page starts at the first line strictly after it.
 */
export function pageOf(selected, { after = null, limit = DEFAULT_PAGE_SIZE }) {
  const start = after
    ? selected.findIndex((line) => compareLines(line, after) > 0)
    : 0;
  const from = start < 0 ? selected.length : start;
  const page = selected.slice(from, from + limit);
  return {
    page,
    nextCursor:
      from + limit < selected.length
        ? encodeCursor(page[page.length - 1])
        : null,
  };
}

/**
 * The frames a line gives to a plan. A plan that knows its target
 * (`targetKeys`, the identifiers the target answers to) counts only the
 * frames of that target on the night, the night's other targets belonging to
 * other plans; a plan without keys, and a line without targets, count the
 * whole night.
 */
export function planFrameCount(line, project) {
  const keys = project?.targetKeys;
  if (!keys || keys.size === 0 || !Array.isArray(line.targets))
    return line.frameCount ?? 0;
  let frames = 0;
  for (const target of line.targets)
    if (keys.has(target.targetId) && target.state !== "removed")
      frames += target.frameCount ?? 0;
  return frames;
}

/**
 * The groups of a page: one per multi-night plan — whatever
 * its state, from its first night on — that has a line on the page, in the
 * order of the page. A night linked to two plans (`projectIds`) belongs to
 * both groups: it is listed in each one's `sessionIds` and `lineKeys` and
 * counted in each one's figures, those figures being the plan's own (its
 * target's frames only). `sessionIds` lists **every** session of the plan the
 * filters select and `lineKeys` every line (a night to debrief without a
 * session too), wherever they fall in the paging; `lineCount`, `frameCount`,
 * `toDebriefCount`, `firstEveningDate` and `lastEveningDate` are the whole
 * plan's in `everything` (the lines before any filter): the filters sort
 * the nights, not the plan.
 * `projects` is a `Map(projectId -> { name, targetLabel, status, targetId,
 * goalSeconds, acquiredSeconds, planCaptureId, targetKeys })`; `targetKeys`
 * is optional (see `planFrameCount`).
 */
export function groupsOf(page, selected, projects, everything = selected) {
  const groups = [];
  for (const line of page)
    for (const projectId of projectIdsOfLine(line)) {
      const project = projects.get(projectId);
      if (!project || groups.some((group) => group.projectId === projectId))
        continue;
      const ofPlan = (other) => projectIdsOfLine(other).includes(projectId);
      const chosen = selected.filter(ofPlan);
      const whole = everything.filter(ofPlan).sort(compareLines);
      groups.push({
        projectId,
        name: project.name,
        targetLabel: project.targetLabel,
        status: project.status ?? "active",
        targetId: project.targetId ?? null,
        sessionIds: chosen
          .filter((other) => other.sessionId !== null)
          .map((other) => other.sessionId),
        lineKeys: chosen.map(lineKey),
        lineCount: whole.length,
        frameCount: whole.reduce(
          (sum, other) => sum + planFrameCount(other, project),
          0,
        ),
        toDebriefCount: whole.filter((other) => other.state === "to_debrief")
          .length,
        firstEveningDate: whole.at(-1)?.eveningDate ?? line.eveningDate,
        lastEveningDate: whole[0]?.eveningDate ?? line.eveningDate,
        acquiredSeconds: project.acquiredSeconds,
        goalSeconds: project.goalSeconds,
        planCaptureId: project.planCaptureId ?? null,
      });
    }
  return groups;
}

/**
 * The count of the lines « À débriefer » of the Journal,
 * **whatever the filters** (a badge does not move with them): the sessions of
 * a plan carried out and not debriefed, and the plans whose night is past
 * that no session holds. The one source of the badge of the Journal, on the
 * phone (added to what only the phone holds) and on the web.
 */
export function toDebriefCountOf(allLines) {
  return allLines.filter((line) => line.state === "to_debrief").length;
}

/** `years`, `instruments` (no filter applied) and `stats` (the selection) of the header. */
export function figuresOf(allLines, selected) {
  const withSession = selected.filter((line) => line.sessionId !== null);
  const confirmed = withSession.filter((line) => line.state !== "to_debrief");
  return {
    years: [
      ...new Set(allLines.map((line) => Number(line.eveningDate.slice(0, 4)))),
    ].sort((a, b) => b - a),
    instruments: [
      ...new Set(
        allLines
          .map((line) => line.instrumentLabel)
          .filter((label) => label !== null),
      ),
    ].sort(compareText),
    // F-C2: « acquired » is what was confirmed. A night still to debrief
    // holds the raw sum of its events, which its card does not show (it says
    // the promise), so it adds nothing to the hours or the frames.
    stats: {
      sessions: withSession.length,
      acquiredSeconds: confirmed.reduce(
        (sum, line) => sum + (line.acquiredSeconds ?? 0),
        0,
      ),
      frameCount: confirmed.reduce(
        (sum, line) => sum + (line.frameCount ?? 0),
        0,
      ),
    },
  };
}

export { astronomicalSeason };
