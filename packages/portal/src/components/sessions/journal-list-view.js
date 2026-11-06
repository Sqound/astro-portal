// What the Journal page (`/<locale>/sessions`) writes and draws, worked out
// from `GET /v1/journal` without React, so a test reads it without rendering —
// and replays the shared fixture
// (`astro-contracts/fixtures/journal-sessions.json`) against it: the filters
// of the address, the order, the months, the group that stands in the place of
// its most recent session, the figures of a card, the days of the calendar.
// The service does the filtering, the order and the figures; this module only
// reads what it answered.

import { astronomicalSeasonIds } from "astro-core/astronomical-seasons.js";
import { message, rangeOmitsFirstMonth } from "portal/i18n.js";
import { clockText, durationText } from "portal/written-forms.js";

/** The message of the outcome chip of a state. */
export const OUTCOME_MESSAGES = {
  to_debrief: "sessionOutcomeToDebrief",
  executed: "sessionOutcomeExecuted",
  partial: "sessionOutcomePartial",
  abandoned: "sessionOutcomeNotExecuted",
  no_plan: "sessionOutcomeNoPlan",
};

/** The five states of a line of the Journal, in the order of the outcome list. */
export const JOURNAL_STATES = Object.keys(OUTCOME_MESSAGES);
/**
 * What is ticked when no outcome was chosen: every outcome but « Abandonnée » — the nights lost are listed
 * only once the outcome is ticked.
 */
export const JOURNAL_OUTCOME_PRESELECTION = Object.freeze(
  JOURNAL_STATES.filter((state) => state !== "abandoned"),
);

/** The outcomes ticked by these filters. */
export const journalOutcomesTicked = (filters) =>
  filters.outcomes ?? JOURNAL_OUTCOME_PRESELECTION;

const sameStates = (left, right) =>
  left.length === right.length && left.every((state) => right.includes(state));

/**
 * `outcomes` as the filters keep them: the preselection is « nothing chosen »
 * (`null`), any other choice a list of states in the order of the list.
 */
export const journalOutcomesChosen = (states) => {
  const ticked = JOURNAL_STATES.filter((state) => states.includes(state));
  return sameStates(ticked, JOURNAL_OUTCOME_PRESELECTION) ? null : ticked;
};

/** `preselection`, `all` or `custom`. */
export function journalOutcomeSelection(filters) {
  const ticked = journalOutcomesTicked(filters);
  if (sameStates(ticked, JOURNAL_OUTCOME_PRESELECTION)) return "preselection";
  return sameStates(ticked, JOURNAL_STATES) ? "all" : "custom";
}

/** The four astronomical seasons (the shared rule, `astro-core`). */
export const JOURNAL_SEASONS = astronomicalSeasonIds;

const firstOf = (value) => (Array.isArray(value) ? value[0] : value);

function valueOf(source, key) {
  if (!source) return undefined;
  if (typeof source.get === "function") return source.get(key) ?? undefined;
  return firstOf(source[key]);
}

/**
 * The filters of the address, as the page reads them — `year`, `instrument`,
 * `season`, `outcome`, `multiNightOnly=true` (the names of the service's
 * query) and `view=calendar`. A value that is not one of the filter's own is
 * dropped: the address of a page is never an error.
 */
export function journalFilters(source) {
  const filters = {
    year: null,
    instrument: null,
    season: null,
    outcomes: null,
    multiNightOnly: false,
    view: "list",
    statsTarget: null,
    statsInstrument: null,
  };
  const year = valueOf(source, "year");
  if (/^\d{4}$/.test(year ?? "") && Number(year) >= 1900)
    filters.year = Number(year);
  const instrument = valueOf(source, "instrument");
  if (typeof instrument === "string" && instrument.trim())
    filters.instrument = instrument;
  const season = valueOf(source, "season");
  if (JOURNAL_SEASONS.includes(season)) filters.season = season;
  // One outcome or several, separated by commas; a list that is the
  // preselection is « nothing chosen ».
  const outcomes = String(valueOf(source, "outcome") ?? "")
    .split(",")
    .filter((state) => JOURNAL_STATES.includes(state));
  if (outcomes.length) filters.outcomes = journalOutcomesChosen(outcomes);
  filters.multiNightOnly = valueOf(source, "multiNightOnly") === "true";
  if (valueOf(source, "view") === "calendar") filters.view = "calendar";
  // The statistics of the gallery, and the target or instrument whose dialog
  // is open (the address says which: a link, the back button closes).
  if (valueOf(source, "view") === "statistics") {
    filters.view = "statistics";
    const target = valueOf(source, "statsTarget");
    if (typeof target === "string" && target.trim())
      filters.statsTarget = target;
    const pair = valueOf(source, "statsInstrument");
    if (typeof pair === "string" && pair.trim()) filters.statsInstrument = pair;
  }
  return filters;
}

