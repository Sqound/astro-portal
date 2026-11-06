import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  plannerFlowMessage as flow,
  plannerFlowMessages,
} from "../src/planner/flow-messages.js";
import { normaliseHorizonMask } from "../src/planner/horizon-mask.js";
import {
  horizonEditorCrownSegments,
  horizonEditorDragStep,
  horizonEditorGestureStart,
  horizonEditorPosition,
  horizonEditorSurveyedLabel,
  horizonEditorZenithZoneAltitude,
  withHorizonPointAltitude,
  withHorizonPointAltitudes,
} from "../src/planner/horizon-editor.js";

// The sectors of the horizon editor: which 10° sectors were surveyed (the
// crown of the circular plot, the band of the linear one, the line under the
// direction), and a stroke through the zenith of the circular plot, which
// is cancelled rather than drawn.

const surveyed = "2026-10-16T21:30:00.000Z";
const flat = normaliseHorizonMask({
  enabled: true,
  points: Array.from({ length: 36 }, (_, index) => ({
    azimuth: index * 10,
    altitude: 10,
    surveyedAt: surveyed,
  })),
});

const options = { projection: "circular", scaleX: 2, scaleY: 2 };

// A drag along the straight line from `from` to `to` (user units), in
// `steps` frames, the way the component plays it: the step, then the mask
// of the step, or the mask of the gesture's start when the step cancels.
function drag(mask, from, to, steps = 40) {
  const start = mask;
  let held = 27;
  let previous = from;
  let gesture = horizonEditorGestureStart(from, "circular");
  let cancelled = 0;
  for (let step = 1; step <= steps; step += 1) {
    const local = {
      x: from.x + ((to.x - from.x) * step) / steps,
      y: from.y + ((to.y - from.y) * step) / steps,
    };
    const result = horizonEditorDragStep(mask.points, held, previous, local, {
      ...options,
      gesture,
    });
    gesture = result.gesture;
    previous = local;
    if (result.cancelled) {
      cancelled += 1;
      mask = start;
      continue;
    }
    if (!result.updates.length) continue;
    mask = withHorizonPointAltitudes(mask, result.updates, new Date(0));
    held = result.held;
  }
  return { mask, cancelled };
}

test("a stroke from the west through the zenith to the east changes nothing", () => {
  // The fault reproduced: hold « O » (270°), cross the centre, let go in
  // the east. Without the rule the points swept on the way (the whole
  // southern half) were flattened towards the zenith.
  const west = horizonEditorPosition(
    { azimuth: 270, altitude: 10 },
    "circular",
  );
  const east = horizonEditorPosition({ azimuth: 90, altitude: 10 }, "circular");
  const { mask, cancelled } = drag(flat, west, east);
  assert.equal(cancelled, 1, "cancelled once, then silent");
  assert.deepEqual(mask, flat, "the mask and its dates of before the stroke");
  assert.equal(horizonEditorZenithZoneAltitude, 75);
});

test("a fast stroke that jumps over the zenith between two frames is cancelled too", () => {
  const west = horizonEditorPosition(
    { azimuth: 270, altitude: 30 },
    "circular",
  );
  const east = horizonEditorPosition({ azimuth: 90, altitude: 30 }, "circular");
  const { mask, cancelled } = drag(flat, west, east, 2);
  assert.equal(cancelled, 1);
  assert.deepEqual(mask, flat);
});

test("in the zenith zone the pointer stretches the held point only, and coming back on the same side keeps the stroke", () => {
  const west = horizonEditorPosition(
    { azimuth: 270, altitude: 10 },
    "circular",
  );
  const zenith = horizonEditorPosition(
    { azimuth: 270, altitude: 85 },
    "circular",
  );
  const { mask, cancelled } = drag(flat, west, zenith);
  assert.equal(cancelled, 0);
  mask.points.forEach((point, index) =>
    assert.equal(point.altitude, index === 27 ? 85 : 10, `${index * 10}°`),
  );
  // Out of the zone again on the side it came from (a turn of less than
  // 90°): an ordinary stroke.
  const back = horizonEditorPosition(
    { azimuth: 280, altitude: 40 },
    "circular",
  );
  let gesture = horizonEditorGestureStart(west, "circular");
  let step = horizonEditorDragStep(flat.points, 27, west, zenith, {
    ...options,
    gesture,
  });
  gesture = step.gesture;
  assert.equal(step.cancelled, false);
  step = horizonEditorDragStep(flat.points, 27, zenith, back, {
    ...options,
    gesture,
  });
  assert.equal(step.cancelled, false);
  assert.ok(step.updates.length > 0);
});

