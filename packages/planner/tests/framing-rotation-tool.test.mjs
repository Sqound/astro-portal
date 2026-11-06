import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import {
  framingAngleAfterWheel,
  framingAngleFromInput,
  framingAngleOf,
  framingCaptionWithAngle,
  framingTurnStyle,
  turnedFrameHalfHeight,
} from "../src/framing-rotation.js";

// On the web side, the "Rotation" tool of the framing editor --
// a slider from 0 to 359°, a field, "Remettre à 0°" -- and Alt + the wheel
// over the map turn the frame alone (the map never turns on the web); the
// frame turns counter-clockwise by its position angle and its caption ends
// with the angle, even at 0°.

await registerJsx();
const { FramingRotationTool } =
  await import("planner/components/FramingRotationTool.js");
const { PlannerNightSkyMap } =
  await import("planner/components/PlannerNightSkyMap.js");

test("Alt + the wheel turns the frame by 1°, by 15° with Shift; without Alt it zooms", () => {
  assert.equal(framingAngleAfterWheel(30, { deltaY: -100 }), null);
  assert.equal(framingAngleAfterWheel(30, { deltaY: -100, altKey: true }), 31);
  assert.equal(framingAngleAfterWheel(30, { deltaY: 100, altKey: true }), 29);
  assert.equal(
    framingAngleAfterWheel(0, { deltaY: 100, altKey: true, shiftKey: true }),
    345,
  );
  assert.equal(
    framingAngleAfterWheel(350, {
      deltaY: -100,
      altKey: true,
      shiftKey: true,
    }),
    5,
  );
  assert.equal(framingAngleAfterWheel(30, { deltaY: 0, altKey: true }), null);
});

test("the field reads whole degrees in [0, 360), and nothing while it is empty", () => {
  assert.equal(framingAngleFromInput("30"), 30);
  assert.equal(framingAngleFromInput("30°"), 30);
  assert.equal(framingAngleFromInput("29,6"), 30);
  assert.equal(framingAngleFromInput("360"), 0);
  assert.equal(framingAngleFromInput("-30"), 330);
  assert.equal(framingAngleFromInput(""), null);
  assert.equal(framingAngleFromInput("trente"), null);
});

test("a saved framing reopens at its angle, a new one at 0°", () => {
  assert.equal(framingAngleOf(null), 0);
  assert.equal(framingAngleOf({ framing: {} }), 0);
  assert.equal(framingAngleOf({ framing: { angleDegrees: 30 } }), 30);
});

test("the caption ends with the angle, the box of a turned frame grows, a straight frame keeps its style", () => {
  assert.equal(
    framingCaptionWithAngle("1,39° × 1,04°", 30),
    "1,39° × 1,04° · 30°",
  );
  assert.equal(
    framingCaptionWithAngle("1,39° × 1,04°", 0),
    "1,39° × 1,04° · 0°",
  );
  assert.equal(
    framingCaptionWithAngle("2,57° × 1,92° · 2 × 2 tuiles", 0),
    "2,57° × 1,92° · 2 × 2 tuiles · 0°",
  );
  assert.equal(framingCaptionWithAngle("", 30), "");
  assert.equal(turnedFrameHalfHeight(200, 100, 0), 50);
  assert.ok(Math.abs(turnedFrameHalfHeight(200, 100, 90) - 100) < 1e-9);
  assert.ok(
    Math.abs(
      turnedFrameHalfHeight(200, 100, 30) -
        (200 * Math.sin(Math.PI / 6) + 100 * Math.cos(Math.PI / 6)) / 2,
    ) < 1e-9,
  );
  assert.equal(framingTurnStyle(0), undefined);
  assert.equal(framingTurnStyle(360), undefined);
  // CSS turns clockwise: the counter-clockwise position angle is negative.
  assert.deepEqual(framingTurnStyle(30), {
    "--planner-frame-turn": "-30deg",
    "--planner-frame-turn-back": "30deg",
  });
});

const tool = (props) =>
  renderToStaticMarkup(
    createElement(FramingRotationTool, {
      angleDegrees: 30,
      angleText: "30",
      locale: "fr",
      onAngleText: () => {},
      onTurn: () => {},
      ...props,
    }),
  );

test("the « Rotation » tool: its words, its slider 0–359°, its field and its link", () => {
  const markup = tool();
  assert.match(markup, /<section aria-label="Rotation"/);
  assert.match(markup, /<h3>Rotation<\/h3>/);
  assert.match(markup, /class="btn-link"[^>]*>Remettre à 0°<\/button>/);
  assert.match(
    markup,
    /Alt \+ molette sur la carte : 1° · Alt \+ Maj \+ molette : 15°/,
  );
  assert.match(markup, /type="range"/);
  assert.match(markup, /min="0"/);
  assert.match(markup, /max="359"/);
  assert.match(markup, /value="30"/);
  assert.match(markup, /aria-valuetext="Angle de position 30°"/);
  assert.match(markup, /type="number"/);
  assert.doesNotMatch(markup, /btn-primary|btn-secondary|btn-tertiary/);
});

test("the tool is disabled without a frame, and « Remettre à 0° » at 0°", () => {
  assert.equal(
    (tool({ disabled: true }).match(/disabled=""/g) || []).length,
    3,
  );
  assert.match(
    tool({ angleDegrees: 0, angleText: "0" }),
    /<button class="btn-link"[^>]*disabled=""[^>]*>Remettre à 0°/,
  );
  assert.match(tool({ locale: "en" }), />Reset to 0°</);
  assert.match(tool({ locale: "ja" }), />0°に戻す</);
});

const map = (props) =>
  renderToStaticMarkup(
    createElement(PlannerNightSkyMap, {
      cards: [],
      locale: "fr",
      location: { latitude: 45, longitude: -30 },
      night: null,
      field: { width: 1.39, height: 1.04, shape: "rectangle" },
      equipmentLabel: "Lunette 102/714 · Caméra 4/3",
      showSectionHeading: false,
      ...props,
    }),
  );

test("the map turns the frame by the angle and ends its caption with it; elsewhere nothing changes", () => {
  const turned = map({ frameAngleDegrees: 30, frameAngleShown: true });
  assert.match(turned, /data-turned=""/);
  assert.match(
    turned,
    /style="--planner-frame-turn:-30deg;--planner-frame-turn-back:30deg"/,
  );
  assert.match(turned, /1,4° × 1,0° · 30°|1,39° × 1,04° · 30°/);
  assert.match(turned, /aria-label="[^"]*Angle de position 30°"/);

  const straight = map({ frameAngleDegrees: 0, frameAngleShown: true });
  assert.doesNotMatch(straight, /data-turned/);
  assert.match(straight, / · 0°<\/span>/);

  // The planner's own map: no angle, no turn, the caption as it always was.
  const planner = map({});
  assert.doesNotMatch(planner, /data-turned|Angle de position| · 0°/);
});
