import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { messages } from "portal/i18n.js";
import { magnificationAdviceLine } from "../src/magnification-advice-copy.js";

// The sentence under the equipment's magnification, when it goes past what the
// telescope can show: a Dobsonian 203/1200 at 900x, an 80 mm refractor at 10x.

const keys = [
  "plannerMagnificationAdviceNearLimit",
  "plannerMagnificationAdviceBeyond",
  "plannerMagnificationAdviceFarBeyond",
  "plannerMagnificationAdviceLowPower",
];

test("nothing to say within the limits", () => {
  assert.equal(magnificationAdviceLine("fr", 203, 300), null);
  assert.equal(magnificationAdviceLine("fr", null, 300), null);
});

test("the sentence names the useful magnification and the exit pupil", () => {
  assert.equal(
    magnificationAdviceLine("fr", 203, 900),
    "Bien au-delà du grossissement utile de ce télescope (≈ 400×, pupille de sortie 0,2 mm)\u00a0: image sombre et floue, sans plus aucun détail.",
  );
  assert.equal(
    magnificationAdviceLine("en", 203, 500),
    "Beyond this telescope’s useful magnification (≈ 400×, exit pupil 0.4 mm): dark, blurry image.",
  );
  assert.equal(
    magnificationAdviceLine("fr", 80, 10),
    "Pupille de sortie de 8,0 mm\u00a0: une partie de la lumière est perdue.",
  );
  assert.match(
    magnificationAdviceLine("fr", 203, 350),
    /^Proche du grossissement utile/,
  );
});

test("the four sentences exist in the ten catalogues, with their placeholders", () => {
  for (const [locale, catalogue] of Object.entries(messages)) {
    for (const key of keys) {
      assert.ok(catalogue[key], `${locale} ${key}`);
      if (key.endsWith("LowPower")) assert.match(catalogue[key], /\{pupil\}/);
      else
        assert.match(catalogue[key], /\{max\}.*\{pupil\}|\{pupil\}.*\{max\}/s);
    }
  }
});

test("the equipment stage of the page shows it under the readout", () => {
  const page = readFileSync(
    new URL("../src/components/PlannerPage.js", import.meta.url),
    "utf8",
  );
  const readout = page.indexOf('className="planner-equipment-readout">');
  const advice = page.indexOf('className="planner-equipment-advice"');
  assert.ok(readout > 0 && advice > readout);
});
