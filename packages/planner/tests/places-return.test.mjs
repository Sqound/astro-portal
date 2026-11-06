// On the web, the fiche of a place replaces the list in
// the page, so "Retour" gives back the same tab, the same filters and the
// same position of the page. The tab and the filters are `PlacesView`'s own
// state (the fiche is drawn instead of the list, the component stays); the
// position of the page is remembered when a fiche opens and given back, once,
// when it closes.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const { createPlacesReturnMemory } = await import("planner/places-return.js");

test("the position of the page is remembered at the opening and given back once", () => {
  const scrolls = [];
  const environment = {
    scrollY: 640,
    scrollTo: (...args) => scrolls.push(args),
  };
  const memory = createPlacesReturnMemory();
  assert.equal(memory.pending, false);
  assert.equal(memory.restore(environment), false, "nothing to give back yet");
  memory.remember(environment);
  assert.equal(memory.pending, true);
  // The fiche is shorter: the page was reset to the top meanwhile.
  environment.scrollY = 0;
  assert.equal(memory.restore(environment), true);
  assert.deepEqual(scrolls, [[0, 640]]);
  assert.equal(memory.restore(environment), false, "once");
  assert.equal(memory.pending, false);
});

test("a window with no scroll position or no scrollTo does not break the return", () => {
  const memory = createPlacesReturnMemory();
  memory.remember({});
  assert.equal(memory.restore({ scrollTo: () => {} }), true);
  memory.remember({ scrollY: 12 });
  assert.equal(memory.restore({}), false);
});

test("the list keeps its tab and filters across the fiche: they are PlacesView's state, the fiche replaces the list", async () => {
  const source = await readFile(
    new URL("../src/components/PlacesView.js", import.meta.url),
    "utf8",
  );
  // The tab and the settings are state of the view itself …
  assert.match(source, /const \[tab, setTab\] = useState\("mine"\)/);
  assert.match(
    source,
    /const \[settings, setSettings\] = useState\(\(\) => initialPlacesSettings\(\)\)/,
  );
  // … the fiche is drawn instead of the list inside the same component, and
  // its "Retour" only clears the fiche.
  assert.match(source, /onBack=\{\(\) => setDetail\(null\)\}/);
  // The position of the page is remembered when a fiche opens.
  assert.match(source, /returnMemory\.current\.remember\(\)/);
  assert.match(source, /returnMemory\.current\.restore\(\)/);
});
