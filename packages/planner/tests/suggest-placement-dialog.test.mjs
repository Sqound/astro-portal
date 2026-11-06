// The "Placement" block of the web dialog, its defaults by mode, and the chain
// the dialog draws over the ticked targets.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import { suggestNight } from "../src/suggest-night.js";
import {
  suggestChainRequest,
  suggestDialogModel,
  suggestPlacementRequest,
  suggestRecountRequest,
  suggestPreviousLine,
  suggestShownItems,
  suggestTimelineNumbers,
  SUGGEST_DIGIT_WIDTH,
  suggestionDefaults,
  suggestionPlacements,
} from "../src/suggest-dialog-model.js";
import { suggestionMessages, suggestMessage } from "../src/suggest-messages.js";
import { candidate, night } from "./helpers/suggestion-cases.mjs";

await registerJsx();
const { SuggestNightContent, SuggestTimeline } =
  await import("planner/components/SuggestNightDialog.js");
const css = readFileSync(
  new URL("../../portal-app/styles/portal.css", import.meta.url),
  "utf8",
);

// Eight targets, one every 45 minutes of culmination, a wait for two of them.
const pool = Array.from({ length: 6 }, (_, index) =>
  candidate(`p${index}`, {
    score: 90 - index,
    minutes: 60,
    centre: 100 + index * 90,
    from: index === 3 ? 330 : 0,
  }),
);
const proposeWith = (options = {}) =>
  suggestNight({
    night,
    mode: "imaging",
    candidates: pool,
    count: 4,
    ...options,
  });
const ids = (proposal) => proposal.items.map((entry) => entry.target.id);
const ticked = (proposal, skip = []) =>
  new Set(ids(proposal).filter((id) => !skip.includes(id)));
const model = (proposal, selected, extra = {}) =>
  suggestDialogModel({
    proposal,
    selected,
    locale: "fr",
    timeZone: "UTC",
    ...extra,
  });
const content = (placement, proposal = proposeWith()) =>
  renderToStaticMarkup(
    createElement(SuggestNightContent, {
      locale: "fr",
      proposal,
      model: {
        ...model(proposal, ticked(proposal), { placement }),
        locale: "fr",
      },
      contextLine: "Camping du Lac Noir · nuit du 14 oct.",
      equipmentLine: "Lunette 72 mm · caméra couleur",
      count: 4,
      placement,
    }),
  );
const text = (markup) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&#x27;", "’")
    .replace(/\s+/g, " ")
    .trim();

test("the dialog opens on the plan's mode: visual « Rapproché », photo « Idéal »", () => {
  assert.equal(suggestionDefaults(true).placement, "chained");
  assert.equal(suggestionDefaults(false).placement, "ideal");
  assert.deepEqual([...suggestionPlacements], ["ideal", "chained"]);
});

test("the block « Placement » stands under the estimate, above the timeline, as a two-choice radio group", () => {
  for (const placement of ["ideal", "chained"]) {
    const markup = content(placement);
    const estimate = markup.indexOf("créneaux de");
    const heading = markup.indexOf("<h3>Placement</h3>");
    const group = markup.indexOf('aria-label="Placement des cibles"');
    const frise = markup.indexOf("planner-autofill-frise");
    assert.ok(estimate > 0 && heading > estimate, "under the estimate");
    assert.ok(group > heading && frise > group, "above the timeline");
    assert.match(
      markup,
      /class="planner-suggest-segments planner-suggest-segments--placement" role="radiogroup" aria-label="Placement des cibles"/,
    );
    // Two radios, "Idéal" then "Rapproché", the chosen one checked.
    const radios = [
      ...markup
        .slice(group, frise)
        .matchAll(/aria-checked="(true|false)"[^>]*>([^<]+)</g),
    ].map((match) => [match[2], match[1]]);
    assert.deepEqual(radios, [
      ["Idéal", String(placement === "ideal")],
      ["Rapproché", String(placement === "chained")],
    ]);
  }
});