function searchOf(filters, { withView = true } = {}) {
  const search = new URLSearchParams();
  if (filters.year) search.set("year", String(filters.year));
  if (filters.instrument) search.set("instrument", filters.instrument);
  if (filters.season) search.set("season", filters.season);
  if (filters.outcomes?.length)
    search.set(
      "outcome",
      JOURNAL_STATES.filter((state) => filters.outcomes.includes(state)).join(
        ",",
      ),
    );
  if (filters.multiNightOnly) search.set("multiNightOnly", "true");
  if (withView && filters.view === "calendar") search.set("view", "calendar");
  if (withView && filters.view === "statistics") {
    search.set("view", "statistics");
    if (filters.statsTarget) search.set("statsTarget", filters.statsTarget);
    if (filters.statsInstrument)
      search.set("statsInstrument", filters.statsInstrument);
  }
  return search;
}

/** The query of `GET /v1/journal` for these filters (no paging). */
export const journalServiceQuery = (filters) =>
  searchOf(filters, { withView: false });

/**
 * The query the web asks of the service: the filters of the address, and — when
 * no outcome was chosen — the preselection, so the nights lost are not listed
 * until « Abandonnée » is ticked.
 */
export function journalRequestQuery(filters) {
  const query = journalServiceQuery(filters);
  if (!filters.outcomes)
    query.set("outcome", JOURNAL_OUTCOME_PRESELECTION.join(","));
  return query;
}

/** The address of the Journal with these filters. */
export function journalHref(locale, filters) {
  const search = searchOf(filters).toString();
  return `/${locale}/sessions${search ? `?${search}` : ""}`;
}

/**
 * The Journal's « Statistiques » with the dialog of a target or of an instrument
 * open: the address of every « Toutes les nuits de … » link — a page of the
 * portal that holds none of its own figures, and the dialog's own address, so
 * the back button closes it.
 */
export function journalStatisticsHref(
  locale,
  { target = null, instrument = null } = {},
) {
  const search = new URLSearchParams({ view: "statistics" });
  if (target) search.set("statsTarget", target);
  if (instrument) search.set("statsInstrument", instrument);
  return `/${locale}/sessions?${search}`;
}

/** The key of a line: its session, else the plan carried out without one. */
export const lineKey = (item) => item.sessionId ?? item.planId;

/** The page of a line: its session, else the debriefing of its plan. */
export function journalLineHref(locale, item) {
  return item.sessionId
    ? `/${locale}/sessions/${encodeURIComponent(item.sessionId)}`
    : `/${locale}/sessions/debrief/${encodeURIComponent(item.planId)}`;
}

/** The page of a multi-night plan, in the planner's library. */
export const multiNightPlanHref = (locale, projectId) =>
  `/${locale}/planner?view=plans&kind=multi&multiNight=${encodeURIComponent(projectId)}&screen=detail`;

/**
 * Every page of the answers put in one: the sessions in the order the service
 * gave them, the groups of the pages once each. `pages` are the bodies of
 * `GET /v1/journal`, the first one's `years`, `instruments` and `stats`
 * standing for the selection (they cover all of it, not the page).
 */
