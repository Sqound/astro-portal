import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  acquisitionEquipment,
  acquisitionRuleTable,
  acquisitionRuleVersion,
  acquisitionTargetKind,
  effectiveAcquisition,
  effectiveAcquisitionLines,
} from "planner/acquisition.js";

// "Prise de vue par cible": the proposal rule. The expectations below are
// written by hand from the starting values of the rule's table; the conformance
// fixtures `effective-acquisition`, `acquisition-equipment` and
// `acquisition-rule-table` replay the same rule.

const typeKeys = {
  emission: "Nébuleuse en émission",
  planetary: "Nébuleuse planétaire",
  reflection: "Nébuleuse en réflexion",
  galaxy: "Galaxie",
  cluster: "Amas globulaire",
  comet: "Comète",
  planet: "Planète",
  moon: "Lune",
};
const colour = {
  deviceKind: "dedicated",
  sensorKind: "colour",
  pixelSizeUm: 2.9,
  focalLengthMm: 250,
  apertureMm: 50,
  unityGain: null,
  hcgGain: null,
  maxExposureSeconds: null,
  mountKind: null,
};
const mono = { ...colour, sensorKind: "mono" };
const plan = (extra = {}) => ({ equipment: { mode: "imaging" }, ...extra });
const item = (extra = {}) => ({
  id: "i1",
  filter: "",
  startMinute: 0,
  endMinute: 120,
  ...extra,
});
const context = (kind, extra = {}) => ({
  target: { skyTarget: { typeKey: typeKeys[kind] ?? kind } },
  equipment: colour,
  filters: [],
  sky: { sqm: 20.8 },
  moon: { illumination: 10 },
  ...extra,
});
const first = (effective) => effective.lines[0];
const exposure = (p, i, c) =>
  first(effectiveAcquisition(p, i, c)).exposureSeconds.value;

test("the rule has a version string, and its table is one object", () => {
  assert.equal(typeof acquisitionRuleVersion, "string");
  assert.ok(
    acquisitionRuleVersion.length >= 1 && acquisitionRuleVersion.length <= 64,
  );
  assert.equal(acquisitionRuleTable().version, acquisitionRuleVersion);
  assert.equal(
    effectiveAcquisition(plan(), item(), context("galaxy")).ruleVersion,
    acquisitionRuleVersion,
  );
});

test("the base exposure of every row of the table, in each of its four columns", () => {
  // kind: [colour broadband, colour dual band, mono L/RGB, mono narrowband];
  // null is "—": the broadband column of the same camera is read.
  const expected = {
    emission: [120, 300, 120, 300],
    planetary: [120, 300, 60, 300],
    reflection: [180, null, 180, null],
    galaxy: [120, null, 120, 300],
    cluster: [60, null, 60, null],
    comet: [60, null, 60, null],
    planet: [0.01, null, 0.01, null],
    moon: [0.003, null, 0.002, null],
  };
  const columns = [
    [colour, "UV/IR-cut", "broadband", 0],
    [colour, "L-eXtreme", "dual", 1],
    [mono, "L", "l", 2],
    [mono, "Ha 3nm", "ha", 3],
  ];
  for (const [kind, row] of Object.entries(expected))
    for (const [equipment, name, family, column] of columns) {
      const fallback = equipment === mono ? row[2] : row[0];
      const value = row[column] ?? fallback;
      assert.equal(
        exposure(
          plan(),
          item({ filter: name }),
          context(kind, { equipment, filters: [{ name, family }] }),
        ),
        value,
        `${kind} ${family}`,
      );
    }
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(acquisitionRuleTable().kinds).map(([kind, row]) => [
        kind,
        [
          row.colourBroadband,
          row.colourDual,
          row.monoBroadband,
          row.monoNarrow,
        ],
      ]),
    ),
    expected,
  );
});

