import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  cameraProfiles,
  eyepieceProfiles,
  firstLaunchPreselection,
  integratedCameraProfiles,
  newPlanEquipment,
  mountProfiles,
  filterProductProfiles,
  opticalModifiers,
  ownerStartEquipment,
  resolveEquipment,
  telescopeProfiles,
  binocularsProfiles,
} from "../src/planner.js";
import { defaultStaticDataDocuments } from "../../portal-app/src/lib/static-data-defaults.js";

// The common equipment profiles, one data file of the open core, every value
// from its maker's page.

const source = JSON.parse(
  await readFile(
    new URL("../src/common-equipment-profiles.json", import.meta.url),
    "utf8",
  ),
);

test("the original forty-seven telescopes are all still there under their names, in their groups, and the lists come group by group", () => {
  const original = [
    ["connected", "Celestron Origin"],
    ["connected", "Celestron Origin Mark II"],
    ["connected", "Dwarf 3"],
    ["connected", "Dwarf Draco"],
    ["connected", "Dwarf Mini"],
    ["connected", "Unistellar eQuinox 2"],
    ["connected", "Unistellar eVscope 2"],
    ["connected", "Unistellar Odyssey"],
    ["connected", "Unistellar Odyssey Pro"],
    ["connected", "Atlas"],
    ["connected", "Stellina"],
    ["connected", "Vespera"],
    ["connected", "Vespera II"],
    ["connected", "Vespera 3"],
    ["connected", "Vespera Pro"],
    ["connected", "Vespera Pro 2"],
    ["connected", "Seestar S30"],
    ["connected", "Seestar S30 Pro"],
    ["connected", "Seestar S50"],
    ["connected", "Seestar S50 Pro"],
    ["refractors", "Askar FRA300 Pro"],
    ["refractors", "Askar FRA400"],
    ["refractors", "Celestron AstroMaster 70AZ"],
    ["refractors", "Celestron AstroMaster 90AZ"],
    ["refractors", "Sky-Watcher Evostar 72 ED"],
    ["refractors", "Sky-Watcher Evostar 80 ED"],
    ["refractors", "Sky-Watcher StarTravel 80"],
    ["refractors", "Sky-Watcher StarTravel 102"],
    ["refractors", "Svbony SV503 70 ED"],
    ["refractors", "Svbony SV550 80 (triplet apochromatique)"],
    ["refractors", "William Optics RedCat 51"],
    ["refractors", "William Optics Zenithstar 61 II"],
    ["reflectors", "Celestron AstroMaster 114EQ"],
    ["reflectors", "Celestron AstroMaster 130EQ"],
    ["reflectors", "Celestron C8"],
    ["reflectors", "Celestron NexStar 4SE (Maksutov)"],
    ["reflectors", "Celestron NexStar 5SE"],
    ["reflectors", "Celestron NexStar 6SE"],
    ["reflectors", "Celestron StarSense Explorer DX 130AZ"],
    ["reflectors", "Sky-Watcher Dobson 150/1200 (Classic 150P)"],
    ["reflectors", "Sky-Watcher Dobson 200/1200"],
    ["reflectors", "Sky-Watcher Heritage 130"],
    ["reflectors", "Sky-Watcher Heritage 150"],
    ["reflectors", "Sky-Watcher Newton 150/750"],
    ["reflectors", "Sky-Watcher Skymax 90 (Maksutov)"],
    ["reflectors", "Sky-Watcher Skymax 102 (Maksutov)"],
    ["reflectors", "Sky-Watcher Skymax 127 (Maksutov)"],
  ];
  for (const [group, name] of original) {
    const found = telescopeProfiles.find((profile) => profile.name === name);
    assert.ok(found, name);
    assert.equal(found.group, group, name);
  }
  // The groups are contiguous, in the order the pickers use.
  const groups = telescopeProfiles.map((profile) => profile.group);
  assert.deepEqual(
    [...new Set(groups)],
    ["connected", "refractors", "reflectors"],
  );
  assert.equal(
    groups.join().replace(/(\b\w+\b)(,\1)+/g, "$1"),
    "connected,refractors,reflectors",
  );
  // The makers' values where the drawing differs (study, § 1).
  const byId = (id) => telescopeProfiles.find((profile) => profile.id === id);
  assert.equal(byId("vespera-ii").focalLengthMm, 250);
  assert.equal(byId("skywatcher-dobson-200-1200").apertureMm, 203);
  assert.equal(byId("celestron-c8").apertureMm, 203.2);
  // The original cameras, eyepieces and modifiers are all still there.
  for (const name of [
    "ZWO ASI585MC Pro",
    "ZWO ASI2600MC Pro",
    "ZWO ASI294MC Pro",
    "ZWO ASI183MM Pro",
    "QHYCCD QHY268C",
    "Player One Poseidon-C Pro",
    "ZWO ASI533MC Pro",
    "ZWO ASI662MC",
    "ZWO ASI678MC",
    "ZWO ASI224MC",
    "Player One Neptune-C II",
  ])
    assert.ok(
      cameraProfiles.some((profile) => profile.name === name),
      name,
    );
  for (const name of [
    "Celestron Zoom 8–24 mm",
    "Plössl 25 mm",
    "Plössl 10 mm",
    "Plössl 32 mm",
    "Plössl 20 mm",
    "Plössl 12,5 mm",
  ])
    assert.ok(
      eyepieceProfiles.some((profile) => profile.name === name),
      name,
    );
  assert.deepEqual(
    opticalModifiers
      .slice(0, 3)
      .map((profile) => [profile.id, profile.multiplier]),
    [
      ["none", 1],
      ["reducer", 0.8],
      ["barlow", 2],
    ],
  );
});

