/**
 * The fourth catalogue of the « Matériel par défaut » (migration 131
 * `equipment-catalogue-4`): the telescopes
 * (Sky Rover, ZWO, Takahashi, Explore Scientific), the astronomy cameras
 * (Player One, QHYCCD, ZWO, Svbony, Altair), the eyepieces (Sky Rover,
 * Explore Scientific), the Barlows and focal reducers (Sky Rover, ZWO), the
 * mounts and the filters (Optolong, Astronomik, ZWO, ToupTek) that the first
 * catalogues lacked, as `equipment` rows of scope `default` held by the
 * platform organisation, each with the profile's own identifier and its
 * `preference_order` continuing the last value of its kind. The rows are a
 * frozen copy of `packages/planner/src/common-equipment-profiles.json` as it
 * was when the migration was written: a migration is history, a later change
 * of that file does not rewrite it. `ON CONFLICT DO NOTHING`: a row the
 * administration already holds under the same identifier, edited, hidden or
 * archived, is never rewritten. Every value carries the pages it was read on;
 * a value that is not the maker's says so in its `calculation`. A mount row
 * carries its `kind` (`altaz`, `equatorial`, `hybrid`, `tracker`), a filter
 * row its `family` and `forAllEquipment: false` (a maker's product, not a
 * generic proposal). The maker and the kind travel in the row itself.
 */

import { PLATFORM_ORGANIZATION_ID } from "./default-equipment-seed.js";

const SEEDED_AT = "2026-11-05T00:00:00.000Z";

