import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { suggestNight } from "../src/suggest-night.js";
import {
  SUGGEST_RECOMPUTE_DELAY,
  suggestDialogModel,
  suggestRecountRequest,
  suggestionDefaults,
  suggestionCount,
} from "../src/suggest-dialog-model.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import { suggestionMessages, suggestMessage } from "../src/suggest-messages.js";
import { loadSuggestionHistory } from "../src/suggest-history-client.js";
import {
  previousNightNote,
  resetPreviousNightNotes,
} from "../src/previous-night-note.js";
import { conditionsNightSummary } from "../src/conditions-calendar.js";
import { base, at } from "./helpers/suggestion-cases.mjs";
const model = (
  proposal,
  selected = new Set(proposal.items.map((item) => item.target.id)),
  visual = false,
) =>
  suggestDialogModel({
    proposal,
    selected,
    locale: "fr",
    timeZone: "UTC",
    visual,
  });

test("photo and visual counts open on the drawn segments and bound custom counts", () => {
  // The placement opens on "Idéal" in photo, "Rapproché" in visual.
  assert.deepEqual(suggestionDefaults(false), {
    count: 3,
    segments: [2, 3, 4],
    placement: "ideal",
  });
  assert.deepEqual(suggestionDefaults(true), {
    count: 8,
    segments: [5, 8, 12],
    placement: "chained",
  });
  assert.equal(suggestionCount(0), 1);
  assert.equal(suggestionCount(21), 20);
});
test("no count primary, no way back: the retired words are gone in every language, the search status is there", () => {
  for (const [locale, copy] of Object.entries(suggestionMessages)) {
    for (const key of [
      "suggestCount",
      "suggestCountOne",
      "suggestPossible",
      "suggestBack",
      "suggestPhoto",
      "suggestVisual",
    ])
      assert.equal(copy[key], undefined, `${locale} ${key}`);
  }
  assert.equal(
    suggestMessage("fr", "suggestSearching", { count: 4 }),
    "Recherche de 4 cibles…",
  );
  assert.equal(
    suggestMessage("fr", "suggestSearchingOne"),
    "Recherche de 1 cible…",
  );
});
test("estimates use the engine median and visual twenty-minute slots", () => {
  assert.equal(
    model(suggestNight({ ...base, count: 3 })).estimate,
    "Environ 8 créneaux de 1 h 30.",
  );
  assert.equal(
    model(suggestNight({ ...base, count: 8, mode: "visual" }), undefined, true)
      .estimate,
    "Environ 36 créneaux de 20 min.",
  );
});
test("the estimate reads « 1 slot », never « 1 slots », in every language", () => {
  const sentence = (locale, count) =>
    suggestMessage(locale, "suggestEstimatePhoto", { count, duration: "3 h" });
  assert.equal(sentence("en", 1), "About 1 slot of 3 h.");
  assert.equal(sentence("en", 2), "About 2 slots of 3 h.");
  assert.equal(sentence("fr", 1), "Environ 1 créneau de 3 h.");
  assert.equal(sentence("fr", 8), "Environ 8 créneaux de 3 h.");
  assert.equal(sentence("de", 1), "Etwa 1 Zeitfenster von 3 h.");
  assert.equal(sentence("es", 1), "Una franja de 3 h, aproximadamente.");
  assert.equal(sentence("pt-BR", 1), "Cerca de 1 intervalo de 3 h.");
  assert.equal(sentence("ru", 1), "Примерно 1 интервал по 3 h.");
  assert.equal(sentence("ru", 3), "Примерно 3 интервала по 3 h.");
  assert.equal(sentence("ru", 8), "Примерно 8 интервалов по 3 h.");
  assert.equal(sentence("ja", 1), "約1枠（各3 h）。");
  assert.equal(sentence("zh-Hant", 1), "大約1個時段，每個3 h。");
  for (const locale of Object.keys(suggestionMessages)) {
    assert.doesNotMatch(
      suggestMessage(locale, "suggestEstimateVisual", { count: 1 }),
      /1 (slots|créneaux|franjas|intervalos|интервалов|Zeitfenster\b(?! von))/,
      locale,
    );
  }
});
test("toggling releases and joins time without recalculating any target", () => {
  const proposal = suggestNight({ ...base, count: 3 });
  const before = structuredClone(proposal);
  const drawn = model(proposal, new Set());
  assert.deepEqual(proposal, before);
  assert.ok(drawn.items.every((item) => !item.selected));
  assert.equal(drawn.free[0].startMinute, proposal.window.startMinute);
  assert.equal(drawn.free.at(-1).endMinute, proposal.window.endMinute);
  assert.match(drawn.timelineLabel, /décochée/);
});
test("continuations retain their progress and are grouped before ordinary night targets", () => {
  const proposal = suggestNight({
    ...base,
    count: 3,
    continuing: [
      {
        id: "t00",
        acquiredMinutes: 250,
        goalMinutes: 720,
        projectName: "NGC 7000",
      },
    ],
  });
  const rows = model(proposal).items;
  assert.equal(
    rows.filter((row) => row.group === "continue")[0].progress.acquiredMinutes,
    250,
  );
  assert.equal(
    suggestMessage("fr", "suggestProgress", {
      acquired: "4 h 10",
      goal: "12 h",
      name: "NGC 7000",
    }),
    "4 h 10 sur 12 h · plan multi-nuits NGC 7000",
  );
});
test("captured targets and later decades carry the switch and tier words", () => {
  const proposal = suggestNight({
    ...base,
    count: 3,
    history: [{ id: "t00", date: "2026-10-03", outcome: "done" }],
    tier: 2,
  });
  assert.equal(proposal.captured.length, 1);
  assert.deepEqual(proposal.position, { from: 11, to: 20 });
  assert.equal(
    suggestMessage("fr", "suggestPosition", proposal.position),
    "Suggestions 11 à 20",
  );
  assert.equal(
    suggestMessage("fr", "suggestAllTicked"),
    "Tout est coché : décochez une cible pour la remplacer.",
  );
});
test("a night too short opens the empty state with its cause rather than blocking entry", () => {
  // The cause decides the sentence; no detail line repeats it.
  const proposal = suggestNight({
    ...base,
    count: 3,
    span: { start: at(0), end: at(25) },
  });
  assert.equal(proposal.items.length, 0);
  const drawn = model(proposal);
  assert.equal(drawn.nothingCause, "nightShort");
  assert.equal(
    drawn.nothingTitle.replaceAll("\u00a0", " "),
    "Cette nuit ne dure que 25 min : pas assez pour une cible.",
  );
  assert.equal(drawn.nothingDetail, "");
});
test("shortfall info lists real free slots and the estimate info gives the division", () => {
  const proposal = suggestNight({
    ...base,
    candidates: base.candidates.slice(0, 1),
    count: 20,
  });
  const drawn = model(proposal);
  assert.ok(drawn.shortfallDetail.length);
  // The lines of the free slots keep the no-break space before the colon, so a
  // line never wraps just before it.
  for (const line of drawn.shortfallDetail) {
    assert.match(line, /\d\u00a0: /, line);
    assert.doesNotMatch(line, / :/, line);
  }
  assert.match(
    drawn.estimateDetail,
    /12 h libres dans la nuit, environ 1 h 30 par cible/,
  );
  assert.ok(drawn.shortfallReason);
});
test("each locale has the same suggestion sentences, in the same order", () => {
  const locales = [
    "en",
    "fr",
    "ja",
    "de",
    "es",
    "it",
    "pt",
    "pt-BR",
    "ru",
    "zh-Hans",
    "zh-Hant",
  ];
  assert.equal(
    suggestMessage("zh", "suggestAction"),
    suggestMessage("zh-Hans", "suggestAction"),
  );
  assert.notEqual(
    suggestMessage("zh", "suggestAction"),
    suggestMessage("zh-Hant", "suggestAction"),
  );
  const keys = Object.keys(suggestionMessages.fr);
  for (const locale of locales)
    assert.deepEqual(Object.keys(suggestionMessages[locale]), keys);
});
test("the journal reader gives one row per target and night, with what the malus reads", async () => {
  const place = { id: "home", latitude: 45, longitude: -30 };
  const read = async (path) => {
    if (path === "/api/v1/plans")
      return {
        plans: [
          {
            id: "p",
            payload: {
              date: "2026-10-03",
              equipment: { mode: "visual" },
              location: place,
            },
          },
          {
            id: "q",
            payload: {
              date: "2026-09-20",
              equipment: { mode: "imaging" },
              location: place,
            },
          },
        ],
      };
    if (path.startsWith("/api/v1/sessions?"))
      return {
        sessions: [
          { id: "s", planId: "p", status: "finished", finishedAt: at(30) },
          { id: "t", planId: "q", status: "finished", finishedAt: at(30) },
          { id: "open", status: "open" },
        ],
      };
    if (path.endsWith("/s"))
      return {
        debriefSummary: {
          perTarget: [
            { targetId: "m31", outcome: "done", acquiredMinutes: 25 },
            { targetId: "m45", outcome: "abandoned" },
          ],
        },
      };
    if (path.endsWith("/t"))
      return {
        debriefSummary: {
          perTarget: [
            {
              targetId: "m31",
              outcome: "done",
              acquiredMinutes: 120,
              plannedMinutes: 120,
            },
            {
              targetId: "m33",
              outcome: "partial",
              acquiredMinutes: 40,
              plannedMinutes: 90,
            },
            { targetId: "m45", outcome: "abandoned", acquiredMinutes: 0 },
          ],
        },
      };
    if (path.includes("/events?"))
      return {
        events: [
          {
            eventId: "a",
            type: "target_started",
            recordedAt: at(0),
            payload: { targetId: "m57" },
          },
          {
            eventId: "b",
            type: "target_finished",
            recordedAt: at(20),
            payload: { targetId: "m57" },
          },
        ],
      };
    throw new Error(path);
  };
  const asked = [];
  const rows = await loadSuggestionHistory({
    read,
    previousNightNote: async (date, where) => {
      asked.push([date, where]);
      return date === "2026-09-20" ? 61 : null;
    },
  });
  assert.deepEqual(rows, [
    {
      id: "m31",
      date: "2026-10-03",
      outcome: "done",
      mode: "visual",
      acquiredMinutes: 25,
      placeId: "home",
      latitude: 45,
      longitude: -30,
    },
    {
      id: "m57",
      date: "2026-10-03",
      outcome: "observed",
      mode: "visual",
      acquiredMinutes: 20,
      placeId: "home",
      latitude: 45,
      longitude: -30,
    },
    {
      id: "m31",
      date: "2026-09-20",
      outcome: "done",
      mode: "photo",
      acquiredMinutes: 120,
      plannedMinutes: 120,
      placeId: "home",
      latitude: 45,
      longitude: -30,
      noteThen: 61,
    },
    {
      id: "m33",
      date: "2026-09-20",
      outcome: "partial",
      mode: "photo",
      acquiredMinutes: 40,
      plannedMinutes: 90,
      placeId: "home",
      latitude: 45,
      longitude: -30,
      noteThen: 61,
    },
  ]);
  // One question per night and place; abandoned targets never enter.
  assert.deepEqual(
    asked.map(([date]) => date),
    ["2026-10-03", "2026-09-20"],
  );
  assert.deepEqual(asked[0][1], { id: "home", latitude: 45, longitude: -30 });
  // The default seam knows nothing: no note, no error.
  const unknown = await loadSuggestionHistory({ read });
  assert.ok(unknown.every((row) => !("noteThen" in row)));
  // A seam that fails leaves the rows without a note.
  const failed = await loadSuggestionHistory({
    read,
    previousNightNote: async () => {
      throw new Error("offline");
    },
  });
  assert.ok(failed.every((row) => !("noteThen" in row)));
});

