import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { message } from "portal/i18n.js";
import { normalizePlanHorizonView } from "portal/planner/state.js";
import {
  requestPlannerSkyDirection,
  resetPlannerSkyDirectionCache,
} from "portal/planner/sky-quality.js";
import {
  horizonLightBrightSqm,
  horizonLightColor,
  horizonLightDarkSqm,
  horizonLightLayerPixels,
  horizonLightLayerState,
  horizonLightSqmAt,
  horizonLightStrongestDirection,
} from "../src/horizon-light-layer.js";

// The light-pollution layer of the horizon map on the web: its colour scale,
// the reading of the grid, the image it draws, its states, the request and
// its cache, and the wiring of the page (read in its source, as the other
// page tests of this package do).

const source = readFileSync(
  new URL("../src/components/PlannerPage.js", import.meta.url),
  "utf8",
);
const layerSource = readFileSync(
  new URL("../src/components/HorizonLightLayer.js", import.meta.url),
  "utf8",
);

// A grid like the service's: every 90° of azimuth, four altitudes; a city
// towards the south-west brightens the low sky there.
const grid = {
  model: "line-of-sight-v1",
  estimate: true,
  azimuthStepDegrees: 45,
  altitudes: [0, 10, 45, 90],
  sqm: [
    [21.8, 21.8, 21.7, 21.2, 20.4, 18.2, 20.9, 21.7],
    [21.8, 21.8, 21.7, 21.4, 20.9, 19.6, 21.2, 21.8],
    [21.9, 21.9, 21.9, 21.8, 21.7, 21.3, 21.7, 21.9],
    [21.9, 21.9, 21.9, 21.9, 21.9, 21.9, 21.9, 21.9],
  ],
  zenithSqm: 21.9,
};

test("the scale is absolute: transparent from 21.6 and darker, strongest at 18.0 and brighter", () => {
  assert.equal(horizonLightDarkSqm, 21.6);
  assert.equal(horizonLightBrightSqm, 18);
  for (const dark of [22, 21.9, 21.6])
    assert.equal(horizonLightColor(dark), null);
  const strongest = horizonLightColor(18);
  assert.deepEqual(strongest, { red: 196, green: 74, blue: 52, alpha: 0.46 });
  assert.deepEqual(horizonLightColor(16.5), strongest);
  // Just brighter than the threshold: a faint gold, barely there.
  const faint = horizonLightColor(21.5);
  assert.equal(faint.red, 224);
  assert.ok(faint.alpha > 0 && faint.alpha < 0.05);
  // Brighter is always more opaque and redder.
  let previous = null;
  for (let sqm = 21.5; sqm >= 18; sqm -= 0.25) {
    const color = horizonLightColor(sqm);
    if (previous) {
      assert.ok(color.alpha >= previous.alpha, `${sqm}`);
      assert.ok(color.green <= previous.green, `${sqm}`);
    }
    previous = color;
  }
  for (const unusable of [null, undefined, "20", Number.NaN])
    assert.equal(horizonLightColor(unusable), null);
});

test("the ramp never takes the mask's violet nor the markers' colours", () => {
  // The mask is violet (#c58bef line, rgba(72,32,87) fill): blue above red.
  // The layer is warm everywhere: red above green above blue, translucent.
  for (let sqm = 21.55; sqm >= 17; sqm -= 0.05) {
    const color = horizonLightColor(sqm);
    assert.ok(color.red > color.green && color.green > color.blue, `${sqm}`);
    assert.ok(color.alpha <= 0.46, `${sqm}`);
  }
});

test("the grid is read bilinearly, through north and between altitudes", () => {
  assert.equal(horizonLightSqmAt(grid, 225, 0), 18.2);
  assert.equal(horizonLightSqmAt(grid, 202.5, 0), 19.3);
  assert.equal(horizonLightSqmAt(grid, 225, 5), 18.9);
  // Between 315° and 0°, across north.
  assert.equal(horizonLightSqmAt(grid, 337.5, 0), 21.75);
  assert.equal(horizonLightSqmAt(grid, -22.5, 0), 21.75);
  // Clamped to the grid's lowest and highest altitudes.
  assert.equal(horizonLightSqmAt(grid, 225, -5), 18.2);
  assert.equal(horizonLightSqmAt(grid, 0, 95), 21.9);
  assert.equal(horizonLightSqmAt(null, 0, 0), null);
  assert.equal(horizonLightSqmAt({ ...grid, sqm: [[1]] }, 0, 0), null);
});

