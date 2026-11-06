import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { message } from "../src/i18n.js";
import {
  plannerFlowMessage as flow,
  plannerFlowMessages,
} from "../src/planner/flow-messages.js";
import { normaliseHorizonMask } from "../src/planner/horizon-mask.js";
import {
  grabbedHorizonHandle,
  horizonEditorAltitudeAt,
  horizonEditorDirectionAt,
  horizonEditorDragStep,
  horizonEditorHeadedTo,
  horizonEditorInReach,
  horizonEditorPosition,
  nearestHorizonHandle,
  steppedHorizonMask,
  withHorizonPointAltitude,
  withHorizonPointAltitudes,
} from "../src/planner/horizon-editor.js";

// The web horizon editor with one point every 10°. Its geometry and its
// edits are pure functions; the component's wiring is read in its source, as
// the other page tests do.

const mask = normaliseHorizonMask({
  enabled: true,
  points: Array.from({ length: 36 }, (_, index) => ({
    azimuth: index * 10,
    altitude: index === 9 ? 40 : index === 10 ? 38 : 0,
  })),
});

test("both projections place a point where the plot draws it", () => {
  // Circular: north up, the altitude-0 ring at a radius of 86, the zenith in
  // the centre; the orientation turns the whole disc.
  const north = horizonEditorPosition({ azimuth: 0, altitude: 0 }, "circular");
  assert.ok(Math.abs(north.x - 100) < 1e-9 && Math.abs(north.y - 14) < 1e-9);
  const east = horizonEditorPosition({ azimuth: 90, altitude: 45 }, "circular");
  assert.ok(Math.abs(east.x - 143) < 1e-9 && Math.abs(east.y - 100) < 1e-9);
  const turned = horizonEditorPosition(
    { azimuth: 0, altitude: 0 },
    "circular",
    90,
  );
  assert.ok(Math.abs(turned.x - 186) < 1e-9);
  // Linear: azimuth across, altitude up.
  assert.deepEqual(
    horizonEditorPosition({ azimuth: 120, altitude: 30 }, "linear"),
    { x: 120, y: 60 },
  );
  // The altitude a pointer gives is the inverse of the same geometry.
  assert.ok(Math.abs(horizonEditorAltitudeAt(east, "circular") - 45) < 1e-9);
  assert.equal(horizonEditorAltitudeAt({ x: 120, y: 60 }, "linear"), 30);
});

test("a pointer takes the nearest handle within reach of a finger", () => {
  // Linear plot 720 × 180 px: 2 px per unit both ways. The pointer sits
  // between the 90° and 100° handles, nearer the 100° one.
  const scale = { projection: "linear", scaleX: 2, scaleY: 2 };
  assert.equal(nearestHorizonHandle(mask.points, { x: 96, y: 52 }, scale), 10);
  assert.equal(nearestHorizonHandle(mask.points, { x: 91, y: 50 }, scale), 9);
  // Circular: the raised 90° point is taken near where it is drawn, not by
  // the flat 80° one at the rim beside it.
  const raised = horizonEditorPosition(mask.points[9], "circular");
  assert.equal(
    nearestHorizonHandle(
      mask.points,
      { x: raised.x + 1, y: raised.y - 1 },
      { projection: "circular", scaleX: 1.8, scaleY: 1.8 },
    ),
    9,
  );
});

test("far from every handle, a pointer takes the direction under it", () => {
  // High above the flat 200° point of the linear plot: no handle in reach.
  assert.equal(
    grabbedHorizonHandle(
      mask.points,
      { x: 201, y: 10 },
      { projection: "linear", scaleX: 2, scaleY: 2 },
    ),
    null,
  );
  assert.equal(
    nearestHorizonHandle(
      mask.points,
      { x: 201, y: 10 },
      { projection: "linear", scaleX: 2, scaleY: 2 },
    ),
    20,
  );
  // In the circular plot, the direction is the angle round the centre.
  assert.equal(horizonEditorDirectionAt({ x: 100, y: 160 }, "circular", 0), 18);
  assert.equal(horizonEditorDirectionAt({ x: 100, y: 160 }, "circular", 90), 9);
  // The black corners of the circular square start nothing.
  assert.equal(horizonEditorInReach({ x: 5, y: 5 }, "circular"), false);
  assert.equal(horizonEditorInReach({ x: 100, y: 12 }, "circular"), true);
  assert.equal(horizonEditorInReach({ x: 5, y: 5 }, "linear"), true);
});