export function mergeJournalPages(pages) {
  const first = pages[0] ?? {};
  const groups = [];
  for (const page of pages)
    for (const group of page.groups ?? [])
      if (!groups.some((known) => known.projectId === group.projectId))
        groups.push(group);
  return {
    sessions: pages.flatMap((page) => page.sessions ?? []),
    groups,
    years: first.years ?? [],
    instruments: first.instruments ?? [],
    stats: first.stats ?? { sessions: 0, acquiredSeconds: 0, frameCount: 0 },
  };
}

/**
 * The groups that name a line (its `lineKeys`, else its `sessionIds`): the
 * line's own plan (`projectId`) first, then the other plans a night of
 * several targets serves. Most lines have one group, or none.
 */
export function groupsOfLine(groups, item) {
  const key = item.sessionId ?? item.planId;
  return groups
    .filter((group) => (group.lineKeys ?? group.sessionIds ?? []).includes(key))
    .sort(
      (left, right) =>
        Number(right.projectId === item.projectId) -
        Number(left.projectId === item.projectId),
    );
}

/**
 * The rows of the list, newest night first: a session is a
 * row, and every multi-night plan — whatever its state, from its first night
 * on — stands in the place of its most recent line with its lines inside;
 * a line of the plan from another month leaves a pointer in its own month.
 * A night serving two plans is inside both groups (and leaves a pointer for
 * each one placed in another month).
 * A row is `{ kind: "session", item }`, `{ kind: "group", group, items }` or
 * `{ kind: "pointer", group, item, groupMonth }` (the group's `lineKeys`, else its
 * `sessionIds`, name its lines).
 */
export function journalRows({ sessions = [], groups = [] } = {}) {
  const keyOf = (item) => item.sessionId ?? item.planId;
  const keysOf = new Map(
    groups.map((group) => [
      group,
      new Set(group.lineKeys ?? group.sessionIds ?? []),
    ]),
  );
  const rows = [];
  const placed = new Map();
  for (const item of sessions) {
    const named = groupsOfLine(groups, item);
    if (!named.length) {
      rows.push({ kind: "session", item });
      continue;
    }
    const month = item.eveningDate.slice(0, 7);
    for (const group of named) {
      if (placed.has(group.projectId)) {
        if (placed.get(group.projectId) !== month)
          rows.push({
            kind: "pointer",
            group,
            item,
            groupMonth: placed.get(group.projectId),
          });
        continue;
      }
      placed.set(group.projectId, month);
      rows.push({
        kind: "group",
        group,
        items: sessions.filter((entry) => keysOf.get(group).has(keyOf(entry))),
      });
    }
  }
  return rows;
}

/** The night a row belongs to: its (most recent) line's evening. */
export const rowDate = (row) =>
  row.kind === "group" ? row.items[0].eveningDate : row.item.eveningDate;

/**
 * Whether two days of one month may be written « 9 → 12 août » in `locale`:
 * where a range inside one month drops
 * the month of its first date, which the locale registry says
 * (`rangeFirstMonth`). Japanese and Chinese put the month first and mark the
 * day (« 10月17日 »), German ends the day with a dot (« 17. Okt. »), English
 * puts the month first: they write each date in full.
 */
export function monthSaidOnce(locale) {
  return rangeOmitsFirstMonth(locale);
}

/**
 * « 9 → 12 août »: the nights a group spans, from the evening of the first to
 * the morning after the last (the whole plan's, `firstEveningDate` and
 * `lastEveningDate`); one night alone, its evening.
 */
export function groupSpanText(first, last, locale) {
  const from = dateParts(first);
  const evening = dateParts(last);
  if (!from || !evening) return "";
  const dayMonth = (time) =>
    new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(time);
  if (first === last) return dayMonth(utcNoon(from));
  const to = utcNoon(evening) + 24 * 3600 * 1000;
  const toDate = new Date(to);
  const sameMonth =
    toDate.getUTCFullYear() === from[0] && toDate.getUTCMonth() + 1 === from[1];
  const day = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    timeZone: "UTC",
  }).format(utcNoon(from));
  return sameMonth && monthSaidOnce(locale)
    ? `${day} → ${dayMonth(to)}`
    : `${dayMonth(utcNoon(from))} → ${dayMonth(to)}`;
}

