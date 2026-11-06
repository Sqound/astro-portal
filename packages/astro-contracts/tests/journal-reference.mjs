// The reference reading of the Journal's list (`schemas/api/journal.md`,
// `fixtures/journal-sessions.json`): the order, the filters, the paging, the
// groups, the header figures, written once as plain functions over a table of
// lines. The service, the web and the phone each replay the shared fixture
// against their own implementation; this one keeps the fixture honest (the
// contract test checks the recorded expectations against it).

const SEASONS = ["winter", "spring", "summer", "autumn"];

/** The shared rule `astronomicalSeason` (astro-core), restated for the test. */
export function seasonOf(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ""));
  if (!match) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 3 || (month === 12 && day >= 21) || (month === 3 && day < 20))
    return SEASONS[0];
  if (month < 6 || (month === 6 && day < 21)) return SEASONS[1];
  if (month < 9 || (month === 9 && day < 22)) return SEASONS[2];
  if (month < 12 || (month === 12 && day < 21)) return SEASONS[3];
  return SEASONS[0];
}

/** The key of a line: its session, else the plan carried out without one. */
export const lineKey = (line) => line.sessionId ?? line.planId;

const compareText = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

/** `eveningDate` descending, `startedAt` descending (none last), key descending. */
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

function matches(line, query) {
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
  if (query.season !== undefined && seasonOf(line.eveningDate) !== query.season)
    return false;
  if (query.outcome !== undefined && line.state !== query.outcome) return false;
  if (query.outcomes !== undefined && !query.outcomes.includes(line.state))
    return false;
  if (query.multiNightOnly === true && line.projectId === null) return false;
  return true;
}

/**
 * The first page of the list of `table` (`{ lines, projects }`) for `query`,
 * or, with `limit`, every page in turn: `[{ lineIds, groups, hasNext }]`.
 */
export function journalPages(table, query = {}) {
  const limit = query.limit ?? 50;
  const selected = table.lines
    .filter((line) => matches(line, query))
    .sort(compareLines);
  // Every multi-night plan makes a group, whatever its
  // state, from its first line on.
  const plans = new Map(table.projects.map((p) => [p.projectId, p]));
  const pages = [];
  for (let at = 0; at === 0 || at < selected.length; at += limit) {
    const page = selected.slice(at, at + limit);
    const groups = [];
    for (const line of page) {
      const project = plans.get(line.projectId);
      if (
        !project ||
        groups.some((group) => group.projectId === project.projectId)
      )
        continue;
      groups.push({
        projectId: project.projectId,
        sessionIds: selected
          .filter(
            (other) =>
              other.projectId === project.projectId && other.sessionId !== null,
          )
          .map((other) => other.sessionId),
        acquiredSeconds: project.acquiredSeconds,
      });
    }
    pages.push({
      lineIds: page.map(lineKey),
      groups,
      hasNext: at + limit < selected.length,
    });
  }
  return { pages, selected };
}

/** `years`, `instruments`, `stats` of the whole table and of the selection. */
export function journalFigures(table, query = {}) {
  const { selected } = journalPages(table, query);
  const sessions = selected.filter((line) => line.sessionId !== null);
  return {
    years: [
      ...new Set(
        table.lines.map((line) => Number(line.eveningDate.slice(0, 4))),
      ),
    ].sort((a, b) => b - a),
    instruments: [
      ...new Set(
        table.lines
          .map((line) => line.instrumentLabel)
          .filter((label) => label !== null),
      ),
    ].sort(compareText),
    stats: {
      sessions: sessions.length,
      acquiredSeconds: sessions.reduce(
        (sum, line) => sum + (line.acquiredSeconds ?? 0),
        0,
      ),
      frameCount: sessions.reduce(
        (sum, line) => sum + (line.frameCount ?? 0),
        0,
      ),
    },
  };
}
