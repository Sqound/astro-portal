// The statistics of the gallery: what a space acquired, **per target**, **per
// instrument** and **over the year**, worked out from the lines of the Journal
// (`journal-list.js`) — the same lines on the service (the web page); the
// shared fixtures `journal-statistics-*.json` pin the figures.
// Pure: no database, no clock.
//
// The rules:
//
// - An **instrument** is the pair « tube · caméra » (the line's
//   `instrumentLabel`); a line without one belongs to no instrument.
// - The hours are those of the nights **confirmed at the debriefing**: a line
//   without a session, or one still « À débriefer », counts for nothing (as the
//   figures of the Journal's header).
// - A **night** of a target (or of an instrument) is a confirmed night that
//   acquired something of it: a target removed at the debriefing, or one with
//   no time acquired, is not a night of it.
// - **Best** is the longest integration; on a tie the sharper measured night
//   (the lowest FWHM), then the most recent.
// - A filter the debriefing did not write is « Filtre non renseigné » (`null`
//   here: the readers write it in their language).

const compareText = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

const seconds = (value) =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : 0;

const text = (value) =>
  typeof value === "string" && value.trim() ? value : null;

/** The best captures one card shows. */
export const BEST_CAPTURES = 3;

/** A line that counts: a session whose debriefing is confirmed. */
export const isConfirmed = (line) =>
  line.sessionId !== null &&
  line.sessionId !== undefined &&
  line.state !== "to_debrief";

/** The `{ line, target, seconds }` of every target a confirmed night acquired time of. */
function targetNights(lines) {
  const nights = [];
  for (const line of lines) {
    if (!isConfirmed(line)) continue;
    for (const target of line.targets ?? []) {
      if (target.state === "removed") continue;
      const acquired = seconds(target.acquiredSeconds);
      if (acquired > 0) nights.push({ line, target, seconds: acquired });
    }
  }
  return nights;
}