/**
 * What a group shows folded: up to three lines as they
 * are; beyond, three — those « À débriefer » first, then the most recent —
 * in the order of the list.
 */
export function groupFolded(items, limit = 3) {
  if (items.length <= limit) return items;
  const chosen = new Set(
    [
      ...items.filter((item) => item.state === "to_debrief"),
      ...items.filter((item) => item.state !== "to_debrief"),
    ].slice(0, limit),
  );
  return items.filter((item) => chosen.has(item));
}

/** The rows under their months, `[{ month: "2026-10", rows }]`. */
export function journalMonths(rows) {
  const months = [];
  for (const row of rows) {
    const month = rowDate(row).slice(0, 7);
    const last = months.at(-1);
    if (last?.month === month) last.rows.push(row);
    else months.push({ month, rows: [row] });
  }
  return months;
}

const dateParts = (date) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date ?? ""));
  return match ? match.slice(1).map(Number) : null;
};

const utcNoon = ([year, month, day]) => Date.UTC(year, month - 1, day, 12);

/** « Octobre 2026 »: the heading of a month. */
export function monthHeading(month, locale) {
  const [year, number] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(Date.UTC(year, number - 1, 1, 12));
}

/** « sam. 10 oct. 2026 »: the evening of a card (small gold capitals by style). */
export function eveningText(date, locale) {
  const parts = dateParts(date);
  if (!parts) return "";
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(utcNoon(parts));
}

/** « Dim. 9 août »: the evening of a session inside its group (capital first). */
export function eveningShort(date, locale) {
  const parts = dateParts(date);
  if (!parts) return "";
  const text = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(utcNoon(parts));
  return text ? text[0].toLocaleUpperCase(locale) + text.slice(1) : text;
}

/** « mercredi 7 octobre 2026 »: the day a calendar panel names. */
export function eveningLong(date, locale) {
  const parts = dateParts(date);
  if (!parts) return "";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(utcNoon(parts));
}

/** « 9 → 12 août »: the nights a group spans, in its sessions' evenings. */
export function spanText(items, locale) {
  const dates = items
    .map((item) => dateParts(item.eveningDate))
    .filter(Boolean)
    .sort((a, b) => utcNoon(a) - utcNoon(b));
  if (!dates.length) return "";
  const first = dates[0];
  const last = dates.at(-1);
  const day = (parts) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", timeZone: "UTC" }).format(
      utcNoon(parts),
    );
  const dayMonth = (parts) =>
    new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(utcNoon(parts));
  if (utcNoon(first) === utcNoon(last)) return dayMonth(first);
  return first[1] === last[1] && first[0] === last[0] && monthSaidOnce(locale)
    ? `${day(first)} → ${dayMonth(last)}`
    : `${dayMonth(first)} → ${dayMonth(last)}`;
}

/**
 * The template of a count word in the language's own plural. Every language
 * holds the same three keys (the catalogues' rule): the key itself, which is
 * the form of every number the others do not name (in Russian, the genitive
 * plural: « 5 сеансов »), `One` (« 1 session », and 21 in Russian) and `Few`
 * (« 3 сеанса »; the other languages repeat the key's own text).
 */
export function pluralTemplate(locale, key, count) {
  const category = new Intl.PluralRules(locale).select(count);
  const suffix = { one: "One", few: "Few" }[category];
  return message(locale, suffix ? `${key}${suffix}` : key);
}

/** « 3 sessions »: a count word with its number, in the language's plural. */
export function counted(locale, key, count, values = {}) {
  return fill(pluralTemplate(locale, key, count), {
    count: new Intl.NumberFormat(locale).format(count),
    ...values,
  });
}

/** `{name}` placeholders of a text filled in. */
export function fill(template, values) {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value ?? "")),
    template,
  );
}

/** « 4 h 30 »: seconds written as a duration (`written-forms.js`). */
export const durationOf = (seconds, locale) =>
  durationText((seconds ?? 0) / 60, locale);

/**
 * The zone a line's hours are read in: the place's (`placeTimeZone`, which the
 * service works out by the one rule of the place), else `null` -- the hours
 * are then in UTC and say so. `Etc/UTC` is UTC.
 */