test("the image is the plot's own user space, transparent outside the dome and where the sky is dark", () => {
  const circular = horizonLightLayerPixels(grid, {
    projection: "circular",
    width: 200,
    height: 200,
  });
  const alphaAt = (image, x, y) => image.pixels[(y * image.width + x) * 4 + 3];
  // Outside the dome (a corner) and at the zenith: nothing.
  assert.equal(alphaAt(circular, 2, 2), 0);
  assert.equal(alphaAt(circular, 100, 100), 0);
  // Low in the south-west (lower left of the dome, rotation 0): tinted.
  const southWest = {
    x: Math.round(100 - 80 * Math.SQRT1_2),
    y: Math.round(100 + 80 * Math.SQRT1_2),
  };
  assert.ok(alphaAt(circular, southWest.x, southWest.y) > 60);
  // Low in the north-east: dark.
  assert.equal(
    alphaAt(
      circular,
      Math.round(100 + 80 * Math.SQRT1_2),
      Math.round(100 - 80 * Math.SQRT1_2),
    ),
    0,
  );
  // The orientation turns the layer with the dome.
  const turned = horizonLightLayerPixels(grid, {
    projection: "circular",
    rotation: 180,
    width: 200,
    height: 200,
  });
  assert.equal(alphaAt(turned, southWest.x, southWest.y), 0);
  // Linear: azimuth across, altitude up; the south-west foot is tinted.
  const linear = horizonLightLayerPixels(grid, { projection: "linear" });
  assert.equal(linear.width, 360);
  assert.equal(linear.height, 90);
  assert.ok(alphaAt(linear, 225, 89) > 60);
  assert.equal(alphaAt(linear, 45, 89), 0);
  assert.equal(alphaAt(linear, 225, 0), 0);
  // No grid, no tint.
  assert.ok(
    horizonLightLayerPixels(null, { projection: "linear" }).pixels.every(
      (value) => value === 0,
    ),
  );
});

test("the layer is off by default, the mask on, and only the switches are stored", () => {
  const horizon = normalizePlanHorizonView(undefined);
  assert.deepEqual(horizon.layers, { mask: true, lightPollution: false });
  assert.equal(JSON.stringify(horizon).includes("sqm"), false);
  assert.deepEqual(
    horizonLightLayerState({ request: { status: "ready", grid } }),
    {
      enabled: false,
      available: true,
      drawn: false,
      loading: false,
      reason: null,
    },
  );
  assert.equal(
    horizonLightLayerState({ enabled: true, request: { status: "ready" } })
      .drawn,
    true,
  );
  assert.equal(
    horizonLightLayerState({ enabled: true, request: { status: "loading" } })
      .loading,
    true,
  );
});

test("without sky data the switch is disabled and says why", () => {
  for (const status of ["unavailable", "no-place"]) {
    const state = horizonLightLayerState({
      enabled: true,
      request: { status },
    });
    assert.equal(state.available, false);
    assert.equal(state.drawn, false);
    assert.equal(state.reason, status);
  }
  const panel = layerSource.slice(
    layerSource.indexOf("export function HorizonLayersPanel("),
  );
  assert.match(panel, /disabled=\{!light\.available\}/);
  assert.match(panel, /message\(locale, "horizonLayerUnavailable"\)/);
});