test("the sky class scales a deep-sky exposure: broadband x1.5 / x1 / x0.5, narrowband x1 / x1 / x0.75", () => {
  const broad = [{ name: "UV/IR", family: "broadband" }];
  const dual = [{ name: "Duo", family: "dual" }];
  const at = (kind, sqm, filters) =>
    exposure(plan(), item(), context(kind, { sky: { sqm }, filters }));
  assert.equal(at("galaxy", 21.6, broad), 180);
  assert.equal(at("galaxy", 21.3, broad), 180);
  assert.equal(at("galaxy", 20.8, broad), 120);
  assert.equal(at("galaxy", 20.3, broad), 120);
  assert.equal(at("galaxy", 20.29, broad), 60);
  assert.equal(at("galaxy", 19.9, broad), 60);
  assert.equal(at("emission", 21.6, dual), 300);
  assert.equal(at("emission", 19.9, dual), 240);
  const reason = first(
    effectiveAcquisition(
      plan(),
      item(),
      context("galaxy", { sky: { sqm: 21.6 }, filters: broad }),
    ),
  ).exposureSeconds.reason;
  assert.equal(reason.skyClass, "dark");
  assert.equal(
    first(
      effectiveAcquisition(
        plan(),
        item(),
        context("galaxy", { sky: {}, filters: broad }),
      ),
    ).exposureSeconds.reason.skyClass,
    null,
  );
  // The sky never changes a video.
  assert.equal(at("planet", 19.9, broad), 0.01);
});

test("the focal ratio multiplies by (N / 5) squared, between 0.5 and 2", () => {
  const at = (focalLengthMm) =>
    exposure(
      plan(),
      item(),
      context("galaxy", { equipment: { ...colour, focalLengthMm } }),
    );
  assert.equal(at(250), 120); // f/5
  assert.equal(at(125), 60); // f/2.5: 0.25 bounded to 0.5
  assert.equal(at(500), 240); // f/10: 4 bounded to 2
  assert.equal(at(300), 180); // f/6: 1.44 -> 172.8 -> 180
  const classes = [200, 250, 350].map(
    (focalLengthMm) =>
      first(
        effectiveAcquisition(
          plan(),
          item(),
          context("galaxy", { equipment: { ...colour, focalLengthMm } }),
        ),
      ).exposureSeconds.reason.focalRatioClass,
  );
  assert.deepEqual(classes, ["fast", "medium", "slow"]);
});

test("the mount caps the exposure (alt-az 30 s, equatorial 60 s, guided 600 s), then the device's own cap, strictly", () => {
  const at = (mountKind, maxExposureSeconds = null, kind = "reflection") =>
    effectiveAcquisition(
      plan(),
      item(),
      context(kind, {
        equipment: { ...colour, mountKind, maxExposureSeconds },
      }),
    );
  assert.equal(first(at("altaz")).exposureSeconds.value, 30);
  assert.equal(first(at("equatorial")).exposureSeconds.value, 60);
  assert.equal(first(at("guided")).exposureSeconds.value, 180);
  assert.equal(first(at(null)).exposureSeconds.value, 180);
  assert.equal(first(at("altaz")).exposureSeconds.reason.capped, "mount");
  assert.equal(first(at("guided", 15)).exposureSeconds.value, 15);
  assert.equal(first(at("guided", 15)).exposureSeconds.reason.capped, "device");
  assert.equal(first(at("guided", 15)).exposureSeconds.reason.deviceCap, 15);
  assert.equal(first(at("equatorial", 20)).exposureSeconds.value, 20);
  assert.equal(first(at("guided", 5)).exposureSeconds.value, 5);
  assert.equal(first(at(null, 400)).exposureSeconds.reason.capped, null);
  // A cap never reads a video.
  assert.equal(first(at("altaz", 15, "planet")).exposureSeconds.value, 0.01);
});

test("a value is rounded to the nearest step of 10, 15, 20, 30, 60, 90, 120, 180, 240, 300, 600 s", () => {
  assert.deepEqual(
    acquisitionRuleTable().steps,
    [10, 15, 20, 30, 60, 90, 120, 180, 240, 300, 600],
  );
  const at = (focalLengthMm) =>
    exposure(
      plan(),
      item(),
      context("galaxy", { equipment: { ...colour, focalLengthMm } }),
    );
  assert.equal(at(275), 120); // 145.2 is nearer 120 than 180
  assert.equal(at(285), 180); // 155.95 is nearer 180 than 120
});

