import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The plans made in this browser without a space, when its person signs in to a
// space. The rules are tested in browser-plans.test.mjs; this holds the wiring
// of the page, which it cannot read.

const source = readFileSync(
  new URL("../src/components/PlannerPage.js", import.meta.url),
  "utf8",
);
const dist = readFileSync(
  new URL("../dist/components/PlannerPage.js", import.meta.url),
  "utf8",
);

const has = (text, pattern, what) =>
  assert.ok(pattern.test(text), `expected ${what || pattern}`);
const lacks = (text, pattern, what) =>
  assert.ok(!pattern.test(text), `unexpected ${what || pattern}`);

const page = source.indexOf("export function PlannerPage(");

/** The body of `const name = (...) => {` in the page, up to the next two-space `};`. */
function body(name) {
  const start = source.indexOf(`  const ${name} = `, page);
  assert.ok(start >= 0, `${name} is defined`);
  const end = source.indexOf("\n  };\n", start);
  return source.slice(start, end);
}

test("only the plans of the space count toward its limit: a plan kept in the browser takes no place", () => {
  has(
    source,
    /plans: spacePlansOf\(state\.plans\)/,
    "the gates on space plans",
  );
  for (const name of ["addPlan", "commitPlaceChange", "update"])
    has(
      body(name),
      /plans: spacePlansOf\(/,
      `${name} to ask the gate about the space's plans`,
    );
});

test("deleting a plan kept in the browser records nothing for the space", () => {
  has(
    body("removePlan"),
    /if \(!isBrowserPlan\(removedPlan\)\) \{\s*deletedPlanIdsRef\.current\.add\(id\);/,
  );
});

test("the mark of a plan kept in the browser never leaves the page: the stores and the service get the halves", () => {
  const remember = body("rememberScreen");
  has(remember, /splitPlannerDocument\(screenDocument\)/, "the screen split");
  has(
    remember,
    /rememberSpace\(space, \{ dirty \}\)/,
    "the space's half to its copy",
  );
  has(
    remember,
    /browserDocumentAfterEdit\(/,
    "the browser's half to its store",
  );
  // The service is sent the space's half, never the screen.
  // (the revisions the service gave and the plans nobody touched are put on
  // that half, which stays the document sent.)
  has(source, /const screenSpace = splitPlannerDocument\(document\)\.space;/);
  has(
    source,
    /persistToServer\(\s*rebaseOnRevisions\(\s*servedFormOfUntouchedPlans\(\s*screenSpace,/,
  );
  // What is compared with the space when the network returns is its half too.
  has(
    body("synchronizeSpaceOnce"),
    /: splitPlannerDocument\(snapshot\)\.space;/,
  );
  lacks(
    source,
    /localStorage\.setItem\(storageKey, JSON\.stringify\(winner\)\)/,
    "the space's document written to the browser's store",
  );
});

test("the plans of the browser are taken through the import, after the space is read, and asked when the space holds something", () => {
  const sync = body("synchronizeSpaceOnce");
  has(sync, /carryBrowserPlans\(\{/, "the taking");
  has(
    sync,
    /persistToServer\(document, "import"\)/,
    "the service's import mode",
  );
  has(sync, /answer: spaceRecordRef\.current\.answer/, "the person's answer");
  has(
    sync,
    /keepBrowser: rememberBrowser/,
    "the browser's store, written last",
  );
  assert.ok(
    sync.indexOf("rememberSpace(winner, { dirty: false })") <
      sync.indexOf("carryBrowserPlans({"),
    "the space is settled before the browser's plans are taken",
  );
  has(source, /onAnswer\("declined"\)/, "« les laisser »");
  has(source, /onAnswer\("accepted"\)/, "« les ajouter »");
  has(
    body("dismissBrowserPlansQuestion"),
    /questionDismissedRef\.current = true/,
    "the cross answering nothing",
  );
});

test("a copy of a space is dropped for another address, and for a signed-out browser unless it holds edits the space never got", () => {
  has(
    source,
    /if \(replica && !replica\.dirty\) clearSpaceReplica\(localStorage\);/,
  );
  has(source, /if \(replica && !own\) clearSpaceReplica\(localStorage\);/);
  has(
    source,
    /replica && sameSpace\(replica\.email, signedInEmail\) \? replica : null/,
  );
});

test("the compiled page carries the taking of the plans of the browser", () => {
  for (const wanted of [
    "carryBrowserPlans(",
    "splitPlannerDocument(",
    "BrowserPlansDialog",
    "spacePlansOf(",
    "clearSpaceReplica(",
  ])
    assert.ok(
      dist.includes(wanted),
      `dist/components/PlannerPage.js: ${wanted}`,
    );
});
