/**
 * The platform organisation and the first « Matériel par défaut »
 * (migration 55 « default-equipment »).
 *
 * The default equipment is a list of `equipment` rows of scope `default`,
 * kept by the administration and proposed to every space. Its rows need an
 * owner (`equipment.tenant_id` is required): the platform organisation, an
 * `organizations` row that is nobody's space — no membership, no person, no
 * session — so that the list never mixes with the equipment of a space,
 * never leaves with a space that is deleted and never goes out in a space's
 * export. Wherever a space is looked for, this organisation is skipped
 * (`equipment-reader.js` `firstTenantId`, `spaceExists`).
 *
 * The rows below are a frozen copy of the common equipment profiles of the
 * core (`packages/planner/src/common-equipment-profiles.json`, and the
 * seven generic filters of `packages/planner/src/filters.js`) as they were
 * when the migration was written, each with the profile's own identifier,
 * so that a plan naming `seestar-s50` still resolves. A migration is history:
 * a later change of the profiles file does not rewrite it; the administration
 * edits the list from then on. The modifier `none` (« Aucun ») is the
 * absence of a modifier, not a piece of equipment, and is not copied; the
 * integrated cameras and the integrated mount of the connected telescopes
 * travel inside their telescope (`planner.integratedCamera`, `planner.mount`).
 */

/** The identifier of the platform organisation (other jobs skip it too). */
export const PLATFORM_ORGANIZATION_ID = "platform";

/** Older than any space, so that an ordering by age would meet it first. */
export const PLATFORM_ORGANIZATION_CREATED_AT = "2000-01-01T00:00:00.000Z";

const SEEDED_AT = "2026-10-07T00:00:00.000Z";

/**
 * `{ id, type, name, order, specifications, planner }` per row, in the order
 * each kind lists them (`order` is the row's `preference_order`).
 */
