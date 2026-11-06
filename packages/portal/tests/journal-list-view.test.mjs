import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  calendarDays,
  counted,
  groupFolded,
  groupSpanText,
  journalFilters,
  journalHref,
  journalMonths,
  journalRows,
  groupsOfLine,
  journalServiceQuery,
  lineKey,
  hoursText,
  mergeJournalPages,
  promiseText,
  monthSaidOnce,
  qualityCurves,
  spanText,
  targetThumbnailSrc,
  statsSegments,
  totalBlock,
} from "../dist/components/sessions/journal-list-view.js";

// The Journal page's reading of `GET /v1/journal`: the filters of the
// address, the group standing in the place of its most recent session, the
// months, the figures of a card — and the shared fixture
// (`astro-contracts/fixtures/journal-sessions.json`) replayed against them.

const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../../astro-contracts/fixtures/journal-sessions.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const byKey = new Map(fixture.lines.map((line) => [lineKey(line), line]));
const projectOf = (projectId) =>
  fixture.projects.find((project) => project.projectId === projectId);

/** What the service answers for a page of a case of the fixture. */
const answerOf = (testCase, page) => ({
  sessions: page.lineIds.map((id) => byKey.get(id)),
  groups: page.groups.map((group) => ({
    ...projectOf(group.projectId),
    sessionIds: group.sessionIds,
    acquiredSeconds: group.acquiredSeconds,
  })),
  years: testCase.years,
  instruments: testCase.instruments,
  stats: testCase.stats,
});

/** The address that asks for a case's query. */
function searchOf(query) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (key !== "limit") search.set(key, String(value));
  return search;
}

test("the filters of the address are the service's query: every case of the shared fixture goes through and comes back", () => {
  for (const testCase of fixture.cases) {
    const filters = journalFilters(searchOf(testCase.query));
    const sent = Object.fromEntries(journalServiceQuery(filters));
    const wanted = Object.fromEntries(
      Object.entries(testCase.query)
        .filter(([key]) => key !== "limit")
        .map(([key, value]) => [key, String(value)]),
    );
    assert.deepEqual(sent, wanted, testCase.id);
  }
  // A value that is not one of the filter's own is dropped, never an error.
  assert.deepEqual(
    Object.fromEntries(
      journalServiceQuery(
        journalFilters({ year: "20x6", season: "monsoon", outcome: "?" }),
      ),
    ),
    {},
  );
  // The calendar is a view of the address, not a filter of the service.
  const calendar = journalFilters({ view: "calendar", year: "2026" });
  assert.equal(calendar.view, "calendar");
  assert.equal(
    journalHref("fr", calendar),
    "/fr/sessions?year=2026&view=calendar",
  );
  assert.equal(journalHref("fr", journalFilters({})), "/fr/sessions");
});

test("the shared fixture: a group stands in the place of its most recent session and every line is drawn once, the nights in order", () => {
  for (const testCase of fixture.cases) {
    const pages = testCase.pages.map((page) => answerOf(testCase, page));
    const merged = mergeJournalPages(pages);
    const rows = journalRows(merged);
    // Every line of every page is a row or folded into a group, once.
    const drawn = rows.flatMap((row) =>
      row.kind === "group" ? row.items.map(lineKey) : [lineKey(row.item)],
    );
    assert.deepEqual(
      drawn.toSorted(),
      testCase.pages.flatMap((page) => page.lineIds).toSorted(),
      `${testCase.id}: each line once`,
    );
    // A group's sessions are no longer rows of their own.
    const grouped = new Set(
      rows.flatMap((row) =>
        row.kind === "group" ? row.items.map(lineKey) : [],
      ),
    );
    for (const row of rows)
      if (row.kind === "session")
        assert.ok(!grouped.has(lineKey(row.item)), testCase.id);
    // The group takes the place of its most recent session (the first in the order).
    for (const row of rows)
      if (row.kind === "group") {
        const firstLine = merged.sessions.find((item) =>
          row.group.sessionIds.includes(item.sessionId),
        );
        assert.equal(lineKey(row.items[0]), lineKey(firstLine), testCase.id);
        assert.deepEqual(
          row.items.map(lineKey),
          merged.sessions
            .filter((item) => row.group.sessionIds.includes(item.sessionId))
            .map(lineKey),
          `${testCase.id}: the group's sessions keep the service's order`,
        );
      }
    // The months run newest first and hold every row once.
    const months = journalMonths(rows);
    assert.deepEqual(
      months.map((month) => month.month),
      [...new Set(months.map((month) => month.month))],
    );
    assert.deepEqual(
      months.map((month) => month.month),
      months
        .map((month) => month.month)
        .toSorted()
        .reverse(),
      `${testCase.id}: newest month first`,
    );
    assert.equal(
      months.reduce((sum, month) => sum + month.rows.length, 0),
      rows.length,
    );
    // The groups of the pages are kept once each.
    assert.equal(
      merged.groups.length,
      new Set(merged.groups.map((group) => group.projectId)).size,
    );
  }
});