test("tonight's note comes from the summary, the chosen slot's hours when there is one; the previous night's note only lifts through the seam", async () => {
  const { suggestionNoteNow } = await import("../src/suggestion-note.js");
  const hourly = [60, 70, 80, 90].map((score, hour) => ({
    time: at(hour * 60),
    score,
  }));
  assert.equal(suggestionNoteNow({ summary: { score: 74.4 } }), 74);
  assert.equal(suggestionNoteNow({}), null);
  assert.equal(suggestionNoteNow({ summary: { score: null } }), null);
  assert.equal(
    suggestionNoteNow({
      summary: { score: 74 },
      hourly,
      span: { start: at(60), end: at(180) },
    }),
    75,
  );
  assert.equal(
    suggestionNoteNow({ summary: { score: 74 }, hourly, span: null }),
    74,
  );
  // The seam answering null gives no credit; with a value the malus is lifted.
  const malus = async (note) => {
    const history = await loadSuggestionHistory({
      read: async (path) => {
        if (path === "/api/v1/plans")
          return {
            plans: [
              {
                id: "p",
                payload: { date: "2026-10-13", location: { latitude: 45 } },
              },
            ],
          };
        if (path.startsWith("/api/v1/sessions?"))
          return { sessions: [{ id: "s", planId: "p", status: "finished" }] };
        return {
          debriefSummary: { perTarget: [{ targetId: "t00", outcome: "done" }] },
        };
      },
      previousNightNote: async () => note,
    });
    return suggestNight({
      ...base,
      candidates: base.candidates.slice(0, 6),
      layout: "list",
      count: 10,
      noteNow: 85,
      history,
    }).items.find((item) => item.target.id === "t00").previous.malus;
  };
  const unknown = await malus(null);
  assert.ok(unknown > 30, `no note, no credit (${unknown})`);
  assert.equal(await malus(30), 0);
});

