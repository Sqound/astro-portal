import assert from "node:assert/strict";
import test from "node:test";
import { framingNinaCsv, ninaPositionAngle } from "planner/export.js";
import { framingPreviewPictureStyle } from "planner/framings.js";
import {
  framingFootprint,
  framingTargetsUnderFrame,
} from "planner/framing-targets.js";

// On the web side, a framing's angle is
// N.I.N.A.'s position angle -- where the top of the picture points, counted
// from the north towards the east. On the north-up, east-left map, 30° turns
// the top of the frame to the left (counter-clockwise) and 90° points it east;
// the preview turns its picture clockwise by the angle; the export writes it
// as it is.

const degree = Math.PI / 180;
const m42 = { ra: 83.82, dec: -5.39 };
const field = { width: 1.39, height: 1.04, shape: "rectangle" };
const ra = m42.ra * degree;
const dec = m42.dec * degree;
const east = [-Math.sin(ra), Math.cos(ra), 0];
const north = [
  -Math.sin(dec) * Math.cos(ra),
  -Math.sin(dec) * Math.sin(ra),
  Math.cos(dec),
];

function assertVector(actual, expected, label) {
  for (let index = 0; index < 3; index += 1)
    assert.ok(
      Math.abs(actual[index] - expected[index]) < 1e-12,
      `${label}[${index}]: ${actual[index]} against ${expected[index]}`,
    );
}

test("at 0° the top of the frame is the north and its width runs east-west", () => {
  const frame = framingFootprint({ center: m42, field });
  assertVector(frame.yAxis, north, "top");
  assertVector(frame.xAxis, east, "across");
});

test("at 30° the top of the frame turns 30° from the north towards the east", () => {
  const frame = framingFootprint({ center: m42, field, angleDegrees: 30 });
  assertVector(
    frame.yAxis,
    north.map(
      (value, index) =>
        value * Math.cos(30 * degree) + east[index] * Math.sin(30 * degree),
    ),
    "top",
  );
});

test("at 90° the top of the frame points east and the export writes « 90.00 »", () => {
  const frame = framingFootprint({ center: m42, field, angleDegrees: 90 });
  assertVector(frame.yAxis, east, "top");
  assertVector(
    frame.xAxis,
    north.map((value) => -value),
    "across",
  );
  assert.equal(ninaPositionAngle(90), "90.00");
  assert.equal(
    framingNinaCsv({
      id: "framing-1",
      source: "framing:framing-1",
      designation: "M42",
      title: "M42",
      coordinate: m42,
      framing: { angleDegrees: 90 },
    }).content,
    "Pane,RA,DEC,Position Angle (East)\r\nM42,05:35:16.8,-05:23:24.0,90.00\r\n",
  );
});

test("a tall strip at 30° holds a target 30° east of north, not one 30° west of north", () => {
  // 0.1° wide, 2° tall: its length is the direction its top points to.
  const strip = { width: 0.1, height: 2, shape: "rectangle" };
  const at = (positionAngle) => ({
    id: `pa${positionAngle}`,
    designation: `PA ${positionAngle}`,
    title: `PA ${positionAngle}`,
    coordinate: {
      ra:
        m42.ra +
        (0.8 * Math.sin(positionAngle * degree)) / Math.cos(m42.dec * degree),
      dec: m42.dec + 0.8 * Math.cos(positionAngle * degree),
    },
  });
  const under = (angleDegrees) =>
    framingTargetsUnderFrame({
      center: m42,
      field: strip,
      angleDegrees,
      candidates: [at(30), at(-30)],
    }).map((target) => target.id);
  assert.deepEqual(under(30), ["pa30"]);
  assert.deepEqual(under(330), ["pa-30"]);
  assert.deepEqual(under(0), []);
});

test("the preview's picture turns clockwise by the position angle", () => {
  const style = framingPreviewPictureStyle({
    aspect: 1.5,
    angleDegrees: 30,
    widthRatio: 1.2,
    heightRatio: 1.8,
  });
  assert.equal(style.transform, "translate(-50%, -50%) rotate(30deg)");
});
