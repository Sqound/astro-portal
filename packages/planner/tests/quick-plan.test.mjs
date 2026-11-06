import assert from "node:assert/strict";
import test from "node:test";
import { QuickPlanAction } from "../src/quick-plan.js";
import { base } from "./helpers/suggestion-cases.mjs";
const date = "2026-10-14";
const location = {
  name: "Camping du Lac Noir",
  latitude: "45",
  longitude: "-30",
  timeZone: "UTC",
};
export function fixture({
  plans = [],
  multiple = false,
  signedIn = false,
  guard = 1000,
} = {}) {
  const events = [];
  const action = new QuickPlanAction({
    document: { plans, nights: [], date, location },
    date,
    location,
    name: "Nuit du 14 octobre",
    newSettings: {
      equipment: { telescopeId: null, cameraId: null },
      minAltitude: 30,
    },
    capabilities: { "planner.multiple": multiple, "sync.plan_limit": guard },
    signedIn,
    inputsFor: async (plan) => {
      events.push(["inputs", plan.location]);
      return base;
    },
    persist: async (document) => events.push(["persist", document]),
    remove: async (id) => events.push(["delete", id]),
    id: () => "quick",
  });
  return { action, events };
}
export const existing = {
  id: "old",
  name: "Nuit d’octobre au lac",
  status: "pending",
  date,
  location,
  items: [
    { id: "kept", startMinute: 0, endMinute: 100, target: { id: "kept" } },
  ],
};
const selected = new Set(["t00", "t01"]);
test("visitor creates a named quick plan at the shown place with engine placement", async () => {
  const { action, events } = fixture();
  const r = await action.create(selected);
  assert.equal(r.kind, "created");
  assert.equal(r.plan.name, "Nuit du 14 octobre");
  assert.equal(r.placed, 2);
  assert.equal(r.plan.location.name, location.name);
  assert.equal(events.filter((e) => e[0] === "persist").length, 1);
  assert.ok(r.plan.items.every((i) => Number.isFinite(i.startMinute)));
  assert.equal(r.plan.equipment.telescopeId, null);
});
test("same-night free pending plan returns exists without write", async () => {
  const { action, events } = fixture({ plans: [existing] });
  assert.equal((await action.create(selected)).kind, "exists");
  assert.deepEqual(events, []);
});
// A pending plan that holds no target never blocks a
// quick plan and never counts for the free offer's one plan per night: the
// quick plan's targets go into it, silently.
test("an empty draft of the night is filled by the quick plan, no refusal", async () => {
  const draft = { ...existing, id: "draft", items: [] };
  const { action, events } = fixture({ plans: [draft] });
  const r = await action.create(selected);
  assert.equal(r.kind, "merged");
  assert.equal(r.plan.id, "draft");
  assert.equal(r.placed, 2);
  const persisted = events.find((e) => e[0] === "persist")[1];
  assert.equal(persisted.plans.length, 1);
  assert.ok(persisted.plans.every((p) => (p.items || []).length > 0));
});
test("an empty draft beside a plan that ran still refuses", async () => {
  const draft = { ...existing, id: "draft", items: [] };
  const ran = { ...existing, id: "ran", status: "executed" };
  const { action, events } = fixture({ plans: [ran, draft] });
  assert.notEqual((await action.create(selected)).kind, "merged");
  assert.equal(events.length, 0);
});
test("another night never invokes exists", async () => {
  const { action } = fixture({ plans: [{ ...existing, date: "2026-10-15" }] });
  assert.equal((await action.create(selected)).kind, "created");
});
test("planner.multiple creates another same-night plan signed in", async () => {
  const { action } = fixture({
    plans: [existing],
    multiple: true,
    signedIn: true,
  });
  assert.equal((await action.create(selected)).kind, "created");
  assert.equal(action.document.plans.length, 2);
});
test("numeric guard remains a normal refusal", async () => {
  const { action } = fixture({ plans: [existing], multiple: true, guard: 1 });
  assert.equal((await action.create(selected)).kind, "refused");
});
test("merge appends without moving an item and computes at the destination place", async () => {
  const old = {
    ...existing,
    location: { ...location, name: "Col des Mélèzes" },
  };
  const { action, events } = fixture({ plans: [old] });
  const r = await action.merge(selected);
  assert.equal(r.kind, "merged");
  assert.deepEqual(r.plan.items[0], old.items[0]);
  assert.equal(events[0][1].name, old.location.name);
  assert.ok(r.plan.items.slice(1).every((i) => i.startMinute >= 100));
});
test("erase calls deletion before creation and never touches a journal", async () => {
  const { action, events } = fixture({ plans: [existing] });
  const r = await action.eraseAndCreate(selected);
  assert.equal(r.kind, "created");
  assert.deepEqual(events[0], ["delete", "old"]);
  assert.equal(action.document.plans.length, 1);
});
test("running and debriefing guard deletion", async () => {
  for (const flag of ["running", "debrief"]) {
    const { action, events } = fixture({ plans: [existing] });
    assert.equal(
      (await action.eraseAndCreate(selected, { [flag]: true })).kind,
      "eraseDisabled",
    );
    assert.deepEqual(events, []);
  }
});
test("cancelled empty selection creates nothing", async () => {
  const { action, events } = fixture();
  assert.equal((await action.create(new Set())).kind, "cancelled");
  assert.deepEqual(events, []);
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerPlannerExtension } from "portal/planner/extensions.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
await registerJsx();
const { PlanExistsCards } =
  await import("../dist/components/PlanExistsDialog.js");
import {
  quickPlanMessages,
  quickPlanMessage,
} from "../src/quick-plan-messages.js";
import {
  createWebQuickPlanAction,
  planMadeElsewhere,
  readQuickPlanEraseState,
  quickPlanDialogData,
} from "../src/quick-plan-web.js";
import {
  shippedLocales,
  useLocaleRegistryForTests,
  SHIPPED_LOCALE_REGISTRY,
} from "astro-contracts/locales";
import { copyFallbacks } from "portal/locales.js";
const storage = () => {
  const store = new Map();
  return {
    getItem: (key) => store.get(key) || null,
    setItem: (key, value) => store.set(key, value),
    store,
  };
};
const renderData = {
  name: "Nuit d’octobre au lac",
  date: "mer. 14 oct.",
  count: 4,
  free: "1 h 40",
  freeMinutes: 100,
  minimum: "45 min",
};
test("web cards render merge then erase; the card of the offers comes last, only where a shell registered it", () => {
  const render = () =>
    renderToStaticMarkup(
      createElement(PlanExistsCards, {
        data: renderData,
        locale: "fr",
        offersHref: "/fr/offers",
      }),
    );
  // The open planner sells nothing: two cards, a neutral sentence.
  const bare = render();
  assert.ok(
    bare.indexOf('data-quick-plan-card="merge"') <
      bare.indexOf('data-quick-plan-card="erase"'),
  );
  assert.ok(!bare.includes('data-quick-plan-card="offers"'));
  assert.ok(!bare.includes("Voir les offres"));
  assert.ok(bare.includes("Un seul plan par nuit."));
  // A shell that sells draws its card after them, in its own words.
  registerPlannerExtension("planner.offers", {
    copy: (locale, key) =>
      key === "planExistsIntro" ? "Sans Planification avancée." : "",
    components: {
      PlanExistsOffersCard: ({ offersHref }) =>
        createElement(
          "section",
          { "data-quick-plan-card": "offers" },
          createElement("a", { href: offersHref }, "Voir les offres"),
        ),
    },
  });
  const html = render();
  assert.ok(
    html.indexOf('data-quick-plan-card="merge"') <
      html.indexOf('data-quick-plan-card="erase"'),
  );
  assert.ok(
    html.indexOf('data-quick-plan-card="erase"') <
      html.indexOf('data-quick-plan-card="offers"'),
  );
  assert.ok(html.includes("Fusionner avec ce plan"));
  assert.ok(html.includes("Voir les offres"));
  assert.ok(html.includes("Sans Planification avancée."));
  assert.ok(!html.includes("btn-primary"));
  assert.ok(!html.includes("29,99"));
  assert.ok(html.includes("btn-tertiary is-destructive"));
});
test("web running and debrief states retain the erase card with a disabled action", () => {
  for (const state of ["running", "debrief"]) {
    const html = renderToStaticMarkup(
      createElement(PlanExistsCards, {
        data: { ...renderData, [state]: true },
        locale: "fr",
      }),
    );
    assert.ok(
      html.includes(
        quickPlanMessage(
          "fr",
          state === "running" ? "planExistsRunning" : "planExistsDebrief",
        ),
      ),
    );
    assert.match(html, /disabled=""[^>]*>Effacer et recommencer/);
  }
});
test("all ten locales have every phrase and substitute placeholders", () => {
  for (const locale of shippedLocales()) {
    assert.deepEqual(
      Object.keys(quickPlanMessages[locale]).sort(),
      Object.keys(quickPlanMessages.en).sort(),
    );
    assert.ok(
      !quickPlanMessage(locale, "planExistsMergeBody", {
        name: "name",
        free: "time",
      }).includes("{"),
    );
  }
});
test("named pseudo-locale fallback preserves the locale registry guard", (t) => {
  t.after(() => useLocaleRegistryForTests(null));
  useLocaleRegistryForTests({
    ...SHIPPED_LOCALE_REGISTRY,
    locales: [
      ...SHIPPED_LOCALE_REGISTRY.locales,
      { tag: "en-XA", language: "en", region: "XA", name: "Pseudo" },
    ],
  });
  assert.equal(
    quickPlanMessage("en-XA", "planExistsTitle"),
    quickPlanMessage("en", "planExistsTitle"),
  );
  assert.ok(
    copyFallbacks().some(
      (e) =>
        e.table === "quick-plan-messages.quickPlanMessages" &&
        e.locale === "en-XA",
    ),
  );
});
test("visitor adapter persists quick plan in browser store with no equipment chosen", async () => {
  const store = storage();
  const action = createWebQuickPlanAction({
    document: { plans: [], nights: [], date, location },
    date,
    location,
    locale: "fr",
    capabilities: { "planner.multiple": false },
    inputsFor: async () => base,
    storage: store,
    id: () => "new",
  });
  const result = await action.create(selected);
  const saved = JSON.parse(store.getItem("astro-portal:planner:v1"));
  assert.equal(result.plan.name, "Nuit du 14 octobre");
  assert.equal(saved.plans.length, 1);
  assert.equal(saved.plans[0].equipment.telescopeId, null);
  assert.equal(saved.plans[0].equipment.cameraId, null);
  assert.equal("customTelescope" in saved.plans[0].equipment, false);
});
test("signed-in replacement writes tombstone before new plan with CSRF on the existing API", async () => {
  const store = storage(),
    calls = [];
  const action = createWebQuickPlanAction({
    document: { plans: [existing], nights: [], date, location },
    date,
    location,
    signedIn: true,
    email: "observer@example.test",
    capabilities: { "planner.multiple": false },
    inputsFor: async () => base,
    storage: store,
    csrf: () => "csrf-fixture",
    fetcher: async (url, init) => {
      calls.push([url, init]);
      return { ok: true, json: async () => ({}) };
    },
    id: () => "new",
  });
  await action.eraseAndCreate(selected);
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], "/api/plans");
  assert.deepEqual(JSON.parse(calls[0][1].body).state.deletedPlanIds, ["old"]);
  assert.equal(JSON.parse(calls[0][1].body).state.plans.length, 0);
  assert.equal(JSON.parse(calls[1][1].body).state.plans[0].id, "new");
  assert.equal(calls[1][1].headers["x-astro-csrf"], "csrf-fixture");
});
test("signed-in offline replacement queues deletion and creation in the dirty replica", async () => {
  const store = storage();
  const action = createWebQuickPlanAction({
    document: { plans: [existing], nights: [], date, location },
    date,
    location,
    signedIn: true,
    email: "observer@example.test",
    capabilities: { "planner.multiple": false },
    inputsFor: async () => base,
    storage: store,
    csrf: () => "",
    fetcher: async () => {
      throw new Error("offline");
    },
    id: () => "new",
  });
  await action.eraseAndCreate(selected);
  const record = JSON.parse(store.getItem("astro-portal:planner:space:v1"));
  assert.equal(record.dirty, true);
  assert.equal(record.document.plans[0].id, "new");
  assert.deepEqual(record.document.deletedPlanIds, ["old"]);
});
test("session guards resolve client id to resource id and use the signed-in person’s sessions", async () => {
  const store = storage();
  const fetcher = async (url) => ({
    ok: true,
    json: async () =>
      url === "/api/v1/plans"
        ? { plans: [{ id: "resource", payload: { id: "old" } }] }
        : url === "/api/v1/plans/debrief-queue"
          ? { entries: [{ planId: "resource" }] }
          : {
              sessions: [{ planId: "resource", status: "paused" }],
              hasMore: false,
            },
  });
  const result = await readQuickPlanEraseState({
    plan: existing,
    signedIn: true,
    email: "observer@example.test",
    storage: store,
    fetcher,
  });
  assert.deepEqual(result, {
    running: true,
    debrief: true,
    synchronized: true,
  });
  const cached = await readQuickPlanEraseState({
    plan: existing,
    signedIn: true,
    email: "observer@example.test",
    storage: store,
    fetcher: async () => {
      throw new Error("offline");
    },
  });
  assert.deepEqual(cached, result);
  await assert.rejects(() =>
    readQuickPlanEraseState({
      plan: existing,
      signedIn: true,
      email: "other@example.test",
      storage: store,
      fetcher: async () => {
        throw new Error("offline");
      },
    }),
  );
});
test("visitor erase guards make no session requests", async () => {
  assert.deepEqual(
    await readQuickPlanEraseState({
      plan: existing,
      signedIn: false,
      fetcher: () => {
        throw new Error("must not call");
      },
    }),
    { running: false, debrief: false, synchronized: false },
  );
});

