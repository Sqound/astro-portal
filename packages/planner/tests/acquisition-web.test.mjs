import assert from "node:assert/strict";
import test from "node:test";
import {
  acquisitionBasisOf,
  acquisitionBlockLine,
  acquisitionItemView,
} from "planner/acquisition-reading.js";
import {
  acquisitionAdvisedFilterText,
  acquisitionExposureText,
  acquisitionFramesText,
  acquisitionLineText,
  acquisitionProvenanceText,
  acquisitionSuggestedExposureText,
  acquisitionSuggestedGainText,
  shortFilterName,
} from "planner/acquisition-words.js";
import { normalizeAcquisitionLines } from "planner/plan-acquisition.js";

// "Prise de vue par cible": what the web reads of a plan item (the effective
// line with its provenance) and the words of it. The cases run over one rig (an
// Askar FRA400 with a ZWO ASI585MC Pro). Pure: no component.

const filters = [
  { name: "UV/IR cut", family: "broadband" },
  { name: "Dual band", family: "dual" },
];

const rigEquipment = ({ mode = "imaging", filterIds = [] } = {}) => ({
  mode,
  telescopeId: "askar-fra400",
  cameraId: "zwo-asi585mc-pro",
  filterIds,
});

const galaxyItem = ({
  id = "m31",
  startMinute = 120,
  endMinute = 200,
  extra = {},
} = {}) => ({
  id,
  durationMinutes: endMinute - startMinute,
  startMinute,
  endMinute,
  filter: "",
  target: {
    id,
    designation: "M31",
    title: "M31 — Andromeda Galaxy",
    objects: ["M31"],
    coordinate: { ra: 10.68, dec: 41.27 },
    coordinateUnit: "degrees",
    catalogue: "Messier",
    skyTarget: { typeKey: "Galaxie", type: "Galaxy" },
    plannerSource: "catalogue",
  },
  ...extra,
});

const basisFor = ({
  equipment = rigEquipment(),
  items = [],
  planExtra = {},
  sqm = 20.8,
  moon = 17,
  ownedFilters = [],
} = {}) =>
  acquisitionBasisOf({
    plan: {
      id: "plan-1",
      name: "Night by the lake",
      date: "2026-09-15",
      equipment,
      items,
      ...planExtra,
    },
    ownedFilters,
    sqm,
    moonIllumination: moon,
  });

test("what the rule gives an item nobody touched", () => {
  const reading = basisFor({ ownedFilters: filters }).read(galaxyItem());
  const line = reading.first;
  assert.equal(line.exposureSeconds.value, 120);
  assert.equal(line.exposureSeconds.source, "suggested");
  // The camera's profile names its HCG gain.
  assert.equal(line.gain.value, 200);
  assert.equal(line.gain.suggested, true);
  assert.equal(line.filter.value, "UV/IR cut");
  // 80 min = 4 800 s, ⌊4 800 ÷ (120 + 2)⌋ = 39 frames.
  assert.equal(line.frameCount.value, 39);
  assert.equal(line.allSuggested, true);
  assert.equal(line.anyChosen, false);
  assert.equal(reading.slotSeconds, 4800);
  assert.ok(reading.ruleVersion);
});

test("item.filter is the recommendation of the day, not a choice", () => {
  const line = basisFor({ ownedFilters: filters }).read(
    galaxyItem({ extra: { filter: "Dual band" } }),
  ).first;
  // The galaxy asks for a broadband filter; the stored text is ignored.
  assert.equal(line.filter.value, "UV/IR cut");
  assert.equal(line.filter.source, "suggested");
  assert.equal(line.allSuggested, true);
});

test("visual mode: nothing is read, nothing is proposed", () => {
  const basis = basisFor({ equipment: rigEquipment({ mode: "visual" }) });
  assert.equal(basis.photo, false);
  assert.equal(basis.read(galaxyItem()), null);
  assert.equal(acquisitionItemView(basis, galaxyItem()), null);
});

test("a target of no known type has nothing to say", () => {
  const star = galaxyItem();
  star.target.skyTarget = { typeKey: "Étoile", type: "Star" };
  assert.equal(acquisitionItemView(basisFor(), star), null);
});