test("the card of a session writes what the line gives: the promise for a night to debrief, the figures for a session, the reason for a night not carried out", () => {
  const to = fixture.lines.find((line) => line.state === "to_debrief");
  const promise = totalBlock(to, "fr");
  assert.match(promise.line, /^prévues/);
  // The promise gives the hours of the targets when the plan carries
  // them (UTC), the durations when it does not.
  const withTargets = {
    ...to,
    targets: [
      {
        targetId: "a",
        label: "NGC 7000",
        planItemId: "pa",
        plannedSeconds: 9000,
        state: "planned",
      },
      {
        targetId: "b",
        label: "IC 1396",
        planItemId: "pb",
        plannedSeconds: 7200,
        state: "planned",
      },
    ],
  };
  const at = (hours, minutes) => Date.UTC(2026, 9, 10, hours, minutes);
  const told = (text) => text.replaceAll("\u00a0", " ");
  assert.match(
    told(
      promiseText(withTargets, "fr", {
        pa: { start: at(20, 40), end: at(23, 10) },
        pb: { start: at(23, 10), end: at(25, 10) },
      }),
    ),
    /NGC 7000 20:40 → 23:10 · IC 1396 23:10 → 01:10/,
  );
  assert.match(
    told(
      promiseText(withTargets, "fr", {
        pa: { start: at(20, 40), end: at(23, 10) },
      }),
    ),
    /NGC 7000 20:40 → 23:10 · IC 1396 2 h/,
    "a target the plan gives no hours for keeps its duration",
  );
  assert.match(
    told(promiseText(withTargets, "fr")),
    /NGC 7000 2 h 30 · IC 1396 2 h/,
  );
  // A catalogue night that knows only its date has no hours, and its
  // picture is the catalogue's.
  assert.equal(
    hoursText({
      startedAt: "2026-01-15T00:00:00.000Z",
      finishedAt: "2026-01-15T00:00:00.000Z",
    }),
    "",
  );
  assert.equal(
    targetThumbnailSrc({ thumbnailUrl: null, imageUrl: "/gallery/m42.jpg" }),
    "/gallery/m42.jpg",
  );
  const gave = fixture.lines.find(
    (line) => line.acquiredSeconds > 0 && line.frameCount > 0,
  );
  const figures = totalBlock(gave, "fr");
  assert.match(figures.line, /\d+ poses?/);
  assert.match(
    figures.line,
    /UTC$/,
    "hours are told in UTC (a place without a time zone)",
  );
  const none = {
    ...gave,
    state: "abandoned",
    acquiredSeconds: 0,
    frameCount: 0,
    lostReason: "weather",
    targets: [],
    startedAt: null,
  };
  const nothing = totalBlock(none, "fr");
  assert.equal(nothing.figure.replace(/\u00a0/g, " "), "0 min");
  assert.equal(nothing.line.replace(/\u00a0/g, " "), "Météo : rien d’acquis");
});