test("merge summary counts short free stretches before placement", async () => {
  const { action } = fixture({
    plans: [
      { ...existing, items: [{ id: "kept", startMinute: 0, endMinute: 620 }] },
    ],
  });
  const data = await quickPlanDialogData({
    action,
    ids: new Set(["t00"]),
    locale: "fr",
    eraseState: async () => ({}),
  });
  assert.equal(data.freeMinutes, 100);
  assert.equal(data.free, "1 h 40");
});

test("a server refusal restores the replica before a destructive replacement", async () => {
  const store = storage();
  const action = createWebQuickPlanAction({
    document: { plans: [existing], nights: [], date, location },
    date,
    location,
    signedIn: true,
    email: "observer@example.test",
    capabilities: { "planner.multiple": false },
    inputsFor: async () => base,
    storage: store,
    csrf: () => "",
    fetcher: async () => ({
      ok: false,
      json: async () => ({ error: "refused" }),
    }),
    id: () => "new",
  });
  await assert.rejects(() => action.eraseAndCreate(selected), /refused/);
  const replica = JSON.parse(store.getItem("astro-portal:planner:space:v1"));
  assert.equal(replica.document.plans[0].id, "old");
  assert.equal(replica.dirty, false);
});

test("the dialog names a plan of another night by its date, never « ce soir »", () => {
  for (const locale of ["fr", "en", "ja"]) {
    const html = renderToStaticMarkup(
      createElement(PlanExistsCards, {
        data: { ...renderData, tonight: false },
        locale,
      }),
    );
    assert.ok(
      html.includes(
        quickPlanMessage(locale, "planExistsMergeTitleNight", {
          date: renderData.date,
        }),
      ),
    );
    assert.ok(
      html.includes(
        quickPlanMessage(locale, "planExistsEraseTitleNight", {
          date: renderData.date,
        }),
      ),
    );
    assert.ok(!html.includes(quickPlanMessage(locale, "planExistsMergeTitle")));
    assert.ok(!html.includes(quickPlanMessage(locale, "planExistsEraseTitle")));
  }
  const fr = renderToStaticMarkup(
    createElement(PlanExistsCards, { data: renderData, locale: "fr" }),
  );
  assert.ok(fr.includes("Fusionner avec le plan de ce soir"));
  assert.equal(
    quickPlanMessage("fr", "planExistsTitleNight", { date: "jeu. 15 oct." }),
    "Un plan existe déjà pour la nuit du jeu. 15 oct.",
  );
});

test("the dialog data tells whether the existing plan is the night on screen's", async () => {
  const { action } = fixture({ plans: [existing] });
  const of = (tonightDate) =>
    quickPlanDialogData({
      action,
      ids: new Set(["t00"]),
      locale: "fr",
      eraseState: async () => ({}),
      tonightDate,
    });
  assert.equal((await of(undefined)).tonight, true);
  assert.equal((await of(existing.date)).tonight, true);
  assert.equal((await of("2026-10-13")).tonight, false);
});

test("a plan made for another night than the one on screen is announced with its date", () => {
  const made = { kind: "created", plan: { date: "2026-10-15" } };
  assert.equal(planMadeElsewhere(made, "2026-10-14", "fr"), "jeu. 15 oct.");
  assert.equal(
    planMadeElsewhere({ ...made, kind: "merged" }, "2026-10-14", "en"),
    "Thu, Oct 15",
  );
  assert.equal(planMadeElsewhere(made, "2026-10-15", "fr"), null);
  assert.equal(
    planMadeElsewhere({ kind: "exists", plan: made.plan }, "2026-10-14", "fr"),
    null,
  );
  assert.equal(
    planMadeElsewhere({ kind: "created" }, "2026-10-14", "fr"),
    null,
  );
});