/** `{ id, type, name, order, specifications, planner }`, as migration 55's. */
export const EQUIPMENT_CATALOGUE_4_SEED = Object.freeze([
  {
    id: "explore-scientific-firstlight-80-f8",
    type: "telescope",
    name: "Explore Scientific FirstLight 80 f/8",
    order: 272,
    specifications: { apertureMm: 80, focalLengthMm: 640 },
    planner: {
      group: "refractors",
      maker: "Explore Scientific",
      kind: "refractor",
      makerPages: [
        {
          url: "https://explorescientific.com/products/firstlight-80mm-f-8-refractor-and-sidara-nano-alt-az-mount",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-56-sap-f4-8",
    type: "telescope",
    name: "Sky Rover 56 SAP F/4.8 Petzval",
    order: 273,
    specifications: { apertureMm: 56, focalLengthMm: 268.8 },
    planner: {
      group: "refractors",
      maker: "Sky Rover",
      kind: "refractor",
      calculated: ["focalLengthMm"],
      calculation:
        "Focal length 56 mm x f/4.8 = 268.8 mm (the maker's page gives the 56 mm aperture and the f/4.8 ratio in the product name).",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/56sap-f-4-8-full-frame-specialist-astrograph-petzval-telescope",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-60-gpa-f6",
    type: "telescope",
    name: "Sky Rover 60 GPA F/6",
    order: 274,
    specifications: { apertureMm: 60, focalLengthMm: 360 },
    planner: {
      group: "refractors",
      maker: "Sky Rover",
      kind: "refractor",
      calculated: ["focalLengthMm"],
      calculation:
        "Focal length 60 mm x f/6 = 360 mm (the maker's page gives the 60 mm aperture and the f/6 ratio in the product name).",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/sky-rover-60mm-f-6-gpa-telescope",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-60-super-astrograph-f5",
    type: "telescope",
    name: "Sky Rover 60 Super Astrograph F/5",
    order: 275,
    specifications: { apertureMm: 60, focalLengthMm: 300 },
    planner: {
      group: "refractors",
      maker: "Sky Rover",
      kind: "refractor",
      calculated: ["focalLengthMm"],
      calculation:
        "Focal length 60 mm x f/5 = 300 mm (the maker's page gives the 60 mm aperture and the f/5 ratio in the product name).",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/60mm-f-5-super-astrograph-scope",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-68-saw-f3-9",
    type: "telescope",
    name: "Sky Rover 68 SAW F/3.9",
    order: 276,
    specifications: { apertureMm: 68, focalLengthMm: 265.2 },
    planner: {
      group: "refractors",
      maker: "Sky Rover",
      kind: "refractor",
      calculated: ["focalLengthMm"],
      calculation:
        "Focal length 68 mm x f/3.9 = 265.2 mm (the maker's page gives the 68 mm aperture and the f/3.9 ratio in the product name).",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/68-saw-f-3-9-specialist-astrograph-widefield-telescope",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-70-gps-f6",
    type: "telescope",
    name: "Sky Rover 70 GPS F/6",
    order: 277,
    specifications: { apertureMm: 70, focalLengthMm: 420 },
    planner: {
      group: "refractors",
      maker: "Sky Rover",
      kind: "refractor",
      calculated: ["focalLengthMm"],
      calculation:
        "Focal length 70 mm x f/6 = 420 mm (the maker's page gives the 70 mm aperture and the f/6 ratio in the product name).",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/sky-rover-70-apo-pro-f-6-telescope",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-70-super-astrograph-v4-f5",
    type: "telescope",
    name: "Sky Rover 70 Super Astrograph V4 F/5",
    order: 278,
    specifications: { apertureMm: 70, focalLengthMm: 350 },
    planner: {
      group: "refractors",
      maker: "Sky Rover",
      kind: "refractor",
      calculated: ["focalLengthMm"],
      calculation:
        "Focal length 70 mm x f/5 = 350 mm (the maker's page gives the 70 mm aperture and the f/5 ratio in the product name).",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/70mm-f-5-super-astrograph-v4-telescope",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-72-gpa-f6",
    type: "telescope",
    name: "Sky Rover 72 GPA F/6",
    order: 279,
    specifications: { apertureMm: 72, focalLengthMm: 432 },
    planner: {
      group: "refractors",
      maker: "Sky Rover",
      kind: "refractor",
      calculated: ["focalLengthMm"],
      calculation:
        "Focal length 72 mm x f/6 = 432 mm (the maker's page gives the 72 mm aperture and the f/6 ratio in the product name).",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/sky-rover-72mm-f-6-gpa-telescope",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-76-sap-f4-8",
    type: "telescope",
    name: "Sky Rover 76 SAP F/4.8 Petzval",
    order: 280,
    specifications: { apertureMm: 76, focalLengthMm: 364.8 },
    planner: {
      group: "refractors",
      maker: "Sky Rover",
      kind: "refractor",
      calculated: ["focalLengthMm"],
      calculation:
        "Focal length 76 mm x f/4.8 = 364.8 mm (the maker's page gives the 76 mm aperture and the f/4.8 ratio in the product name).",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/76sap-f-4-8-full-frame-specialist-astrograph-petzval-telescope",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-80-gpa-f7",
    type: "telescope",
    name: "Sky Rover 80 GPA F/7",
    order: 281,
    specifications: { apertureMm: 80, focalLengthMm: 560 },
    planner: {
      group: "refractors",
      maker: "Sky Rover",
      kind: "refractor",
      calculated: ["focalLengthMm"],
      calculation:
        "Focal length 80 mm x f/7 = 560 mm (the maker's page gives the 80 mm aperture and the f/7 ratio in the product name).",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/80mm-f-7-gpa-telescope",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-80-gps-f6",
    type: "telescope",
    name: "Sky Rover 80 GPS F/6",
    order: 282,
    specifications: { apertureMm: 80, focalLengthMm: 480 },
    planner: {
      group: "refractors",
      maker: "Sky Rover",
      kind: "refractor",
      calculated: ["focalLengthMm"],
      calculation:
        "Focal length 80 mm x f/6 = 480 mm (the maker's page gives the 80 mm aperture and the f/6 ratio in the product name).",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/80-apo-pro-f-6-telescope",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-90-gps-f6",
    type: "telescope",
    name: "Sky Rover 90 GPS F/6",
    order: 283,
    specifications: { apertureMm: 90, focalLengthMm: 540 },
    planner: {
      group: "refractors",
      maker: "Sky Rover",
      kind: "refractor",
      calculated: ["focalLengthMm"],
      calculation:
        "Focal length 90 mm x f/6 = 540 mm (the maker's page gives the 90 mm aperture and the f/6 ratio in the product name).",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/90-mm-f-6-gps-telescope",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-90-sap-f5",
    type: "telescope",
    name: "Sky Rover 90 SAP F/5 Petzval",
    order: 284,
    specifications: { apertureMm: 90, focalLengthMm: 450 },
    planner: {
      group: "refractors",
      maker: "Sky Rover",
      kind: "refractor",
      calculated: ["focalLengthMm"],
      calculation:
        "Focal length 90 mm x f/5 = 450 mm (the maker's page gives the 90 mm aperture and the f/5 ratio in the product name).",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/90-sap-f-5-medium-format-specialist-astrograph-petzval-telescope",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-102-gpa-f7",
    type: "telescope",
    name: "Sky Rover 102 GPA F/7",
    order: 285,
    specifications: { apertureMm: 102, focalLengthMm: 714 },
    planner: {
      group: "refractors",
      maker: "Sky Rover",
      kind: "refractor",
      calculated: ["focalLengthMm"],
      calculation:
        "Focal length 102 mm x f/7 = 714 mm (the maker's page gives the 102 mm aperture and the f/7 ratio in the product name).",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/102mm-f-7-gpa-telescope",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-102-gps-f7",
    type: "telescope",
    name: "Sky Rover 102 GPS F/7",
    order: 286,
    specifications: { apertureMm: 102, focalLengthMm: 714 },
    planner: {
      group: "refractors",
      maker: "Sky Rover",
      kind: "refractor",
      calculated: ["focalLengthMm"],
      calculation:
        "Focal length 102 mm x f/7 = 714 mm (the maker's page gives the 102 mm aperture and the f/7 ratio in the product name).",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/102-mm-f-7-gps-telescope",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-108-sap-f4-8",
    type: "telescope",
    name: "Sky Rover 108 SAP F/4.8 Petzval",
    order: 287,
    specifications: { apertureMm: 108, focalLengthMm: 518.4 },
    planner: {
      group: "refractors",
      maker: "Sky Rover",
      kind: "refractor",
      calculated: ["focalLengthMm"],
      calculation:
        "Focal length 108 mm x f/4.8 = 518.4 mm (the maker's page gives the 108 mm aperture and the f/4.8 ratio in the product name).",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/108sap-f-4-8-medium-format-specialist-astrograph-petzval-telescope",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-110-saw-f4-8",
    type: "telescope",
    name: "Sky Rover 110 SAW F/4.8",
    order: 288,
    specifications: { apertureMm: 110, focalLengthMm: 528 },
    planner: {
      group: "refractors",
      maker: "Sky Rover",
      kind: "refractor",
      calculated: ["focalLengthMm"],
      calculation:
        "Focal length 110 mm x f/4.8 = 528 mm (the maker's page gives the 110 mm aperture and the f/4.8 ratio in the product name).",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/110-saw-f-4-8-specialist-astrograph-widefield-telescope",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-125-gpa-f7-8",
    type: "telescope",
    name: "Sky Rover 125 GPA F/7.8",
    order: 289,
    specifications: { apertureMm: 125, focalLengthMm: 975 },
    planner: {
      group: "refractors",
      maker: "Sky Rover",
      kind: "refractor",
      calculated: ["focalLengthMm"],
      calculation:
        "Focal length 125 mm x f/7.8 = 975 mm (the maker's page gives the 125 mm aperture and the f/7.8 ratio in the product name).",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/125mm-f-7-8-gpa-telescope",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-130-gps-f7",
    type: "telescope",
    name: "Sky Rover 130 GPS F/7",
    order: 290,
    specifications: { apertureMm: 130, focalLengthMm: 910 },
    planner: {
      group: "refractors",
      maker: "Sky Rover",
      kind: "refractor",
      calculated: ["focalLengthMm"],
      calculation:
        "Focal length 130 mm x f/7 = 910 mm (the maker's page gives the 130 mm aperture and the f/7 ratio in the product name).",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/130-mm-f-7-gps-telescope",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-130-sap-f5",
    type: "telescope",
    name: "Sky Rover 130 SAP F/5 Petzval",
    order: 291,
    specifications: { apertureMm: 130, focalLengthMm: 650 },
    planner: {
      group: "refractors",
      maker: "Sky Rover",
      kind: "refractor",
      calculated: ["focalLengthMm"],
      calculation:
        "Focal length 130 mm x f/5 = 650 mm (the maker's page gives the 130 mm aperture and the f/5 ratio in the product name).",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/130-sap-f-5-medium-format-specialist-astrograph-petzval-telescope",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-150-gpa-f8",
    type: "telescope",
    name: "Sky Rover 150 GPA F/8",
    order: 292,
    specifications: { apertureMm: 150, focalLengthMm: 1200 },
    planner: {
      group: "refractors",
      maker: "Sky Rover",
      kind: "refractor",
      calculated: ["focalLengthMm"],
      calculation:
        "Focal length 150 mm x f/8 = 1200 mm (the maker's page gives the 150 mm aperture and the f/8 ratio in the product name).",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/150mm-f-8-gpa-telescope",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-155-gps-f8",
    type: "telescope",
    name: "Sky Rover 155 GPS F/8",
    order: 293,
    specifications: { apertureMm: 155, focalLengthMm: 1240 },
    planner: {
      group: "refractors",
      maker: "Sky Rover",
      kind: "refractor",
      calculated: ["focalLengthMm"],
      calculation:
        "Focal length 155 mm x f/8 = 1240 mm (the maker's page gives the 155 mm aperture and the f/8 ratio in the product name).",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/155mm-f-8-gps-telescope",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "takahashi-fct-114df",
    type: "telescope",
    name: "Takahashi FCT-114DF",
    order: 294,
    specifications: { apertureMm: 114, focalLengthMm: 800 },
    planner: {
      group: "refractors",
      maker: "Takahashi",
      kind: "refractor",
      makerPages: [
        {
          url: "https://takahashijapan.jp/products/telescope/fct/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "takahashi-fct-114ds",
    type: "telescope",
    name: "Takahashi FCT-114DS",
    order: 295,
    specifications: { apertureMm: 114, focalLengthMm: 800 },
    planner: {
      group: "refractors",
      maker: "Takahashi",
      kind: "refractor",
      makerPages: [
        {
          url: "https://takahashijapan.jp/products/telescope/fct/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "takahashi-fsq-80fc",
    type: "telescope",
    name: "Takahashi FSQ-80FC",
    order: 296,
    specifications: { apertureMm: 80, focalLengthMm: 450 },
    planner: {
      group: "refractors",
      maker: "Takahashi",
      kind: "refractor",
      makerPages: [
        {
          url: "https://takahashijapan.jp/products/telescope/fsq/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "zwo-ff70-apo",
    type: "telescope",
    name: "ZWO FF70 APO",
    order: 297,
    specifications: { apertureMm: 70, focalLengthMm: 490 },
    planner: {
      group: "refractors",
      maker: "ZWO",
      kind: "refractor",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/ff70-apo-flat-field-apochromatic-refractor/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "zwo-ff90-apo",
    type: "telescope",
    name: "ZWO FF90 APO",
    order: 298,
    specifications: { apertureMm: 90, focalLengthMm: 609 },
    planner: {
      group: "refractors",
      maker: "ZWO",
      kind: "refractor",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/ff90-apo-flat-field-apochromatic-refractor/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "zwo-ff110-apo",
    type: "telescope",
    name: "ZWO FF110 APO",
    order: 299,
    specifications: { apertureMm: 110, focalLengthMm: 766 },
    planner: {
      group: "refractors",
      maker: "ZWO",
      kind: "refractor",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/ff110-apo-flat-field-apochromatic-refractor/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "zwo-ff131-apo",
    type: "telescope",
    name: "ZWO FF131 APO",
    order: 300,
    specifications: { apertureMm: 131, focalLengthMm: 983 },
    planner: {
      group: "refractors",
      maker: "ZWO",
      kind: "refractor",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/ff131-apo-flat-field-apochromatic-refractor/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "player-one-xena-585m",
    type: "camera",
    name: "Player One Xena 585M",
    order: 102,
    specifications: {
      sensorWidthMm: 11.18,
      sensorHeightMm: 6.32,
      pixelSizeUm: 2.9,
    },
    planner: {
      sensor: "Sony IMX585",
      sensorKind: "mono",
      maker: "Player One",
      kind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 3856 × 2180 px × 2.9 µm (Player One page: max resolution and pixel size).",
      makerPages: [
        {
          url: "https://player-one-astronomy.com/product/xena-585m-usb3-0-mono-camera-imx585/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "player-one-mars-662m",
    type: "camera",
    name: "Player One Mars 662M",
    order: 103,
    specifications: {
      sensorWidthMm: 5.61,
      sensorHeightMm: 3.19,
      pixelSizeUm: 2.9,
    },
    planner: {
      sensor: "Sony IMX662",
      sensorKind: "mono",
      maker: "Player One",
      kind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 1936 × 1100 px × 2.9 µm (Player One page: max resolution and pixel size).",
      makerPages: [
        {
          url: "https://player-one-astronomy.com/product/mars-662m-usb3-0-mono-camera-imx662/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "player-one-apollo-428m-max",
    type: "camera",
    name: "Player One Apollo 428M MAX",
    order: 104,
    specifications: {
      sensorWidthMm: 14.47,
      sensorHeightMm: 9.94,
      pixelSizeUm: 4.5,
    },
    planner: {
      sensor: "Sony IMX428",
      sensorKind: "mono",
      maker: "Player One",
      kind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 3216 × 2208 px × 4.5 µm (Player One page: max resolution and pixel size).",
      makerPages: [
        {
          url: "https://player-one-astronomy.com/product/apollo-428m-max-usb3-0-mono-camera-imx428/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "player-one-apollo-428m-max-pro",
    type: "camera",
    name: "Player One Apollo 428M MAX Pro",
    order: 105,
    specifications: {
      sensorWidthMm: 14.47,
      sensorHeightMm: 9.94,
      pixelSizeUm: 4.5,
    },
    planner: {
      sensor: "Sony IMX428",
      sensorKind: "mono",
      maker: "Player One",
      kind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 3216 × 2208 px × 4.5 µm (Player One page: max resolution and pixel size).",
      makerPages: [
        {
          url: "https://player-one-astronomy.com/product/apollo-428m-max-pro-usb3-0-mono-cooled-camera-imx428/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "player-one-ceres-462m",
    type: "camera",
    name: "Player One Ceres 462M",
    order: 106,
    specifications: {
      sensorWidthMm: 5.64,
      sensorHeightMm: 3.18,
      pixelSizeUm: 2.9,
    },
    planner: {
      sensor: "Sony IMX462",
      sensorKind: "mono",
      maker: "Player One",
      kind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 1944 × 1096 px × 2.9 µm (Player One page: max resolution and pixel size).",
      makerPages: [
        {
          url: "https://player-one-astronomy.com/product/ceres-462m-usb3-0-mono-camera-imx462/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "player-one-zeus-455m-pro",
    type: "camera",
    name: "Player One ZEUS 455M PRO",
    order: 107,
    specifications: {
      sensorWidthMm: 36.01,
      sensorHeightMm: 24.02,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony IMX455AQK-K",
      sensorKind: "mono",
      maker: "Player One",
      kind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 9576 × 6388 px × 3.76 µm (Player One page: max resolution and pixel size).",
      makerPages: [
        {
          url: "https://player-one-astronomy.com/product/zeus-455m-pro-imx455-usb3-0-mono-cooled-camera/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "player-one-apollo-m-max-pro",
    type: "camera",
    name: "Player One Apollo-M MAX Pro",
    order: 108,
    specifications: {
      sensorWidthMm: 14.47,
      sensorHeightMm: 9.94,
      pixelSizeUm: 9,
    },
    planner: {
      sensor: "Sony IMX432",
      sensorKind: "mono",
      maker: "Player One",
      kind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 1608 × 1104 px × 9 µm (Player One page: max resolution and pixel size).",
      makerPages: [
        {
          url: "https://player-one-astronomy.com/product/apollo-m-max-pro-usb3-0-mono-camera-imx432/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "player-one-mars-m-ii",
    type: "camera",
    name: "Player One Mars-M II",
    order: 109,
    specifications: {
      sensorWidthMm: 5.64,
      sensorHeightMm: 3.18,
      pixelSizeUm: 2.9,
    },
    planner: {
      sensor: "Sony IMX462",
      sensorKind: "mono",
      maker: "Player One",
      kind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 1944 × 1096 px × 2.9 µm (Player One page: max resolution and pixel size).",
      makerPages: [
        {
          url: "https://player-one-astronomy.com/product/mars-m-ii-usb3-0-mono-camera-imx462/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "player-one-ares-m-pro",
    type: "camera",
    name: "Player One Ares-M Pro",
    order: 110,
    specifications: {
      sensorWidthMm: 11.31,
      sensorHeightMm: 11.31,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony IMX533",
      sensorKind: "mono",
      maker: "Player One",
      kind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 3008 × 3008 px × 3.76 µm (Player One page: max resolution and pixel size).",
      makerPages: [
        {
          url: "https://player-one-astronomy.com/product/ares-m-pro-usb3-0-mono-camera-imx533/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "player-one-saturn-m-sqr",
    type: "camera",
    name: "Player One Saturn-M SQR",
    order: 111,
    specifications: {
      sensorWidthMm: 11.31,
      sensorHeightMm: 11.31,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony IMX533",
      sensorKind: "mono",
      maker: "Player One",
      kind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 3008 × 3008 px × 3.76 µm (Player One page: max resolution and pixel size).",
      makerPages: [
        {
          url: "https://player-one-astronomy.com/product/saturn-m-sqr-usb3-0-mono-camera-imx533/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "player-one-saturn-c-sqr",
    type: "camera",
    name: "Player One Saturn-C SQR",
    order: 112,
    specifications: {
      sensorWidthMm: 11.31,
      sensorHeightMm: 11.31,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony IMX533",
      sensorKind: "colour",
      maker: "Player One",
      kind: "colour",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 3008 × 3008 px × 3.76 µm (Player One page: max resolution and pixel size).",
      makerPages: [
        {
          url: "https://player-one-astronomy.com/product/saturn-c-sqr-usb3-0-color-camera-imx533/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "player-one-apollo-c",
    type: "camera",
    name: "Player One Apollo-C",
    order: 113,
    specifications: {
      sensorWidthMm: 11.34,
      sensorHeightMm: 7.13,
      pixelSizeUm: 5.86,
    },
    planner: {
      sensor: "Sony IMX174",
      sensorKind: "colour",
      maker: "Player One",
      kind: "colour",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 1936 × 1216 px × 5.86 µm (Player One page: max resolution and pixel size).",
      makerPages: [
        {
          url: "https://player-one-astronomy.com/product/apollo-c-usb3-0-color-camera-imx174/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "player-one-apollo-m",
    type: "camera",
    name: "Player One Apollo-M",
    order: 114,
    specifications: {
      sensorWidthMm: 11.34,
      sensorHeightMm: 7.13,
      pixelSizeUm: 5.86,
    },
    planner: {
      sensor: "Sony IMX174",
      sensorKind: "mono",
      maker: "Player One",
      kind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 1936 × 1216 px × 5.86 µm (Player One page: max resolution and pixel size).",
      makerPages: [
        {
          url: "https://player-one-astronomy.com/product/apollo-m-imx174/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "player-one-apollo-m-mini",
    type: "camera",
    name: "Player One Apollo-M MINI",
    order: 115,
    specifications: {
      sensorWidthMm: 8.75,
      sensorHeightMm: 6.62,
      pixelSizeUm: 4.5,
    },
    planner: {
      sensor: "Sony IMX429",
      sensorKind: "mono",
      maker: "Player One",
      kind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 1944 × 1472 px × 4.5 µm (Player One page: max resolution and pixel size).",
      makerPages: [
        {
          url: "https://player-one-astronomy.com/product/apollo-m-mini-imx429/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "player-one-apollo-m-max",
    type: "camera",
    name: "Player One Apollo-M MAX",
    order: 116,
    specifications: {
      sensorWidthMm: 14.47,
      sensorHeightMm: 9.94,
      pixelSizeUm: 9,
    },
    planner: {
      sensor: "Sony IMX432",
      sensorKind: "mono",
      maker: "Player One",
      kind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 1608 × 1104 px × 9 µm (Player One page: max resolution and pixel size).",
      makerPages: [
        {
          url: "https://player-one-astronomy.com/product/apollo-m-max-imx432/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "player-one-ceres-c",
    type: "camera",
    name: "Player One Ceres-C",
    order: 117,
    specifications: {
      sensorWidthMm: 4.89,
      sensorHeightMm: 3.66,
      pixelSizeUm: 3.75,
    },
    planner: {
      sensor: "Sony IMX224/225",
      sensorKind: "colour",
      maker: "Player One",
      kind: "colour",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 1304 × 976 px × 3.75 µm (Player One page: max resolution and pixel size).",
      makerPages: [
        {
          url: "https://player-one-astronomy.com/product/ceres-c-usb3-0-color-camera-imx224/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "player-one-ceres-m",
    type: "camera",
    name: "Player One Ceres-M",
    order: 118,
    specifications: {
      sensorWidthMm: 4.82,
      sensorHeightMm: 3.62,
      pixelSizeUm: 3.75,
    },
    planner: {
      sensor: "Aptina AR0130",
      sensorKind: "mono",
      maker: "Player One",
      kind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 1284 × 964 px × 3.75 µm (Player One page: max resolution and pixel size).",
      makerPages: [
        {
          url: "https://player-one-astronomy.com/product/ceres-m-usb3-0-mono-camera-ar0130/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "player-one-sedna-m",
    type: "camera",
    name: "Player One Sedna-M",
    order: 119,
    specifications: {
      sensorWidthMm: 7.43,
      sensorHeightMm: 4.99,
      pixelSizeUm: 2.4,
    },
    planner: {
      sensor: "Sony IMX178",
      sensorKind: "mono",
      maker: "Player One",
      kind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 3096 × 2078 px × 2.4 µm (Player One page: max resolution and pixel size).",
      makerPages: [
        {
          url: "https://player-one-astronomy.com/product/sedna-m-usb3-0-mono-camera-imx178/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "player-one-mars-m",
    type: "camera",
    name: "Player One Mars-M",
    order: 120,
    specifications: {
      sensorWidthMm: 5.64,
      sensorHeightMm: 3.18,
      pixelSizeUm: 2.9,
    },
    planner: {
      sensor: "Sony IMX290",
      sensorKind: "mono",
      maker: "Player One",
      kind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 1944 × 1096 px × 2.9 µm (Player One page: max resolution and pixel size).",
      makerPages: [
        {
          url: "https://player-one-astronomy.com/product/mars-mono-camera/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "qhyccd-qhy5iii174m",
    type: "camera",
    name: "QHYCCD QHY5III174M",
    order: 121,
    specifications: {
      sensorWidthMm: 11.25,
      sensorHeightMm: 7.03,
      pixelSizeUm: 5.86,
    },
    planner: {
      sensor: "Sony IMX174",
      sensorKind: "mono",
      maker: "QHYCCD",
      kind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 1920 × 1200 px × 5.86 µm (QHYCCD page: effective pixel area and pixel size).",
      makerPages: [
        {
          url: "https://www.qhyccd.com/planetary-camera-qhy5iii174/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "qhyccd-qhy5iii485c",
    type: "camera",
    name: "QHYCCD QHY5III485C",
    order: 122,
    specifications: {
      sensorWidthMm: 11.21,
      sensorHeightMm: 6.32,
      pixelSizeUm: 2.9,
    },
    planner: {
      sensor: "Sony IMX485",
      sensorKind: "colour",
      maker: "QHYCCD",
      kind: "colour",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 3864 × 2180 px × 2.9 µm (QHYCCD page: effective pixel area and pixel size).",
      makerPages: [
        {
          url: "https://www.qhyccd.com/planetary-camera-qhy5iii485c/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "qhyccd-qhy5iii200m",
    type: "camera",
    name: "QHYCCD QHY5III200M",
    order: 123,
    specifications: {
      sensorWidthMm: 7.68,
      sensorHeightMm: 4.32,
      pixelSizeUm: 4,
    },
    planner: {
      sensor: "SC2210",
      sensorKind: "mono",
      maker: "QHYCCD",
      kind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 1920 × 1080 px × 4 µm (QHYCCD page: effective pixel area and pixel size).",
      makerPages: [
        { url: "https://www.qhyccd.com/qhy5iii200m/", readOn: "2026-11-05" },
      ],
    },
  },
  {
    id: "qhyccd-qhy42-pro",
    type: "camera",
    name: "QHYCCD QHY42 Pro",
    order: 124,
    specifications: {
      sensorWidthMm: 22.53,
      sensorHeightMm: 22.53,
      pixelSizeUm: 11,
    },
    planner: {
      sensor: "Gpixel GSENSE400",
      sensorKind: "mono",
      maker: "QHYCCD",
      kind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 2048 × 2048 px × 11 µm (QHYCCD page: effective pixel area and pixel size).",
      makerPages: [
        { url: "https://www.qhyccd.com/qhy42pro/", readOn: "2026-11-05" },
      ],
    },
  },
  {
    id: "qhyccd-qhy530-pro-ii",
    type: "camera",
    name: "QHYCCD QHY530 Pro II",
    order: 125,
    specifications: {
      sensorWidthMm: 14.6,
      sensorHeightMm: 12.63,
      pixelSizeUm: 2.74,
    },
    planner: {
      sensor: "Sony IMX530",
      sensorKind: "mono",
      maker: "QHYCCD",
      kind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 5328 × 4608 px × 2.74 µm (QHYCCD page: effective pixel area and pixel size).",
      makerPages: [
        { url: "https://www.qhyccd.com/qhy530pro-ii/", readOn: "2026-11-05" },
      ],
    },
  },
  {
    id: "qhyccd-qhy367c-pro",
    type: "camera",
    name: "QHYCCD QHY367C Pro",
    order: 126,
    specifications: {
      sensorWidthMm: 35.99,
      sensorHeightMm: 24.1,
      pixelSizeUm: 4.88,
    },
    planner: {
      sensor: "Sony IMX094",
      sensorKind: "colour",
      maker: "QHYCCD",
      kind: "colour",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 7376 × 4938 px × 4.88 µm (QHYCCD page: effective pixel area and pixel size).",
      makerPages: [
        {
          url: "https://www.qhyccd.com/astronomical-camera-qhy367/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "qhyccd-qhy268m-pro",
    type: "camera",
    name: "QHYCCD QHY268M Pro",
    order: 127,
    specifications: {
      sensorWidthMm: 23.51,
      sensorHeightMm: 15.7,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony IMX571",
      sensorKind: "mono",
      maker: "QHYCCD",
      kind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 6252 × 4176 px × 3.76 µm (QHYCCD page: effective pixel area and pixel size).",
      makerPages: [
        {
          url: "https://www.qhyccd.com/scientific-camera-qhy268m-pro/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "zwo-asi676mc",
    type: "camera",
    name: "ZWO ASI676MC",
    order: 128,
    specifications: { sensorWidthMm: 7.1, sensorHeightMm: 7.1, pixelSizeUm: 2 },
    planner: {
      sensor: "Sony IMX676",
      sensorKind: "colour",
      maker: "ZWO",
      kind: "colour",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/asi676/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "zwo-asi676mm",
    type: "camera",
    name: "ZWO ASI676MM",
    order: 129,
    specifications: { sensorWidthMm: 7.1, sensorHeightMm: 7.1, pixelSizeUm: 2 },
    planner: {
      sensor: "Sony IMX676",
      sensorKind: "mono",
      maker: "ZWO",
      kind: "mono",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/asi676/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "zwo-asi482mc",
    type: "camera",
    name: "ZWO ASI482MC",
    order: 130,
    specifications: {
      sensorWidthMm: 11.13,
      sensorHeightMm: 6.26,
      pixelSizeUm: 5.8,
    },
    planner: {
      sensor: "Sony IMX482",
      sensorKind: "colour",
      maker: "ZWO",
      kind: "colour",
      calculated: ["sensorKind"],
      calculation:
        "Colour: the model suffix MC (the specification table gives the sensor, its size and its pixel size).",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/zwo-asi482mc/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "zwo-asi4400mc-pro",
    type: "camera",
    name: "ZWO ASI4400MC Pro",
    order: 131,
    specifications: { sensorWidthMm: 36, sensorHeightMm: 24, pixelSizeUm: 4.4 },
    planner: {
      sensorKind: "colour",
      maker: "ZWO",
      kind: "colour",
      calculated: ["sensorKind"],
      calculation:
        "Colour: the model suffix MC (the specification table gives the 36 × 24 mm size and the 4.4 µm pixel).",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/asi4400mc-pro/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "svbony-sv305",
    type: "camera",
    name: "Svbony SV305",
    order: 132,
    specifications: {
      sensorWidthMm: 5.6,
      sensorHeightMm: 3.2,
      pixelSizeUm: 2.9,
    },
    planner: {
      sensor: "Sony IMX290",
      sensorKind: "colour",
      maker: "Svbony",
      kind: "colour",
      makerPages: [
        {
          url: "https://www.svbony.com/blog/parameters-comparison-of-sv305-to-sv705c-cameras",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "svbony-sv305-pro",
    type: "camera",
    name: "Svbony SV305 Pro",
    order: 133,
    specifications: {
      sensorWidthMm: 5.6,
      sensorHeightMm: 3.2,
      pixelSizeUm: 2.9,
    },
    planner: {
      sensor: "Sony IMX290",
      sensorKind: "colour",
      maker: "Svbony",
      kind: "colour",
      makerPages: [
        {
          url: "https://www.svbony.com/blog/parameters-comparison-of-sv305-to-sv705c-cameras",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "svbony-sv305m-pro",
    type: "camera",
    name: "Svbony SV305M Pro",
    order: 134,
    specifications: {
      sensorWidthMm: 5.6,
      sensorHeightMm: 3.2,
      pixelSizeUm: 2.9,
    },
    planner: {
      sensor: "Sony IMX290",
      sensorKind: "mono",
      maker: "Svbony",
      kind: "mono",
      makerPages: [
        {
          url: "https://www.svbony.com/blog/parameters-comparison-of-sv305-to-sv705c-cameras",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "svbony-sv505c",
    type: "camera",
    name: "Svbony SV505C",
    order: 135,
    specifications: {
      sensorWidthMm: 7.9,
      sensorHeightMm: 4.5,
      pixelSizeUm: 2.9,
    },
    planner: {
      sensor: "Sony IMX464",
      sensorKind: "colour",
      maker: "Svbony",
      kind: "colour",
      makerPages: [
        {
          url: "https://www.svbony.com/blog/parameters-comparison-of-sv305-to-sv705c-cameras",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "svbony-sv705c",
    type: "camera",
    name: "Svbony SV705C",
    order: 136,
    specifications: {
      sensorWidthMm: 11.2,
      sensorHeightMm: 6.3,
      pixelSizeUm: 2.9,
    },
    planner: {
      sensor: "Sony IMX585",
      sensorKind: "colour",
      maker: "Svbony",
      kind: "colour",
      makerPages: [
        {
          url: "https://www.svbony.com/blog/parameters-comparison-of-sv305-to-sv705c-cameras",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "svbony-sv405cc",
    type: "camera",
    name: "Svbony SV405CC",
    order: 137,
    specifications: {
      sensorWidthMm: 19.19,
      sensorHeightMm: 13.07,
      pixelSizeUm: 4.63,
    },
    planner: {
      sensor: "Sony IMX294",
      sensorKind: "colour",
      maker: "Svbony",
      kind: "colour",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 4144 × 2822 px × 4.63 µm (Svbony comparison table: resolution and pixel size).",
      makerPages: [
        {
          url: "https://www.svbony.com/blog/parameters-comparison-of-sv305-to-sv705c-cameras",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "altair-hypercam-183c-pro-tec",
    type: "camera",
    name: "Altair Hypercam 183C Pro TEC",
    order: 138,
    specifications: {
      sensorWidthMm: 13.06,
      sensorHeightMm: 8.76,
      pixelSizeUm: 2.4,
    },
    planner: {
      sensor: "Sony IMX183",
      sensorKind: "colour",
      maker: "Altair Astro",
      kind: "colour",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 5440 × 3648 px × 2.4 µm (Altair page: resolution and pixel size).",
      makerPages: [
        {
          url: "https://altairastro.com/altair-hypercam-183c-pro-tec-cooled-colour-20mp-astronomy-imaging-camera-47-p.asp",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "altair-hypercam-183m-pro-tec",
    type: "camera",
    name: "Altair Hypercam 183M Pro TEC",
    order: 139,
    specifications: {
      sensorWidthMm: 13.06,
      sensorHeightMm: 8.76,
      pixelSizeUm: 2.4,
    },
    planner: {
      sensor: "Sony IMX183",
      sensorKind: "mono",
      maker: "Altair Astro",
      kind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 5440 × 3648 px × 2.4 µm (Altair page: resolution and pixel size).",
      makerPages: [
        {
          url: "https://altairastro.com/altair-hypercam-183m-pro-tec-cooled-mono-20mp-astronomy-imaging-camera-49-p.asp",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "altair-hypercam-269c-tec",
    type: "camera",
    name: "Altair Hypercam 269C TEC",
    order: 140,
    specifications: {
      sensorWidthMm: 17.4,
      sensorHeightMm: 13.1,
      pixelSizeUm: 3.3,
    },
    planner: {
      sensor: "Sony IMX269",
      sensorKind: "colour",
      maker: "Altair Astro",
      kind: "colour",
      makerPages: [
        {
          url: "https://altairastro.com/altair-hypercam-269c-colour-camera---tec-cooled-1097-p.asp",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "altair-hypercam-533m",
    type: "camera",
    name: "Altair Hypercam 533M",
    order: 141,
    specifications: {
      sensorWidthMm: 11.28,
      sensorHeightMm: 11.28,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony IMX533",
      sensorKind: "mono",
      maker: "Altair Astro",
      kind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 3000 × 3000 px × 3.76 µm (Altair page: resolution and pixel size).",
      makerPages: [
        {
          url: "https://altairastro.com/altair-hypercam-533m-mono-camera-13229-p.asp",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "altair-hypercam-585c-tec",
    type: "camera",
    name: "Altair Hypercam 585C TEC",
    order: 142,
    specifications: {
      sensorWidthMm: 11.14,
      sensorHeightMm: 6.26,
      pixelSizeUm: 2.9,
    },
    planner: {
      sensor: "Sony IMX585",
      sensorKind: "colour",
      maker: "Altair Astro",
      kind: "colour",
      makerPages: [
        {
          url: "https://altairastro.com/altair-hypercam-585c-tec-cooled-usb3-astronomy-camera-13894-p.asp",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "altair-hypercam-585m-tec",
    type: "camera",
    name: "Altair Hypercam 585M TEC",
    order: 143,
    specifications: {
      sensorWidthMm: 11.14,
      sensorHeightMm: 6.26,
      pixelSizeUm: 2.9,
    },
    planner: {
      sensor: "Sony IMX585",
      sensorKind: "mono",
      maker: "Altair Astro",
      kind: "mono",
      makerPages: [
        {
          url: "https://altairastro.com/altair-hypercam-585m-mono-tec-cooled-usb3-astronomy-camera-14437-p.asp",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "altair-hypercam-aa24cfx",
    type: "camera",
    name: "Altair Hypercam AA24CFX",
    order: 144,
    specifications: {
      sensorWidthMm: 36.02,
      sensorHeightMm: 24,
      pixelSizeUm: 5.94,
    },
    planner: {
      sensor: "Sony IMX410",
      sensorKind: "colour",
      maker: "Altair Astro",
      kind: "colour",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 6064 × 4040 px × 5.94 µm (Altair page: resolution and pixel size).",
      makerPages: [
        {
          url: "https://altairastro.com/hypercam-aa24cfx-full-frame-cooled-colour-camera-14bit-10459-p.asp",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "altair-hypercam-aa61mfx",
    type: "camera",
    name: "Altair Hypercam AA61MFX",
    order: 145,
    specifications: {
      sensorWidthMm: 35.98,
      sensorHeightMm: 23.99,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony IMX455",
      sensorKind: "mono",
      maker: "Altair Astro",
      kind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 9568 × 6380 px × 3.76 µm (Altair page: resolution and pixel size).",
      makerPages: [
        {
          url: "https://altairastro.com/hypercam-aa61mfx-full-frame-cooled-mono-camera-16bit-10142-p.asp",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-uwa-10",
    type: "eyepiece",
    name: "Sky Rover UWA 10 mm 82°",
    order: 135,
    specifications: { focalLengthMm: 10, apparentFieldDegrees: 82 },
    planner: {
      maker: "Sky Rover",
      kind: "ultra-wide-field",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/uwa-10mm-eyepiece",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-uwa-13",
    type: "eyepiece",
    name: "Sky Rover UWA 13 mm 82°",
    order: 136,
    specifications: { focalLengthMm: 13, apparentFieldDegrees: 82 },
    planner: {
      maker: "Sky Rover",
      kind: "ultra-wide-field",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/uwa-13mm-eyepiece",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-uwa-16",
    type: "eyepiece",
    name: "Sky Rover UWA 16 mm 82°",
    order: 137,
    specifications: { focalLengthMm: 16, apparentFieldDegrees: 82 },
    planner: {
      maker: "Sky Rover",
      kind: "ultra-wide-field",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/sky-rover-uwa16mm-eyepiece",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-uwa-28",
    type: "eyepiece",
    name: "Sky Rover UWA 28 mm 82°",
    order: 138,
    specifications: { focalLengthMm: 28, apparentFieldDegrees: 82 },
    planner: {
      maker: "Sky Rover",
      kind: "ultra-wide-field",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/uwa28mm-eyepiece-82-degree",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-xwa-3-5",
    type: "eyepiece",
    name: "Sky Rover XWA 3.5 mm 110°",
    order: 139,
    specifications: { focalLengthMm: 3.5, apparentFieldDegrees: 110 },
    planner: {
      maker: "Sky Rover",
      kind: "ultra-wide-field",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/xwa-3-5mm-eyepiece",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-xwa-7",
    type: "eyepiece",
    name: "Sky Rover XWA 7 mm 100°",
    order: 140,
    specifications: { focalLengthMm: 7, apparentFieldDegrees: 100 },
    planner: {
      maker: "Sky Rover",
      kind: "ultra-wide-field",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/xwa-7mm-eyepiece",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-xwa-13",
    type: "eyepiece",
    name: "Sky Rover XWA 13 mm 110°",
    order: 141,
    specifications: { focalLengthMm: 13, apparentFieldDegrees: 110 },
    planner: {
      maker: "Sky Rover",
      kind: "ultra-wide-field",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/xwa-13mm-eyepiece",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-xwa-20",
    type: "eyepiece",
    name: "Sky Rover XWA 20 mm 100°",
    order: 142,
    specifications: { focalLengthMm: 20, apparentFieldDegrees: 100 },
    planner: {
      maker: "Sky Rover",
      kind: "ultra-wide-field",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/xwa-20mm-eyepiece",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "explore-scientific-72-ed-series-6-5mm-waterproof-eyepiece",
    type: "eyepiece",
    name: "Explore Scientific 72° ED Series 6,5 mm",
    order: 143,
    specifications: { focalLengthMm: 6.5, apparentFieldDegrees: 72 },
    planner: {
      maker: "Explore Scientific",
      kind: "wide-field",
      makerPages: [
        {
          url: "https://explorescientific.com/products/72-ed-series-6-5mm-waterproof-eyepiece",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "explore-scientific-72-ed-series-8-5mm-waterproof-eyepiece",
    type: "eyepiece",
    name: "Explore Scientific 72° ED Series 8,5 mm",
    order: 144,
    specifications: { focalLengthMm: 8.5, apparentFieldDegrees: 72 },
    planner: {
      maker: "Explore Scientific",
      kind: "wide-field",
      makerPages: [
        {
          url: "https://explorescientific.com/products/72-ed-series-8-5mm-waterproof-eyepiece",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "explore-scientific-72-ed-series-11-5mm-waterproof-eyepiece",
    type: "eyepiece",
    name: "Explore Scientific 72° ED Series 11,5 mm",
    order: 145,
    specifications: { focalLengthMm: 11.5, apparentFieldDegrees: 72 },
    planner: {
      maker: "Explore Scientific",
      kind: "wide-field",
      makerPages: [
        {
          url: "https://explorescientific.com/products/72-ed-series-11-5mm-waterproof-eyepiece",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "explore-scientific-72-ed-series-15mm-waterproof-eyepiece",
    type: "eyepiece",
    name: "Explore Scientific 72° ED Series 15 mm",
    order: 146,
    specifications: { focalLengthMm: 15, apparentFieldDegrees: 72 },
    planner: {
      maker: "Explore Scientific",
      kind: "wide-field",
      makerPages: [
        {
          url: "https://explorescientific.com/products/72-ed-series-15mm-waterproof-eyepiece",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "explore-scientific-72-ed-series-20mm-waterproof-eyepiece",
    type: "eyepiece",
    name: "Explore Scientific 72° ED Series 20 mm",
    order: 147,
    specifications: { focalLengthMm: 20, apparentFieldDegrees: 72 },
    planner: {
      maker: "Explore Scientific",
      kind: "wide-field",
      makerPages: [
        {
          url: "https://explorescientific.com/products/72-ed-series-20mm-waterproof-eyepiece",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "explore-scientific-72-ed-series-25mm-waterproof-eyepiece",
    type: "eyepiece",
    name: "Explore Scientific 72° ED Series 25 mm",
    order: 148,
    specifications: { focalLengthMm: 25, apparentFieldDegrees: 72 },
    planner: {
      maker: "Explore Scientific",
      kind: "wide-field",
      makerPages: [
        {
          url: "https://explorescientific.com/products/72-ed-series-25mm-waterproof-eyepiece",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "explore-scientific-72-ed-series-30mm-waterproof-eyepiece",
    type: "eyepiece",
    name: "Explore Scientific 72° ED Series 30 mm",
    order: 149,
    specifications: { focalLengthMm: 30, apparentFieldDegrees: 72 },
    planner: {
      maker: "Explore Scientific",
      kind: "wide-field",
      makerPages: [
        {
          url: "https://explorescientific.com/products/72-ed-series-30mm-waterproof-eyepiece",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "explore-scientific-72-ed-series-40mm-waterproof-eyepiece",
    type: "eyepiece",
    name: "Explore Scientific 72° ED Series 40 mm",
    order: 150,
    specifications: { focalLengthMm: 40, apparentFieldDegrees: 72 },
    planner: {
      maker: "Explore Scientific",
      kind: "wide-field",
      makerPages: [
        {
          url: "https://explorescientific.com/products/72-ed-series-40mm-waterproof-eyepiece",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "explore-scientific-92-ed-series-9mm-waterproof-eyepiece",
    type: "eyepiece",
    name: "Explore Scientific 92° ED Series 9 mm",
    order: 151,
    specifications: { focalLengthMm: 9, apparentFieldDegrees: 92 },
    planner: {
      maker: "Explore Scientific",
      kind: "ultra-wide-field",
      makerPages: [
        {
          url: "https://explorescientific.com/products/92-ed-series-9mm-waterproof-eyepiece",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "explore-scientific-92-ed-series-14mm-waterproof-eyepiece",
    type: "eyepiece",
    name: "Explore Scientific 92° ED Series 14 mm",
    order: 152,
    specifications: { focalLengthMm: 14, apparentFieldDegrees: 92 },
    planner: {
      maker: "Explore Scientific",
      kind: "ultra-wide-field",
      makerPages: [
        {
          url: "https://explorescientific.com/products/92-ed-series-14mm-waterproof-eyepiece",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "explore-scientific-92-ed-series-20mm-waterproof-eyepiece",
    type: "eyepiece",
    name: "Explore Scientific 92° ED Series 20 mm",
    order: 153,
    specifications: { focalLengthMm: 20, apparentFieldDegrees: 92 },
    planner: {
      maker: "Explore Scientific",
      kind: "ultra-wide-field",
      makerPages: [
        {
          url: "https://explorescientific.com/products/92-ed-series-20mm-waterproof-eyepiece",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "explore-scientific-92-12mm-long-eye-relief-eyepiece",
    type: "eyepiece",
    name: "Explore Scientific 92° LER Series 12 mm",
    order: 154,
    specifications: { focalLengthMm: 12, apparentFieldDegrees: 92 },
    planner: {
      maker: "Explore Scientific",
      kind: "ultra-wide-field",
      makerPages: [
        {
          url: "https://explorescientific.com/products/92-12mm-long-eye-relief-eyepiece",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "explore-scientific-92-17mm-long-eye-relief-eyepiece",
    type: "eyepiece",
    name: "Explore Scientific 92° LER Series 17 mm",
    order: 155,
    specifications: { focalLengthMm: 17, apparentFieldDegrees: 92 },
    planner: {
      maker: "Explore Scientific",
      kind: "ultra-wide-field",
      makerPages: [
        {
          url: "https://explorescientific.com/products/92-17mm-long-eye-relief-eyepiece",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "explore-scientific-52-3mm",
    type: "eyepiece",
    name: "Explore Scientific 52° Series 3 mm",
    order: 156,
    specifications: { focalLengthMm: 3, apparentFieldDegrees: 52 },
    planner: {
      maker: "Explore Scientific",
      kind: "standard",
      makerPages: [
        {
          url: "https://explorescientific.com/products/52-3mm",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "explore-scientific-52-4-5mm",
    type: "eyepiece",
    name: "Explore Scientific 52° Series 4,5 mm",
    order: 157,
    specifications: { focalLengthMm: 4.5, apparentFieldDegrees: 52 },
    planner: {
      maker: "Explore Scientific",
      kind: "standard",
      makerPages: [
        {
          url: "https://explorescientific.com/products/52-4-5mm",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "explore-scientific-52-6-5mm",
    type: "eyepiece",
    name: "Explore Scientific 52° Series 6,5 mm",
    order: 158,
    specifications: { focalLengthMm: 6.5, apparentFieldDegrees: 52 },
    planner: {
      maker: "Explore Scientific",
      kind: "standard",
      makerPages: [
        {
          url: "https://explorescientific.com/products/52-6-5mm",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "explore-scientific-52-10mm",
    type: "eyepiece",
    name: "Explore Scientific 52° Series 10 mm",
    order: 159,
    specifications: { focalLengthMm: 10, apparentFieldDegrees: 52 },
    planner: {
      maker: "Explore Scientific",
      kind: "standard",
      makerPages: [
        {
          url: "https://explorescientific.com/products/52-10mm",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "explore-scientific-52-20mm",
    type: "eyepiece",
    name: "Explore Scientific 52° Series 20 mm",
    order: 160,
    specifications: { focalLengthMm: 20, apparentFieldDegrees: 52 },
    planner: {
      maker: "Explore Scientific",
      kind: "standard",
      makerPages: [
        {
          url: "https://explorescientific.com/products/52-20mm",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "explore-scientific-52-25mm",
    type: "eyepiece",
    name: "Explore Scientific 52° Series 25 mm",
    order: 161,
    specifications: { focalLengthMm: 25, apparentFieldDegrees: 52 },
    planner: {
      maker: "Explore Scientific",
      kind: "standard",
      makerPages: [
        {
          url: "https://explorescientific.com/products/52-25mm",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "explore-scientific-68-28mm",
    type: "eyepiece",
    name: "Explore Scientific 68° Series 28 mm",
    order: 162,
    specifications: { focalLengthMm: 28, apparentFieldDegrees: 68 },
    planner: {
      maker: "Explore Scientific",
      kind: "wide-field",
      makerPages: [
        {
          url: "https://explorescientific.com/products/68-28mm",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "explore-scientific-82-6-5mm",
    type: "eyepiece",
    name: "Explore Scientific 82° Series LER 6,5 mm",
    order: 163,
    specifications: { focalLengthMm: 6.5, apparentFieldDegrees: 82 },
    planner: {
      maker: "Explore Scientific",
      kind: "ultra-wide-field",
      makerPages: [
        {
          url: "https://explorescientific.com/products/82-6-5mm",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "explore-scientific-82-4-5mm",
    type: "eyepiece",
    name: "Explore Scientific 82° Series LER 4,5 mm",
    order: 164,
    specifications: { focalLengthMm: 4.5, apparentFieldDegrees: 82 },
    planner: {
      maker: "Explore Scientific",
      kind: "ultra-wide-field",
      makerPages: [
        {
          url: "https://explorescientific.com/products/82-4-5mm",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-extender-2x",
    type: "lens",
    name: "Sky Rover 2× Extender",
    order: 42,
    specifications: { multiplier: 2 },
    planner: {
      maker: "Sky Rover",
      kind: "barlow",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/2x-extender",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-extender-3x",
    type: "lens",
    name: "Sky Rover 3× Extender",
    order: 43,
    specifications: { multiplier: 3 },
    planner: {
      maker: "Sky Rover",
      kind: "barlow",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/3x-extender",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-reducer-08x-86-106-126ma",
    type: "lens",
    name: "Sky Rover 0,8× Reducer for 86/106/126MA",
    order: 44,
    specifications: { multiplier: 0.8 },
    planner: {
      maker: "Sky Rover",
      kind: "reducer",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/0-8x-reducer-for-86-106-126ma",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-reducer-08x-90gps",
    type: "lens",
    name: "Sky Rover 0,8× Specialist Reducer for 90 GPS",
    order: 45,
    specifications: { multiplier: 0.8 },
    planner: {
      maker: "Sky Rover",
      kind: "reducer",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/0-8x-specialist-reducer-for-90gps",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-reducer-08x-130gps",
    type: "lens",
    name: "Sky Rover 0,8× Specialist Reducer for 130 GPS",
    order: 46,
    specifications: { multiplier: 0.8 },
    planner: {
      maker: "Sky Rover",
      kind: "reducer",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/0-8x-specialist-reducer-for-130gps",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "sky-rover-reducer-08x-155gps",
    type: "lens",
    name: "Sky Rover 0,8× Specialist Reducer for 155 GPS",
    order: 47,
    specifications: { multiplier: 0.8 },
    planner: {
      maker: "Sky Rover",
      kind: "reducer",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/0-8x-specialist-reducer-for-155gps",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "zwo-ff65apo-reducer-075x",
    type: "lens",
    name: "ZWO FF65APO 0,75× Full Frame Reducer",
    order: 48,
    specifications: { multiplier: 0.75 },
    planner: {
      maker: "ZWO",
      kind: "reducer",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/reducer-series/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "zwo-ff80apo-reducer-076x",
    type: "lens",
    name: "ZWO FF80APO 0,76× Full Frame Reducer",
    order: 49,
    specifications: { multiplier: 0.76 },
    planner: {
      maker: "ZWO",
      kind: "reducer",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/reducer-series/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "zwo-ff107-130apo-reducer-07x",
    type: "lens",
    name: "ZWO FF107APO/FF130APO 0,7× Universal Reducer",
    order: 50,
    specifications: { multiplier: 0.7 },
    planner: {
      maker: "ZWO",
      kind: "reducer",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/reducer-series/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "skywatcher-eq6-r-pro",
    type: "mount",
    name: "Sky-Watcher EQ6-R Pro",
    order: 1,
    specifications: {},
    planner: {
      maker: "Sky-Watcher",
      kind: "equatorial",
      makerPages: [
        {
          url: "https://www.skywatcherusa.com/products/eq6-r-pro",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "skywatcher-heq5-pro",
    type: "mount",
    name: "Sky-Watcher HEQ5 Pro",
    order: 2,
    specifications: {},
    planner: {
      maker: "Sky-Watcher",
      kind: "equatorial",
      makerPages: [
        {
          url: "https://www.skywatcherusa.com/products/heq5-mount",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "skywatcher-heq5-r-pro",
    type: "mount",
    name: "Sky-Watcher HEQ5-R Pro",
    order: 3,
    specifications: {},
    planner: {
      maker: "Sky-Watcher",
      kind: "equatorial",
      makerPages: [
        {
          url: "https://www.skywatcherusa.com/products/heq5-r-pro",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "skywatcher-eq8-r",
    type: "mount",
    name: "Sky-Watcher EQ8-R Pro",
    order: 4,
    specifications: {},
    planner: {
      maker: "Sky-Watcher",
      kind: "equatorial",
      makerPages: [
        {
          url: "https://www.skywatcherusa.com/products/eq8-r-mount-with-pier-tripod",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "skywatcher-cq350-pro",
    type: "mount",
    name: "Sky-Watcher CQ350 Pro",
    order: 5,
    specifications: {},
    planner: {
      maker: "Sky-Watcher",
      kind: "equatorial",
      makerPages: [
        {
          url: "https://www.skywatcherusa.com/products/cq350-pro",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "skywatcher-eq-al55i",
    type: "mount",
    name: "Sky-Watcher EQ-AL55i Pro",
    order: 6,
    specifications: {},
    planner: {
      maker: "Sky-Watcher",
      kind: "equatorial",
      makerPages: [
        {
          url: "https://www.skywatcherusa.com/products/eq-al55i",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "skywatcher-eqm-35",
    type: "mount",
    name: "Sky-Watcher EQM-35",
    order: 7,
    specifications: {},
    planner: {
      maker: "Sky-Watcher",
      kind: "equatorial",
      makerPages: [
        {
          url: "https://www.skywatcherusa.com/products/eqm-35-mount",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "skywatcher-az-eq6",
    type: "mount",
    name: "Sky-Watcher AZ-EQ6 Pro",
    order: 8,
    specifications: {},
    planner: {
      maker: "Sky-Watcher",
      kind: "hybrid",
      makerPages: [
        {
          url: "https://www.skywatcherusa.com/products/az-eq6-mount",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "skywatcher-az-eq5",
    type: "mount",
    name: "Sky-Watcher AZ-EQ5 Pro",
    order: 9,
    specifications: {},
    planner: {
      maker: "Sky-Watcher",
      kind: "hybrid",
      makerPages: [
        {
          url: "https://www.skywatcherusa.com/products/az-eq5",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "skywatcher-az-gti",
    type: "mount",
    name: "Sky-Watcher AZ-GTi",
    order: 10,
    specifications: {},
    planner: {
      maker: "Sky-Watcher",
      kind: "altaz",
      makerPages: [
        {
          url: "https://www.skywatcherusa.com/products/az-gti-mount",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "skywatcher-az-gtix",
    type: "mount",
    name: "Sky-Watcher AZ-GTiX",
    order: 11,
    specifications: {},
    planner: {
      maker: "Sky-Watcher",
      kind: "altaz",
      makerPages: [
        {
          url: "https://www.skywatcher.com/product/az-gtix/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "skywatcher-az5",
    type: "mount",
    name: "Sky-Watcher AZ5",
    order: 12,
    specifications: {},
    planner: {
      maker: "Sky-Watcher",
      kind: "altaz",
      makerPages: [
        {
          url: "https://www.skywatcherusa.com/products/az5-mount-with-steel-tripod",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "skywatcher-star-adventurer-gti",
    type: "mount",
    name: "Sky-Watcher Star Adventurer GTi",
    order: 13,
    specifications: {},
    planner: {
      maker: "Sky-Watcher",
      kind: "tracker",
      makerPages: [
        {
          url: "https://www.skywatcherusa.com/products/star-adventurer-gti-mount-kit",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "skywatcher-star-adventurer-2i",
    type: "mount",
    name: "Sky-Watcher Star Adventurer 2i",
    order: 14,
    specifications: {},
    planner: {
      maker: "Sky-Watcher",
      kind: "tracker",
      makerPages: [
        {
          url: "https://www.skywatcherusa.com/products/star-adventurer-pro-pack",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "zwo-am3n",
    type: "mount",
    name: "ZWO AM3N",
    order: 15,
    specifications: {},
    planner: {
      maker: "ZWO",
      kind: "equatorial",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/am3n-harmonic-equatorial-mount/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "zwo-am5n",
    type: "mount",
    name: "ZWO AM5N",
    order: 16,
    specifications: {},
    planner: {
      maker: "ZWO",
      kind: "equatorial",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/zwo-am5n/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "zwo-am7",
    type: "mount",
    name: "ZWO AM7",
    order: 17,
    specifications: {},
    planner: {
      maker: "ZWO",
      kind: "equatorial",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/am7-harmonic-equatorial-mount/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "ioptron-cem26",
    type: "mount",
    name: "iOptron CEM26",
    order: 18,
    specifications: {},
    planner: {
      maker: "iOptron",
      kind: "equatorial",
      makerPages: [
        {
          url: "https://www.ioptron.com/product-p/c261b1.htm",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "ioptron-gem28",
    type: "mount",
    name: "iOptron GEM28",
    order: 19,
    specifications: {},
    planner: {
      maker: "iOptron",
      kind: "equatorial",
      makerPages: [
        {
          url: "https://www.ioptron.com/product-p/g281b1.htm",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "ioptron-cem40",
    type: "mount",
    name: "iOptron CEM40",
    order: 20,
    specifications: {},
    planner: {
      maker: "iOptron",
      kind: "equatorial",
      makerPages: [
        {
          url: "https://www.ioptron.com/product-p/c401a1.htm",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "ioptron-gem45",
    type: "mount",
    name: "iOptron GEM45",
    order: 21,
    specifications: {},
    planner: {
      maker: "iOptron",
      kind: "equatorial",
      makerPages: [
        {
          url: "https://www.ioptron.com/product-p/7620a.htm",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "ioptron-cem70",
    type: "mount",
    name: "iOptron CEM70",
    order: 22,
    specifications: {},
    planner: {
      maker: "iOptron",
      kind: "equatorial",
      makerPages: [
        {
          url: "https://www.ioptron.com/product-p/c70a.htm",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "ioptron-hem27",
    type: "mount",
    name: "iOptron HEM27",
    order: 23,
    specifications: {},
    planner: {
      maker: "iOptron",
      kind: "equatorial",
      makerPages: [
        {
          url: "https://www.ioptron.com/product-p/h272.htm",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "ioptron-hae29",
    type: "mount",
    name: "iOptron HAE29",
    order: 24,
    specifications: {},
    planner: {
      maker: "iOptron",
      kind: "hybrid",
      makerPages: [
        {
          url: "https://www.ioptron.com/product-p/he292a.htm",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "ioptron-hae43",
    type: "mount",
    name: "iOptron HAE43",
    order: 25,
    specifications: {},
    planner: {
      maker: "iOptron",
      kind: "hybrid",
      makerPages: [
        {
          url: "https://www.ioptron.com/product-p/he432c.htm",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "ioptron-skyguider-pro",
    type: "mount",
    name: "iOptron SkyGuider Pro",
    order: 26,
    specifications: {},
    planner: {
      maker: "iOptron",
      kind: "tracker",
      makerPages: [
        {
          url: "https://www.ioptron.com/product-p/3550.htm",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "ioptron-skyhunter",
    type: "mount",
    name: "iOptron SkyHunter",
    order: 27,
    specifications: {},
    planner: {
      maker: "iOptron",
      kind: "hybrid",
      makerPages: [
        {
          url: "https://www.ioptron.com/product-p/3700eq.htm",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "celestron-avx",
    type: "mount",
    name: "Celestron Advanced VX (AVX)",
    order: 28,
    specifications: {},
    planner: {
      maker: "Celestron",
      kind: "equatorial",
      makerPages: [
        {
          url: "https://www.celestron.com/products/advanced-vx-mount-and-tripod",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "celestron-cgem-ii",
    type: "mount",
    name: "Celestron CGEM II",
    order: 29,
    specifications: {},
    planner: {
      maker: "Celestron",
      kind: "equatorial",
      makerPages: [
        {
          url: "https://www.celestron.com/products/cgem-ii-eq-mount-and-tripod",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "celestron-cgx",
    type: "mount",
    name: "Celestron CGX",
    order: 30,
    specifications: {},
    planner: {
      maker: "Celestron",
      kind: "equatorial",
      makerPages: [
        {
          url: "https://www.celestron.com/products/cgx-equatorial-mount-and-tripod",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "celestron-nexstar-se-fork",
    type: "mount",
    name: "Celestron NexStar SE (monture à fourche)",
    order: 31,
    specifications: {},
    planner: {
      maker: "Celestron",
      kind: "altaz",
      makerPages: [
        {
          url: "https://www.celestron.com/products/nexstar-8se-computerized-telescope",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "rainbow-astro-rst-135",
    type: "mount",
    name: "Rainbow Astro RST-135",
    order: 32,
    specifications: {},
    planner: {
      maker: "Rainbow Astro",
      kind: "hybrid",
      makerPages: [
        { url: "https://rainbowastro.com/rst-135", readOn: "2026-11-05" },
      ],
    },
  },
  {
    id: "pegasus-nyx-101",
    type: "mount",
    name: "Pegasus Astro NYX-101",
    order: 33,
    specifications: {},
    planner: {
      maker: "Pegasus Astro",
      kind: "hybrid",
      makerPages: [
        {
          url: "https://pegasusastro.com/products/nyx-101/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "explore-scientific-exos2-gt",
    type: "mount",
    name: "Explore Scientific EXOS2-GT",
    order: 34,
    specifications: {},
    planner: {
      maker: "Explore Scientific",
      kind: "equatorial",
      makerPages: [
        {
          url: "https://explorescientific.com/products/explore-scientific-exos2-gt-equatorial-mount-with-pmc-eight-goto-system-exos2gtpmct3-01",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "takahashi-em-11",
    type: "mount",
    name: "Takahashi EM-11",
    order: 35,
    specifications: {},
    planner: {
      maker: "Takahashi",
      kind: "equatorial",
      makerPages: [
        {
          url: "https://takahashijapan.jp/products/mount/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "takahashi-em-200",
    type: "mount",
    name: "Takahashi EM-200",
    order: 36,
    specifications: {},
    planner: {
      maker: "Takahashi",
      kind: "equatorial",
      makerPages: [
        {
          url: "https://takahashijapan.jp/products/mount/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "losmandy-gm8",
    type: "mount",
    name: "Losmandy GM8",
    order: 37,
    specifications: {},
    planner: {
      maker: "Losmandy",
      kind: "equatorial",
      calculated: ["kind"],
      calculation:
        "Estimation : mount type read on the retailer page Company Seven (Losmandy's own site was unreachable).",
      makerPages: [
        {
          url: "https://company7.com/losmandy/gm8-11.html",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "losmandy-g11",
    type: "mount",
    name: "Losmandy G11",
    order: 38,
    specifications: {},
    planner: {
      maker: "Losmandy",
      kind: "equatorial",
      calculated: ["kind"],
      calculation:
        "Estimation : mount type read on the retailer page Company Seven (Losmandy's own site was unreachable).",
      makerPages: [
        {
          url: "https://company7.com/losmandy/gm8-11.html",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "benro-polaris-astro",
    type: "mount",
    name: "Benro Polaris Astro",
    order: 39,
    specifications: {},
    planner: {
      maker: "Benro",
      kind: "tracker",
      calculated: ["kind"],
      calculation:
        "Estimation : read on the retailer page Glazer's Camera (Benro's own pages gave no details).",
      makerPages: [
        {
          url: "https://www.glazerscamera.com/products/benro-polaris-astro-3-axis",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-optolong-l-extreme",
    type: "filter",
    name: "Optolong L-eXtreme",
    order: 7,
    specifications: { forAllEquipment: false },
    planner: {
      family: "dual",
      maker: "Optolong",
      makerPages: [
        {
          url: "https://www.optolong.com/cms/document/detail/id/100.html",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-optolong-l-enhance",
    type: "filter",
    name: "Optolong L-eNhance",
    order: 8,
    specifications: { forAllEquipment: false },
    planner: {
      family: "dual",
      maker: "Optolong",
      makerPages: [
        {
          url: "https://www.optolong.com/cms/document/detail/id/16.html",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-optolong-l-ultimate",
    type: "filter",
    name: "Optolong L-Ultimate",
    order: 9,
    specifications: { forAllEquipment: false },
    planner: {
      family: "dual",
      maker: "Optolong",
      makerPages: [
        {
          url: "https://www.optolong.com/cms/document/detail/id/192.html",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-optolong-l-pro",
    type: "filter",
    name: "Optolong L-Pro",
    order: 10,
    specifications: { forAllEquipment: false },
    planner: {
      family: "broadband",
      maker: "Optolong",
      makerPages: [
        {
          url: "https://www.optolong.com/cms/document/detail/id/13.html",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-astronomik-uhc",
    type: "filter",
    name: "Astronomik UHC",
    order: 11,
    specifications: { forAllEquipment: false },
    planner: {
      family: "uhc",
      maker: "Astronomik",
      makerPages: [
        {
          url: "https://www.astronomik.com/en/Light-Pollution/UHC/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-astronomik-oiii-6nm",
    type: "filter",
    name: "Astronomik OIII 6 nm",
    order: 12,
    specifications: { forAllEquipment: false },
    planner: {
      family: "oiii",
      maker: "Astronomik",
      makerPages: [
        {
          url: "https://www.astronomik.com/en/Narrowband-Filters/OIII/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-astronomik-oiii-12nm",
    type: "filter",
    name: "Astronomik OIII 12 nm",
    order: 13,
    specifications: { forAllEquipment: false },
    planner: {
      family: "oiii",
      maker: "Astronomik",
      makerPages: [
        {
          url: "https://www.astronomik.com/en/Narrowband-Filters/OIII/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-astronomik-ha-6nm",
    type: "filter",
    name: "Astronomik Hα 6 nm",
    order: 14,
    specifications: { forAllEquipment: false },
    planner: {
      family: "ha",
      maker: "Astronomik",
      makerPages: [
        {
          url: "https://www.astronomik.com/en/Narrowband-Filters/6nm-Filters/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-astronomik-sii-6nm",
    type: "filter",
    name: "Astronomik SII 6 nm",
    order: 15,
    specifications: { forAllEquipment: false },
    planner: {
      family: "sii",
      maker: "Astronomik",
      makerPages: [
        {
          url: "https://www.astronomik.com/en/Narrowband-Filters/6nm-Filters/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-zwo-duo-band",
    type: "filter",
    name: "ZWO Duo-Band (Hα 15 nm / OIII 35 nm)",
    order: 16,
    specifications: { forAllEquipment: false },
    planner: {
      family: "dual",
      maker: "ZWO",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/duo-band-filters/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-zwo-ha-7nm",
    type: "filter",
    name: "ZWO Hα 7 nm",
    order: 17,
    specifications: { forAllEquipment: false },
    planner: {
      family: "ha",
      maker: "ZWO",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/ha-filters/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-zwo-oiii-7nm",
    type: "filter",
    name: "ZWO OIII 7 nm",
    order: 18,
    specifications: { forAllEquipment: false },
    planner: {
      family: "oiii",
      maker: "ZWO",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/oiii-filters/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-zwo-sii-7nm",
    type: "filter",
    name: "ZWO SII 7 nm",
    order: 19,
    specifications: { forAllEquipment: false },
    planner: {
      family: "sii",
      maker: "ZWO",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/sii-filters/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-zwo-lrgb",
    type: "filter",
    name: "ZWO LRGB",
    order: 20,
    specifications: { forAllEquipment: false },
    planner: {
      family: "broadband",
      maker: "ZWO",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/lrgb-filters/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-zwo-uv-ir-cut",
    type: "filter",
    name: "ZWO UV/IR-cut",
    order: 21,
    specifications: { forAllEquipment: false },
    planner: {
      family: "broadband",
      maker: "ZWO",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/ircut-filters/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-touptek-ha-4nm",
    type: "filter",
    name: "ToupTek Hα 4 nm",
    order: 22,
    specifications: { forAllEquipment: false },
    planner: {
      family: "ha",
      maker: "ToupTek",
      makerPages: [
        {
          url: "https://www.touptekastro.com/products/sho-filters-4nm-2inch",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-touptek-oiii-4nm",
    type: "filter",
    name: "ToupTek OIII 4 nm",
    order: 23,
    specifications: { forAllEquipment: false },
    planner: {
      family: "oiii",
      maker: "ToupTek",
      makerPages: [
        {
          url: "https://www.touptekastro.com/products/sho-filters-4nm-2inch",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-touptek-sii-4nm",
    type: "filter",
    name: "ToupTek SII 4 nm",
    order: 24,
    specifications: { forAllEquipment: false },
    planner: {
      family: "sii",
      maker: "ToupTek",
      makerPages: [
        {
          url: "https://www.touptekastro.com/products/sho-filters-4nm-2inch",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-touptek-puresight-a1",
    type: "filter",
    name: "ToupTek PureSight A1 Hα/OIII 5 nm",
    order: 25,
    specifications: { forAllEquipment: false },
    planner: {
      family: "dual",
      maker: "ToupTek",
      makerPages: [
        {
          url: "https://www.touptekastro.com/products/puresight-a1-dual-narrowband-filter",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-touptek-lrgb",
    type: "filter",
    name: "ToupTek LRGB",
    order: 26,
    specifications: { forAllEquipment: false },
    planner: {
      family: "broadband",
      maker: "ToupTek",
      makerPages: [
        {
          url: "https://www.touptekastro.com/products/lrgb-filters",
          readOn: "2026-11-05",
        },
      ],
    },
  },
]);

const literal = (value) =>
  value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;

/**
 * The statements of migration 131: one idempotent insert per row (SQLite and
 * PostgreSQL alike), so that an identifier already taken is never
 * overwritten. The migration runner cuts the text at every « ; »: no value of
 * a row holds one.
 */
export function equipmentCatalogue4SeedSql() {
  return EQUIPMENT_CATALOGUE_4_SEED.map(
    (row) =>
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
  ).join("\n");
}