// The seam is wired on the measured archive. A month of measured hours
// (`GET /v1/weather/history`) with an overcast night on the 13th.
const measuredMonth = () => {
  const start = Date.UTC(2026, 9, 1);
  const time = Array.from(
    { length: 31 * 24 },
    (_, index) => (start + index * 3600000) / 1000,
  );
  const cover = time.map((_, index) =>
    Math.floor(index / 24) === 12 || Math.floor(index / 24) === 13 ? 95 : 3,
  );
  return {
    hourly: {
      time,
      cloud_cover: cover,
      cloud_cover_low: cover,
      cloud_cover_mid: cover.map(() => 0),
      cloud_cover_high: cover.map(() => 0),
      precipitation: cover.map(() => 0),
      wind_speed_10m: cover.map(() => 8),
      relative_humidity_2m: cover.map(() => 70),
    },
  };
};
const where = { id: "home", latitude: 45, longitude: -30 };
const historyOf = async (note) =>
  loadSuggestionHistory({
    read: async (path) => {
      if (path === "/api/v1/plans")
        return {
          plans: [
            {
              id: "p",
              payload: { date: "2026-10-13", location: { ...where } },
            },
          ],
        };
      if (path.startsWith("/api/v1/sessions?"))
        return { sessions: [{ id: "s", planId: "p", status: "finished" }] };
      return {
        debriefSummary: { perTarget: [{ targetId: "t00", outcome: "done" }] },
      };
    },
    previousNightNote: note,
  });