test("the « − » / « + » steppers move the selected point by one degree, within 0°–90°", () => {
  const raised = steppedHorizonMask(mask, 9, 1);
  assert.equal(raised.points[9].altitude, 41);
  assert.equal(steppedHorizonMask(mask, 9, -1).points[9].altitude, 39);
  // Only that point moves.
  raised.points.forEach((point, index) => {
    if (index !== 9) assert.deepEqual(point, mask.points[index]);
  });
  assert.equal(steppedHorizonMask(mask, 0, -1).points[0].altitude, 0);
  const top = withHorizonPointAltitude(mask, 4, 90);
  assert.equal(steppedHorizonMask(top, 4, 1).points[4].altitude, 90);
  // A dragged height is a whole degree; a former mask is edited on the grid.
  assert.equal(withHorizonPointAltitude(mask, 2, 12.6).points[2].altitude, 13);
  const former = {
    enabled: true,
    points: Array.from({ length: 12 }, (_, index) => ({
      azimuth: index * 30,
      altitude: index === 1 ? 30 : 0,
    })),
  };
  const stepped = steppedHorizonMask(former, 2, 1);
  assert.equal(stepped.points.length, 36);
  assert.equal(stepped.points[2].altitude, 21);
  assert.equal(stepped.points[3].altitude, 30);
});