export function hoursZoneOf(item) {
  const zone = item?.placeTimeZone;
  return typeof zone === "string" &&
    zone &&
    zone !== "UTC" &&
    zone !== "Etc/UTC"
    ? zone
    : null;
}

/**
 * « 23:08 → 05:48 » in the hours of the place when it has a time zone,
 * « 21:08 → 03:48 UTC » when it has none (rule of the place without a time
 * zone): the hours of a session, as the page of the session writes them.
 */
export function hoursText(item) {
  if (!item.startedAt) return "";
  // A night of the catalogue that knows only its date reads « 00:00 → 00:00 »:
  // no hours are told when the end is not after the start.
  if (
    item.finishedAt &&
    Date.parse(item.finishedAt) <= Date.parse(item.startedAt)
  )
    return "";
  const zone = hoursZoneOf(item);
  const start = clockText(item.startedAt, zone ?? "UTC");
  const range = item.finishedAt
    ? `${start} → ${clockText(item.finishedAt, zone ?? "UTC")}`
    : start;
  return zone ? range : `${range} UTC`;
}

/** « M42 »: the designation a target's name starts with. */
export const targetDesignation = (label) =>
  String(label || "").split(/\s[–—-]\s/)[0];

/** The thumbnail of a capture, as the browser asks for it (session or device cookie). */
export const captureThumbnailSrc = (captureId) =>
  `/api/v1/captures/${encodeURIComponent(captureId)}/media?variant=thumbnail`;

/**
 * The thumbnail a target of a line draws, or `null` (the pictogram stands in):
 * the final photo of its capture, else the picture the catalogue holds of it
 * (`pictures[targetId]`, read by the service where the page is made).
 */
export function targetThumbnailSrc(target, pictures = null) {
  // A night of a private server's catalogue has no capture of the space: its
  // picture is the catalogue's (`imageUrl`).
  const url =
    target?.thumbnailUrl ||
    target?.imageUrl ||
    pictures?.[target?.targetId]?.url;
  if (typeof url !== "string" || !url) return null;
  return url.startsWith("/v1/") ? `/api${url}` : url;
}

/**
 * The target a pictogram is chosen for: its id and name, and the catalogue's
 * type where the service read one (a line carries none), so the figure is the
 * type's and not the star.
 */
export function pictogramTargetOf(pictures, targetId, title) {
  return {
    id: targetId,
    title,
    ...(pictures?.[targetId]?.typeKey
      ? { typeKey: pictures[targetId].typeKey }
      : {}),
  };
}

/** The targets a card draws: the ones the session still holds. */
export const visibleTargets = (item) =>
  (item.targets ?? []).filter((target) => target.state !== "removed");

/**
 * « Soirée guidée · Les dix étoiles les plus brillantes »: the internal plan
 * of a guided evening (`guidedEvening` on a line, `payload.guidedEvening` on a
 * plan) is called by its kind first, then by its name (the evening's title).
 * It is no plan of a night and has no outcome to wait for.
 */
export const guidedPlanName = (locale, name) =>
  [message(locale, "debriefEventGuidedEvening"), name]
    .filter(Boolean)
    .join(" · ");

/** « Col des Étoiles · Askar 50P »: the place and the instrument of a card. */
export function placeLine(item, locale) {
  const instrument =
    item.state === "no_plan" && !item.guidedEvening && !item.instrumentLabel
      ? message(locale, "journalNoPlanObservation")
      : item.instrumentLabel;
  return [item.placeName, instrument].filter(Boolean).join(" · ");
}

/**
 * What heads the card of a line: the name the person gave to the session -- the
 * place and the instrument then go under it --, else the place and the
 * instrument as before.
 */
export function cardHeading(item, locale) {
  const place = placeLine(item, locale);
  // The session of a guided evening is called « Soirée guidée · nom », the
  // place and the instrument under it.
  if (item.guidedEvening)
    return {
      title: guidedPlanName(locale, item.planName ?? null),
      named: true,
      line: place,
    };
  return item.title
    ? { title: item.title, named: true, line: place }
    : { title: place, named: false, line: "" };
}