export const DEFAULT_EQUIPMENT_SEED = Object.freeze([
  {
    id: "seestar-s50",
    type: "telescope",
    name: "Seestar S50",
    order: 0,
    specifications: {
      apertureMm: 50,
      focalLengthMm: 250,
    },
    planner: {
      group: "connected",
      integratedCamera: {
        id: "seestar-s50-imx462",
        name: "IMX462",
        sensor: "Sony IMX462",
        sensorWidthMm: 3.13,
        sensorHeightMm: 5.57,
        pixelSizeUm: 2.9,
        calculated: ["sensorWidthMm", "sensorHeightMm"],
        calculation:
          "Portrait image 1080 × 1920 px × 2.9 µm. The pixel size is not on the Seestar pages: ZWO's ASI462 manual (same sensor, same maker).",
        makerPages: [
          {
            url: "https://us.seestar.com/products/seestar-s50",
            readOn: "2026-10-05",
          },
          {
            url: "https://www.seestar.com/blogs/faq/s50",
            readOn: "2026-10-05",
          },
          {
            url: "https://i.zwoastro.com/zwo-website/manuals/ASI462_Manual_EN_V1.1.pdf",
            readOn: "2026-10-05",
          },
        ],
      },
      mount: {
        id: "integrated-altaz",
        name: "Azimutale intégrée",
      },
      makerPages: [
        {
          url: "https://us.seestar.com/products/seestar-s50",
          readOn: "2026-10-05",
        },
        {
          url: "https://www.seestar.com/blogs/faq/s50",
          readOn: "2026-10-05",
        },
      ],
    },
  },
  {
    id: "seestar-s30",
    type: "telescope",
    name: "Seestar S30",
    order: 1,
    specifications: {
      apertureMm: 30,
      focalLengthMm: 150,
    },
    planner: {
      group: "connected",
      integratedCamera: {
        id: "seestar-s30-imx662",
        name: "IMX662",
        sensor: "Sony IMX662",
        sensorWidthMm: 3.13,
        sensorHeightMm: 5.57,
        pixelSizeUm: 2.9,
        calculated: ["sensorWidthMm", "sensorHeightMm"],
        calculation:
          "Portrait image 1080 × 1920 px × 2.9 µm. The pixel size is not on the Seestar pages: ZWO's ASI662MC page (same sensor, same maker).",
        makerPages: [
          {
            url: "https://us.seestar.com/products/seestar-s30-all-in-one-smart-telescope",
            readOn: "2026-10-05",
          },
          {
            url: "https://www.seestar.com/blogs/faq/s30",
            readOn: "2026-10-05",
          },
          {
            url: "https://www.zwoastro.com/product/asi662mc/",
            readOn: "2026-10-05",
          },
        ],
      },
      mount: {
        id: "integrated-altaz",
        name: "Azimutale intégrée",
      },
      makerPages: [
        {
          url: "https://us.seestar.com/products/seestar-s30-all-in-one-smart-telescope",
          readOn: "2026-10-05",
        },
        {
          url: "https://www.seestar.com/blogs/faq/s30",
          readOn: "2026-10-05",
        },
      ],
    },
  },
  {
    id: "dwarf-3",
    type: "telescope",
    name: "Dwarf 3",
    order: 2,
    specifications: {
      apertureMm: 35,
      focalLengthMm: 150,
    },
    planner: {
      group: "connected",
      integratedCamera: {
        id: "dwarf-3-imx678",
        name: "IMX678",
        sensor: "Sony IMX678",
        sensorWidthMm: 7.68,
        sensorHeightMm: 4.32,
        pixelSizeUm: 2,
        calculated: ["sensorWidthMm", "sensorHeightMm"],
        calculation: "Image 3840 × 2160 px × 2 µm.",
        makerPages: [
          {
            url: "https://help.dwarflab.com/en/docs/DWARF-3-Unboxing-and-Quick-Setup",
            readOn: "2026-10-05",
          },
          {
            url: "https://www.dwarflab.com/us/products/dwarf-3-smart-telescope",
            readOn: "2026-10-05",
          },
          {
            url: "https://dwarflab.com/pages/birding-with-dwarf-3-smart-telescope",
            readOn: "2026-10-05",
          },
        ],
      },
      mount: {
        id: "integrated-altaz",
        name: "Azimutale intégrée",
      },
      makerPages: [
        {
          url: "https://help.dwarflab.com/en/docs/DWARF-3-Unboxing-and-Quick-Setup",
          readOn: "2026-10-05",
        },
        {
          url: "https://www.dwarflab.com/us/products/dwarf-3-smart-telescope",
          readOn: "2026-10-05",
        },
      ],
    },
  },
  {
    id: "vespera-ii",
    type: "telescope",
    name: "Vespera II",
    order: 3,
    specifications: {
      apertureMm: 50,
      focalLengthMm: 250,
    },
    planner: {
      group: "connected",
      integratedCamera: {
        id: "vespera-ii-imx585",
        name: "IMX585",
        sensor: "Sony IMX585",
        sensorWidthMm: 11.2,
        sensorHeightMm: 6.3,
        pixelSizeUm: 2.9,
        makerPages: [
          {
            url: "https://vaonis.com/pages/product/vespera-ii",
            readOn: "2026-10-05",
          },
        ],
      },
      mount: {
        id: "integrated-altaz",
        name: "Azimutale intégrée",
      },
      makerPages: [
        {
          url: "https://vaonis.com/pages/product/vespera-ii",
          readOn: "2026-10-05",
        },
      ],
    },
  },
  {
    id: "celestron-origin",
    type: "telescope",
    name: "Celestron Origin",
    order: 4,
    specifications: {
      apertureMm: 152,
      focalLengthMm: 335,
    },
    planner: {
      group: "connected",
      integratedCamera: {
        id: "celestron-origin-imx178",
        name: "IMX178",
        sensor: "Sony IMX178LQJ",
        sensorWidthMm: 7.43,
        sensorHeightMm: 4.99,
        pixelSizeUm: 2.4,
        calculated: ["sensorWidthMm", "sensorHeightMm"],
        calculation: "Image 3096 × 2080 px × 2.4 µm (Celestron Origin #12099).",
        makerPages: [
          {
            url: "https://www.celestron.com/products/celestron-origin-intelligent-home-observatory-12099-old-version",
            readOn: "2026-10-05",
          },
        ],
      },
      mount: {
        id: "integrated-altaz",
        name: "Azimutale intégrée",
      },
      makerPages: [
        {
          url: "https://www.celestron.com/products/celestron-origin-intelligent-home-observatory-12099-old-version",
          readOn: "2026-10-05",
        },
        {
          url: "https://www.celestron.com/products/celestron-origin-intelligent-home-observatory",
          readOn: "2026-10-05",
        },
      ],
    },
  },
  {
    id: "william-optics-redcat-51",
    type: "telescope",
    name: "William Optics RedCat 51",
    order: 5,
    specifications: {
      apertureMm: 51,
      focalLengthMm: 250,
    },
    planner: {
      group: "refractors",
      makerPages: [
        {
          url: "https://williamoptics.com/products/redcat-51-ii",
          readOn: "2026-10-05",
        },
        {
          url: "https://williamoptics.com/products/cat-51",
          readOn: "2026-10-05",
        },
      ],
    },
  },
  {
    id: "skywatcher-evostar-72ed",
    type: "telescope",
    name: "Sky-Watcher Evostar 72 ED",
    order: 6,
    specifications: {
      apertureMm: 72,
      focalLengthMm: 420,
    },
    planner: {
      group: "refractors",
      makerPages: [
        {
          url: "http://skywatcher.com/product/evostar-72ed/",
          readOn: "2026-10-05",
        },
      ],
    },
  },
  {
    id: "askar-fra400",
    type: "telescope",
    name: "Askar FRA400",
    order: 7,
    specifications: {
      apertureMm: 72,
      focalLengthMm: 400,
    },
    planner: {
      group: "refractors",
      makerPages: [
        {
          url: "https://www.sharpstar-optics.com/Products_1/34.html",
          readOn: "2026-10-05",
        },
      ],
    },
  },
  {
    id: "skywatcher-evostar-80ed",
    type: "telescope",
    name: "Sky-Watcher Evostar 80 ED",
    order: 8,
    specifications: {
      apertureMm: 80,
      focalLengthMm: 600,
    },
    planner: {
      group: "refractors",
      makerPages: [
        {
          url: "https://www.skywatcher.com/product/bk-80ed-otaw/",
          readOn: "2026-10-05",
        },
      ],
    },
  },
  {
    id: "skywatcher-newton-150-750",
    type: "telescope",
    name: "Sky-Watcher Newton 150/750",
    order: 9,
    specifications: {
      apertureMm: 150,
      focalLengthMm: 750,
    },
    planner: {
      group: "reflectors",
      makerPages: [
        {
          url: "http://skywatcher.com/product/bkp-150-ds/",
          readOn: "2026-10-05",
        },
      ],
    },
  },
  {
    id: "skywatcher-dobson-200-1200",
    type: "telescope",
    name: "Sky-Watcher Dobson 200/1200",
    order: 10,
    specifications: {
      apertureMm: 203,
      focalLengthMm: 1200,
    },
    planner: {
      group: "reflectors",
      makerPages: [
        {
          url: "https://skywatcher.com/product/dob-8-traditional/",
          readOn: "2026-10-05",
        },
      ],
    },
  },
  {
    id: "celestron-c8",
    type: "telescope",
    name: "Celestron C8",
    order: 11,
    specifications: {
      apertureMm: 203.2,
      focalLengthMm: 2032,
    },
    planner: {
      group: "reflectors",
      makerPages: [
        {
          url: "https://www.celestron.com/products/c8-optical-tube-assembly-cg-5-dovetail",
          readOn: "2026-10-05",
        },
      ],
    },
  },
  {
    id: "zwo-asi585mc-pro",
    type: "camera",
    name: "ZWO ASI585MC Pro",
    order: 0,
    specifications: {
      sensorWidthMm: 11.2,
      sensorHeightMm: 6.3,
      pixelSizeUm: 2.9,
    },
    planner: {
      sensor: "Sony IMX585",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/asi585mc-mm-pro/",
          readOn: "2026-10-05",
        },
      ],
    },
  },
  {
    id: "zwo-asi2600mc-pro",
    type: "camera",
    name: "ZWO ASI2600MC Pro",
    order: 1,
    specifications: {
      sensorWidthMm: 23.5,
      sensorHeightMm: 15.7,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony IMX571",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/new-asi2600mm-mc-pro/",
          readOn: "2026-10-05",
        },
      ],
    },
  },
  {
    id: "zwo-asi294mc-pro",
    type: "camera",
    name: "ZWO ASI294MC Pro",
    order: 2,
    specifications: {
      sensorWidthMm: 19.1,
      sensorHeightMm: 13,
      pixelSizeUm: 4.63,
    },
    planner: {
      sensor: "Sony IMX294",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/asi294/",
          readOn: "2026-10-05",
        },
      ],
    },
  },
  {
    id: "zwo-asi183mm-pro",
    type: "camera",
    name: "ZWO ASI183MM Pro",
    order: 3,
    specifications: {
      sensorWidthMm: 13.2,
      sensorHeightMm: 8.8,
      pixelSizeUm: 2.4,
    },
    planner: {
      sensor: "Sony IMX183",
      sensorKind: "mono",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/asi183/",
          readOn: "2026-10-05",
        },
      ],
    },
  },
  {
    id: "qhyccd-qhy268c",
    type: "camera",
    name: "QHYCCD QHY268C",
    order: 4,
    specifications: {
      sensorWidthMm: 23.51,
      sensorHeightMm: 15.7,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony IMX571",
      sensorKind: "colour",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Effective image 6252 × 4176 px × 3.76 µm (the maker gives « APS-C » without millimetres).",
      makerPages: [
        {
          url: "https://www.qhyccd.com/astronomical-camera-qhy268/",
          readOn: "2026-10-05",
        },
      ],
    },
  },
  {
    id: "player-one-poseidon-c-pro",
    type: "camera",
    name: "Player One Poseidon-C Pro",
    order: 5,
    specifications: {
      sensorWidthMm: 23.5,
      sensorHeightMm: 15.7,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony IMX571",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://player-one-astronomy.com/product/poseidon-c-pro-imx571-usb3-0-color-cooled-camera/",
          readOn: "2026-10-05",
        },
      ],
    },
  },
  {
    id: "celestron-zoom-8-24",
    type: "eyepiece",
    name: "Celestron Zoom 8–24 mm",
    order: 0,
    specifications: {
      focalLengthMm: 24,
      minFocalLengthMm: 8,
      maxFocalLengthMm: 24,
      apparentFieldDegrees: 40,
      minApparentFieldDegrees: 40,
      maxApparentFieldDegrees: 60,
    },
    planner: {
      makerPages: [
        {
          url: "https://www.celestron.com/products/8-24mm-zoom-eyepiece-125in",
          readOn: "2026-10-05",
        },
      ],
    },
  },
  {
    id: "plossl-25",
    type: "eyepiece",
    name: "Plössl 25 mm",
    order: 1,
    specifications: {
      focalLengthMm: 25,
      apparentFieldDegrees: 52,
    },
    planner: {
      makerPages: [
        {
          url: "http://skywatcher.com/product/super-pl-10mm/",
          readOn: "2026-10-05",
        },
      ],
    },
  },
  {
    id: "plossl-10",
    type: "eyepiece",
    name: "Plössl 10 mm",
    order: 2,
    specifications: {
      focalLengthMm: 10,
      apparentFieldDegrees: 52,
    },
    planner: {
      makerPages: [
        {
          url: "http://skywatcher.com/product/super-pl-10mm/",
          readOn: "2026-10-05",
        },
      ],
    },
  },
  {
    id: "reducer",
    type: "lens",
    name: "Réducteur 0,8×",
    order: 0,
    specifications: {
      multiplier: 0.8,
    },
    planner: {},
  },
  {
    id: "barlow",
    type: "lens",
    name: "Barlow 2×",
    order: 1,
    specifications: {
      multiplier: 2,
    },
    planner: {},
  },
  {
    id: "integrated-altaz",
    type: "mount",
    name: "Azimutale intégrée",
    order: 0,
    specifications: {},
    planner: {},
  },
  {
    id: "filter-broadband",
    type: "filter",
    name: "UV/IR-cut · RGB",
    order: 0,
    specifications: {},
    planner: {
      family: "broadband",
    },
  },
  {
    id: "filter-dual",
    type: "filter",
    name: "Duo-band",
    order: 1,
    specifications: {},
    planner: {
      family: "dual",
    },
  },
  {
    id: "filter-ha",
    type: "filter",
    name: "Hα",
    order: 2,
    specifications: {},
    planner: {
      family: "ha",
    },
  },
  {
    id: "filter-oiii",
    type: "filter",
    name: "O III",
    order: 3,
    specifications: {},
    planner: {
      family: "oiii",
    },
  },
  {
    id: "filter-sii",
    type: "filter",
    name: "S II",
    order: 4,
    specifications: {},
    planner: {
      family: "sii",
    },
  },
  {
    id: "filter-uhc",
    type: "filter",
    name: "UHC",
    order: 5,
    specifications: {},
    planner: {
      family: "uhc",
    },
  },
  {
    id: "filter-hb",
    type: "filter",
    name: "Hβ",
    order: 6,
    specifications: {},
    planner: {
      family: "hb",
    },
  },
]);