test("one help line says the chosen mode, with its ⓘ", () => {
  assert.match(
    text(content("ideal")),
    /Chaque cible à son meilleur moment\. ⓘ/,
  );
  assert.match(text(content("chained")), /Chaque cible suit la précédente\. ⓘ/);
  assert.match(
    content("chained"),
    /aria-label="Comment les cibles sont placées"[^>]*>ⓘ</,
  );
  // The ⓘ says the rule of "Rapproché": the best-rated visible target
  // next, never more than 10 min of wait, the list stopping otherwise.
  const detail = suggestMessage("fr", "suggestPlacementDetail");
  assert.match(
    detail,
    /^Idéal\u00a0: chaque cible est placée là où elle est la mieux placée, quitte à attendre entre deux\. Rapproché\u00a0: /,
  );
  assert.match(detail, /la mieux notée des cibles visibles prend la suite/);
  assert.match(detail, /ne dépasse jamais 10\u00a0min\./);
  assert.match(detail, /la liste s’arrête là\.$/);
  assert.doesNotMatch(detail, /au plus haut/);
});

test("the help of « Rapproché » promises no absence of wait: the same sentence when the chain waits and when it does not", () => {
  // p3 rises 5 min after p5 ends — a wait of the chain, under 10 min.
  const rising = pool.map((entry, index) =>
    index === 3
      ? candidate("p3", { score: 87, minutes: 60, centre: 370, from: 305 })
      : entry,
  );
  const chained = proposeWith({
    placement: "chained",
    count: 6,
    candidates: rising,
  });
  const waits = (proposal) =>
    proposal.items.some(
      (entry, index) =>
        index > 0 && entry.startMinute > proposal.items[index - 1].endMinute,
    );
  const without = proposeWith({ placement: "chained", count: 2 });
  assert.equal(waits(chained), true, "the pool makes a chain that waits");
  assert.equal(waits(without), false, "and one that does not");
  for (const proposal of [chained, without]) {
    const shown = text(content("chained", proposal));
    assert.match(shown, /Chaque cible suit la précédente\. ⓘ/);
    assert.doesNotMatch(shown, /sans attente|sans attendre/);
  }
  // No locale keeps the old promise ("sans attente", "ohne Wartezeit", …).
  const promises =
    /sans attente|no waiting|sin esperas|senza attese|待ち時間なし|ohne Wartezeit|sem espera|без ожидания|不等待/;
  for (const [locale, messages] of Object.entries(suggestionMessages)) {
    assert.doesNotMatch(
      messages.suggestPlacementChainedHelp,
      promises,
      `${locale}: the help of « Rapproché » promises no wait`,
    );
  }
});

test("the two choices share the width equally, like the count's choices share theirs", () => {
  assert.match(
    css,
    /\.planner-suggest-segments--placement \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);\s*\}/,
  );
  assert.match(
    css,
    /\.planner-suggest-placement h3 \{\s*margin: 0;\s*font-size: 15px;/,
  );
});

test("every locale carries the new words, and French is the specified one", () => {
  const keys = [
    "suggestPlacement",
    "suggestPlacementLabel",
    "suggestPlacementIdeal",
    "suggestPlacementChained",
    "suggestPlacementIdealHelp",
    "suggestPlacementChainedHelp",
    "suggestPlacementHint",
    "suggestPlacementDetail",
  ];
  for (const [locale, copy] of Object.entries(suggestionMessages))
    for (const key of keys)
      assert.ok(
        typeof copy[key] === "string" && copy[key].length > 1,
        `${locale} ${key}`,
      );
  assert.equal(Object.keys(suggestionMessages).length, 11);
  assert.equal(suggestMessage("fr", "suggestPlacement"), "Placement");
  assert.equal(
    suggestMessage("fr", "suggestPlacementLabel"),
    "Placement des cibles",
  );
  assert.equal(suggestMessage("fr", "suggestPlacementIdeal"), "Idéal");
  assert.equal(suggestMessage("fr", "suggestPlacementChained"), "Rapproché");
  assert.equal(
    suggestMessage("en", "suggestPlacementChained"),
    "Close together",
  );
});