const malusOf = (history) =>
  suggestNight({
    ...base,
    candidates: base.candidates.slice(0, 6),
    layout: "list",
    count: 10,
    noteNow: 85,
    history,
  }).items.find((item) => item.target.id === "t00").previous.malus;

test("the previous night's note comes from the measured archive: a past night with a known archive gives noteThen", async () => {
  resetPreviousNightNotes();
  let reads = 0;
  const archive = async (coordinates, month) => {
    reads += 1;
    assert.deepEqual(coordinates, { latitude: 45, longitude: -30 });
    assert.equal(month, "2026-10");
    return measuredMonth();
  };
  const expected = Math.round(
    conditionsNightSummary("2026-10-13", where, measuredMonth(), true).score,
  );
  assert.ok(expected < 60, `an overcast night is a low note (${expected})`);
  assert.equal(
    await previousNightNote("2026-10-13", where, { history: archive }),
    expected,
  );
  // Kept per (date, place): asked again, the archive is not read again.
  assert.equal(
    await previousNightNote("2026-10-13", where, { history: archive }),
    expected,
  );
  assert.equal(reads, 1);
  // Through the history of the suggestions the row carries it, and the malus
  // is lifted since tonight (85) brings far more than that night did.
  const rows = await historyOf((date, place) =>
    previousNightNote(date, place, { history: archive }),
  );
  assert.equal(rows.find((row) => row.id === "t00").noteThen, expected);
  assert.equal(malusOf(rows), 0);
  assert.equal(reads, 1, "the draw does not work the night out again");
});

