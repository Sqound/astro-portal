import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import { registerHeldChipOffers } from "./helpers/offers-stub.mjs";
import {
  PLANNER_EXTENSION_POINTS,
  getPlannerExtensions,
  registerPlannerExtension,
} from "portal/planner/extensions.js";
import {
  MULTI_NIGHT_CORE_COPY,
  multiNightAccess,
  multiNightBadgeFor,
  planBandText,
  planItemTargetName,
  planKindChoiceOutcome,
  planProjectIds,
  shownPlanKindFor,
} from "../src/multi-night-access.js";

// The multi-night plans' views are registered at `planner.projects` (by
// every shell); the open planner only says where they belong, and draws
// their entries held back on the hosted service. Nothing registered:
// nothing at all, and a plan with `projectId` items reads as any plan. A
// private server never restricts them.

await registerJsx();
const { PlanKindSwitch, HeldFollowAction, PlanActionsMenu } =
  await import("planner/components/MultiNightEntries.js");

const render = (component, props) =>
  renderToStaticMarkup(createElement(component, props));
const page = readFileSync(
  new URL("../src/components/PlannerPage.js", import.meta.url),
  "utf8",
);
const debrief = readFileSync(
  new URL(
    "../../portal/src/components/sessions/DebriefScreen.js",
    import.meta.url,
  ),
  "utf8",
);
const mosaic = { "planner.mosaic": true };
const free = { "planner.mosaic": false };

test("planner.projects is a point of the closed list", () => {
  assert.ok(PLANNER_EXTENSION_POINTS.includes("planner.projects"));
  const views = { LibraryView: () => null };
  registerPlannerExtension("planner.projects", views);
  assert.equal(getPlannerExtensions("planner.projects")[0], views);
});

test("absent: nothing registered shows nothing", () => {
  for (const capabilities of [null, mosaic, free])
    for (const signedIn of [true, false])
      for (const hosted of [true, false])
        assert.equal(
          multiNightAccess({
            registered: false,
            hosted,
            signedIn,
            capabilities,
          }),
          "absent",
        );
});

// The server never
// restricts the multi-night plans — on a private server they are open to its
// person whatever the profile, never read-only, never held back.
test("a private server, signed in: open, whatever the profile and what it holds; signed out: visitor", () => {
  for (const capabilities of [null, mosaic, free])
    for (const stored of [0, 2])
      for (const readOnlyWindow of [false, true]) {
        assert.equal(
          multiNightAccess({
            registered: true,
            hosted: false,
            signedIn: true,
            capabilities,
            stored,
            readOnlyWindow,
          }),
          "open",
        );
        assert.equal(
          multiNightAccess({
            registered: true,
            hosted: false,
            signedIn: false,
            capabilities,
            stored,
          }),
          "visitor",
        );
      }
  // The hosted service holds them back without the capability.
  assert.equal(
    multiNightAccess({
      registered: true,
      hosted: true,
      signedIn: true,
      capabilities: free,
      stored: 2,
    }),
    "heldBack",
  );
});

test("registered with the capability: open; without: held back; signed out: visitor", () => {
  const hosted = { registered: true, hosted: true };
  assert.equal(
    multiNightAccess({ ...hosted, signedIn: true, capabilities: mosaic }),
    "open",
  );
  assert.equal(
    multiNightAccess({ ...hosted, signedIn: true, capabilities: free }),
    "heldBack",
  );
  // A profile that says nothing grants nothing: the capability sells them.
  assert.equal(
    multiNightAccess({ ...hosted, signedIn: true, capabilities: null }),
    "heldBack",
  );
  assert.equal(
    multiNightAccess({ ...hosted, signedIn: false, capabilities: mosaic }),
    "visitor",
  );
});

test("held back: the follow action carries the chip and leads to the offers", () => {
  registerHeldChipOffers();
  const follow = render(HeldFollowAction, {
    locale: "fr",
    badge: "Planification avancée",
    onPress() {},
  });
  assert.match(follow, /class="btn-tertiary"[^>]*>Suivre sur plusieurs nuits</);
  assert.match(follow, /data-advanced-chip="planning"/);
});