test("the gain is the profile's HCG gain, else its unity gain, a DSLR's ISO, and the device's own for a smart telescope", () => {
  const gain = (equipment, kind = "galaxy") =>
    first(
      effectiveAcquisition(
        plan(),
        item(),
        context(kind, { equipment: { ...colour, ...equipment } }),
      ),
    ).gain;
  assert.deepEqual(gain({ hcgGain: 200, unityGain: 100 }).value, 200);
  assert.equal(gain({ hcgGain: 200, unityGain: 100 }).reason.gainSource, "hcg");
  assert.equal(gain({ unityGain: 100 }).value, 100);
  assert.equal(gain({ unityGain: 100 }).reason.gainSource, "unity");
  assert.equal(gain({ deviceKind: "dslr", hcgGain: 200 }).value, 800);
  assert.deepEqual(gain({ deviceKind: "smart-telescope", hcgGain: 200 }), {
    value: null,
    source: "device",
    reason: { sensorKind: "colour", gainSource: "device" },
  });
  assert.equal(gain({}).source, "device");
  // A planet is shot high, the Moon low: the gain is the device's, with the intent.
  assert.equal(gain({ hcgGain: 200 }, "planet").reason.gainIntent, "high");
  assert.equal(gain({ hcgGain: 200 }, "moon").reason.gainIntent, "low");
});

test("binning 2 is proposed on a mono camera under 0.6 arcsec per pixel, never on colour", () => {
  const binning = (equipment) =>
    first(
      effectiveAcquisition(plan(), item(), context("galaxy", { equipment })),
    ).binning.value;
  const fine = { pixelSizeUm: 2.4, focalLengthMm: 2032, apertureMm: 203.2 }; // 0.24"/px
  assert.equal(binning({ ...mono, ...fine }), 2);
  assert.equal(binning({ ...colour, ...fine }), 1);
  assert.equal(
    binning({ ...mono, pixelSizeUm: 3.76, focalLengthMm: 400, apertureMm: 80 }),
    1,
  );
  assert.equal(binning({ ...mono, pixelSizeUm: null }), 1);
});

test("photo mode only: in visual mode nothing is proposed and the function returns null", () => {
  assert.equal(
    effectiveAcquisition(
      plan({ equipment: { mode: "visual" } }),
      item(),
      context("galaxy"),
    ),
    null,
  );
  assert.equal(
    effectiveAcquisition(plan(), item(), context("galaxy", { mode: "visual" })),
    null,
  );
  assert.equal(
    effectiveAcquisition(
      plan({
        equipment: { mode: "visual" },
        acquisitionDefaults: { exposureSeconds: 90 },
      }),
      item({ acquisition: { lines: [{ exposureSeconds: 90 }] } }),
      context("galaxy"),
    ),
    null,
  );
  assert.notEqual(effectiveAcquisition({}, item(), context("galaxy")), null);
  assert.deepEqual(effectiveAcquisitionLines(null), []);
});

test("the number of exposures is the slot divided by (exposure + 2 s), the lines sharing the slot equally", () => {
  const count = (i, c = context("galaxy"), p = plan()) =>
    effectiveAcquisition(p, i, c).lines.map((line) => line.frameCount.value);
  assert.deepEqual(count(item()), [59]); // floor(7200 / 122)
  assert.deepEqual(count(item({ endMinute: 3 })), [1]); // floor(180 / 122)
  assert.deepEqual(count(item({ endMinute: 1 })), [null]); // the slot holds none
  assert.deepEqual(
    count(item({ startMinute: undefined, endMinute: undefined })),
    [null],
  );
  const two = item({
    acquisition: {
      lines: [{ exposureSeconds: 300 }, { exposureSeconds: 300 }],
    },
  });
  assert.deepEqual(count(two), [11, 11]); // floor(3600 / 302) each
  assert.equal(
    effectiveAcquisition(plan(), item(), context("galaxy")).slotSeconds,
    7200,
  );
  // A video lasts 90 s at most and has no read-out.
  assert.deepEqual(count(item({ endMinute: 30 }), context("planet")), [9000]);
  assert.deepEqual(count(item({ endMinute: 1 }), context("moon")), [20000]);
  // Never more than the contract holds.
  assert.deepEqual(
    count(
      item(),
      context("planet"),
      plan({ acquisitionDefaults: { exposureSeconds: 0.0005 } }),
    ),
    [100000],
  );
});

