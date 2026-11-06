// The built-in filters of the smart telescopes and the identifiers of the
// smart-telescope profiles, as the common equipment data of the planner has
// them (`packages/planner/src/common-equipment-profiles.json`). The portal
// cannot import the planner, so the rows the forms of « Mon matériel » show
// read-only live here; `packages/planner/tests/filter-attachment-web.test.mjs`
// fails when this copy drifts from the data file.

export const builtInFilterRows = Object.freeze(
  [
    {
      id: "filter-dwarf-3-vis",
      name: "VIS",
      family: "broadband",
      telescopeIds: ["dwarf-3"],
      builtIn: true,
    },
    {
      id: "filter-dwarf-3-astro",
      name: "Astro",
      family: "broadband",
      telescopeIds: ["dwarf-3"],
      builtIn: true,
    },
    {
      id: "filter-dwarf-3-dual-band",
      name: "Dual-Band",
      family: "dual",
      telescopeIds: ["dwarf-3"],
      builtIn: true,
    },
    {
      id: "filter-dwarf-mini-astro",
      name: "Astro",
      family: "broadband",
      telescopeIds: ["dwarf-mini"],
      builtIn: true,
    },
    {
      id: "filter-dwarf-mini-dual-band",
      name: "Dual Narrowband",
      family: "dual",
      telescopeIds: ["dwarf-mini"],
      builtIn: true,
    },
    {
      id: "filter-stellina-light-pollution",
      name: "Light Pollution",
      family: "uhc",
      telescopeIds: ["vaonis-stellina"],
      builtIn: true,
    },
    {
      id: "filter-vespera-light-pollution",
      name: "Light Pollution",
      family: "uhc",
      telescopeIds: [
        "vespera-ii",
        "vespera-3",
        "vespera-pro-2",
        "vespera-pro",
        "vespera",
      ],
      builtIn: true,
    },
    {
      id: "filter-vespera-dual-band",
      name: "Dual Band",
      family: "dual",
      telescopeIds: ["vespera-ii", "vespera-3", "vespera-pro-2", "vespera-pro"],
      builtIn: true,
    },
    {
      id: "filter-vespera-solar",
      name: "Solar",
      family: "solar",
      telescopeIds: ["vespera-ii", "vespera-3", "vespera-pro-2", "vespera-pro"],
      builtIn: true,
    },
    {
      id: "filter-seestar-s30-uvir",
      name: "UV/IR-Cut",
      family: "broadband",
      telescopeIds: ["seestar-s30"],
      builtIn: true,
    },
    {
      id: "filter-seestar-s30-duoband",
      name: "Duo-Band",
      family: "dual",
      telescopeIds: ["seestar-s30"],
      builtIn: true,
    },
    {
      id: "filter-seestar-s30-pro-uvir",
      name: "UV/IR-Cut",
      family: "broadband",
      telescopeIds: ["seestar-s30-pro"],
      builtIn: true,
    },
    {
      id: "filter-seestar-s30-pro-duoband",
      name: "Duo-Band",
      family: "dual",
      telescopeIds: ["seestar-s30-pro"],
      builtIn: true,
    },
    {
      id: "filter-seestar-s50-uvir",
      name: "UV/IR-Cut",
      family: "broadband",
      telescopeIds: ["seestar-s50"],
      builtIn: true,
    },
    {
      id: "filter-seestar-s50-duoband",
      name: "Duo-Band",
      family: "dual",
      telescopeIds: ["seestar-s50"],
      builtIn: true,
    },
    {
      id: "filter-seestar-s50-pro-uvir",
      name: "UV/IR-Cut",
      family: "broadband",
      telescopeIds: ["seestar-s50-pro"],
      builtIn: true,
    },
    {
      id: "filter-seestar-s50-pro-dualband",
      name: "Dual-Band",
      family: "dual",
      telescopeIds: ["seestar-s50-pro"],
      builtIn: true,
    },
  ].map((row) => Object.freeze(row)),
);

export const smartProfileIds = Object.freeze([
  "celestron-origin",
  "celestron-origin-mark-ii",
  "dwarf-3",
  "dwarf-draco",
  "dwarf-mini",
  "unistellar-equinox-2",
  "unistellar-evscope-2",
  "unistellar-odyssey",
  "unistellar-odyssey-pro",
  "vaonis-atlas",
  "vaonis-stellina",
  "vespera",
  "vespera-ii",
  "vespera-3",
  "vespera-pro",
  "vespera-pro-2",
  "seestar-s30",
  "seestar-s30-pro",
  "seestar-s50",
  "seestar-s50-pro",
]);