test("the switch « Une nuit | Multi-nuits » and the menu « Actions du plan »", () => {
  const html = render(PlanKindSwitch, {
    locale: "fr",
    value: "multi",
    onChange() {},
  });
  assert.match(
    html,
    /role="tablist" aria-label="Afficher vos plans d’une nuit ou vos plans multi-nuits"/,
  );
  assert.match(html, /aria-selected="false"[^>]*><span>Une nuit<\/span>/);
  assert.match(html, /aria-selected="true"[^>]*><span>Multi-nuits<\/span>/);
  // No tag while nothing is sold or the purchase is owned…
  assert.doesNotMatch(html, /advanced-chip/);
  // … and, held back where it is sold, the tag under "Multi-nuits", inside
  // the choice, never under "Une nuit".
  registerHeldChipOffers();
  const held = render(PlanKindSwitch, {
    locale: "fr",
    value: "one",
    onChange() {},
    badge: "Planification avancée",
  });
  assert.match(
    held,
    /data-plan-kind="multi"[^>]*><span>Multi-nuits<\/span><span class="advanced-chip-wrap"><span class="advanced-chip is-locked" role="img" aria-label="Planification avancée"/,
  );
  assert.doesNotMatch(
    held.slice(0, held.indexOf('data-plan-kind="multi"')),
    /advanced-chip/,
  );
  const menu = render(PlanActionsMenu, {
    label: "Actions du plan",
    items: [
      { key: "a", label: "Transformer en plan multi-nuits", onSelect() {} },
    ],
  });
  assert.match(menu, /aria-label="Actions du plan"/);
  assert.match(menu, /aria-haspopup="menu"/);
  assert.equal(render(PlanActionsMenu, { label: "x", items: [] }), "");
});

test("a plan's links: its multi-night plans and its band, read from its items", () => {
  const plan = {
    items: [
      { id: "a", target: { designation: "NGC 6543" } },
      { id: "b", projectId: "p1", target: { designation: "NGC 7000" } },
      { id: "c", projectId: "p1" },
      {
        id: "d",
        projectId: "p2",
        target: { title: "M33 — Galaxie du Triangle" },
      },
    ],
  };
  assert.deepEqual(planProjectIds(plan), ["p1", "p2"]);
  assert.equal(planBandText("fr", plan), "plan multi-nuits NGC 7000");
  assert.equal(planBandText("en", plan), "multi-night plan NGC 7000");
  assert.equal(planBandText("fr", { items: [{ id: "a" }] }), null);
  assert.equal(planItemTargetName({ id: "x" }), "x");
});