test("the linear plot has no zenith: the rule does not apply", () => {
  const gesture = horizonEditorGestureStart({ x: 270, y: 5 }, "linear");
  const step = horizonEditorDragStep(
    flat.points,
    27,
    { x: 270, y: 5 },
    { x: 90, y: 5 },
    { projection: "linear", scaleX: 2, scaleY: 2, gesture },
  );
  assert.equal(step.cancelled, false);
  assert.ok(step.updates.length > 1);
});

test("the crown: one arc per surveyed sector, three dashes per sector to survey, turned with the map", () => {
  const half = withHorizonPointAltitude(
    normaliseHorizonMask({ enabled: true, points: [] }),
    0,
    12,
    new Date(surveyed),
  );
  const segments = horizonEditorCrownSegments(half.points, 0);
  assert.equal(segments.length, 36);
  assert.equal(segments[0].surveyed, true);
  assert.equal(segments[0].paths.length, 1);
  assert.ok(segments.slice(1).every((segment) => !segment.surveyed));
  assert.ok(segments.slice(1).every((segment) => segment.paths.length === 3));
  // The north sector is centred on the top of the disc, 88.6 from the centre.
  const [, x1, y1, x2, y2] = segments[0].paths[0].match(
    /^M([\d.-]+) ([\d.-]+) A88\.6 88\.6 0 0 1 ([\d.-]+) ([\d.-]+)$/,
  );
  assert.ok(Math.abs(Number(x1) - 100 + (Number(x2) - 100)) < 0.01);
  assert.ok(Number(y1) < 12.5 && Number(y2) < 12.5);
  assert.ok(
    Math.abs(Math.hypot(Number(x1) - 100, Number(y1) - 100) - 88.6) < 0.01,
  );
  // Turned by 90°: the north sector is on the right.
  const turned = horizonEditorCrownSegments(half.points, 90)[0].paths[0];
  const [, tx] = turned.match(/^M([\d.-]+) /);
  assert.ok(Number(tx) > 185);
});

test("the line under the direction says when the sector was surveyed, or that it is to survey", () => {
  for (const locale of Object.keys(plannerFlowMessages)) {
    for (const key of [
      "horizonSurveyed",
      "horizonToSurvey",
      "horizonSurveyedOn",
      "horizonSectorsLegend",
    ]) {
      const text = flow(locale, key);
      assert.ok(text && text !== key, `${locale}: ${key}`);
    }
  }
  assert.equal(flow("fr", "horizonSurveyed"), "Relevé");
  assert.equal(flow("fr", "horizonToSurvey"), "À relever");
  assert.equal(
    horizonEditorSurveyedLabel(flat.points[30], "fr", "Europe/Paris"),
    "Relevé le 16 octobre 2026",
  );
  assert.equal(
    horizonEditorSurveyedLabel({ azimuth: 300, altitude: 0 }, "fr"),
    "À relever",
  );
  assert.match(
    horizonEditorSurveyedLabel(flat.points[30], "en", "UTC"),
    /^Surveyed on .*2026$/,
  );
});

test("the editor draws the crown, the band and the legend in the place's form only", () => {
  const editor = readFileSync(
    new URL(
      "../src/components/planner/PlannerHorizonEditor.js",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(editor, /showSurveyedSectors/);
  assert.match(editor, /planner-horizon-crown/);
  assert.match(editor, /planner-horizon-sectors-band/);
  assert.match(editor, /horizonEditorGestureStart\(/);
  const dialog = readFileSync(
    new URL("../src/components/planner/PlannerPlaceDialog.js", import.meta.url),
    "utf8",
  );
  assert.match(dialog, /showSurveyedSectors/);
  assert.match(dialog, /PlannerHorizonSectorsLegend/);
  for (const name of ["PlannerHorizonViewer.js", "PlannerPlaceDetails.js"]) {
    const source = readFileSync(
      new URL(`../src/components/planner/${name}`, import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(source, /showSurveyedSectors/, name);
  }
});