test("the maker's optics of the three drawn-differently presets, and the kept defaults", () => {
  const byId = (id) => telescopeProfiles.find((profile) => profile.id === id);
  const ratio = (profile) =>
    Math.round((profile.focalLengthMm / profile.apertureMm) * 10) / 10;
  // Vespera II: 50 mm, 250 mm, f/5 (not 200 mm, f/4).
  assert.deepEqual(
    [byId("vespera-ii").apertureMm, byId("vespera-ii").focalLengthMm],
    [50, 250],
  );
  assert.equal(ratio(byId("vespera-ii")), 5);
  // Dobson 8": 203 mm, 1 200 mm, f/5.9 (not 200 mm, f/6).
  assert.deepEqual(
    [
      byId("skywatcher-dobson-200-1200").apertureMm,
      byId("skywatcher-dobson-200-1200").focalLengthMm,
    ],
    [203, 1200],
  );
  assert.equal(ratio(byId("skywatcher-dobson-200-1200")), 5.9);
  // C8: 203.2 mm, 2 032 mm, f/10.
  assert.deepEqual(
    [byId("celestron-c8").apertureMm, byId("celestron-c8").focalLengthMm],
    [203.2, 2032],
  );
  // The default Celestron Origin is the first one (#12099, IMX178), not the
  // Mark II (IMX678).
  assert.equal(
    source.telescopes.find((item) => item.id === "celestron-origin")
      .integratedCameraId,
    "celestron-origin-imx178",
  );
  assert.equal(
    integratedCameraProfiles.find(
      (camera) => camera.id === "celestron-origin-imx178",
    ).sensor,
    "Sony IMX178LQJ",
  );
  // The first eyepieces are the Sky-Watcher Super Plössl, 52 degrees; the
  // later Plössl take the field their own maker's page states.
  for (const id of [
    "plossl-10",
    "plossl-12-5",
    "plossl-20",
    "plossl-25",
    "plossl-32",
  ])
    assert.equal(
      eyepieceProfiles.find((item) => item.id === id).apparentFieldDegrees,
      52,
    );
  assert.match(
    source.sources["plossl-52"].url,
    /skywatcher\.com\/product\/super-pl-/,
  );
});