test("the target's line wins, the plan's defaults come next", () => {
  const basis = basisFor({
    ownedFilters: filters,
    planExtra: { acquisitionDefaults: { exposureSeconds: 60, gain: 100 } },
  });
  const plain = basis.read(galaxyItem()).first;
  assert.equal(plain.exposureSeconds.value, 60);
  assert.equal(plain.exposureSeconds.source, "chosen-plan");
  assert.equal(plain.gain.value, 100);
  assert.equal(plain.allSuggested, false);

  const own = basis.read(
    galaxyItem({
      extra: { acquisition: { lines: [{ exposureSeconds: 90 }] } },
    }),
  ).first;
  assert.equal(own.exposureSeconds.value, 90);
  assert.equal(own.exposureSeconds.source, "chosen-target");
  // The gain was not touched for the target: the plan's.
  assert.equal(own.gain.value, 100);
  assert.equal(own.gain.source, "chosen-plan");
  // The count is the rule's over the exposure chosen.
  assert.equal(own.frameCount.value, Math.floor(4800 / 92));
});

test("suggestion() leaves every choice out", () => {
  const basis = basisFor({
    planExtra: { acquisitionDefaults: { exposureSeconds: 60 } },
  });
  const item = galaxyItem({
    extra: { acquisition: { lines: [{ exposureSeconds: 90 }] } },
  });
  assert.equal(basis.read(item).first.exposureSeconds.value, 90);
  const suggested = basis.suggestion(item).first;
  assert.equal(suggested.exposureSeconds.value, 120);
  assert.equal(suggested.exposureSeconds.suggested, true);
});

test("a chosen count that does not fit the slot is flagged, kept", () => {
  const line = basisFor().read(
    galaxyItem({ extra: { acquisition: { lines: [{ frameCount: 80 }] } } }),
  ).first;
  assert.equal(line.frameCount.value, 80);
  assert.equal(line.fitsSlot, false);
});

test("the frame count follows the slot when a handle moves", () => {
  const basis = basisFor();
  const item = galaxyItem();
  assert.equal(basis.read(item).first.frameCount.value, 39);
  assert.equal(basis.readAt(item, 120, 160).first.frameCount.value, 19);
  assert.equal(basis.readAt(item, 120, 280).first.frameCount.value, 78);
});

test("a frozen line is shown as it was, whatever the rule says now", () => {
  const basis = basisFor({
    planExtra: {
      launchedSchedule: [
        {
          planItemId: "m31",
          targetId: "m31",
          startMinute: 120,
          endMinute: 200,
          acquisition: {
            lines: [
              {
                filter: "Old filter",
                exposureSeconds: 45,
                gain: 111,
                frameCount: 5,
              },
            ],
          },
          ruleVersion: "expo-b-0",
        },
      ],
    },
  });
  const view = acquisitionItemView(basis, galaxyItem());
  assert.equal(view.frozen, true);
  assert.equal(view.suggested, false);
  assert.equal(view.live, null);
  assert.equal(view.line.exposureSeconds.value, 45);
  assert.equal(view.line.gain.value, 111);
  assert.equal(view.line.filter.value, "Old filter");
  assert.equal(view.frozenLine.frameCount, 5);
  assert.equal(view.launched.ruleVersion, "expo-b-0");
  assert.equal(
    acquisitionLineText("en", view.line),
    "45 s · gain 111 · Old filter",
  );
});

test("an item with no frozen line reads the rule as before", () => {
  const basis = basisFor({
    planExtra: {
      launchedSchedule: [
        {
          planItemId: "other",
          targetId: "other",
          startMinute: 0,
          endMinute: 30,
        },
      ],
    },
  });
  assert.equal(acquisitionItemView(basis, galaxyItem()).frozen, false);
});