test("the figures above the list name the year when there is one, in the language's own plural", () => {
  const text = (segments) => segments.map((part) => part.text).join("");
  const stats = { sessions: 14, acquiredSeconds: 149400, frameCount: 1212 };
  assert.equal(
    text(statsSegments(stats, 2026, "fr")).replace(/\s/g, " "),
    "14 sessions en 2026 · 41 h 30 acquises · 1 212 poses".replace(/\s/g, " "),
  );
  assert.deepEqual(
    statsSegments(stats, 2026, "fr")
      .filter((part) => part.bold)
      .map((part) => part.text.replace(/\s/g, " ")),
    ["14", "41 h 30", "1 212"].map((value) => value.replace(/\s/g, " ")),
  );
  assert.match(
    text(statsSegments({ ...stats, sessions: 1 }, null, "fr")),
    /^1 session · /,
  );
  assert.match(
    text(statsSegments(stats, null, "en")),
    /^14 sessions · .* acquired · .* frames$/,
  );
  // Russian counts in three forms.
  assert.equal(counted("ru", "journalGroupSessions", 1), "1 сеанс");
  assert.equal(counted("ru", "journalGroupSessions", 3), "3 сеанса");
  assert.equal(counted("ru", "journalGroupSessions", 11), "11 сеансов");
  assert.equal(counted("ja", "journalGroupSessions", 1), "1件のセッション");
});

test("the calendar gives each day one look: a session in gold, a night to debrief, one not carried out, a multi-night plan's night in the plan's colour", () => {
  const days = calendarDays(fixture.lines, 2026);
  const look = (date) => days.get(date)?.look;
  const of = (state) =>
    fixture.lines.find(
      (line) => line.state === state && line.eveningDate.startsWith("2026"),
    );
  assert.equal(look(of("to_debrief").eveningDate), "to_debrief");
  assert.equal(look(of("executed").eveningDate), "session");
  const planNight = fixture.lines.find(
    (line) => line.projectId && line.eveningDate.startsWith("2026"),
  );
  assert.equal(look(planNight.eveningDate), "multi_night");
  assert.equal(calendarDays(fixture.lines, 1999).size, 0);
});

test("the curves of the quality panel are the frames of the night's analysis, thinned", () => {
  const rows = Array.from({ length: 200 }, (_, index) => ({
    timestampUtc: new Date(
      Date.UTC(2026, 9, 7, 21, 0, index * 20),
    ).toISOString(),
    skyBackgroundAdu: 900 + index,
    fwhmPixels: 2.6,
    eccentricity: 0.4,
  }));
  const curves = qualityCurves({ quality: rows }, { points: 48 });
  assert.equal(curves.skyBackground.length, 48);
  assert.ok(curves.skyBackground[0] < curves.skyBackground.at(-1));
  assert.deepEqual(qualityCurves({}), {
    skyBackground: [],
    fwhm: [],
    eccentricity: [],
  });
});

test("every multi-night plan is one row at its most recent line, a night of another month leaves a pointer, the fold keeps the nights to debrief", () => {
  const line = (key, eveningDate, state = "executed", projectId = "p") => ({
    sessionId: key,
    planId: `plan-${key}`,
    projectId,
    eveningDate,
    state,
  });
  const sessions = [
    line("a12", "2026-08-12", "executed", null),
    line("h11", "2026-08-11"),
    line("h10", "2026-08-10"),
    line("h9", "2026-08-09", "to_debrief"),
    { ...line("h8", "2026-08-08", "to_debrief"), sessionId: null },
    line("h28", "2026-07-28"),
  ];
  const group = {
    projectId: "p",
    name: "IC 1805",
    status: "active",
    lineKeys: ["h11", "h10", "h9", "plan-h8", "h28"],
  };
  const rows = journalRows({ sessions, groups: [group] });
  assert.deepEqual(
    rows.map((row) => row.kind),
    ["session", "group", "pointer"],
  );
  assert.deepEqual(rows[1].items.map(lineKey), [
    "h11",
    "h10",
    "h9",
    "plan-h8",
    "h28",
  ]);
  assert.equal(rows[2].groupMonth, "2026-08");
  assert.deepEqual(
    journalMonths(rows).map(({ month, rows: inMonth }) => [
      month,
      inMonth.length,
    ]),
    [
      ["2026-08", 2],
      ["2026-07", 1],
    ],
  );
  assert.deepEqual(groupFolded(rows[1].items).map(lineKey), [
    "h11",
    "h9",
    "plan-h8",
  ]);
  assert.equal(groupSpanText("2026-08-09", "2026-08-11", "fr"), "9 → 12 août");
  assert.equal(groupSpanText("2026-08-09", "2026-08-09", "fr"), "9 août");
});