const fwhmOf = (line) => {
  const value = line.quality?.fwhm;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

/**
 * Whether the night `a` is better than `b`: longer, then sharper (a measured
 * FWHM beats none, a lower one beats a higher), then more recent.
 */
function better(a, b) {
  if (a.seconds !== b.seconds) return a.seconds > b.seconds;
  const fa = fwhmOf(a.line);
  const fb = fwhmOf(b.line);
  if (fa !== fb) {
    if (fa === null) return false;
    if (fb === null) return true;
    return fa < fb;
  }
  return compareText(a.line.eveningDate, b.line.eveningDate) > 0;
}

const byBetter = (a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0);

const byHoursThenName = (key) => (a, b) =>
  b.acquiredSeconds - a.acquiredSeconds || compareText(a[key], b[key]);

/** The best captures among `nights` (those that carry one), at most `BEST_CAPTURES`, one per capture. */
function bestCapturesOf(nights) {
  const seen = new Set();
  const captures = [];
  for (const night of [...nights].sort(byBetter)) {
    const id = text(night.target.captureId);
    if (id === null || seen.has(id)) continue;
    seen.add(id);
    captures.push({
      captureId: id,
      sessionId: night.line.sessionId,
      planId: night.line.planId ?? null,
      eveningDate: night.line.eveningDate,
      targetId: night.target.targetId,
      acquiredSeconds: night.seconds,
    });
    if (captures.length === BEST_CAPTURES) break;
  }
  return captures;
}

/** The latest year the lines hold (`null` for none). */
function latestYear(lines) {
  let year = null;
  for (const line of lines) {
    const value = Number(line.eveningDate.slice(0, 4));
    if (Number.isFinite(value) && (year === null || value > year)) year = value;
  }
  return year;
}

/** Twelve totals, one per month of `year`, of the confirmed lines' acquired seconds. */
function monthsOf(lines, year) {
  const months = new Array(12).fill(0);
  if (year === null) return months;
  for (const line of lines) {
    if (!isConfirmed(line)) continue;
    if (Number(line.eveningDate.slice(0, 4)) !== year) continue;
    const month = Number(line.eveningDate.slice(5, 7));
    if (month >= 1 && month <= 12)
      months[month - 1] += seconds(line.acquiredSeconds);
  }
  return months;
}

/** The label of the target that took the most of a night. */
function mainTargetOf(line) {
  let best = null;
  for (const target of line.targets ?? []) {
    if (target.state === "removed") continue;
    const acquired = seconds(target.acquiredSeconds);
    if (acquired <= 0) continue;
    if (
      best === null ||
      acquired > best.acquired ||
      (acquired === best.acquired &&
        compareText(target.targetId, best.target.targetId) < 0)
    )
      best = { target, acquired };
  }
  return best ? (text(best.target.label) ?? best.target.targetId) : null;
}

function bestNightOf(lines) {
  let best = null;
  for (const line of lines) {
    if (!isConfirmed(line)) continue;
    const night = { line, seconds: seconds(line.acquiredSeconds) };
    if (night.seconds > 0 && (best === null || better(night, best)))
      best = night;
  }
  return best
    ? {
        sessionId: best.line.sessionId,
        planId: best.line.planId ?? null,
        eveningDate: best.line.eveningDate,
        acquiredSeconds: best.seconds,
        targetLabel: mainTargetOf(best.line),
      }
    : null;
}

/** `{ firstNight, lastNight }` of a list of `YYYY-MM-DD` dates (both `null` for none). */
function span(dates) {
  const sorted = [...dates].sort(compareText);
  return {
    firstNight: sorted[0] ?? null,
    lastNight: sorted[sorted.length - 1] ?? null,
  };
}

/** The rows of the instruments of `nights`: hours, frames, nights and targets. */
function instrumentRows(lines) {
  const rows = new Map();
  for (const line of lines) {
    if (!isConfirmed(line)) continue;
    const label = text(line.instrumentLabel);
    const acquired = seconds(line.acquiredSeconds);
    if (label === null || acquired <= 0) continue;
    const row = rows.get(label) ?? {
      label,
      acquiredSeconds: 0,
      frameCount: 0,
      nights: 0,
      targets: new Set(),
    };
    row.acquiredSeconds += acquired;
    row.frameCount += seconds(line.frameCount);
    row.nights += 1;
    for (const target of line.targets ?? [])
      if (target.state !== "removed" && seconds(target.acquiredSeconds) > 0)
        row.targets.add(target.targetId);
    rows.set(label, row);
  }
  return [...rows.values()]
    .map((row) => ({
      label: row.label,
      acquiredSeconds: row.acquiredSeconds,
      frameCount: row.frameCount,
      nights: row.nights,
      targetCount: row.targets.size,
    }))
    .sort(byHoursThenName("label"));
}

/** The rows of the targets of `lines`: hours, frames and nights each. */
function targetRows(lines) {
  const rows = new Map();
  for (const night of [...targetNights(lines)].sort((a, b) =>
    compareText(b.line.eveningDate, a.line.eveningDate),
  )) {
    const id = night.target.targetId;
    const row = rows.get(id) ?? {
      targetId: id,
      label: text(night.target.label) ?? id,
      acquiredSeconds: 0,
      frameCount: 0,
      nights: 0,
    };
    row.acquiredSeconds += night.seconds;
    row.frameCount += seconds(night.target.frameCount);
    row.nights += 1;
    rows.set(id, row);
  }
  return [...rows.values()].sort(byHoursThenName("targetId"));
}

/**
 * The overview of a selection of `lines` (the Journal's filters already
 * applied): the year's months, the nights by outcome, the best night, every
 * target and every instrument with its hours. `year` is the year of the months
 * (`null`: the latest year the lines hold).
 */
export function journalStatisticsOverview(lines, { year = null } = {}) {
  const shown = year ?? latestYear(lines);
  const confirmed = lines.filter(isConfirmed);
  const lost = new Map();
  const nights = { executed: 0, partial: 0, noPlan: 0, abandoned: 0, lost: [] };
  for (const line of confirmed) {
    if (line.state === "executed") nights.executed += 1;
    else if (line.state === "partial") nights.partial += 1;
    else if (line.state === "no_plan") nights.noPlan += 1;
    else if (line.state === "abandoned") {
      nights.abandoned += 1;
      const cause = text(line.lostReason);
      if (cause !== null) lost.set(cause, (lost.get(cause) ?? 0) + 1);
    }
  }
  nights.lost = [...lost.entries()]
    .map(([cause, count]) => ({ cause, count }))
    .sort((a, b) => b.count - a.count || compareText(a.cause, b.cause));
  return {
    year: shown,
    months: monthsOf(lines, shown),
    nights,
    bestNight: bestNightOf(lines),
    targets: targetRows(lines),
    instruments: instrumentRows(lines),
  };
}

/**
 * One target over all the nights of `lines` (the whole Journal, no filter), or
 * `null` when no confirmed night acquired time of it.
 */
export function journalStatisticsTarget(lines, targetId) {
  const nights = targetNights(lines).filter(
    (night) => night.target.targetId === targetId,
  );
  if (!nights.length) return null;
  const newest = [...nights].sort((a, b) =>
    compareText(b.line.eveningDate, a.line.eveningDate),
  );
  const best = [...nights].sort(byBetter)[0];
  const filters = new Map();
  const instruments = new Map();
  let frameCount = 0;
  let acquiredSeconds = 0;
  for (const night of nights) {
    acquiredSeconds += night.seconds;
    frameCount += seconds(night.target.frameCount);
    const filter = text(night.target.filter);
    filters.set(filter, (filters.get(filter) ?? 0) + night.seconds);
    const label = text(night.line.instrumentLabel);
    if (label !== null) {
      const row = instruments.get(label) ?? {
        label,
        acquiredSeconds: 0,
        nights: 0,
      };
      row.acquiredSeconds += night.seconds;
      row.nights += 1;
      instruments.set(label, row);
    }
  }
  return {
    targetId,
    label: text(newest[0].target.label) ?? targetId,
    acquiredSeconds,
    frameCount,
    nights: nights.length,
    ...span(nights.map((night) => night.line.eveningDate)),
    bestNight: {
      sessionId: best.line.sessionId,
      planId: best.line.planId ?? null,
      eveningDate: best.line.eveningDate,
      acquiredSeconds: best.seconds,
    },
    filters: [...filters.entries()]
      .map(([filter, acquired]) => ({ filter, acquiredSeconds: acquired }))
      .sort(
        (a, b) =>
          b.acquiredSeconds - a.acquiredSeconds ||
          compareText(a.filter ?? "", b.filter ?? ""),
      ),
    byNight: newest.map((night) => ({
      sessionId: night.line.sessionId,
      planId: night.line.planId ?? null,
      eveningDate: night.line.eveningDate,
      acquiredSeconds: night.seconds,
      frameCount: seconds(night.target.frameCount),
      instrumentLabel: text(night.line.instrumentLabel),
      best: night === best,
    })),
    instruments: [...instruments.values()].sort(byHoursThenName("label")),
    bestCaptures: bestCapturesOf(nights),
  };
}

/**
 * One instrument (a « tube · caméra » label) over all the nights of `lines`,
 * or `null` when no confirmed night acquired time with it. `year` is the year
 * of its months (`null`: the latest year it was used).
 */
export function journalStatisticsInstrument(
  lines,
  label,
  { year = null } = {},
) {
  const used = lines.filter(
    (line) =>
      isConfirmed(line) &&
      text(line.instrumentLabel) === label &&
      seconds(line.acquiredSeconds) > 0,
  );
  if (!used.length) return null;
  const row = instrumentRows(used)[0];
  const shown = year ?? latestYear(used);
  const nights = targetNights(used);
  const best = bestNightOf(used);
  return {
    label,
    acquiredSeconds: row.acquiredSeconds,
    frameCount: row.frameCount,
    nights: row.nights,
    ...span(used.map((line) => line.eveningDate)),
    targetCount: row.targetCount,
    bestNight: best,
    targets: targetRows(used),
    year: shown,
    months: monthsOf(used, shown),
    bestCaptures: bestCapturesOf(nights),
  };
}

/**
 * The instrument of the tube `tubeName` the nights used most: its pair
 * « tube · caméra » with the most hours (`null`: no confirmed night used the
 * tube). A tube with one camera is that pair; with several, the longest used.
 * (« Mon matériel » reads it to say how many nights a tube has seen.)
 */
export function journalInstrumentOfTube(lines, tubeName) {
  let best = null;
  for (const row of journalStatisticsOverview(lines).instruments) {
    if (row.label !== tubeName && !row.label.startsWith(`${tubeName} · `))
      continue;
    if (best === null || row.acquiredSeconds > best.acquiredSeconds) best = row;
  }
  return best;
}