const literal = (value) =>
  value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;

/**
 * The statements of migration 55: the platform organisation, then every
 * default row; both idempotent (`ON CONFLICT DO NOTHING`, SQLite and
 * PostgreSQL alike), so that an identifier already taken is never
 * overwritten.
 */
export function defaultEquipmentSeedSql() {
  const lines = [
    `INSERT INTO organizations (id, name, created_at) VALUES (${literal(PLATFORM_ORGANIZATION_ID)}, ${literal("Astro Portal — matériel par défaut")}, ${literal(PLATFORM_ORGANIZATION_CREATED_AT)}) ON CONFLICT DO NOTHING;`,
  ];
  for (const row of DEFAULT_EQUIPMENT_SEED)
    lines.push(
      `INSERT INTO equipment (id, tenant_id, equipment_type, name, specifications_json, planner_json, created_at, updated_at, preference_order, scope) VALUES (${[
        row.id,
        PLATFORM_ORGANIZATION_ID,
        row.type,
        row.name,
        JSON.stringify(row.specifications),
        JSON.stringify(row.planner),
        SEEDED_AT,
        SEEDED_AT,
      ]
        .map(literal)
        .join(", ")}, ${Number(row.order)}, 'default') ON CONFLICT DO NOTHING;`,
    );
  return lines.join("\n");
}