test("a chosen number of exposures that does not fit the slot is flagged, and the slot never moves", () => {
  const fits = (lines, p = plan()) =>
    effectiveAcquisition(
      p,
      item({ acquisition: { lines } }),
      context("galaxy"),
    ).lines.map((line) => line.fitsSlot);
  assert.deepEqual(fits([{ exposureSeconds: 120, frameCount: 59 }]), [true]);
  assert.deepEqual(fits([{ exposureSeconds: 120, frameCount: 60 }]), [false]);
  assert.deepEqual(
    fits([{ exposureSeconds: 120, frameCount: 40 }, { exposureSeconds: 120 }]),
    [false, true],
  );
  assert.deepEqual(
    fits(
      [{}],
      plan({ acquisitionDefaults: { exposureSeconds: 600, frameCount: 30 } }),
    ),
    [false],
  );
  const flagged = effectiveAcquisition(
    plan(),
    item({
      acquisition: { lines: [{ exposureSeconds: 120, frameCount: 100 }] },
    }),
    context("galaxy"),
  );
  assert.equal(first(flagged).frameCount.value, 100); // kept as chosen
  assert.equal(flagged.slotSeconds, 7200);
});

test("every field says where it comes from, in the order target line, item filter, plan defaults, rule, device", () => {
  const defaults = {
    exposureSeconds: 180,
    gain: 120,
    binning: 2,
    filter: "Ha 3nm",
  };
  const own = effectiveAcquisition(
    plan({ acquisitionDefaults: defaults }),
    item({
      acquisition: {
        lines: [
          {
            filter: "L",
            exposureSeconds: 90,
            gain: 50,
            binning: 1,
            frameCount: 10,
          },
        ],
      },
    }),
    context("galaxy"),
  );
  assert.deepEqual(
    Object.entries(first(own))
      .filter(([key]) => key !== "fitsSlot")
      .map(([key, field]) => [key, field.source]),
    [
      ["filter", "chosen-target"],
      ["exposureSeconds", "chosen-target"],
      ["gain", "chosen-target"],
      ["binning", "chosen-target"],
      ["frameCount", "chosen-target"],
    ],
  );
  const fromPlan = first(
    effectiveAcquisition(
      plan({ acquisitionDefaults: defaults }),
      item(),
      context("galaxy"),
    ),
  );
  assert.deepEqual(
    [
      fromPlan.filter,
      fromPlan.exposureSeconds,
      fromPlan.gain,
      fromPlan.binning,
    ].map((field) => [field.value, field.source]),
    [
      ["Ha 3nm", "chosen-plan"],
      [180, "chosen-plan"],
      [120, "chosen-plan"],
      [2, "chosen-plan"],
    ],
  );
  assert.equal(fromPlan.frameCount.source, "suggested");
  assert.equal(fromPlan.frameCount.value, 39); // floor(7200 / 182)
  const ruled = first(effectiveAcquisition(plan(), item(), context("galaxy")));
  assert.equal(ruled.exposureSeconds.source, "suggested");
  assert.equal(ruled.gain.source, "device"); // no gain known: the device's own
  assert.equal(ruled.gain.value, null);
  // item.filter is the filter of the FIRST line only.
  const lines = effectiveAcquisition(
    plan({ acquisitionDefaults: { filter: "Ha 3nm" } }),
    item({
      filter: "L",
      acquisition: {
        lines: [{ exposureSeconds: 120 }, { exposureSeconds: 120 }],
      },
    }),
    context("galaxy", { equipment: mono }),
  );
  assert.deepEqual(
    lines.lines.map((line) => [line.filter.value, line.filter.source]),
    [
      ["L", "chosen-target"],
      ["Ha 3nm", "chosen-plan"],
    ],
  );
  // A null filter or gain of a line is a choice and beats what is inherited.
  const chosenNull = first(
    effectiveAcquisition(
      plan({ acquisitionDefaults: { gain: 120 } }),
      item({
        filter: "L",
        acquisition: { lines: [{ filter: null, gain: null }] },
      }),
      context("galaxy", { equipment: { ...colour, hcgGain: 200 } }),
    ),
  );
  assert.deepEqual(
    [
      chosenNull.filter.value,
      chosenNull.filter.source,
      chosenNull.gain.value,
      chosenNull.gain.source,
    ],
    [null, "chosen-target", null, "chosen-target"],
  );
  // A choice is never rewritten by the rule, whatever the equipment says.
  const kept = first(
    effectiveAcquisition(
      plan(),
      item({ acquisition: { lines: [{ exposureSeconds: 600 }] } }),
      context("galaxy", {
        equipment: { ...colour, mountKind: "altaz", maxExposureSeconds: 15 },
      }),
    ),
  );
  assert.equal(kept.exposureSeconds.value, 600);
});

