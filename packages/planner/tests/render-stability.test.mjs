import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sameShallowContentProps } from "../src/render-stability.js";

// Folding a planner stage re-renders the page, which rebuilds the
// recommendation array and the selected-id set from the same card objects. The
// memoised list (`RecommendationTargetList`, PlannerPage.js) must treat that as
// "nothing changed", and anything a card shows as a change.

const cards = [{ target: { id: "m31" } }, { target: { id: "m42" } }];
const onAddCard = () => {};
const listProps = (overrides = {}) => ({
  cards: [...cards],
  selectedIds: new Set(["m42"]),
  locale: "fr",
  timeZone: "Europe/Paris",
  field: { width: 1, height: 1 },
  canAdd: true,
  onAddCard,
  mapSelectedTargetId: null,
  ...overrides,
});

test("a fold rebuilds the arrays and the set, not their content: equal", () => {
  const field = { width: 1, height: 1 };
  assert.equal(
    sameShallowContentProps(listProps({ field }), listProps({ field })),
    true,
  );
});

test("adding or removing a target from the plan re-renders the list", () => {
  const field = { width: 1, height: 1 };
  assert.equal(
    sameShallowContentProps(
      listProps({ field }),
      listProps({ field, selectedIds: new Set(["m42", "m31"]) }),
    ),
    false,
  );
  assert.equal(
    sameShallowContentProps(
      listProps({ field }),
      listProps({ field, selectedIds: new Set(["m31"]) }),
    ),
    false,
  );
});

test("a new sort order, a filtered card or a recomputed card re-renders", () => {
  const field = { width: 1, height: 1 };
  const base = listProps({ field });
  assert.equal(
    sameShallowContentProps(
      base,
      listProps({ field, cards: [cards[1], cards[0]] }),
    ),
    false,
  );
  assert.equal(
    sameShallowContentProps(base, listProps({ field, cards: [cards[0]] })),
    false,
  );
  assert.equal(
    sameShallowContentProps(
      base,
      listProps({ field, cards: [{ ...cards[0] }, cards[1]] }),
    ),
    false,
  );
});

test("any other prop compares by identity", () => {
  const field = { width: 1, height: 1 };
  const base = listProps({ field });
  assert.equal(
    sameShallowContentProps(base, listProps({ field: { ...field } })),
    false,
  );
  assert.equal(
    sameShallowContentProps(base, listProps({ field, onAddCard: () => {} })),
    false,
  );
  assert.equal(
    sameShallowContentProps(
      base,
      listProps({ field, mapSelectedTargetId: "m31" }),
    ),
    false,
  );
  assert.equal(
    sameShallowContentProps(base, { ...listProps({ field }), extra: 1 }),
    false,
  );
});

// Second scenario (a guest of a private portal): the guest's camera,
// eyepiece and modifier lists were once a fresh `[]` on every render, which
// made `equipment` a new object and recomputed `planNight` -- and every card --
// on any render at all. A guest's lists are now the page's shared default
// lists (a visitor is limited to the default equipment), never a fresh one.
test("a guest's equipment lists are the shared default lists, never a fresh []", () => {
  const source = readFileSync(
    new URL("../src/components/PlannerPage.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /guestWithPrivateInventory\s*\?\s*\[\]/);
  for (const [list, guest] of [
    ["plannerCameras", "guestCameras"],
    ["plannerEyepieces", "guestEyepieces"],
    ["plannerModifiers", "guestModifiers"],
  ])
    assert.match(
      source,
      new RegExp(
        `const ${list} = auth\\.authenticated[\\s\\S]{0,80}?: ${guest};`,
      ),
      list,
    );
});