test("the layer is drawn first in the plot, under the mask, the path and the targets", () => {
  const canvas = source.slice(
    source.indexOf("function HorizonProjectionCanvas("),
    source.indexOf("function HorizonProjectionControls("),
  );
  const layer = canvas.indexOf("<HorizonLightLayerImage");
  assert.ok(layer > 0);
  for (const later of [
    'className="planner-horizon-gridline"',
    'className="planner-horizon-masked-area"',
    "<HorizonPathStrokes",
    "className={`planner-horizon-target-group",
  ])
    assert.ok(canvas.indexOf(later) > layer, later);
  // The mask layer hides the mask's drawing, not the targets it blocks.
  assert.match(
    canvas,
    /const hasMask = Boolean\(mask\?\.enabled\) && showMask;/,
  );
  assert.match(canvas, /horizonTargetState\(\{\s*point,\s*mask,/);
  // The panel is wired to the plan view's layers.
  const page = source.slice(
    source.indexOf("function PlannerHorizonProjection("),
    source.indexOf("function PrintableHorizonProjection("),
  );
  assert.match(page, /normalizePlanHorizonLayers\(values\.layers\)/);
  assert.match(page, /lightGrid=\{light\.drawn \? lightRequest\.grid : null\}/);
  assert.match(page, /showMask=\{layers\.mask\}/);
});

test("the plot names where the glow is strongest", () => {
  assert.equal(horizonLightStrongestDirection(grid), "SW");
  assert.equal(
    horizonLightStrongestDirection({
      ...grid,
      sqm: grid.sqm.map((row) => row.map(() => 21.9)),
    }),
    null,
  );
  assert.equal(
    message("fr", "horizonLayerStrongest").replace(
      "{toward}",
      message("fr", "horizonLayerTowardSW"),
    ),
    "Estimation de la pollution lumineuse par direction, plus forte vers le sud-ouest.",
  );
});

test("the French texts are the specified wording, to the character", () => {
  assert.equal(message("fr", "horizonLayers"), "Calques");
  assert.equal(message("fr", "horizonLayersClose"), "Fermer les calques");
  assert.equal(message("fr", "horizonLayerMask"), "Masque d’horizon");
  assert.equal(
    message("fr", "horizonLayerLightPollution"),
    "Pollution lumineuse par direction",
  );
  assert.equal(message("fr", "horizonLayerEstimate"), "Estimation");
  assert.equal(message("fr", "horizonLayerDarker"), "Ciel plus sombre");
  assert.equal(message("fr", "horizonLayerBrighter"), "Ciel plus clair");
  for (const locale of ["en", "ja"])
    for (const key of [
      "horizonLayers",
      "horizonLayerUnavailable",
      "horizonLayerTowardNW",
    ])
      assert.notEqual(
        message(locale, key),
        message("fr", key),
        `${locale} ${key}`,
      );
});

test("the grid is asked for once per place rounded to 0.01°, and an error is not kept", async () => {
  resetPlannerSkyDirectionCache();
  const calls = [];
  const answer = (status, body) => async (url) => {
    calls.push(url);
    return { ok: status === 200, status, json: async () => body };
  };
  const first = await requestPlannerSkyDirection(
    { latitude: 45.0012, longitude: -30.0049 },
    { fetchImpl: answer(200, { ...grid, rasterChecksum: "sha256:a" }) },
  );
  const again = await requestPlannerSkyDirection(
    { latitude: 44.9981, longitude: -29.9951 },
    { fetchImpl: answer(200, { ...grid, rasterChecksum: "sha256:b" }) },
  );
  assert.equal(again, first);
  assert.deepEqual(calls, [
    "/api/v1/sky-quality/direction?latitude=45.00&longitude=-30.00",
  ]);
  await assert.rejects(
    requestPlannerSkyDirection(
      { latitude: 10, longitude: 10 },
      {
        fetchImpl: answer(503, { error: { code: "sky_quality_unavailable" } }),
      },
    ),
    { code: "sky_quality_unavailable" },
  );
  await requestPlannerSkyDirection(
    { latitude: 10, longitude: 10 },
    { fetchImpl: answer(200, { ...grid, rasterChecksum: "sha256:a" }) },
  );
  assert.equal(calls.length, 3);
  // A grid of a newer raster drops what was computed from the older one.
  await requestPlannerSkyDirection(
    { latitude: 20, longitude: 20 },
    { fetchImpl: answer(200, { ...grid, rasterChecksum: "sha256:c" }) },
  );
  await requestPlannerSkyDirection(
    { latitude: 45, longitude: -30 },
    { fetchImpl: answer(200, { ...grid, rasterChecksum: "sha256:c" }) },
  );
  assert.equal(calls.length, 5);
  resetPlannerSkyDirectionCache();
});
