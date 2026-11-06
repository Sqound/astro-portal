import assert from "node:assert/strict";
import { createContext, runInContext } from "node:vm";
import test from "node:test";

import {
  applyNightMode,
  deviceStorage,
  nightModeAttribute,
  nightModeBootScript,
  nightModeColorMatrixForIntensity,
  nightModeDefaultRelativeLuminance,
  nightModeFilterValues,
  nightModeIntensityPercent,
  nightModeIntensityPreferenceKey,
  nightModeMatrixId,
  nightModeMaxRelativeLuminance,
  nightModeMinRelativeLuminance,
  nightModePreferenceKey,
  normalizeNightModeIntensity,
  readNightMode,
  writeNightModeEnabled,
  writeNightModeIntensity,
} from "portal/night-mode.js";
import { messages } from "portal/i18n.js";

// The red night mode of the web: these tests pin its shape, the device
// storage and the first-paint script.

const memoryStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    values,
  };
};
const refusingStorage = {
  getItem() {
    throw new Error("SecurityError");
  },
  setItem() {
    throw new Error("QuotaExceededError");
  },
};

// A white input (1, 1, 1) through the matrix, in the colour space the matrix
// works in (sRGB), then the relative luminance of what comes out.
const whiteOutputRed = (matrix) => matrix[0] + matrix[1] + matrix[2];
const srgbToLinear = (value) =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

test("the bounds and the default are the phone's", () => {
  assert.equal(nightModeMinRelativeLuminance, 0.015);
  assert.equal(nightModeMaxRelativeLuminance, 0.12);
  assert.equal(nightModeDefaultRelativeLuminance, 0.0455);
  assert.equal(nightModePreferenceKey, "nightSession.nightMode");
  assert.equal(
    nightModeIntensityPreferenceKey,
    "nightSession.nightModeIntensity",
  );
});

test("the matrix at the minimum, the default and the maximum maps a white to that luminance", () => {
  for (const luminance of [
    nightModeMinRelativeLuminance,
    nightModeDefaultRelativeLuminance,
    nightModeMaxRelativeLuminance,
  ]) {
    const matrix = nightModeColorMatrixForIntensity(luminance);
    assert.equal(matrix.length, 20);
    const red = whiteOutputRed(matrix);
    assert.ok(red > 0 && red <= 1);
    // Only red is lit: the relative luminance is 0.2126 × linear(red).
    assert.ok(
      Math.abs(0.2126 * srgbToLinear(red) - luminance) < 1e-9,
      `a white at ${luminance} comes out at ${0.2126 * srgbToLinear(red)}`,
    );
  }
  // The default is a half-red.
  assert.ok(
    Math.abs(
      whiteOutputRed(
        nightModeColorMatrixForIntensity(nightModeDefaultRelativeLuminance),
      ) - 0.5,
    ) < 1e-3,
  );
});

test("the intensity is clamped to the slider's bounds", () => {
  const minimum = nightModeColorMatrixForIntensity(
    nightModeMinRelativeLuminance,
  );
  const maximum = nightModeColorMatrixForIntensity(
    nightModeMaxRelativeLuminance,
  );
  for (const below of [0.014, 0, -3])
    assert.deepEqual(nightModeColorMatrixForIntensity(below), minimum);
  for (const above of [0.121, 1, 40])
    assert.deepEqual(nightModeColorMatrixForIntensity(above), maximum);
});

test("the matrix has zero green and blue rows and leaves alpha alone, at every intensity", () => {
  for (let step = 0; step <= 20; step += 1) {
    const luminance =
      nightModeMinRelativeLuminance +
      ((nightModeMaxRelativeLuminance - nightModeMinRelativeLuminance) * step) /
        20;
    const matrix = nightModeColorMatrixForIntensity(luminance);
    assert.deepEqual(matrix.slice(5, 10), [0, 0, 0, 0, 0], "green row");
    assert.deepEqual(matrix.slice(10, 15), [0, 0, 0, 0, 0], "blue row");
    assert.deepEqual(matrix.slice(15, 20), [0, 0, 0, 1, 0], "alpha row");
    assert.deepEqual(matrix.slice(3, 5), [0, 0], "no offset on the red row");
    // The red row carries the Rec. 709 shares of the input channels.
    const scale = matrix[0] / 0.2126;
    assert.ok(Math.abs(matrix[1] - 0.7152 * scale) < 1e-12);
    assert.ok(Math.abs(matrix[2] - 0.0722 * scale) < 1e-12);
  }
});

