// The lists of the tabs « Plans » and « Sessions » of « Mon espace »
// (SPACE-DATA-MANAGE-01): pure functions from what the service answers to the
// rows the tabs draw — the state of a row, its words, what may be done with
// it, the filters, the search, the order and the counters. No React here, so
// that a test reads them as they are.

import { message } from "portal/i18n.js";
import { planEffectiveState } from "portal/planner/plan-main-filter.js";
import { journalStateTone } from "../status/status-tones.js";
import { countedText, fillText } from "../filters/FilterControls.js";
import {
  guidedPlanName,
  targetDesignation,
} from "../sessions/journal-list-view.js";
import { fileSize } from "./captures-format.js";

export const PLAN_FILTERS = Object.freeze([
  "all",
  "one",
  "multi",
  "archived",
  "deleted",
]);
export const SESSION_FILTERS = Object.freeze([
  "all",
  "captures",
  "noPlan",
  "deleted",
]);

const text = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/** The search key of a row: its words, lowered, without accents. */
export const searchKey = (parts) =>
  parts
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Whether `row` holds every word of `query`. */
export function matchesSearch(row, query) {
  const words = searchKey([query]).split(/\s+/).filter(Boolean);
  return words.every((word) => row.search.includes(word));
}

export { guidedPlanName };

/** The label of a plan item's target: its designation, its name, its id. */
export function itemLabel(item) {
  const label =
    text(item?.name) ??
    text(item?.target?.designation) ??
    text(item?.target?.name) ??
    text(item?.target?.title) ??
    text(item?.targetId);
  return label ? targetDesignation(label) : null;
}

/** A multi-night plan's title: « NGC 7000 · Nébuleuse de l’Amérique du Nord ». */
export function projectTitle(project) {
  const target = project?.target ?? {};
  return [text(target.name), text(target.commonName)]
    .filter((part, index, parts) => part && parts.indexOf(part) === index)
    .join(" · ");
}

/**
 * The state a plan of one night shows, as a tone of the shared palette and,
 * for a night that runs on a phone, the glyph and word of « Nuit en cours ».
 * A plan whose night is past and that waits for its debriefing is « À
 * débriefer ».
 */
export function planTone(resource, now = Date.now()) {
  if (resource.executionState)
    return {
      tone: "planned",
      glyph: resource.executionState === "paused" ? "paused" : "running",
      running: true,
    };
  const state = planEffectiveState(resource);
  if (state === "archived") return { tone: "archived" };
  if (["executed", "partial"].includes(state))
    return { tone: resource.frozenAt ? state : "toDebrief" };
  if (state === "abandoned") return { tone: "abandoned" };
  const end = Date.parse(resource.nightEndAt ?? "");
  if (Number.isFinite(end) && end < now) return { tone: "toDebrief" };
  return { tone: "planned" };
}

/**
 * What may be done with a plan of one night: `deletable` (planned or
 * abandoned; a plan that ran or is archived is history, and goes to the
 * trash once no live session holds it — `heldBySession`, its refusal says
 * what to do first), `archivable`, `unarchivable`.
 */
export function planRights(resource) {
  const state = planEffectiveState(resource);
  const executed = ["executed", "partial"].includes(state);
  const archived = state === "archived";
  // The service's rule: a plan stored as history (not one a phone closed
  // and that waits for its debriefing) whose sessions are in the trash.
  const history = ["executed", "partial", "archived"].includes(resource.status);
  const heldBySession = history && Boolean(resource.liveSessionId);
  return {
    deletable:
      (["active", "abandoned"].includes(resource.status) &&
        !executed &&
        !archived) ||
      (history && !heldBySession && !resource.executionState),
    heldBySession,
    executed,
    archived,
    archivable: !archived,
    unarchivable: archived,
  };
}

/** « ven. 16 oct. 2026 » of a plan's date (`YYYY-MM-DD`). */
export function dayText(date, locale) {
  const at = Date.parse(`${date}T12:00:00Z`);
  if (!Number.isFinite(at)) return "";
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(at);
}

const shortDay = (date, locale) => {
  const at = Date.parse(`${date}T12:00:00Z`);
  if (!Number.isFinite(at)) return "";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(at);
};