test("without the archive the previous night's note is null and the malus stays full", async () => {
  resetPreviousNightNotes();
  const offline = async () => {
    throw new TypeError("offline");
  };
  assert.equal(
    await previousNightNote("2026-10-13", where, { history: offline }),
    null,
  );
  // An archive without rows for the night, a place without coordinates.
  assert.equal(
    await previousNightNote("2026-10-13", where, {
      history: async () => ({ hourly: { time: [] } }),
    }),
    null,
  );
  assert.equal(
    await previousNightNote(
      "2026-10-13",
      { id: "home" },
      { history: async () => measuredMonth() },
    ),
    null,
  );
  const rows = await historyOf((date, place) =>
    previousNightNote(date, place, { history: offline }),
  );
  assert.ok(rows.every((row) => !("noteThen" in row)));
  assert.ok(malusOf(rows) > 30, "no credit: the full malus");
  // The unknown answer is not kept: the archive is read when it is back.
  assert.ok(
    Number.isFinite(
      await previousNightNote("2026-10-13", where, {
        history: async () => measuredMonth(),
      }),
    ),
  );
});

test("the retired dialog and its messages no longer exist on the web", async () => {
  const { messages } = await import("portal/i18n.js");
  for (const copy of Object.values(messages)) {
    assert.equal(copy.autoFillAction, undefined);
    assert.equal(copy.autoFillNoRoom, undefined);
    assert.ok(
      !Object.values(copy).some(
        (value) =>
          typeof value === "string" && value.includes("Remplir la nuit"),
      ),
    );
  }
  const { existsSync } = await import("node:fs");
  assert.equal(
    existsSync(
      new URL("../src/components/AutoFillNightDialog.js", import.meta.url),
    ),
    false,
  );
});

test("requesting others retains checked slots and leaves replaced targets out", () => {
  const initial = suggestNight({ ...base, count: 3 });
  const kept = [initial.items[0]];
  const next = suggestNight({
    ...base,
    count: 3,
    tier: 2,
    kept,
    excluded: initial.items.slice(1).map((row) => row.target.id),
    seed: "synthetic",
  });
  const retained = next.items.find(
    (row) => row.target.id === kept[0].target.id,
  );
  assert.equal(retained.startMinute, kept[0].startMinute);
  assert.equal(retained.endMinute, kept[0].endMinute);
  assert.ok(
    next.items.every(
      (row) =>
        !initial.items.slice(1).some((old) => old.target.id === row.target.id),
    ),
  );
});
test("apply recalculates checked ids without moving an existing occupied slot", () => {
  const initial = suggestNight({ ...base, count: 3 });
  const ids = initial.items.slice(1).map((row) => row.target.id);
  const placed = { id: "existing", startMinute: 0, endMinute: 90 };
  const before = structuredClone(placed);
  const applied = suggestNight({
    ...base,
    items: [placed],
    count: ids.length,
    only: ids,
  });
  assert.deepEqual(placed, before);
  assert.ok(applied.items.every((row) => ids.includes(row.target.id)));
  assert.ok(applied.items.every((row) => row.startMinute >= 90));
});
test("journal paging consumes successive cursors and does not duplicate inclusive rows", async () => {
  let pages = 0,
    details = 0;
  const result = await loadSuggestionHistory({
    read: async (path) => {
      if (path === "/api/v1/plans")
        return { plans: [{ id: "p", payload: { date: "2026-10-03" } }] };
      if (path.startsWith("/api/v1/sessions?")) {
        pages++;
        return {
          sessions: [{ id: "s", planId: "p", status: "finished" }],
          nextSince: pages === 1 ? "next" : null,
        };
      }
      details++;
      return {
        debriefSummary: { perTarget: [{ targetId: "m31", outcome: "done" }] },
      };
    },
  });
  assert.equal(pages, 2);
  assert.equal(details, 1);
  assert.equal(result.length, 1);
});

// The web dialog in one step and the spacing under "Autres suggestions".
await registerJsx();
const { SuggestNightContent } =
  await import("planner/components/SuggestNightDialog.js");