/** A name of the reason a night gave nothing (`skipReason`). */
export function reasonText(reason, locale) {
  if (!reason) return null;
  const key = `debriefReason${reason[0].toUpperCase()}${reason.slice(1)}`;
  const text = message(locale, key);
  return text === key ? null : text;
}

/**
 * The right-hand block of a card: the big figure and the line under it —
 * « 4 h 30 » over « prévues · 2 cibles » for a night to debrief (the promise),
 * « 5 h 18 » over « 3 cibles · 120 poses · 21:08 → 03:48 UTC » for a session
 * that gave something, « 0 min » over its reason for one that gave nothing.
 */
export function totalBlock(item, locale) {
  const targets = visibleTargets(item);
  const targetCount = targets.length
    ? counted(locale, "journalTargetsCount", targets.length)
    : null;
  if (item.state === "to_debrief")
    return {
      figure: durationOf(item.plannedSeconds, locale),
      line: [message(locale, "journalPlannedShort"), targetCount]
        .filter(Boolean)
        .join(" · "),
    };
  const acquired = item.acquiredSeconds ?? 0;
  if (acquired <= 0) {
    const reason = reasonText(item.lostReason, locale);
    return {
      figure: durationOf(0, locale),
      line: reason
        ? fill(message(locale, "journalLostNothing"), { cause: reason })
        : "",
    };
  }
  return {
    figure: durationOf(acquired, locale),
    line: [
      targetCount,
      item.frameCount > 0
        ? counted(locale, "journalFramesCount", item.frameCount)
        : null,
      hoursText(item),
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

/**
 * « 40 poses · Dual-band · 2 h 00 · photo finale »: the line under a target of
 * a session — what it gave, never a figure the service did not give.
 */
export function targetLine(target, locale, { imported = false } = {}) {
  return [
    target.frameCount > 0
      ? counted(locale, "journalFramesCount", target.frameCount)
      : null,
    target.filter,
    target.acquiredSeconds > 0
      ? durationOf(target.acquiredSeconds, locale)
      : null,
    target.thumbnailUrl ? message(locale, "journalFinalPhoto") : null,
    target.state === "added" && !imported
      ? message(locale, "journalTargetAdded")
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The promise of a night to debrief: « NGC 7000 20:40 → 23:10 · IC 1396
 * 23:10 → 01:10 » when the plan carries the hours of its targets (`slots`, by
 * plan item: epoch milliseconds, read from the plan), else « NGC 7000 2 h 30 ».
 */
export function promiseText(item, locale, slots = null) {
  // The hours of the place when it has a zone, else UTC as before.
  const zone = hoursZoneOf(item);
  const clock = (epoch) =>
    clockText(new Date(epoch).toISOString(), zone ?? "UTC");
  const parts = visibleTargets(item).map((target) => {
    const slot = slots?.[target.planItemId] ?? null;
    const when =
      slot && Number.isFinite(slot.start) && slot.end > slot.start
        ? `${clock(slot.start)} → ${clock(slot.end)}`
        : target.plannedSeconds > 0
          ? durationOf(target.plannedSeconds, locale)
          : null;
    return [target.label, when].filter(Boolean).join(" ");
  });
  return parts.length
    ? fill(message(locale, "journalPromiseOf"), { targets: parts.join(" · ") })
    : fill(message(locale, "journalPromise"), {
        duration: durationOf(item.plannedSeconds, locale),
      });
}

/**
 * The line of the figures above the list: « 14 sessions en 2026 · 41 h 30
 * acquises · 1 212 poses », as segments (`bold` for the three values). Without
 * a year, the sentence that names none.
 */
export function statsSegments(stats, year, locale) {
  const number = (value) => new Intl.NumberFormat(locale).format(value);
  let template = pluralTemplate(
    locale,
    year ? "journalYearStats" : "journalStats",
    stats.sessions,
  );
  // No frame known says what a card says of it (« Poses non renseignées »),
  // not « 0 poses »: the last part of the sentence, whatever the language
  // puts around the number, gives way to that phrase.
  if (!stats.frameCount) {
    const tail = /(\s*[·・]\s*)[^·・]*\{frames\}[^·・]*$/.exec(template);
    if (tail)
      template = `${template.slice(0, tail.index)}${tail[1]}${message(locale, "sessionPageFramesUnknown")}`;
  }
  // « 1 pose », not « 1 poses » -- the frames part of the sentence is the
  // language's own plural when it has one for this count (the number stays
  // the bold segment).
  const framesCategory = new Intl.PluralRules(locale).select(stats.frameCount);
  if (stats.frameCount && framesCategory !== "other") {
    const numeral = number(stats.frameCount);
    const phrase = counted(locale, "journalFramesCount", stats.frameCount);
    const at = phrase.indexOf(numeral);
    const tail = /(\s*[·・]\s*)[^·・]*\{frames\}[^·・]*$/.exec(template);
    if (tail && at >= 0)
      template = `${template.slice(0, tail.index)}${tail[1]}${phrase.slice(0, at)}{frames}${phrase.slice(at + numeral.length)}`;
  }
  const values = {
    sessions: number(stats.sessions),
    duration: durationOf(stats.acquiredSeconds, locale),
    frames: number(stats.frameCount),
  };
  const segments = [];
  for (const piece of template.split(
    /(\{sessions\}|\{duration\}|\{frames\})/,
  )) {
    const name = /^\{(sessions|duration|frames)\}$/.exec(piece)?.[1];
    if (name) segments.push({ text: values[name], bold: true });
    else if (piece) segments.push({ text: fill(piece, { year }), bold: false });
  }
  return segments;
}

/**
 * The days of the calendar of a year: `Map` of `AAAA-MM-JJ` to what the day
 * holds — its lines, and the one look the day takes (`session`, `to_debrief`,
 * `abandoned`, `multi_night`): a session carried out outranks one still to
 * debrief, which outranks one not carried out; a night of a multi-night plan
 * is drawn in the plan's colour.
 */
export function calendarDays(items, year) {
  const days = new Map();
  for (const item of items) {
    if (!String(item.eveningDate).startsWith(`${year}-`)) continue;
    if (!days.has(item.eveningDate)) days.set(item.eveningDate, { items: [] });
    days.get(item.eveningDate).items.push(item);
  }
  for (const day of days.values()) {
    const states = day.items.map((item) => item.state);
    day.look = day.items.some((item) => item.projectId)
      ? "multi_night"
      : states.some((state) => state !== "to_debrief" && state !== "abandoned")
        ? "session"
        : states.includes("to_debrief")
          ? "to_debrief"
          : "abandoned";
  }
  return days;
}

/** The first weekday (Monday = 0) and the length of a month (`month` 0-11). */
export function monthShape(year, month) {
  return {
    offset: (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7,
    days: new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
  };
}

/**
 * The curves of « Qualité des captures »: one measure of every frame of the
 * night's analysis, a point at most per three minutes of the night, ready to
 * draw — `{ skyBackground, fwhm, eccentricity }`, each `[number]` or `[]`.
 */
export function qualityCurves(report, { points = 48 } = {}) {
  const rows = (Array.isArray(report?.quality) ? report.quality : [])
    .map((row) => ({
      at: Date.parse(row?.timestampUtc ?? ""),
      skyBackground: Number(row?.skyBackgroundAdu),
      fwhm: Number(row?.fwhmPixels),
      eccentricity: Number(row?.eccentricity),
    }))
    .filter((row) => Number.isFinite(row.at))
    .sort((a, b) => a.at - b.at);
  const curve = (field) => {
    const values = rows.map((row) => row[field]).filter(Number.isFinite);
    if (values.length <= points) return values;
    const step = values.length / points;
    return Array.from({ length: points }, (_, index) => {
      const slice = values.slice(
        Math.floor(index * step),
        Math.max(Math.floor((index + 1) * step), Math.floor(index * step) + 1),
      );
      return slice.reduce((sum, value) => sum + value, 0) / slice.length;
    });
  };
  return {
    skyBackground: curve("skyBackground"),
    fwhm: curve("fwhm"),
    eccentricity: curve("eccentricity"),
  };
}