test("frozen() writes the effective lines and the rule's version", () => {
  const basis = basisFor({ ownedFilters: filters });
  const frozen = basis.frozen(galaxyItem());
  const [line] = frozen.acquisition.lines;
  assert.equal(line.exposureSeconds, 120);
  assert.equal(line.gain, 200);
  assert.equal(line.filter, "UV/IR cut");
  assert.equal(line.frameCount, 39);
  assert.equal(frozen.ruleVersion, basis.read(galaxyItem()).ruleVersion);
  // The contract's own reader accepts it.
  assert.ok(normalizeAcquisitionLines(frozen.acquisition));
});

test("units under the second: 120 s, 1/250 s, 4 ms", () => {
  assert.equal(acquisitionExposureText("en", 120), "120 s");
  assert.equal(acquisitionExposureText("en", 1), "1 s");
  assert.equal(acquisitionExposureText("en", 1.25), "1.25 s");
  assert.equal(acquisitionExposureText("en", 0.004), "1/250 s");
  assert.equal(acquisitionExposureText("en", 0.01), "1/100 s");
  assert.equal(acquisitionExposureText("en", 0.0035), "3.5 ms");
  assert.equal(acquisitionExposureText("en", 0.003), "3 ms");
  assert.equal(acquisitionExposureText("fr", 1.25), "1,25 s");
});

test("the line and its short form", () => {
  const line = basisFor({ ownedFilters: filters }).read(galaxyItem()).first;
  assert.equal(acquisitionLineText("en", line), "120 s · gain 200 · UV/IR cut");
  assert.equal(
    acquisitionLineText("en", line, { short: true }),
    "120 s · g200 · UV/IR",
  );
  assert.equal(acquisitionFramesText("en", line), "≈ 39 frames");
  assert.equal(acquisitionFramesText("fr", line), "≈ 39 poses");
});

test("a gain left to the device and a filter set to none are said", () => {
  const line = basisFor({ ownedFilters: filters }).read(
    galaxyItem({
      extra: { acquisition: { lines: [{ gain: null, filter: null }] } },
    }),
  ).first;
  assert.equal(
    acquisitionLineText("en", line),
    "120 s · device gain · no filter",
  );
  assert.equal(acquisitionLineText("en", line, { short: true }), "120 s");
});

test("the short filter drops « cut », the telescope and what is long", () => {
  assert.equal(shortFilterName("UV/IR cut"), "UV/IR");
  assert.equal(shortFilterName("UV/IR-cut"), "UV/IR");
  assert.equal(shortFilterName("UV/IR-cut filter"), "UV/IR-cut");
  assert.equal(shortFilterName("Seestar S50 · Duo-Band filter"), "Duo-Band");
  assert.equal(shortFilterName("UV/IR-cut · RGB"), "UV/IR");
  assert.equal(shortFilterName("Double bande Hα/OIII 7 nm"), "Double");
  assert.equal(shortFilterName("L"), "L");
});

test("a label carries the line from 118 px, not under", () => {
  const view = acquisitionItemView(
    basisFor({ ownedFilters: filters }),
    galaxyItem(),
  );
  assert.equal(acquisitionBlockLine("en", { width: 117.9, view }), null);
  assert.equal(
    acquisitionBlockLine("en", { width: 118, view }),
    "120 s · g200 · UV/IR",
  );
  assert.equal(acquisitionBlockLine("en", { width: 400, view: null }), null);
});

test("the reasons, as short words", () => {
  const reading = basisFor({ ownedFilters: filters }).read(galaxyItem());
  assert.ok(
    acquisitionSuggestedExposureText("en", reading).startsWith(
      "120 s · galaxy, f/5.6, average sky",
    ),
  );
  assert.ok(
    acquisitionSuggestedGainText("en", reading).includes(
      "HCG gain of the ZWO ASI585MC Pro",
    ),
  );
  assert.equal(
    acquisitionAdvisedFilterText("en", reading),
    "UV/IR cut (Moon at 17 %)",
  );
  assert.equal(
    acquisitionProvenanceText("en", reading),
    "suggested: galaxy, colour camera",
  );
  assert.equal(
    acquisitionProvenanceText(
      "en",
      basisFor({
        planExtra: {
          acquisitionDefaults: { exposureSeconds: 60, gain: 100, filter: null },
        },
      }).read(galaxyItem()),
    ),
    "chosen for the whole plan",
  );
});
