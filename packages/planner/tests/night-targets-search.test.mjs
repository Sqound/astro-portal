import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { messages } from "portal/i18n.js";
import { registerPlannerExtension } from "portal/planner/extensions.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import {
  decodePersonalTargets,
  nextActiveIndex,
  nightFramingHref,
  nightFramingNoticeKey,
  nightFramingRequest,
  nightPagePath,
  nightTargetIdsWithFraming,
  nightTargetsAnswer,
  nightTargetsLimit,
  nightTargetsPath,
  nightTargetsRows,
  nightTargetsSlowAfterMs,
  nightTargetsState,
  personalNightEntries,
} from "../src/night-targets-search.js";
import {
  addFramingTargetToNight,
  rememberNightFraming,
  takeNightFraming,
} from "../src/night-framing-client.js";

// The "Cibles" field of a night's page. A trace of the freeze showed a page
// that never froze and a search that waited for the catalogue with nothing on
// screen;
// these tests hold what the field now does about it: the compact request with
// eight answers, the ranking, the label of a row, the space's own targets
// first, one state for every moment of the wait, the keyboard, and the road
// to "Créer un cadrage sur la carte…" and back. Synthetic data only.
await registerJsx();
const { NightTargetsPanel } =
  await import("planner/components/NightTargetsPicker.js");
const { MissingObjectContext } = await import("planner/missing-object-slot.js");
// The link itself is a shell's (`planner.missingObject`): a stand-in draws it.
registerPlannerExtension("planner.missingObject", {
  available: () => true,
  Link: ({ locale }) =>
    createElement(
      "button",
      { type: "button", className: "btn-link missing-object-link" },
      locale === "fr" ? "Demander cet objet" : "Request this object",
    ),
});