test("the editor draws 36 handles, one keyboard stop, and the two steppers", () => {
  const source = readFileSync(
    new URL(
      "../src/components/planner/PlannerHorizonEditor.js",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /const draft = normaliseHorizonMask\(mask\)/);
  assert.match(source, /grabbedHorizonHandle\(draft\.points, local/);
  // A tap on a handle selects it without moving it; elsewhere it places the
  // point of the direction under the pointer.
  assert.match(source, /if \(grabbed === null\) movePoint\(event, index\)/);
  // No per-handle hit area any more: the plot takes the pointer.
  assert.doesNotMatch(source, /planner-horizon-handle-hit/);
  assert.match(source, /tabIndex=\{selected \? 0 : -1\}/);
  assert.match(source, /flow\(locale, "horizonLower"\)/);
  assert.match(source, /flow\(locale, "horizonRaise"\)/);
  assert.match(source, /length: horizonMaskPointCount \+ 1/);
  // The two labels exist in the three languages, and differ.
  for (const locale of ["fr", "en", "ja"]) {
    const lower = flow(locale, "horizonLower");
    const raise = flow(locale, "horizonRaise");
    assert.ok(lower && raise && lower !== raise, locale);
  }
  assert.equal(flow("fr", "horizonLower"), "Baisser ce point de 1°");
  assert.equal(flow("fr", "horizonRaise"), "Monter ce point de 1°");
  assert.ok(message("fr", "plannerHorizonMaskPlot"));
});

test("the direction under a pointer wraps round north in both projections", () => {
  // Just west of north on the circular plot, and at the right edge of the
  // linear one: both are the 0° direction, never a 37th.
  assert.equal(horizonEditorDirectionAt({ x: 99, y: 20 }, "circular"), 0);
  assert.equal(horizonEditorDirectionAt({ x: 357, y: 40 }, "linear"), 0);
  assert.equal(horizonEditorDirectionAt({ x: 353, y: 40 }, "linear"), 35);
  assert.equal(horizonEditorDirectionAt({ x: -4, y: 40 }, "linear"), 0);
});

// One gesture draws the whole horizon.
test("a scripted drag across the 36 points sets each to the pointer's height, in both projections, with no lift", () => {
  const flat = normaliseHorizonMask({
    enabled: true,
    points: Array.from({ length: 36 }, (_, index) => ({
      azimuth: index * 10,
      altitude: 0,
    })),
  });
  for (const projection of ["linear", "circular"]) {
    // The pointer draws a ramp: the height at azimuth a is 10 + a / 12.
    const at = (azimuthDegrees) => {
      const altitude = 10 + azimuthDegrees / 12;
      if (projection === "linear") {
        return { x: azimuthDegrees, y: 90 - altitude };
      }
      return horizonEditorPosition(
        { azimuth: azimuthDegrees, altitude },
        "circular",
      );
    };
    // 720 px by 180 px (linear), 400 px square (circular): two px per unit.
    const options = { projection, scaleX: 2, scaleY: 2 };
    let mask = flat;
    let held = nearestHorizonHandle(mask.points, at(0), options);
    let previous = at(0);
    mask = withHorizonPointAltitude(
      mask,
      held,
      horizonEditorAltitudeAt(at(0), projection),
    );
    for (let azimuth = 2; azimuth <= 350; azimuth += 2) {
      const local = at(azimuth);
      const step = horizonEditorDragStep(
        mask.points,
        held,
        previous,
        local,
        options,
      );
      mask = withHorizonPointAltitudes(mask, step.updates);
      held = step.held;
      previous = local;
    }
    // Every point from 0° to 350° took the height of the ramp at its azimuth
    // (to the degree the drawing rounds to, and the step of 2° the pointer
    // moved by).
    mask.points.forEach((point, index) => {
      const expected = 10 + (index * 10) / 12;
      assert.ok(
        Math.abs(point.altitude - expected) <= 2,
        `${projection} ${index * 10}°: ${point.altitude} vs ${expected.toFixed(1)}`,
      );
    });
  }
});

test("a vertical stretch with a little lateral wobble keeps the held point", () => {
  const options = { projection: "linear", scaleX: 2, scaleY: 2 };
  // Held: the 90° point (index 9). The pointer wobbles 5 px (2.5 units) either
  // side of its azimuth while going up and down: no switch.
  for (const x of [88, 90, 92.5, 87.5]) {
    const step = horizonEditorDragStep(
      mask.points,
      9,
      { x: 90, y: 60 },
      { x, y: 30 },
      options,
    );
    assert.equal(step.held, 9, `x = ${x}`);
    assert.deepEqual(
      step.updates.map((update) => update.index),
      [9],
    );
  }
  // 10 px away (5 units): the nearest point is the next one but the
  // hysteresis (12 px) is not crossed yet.
  assert.equal(
    horizonEditorHeadedTo(mask.points, 9, { x: 95, y: 30 }, options),
    null,
  );
  // 14 px away: the point under the pointer is taken, and the point is
  // attracted to the pointer's height.
  const step = horizonEditorDragStep(
    mask.points,
    9,
    { x: 90, y: 60 },
    { x: 97, y: 30 },
    options,
  );
  assert.equal(step.held, 10);
  assert.deepEqual(step.updates, [{ index: 10, altitude: 60 }]);
  // Going back the other way works the same, and across north.
  assert.equal(
    horizonEditorDragStep(
      mask.points,
      0,
      { x: 2, y: 40 },
      { x: 352, y: 40 },
      options,
    ).held,
    35,
  );
});

test("the web editor wires the drag step and a tap still only selects", () => {
  const source = readFileSync(
    new URL(
      "../src/components/planner/PlannerHorizonEditor.js",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /horizonEditorDragStep\(/);
  assert.match(source, /withHorizonPointAltitudes\(draft, step\.updates\)/);
  // The pointer-down rule is untouched: a handle in reach is only selected.
  assert.match(source, /if \(grabbed === null\) movePoint\(event, index\)/);
});

test("the horizon step says what the horizon is for, in ten languages, under the title and above the help", () => {
  // The words of the horizon step's banner, in the ten catalogues.
  const locales = Object.keys(plannerFlowMessages);
  assert.equal(locales.length, 10);
  for (const locale of locales) {
    const text = flow(locale, "horizonWhy");
    assert.ok(text && text !== "horizonWhy", `${locale}: horizonWhy`);
    assert.notEqual(text, flow(locale, "horizonHelp"), locale);
  }
  assert.equal(
    flow("fr", "horizonWhy"),
    "La définition de l’horizon permettra d’exclure les cibles qui ne sont pas visibles et d’améliorer l’aide à la mise en station de votre télescope.",
  );
  const source = readFileSync(
    new URL("../src/components/planner/PlannerPlaceDialog.js", import.meta.url),
    "utf8",
  );
  const title = source.indexOf('flow(locale, "horizonStep")');
  const why = source.indexOf('flow(locale, "horizonWhy")');
  const help = source.indexOf('flow(locale, "horizonHelp")');
  assert.ok(title > 0 && title < why && why < help);
  assert.match(source, /className="planner-place-why" role="note"/);
  // Where to record from follows what the horizon is for, in the banner.
  for (const locale of locales) {
    const close = flow(locale, "horizonCloseToMount");
    assert.ok(
      close && close !== "horizonCloseToMount",
      `${locale}: horizonCloseToMount`,
    );
  }
  assert.equal(
    flow("fr", "horizonCloseToMount"),
    "Relevez-le au plus près de la monture.",
  );
  const close = source.indexOf('flow(locale, "horizonCloseToMount")');
  assert.ok(
    close > why && close < help,
    "the line follows the banner's text, before its ⓘ",
  );
});