/** « 2 h 30 », « 45 min » from seconds. */
export function hoursText(seconds, locale) {
  const minutes = Math.round((Number(seconds) || 0) / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const number = new Intl.NumberFormat(locale).format(hours);
  return rest ? `${number} h ${String(rest).padStart(2, "0")}` : `${number} h`;
}

/**
 * The rows of the tab « Plans »: the plans of one night (`plans`, the v1
 * resources) and the multi-night plans (`projects`, each with its `nights`
 * when they were read). A plan of a night names the multi-night plan it
 * follows. The internal plan of a guided evening is a row of its own kind
 * (`guidedEvening`): « Soirée guidée · nom », with no link to the planner,
 * and it is neither a « Une nuit » plan nor to be debriefed.
 */
export function planRows({
  plans = [],
  projects = [],
  locale,
  now = Date.now(),
}) {
  const projectsById = new Map(
    projects.map((project) => [project.id, project]),
  );
  const rows = [];
  for (const resource of plans) {
    const payload = resource.payload ?? {};
    const items = Array.isArray(payload.items) ? payload.items : [];
    const targets = [...new Set(items.map(itemLabel).filter(Boolean))];
    const projectId = items.find((item) => text(item.projectId))?.projectId;
    const project = projectId ? projectsById.get(projectId) : null;
    const place = text(payload.location?.name);
    const guidedEvening = payload.guidedEvening === true;
    const planned = planTone(resource, now);
    const { glyph, running = false } = planned;
    // A guided evening is never « À débriefer » nor « Planifié »: it took
    // place.
    const tone =
      guidedEvening && ["planned", "toDebrief"].includes(planned.tone)
        ? "executed"
        : planned.tone;
    const title = text(payload.name) ?? payload.date ?? "";
    const name = guidedEvening ? guidedPlanName(locale, title) : title;
    rows.push({
      kind: "plan",
      key: `plan:${resource.id}`,
      id: resource.id,
      clientId: payload.id ?? null,
      guidedEvening,
      revision: resource.revision,
      name,
      date: payload.date ?? null,
      sortDate: payload.date ?? "",
      eyebrow: dayText(payload.date, locale),
      line: [place, targets.join(", ")].filter(Boolean).join(" · "),
      place,
      targets,
      projectId: project?.id ?? null,
      projectName: project ? text(project.target?.name) : null,
      tone,
      glyph,
      running,
      executionSessionId: resource.executionSessionId ?? null,
      meta: targets.length
        ? countedText(locale, "journalTargetsCount", targets.length)
        : null,
      rights: planRights(resource),
      resource,
      search: searchKey([name, place, ...targets, project?.target?.name]),
    });
  }
  for (const project of projects) {
    const nights = Array.isArray(project.nights) ? project.nights : [];
    const dates = nights
      .map((night) => night.eveningDate)
      .filter(Boolean)
      .sort();
    const first = dates[0] ?? project.createdAt?.slice(0, 10) ?? null;
    const last = dates.at(-1) ?? null;
    const acquired = nights.reduce(
      (sum, night) => sum + (Number(night.integrationSeconds) || 0),
      0,
    );
    const goal = (Number(project.goalMinutes) || 0) * 60;
    const running = nights.some(
      (night) =>
        night.sessionStatus === "open" || night.sessionStatus === "paused",
    );
    const title = projectTitle(project);
    const place = text(project.place?.name);
    rows.push({
      kind: "project",
      key: `project:${project.id}`,
      id: project.id,
      revision: project.revision,
      name: title,
      date: first,
      sortDate: last ?? first ?? "",
      eyebrow:
        first && last && last !== first
          ? fillText(message(locale, "spacePlansRange"), {
              start: shortDay(first, locale),
              end: shortDay(last, locale),
            })
          : first
            ? fillText(message(locale, "spacePlansFrom"), {
                date: shortDay(first, locale),
              })
            : "",
      line: place ?? "",
      place,
      targets: [text(project.target?.name)].filter(Boolean),
      status: project.status,
      tone:
        project.status === "archived"
          ? "archived"
          : project.status === "finished"
            ? "executed"
            : "planned",
      label:
        project.status === "archived"
          ? message(locale, "plannerPlanStatusArchived")
          : project.status === "finished"
            ? message(locale, "journalGroupFinished")
            : message(locale, "journalGroupInProgress"),
      running,
      nightCount: nights.length,
      sessionCount: nights.filter((night) => night.sessionId).length,
      toComeCount: nights.filter(
        (night) =>
          night.planId && !night.sessionId && night.state === "upcoming",
      ).length,
      hasImage: Boolean(project.planCapture || project.planCaptureCount),
      acquiredSeconds: acquired,
      goalSeconds: goal,
      meta: countedText(locale, "spacePlansNights", nights.length),
      metaLine: goal
        ? fillText(message(locale, "spacePlansAcquired"), {
            acquired: hoursText(acquired, locale),
            goal: hoursText(goal, locale),
          })
        : null,
      rights: {
        deletable: true,
        archivable: project.status !== "archived",
        archived: project.status === "archived",
      },
      resource: project,
      search: searchKey([title, place]),
    });
  }
  return rows;
}

/** The rows a filter of « Plans » keeps (« Supprimés » reads another list). */
export function filterPlanRows(rows, filter) {
  if (filter === "one")
    return rows.filter(
      (row) =>
        row.kind === "plan" && !row.guidedEvening && !row.rights.archived,
    );
  if (filter === "multi")
    return rows.filter((row) => row.kind === "project" && !row.rights.archived);
  if (filter === "archived") return rows.filter((row) => row.rights.archived);
  return rows;
}

/** Newest first (the date of the night, a multi-night plan's last), or oldest. */
export function sortRows(rows, oldestFirst = false) {
  const sorted = [...rows].sort(
    (left, right) =>
      String(right.sortDate).localeCompare(String(left.sortDate)) ||
      String(right.name).localeCompare(String(left.name)),
  );
  return oldestFirst ? sorted.reverse() : sorted;
}

/** « 10 plans · 2 plans multi-nuits ». */
export function planCounter(rows, locale) {
  const multi = rows.filter((row) => row.kind === "project").length;
  return [
    countedText(locale, "spacePlansCount", rows.length - multi),
    multi ? countedText(locale, "spacePlansCountMulti", multi) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** « 0,4 Mo » of bytes (the size words of « Captures »). */
export const sizeText = (bytes, locale) => fileSize(bytes, locale);

/**
 * What the captures of the space say of each session: `Map(sessionId → {
 * count, bytes, labels })`, from the owner's captures (`GET
 * /v1/manage/captures`).
 */
export function capturesBySession(captures = []) {
  const bySession = new Map();
  for (const capture of captures) {
    if (!capture?.sessionId) continue;
    const entry = bySession.get(capture.sessionId) ?? {
      count: 0,
      bytes: 0,
      labels: [],
    };
    entry.count += 1;
    entry.bytes += Number(capture.byteSize) || 0;
    const target = capture.targets?.[0];
    const label =
      text(target?.designation) ?? text(target?.label) ?? text(target?.name);
    if (label) entry.labels.push(targetDesignation(label));
    bySession.set(capture.sessionId, entry);
  }
  return bySession;
}

/** The rows of the tab « Sessions »: the lines of the Journal that are sessions. */
export function sessionRows({ lines = [], captures = new Map(), locale }) {
  return lines
    .filter((line) => line.sessionId && !line.readOnly)
    .map((line) => {
      const held = captures.get(line.sessionId);
      const count = held?.count ?? line.captureCount ?? 0;
      const targets = (line.targets ?? [])
        .filter((target) => target.state !== "removed")
        .map((target) => targetDesignation(target.label ?? target.targetId))
        .filter(Boolean);
      const place = text(line.placeName);
      return {
        kind: "session",
        key: `session:${line.sessionId}`,
        id: line.sessionId,
        name: line.guidedEvening
          ? guidedPlanName(locale, text(line.planName))
          : (text(line.title) ?? place ?? dayText(line.eveningDate, locale)),
        guidedEvening: line.guidedEvening === true,
        date: line.eveningDate,
        sortDate: `${line.eveningDate ?? ""}${line.startedAt ?? ""}`,
        eyebrow: dayText(line.eveningDate, locale),
        line: [...new Set(targets)].join(" · "),
        place,
        projectName: text(line.projectName),
        planId: line.planId ?? null,
        planName: text(line.planName),
        tone: journalStateTone(line.state),
        state: line.state,
        captureCount: count,
        captureBytes: held?.bytes ?? 0,
        captureLabels: held?.labels ?? [],
        meta: count
          ? countedText(locale, "journalDeletedCaptures", count)
          : message(locale, "spaceSessionsNoCapture"),
        metaLine: held?.bytes ? sizeText(held.bytes, locale) : null,
        resource: line,
        search: searchKey([
          line.title,
          place,
          ...targets,
          line.projectName,
          line.planName,
        ]),
      };
    });
}

/** The rows a filter of « Sessions » keeps. */
export function filterSessionRows(rows, filter) {
  if (filter === "captures") return rows.filter((row) => row.captureCount > 0);
  if (filter === "noPlan") return rows.filter((row) => !row.planId);
  return rows;
}

/** « 7 sessions · 5 captures · 0,8 Mo ». */
export function sessionCounter(rows, locale) {
  const captures = rows.reduce((sum, row) => sum + row.captureCount, 0);
  const bytes = rows.reduce((sum, row) => sum + row.captureBytes, 0);
  return [
    countedText(locale, "spaceSessionsCount", rows.length),
    captures ? countedText(locale, "journalDeletedCaptures", captures) : null,
    bytes ? sizeText(bytes, locale) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** « A, B et C » in the language's own way. */
export function listText(items, locale) {
  try {
    return new Intl.ListFormat(locale, { type: "conjunction" }).format(items);
  } catch {
    return items.join(", ");
  }
}

/** « 4 min », « 2 h » since `instant`, or `null`. */
export function agoText(instant, locale, now = Date.now()) {
  const at = Date.parse(instant ?? "");
  if (!Number.isFinite(at)) return null;
  const minutes = Math.max(1, Math.round((now - at) / 60_000));
  return minutes < 60
    ? fillText(message(locale, "minutesAgo"), { count: minutes })
    : fillText(message(locale, "hoursAgo"), {
        count: Math.round(minutes / 60),
      });
}