const NBSP = " ";
const textOf = (markup) =>
  markup
    .replace(/<[^>]+>/g, "\u0001")
    .replace(/\u0001+/g, " ")
    .replace(/&#x27;/g, "’")
    .replace(/&quot;/g, '"')
    .replaceAll(NBSP, " ")
    .replace(/\s+/g, " ")
    .trim();

const fields = [
  "id",
  "designation",
  "name",
  "title",
  "aliases",
  "ra",
  "dec",
  "type",
  "constellation",
  "photoUrl",
];
const index = (rows, total = rows.length) => ({
  v: 1,
  total,
  offset: 0,
  limit: 8,
  sort: "planner",
  types: [
    ["Galaxie", "Galaxie"],
    ["Amas globulaire", "Amas globulaire"],
  ],
  constellations: [
    ["Andromède", "Andromède"],
    ["Pégase", "Pégase"],
  ],
  fields,
  rows,
});
const m15 = [
  "m15",
  "M15",
  "Amas globulaire de Pégase",
  "M15",
  ["NGC 7078"],
  21.5,
  12.1,
  1,
  1,
  null,
];
const ngc70 = [
  "ngc70",
  "NGC 70",
  null,
  "NGC 70",
  [],
  0.2,
  30.4,
  0,
  0,
  "/target-library-curated-images/noirlab-demo.jpg",
];
const ngc7078 = [
  "ngc7078x",
  "NGC 7078 B",
  null,
  "NGC 7078 B",
  [],
  21.5,
  12.1,
  0,
  1,
  null,
];

test("the request is the compact index in the catalogue's writing, ranked by the planner, eight answers at most", () => {
  const path = nightTargetsPath({ locale: "fr", query: "  ngc 70 " });
  const url = new URL(path, "http://x");
  assert.equal(url.pathname, "/api/v1/target-index");
  assert.equal(url.searchParams.get("q"), "NGC 70");
  assert.equal(url.searchParams.get("sort"), "planner");
  assert.equal(url.searchParams.get("limit"), String(nightTargetsLimit));
  assert.equal(nightTargetsLimit, 8);
  assert.equal(url.searchParams.get("locale"), "fr");
  assert.equal(
    new URL(nightTargetsPath({ query: "m31" }), "http://x").searchParams.get(
      "locale",
    ),
    "en",
  );
});

test("what was typed goes first (the exact designation, then the alias, then the beginning), and a row says its name, its type and its constellation, never an identifier", () => {
  // The planner's order puts the clusters whose alias begins like the query
  // ahead of the target that was typed.
  const { total, entries } = nightTargetsAnswer(
    index([m15, ngc7078, ngc70], 122),
    "ngc 70",
    "fr",
  );
  assert.equal(total, 122);
  assert.deepEqual(
    entries.map((entry) => entry.designation),
    ["NGC 70", "M15", "NGC 7078 B"],
    "the exact designation first; the alias and the beginning keep the server's order",
  );
  const [first, second] = entries;
  assert.equal(first.kind, "Galaxie · Andromède");
  assert.equal(
    first.photoUrl,
    "/target-library-curated-images/noirlab-demo.jpg",
  );
  assert.equal(first.label, "NGC 70");
  assert.equal(second.label, "M15 · Amas globulaire de Pégase");
  assert.equal(second.kind, "Amas globulaire · Pégase");
  assert.equal(second.photoUrl, null);
  assert.equal(second.typeKey, "Amas globulaire");
  assert.equal(second.personal, false);
  assert.deepEqual(nightTargetsAnswer(null, "x", "fr"), {
    total: 0,
    entries: [],
  });
});

test("the space's own targets: read from their list, matched without case or accent, at most three, all of them while nothing is typed", () => {
  const personal = decodePersonalTargets({
    targets: [
      { id: "p1", name: "Comète du col", placeName: "Col des Étoiles" },
      { id: "p2", name: "Nébuleuse sans nom", placeName: null },
      { id: "p3", name: "Champ de Cassiopée" },
      { id: "p4", name: "Comète de la nuit" },
      { id: "", name: "sans identifiant" },
      { id: "p5" },
    ],
  });
  assert.equal(personal.length, 4);
  assert.deepEqual(decodePersonalTargets(null), []);
  const all = personalNightEntries(personal, "", "fr");
  assert.deepEqual(
    all.map((entry) => entry.id),
    ["p1", "p2", "p3"],
    "three at most, in the order the service sent them",
  );
  assert.deepEqual(
    personalNightEntries(personal, "comete", "fr").map((entry) => entry.id),
    ["p1", "p4"],
  );
  assert.deepEqual(personalNightEntries(personal, "zzz", "fr"), []);
  const [comet] = all;
  assert.equal(comet.personal, true);
  assert.equal(comet.photoUrl, null);
  assert.equal(comet.kind, "Col des Étoiles");
  assert.equal(comet.designation, "Comète du col");
});

test("the list: the space's own targets ahead of the catalogue's, never a target the night holds, eight rows at most", () => {
  const personal = [
    { id: "p1", personal: true },
    { id: "p2", personal: true },
  ];
  const catalogue = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}` }));
  assert.deepEqual(
    nightTargetsRows({ personal, catalogue, excludeIds: ["c0", "p2"] }).map(
      (row) => row.id,
    ),
    ["p1", "c1", "c2", "c3", "c4", "c5", "c6", "c7"],
  );
  assert.equal(nightTargetsRows({ personal, catalogue }).length, 8);
  assert.deepEqual(nightTargetsRows(), []);
});

test("the field is always in one of its states, and the wait that lasts has its own", () => {
  const ready = {
    status: "ready",
    query: "ngc",
    entries: [{ id: "a" }],
    total: 1,
    slow: false,
  };
  const state = (query, answer, rowCount = 1) =>
    nightTargetsState({ query, answer, rowCount });
  assert.equal(state("", undefined), "hint");
  assert.equal(state("   ", ready), "hint", "blanks are not a search");
  assert.equal(
    state("ngc", undefined),
    "loading",
    "the pause before the request",
  );
  assert.equal(state("ngc", { status: "loading", query: "ngc" }), "loading");
  assert.equal(
    state("ngc", { status: "loading", query: "ngc", slow: true }),
    "slow",
  );
  assert.equal(
    state("ngc 7", ready),
    "loading",
    "an answer to what was typed before is not the answer",
  );
  assert.equal(state("ngc", ready), "ready");
  assert.equal(state("ngc", { ...ready, total: 40 }), "more");
  assert.equal(state("ngc", ready, 0), "empty");
  assert.equal(state("ngc", { status: "error", query: "ngc" }), "error");
  assert.equal(nightTargetsSlowAfterMs, 3000);
});

test("the keyboard walks the rows down and back up to the field, and stays still on an empty list", () => {
  assert.equal(nextActiveIndex(-1, "ArrowDown", 3), 0);
  assert.equal(nextActiveIndex(0, "ArrowDown", 3), 1);
  assert.equal(nextActiveIndex(2, "ArrowDown", 3), 2);
  assert.equal(nextActiveIndex(1, "ArrowUp", 3), 0);
  assert.equal(nextActiveIndex(0, "ArrowUp", 3), -1);
  assert.equal(nextActiveIndex(-1, "ArrowUp", 3), -1);
  assert.equal(nextActiveIndex(0, "ArrowDown", 0), -1);
  assert.equal(nextActiveIndex(1, "Tab", 3), 1);
});

test("« Créer un cadrage sur la carte… » leads to the planner's editor for this night, and the framing brings its target back once", async () => {
  const href = nightFramingHref({ locale: "fr", sessionId: "night 1" });
  assert.equal(href, "/fr/planner?view=framings&new=1&night=night+1");
  assert.deepEqual(nightFramingRequest(new URL(href, "http://x").search), {
    sessionId: "night 1",
  });
  assert.equal(nightFramingRequest("?view=framings"), null);
  assert.equal(nightFramingRequest("?new=1"), null, "no night, no return");
  assert.equal(nightFramingRequest("?night=n&new=0"), null);
  assert.equal(
    nightPagePath({ locale: "ja", sessionId: "a/b" }),
    "/ja/sessions/a%2Fb",
  );

  assert.deepEqual(nightTargetIdsWithFraming(["a"], "b"), {
    targetIds: ["a", "b"],
    added: true,
  });
  assert.deepEqual(nightTargetIdsWithFraming(["a", "b"], "b"), {
    targetIds: ["a", "b"],
    added: false,
  });
  assert.deepEqual(nightTargetIdsWithFraming(["a"], null), {
    targetIds: ["a"],
    added: false,
  });
  assert.deepEqual(nightTargetIdsWithFraming(null, "b"), {
    targetIds: ["b"],
    added: true,
  });

  const calls = [];
  const night = (value) => ({
    ok: true,
    json: async () => ({ night: { targetIds: { value, source: "plan" } } }),
  });
  const request = async (path, options = {}) => {
    calls.push([options.method ?? "GET", path, options.body]);
    return options.method === "PATCH" ? { ok: true } : night(["ngc7000"]);
  };
  assert.deepEqual(
    await addFramingTargetToNight({
      sessionId: "n1",
      catalogueTargetId: "m31",
      request,
    }),
    { added: true, targetIds: ["ngc7000", "m31"] },
  );
  assert.deepEqual(calls, [
    ["GET", "/api/v1/sessions/n1", undefined],
    ["PATCH", "/api/v1/sessions/n1/night", { targetIds: ["ngc7000", "m31"] }],
  ]);
  calls.length = 0;
  assert.equal(
    (
      await addFramingTargetToNight({
        sessionId: "n1",
        catalogueTargetId: "ngc7000",
        request,
      })
    ).added,
    false,
  );
  assert.equal(
    calls.length,
    1,
    "nothing is written for a target already there",
  );
  await assert.rejects(
    addFramingTargetToNight({
      sessionId: "n1",
      catalogueTargetId: "m31",
      request: async () => ({ ok: false }),
    }),
    /night_unavailable/,
  );
  await assert.rejects(
    addFramingTargetToNight({
      sessionId: "n1",
      catalogueTargetId: "m31",
      request: async (path, options = {}) =>
        options.method === "PATCH" ? { ok: false } : night([]),
    }),
    /night_not_saved/,
  );

  const store = new Map();
  const storage = {
    setItem: (key, value) => store.set(key, value),
    getItem: (key) => store.get(key) ?? null,
    removeItem: (key) => store.delete(key),
  };
  rememberNightFraming("n1", { name: "Cadre M31", target: "M31" }, storage);
  assert.ok(store.has(nightFramingNoticeKey("n1")));
  assert.deepEqual(takeNightFraming("n1", storage), {
    name: "Cadre M31",
    target: "M31",
    failed: false,
  });
  assert.equal(takeNightFraming("n1", storage), null, "read once");
  assert.equal(takeNightFraming("other", storage), null);
});

const panel = (props, { hosted = false } = {}) =>
  renderToStaticMarkup(
    createElement(
      MissingObjectContext.Provider,
      { value: { available: hosted, signedIn: true } },
      createElement(NightTargetsPanel, {
        locale: "fr",
        sessionId: "night-1",
        listId: "t",
        ...props,
      }),
    ),
  );
const catalogueRows = nightTargetsAnswer(
  index([ngc70, m15], 2),
  "ngc",
  "fr",
).entries;

test("states drawn: the hint, the star while it waits, the wait that lasts, the labelled rows, nothing found with the request, the search unavailable", () => {
  const hint = panel({ state: "hint" });
  assert.match(
    textOf(hint),
    /^Cherche dans le catalogue et parmi vos cibles : /,
  );
  assert.ok(!hint.includes("data-brand-loader"));
  assert.ok(hint.includes('role="listbox"'));

  const loading = panel({ state: "loading", query: "ngc" });
  assert.ok(loading.includes("data-brand-loader"), "the star, never a spinner");
  assert.ok(textOf(loading).includes("Recherche en cours…"));
  assert.ok(loading.includes('aria-busy="true"'));
  assert.ok(loading.includes('data-state="loading"'));

  const slow = panel({ state: "slow", query: "ngc" });
  assert.ok(slow.includes("data-brand-loader"));
  assert.ok(
    textOf(slow).includes(
      "Le catalogue se prépare : la première recherche peut prendre une minute.",
    ),
  );

  const ready = panel({
    state: "more",
    query: "ngc",
    rows: catalogueRows,
    shown: 2,
    total: 122,
    active: 1,
  });
  const text = textOf(ready);
  assert.ok(text.includes("NGC 70"));
  assert.ok(text.includes("Galaxie · Andromède"));
  assert.ok(text.includes("M15 · Amas globulaire de Pégase"));
  assert.ok(text.includes("Amas globulaire · Pégase"));
  assert.ok(text.includes("2 résultats sur 122."));
  assert.equal((ready.match(/role="option"/g) ?? []).length, 2);
  assert.ok(
    ready.includes('src="/target-library-curated-images/noirlab-demo.jpg"'),
    "the preview of a target that has one",
  );
  assert.ok(
    ready.includes('data-object-pictogram="globular-cluster"'),
    "the figure of its type in place of a missing image",
  );
  assert.match(
    ready,
    /aria-selected="true"[^>]*class="night-target-option is-active"|class="night-target-option is-active"[^>]*aria-selected="true"/,
  );
  assert.ok(!text.includes("ngc70"), "no identifier on screen");
  assert.ok(ready.includes("<mark>"), "the match is highlighted");
  assert.ok(
    ready.endsWith("Créer un cadrage sur la carte…</a></div></>") ||
      ready.includes(
        `href="/fr/planner?view=framings&amp;new=1&amp;night=night-1">Créer un cadrage sur la carte…</a>`,
      ),
    "the last row of the list",
  );

  const empty = panel({ state: "empty", query: "zzqx" }, { hosted: true });
  assert.ok(
    textOf(empty).includes(
      "Aucune cible du catalogue ne correspond à « zzqx ».",
    ),
  );
  assert.ok(textOf(empty).includes("Demander cet objet"));
  assert.ok(
    !textOf(panel({ state: "empty", query: "zzqx" })).includes(
      "Demander cet objet",
    ),
    "not offered on a private server",
  );

  const error = panel({ state: "error", query: "ngc" }, { hosted: true });
  assert.ok(textOf(error).includes("La recherche est indisponible"));
  assert.ok(
    !textOf(error).includes("Demander cet objet"),
    "a search that failed is not an object that is missing",
  );
});

test("a personal target says so, carries no preview and a row's text has no JSON", () => {
  const rows = personalNightEntries(
    [{ id: "p1", name: "Comète du col", placeName: "Col des Étoiles" }],
    "",
    "fr",
  );
  const markup = panel({ state: "hint", rows });
  assert.ok(textOf(markup).includes("Comète du col"));
  assert.ok(textOf(markup).includes("cible personnelle · Col des Étoiles"));
  assert.ok(!markup.includes("<img"));
  assert.ok(markup.includes('data-object-pictogram="star"'));
  for (const hidden of ["p1", "{", "undefined", "null"])
    assert.ok(!textOf(markup).includes(hidden), hidden);
});

test("the ten languages carry the words of the field, with their placeholders and no source word left", () => {
  const keys = [
    "nightPageTargetsHint",
    "nightPageTargetsEmpty",
    "nightPageTargetsSlow",
    "nightPageTargetsPersonal",
    "nightPageTargetsFraming",
    "nightPageFramingAdded",
    "nightPageFramingNoTarget",
    "nightPageFramingNotSaved",
  ];
  const locales = Object.keys(messages);
  assert.equal(locales.length, 10);
  for (const locale of locales)
    for (const key of keys)
      assert.ok(
        typeof messages[locale][key] === "string" && messages[locale][key],
        `${locale}.${key}`,
      );
  for (const locale of locales) {
    assert.ok(
      messages[locale].nightPageTargetsEmpty.includes("{query}"),
      locale,
    );
    for (const key of ["nightPageFramingAdded", "nightPageFramingNoTarget"])
      assert.ok(messages[locale][key].includes("{name}"), `${locale}.${key}`);
    assert.ok(
      messages[locale].nightPageFramingAdded.includes("{target}"),
      locale,
    );
  }
  assert.equal(
    messages.fr.nightPageTargetsFraming,
    "Créer un cadrage sur la carte…",
  );
});