test("« Rapproché »: the dialog draws the chain over the ticked targets, its own free time, and keeps the numbers", () => {
  const proposal = proposeWith({ placement: "chained" });
  const skipped = ids(proposal)[1];
  const selected = ticked(proposal, [skipped]);
  const chain = suggestNight({
    night,
    mode: "imaging",
    candidates: pool,
    ...suggestChainRequest({ proposal, selected }),
  });
  assert.deepEqual(
    chain.items.map((entry) => entry.target.id),
    ids(proposal).filter((id) => id !== skipped),
  );
  const drawn = model(proposal, selected, { placement: "chained", chain });
  // The numbers are those of the list; the unticked target has no slot left.
  assert.deepEqual(
    drawn.items.map((entry) => [entry.target.id, entry.number, entry.selected]),
    ids(proposal).map((id, index) => [id, index + 1, id !== skipped]),
  );
  assert.deepEqual(
    drawn.free.map((slot) => [slot.startMinute, slot.endMinute]),
    chain.free.map((slot) => [slot.startMinute, slot.endMinute]),
  );
  for (const entry of drawn.items.filter((entry) => entry.selected)) {
    const made = chain.items.find((item) => item.target.id === entry.target.id);
    assert.equal(entry.startMinute, made.startMinute);
    assert.equal(entry.endMinute, made.endMinute);
  }
  // "Idéal" keeps its way: an unticked target is a free block at its slot.
  const ideal = model(proposal, selected, { placement: "ideal" });
  assert.ok(ideal.free.some((slot) => slot.target?.id === skipped));
  assert.ok(!drawn.free.some((slot) => slot.target?.id === skipped));
});

test("« Dans l'ordre de la nuit » follows the hours after a tick: the list, its numbers and the timeline's", () => {
  // "Idéal" spreads the targets over the night; unticking one makes the
  // chain close up over the others, while the unticked one keeps its old slot.
  const proposal = proposeWith({ count: 4 });
  for (const skipIndex of [0, 1, 2]) {
    const skipped = ids(proposal)[skipIndex];
    const selected = ticked(proposal, [skipped]);
    const chain = suggestNight({
      night,
      mode: "imaging",
      candidates: pool,
      ...suggestChainRequest({ proposal, selected }),
    });
    const drawn = model(proposal, selected, { placement: "chained", chain });
    const starts = drawn.items.map((entry) => entry.startMinute);
    assert.deepEqual(
      starts,
      [...starts].sort((a, b) => a - b),
      `unticking ${skipped}: the entries follow the hours`,
    );
    assert.deepEqual(
      drawn.items.map((entry) => entry.number),
      drawn.items.map((_, index) => index + 1),
      "the numbers count the entries in that order",
    );
    // The ticked targets keep the order of the chain among themselves.
    assert.deepEqual(
      drawn.items.filter((entry) => entry.selected).map((e) => e.target.id),
      chain.items.map((entry) => entry.target.id),
    );
    assert.deepEqual(
      suggestShownItems({
        proposal,
        chain,
        selected,
        placement: "chained",
      }).map((entry) => entry.target.id),
      drawn.items.map((entry) => entry.target.id),
    );
  }
  // At least one tick breaks the proposal's own order: the sort is at work.
  const first = ids(proposal)[0];
  const chain = suggestNight({
    night,
    mode: "imaging",
    candidates: pool,
    ...suggestChainRequest({ proposal, selected: ticked(proposal, [first]) }),
  });
  assert.notDeepEqual(
    suggestShownItems({
      proposal,
      chain,
      selected: ticked(proposal, [first]),
      placement: "chained",
    }).map((entry) => entry.target.id),
    ids(proposal),
  );
  // "Idéal" is left as it was: the proposal's order.
  assert.deepEqual(
    suggestShownItems({
      proposal,
      chain,
      selected: ticked(proposal, [first]),
      placement: "ideal",
    }),
    proposal.items,
  );
});

