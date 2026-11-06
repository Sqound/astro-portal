import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Read in the page itself: every way in to what a profile holds back goes
// through the gates, and the entry of the planner takes its words and its
// sign-in from the service it is shown on. The rendered screens are looked at
// in a browser, in each role; this holds the wiring, which a test of the pure
// modules cannot.

const source = readFileSync(
  new URL("../src/components/PlannerPage.js", import.meta.url),
  "utf8",
);
const dist = readFileSync(
  new URL("../dist/components/PlannerPage.js", import.meta.url),
  "utf8",
);

// The page is 14 000 lines: a failing assertion must name what is wrong, not
// print the file.
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

test("the page hands its gates the person's capabilities, not a product or an offer", () => {
  has(source, /plannerGates\(\{\s*capabilities,/);
  lacks(source, /advanced_planning/, "an offer's name");
  lacks(
    source,
    /capabilities\??\.\["sync\.plan_limit"\]/,
    "its own plan count",
  );
  lacks(source, /const canCreatePlan\b/, "the old plan check");
});

test("a plan is started only through the plan gate: the button, another night, another place on a finished night", () => {
  has(body("addPlan"), /planCreationGate\(/, "addPlan to ask the gate");
  has(
    body("addPlan"),
    /refuseCapability\(creation\.refusal\)/,
    "addPlan to say why",
  );
  has(
    body("update"),
    /planCreationGate\(/,
    "update (the date) to ask the gate",
  );
  has(
    body("update"),
    /createsPendingPlan\(/,
    "update to refuse only a new plan",
  );
  has(
    body("commitPlaceChange"),
    /planCreationGate\(/,
    "the place change to ask the gate",
  );
  // The buttons stay usable: only the missing place or night disables them.
  has(
    source,
    /const canCreatePlanNow = Boolean\(night\);/,
    "the button usable",
  );
});

test("a framing of a single field is everyone's; a mosaic is entered only through the mosaic gate", () => {
  // "Utiliser ce cadrage", "+" and the editor open for every profile…
  for (const name of ["openFraming", "openNewFramingEditor"])
    lacks(body(name), /mosaicHeld\(\)/, `${name} behind the mosaic gate`);
  lacks(source, /framingAuthoring|canAuthor|hideUseFramingAction=/);
  // …what reopens or rewrites a mosaic asks the gate…
  for (const name of ["openFramingEditorFor", "handleFramingAction"])
    has(
      body(name),
      /framingNeedsMosaic\([^)]*\)\s*&&\s*mosaicHeld\(\)/,
      `${name} to ask the mosaic gate for a mosaic only`,
    );
  // …and a surface is live only with the mosaics: the map, the framing drawn
  // from it and the settings (greyed otherwise) all read the live one.
  has(
    source,
    /const mosaicAvailable = Boolean\(surfaceModel\) && gates\.mosaic\.allowed;/,
  );
  has(source, /frameSurface=\{liveFrameSurface\}/);
  has(
    body("openFraming"),
    /surfaceDraftFields\(surfaceModel, liveFrameSurface,/,
    "the framing drawn from the live surface",
  );
  has(
    source,
    /onConfigureFrameSurface=\{\(\) =>\s*setFrameSurfaceSheetOpen\(true\)\s*\}/,
    "« Paramètres » to open the settings for everyone",
  );
  has(
    source,
    /<FrameSettingsSheet[\s\S]*?mosaicAllowed=\{gates\.mosaic\.allowed\}/,
  );
  // A visitor's framing stays in the plan of the browser, as the item's own
  // target: no account resource to write.
  has(body("addFraming"), /const inBrowser = !auth\.authenticated;/);
  has(body("addFraming"), /\.\.\.\(inBrowser \? \{\} : \{ framingId: id \}\)/);
  has(
    body("commitFramingEditor"),
    /if \(!auth\.authenticated\) \{[\s\S]*?addFramingReferenceToPlan\(planId, id, target\);/,
  );
  // The service's own refusal is worded like the screen's.
  has(source, /error\?\.code === "capability_required"/);
  has(source, /error\.code === "plan_limit_reached"/);
  // The library writes every framing but a held mosaic.
  has(source, /mosaicAllowed=\{mosaicAvailable\}/);
  has(
    source,
    /const canWrite = mosaicAllowed \|\| !framingNeedsMosaic\(target\);/,
  );
});

test("reading, exporting and clearing up a framing are never behind the gate", () => {
  const start = source.indexOf(
    '["rename", "restore", "edit", "editFree", "editCopy"]',
  );
  assert.ok(start > 0, "the list of held-back actions is there");
  const actions = source.slice(start, source.indexOf("switch (action)", start));
  lacks(actions, /export|delete|archive/, "a clearing-up action in the gate");
});

test("the entry takes its words, and where it signs in, from the service", () => {
  has(
    source,
    /plannerAccessCopy\(locale, \{\s*hosted: isHostedService\(auth\),/,
    "the entry's words from the service",
  );
  has(
    source,
    /plannerSignInHref\(\{\s*locale,\s*signInPath: auth\.signInPath,/,
    "the sign-in address from the service",
  );
  for (const old of [
    "Retrouvez vos plans privés",
    "Continuer en invité",
    "Continue as guest",
    "ゲストとして続ける",
    "/auth/login?next=",
  ])
    assert.equal(source.includes(old), false, `${old} lives in access-copy.js`);
});

test("the compiled page the service loads is the one that was read", () => {
  for (const wanted of [
    "planCreationGate(",
    "mosaicHeld()",
    "framingNeedsMosaic(",
    "FrameSettingsSheet",
    "plannerAccessCopy(",
    "plannerSignInHref(",
  ])
    assert.ok(
      dist.includes(wanted),
      `dist/components/PlannerPage.js: ${wanted}`,
    );
});