test("a brighter intensity never gives a dimmer red", () => {
  let previous = 0;
  for (let step = 0; step <= 40; step += 1) {
    const red = whiteOutputRed(
      nightModeColorMatrixForIntensity(0.015 + (0.105 * step) / 40),
    );
    assert.ok(red > previous);
    previous = red;
  }
});

test("the filter's values are the 20 numbers, space separated", () => {
  const values = nightModeFilterValues(nightModeDefaultRelativeLuminance);
  assert.equal(values.split(" ").length, 20);
  assert.deepEqual(
    values.split(" ").map(Number),
    nightModeColorMatrixForIntensity(nightModeDefaultRelativeLuminance),
  );
});

test("the slider announces round(value × 100) percent, in the three languages", () => {
  assert.equal(nightModeIntensityPercent(0.015), 2);
  assert.equal(nightModeIntensityPercent(0.0455), 5);
  assert.equal(nightModeIntensityPercent(0.12), 12);
  assert.equal(nightModeIntensityPercent(0.0675), 7);
  assert.equal(
    messages.fr.nightModeIntensityValue.replace("{percent}", "5"),
    "5 pour cent",
  );
  assert.equal(
    messages.en.nightModeIntensityValue.replace("{percent}", "5"),
    "5 percent",
  );
  assert.equal(
    messages.ja.nightModeIntensityValue.replace("{percent}", "5"),
    "5パーセント",
  );
});

test("the device storage: off and default when nothing was written", () => {
  assert.deepEqual(readNightMode(memoryStorage()), {
    enabled: false,
    intensity: 0.0455,
  });
});

test("what is written is read back, under the phone's key names", () => {
  const storage = memoryStorage();
  assert.equal(writeNightModeEnabled(true, storage), true);
  assert.equal(writeNightModeIntensity(0.08, storage), true);
  assert.equal(storage.values.get("nightSession.nightMode"), "true");
  assert.equal(storage.values.get("nightSession.nightModeIntensity"), "0.08");
  assert.deepEqual(readNightMode(storage), { enabled: true, intensity: 0.08 });
  // The intensity is clamped on write, like the phone's slider.
  writeNightModeIntensity(5, storage);
  assert.equal(readNightMode(storage).intensity, 0.12);
});

test("a stored value that is invalid falls back to the default", () => {
  for (const damaged of [
    "not json",
    '"0.08"',
    "null",
    "0",
    "0.5",
    "-1",
    "[]",
    "{}",
  ]) {
    const storage = memoryStorage({
      [nightModePreferenceKey]: damaged,
      [nightModeIntensityPreferenceKey]: damaged,
    });
    assert.deepEqual(
      readNightMode(storage),
      { enabled: false, intensity: 0.0455 },
      `a stored ${damaged}`,
    );
  }
  assert.equal(normalizeNightModeIntensity(undefined), 0.0455);
  assert.equal(normalizeNightModeIntensity(Number.NaN), 0.0455);
  assert.equal(normalizeNightModeIntensity(0.1), 0.1);
  // Only an explicit true switches the mode on.
  for (const value of ['"true"', "1", "yes"])
    assert.equal(
      readNightMode(memoryStorage({ [nightModePreferenceKey]: value })).enabled,
      false,
    );
});

test("a storage that throws leaves day mode, and writes report the refusal", () => {
  assert.deepEqual(readNightMode(refusingStorage), {
    enabled: false,
    intensity: 0.0455,
  });
  assert.equal(writeNightModeEnabled(true, refusingStorage), false);
  assert.equal(writeNightModeIntensity(0.08, refusingStorage), false);
  assert.equal(writeNightModeEnabled(true, null), false);
  assert.deepEqual(readNightMode(null), { enabled: false, intensity: 0.0455 });
});

test("a localStorage that cannot even be reached is no storage", () => {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("SecurityError");
    },
  });
  try {
    assert.equal(deviceStorage(), null);
    assert.equal(readNightMode().enabled, false);
  } finally {
    if (descriptor)
      Object.defineProperty(globalThis, "localStorage", descriptor);
    else delete globalThis.localStorage;
  }
});