test("the numbers of the mini-frise never run into one another, at 5, 8, 12, 19 and 27 targets", () => {
  for (const count of [5, 8, 12, 19, 27]) {
    const slot = count * 20 <= 480 ? 20 : Math.floor(480 / count);
    const items = Array.from({ length: count }, (_, index) => ({
      target: { id: `t${index}` },
      number: index + 1,
      startMinute: index * slot,
      endMinute: (index + 1) * slot,
      selected: true,
    }));
    const markup = renderToStaticMarkup(
      createElement(SuggestTimeline, {
        proposal: { window: { startMinute: 0, endMinute: 480 } },
        model: { items, free: [], timelineTicks: [], timelineLabel: "" },
      }),
    );
    // The boxes are all drawn; the numbers written are those that fit.
    assert.equal(markup.match(/<rect x=/g).length >= count, true);
    const written = [
      ...markup.matchAll(/class="is-number" x="([\d.]+)"[^>]*>(\d+)</g),
    ].map(([, x, number]) => ({
      number: Number(number),
      left: Number(x) - (number.length * SUGGEST_DIGIT_WIDTH) / 2,
      right: Number(x) + (number.length * SUGGEST_DIGIT_WIDTH) / 2,
    }));
    assert.ok(written.length >= Math.floor(count / 3), `${count}: not emptied`);
    assert.equal(written[0].number, 1);
    for (let index = 1; index < written.length; index += 1)
      assert.ok(
        written[index].left > written[index - 1].right,
        `${count} targets: ${written[index - 1].number} and ${written[index].number} touch`,
      );
    if (count <= 8) assert.equal(written.length, count, "what fits is written");
    if (count >= 19)
      assert.ok(written.length < count, "a long list is thinned");
  }
  // The rule on its own: far apart or narrow, the first one is always written.
  assert.deepEqual(
    suggestTimelineNumbers(
      [
        { number: 9, startMinute: 0 },
        { number: 10, startMinute: 20 },
        { number: 11, startMinute: 40 },
      ],
      (entry) => entry.startMinute / 2,
    ).map((label) => label.number),
    [9, 11],
  );
});

test("the chain over the ticked targets is the request of the apply: what is shown is what is added", () => {
  const proposal = proposeWith({ placement: "chained" });
  const selected = ticked(proposal, [ids(proposal)[0]]);
  const request = suggestChainRequest({ proposal, selected, tier: 2 });
  assert.deepEqual(request, {
    count: 3,
    only: ids(proposal).slice(1),
    tier: 2,
    placement: "chained",
  });
  const shown = suggestNight({
    night,
    mode: "imaging",
    candidates: pool,
    ...request,
  });
  const applied = suggestNight({
    night,
    mode: "imaging",
    candidates: pool,
    count: request.only.length,
    only: request.only,
    placement: "chained",
  });
  assert.deepEqual(
    shown.items.map((entry) => [
      entry.target.id,
      entry.startMinute,
      entry.endMinute,
    ]),
    applied.items.map((entry) => [
      entry.target.id,
      entry.startMinute,
      entry.endMinute,
    ]),
  );
});

test("a new placement: « Idéal » the same targets, « Rapproché » a chain made again without the unticked ones; a new count keeps the ticked slots as shown", () => {
  const proposal = proposeWith();
  assert.deepEqual(
    suggestPlacementRequest({
      proposal,
      count: 4,
      tier: 1,
      placement: "ideal",
    }),
    {
      count: 4,
      only: ids(proposal),
      tier: 1,
      placement: "ideal",
    },
  );
  // The targets "Idéal" spread over the night cannot follow one
  // another within 10 min: "Rapproché" asks the pool again.
  const request = suggestPlacementRequest({
    proposal,
    count: 4,
    tier: 1,
    placement: "chained",
    selected: ticked(proposal, [ids(proposal)[1]]),
    excludeCaptured: false,
  });
  assert.deepEqual(request, {
    count: 4,
    excluded: [ids(proposal)[1]],
    excludeCaptured: false,
    tier: 1,
    placement: "chained",
  });
  const chained = suggestNight({
    night,
    mode: "imaging",
    candidates: pool,
    ...request,
  });
  assert.equal(chained.items.length, 4);
  assert.ok(!ids(chained).includes(ids(proposal)[1]), "the unticked one");
  chained.items.forEach((entry, index) => {
    if (index)
      assert.ok(
        entry.startMinute - chained.items[index - 1].endMinute <= 10,
        "no wait over 10 min",
      );
  });
  // The recount request keeps the ticked targets at the slots the dialog shows
  // (the chain's), not the ones of the proposal under them.
  const selected = ticked(proposal, [ids(proposal)[0]]);
  const chain = suggestNight({
    night,
    mode: "imaging",
    candidates: pool,
    ...suggestChainRequest({ proposal: chained, selected }),
  });
  const recount = suggestRecountRequest({
    proposal: chained,
    selected,
    chain,
    placement: "chained",
    count: 6,
    tier: 1,
  });
  assert.equal(recount.placement, "chained");
  assert.deepEqual(
    recount.kept.map((entry) => [entry.target.id, entry.startMinute]),
    chain.items.map((entry) => [entry.target.id, entry.startMinute]),
  );
  assert.deepEqual(
    suggestShownItems({
      proposal: chained,
      chain,
      selected,
      placement: "ideal",
    }),
    chained.items,
  );
});