// A span inside one month says the month once only where a day is a plain number
// before it (the registry's `rangeFirstMonth`); ja, zh, de and en write each
// date in full.
test("the span of nights says the month once in fr, in full in ja, de, en and zh", () => {
  assert.equal(monthSaidOnce("fr"), true);
  assert.equal(monthSaidOnce("pt-BR"), true);
  for (const locale of ["ja", "de", "en", "zh-Hans", "zh-Hant"])
    assert.equal(monthSaidOnce(locale), false, locale);
  const ja = groupSpanText("2026-10-17", "2026-10-18", "ja");
  assert.match(ja, /^10月17日 → 10月19日$/);
  const de = groupSpanText("2026-10-17", "2026-10-18", "de");
  assert.match(de, /^17\. Okt\.? → 19\. Okt\.?$/);
  assert.equal(
    spanText(
      [{ eveningDate: "2026-10-17" }, { eveningDate: "2026-10-18" }],
      "ja",
    ),
    "10月17日 → 10月18日",
  );
  assert.equal(
    spanText(
      [{ eveningDate: "2026-10-17" }, { eveningDate: "2026-10-18" }],
      "fr",
    ),
    "17 → 18 oct.",
  );
});

// No frame known is said as the cards say it, not « 0 poses ».
test("the figures line says « Poses non renseignées » when no frame is known", () => {
  const text = (segments) => segments.map((part) => part.text).join("");
  const stats = { sessions: 3, acquiredSeconds: 3600, frameCount: 0 };
  assert.match(
    text(statsSegments(stats, null, "fr")),
    / · Poses non renseignées$/,
  );
  assert.match(
    text(statsSegments(stats, 2026, "fr")),
    / · Poses non renseignées$/,
  );
  assert.match(text(statsSegments(stats, null, "ja")), /・枚数は未記入$/);
  assert.match(
    text(statsSegments(stats, null, "ru")),
    / · Число кадров не указано$/,
  );
  // The numbers before it stay the same bold values.
  assert.deepEqual(
    statsSegments(stats, null, "fr")
      .filter((part) => part.bold)
      .map((part) => part.text.replace(/\s/g, " ")),
    ["3", "1 h"],
  );
});

test("a night serving two plans stands inside both groups, once in the list of each", () => {
  const line = (key, eveningDate, projectId, projectIds = undefined) => ({
    sessionId: key,
    planId: null,
    eveningDate,
    projectId,
    ...(projectIds ? { projectIds } : {}),
  });
  const sessions = [
    line("n11", "2026-08-11", "heart"),
    line("n10", "2026-08-10", "veil", ["veil", "heart"]),
    line("n07", "2026-08-07", "veil"),
    line("n01", "2026-07-30", "heart"),
  ];
  const veil = {
    projectId: "veil",
    status: "active",
    lineKeys: ["n10", "n07"],
  };
  const heart = {
    projectId: "heart",
    status: "active",
    lineKeys: ["n11", "n10", "n01"],
  };
  // The night's own plan comes first.
  assert.deepEqual(
    groupsOfLine([heart, veil], sessions[1]).map((group) => group.projectId),
    ["veil", "heart"],
  );
  assert.deepEqual(groupsOfLine([heart, veil], sessions[0]), [heart]);
  const rows = journalRows({ sessions, groups: [heart, veil] });
  assert.deepEqual(
    rows.map((row) => [row.kind, row.group?.projectId]),
    [
      ["group", "heart"],
      ["group", "veil"],
      ["pointer", "heart"],
    ],
  );
  assert.deepEqual(rows[0].items.map(lineKey), ["n11", "n10", "n01"]);
  assert.deepEqual(rows[1].items.map(lineKey), ["n10", "n07"]);
  assert.equal(rows[2].item.sessionId, "n01");
  // A plain list of lines is unchanged: no group, one row per line.
  assert.deepEqual(
    journalRows({ sessions, groups: [] }).map((row) => row.kind),
    ["session", "session", "session", "session"],
  );
});