test("a target of no known kind gets nothing proposed; eight lines are kept", () => {
  const star = first(effectiveAcquisition(plan(), item(), context("Étoile")));
  for (const key of [
    "filter",
    "exposureSeconds",
    "gain",
    "binning",
    "frameCount",
  ])
    assert.deepEqual(
      [star[key].value, star[key].source],
      [null, "device"],
      key,
    );
  assert.equal(
    acquisitionTargetKind({ skyTarget: { typeKey: "Soleil" } }),
    null,
  );
  assert.equal(acquisitionTargetKind(null), null);
  const eight = effectiveAcquisition(
    plan(),
    item({
      endMinute: 480,
      acquisition: {
        lines: Array.from({ length: 8 }, (_, n) => ({
          exposureSeconds: 60 + n,
        })),
      },
    }),
    context("galaxy"),
  );
  assert.equal(eight.lines.length, 8);
  assert.deepEqual(
    acquisitionTargetKind({ skyTarget: { typeKey: "Rémanent de supernova" } }),
    "emission",
  );
  assert.equal(
    acquisitionTargetKind({ skyTarget: { typeKey: "Nébuleuse sombre" } }),
    "reflection",
  );
  assert.equal(
    acquisitionTargetKind({ skyTarget: { typeKey: "Planète naine" } }),
    "planet",
  );
});

test("the filter is the existing rule: the catalogue's families in order, the Moon deciding, a luminance before a colour channel", () => {
  const filter = (kind, filters, extra = {}) =>
    first(
      effectiveAcquisition(
        plan(),
        item(),
        context(kind, { filters, ...extra }),
      ),
    ).filter;
  assert.equal(
    filter("emission", [
      { name: "Hα 7nm", family: "ha" },
      { name: "L-eXtreme", family: "dual" },
    ]).value,
    "L-eXtreme",
  );
  assert.equal(
    filter("emission", [{ name: "UV/IR", family: "broadband" }]).value,
    "UV/IR",
  ); // dim Moon: broadband will do
  const bright = filter("emission", [{ name: "UV/IR", family: "broadband" }], {
    moon: { illumination: 80 },
  });
  assert.deepEqual(
    [
      bright.value,
      bright.source,
      bright.reason.filterMissing,
      bright.reason.filterFamily,
    ],
    [null, "device", true, "dual"],
  );
  assert.equal(
    filter("emission", [{ name: "UV/IR", family: "broadband" }], {
      moon: { illumination: 30 },
    }).value,
    "UV/IR",
  ); // 30 % is not above 30 %
  assert.equal(
    filter("planetary", [
      { name: "O III", family: "oiii" },
      { name: "Hα", family: "ha" },
    ]).value,
    "Hα",
  );
  assert.equal(
    filter("galaxy", [
      { name: "Red", family: "r" },
      { name: "Lum", family: "l" },
    ]).value,
    "Lum",
  );
  assert.equal(
    filter("galaxy", [{ name: "Green" }, { name: "Blue" }]).value,
    "Green",
  );
  assert.equal(
    filter("galaxy", [{ name: "L-eXtreme", family: "dual" }]).value,
    null,
  );
  assert.equal(filter("galaxy", [{ name: "Optolong L-eNhance" }]).value, null);
  assert.equal(
    filter("emission", [{ name: "Optolong L-eNhance" }]).value,
    "Optolong L-eNhance",
  );
  // The catalogue's explicit families win over the type.
  const explicit = first(
    effectiveAcquisition(
      plan(),
      item(),
      context("galaxy", {
        target: {
          skyTarget: { typeKey: "Galaxie" },
          knowledge: { observingGuide: { photoFilterFamilies: ["ha"] } },
        },
        filters: [
          { name: "Hα", family: "ha" },
          { name: "L", family: "l" },
        ],
      }),
    ),
  );
  assert.equal(explicit.filter.value, "Hα");
});