test("the dialog hands the placement it showed to its caller, for the apply and for the footer", () => {
  const source = readFileSync(
    new URL("../src/components/SuggestNightDialog.js", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /\.filter\(\(id\) => selected\.has\(id\)\),\s*placement,\s*\)/,
  );
  assert.match(source, /busy: recomputing,\s*placement,/);
  const planner = readFileSync(
    new URL("../src/components/PlannerPage.js", import.meta.url),
    "utf8",
  );
  assert.match(
    planner,
    /const applySuggestions = \(ids, placement = "ideal"\)/,
  );
  assert.match(
    planner,
    /placement: suggestionDefaults\(visualMode\)\.placement/,
  );
  const tonight = readFileSync(
    new URL("../src/components/TonightPage.js", import.meta.url),
    "utf8",
  );
  // The defaults are read once, for the first night or the next one.
  assert.match(
    tonight,
    /const defaults = suggestionDefaults\(inputs\.mode === "visual"\);/,
  );
  assert.match(tonight, /placement: defaults\.placement,/);
  assert.match(tonight, /createSuggestedPlan\(\[\.\.\.selected\], placement\)/);
});

// A target already done stays in the dialog with its last
// time, the switch is "Exclure les cibles déjà faites", off by default.
const doneBefore = [
  // as good a sky as tonight's would be, but 50 points worse: the malus lifted
  { id: "p0", date: "2026-10-13", outcome: "done", noteThen: 50 },
  // done a month ago under a better sky than tonight's
  { id: "p1", date: "2026-09-14", outcome: "done", noteThen: 97 },
  // no note known for that night
  { id: "p2", date: "2026-08-14", outcome: "done" },
];
const withLines = (extra = {}) =>
  proposeWith({ count: 6, noteNow: 85, history: doneBefore, ...extra });

test("the captured targets stay in the list with their line, the switch is off", () => {
  const proposal = withLines();
  assert.equal(ids(proposal).length, 6);
  const markup = renderToStaticMarkup(
    createElement(SuggestNightContent, {
      locale: "fr",
      proposal,
      model: {
        ...model(proposal, ticked(proposal), { placement: "ideal" }),
        locale: "fr",
      },
      contextLine: "Camping du Lac Noir · nuit du 14 oct.",
      equipmentLine: "Lunette 72 mm · caméra couleur",
      count: 4,
      placement: "ideal",
      captured: proposal.captured,
    }),
  );
  const words = text(markup);
  assert.match(
    words,
    /P0, faite le 13 oct\. sous un ciel moins bon que ce soir\./,
  );
  assert.match(
    words,
    /P1, faite le 14 sept\. sous un ciel meilleur que ce soir\./,
  );
  assert.match(words, /P2, faite le 14 août\./);
  assert.ok(!words.includes("août.."));
  assert.ok(!words.includes("est écartée"));
  assert.match(words, /Exclure les cibles déjà faites/);
  assert.ok(!words.includes("Inclure les cibles"));
  assert.match(markup, /planner-suggest-switch/);
  assert.ok(
    !/planner-suggest-switch"?[^>]*><input[^>]*checked/.test(markup),
    "the switch is off",
  );
});

test("on, the switch gives back today's exclusion and its sentence", () => {
  const proposal = withLines({ excludeCaptured: true });
  assert.ok(
    ids(proposal).every((id) => !["p0", "p1", "p2"].includes(id)),
    "the done targets are left out",
  );
  const markup = renderToStaticMarkup(
    createElement(SuggestNightContent, {
      locale: "fr",
      proposal,
      model: {
        ...model(proposal, ticked(proposal), { placement: "ideal" }),
        locale: "fr",
      },
      contextLine: "Camping du Lac Noir · nuit du 14 oct.",
      equipmentLine: "Lunette 72 mm · caméra couleur",
      count: 4,
      placement: "ideal",
      excludeCaptured: true,
      captured: proposal.captured,
    }),
  );
  assert.match(text(markup), /3 cibles déjà capturées sont écartées\./);
  assert.ok(!text(markup).includes("sous un ciel"));
});