test("applying the mode sets the attribute and the filter's matrix, and clears them", () => {
  const attributes = new Map();
  const matrix = new Map();
  const documentRoot = {
    documentElement: {
      setAttribute: (name, value) => attributes.set(name, value),
      removeAttribute: (name) => attributes.delete(name),
    },
    getElementById: (id) =>
      id === nightModeMatrixId
        ? { setAttribute: (name, value) => matrix.set(name, value) }
        : null,
  };
  applyNightMode({ enabled: true, intensity: 0.1 }, documentRoot);
  assert.equal(attributes.get(nightModeAttribute), "on");
  assert.equal(matrix.get("values"), nightModeFilterValues(0.1));
  applyNightMode({ enabled: false, intensity: 0.1 }, documentRoot);
  assert.equal(attributes.has(nightModeAttribute), false);
  // A page with no document (a server) is left alone.
  assert.doesNotThrow(() =>
    applyNightMode({ enabled: true, intensity: 0.1 }, null),
  );
});

// The first-paint script of the layout runs as plain text in the page. It is
// run here in a sandbox with a fake document and storage.
function runBootScript(storage) {
  const attributes = new Map();
  const matrix = new Map();
  const sandbox = {
    window: { localStorage: storage },
    document: {
      documentElement: {
        setAttribute: (name, value) => attributes.set(name, value),
      },
      getElementById: (id) =>
        id === nightModeMatrixId
          ? { setAttribute: (name, value) => matrix.set(name, value) }
          : null,
    },
    Math,
    JSON,
    Number,
  };
  createContext(sandbox);
  runInContext(nightModeBootScript, sandbox);
  return { attributes, matrix };
}

test("the first-paint script does nothing in day mode, with a refusing storage or a damaged value", () => {
  for (const storage of [
    memoryStorage(),
    refusingStorage,
    memoryStorage({ [nightModePreferenceKey]: "oops" }),
    memoryStorage({ [nightModePreferenceKey]: "false" }),
  ]) {
    const { attributes, matrix } = runBootScript(storage);
    assert.equal(attributes.size, 0);
    assert.equal(matrix.size, 0);
  }
});

test("the first-paint script's matrix is the rule's, over the whole slider", () => {
  for (let step = 0; step <= 30; step += 1) {
    const luminance = 0.015 + (0.105 * step) / 30;
    const { attributes, matrix } = runBootScript(
      memoryStorage({
        [nightModePreferenceKey]: "true",
        [nightModeIntensityPreferenceKey]: String(luminance),
      }),
    );
    assert.equal(attributes.get(nightModeAttribute), "on");
    const booted = matrix.get("values").split(" ").map(Number);
    const rule = nightModeColorMatrixForIntensity(luminance);
    assert.equal(booted.length, 20);
    booted.forEach((entry, index) =>
      assert.ok(
        Math.abs(entry - rule[index]) < 1e-12,
        `entry ${index} at ${luminance}`,
      ),
    );
  }
  // An intensity that is absent or out of bounds boots at the default.
  for (const stored of [undefined, "9", "garbage"]) {
    const { matrix } = runBootScript(
      memoryStorage({
        [nightModePreferenceKey]: "true",
        ...(stored ? { [nightModeIntensityPreferenceKey]: stored } : {}),
      }),
    );
    assert.equal(
      matrix.get("values"),
      nightModeFilterValues(nightModeDefaultRelativeLuminance),
    );
  }
});

test("the texts exist in en, fr and ja, with the phone's words", () => {
  const keys = [
    "nightModeToggle",
    "nightModeDisplayLabel",
    "nightModeDayOption",
    "nightModeNightOption",
    "nightModeBrightnessLabel",
    "nightModeIntensityLabel",
    "nightModeIntensityValue",
  ];
  for (const locale of ["en", "fr", "ja"])
    for (const key of keys)
      assert.ok(messages[locale][key], `${locale}.${key}`);
  assert.equal(messages.fr.nightModeToggle, "Mode nuit");
  assert.equal(messages.en.nightModeToggle, "Night mode");
  assert.equal(messages.ja.nightModeToggle, "ナイトモード");
  assert.equal(messages.fr.nightModeDisplayLabel, "Affichage");
  assert.equal(messages.fr.nightModeDayOption, "Jour");
  assert.equal(messages.fr.nightModeNightOption, "Nuit");
  assert.equal(messages.fr.nightModeBrightnessLabel, "Luminosité du mode nuit");
  assert.equal(messages.fr.nightModeIntensityLabel, "Intensité du mode nuit");
  assert.equal(messages.ja.nightModeDayOption, "昼");
  assert.equal(messages.ja.nightModeNightOption, "夜");
  assert.equal(messages.en.nightModeDisplayLabel, "Display");
});