test("the planner reads the point where each entry belongs, and only draws the switch when it is registered", () => {
  assert.match(page, /plannerExtension\("planner\.projects"\)/);
  assert.match(
    page,
    /multiNightAccess\(\{\s*registered: Boolean\(projectsExtension\)/,
  );
  assert.match(
    page,
    /multiNight === "absent"\s*\?\s*null\s*:\s*\(\s*<div className="plan-kind-switch-row">/,
  );
  // "Nouveau plan" asks first, but only when they are shown.
  assert.match(
    page,
    /const requestNewPlan = \(\) => \{\s*if \(multiNightEntries === "absent"\) \{\s*addPlan\(\);/,
  );
  // Read-only (a private server), the library shows the core's view and
  // nothing else asks for them: no question, no plan menu, no timeline entry.
  assert.match(
    page,
    /const multiNightEntries = multiNight === "readOnly" \? "absent" : multiNight;/,
  );
  assert.match(
    page,
    /multiNight === "readOnly" \? \(\s*<MultiNightReadOnlyView/,
  );
  assert.match(
    page,
    /\{multiNightEntries !== "absent" &&\s*planStatus\(plan\) === "pending"/,
  );
  assert.match(page, /renderEditorExtra=\{\s*multiNightEntries === "absent"/);
  // Held back, every entry leads to the offers ("Plans sur plusieurs
  // nuits") where they are sold, and says why in the core's words where
  // nothing is.
  assert.match(
    page,
    /else if \(multiNight === "heldBack"\) \{[\s\S]{0,400}lockedOffersHref\(locale, "planning", "multiNight"\)[\s\S]{0,200}else refuseCapability\("multiNight"\)/,
  );
  for (const member of [
    "LibraryView",
    "CreateDialog",
    "TimelineAction",
    "PlanMenu",
    "PlanBand",
  ])
    assert.match(page, new RegExp(`projectsExtension\\.${member}`));
  // The core never names an offer, nor says "projet" on the screen.
  assert.doesNotMatch(page, /advanced_planning/);
  for (const words of Object.values(MULTI_NIGHT_CORE_COPY))
    for (const value of Object.values(words))
      assert.doesNotMatch(value, /projet|project|プロジェクト|compte|portail/i);
});

test("the debriefing: the shell's link to the plan's progress and the note of the missing photo, only when registered", () => {
  assert.match(
    debrief,
    /getPlannerExtensions\("planner\.projects"\)\[0\] \|\| null/,
  );
  // The night of a multi-night plan has no send button and says why
  // ("La photo finale viendra à la fin du plan multi-nuits"); the shell's
  // link draws the progress the night adds, in the card of the targets.
  assert.match(debrief, /const multiNight = Boolean\(\s*projects &&/);
  assert.match(debrief, /summaryMode && projects\?\.DebriefLink/);
  assert.match(debrief, /debriefMultiNightNoPhoto/);
});

// Without "Planification avancée", a tap on the
// "Multi-nuits" segment opens the offers (the guard of "Nouveau plan
// multi-nuits") and the library stays on "Une nuit"; nothing changes once
// owned, signed out, or on a private server.
const buttonOf = (node, kind) => {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = buttonOf(child, kind);
      if (found) return found;
    }
    return null;
  }
  if (node.props?.["data-plan-kind"] === kind) return node;
  return buttonOf(node.props?.children, kind);
};

test("the switch's « Multi-nuits » segment leads to the offers while the purchase is missing, and opens the side in every other profile", () => {
  for (const [access, outcome] of [
    ["heldBack", "offers"],
    ["open", "multi"],
    ["visitor", "multi"],
    ["readOnly", "multi"],
  ]) {
    let chosen = null;
    const tree = PlanKindSwitch({
      locale: "fr",
      value: "one",
      badge: access === "heldBack" ? "Planification avancée" : null,
      onChange: (kind) => {
        chosen = planKindChoiceOutcome(access, kind);
      },
    });
    buttonOf(tree, "multi").props.onClick();
    assert.equal(chosen, outcome, access);
    buttonOf(tree, "one").props.onClick();
    assert.equal(chosen, "one", `${access}: « Une nuit » stays a plain choice`);
  }
  // The side shown: never the multi-night one while held back.
  assert.equal(shownPlanKindFor("heldBack", "multi"), "one");
  assert.equal(shownPlanKindFor("heldBack", "one"), "one");
  for (const access of ["open", "visitor", "readOnly"])
    assert.equal(shownPlanKindFor(access, "multi"), "multi", access);
  // The planner wires the switch to that guard, which is the entries' own
  // (`enterMultiNight`: the offers on "Plans sur plusieurs nuits").
  assert.match(page, /onChange=\{choosePlanKind\}/);
  assert.match(
    page,
    /planKindChoiceOutcome\(multiNight, kind\) === "offers"\) \{\s*enterMultiNight\(/,
  );
  assert.match(
    page,
    /const planKind = shownPlanKindFor\(multiNight, shownPlanKind\)/,
  );
});

test("the chip of « Nouveau plan »'s « Un plan multi-nuits » follows the capability, in each role", () => {
  const label = "Planification avancée";
  // free (heldBack): the chip; owned or both (open), a private server
  // (absent / readOnly), a signed-out visitor: nothing, like the switch's tab.
  assert.equal(multiNightBadgeFor("heldBack", label), label);
  for (const access of ["open", "readOnly", "visitor", "absent"])
    assert.equal(multiNightBadgeFor(access, label), null, access);
  assert.equal(multiNightBadgeFor("heldBack", undefined), null);
  // Both entries read the same answer.
  assert.match(
    page,
    /badge=\{multiNightBadgeFor\(multiNight, multiNightBadge\)\}\s+onClose=/,
  );
  assert.match(
    page,
    /onChange=\{choosePlanKind\}\s+badge=\{multiNightBadgeFor\(multiNight, multiNightBadge\)\}/,
  );
  assert.doesNotMatch(page, /badge=\{multiNightBadge\}\s+onClose=/);
});