test("the visual form says « observée »", () => {
  const proposal = withLines({
    mode: "visual",
    history: [
      { id: "p0", date: "2026-10-13", outcome: "observed", noteThen: 50 },
    ],
  });
  const words = text(
    renderToStaticMarkup(
      createElement(SuggestNightContent, {
        locale: "fr",
        visual: true,
        proposal,
        model: {
          ...model(proposal, ticked(proposal), {
            placement: "chained",
            visual: true,
          }),
          locale: "fr",
        },
        contextLine: "Camping du Lac Noir · nuit du 14 oct.",
        equipmentLine: "Dobson 200 mm",
        count: 4,
        placement: "chained",
      }),
    ),
  );
  assert.match(
    words,
    /P0, observée le 13 oct\. sous un ciel moins bon que ce soir\./,
  );
});

test("the refresh, the new count and the placement keep the malus and the switch", () => {
  const proposal = withLines();
  // "Rapproché" asks the pool again (no `only`): the malus orders it.
  const chained = suggestPlacementRequest({
    proposal,
    count: 6,
    placement: "chained",
    selected: ticked(proposal),
    excludeCaptured: false,
  });
  assert.equal(chained.only, undefined);
  const again = proposeWith({
    count: 6,
    noteNow: 85,
    history: doneBefore,
    ...chained,
  });
  assert.ok(
    again.items.every((entry) => ids(proposal).includes(entry.target.id)),
  );
  assert.ok(again.items.find((entry) => entry.target.id === "p1").previous);
  // "Idéal" asks the ticked targets (`only`): their order is the proposal's
  // and each keeps its line.
  const ideal = suggestPlacementRequest({
    proposal,
    count: 6,
    placement: "ideal",
  });
  assert.deepEqual(ideal.only, ids(proposal));
  const placed = proposeWith({
    count: 6,
    noteNow: 85,
    history: doneBefore,
    ...ideal,
  });
  assert.deepEqual(ids(placed).sort(), ids(proposal).sort());
  assert.ok(placed.items.find((entry) => entry.target.id === "p0").previous);
  // The new count carries the switch.
  const recount = suggestRecountRequest({
    proposal,
    selected: ticked(proposal),
    count: 3,
    excludeCaptured: true,
  });
  assert.equal(recount.excludeCaptured, true);
  assert.equal(
    suggestRecountRequest({ proposal, selected: ticked(proposal), count: 3 })
      .excludeCaptured,
    false,
  );
});

test("the line wraps under the row across the card, in the ten catalogues", () => {
  assert.match(
    css,
    /\.planner-autofill-item\.has-previous\s*\{\s*flex-wrap:\s*wrap/,
  );
  assert.match(css, /\.planner-autofill-previous\s*\{\s*flex:\s*1 1 100%/);
  const entry = {
    target: { id: "m31", designation: "M31" },
    group: "night",
    previous: {
      date: "2026-09-12",
      outcome: "done",
      noteThen: 40,
      noteNow: 80,
      malus: 0,
    },
  };
  for (const locale of Object.keys(suggestionMessages)) {
    for (const visual of [false, true]) {
      const line = suggestPreviousLine({ entry, visual, locale });
      assert.ok(
        line.includes("M31") && !line.includes("{"),
        `${locale} ${line}`,
      );
      const dated = suggestPreviousLine({
        entry: { ...entry, previous: { ...entry.previous, noteThen: null } },
        visual,
        locale,
      });
      assert.notEqual(dated, line, `${locale}: the date-only form differs`);
    }
  }
  // An abbreviated month ends in a full stop: not written twice at the end.
  assert.equal(
    suggestPreviousLine({
      entry: {
        ...entry,
        previous: { ...entry.previous, noteThen: null },
      },
      visual: false,
      locale: "fr",
    }),
    "M31, faite le 12 sept.",
  );
  assert.equal(
    suggestPreviousLine({
      entry: { ...entry, group: "continue" },
      visual: false,
      locale: "fr",
    }),
    "",
  );
});