test("the reasons are keys, never sentences", () => {
  const reason = first(
    effectiveAcquisition(
      plan(),
      item(),
      context("emission", {
        equipment: {
          ...colour,
          mountKind: "equatorial",
          maxExposureSeconds: 45,
        },
        filters: [{ name: "Duo", family: "dual" }],
        sky: { sqm: 21.6 },
        moon: { illumination: 50 },
      }),
    ),
  ).exposureSeconds.reason;
  assert.deepEqual(reason, {
    targetKind: "emission",
    sensorKind: "colour",
    filterFamily: "dual",
    focalRatioClass: "medium",
    skyClass: "dark",
    moonBright: true,
    mountKind: "equatorial",
    deviceCap: 45,
    capped: "device",
  });
  const walk = (value) => {
    if (typeof value === "string") assert.doesNotMatch(value, /\s/);
    else if (value && typeof value === "object")
      Object.values(value).forEach(walk);
  };
  walk(reason);
});

test("the plain lines freeze what was settled: a field left to the device is left out, except the gain", () => {
  const effective = effectiveAcquisition(
    plan({ acquisitionDefaults: { gain: 120 } }),
    item(),
    context("galaxy", { filters: [{ name: "UV/IR", family: "broadband" }] }),
  );
  assert.deepEqual(effectiveAcquisitionLines(effective), [
    {
      filter: "UV/IR",
      exposureSeconds: 120,
      gain: 120,
      binning: 1,
      frameCount: 59,
    },
  ]);
  const bare = effectiveAcquisition(plan(), item(), context("Étoile"));
  assert.deepEqual(effectiveAcquisitionLines(bare), [{ gain: null }]);
});

test("the equipment is read from the profiles, a trait the profile lacks coming from the common profile of the same id", () => {
  const refractor = { id: "refractor", apertureMm: 80, focalLengthMm: 400 };
  const asi585 = acquisitionEquipment({
    telescope: refractor,
    camera: { id: "zwo-asi585mc-pro", pixelSizeUm: 2.9 },
    mountKind: "equatorial",
  });
  assert.deepEqual(asi585, {
    deviceKind: "dedicated",
    sensorKind: "colour",
    pixelSizeUm: 2.9,
    focalLengthMm: 400,
    apertureMm: 80,
    unityGain: null,
    hcgGain: 200,
    maxExposureSeconds: null,
    mountKind: "equatorial",
  });
  assert.equal(
    acquisitionEquipment({
      telescope: refractor,
      camera: { id: "zwo-asi183mm-pro" },
    }).sensorKind,
    "mono",
  );
  assert.equal(
    acquisitionEquipment({
      telescope: refractor,
      camera: { id: "zwo-asi585mc-pro", hcgGain: 50 },
    }).hcgGain,
    50,
  );
  assert.equal(
    acquisitionEquipment({
      telescope: refractor,
      camera: { id: "zwo-asi585mc-pro" },
      focalLengthMm: 320,
    }).focalLengthMm,
    320,
  );
  const dwarf = acquisitionEquipment({
    telescope: {
      id: "dwarf-3",
      apertureMm: 35,
      focalLengthMm: 150,
      integratedCamera: { id: "dwarf-3-imx678", pixelSizeUm: 2 },
      mount: { id: "integrated-altaz" },
    },
  });
  assert.deepEqual(
    [dwarf.deviceKind, dwarf.mountKind, dwarf.maxExposureSeconds],
    ["smart-telescope", "altaz", 60],
  );
  assert.equal(
    acquisitionEquipment({
      telescope: refractor,
      camera: { id: "x" },
      deviceKind: "dslr",
    }).deviceKind,
    "dslr",
  );
  assert.equal(acquisitionEquipment().sensorKind, null);
});

test("every unconfirmed value of the table carries the marker the report lists", async () => {
  const source = await readFile(
    new URL("../src/acquisition.js", import.meta.url),
    "utf8",
  );
  const marker = "// à confirmer";
  // 8 kinds x 4 columns less the 'one-dash' cells are exposures; the rest are
  // the corrections the study italicises.
  const unconfirmed = source
    .split("\n")
    .filter((line) => line.includes(marker));
  assert.ok(unconfirmed.length >= 30, `${unconfirmed.length} marked values`);
  for (const line of source
    .split("\n")
    .filter((l) =>
      /^\s+(colourBroadband|colourDual|monoBroadband|monoNarrow): [0-9.]+,$/.test(
        l,
      ),
    ))
    assert.fail(`unmarked base exposure: ${line.trim()}`);
});