const css = readFileSync(
  new URL("../../portal-app/styles/portal.css", import.meta.url),
  "utf8",
);
const rule = (selector) => {
  const at = css.indexOf(`\n${selector} {`);
  assert.ok(at >= 0, selector);
  return css.slice(at, css.indexOf("}", at));
};
const content = (props = {}) => {
  const proposal = props.proposal || suggestNight({ ...base, count: 3 });
  const selected =
    props.selected || new Set(proposal.items.map((item) => item.target.id));
  return renderToStaticMarkup(
    createElement(SuggestNightContent, {
      locale: "fr",
      proposal,
      model: { ...model(proposal, selected), locale: "fr" },
      contextLine: "Camping du Lac Noir · nuit du 14 oct.",
      equipmentLine: "Lunette 72 mm · caméra couleur",
      count: 3,
      ...props,
    }),
  );
};
const text = (markup) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&#x27;", "'")
    .replace(/\s+/g, " ")
    .trim();

test("the web dialog in one step — the count, then the timeline and the list in the same body; one title, no way back", () => {
  const markup = content();
  const count = markup.indexOf('aria-label="Nombre de cibles"');
  const list = markup.indexOf("planner-autofill-list");
  assert.ok(count > 0 && list > count, "the list right under the count");
  assert.ok(markup.includes("planner-autofill-frise"));
  assert.ok(!text(markup).includes("Revenir au nombre de cibles"));
  assert.ok(!text(markup).includes("Suggérer 3 cibles"));
  // The reminder line of the old second step is gone.
  assert.ok(!text(markup).includes("· photo ·"));
  const source = readFileSync(
    new URL("../src/components/SuggestNightDialog.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /title=\{say\("suggestAction"\)\}/);
  assert.doesNotMatch(source, /suggestBack|suggestTitle|startOnList/);
});
test("five separated choices on the whole width, and the stepper of « Autre » at the specified proportions", () => {
  assert.match(
    rule(".planner-suggest-segments"),
    /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\) minmax\(0, 2fr\) minmax\(\s*0,\s*1\.35fr\s*\)/,
  );
  assert.match(rule(".planner-suggest-segment"), /border: 1px solid/);
  const stepper = rule(".planner-suggest-stepper button");
  assert.match(stepper, /width: 48px/);
  assert.match(stepper, /height: 48px/);
  const output = rule(".planner-suggest-stepper output");
  assert.match(output, /font-size: 20px/);
  assert.match(output, /font-weight: 600/);
  assert.match(output, /font-variant-numeric: tabular-nums/);
  const markup = content({ custom: true, count: 6 });
  assert.match(
    markup,
    /class="planner-suggest-stepper"><span>Combien \?<\/span><button class="btn-tertiary"[^>]*aria-label="Une cible de moins"/,
  );
  assert.match(markup, /<output>6<\/output>/);
  assert.match(markup, /role="radio" aria-checked="true"[^>]*>Autre<\/button>/);
});
test("8 px between « Autres suggestions » and its sentence, 12 px above the line", () => {
  assert.match(rule(".planner-suggest-others"), /gap: 8px/);
  assert.match(
    rule(".planner-suggest-dialog .planner-autofill-body"),
    /gap: 12px/,
  );
  const markup = content();
  assert.match(
    markup,
    /class="planner-suggest-others"><div class="planner-suggest-others-line">.*Autres suggestions<\/button><\/div><p class="planner-autofill-muted planner-suggest-others-help">/,
  );
});
test("« Autres suggestions » in the ten languages, a button on one line at its natural width, the caption yields", () => {
  const words = {
    en: "More suggestions",
    fr: "Autres suggestions",
    ja: "他の候補",
    de: "Weitere Vorschläge",
    es: "Más sugerencias",
    it: "Altri suggerimenti",
    pt: "Mais sugestões",
    "pt-BR": "Mais sugestões",
    ru: "Другие предложения",
    "zh-Hans": "其他建议",
    "zh-Hant": "其他建議",
  };
  assert.deepEqual(
    Object.keys(suggestionMessages).sort(),
    Object.keys(words).sort(),
  );
  for (const [locale, word] of Object.entries(words))
    assert.equal(suggestMessage(locale, "suggestOthers"), word, locale);
  assert.equal(suggestMessage("zh", "suggestOthers"), "其他建议");
  const button = rule(".planner-suggest-others-line > button");
  assert.match(button, /flex: none/);
  assert.match(button, /white-space: nowrap/);
  assert.match(rule(".planner-suggest-others-line > p"), /flex: 1 1 8rem/);
});
test("while a new count is computed, the old result stays dimmed and inert, with the star and « Recherche de 4 cibles… »", () => {
  const markup = content({ recomputing: true, count: 4 });
  assert.ok(text(markup).includes("Recherche de 4 cibles…"));
  assert.ok(markup.includes("data-brand-loader"));
  assert.match(markup, /planner-suggest-timeline planner-suggest-dimmed/);
  assert.match(
    markup,
    /planner-suggest-groups planner-suggest-dimmed" inert=""/,
  );
  const searching = markup.indexOf("planner-suggest-searching");
  assert.ok(searching > markup.indexOf("planner-autofill-frise"));
  assert.ok(searching < markup.indexOf("planner-autofill-list"));
  assert.ok(!content().includes("planner-suggest-searching"));
  assert.equal(SUGGEST_RECOMPUTE_DELAY, 250);
});
test("a new count keeps the ticked targets in their slots; fewer than are ticked makes the list again", () => {
  const initial = suggestNight({ ...base, count: 3 });
  const selected = new Set(initial.items.slice(0, 2).map((i) => i.target.id));
  const more = suggestRecountRequest({
    proposal: initial,
    selected,
    count: 4,
    tier: 1,
  });
  assert.deepEqual(
    more.kept.map((i) => i.target.id),
    [...selected],
  );
  const next = suggestNight({ ...base, ...more });
  for (const kept of more.kept) {
    const row = next.items.find((i) => i.target.id === kept.target.id);
    assert.equal(row.startMinute, kept.startMinute);
    assert.equal(row.endMinute, kept.endMinute);
  }
  assert.ok(next.items.length > more.kept.length);
  assert.deepEqual(
    suggestRecountRequest({ proposal: initial, selected, count: 1 }).kept,
    [],
  );
  assert.equal(
    suggestRecountRequest({ proposal: initial, selected, count: "all" }).kept
      .length,
    2,
  );
});
test("« Rien à proposer » keeps its buttons in the body, in place of the list: « Fermer » as a link, and one primary only where it leads somewhere", () => {
  const proposal = suggestNight({
    ...base,
    count: 3,
    span: { start: at(0), end: at(25) },
  });
  // Nothing leads anywhere: "Fermer" alone.
  const alone = content({ proposal });
  assert.match(
    alone,
    /class="planner-suggest-nothing-actions"><button class="btn-link"[^>]*>Fermer<\/button><\/div>/,
  );
  assert.ok(!alone.includes("Ouvrir la frise"));
  assert.ok(!alone.includes("planner-autofill-list"));
  // A short night leads to the next one: a link and the primary.
  const next = content({
    proposal,
    nextNightDate: "2026-10-15",
    onNextNight: () => {},
  });
  assert.match(
    next,
    /class="planner-suggest-nothing-actions"><button class="btn-link"[^>]*>Fermer<\/button><button class="btn-primary"[^>]*data-testid="suggest-next-night"[^>]*>Suggérer pour la nuit du [^<]*<\/button><\/div>/,
  );
});

test("a suggested row of a target the plan already holds says it is added once more", () => {
  const proposal = suggestNight({ ...base, count: 3 });
  const held = proposal.items[0].target.id;
  const markup = content({ proposal, alreadyInPlanIds: [`${held}`] });
  assert.match(
    markup,
    new RegExp(`data-testid="suggest-already-in-plan-${held}"`),
  );
  assert.equal(markup.match(/suggest-already-in-plan-/g).length, 1);
  assert.ok(
    text(markup).includes("Déjà dans ce plan"),
    "the line is the French one",
  );
  assert.ok(
    !content({ proposal }).includes("suggest-already-in-plan-"),
    "no line for a plan that holds none of them",
  );
});