test("every profile carries the maker's pages its values come from", () => {
  const profiles = [
    ...telescopeProfiles,
    ...binocularsProfiles,
    ...integratedCameraProfiles,
    ...cameraProfiles,
    ...eyepieceProfiles,
    ...mountProfiles.filter((profile) => profile.makerPages.length),
    ...filterProductProfiles,
    ...opticalModifiers.filter(
      (profile) => profile.id !== "none" && profile.makerPages,
    ),
  ];
  for (const profile of profiles) {
    assert.ok(profile.makerPages.length > 0, profile.id);
    for (const page of profile.makerPages) {
      assert.match(page.url, /^https?:\/\/[^/]+\.[a-z]+\//, profile.id);
      assert.match(page.readOn, /^\d{4}-\d{2}-\d{2}$/, profile.id);
    }
  }
  // A computed value says so, and how.
  for (const profile of [...integratedCameraProfiles, ...cameraProfiles])
    if (profile.calculated) {
      assert.ok(profile.calculated.length > 0, profile.id);
      assert.ok(String(profile.calculation || "").length > 0, profile.id);
    }
  // Every source the file declares is read by a profile.
  const read = new Set(
    [
      ...source.telescopes,
      ...source.binoculars,
      ...source.integratedCameras,
      ...source.cameras,
      ...source.eyepieces,
      ...source.opticalModifiers.filter((entry) => entry.sources),
      ...source.mounts.filter((entry) => entry.sources),
      ...(source.filterProducts || []),
      ...source.filters,
    ].flatMap((entry) => entry.sources),
  );
  assert.deepEqual([...read].sort(), Object.keys(source.sources).sort());
});

test("a connected telescope resolves its integrated camera, whatever cameraId says", () => {
  const connected = telescopeProfiles.filter(
    (profile) => profile.group === "connected",
  );
  assert.equal(connected.length, 20);
  for (const telescope of connected) {
    assert.equal(telescope.mount.name, "Azimutale intégrée");
    for (const cameraId of ["zwo-asi2600mc-pro", null, "missing"]) {
      const resolved = resolveEquipment({
        telescopeId: telescope.id,
        cameraId,
        modifierId: "none",
      });
      assert.equal(
        resolved.sensorWidthMm,
        telescope.integratedCamera.sensorWidthMm,
      );
      assert.equal(
        resolved.sensorHeightMm,
        telescope.integratedCamera.sensorHeightMm,
      );
      assert.equal(
        resolved.name,
        `${telescope.name} · ${telescope.integratedCamera.name}`,
      );
    }
  }
  assert.equal(
    connected.find((profile) => profile.id === "seestar-s50").integratedCamera
      .sensor,
    "Sony IMX462",
  );
  // A refractor keeps the camera it is given.
  const refractor = resolveEquipment({
    telescopeId: "skywatcher-evostar-80ed",
    cameraId: "zwo-asi2600mc-pro",
    modifierId: "none",
  });
  assert.equal(refractor.sensorWidthMm, 23.5);
});

test("the first-launch preselection names a telescope of the catalogue per mode", () => {
  // The most common choice: the Seestar S50 in photo (its camera is built in),
  // the Skymax 127 and a 25 mm Plössl in visual.
  assert.equal(firstLaunchPreselection.imaging.telescope.id, "seestar-s50");
  assert.equal(firstLaunchPreselection.imaging.telescope.group, "connected");
  assert.equal(
    firstLaunchPreselection.visual.telescope.id,
    "skywatcher-skymax-127",
  );
  assert.equal(firstLaunchPreselection.visual.telescope.apertureMm, 127);
  assert.equal(firstLaunchPreselection.visual.eyepiece.id, "plossl-25");
  assert.equal(firstLaunchPreselection.visual.eyepiece.focalLengthMm, 25);
  // Every id is one of the lists, so the app never has to fall back on its
  // own data; the file keeps no "firstLaunchRig" any more.
  for (const [mode, entry] of Object.entries(source.firstLaunchPreselection)) {
    assert.ok(
      telescopeProfiles.some((profile) => profile.id === entry.telescopeId),
      mode,
    );
  }
  assert.ok(
    eyepieceProfiles.some(
      (profile) =>
        profile.id === source.firstLaunchPreselection.visual.eyepieceId,
    ),
  );
  assert.equal("firstLaunchRig" in source, false);
});

test("the first-launch preselection: a smart telescope in photo, a telescope with an eyepiece in visual, never a smart one", () => {
  // Photo: the integrated camera is the telescope's own, nothing else to pick.
  assert.ok(firstLaunchPreselection.imaging.telescope.integratedCamera);
  assert.equal(firstLaunchPreselection.imaging.camera, undefined);
  // Visual: no smart telescope (it has no eyepiece), a group the sheet lists.
  const visual = firstLaunchPreselection.visual;
  assert.equal(visual.telescope.integratedCamera, undefined);
  assert.ok(["refractors", "reflectors"].includes(visual.telescope.group));
  assert.match(visual.telescope.name, /Maksutov/);
  assert.equal(visual.eyepiece.name, "Plössl 25 mm");
  // The preselection is a key of the file, one entry per mode.
  assert.deepEqual(Object.keys(source.firstLaunchPreselection).sort(), [
    "imaging",
    "visual",
  ]);
});

test("the static-data document of the presets lists the common profiles, without defaultProfiles", () => {
  const presets = defaultStaticDataDocuments().find(
    (document) => document.key === "planner-equipment-presets",
  ).payload;
  assert.equal("defaultProfiles" in presets, false);
  assert.deepEqual(Object.keys(presets).sort(), [
    "cameras",
    "eyepieces",
    "opticalModifiers",
    "telescopes",
  ]);
  assert.deepEqual(
    presets.telescopes.map((profile) => profile.id),
    telescopeProfiles.map((profile) => profile.id),
  );
});

test("a new plan never starts on a common profile in silence", () => {
  // Nothing chosen is `null` (« Choisir… »).
  const seed = { telescopeId: null, cameraId: null, eyepieceId: null };
  for (const telescope of telescopeProfiles) {
    const start = newPlanEquipment({ ...seed, telescopeId: telescope.id }, []);
    assert.equal(start.telescopeId, null);
  }
  const owner = newPlanEquipment(seed, [
    {
      id: "owner-scope",
      type: "telescope",
      name: "Lunette de l’atelier",
      specifications: { apertureMm: 72, focalLengthMm: 420 },
    },
  ]);
  assert.equal(owner.telescopeId, "owner-scope");
  assert.equal(owner.cameraId, null);
});

test("the catalogue's counts, unique ids, the pair the visual preselection needs", () => {
  const count = (group) =>
    telescopeProfiles.filter((profile) => profile.group === group).length;
  // The catalogue only grows (EQUIPMENT-CATALOGUE-01): the original counts
  // are floors, the originals themselves are pinned by id elsewhere.
  assert.equal(count("connected"), 20);
  assert.ok(count("refractors") >= 147);
  assert.ok(count("reflectors") >= 105);
  assert.ok(telescopeProfiles.length >= 272);
  assert.ok(cameraProfiles.length >= 102);
  assert.ok(eyepieceProfiles.length >= 135);
  assert.ok(opticalModifiers.length >= 43);
  assert.equal(integratedCameraProfiles.length, 20);
  for (const profiles of [
    telescopeProfiles,
    integratedCameraProfiles,
    cameraProfiles,
    eyepieceProfiles,
    opticalModifiers,
  ])
    assert.equal(
      new Set(profiles.map((item) => item.id)).size,
      profiles.length,
    );
  const byId = (id) => telescopeProfiles.find((profile) => profile.id === id);
  // The Mak 127 and the Plössl 25 mm: the pair the app preselects.
  assert.deepEqual(
    [
      byId("skywatcher-skymax-127").apertureMm,
      byId("skywatcher-skymax-127").focalLengthMm,
    ],
    [127, 1500],
  );
  assert.ok(eyepieceProfiles.some((item) => item.id === "plossl-25"));
  // The StarTravel refractors lose the maker's reference.
  for (const id of ["skywatcher-startravel-80", "skywatcher-startravel-102"])
    assert.doesNotMatch(byId(id).name, /BK/);
  // The NexStar SE are classic telescopes with an integrated mount: group
  // `reflectors`, no `mountId` (the catalogue knows only the smart
  // telescopes' `integrated-altaz`), like the C8.
  for (const id of [
    "celestron-nexstar-4se",
    "celestron-nexstar-5se",
    "celestron-nexstar-6se",
    "celestron-c8",
  ]) {
    assert.equal(byId(id).group, "reflectors", id);
    assert.equal(byId(id).mount, undefined, id);
    assert.equal(byId(id).integratedCamera, undefined, id);
  }
  // Every smart telescope carries its sensor and the integrated mount; the
  // Origin Mark II takes the sensor the file already held for it.
  for (const telescope of telescopeProfiles.filter(
    (profile) => profile.group === "connected",
  )) {
    assert.equal(telescope.mount.id, "integrated-altaz", telescope.id);
    assert.ok(telescope.integratedCamera, telescope.id);
  }
  assert.equal(
    byId("celestron-origin-mark-ii").integratedCamera.id,
    "celestron-origin-mark-ii-imx678",
  );
  // Every integrated sensor belongs to one telescope.
  const used = telescopeProfiles
    .map((profile) => profile.integratedCamera?.id)
    .filter(Boolean);
  assert.deepEqual(
    used.sort(),
    integratedCameraProfiles.map((camera) => camera.id).sort(),
  );
});

test("every value that is not the maker's is marked « Estimation : » with its source, and every deduced value says how", () => {
  const entries = [
    ...source.telescopes,
    ...source.integratedCameras,
    ...source.cameras,
  ];
  for (const entry of entries) {
    if (entry.calculated) {
      assert.ok(entry.calculated.length > 0, entry.id);
      assert.ok(String(entry.calculation || "").length > 0, entry.id);
    }
    for (const key of entry.sources) {
      assert.match(source.sources[key].readOn, /^\d{4}-\d{2}-\d{2}$/, key);
      assert.match(source.sources[key].url, /^https?:\/\//, key);
    }
  }
  const byId = (id) => entries.find((entry) => entry.id === id);
  // The Draco (the maker's page gives the 90 mm only) and the Unistellar
  // range (no sensor model nor pixel on the maker's shop): marked.
  for (const id of [
    "dwarf-draco",
    "dwarf-draco-sensor",
    "unistellar-evscope-2-imx347",
    "unistellar-equinox-2-imx347",
    "unistellar-odyssey-imx615",
    "unistellar-odyssey-pro-imx615",
  ]) {
    assert.match(byId(id).calculation, /^Estimation : /, id);
    assert.ok(byId(id).calculated.length > 0, id);
  }
  assert.equal(byId("dwarf-draco").name, "Dwarf Draco");
  // The other reading of the contradicting sources is named, not dropped.
  assert.match(byId("unistellar-equinox-2-imx347").calculation, /IMX615/);
  assert.equal(byId("unistellar-equinox-2-imx347").sensor, "Sony IMX347");
  assert.equal(byId("unistellar-odyssey-imx615").sensor, "Sony IMX615");
  assert.equal(byId("unistellar-odyssey-imx615").pixelSizeUm, 1.45);
});

// The owner's plan adopts the inventory's instruments once it is known, except
// those the person chose among the common profiles: the eyepiece of a plan once
// went back to nothing chosen at every load, and the plan was written back
// that way.
test("an owner's plan keeps the common telescope, camera and eyepiece that were chosen", () => {
  const common = {
    telescopes: telescopeProfiles,
    cameras: cameraProfiles,
    eyepieces: eyepieceProfiles,
  };
  const chosen = {
    telescopeId: "skywatcher-dobson-200-1200",
    cameraId: cameraProfiles[0].id,
    eyepieceId: "plossl-25",
  };
  for (const inventory of [
    [],
    [
      {
        id: "owner-eyepiece",
        type: "eyepiece",
        name: "Delos 10 mm",
        specifications: { focalLengthMm: 10, apparentFieldDegrees: 72 },
      },
    ],
  ]) {
    const start = ownerStartEquipment(chosen, inventory, common);
    assert.equal(start.telescopeId, chosen.telescopeId);
    assert.equal(start.cameraId, chosen.cameraId);
    assert.equal(start.eyepieceId, "plossl-25");
  }
});

test("an owner's new plan still starts on the inventory's instrument, never on a common one in silence", () => {
  const common = {
    telescopes: telescopeProfiles,
    cameras: cameraProfiles,
    eyepieces: eyepieceProfiles,
  };
  const seed = { telescopeId: null, cameraId: null, eyepieceId: null };
  const owner = ownerStartEquipment(
    seed,
    [
      {
        id: "owner-scope",
        type: "telescope",
        name: "Lunette de l’atelier",
        specifications: { apertureMm: 72, focalLengthMm: 420 },
      },
    ],
    common,
  );
  assert.equal(owner.telescopeId, "owner-scope");
  assert.equal(owner.eyepieceId, null);
  // An id that names nothing any more falls back like a seed.
  assert.equal(
    ownerStartEquipment({ ...seed, eyepieceId: "gone" }, [], common).eyepieceId,
    null,
  );
});

test("the common mounts are products with a maker and a kind, headed by the integrated azimuth mount", () => {
  assert.equal(mountProfiles[0].id, "integrated-altaz");
  assert.equal(mountProfiles[0].name, "Azimutale intégrée");
  const ids = mountProfiles.map((profile) => profile.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const profile of mountProfiles.slice(1)) {
    assert.ok(profile.maker, profile.id);
    assert.ok(
      ["altaz", "equatorial", "hybrid", "tracker"].includes(profile.kind),
      profile.id,
    );
    assert.ok(profile.makerPages.length > 0, profile.id);
  }
});
