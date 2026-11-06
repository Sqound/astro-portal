/**
 * The telescope catalogue of the « Matériel par défaut » (migration 71
 * `telescope-catalogue`).
 *
 * The 39 entries (31 telescopes, 5 cameras,
 * 3 eyepieces; the 10 integrated sensors travel inside their smart telescope)
 * as `equipment` rows of scope `default`, held by the platform organisation
 * that migration 55 created (`default-equipment-seed.js`), each with the
 * profile's own identifier and its `preference_order` continuing the last
 * value of its kind. The rows are a frozen copy of
 * `packages/planner/src/common-equipment-profiles.json` as it was when the
 * migration was written: a migration is history, a later change of that file
 * does not rewrite it (a correction of a value, once a row is deployed, is a
 * new migration, never an edit of this module). `ON CONFLICT DO NOTHING`:
 * a row the administration already holds under the same identifier, edited,
 * hidden or archived, is never rewritten. Migration 55's own copy is not
 * touched.
 */

import { PLATFORM_ORGANIZATION_ID } from "./default-equipment-seed.js";

const SEEDED_AT = "2026-10-09T00:00:00.000Z";

/** `{ id, type, name, order, specifications, planner }`, as migration 55's. */
export const TELESCOPE_CATALOGUE_SEED = Object.freeze([
  {
    id: "seestar-s50-pro",
    type: "telescope",
    name: "Seestar S50 Pro",
    order: 12,
    specifications: {
      apertureMm: 50,
      focalLengthMm: 260,
    },
    planner: {
      group: "connected",
      integratedCamera: {
        id: "seestar-s50-pro-os08b10",
        name: "OS08B10",
        sensor: "OmniVision OS08B10",
        sensorWidthMm: 6.26,
        sensorHeightMm: 11.14,
        pixelSizeUm: 2.9,
        calculated: ["sensorWidthMm", "sensorHeightMm"],
        calculation:
          "Portrait image 2160 × 3840 px × 2.9 µm (Seestar S50 Pro telephoto camera, the wide-angle camera, an IMX586, has no place in this format). Retailers and tests write Sony IMX585 for this camera, the maker's page is kept.",
        makerPages: [
          {
            url: "https://us.seestar.com/products/seestar-s50-pro-smart-telescope",
            readOn: "2026-10-09",
          },
        ],
      },
      mount: {
        id: "integrated-altaz",
        name: "Azimutale intégrée",
      },
      makerPages: [
        {
          url: "https://us.seestar.com/products/seestar-s50-pro-smart-telescope",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "seestar-s30-pro",
    type: "telescope",
    name: "Seestar S30 Pro",
    order: 13,
    specifications: {
      apertureMm: 30,
      focalLengthMm: 160,
    },
    planner: {
      group: "connected",
      integratedCamera: {
        id: "seestar-s30-pro-imx585",
        name: "IMX585",
        sensor: "Sony IMX585",
        sensorWidthMm: 6.26,
        sensorHeightMm: 11.14,
        pixelSizeUm: 2.9,
        calculated: ["sensorWidthMm", "sensorHeightMm"],
        calculation:
          "Portrait image 2160 × 3840 px × 2.9 µm. The pixel size is not on the Seestar page: ZWO's ASI585MC Pro page (same sensor).",
        makerPages: [
          {
            url: "https://www.seestar.com/collections/s30-series-smart-telescope/products/seestar-s30-pro",
            readOn: "2026-10-09",
          },
          {
            url: "https://www.zwoastro.com/product/asi585mc-mm-pro/",
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
          url: "https://www.seestar.com/collections/s30-series-smart-telescope/products/seestar-s30-pro",
          readOn: "2026-10-09",
        },
        {
          url: "https://www.zwoastro.com/product/asi585mc-mm-pro/",
          readOn: "2026-10-05",
        },
      ],
    },
  },
  {
    id: "dwarf-mini",
    type: "telescope",
    name: "Dwarf Mini",
    order: 14,
    specifications: {
      apertureMm: 30,
      focalLengthMm: 150,
    },
    planner: {
      group: "connected",
      integratedCamera: {
        id: "dwarf-mini-imx662",
        name: "IMX662",
        sensor: "Sony IMX662",
        sensorWidthMm: 5.57,
        sensorHeightMm: 3.13,
        pixelSizeUm: 2.9,
        calculated: ["sensorWidthMm", "sensorHeightMm"],
        calculation: "Image 1920 × 1080 px × 2.9 µm.",
        makerPages: [
          {
            url: "https://www.dwarflab.com/us/products/dwarf-mini-smart-telescope",
            readOn: "2026-10-09",
          },
        ],
      },
      mount: {
        id: "integrated-altaz",
        name: "Azimutale intégrée",
      },
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : 30 mm and 150 mm from a retailer (revendeur: telescoop.nl), the maker's page gives the sensor, the pixel size and the 2 Mpx image.",
      makerPages: [
        {
          url: "https://www.dwarflab.com/us/products/dwarf-mini-smart-telescope",
          readOn: "2026-10-09",
        },
        {
          url: "https://www.telescoop.nl/en/dwarf-mini-smart-telescope",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "dwarf-draco",
    type: "telescope",
    name: "Dwarf Draco",
    order: 15,
    specifications: {
      apertureMm: 90,
      focalLengthMm: 340,
    },
    planner: {
      group: "connected",
      integratedCamera: {
        id: "dwarf-draco-sensor",
        name: "50 Mpx",
        sensor: "1/1.3-inch CMOS, 50 Mpx (model not published)",
        sensorWidthMm: 9.81,
        sensorHeightMm: 7.35,
        pixelSizeUm: 2.4,
        calculated: [
          "sensor",
          "sensorWidthMm",
          "sensorHeightMm",
          "pixelSizeUm",
        ],
        calculation:
          "Estimation : no source gives the sensor model nor its size in millimetres. Retailers (revendeur: Starizona, Telescopes Canada, Astronomics) and the press (Digital Camera World) give a 1/1.3-inch sensor of 50 Mpx with a native pixel of 1.197 µm, 2.394 µm once binned 2 × 2 in deep-sky mode (about 12 Mpx), which is the pixel size kept here. Size computed from 8192 × 6144 px (50.3 Mpx) × 1.197 µm = 9.81 × 7.35 mm (diagonal 12.3 mm, a 1/1.3-inch format), the pixel array is a hypothesis.",
        makerPages: [
          {
            url: "https://www.dwarflab.com/products/draco-smart-telescope",
            readOn: "2026-10-09",
          },
          {
            url: "https://starizona.com/products/dwarflab-draco-smart-telescope-sho-edition",
            readOn: "2026-10-09",
          },
          {
            url: "https://telescopescanada.ca/products/dwarflab-draco-smart-telescope",
            readOn: "2026-10-09",
          },
          {
            url: "https://astronomics.com/collections/smart-telescopes/products/dwarflab-draco-smart-telescope",
            readOn: "2026-10-09",
          },
          {
            url: "https://www.digitalcameraworld.com/optics/telescopes/dwarflabs-new-draco-smart-telescope-brings-industry-first-wide-aperture-and-a-larger-camera-sensor-than-its-rivals",
            readOn: "2026-10-09",
          },
        ],
      },
      mount: {
        id: "integrated-altaz",
        name: "Azimutale intégrée",
      },
      calculated: ["focalLengthMm"],
      calculation:
        "Estimation : focal length 340 mm (f/3.8) from three retailers (revendeur: Starizona, Telescopes Canada, Astronomics) and from the press (Digital Camera World), the maker's page gives the 90 mm aperture only (Specs section empty on 2026-10-09).",
      makerPages: [
        {
          url: "https://www.dwarflab.com/products/draco-smart-telescope",
          readOn: "2026-10-09",
        },
        {
          url: "https://starizona.com/products/dwarflab-draco-smart-telescope-sho-edition",
          readOn: "2026-10-09",
        },
        {
          url: "https://telescopescanada.ca/products/dwarflab-draco-smart-telescope",
          readOn: "2026-10-09",
        },
        {
          url: "https://astronomics.com/collections/smart-telescopes/products/dwarflab-draco-smart-telescope",
          readOn: "2026-10-09",
        },
        {
          url: "https://www.digitalcameraworld.com/optics/telescopes/dwarflabs-new-draco-smart-telescope-brings-industry-first-wide-aperture-and-a-larger-camera-sensor-than-its-rivals",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "vespera-3",
    type: "telescope",
    name: "Vespera 3",
    order: 16,
    specifications: {
      apertureMm: 50,
      focalLengthMm: 245,
    },
    planner: {
      group: "connected",
      integratedCamera: {
        id: "vespera-3-imx585",
        name: "IMX585",
        sensor: "Sony IMX585",
        sensorWidthMm: 11.2,
        sensorHeightMm: 6.3,
        pixelSizeUm: 2.9,
        makerPages: [
          {
            url: "https://vaonis.com/pages/product/vespera-pro",
            readOn: "2026-10-09",
          },
        ],
      },
      mount: {
        id: "integrated-altaz",
        name: "Azimutale intégrée",
      },
      makerPages: [
        {
          url: "https://vaonis.com/pages/product/vespera-pro",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "vespera-pro-2",
    type: "telescope",
    name: "Vespera Pro 2",
    order: 17,
    specifications: {
      apertureMm: 50,
      focalLengthMm: 245,
    },
    planner: {
      group: "connected",
      integratedCamera: {
        id: "vespera-pro-2-imx676",
        name: "IMX676",
        sensor: "Sony IMX676",
        sensorWidthMm: 7.07,
        sensorHeightMm: 7.07,
        pixelSizeUm: 2,
        calculated: ["sensorWidthMm", "sensorHeightMm"],
        calculation: "Image 3536 × 3536 px × 2 µm.",
        makerPages: [
          {
            url: "https://vaonis.com/pages/product/vespera-pro",
            readOn: "2026-10-09",
          },
        ],
      },
      mount: {
        id: "integrated-altaz",
        name: "Azimutale intégrée",
      },
      makerPages: [
        {
          url: "https://vaonis.com/pages/product/vespera-pro",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "celestron-origin-mark-ii",
    type: "telescope",
    name: "Celestron Origin Mark II",
    order: 18,
    specifications: {
      apertureMm: 152,
      focalLengthMm: 335,
    },
    planner: {
      group: "connected",
      integratedCamera: {
        id: "celestron-origin-mark-ii-imx678",
        name: "IMX678",
        sensor: "Sony IMX678-AAQR1",
        sensorWidthMm: 7.71,
        sensorHeightMm: 4.36,
        pixelSizeUm: 2,
        calculated: ["sensorWidthMm", "sensorHeightMm"],
        calculation:
          "Image 3856 × 2180 px × 2 µm (Celestron Origin Mark II #12100, same optics). Bound to no telescope: the Celestron Origin's `integratedCameraId` names the camera it carries.",
        makerPages: [
          {
            url: "https://www.celestron.com/products/celestron-origin-intelligent-home-observatory",
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
          url: "https://www.celestron.com/products/celestron-origin-intelligent-home-observatory",
          readOn: "2026-10-05",
        },
      ],
    },
  },
  {
    id: "unistellar-evscope-2",
    type: "telescope",
    name: "Unistellar eVscope 2",
    order: 19,
    specifications: {
      apertureMm: 114,
      focalLengthMm: 450,
    },
    planner: {
      group: "connected",
      integratedCamera: {
        id: "unistellar-evscope-2-imx347",
        name: "IMX347",
        sensor: "Sony IMX347",
        sensorWidthMm: 5.97,
        sensorHeightMm: 4.48,
        pixelSizeUm: 2.9,
        calculated: ["sensorWidthMm", "sensorHeightMm", "pixelSizeUm"],
        calculation:
          "Estimation : the sensor model is the maker's (launch article: IMX347), the 2.9 µm pixel is not on any maker's page (communauté: comparison pages, same sensor as the eQuinox 2). Size of the imaged area computed from the maker's field of view, 45.6′ × 34.2′ at 450 mm = 5.97 × 4.48 mm. The maker's 3200 × 2400 px (7.7 Mpx) describes the processed image, not the native array (5.97 mm / 2.9 µm is about 2060 px wide).",
        makerPages: [
          {
            url: "https://shop.unistellar.com/products/evscope-2",
            readOn: "2026-10-09",
          },
          {
            url: "https://www.unistellar.com/blog/unistellar-and-nikon-redefine-consumer-astronomy-with-evscope-2/",
            readOn: "2026-10-09",
          },
        ],
      },
      mount: {
        id: "integrated-altaz",
        name: "Azimutale intégrée",
      },
      makerPages: [
        {
          url: "https://shop.unistellar.com/products/evscope-2",
          readOn: "2026-10-09",
        },
        {
          url: "https://www.unistellar.com/blog/unistellar-and-nikon-redefine-consumer-astronomy-with-evscope-2/",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "unistellar-equinox-2",
    type: "telescope",
    name: "Unistellar eQuinox 2",
    order: 20,
    specifications: {
      apertureMm: 114,
      focalLengthMm: 450,
    },
    planner: {
      group: "connected",
      integratedCamera: {
        id: "unistellar-equinox-2-imx347",
        name: "IMX347",
        sensor: "Sony IMX347",
        sensorWidthMm: 5.97,
        sensorHeightMm: 4.48,
        pixelSizeUm: 2.9,
        calculated: [
          "sensor",
          "sensorWidthMm",
          "sensorHeightMm",
          "pixelSizeUm",
        ],
        calculation:
          "Estimation : the maker's shop gives no sensor model nor pixel size. IMX347 and 6.2 Mpx come from the press (communauté: Digital Camera World and Universe Today, on the CES 2023 announcement) and 2.9 µm from comparison pages (communauté), other comparison pages give an IMX615 at 1.45 µm, the less held value, not kept. Size of the imaged area computed from the maker's field of view, 45.6′ × 34.2′ at 450 mm = 5.97 × 4.48 mm.",
        makerPages: [
          {
            url: "https://shop.unistellar.com/products/equinox-2",
            readOn: "2026-10-09",
          },
          {
            url: "https://help.unistellar.com/hc/en-us/articles/4406616411922-eQuinox-VS-eVscope-1-0-VS-eVscope-2",
            readOn: "2026-10-09",
          },
          {
            url: "https://digitalcameraworld.com/news/unistellar-reveals-second-gen-evscope-equinox-smart-telescope-at-ces-2023",
            readOn: "2026-10-09",
          },
        ],
      },
      mount: {
        id: "integrated-altaz",
        name: "Azimutale intégrée",
      },
      makerPages: [
        {
          url: "https://shop.unistellar.com/products/equinox-2",
          readOn: "2026-10-09",
        },
        {
          url: "https://help.unistellar.com/hc/en-us/articles/4406616411922-eQuinox-VS-eVscope-1-0-VS-eVscope-2",
          readOn: "2026-10-09",
        },
        {
          url: "https://digitalcameraworld.com/news/unistellar-reveals-second-gen-evscope-equinox-smart-telescope-at-ces-2023",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "unistellar-odyssey",
    type: "telescope",
    name: "Unistellar Odyssey",
    order: 21,
    specifications: {
      apertureMm: 85,
      focalLengthMm: 320,
    },
    planner: {
      group: "connected",
      integratedCamera: {
        id: "unistellar-odyssey-imx615",
        name: "IMX615",
        sensor: "Sony IMX615",
        sensorWidthMm: 4.19,
        sensorHeightMm: 3.13,
        pixelSizeUm: 1.45,
        calculated: [
          "sensor",
          "sensorWidthMm",
          "sensorHeightMm",
          "pixelSizeUm",
        ],
        calculation:
          "Estimation : the maker's shop gives no sensor model, resolution nor pixel size. IMX615 and 1.45 µm come from a comparison page (communauté, read through a search summary, the page itself refused the fetch), which gives 3.4 Mpx for the Odyssey and 4.1 Mpx for the Odyssey Pro with the same sensor, no source holds the IMX347 for this model. Size of the imaged area computed from the maker's field of view, 45′ × 33.6′ at 320 mm = 4.19 × 3.13 mm.",
        makerPages: [
          {
            url: "https://shop.unistellar.com/products/odyssey",
            readOn: "2026-10-09",
          },
          {
            url: "https://skiesandscopes.com/unistellar-odyssey-vs-odyssey-pro/",
            readOn: "2026-10-09",
          },
        ],
      },
      mount: {
        id: "integrated-altaz",
        name: "Azimutale intégrée",
      },
      makerPages: [
        {
          url: "https://shop.unistellar.com/products/odyssey",
          readOn: "2026-10-09",
        },
        {
          url: "https://skiesandscopes.com/unistellar-odyssey-vs-odyssey-pro/",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "unistellar-odyssey-pro",
    type: "telescope",
    name: "Unistellar Odyssey Pro",
    order: 22,
    specifications: {
      apertureMm: 85,
      focalLengthMm: 320,
    },
    planner: {
      group: "connected",
      integratedCamera: {
        id: "unistellar-odyssey-pro-imx615",
        name: "IMX615",
        sensor: "Sony IMX615",
        sensorWidthMm: 4.19,
        sensorHeightMm: 3.13,
        pixelSizeUm: 1.45,
        calculated: [
          "sensor",
          "sensorWidthMm",
          "sensorHeightMm",
          "pixelSizeUm",
        ],
        calculation:
          "Estimation : the maker's shop gives no sensor model, resolution nor pixel size. IMX615 and 1.45 µm come from a comparison page (communauté, read through a search summary, the page itself refused the fetch), same sensor as the Odyssey (the Pro adds an OLED eyepiece). Size of the imaged area computed from the maker's field of view, 45′ × 33.6′ at 320 mm = 4.19 × 3.13 mm.",
        makerPages: [
          {
            url: "https://shop.unistellar.com/products/odyssey-pro",
            readOn: "2026-10-09",
          },
          {
            url: "https://skiesandscopes.com/unistellar-odyssey-vs-odyssey-pro/",
            readOn: "2026-10-09",
          },
        ],
      },
      mount: {
        id: "integrated-altaz",
        name: "Azimutale intégrée",
      },
      makerPages: [
        {
          url: "https://shop.unistellar.com/products/odyssey-pro",
          readOn: "2026-10-09",
        },
        {
          url: "https://skiesandscopes.com/unistellar-odyssey-vs-odyssey-pro/",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "celestron-astromaster-70az",
    type: "telescope",
    name: "Celestron AstroMaster 70AZ",
    order: 23,
    specifications: {
      apertureMm: 70,
      focalLengthMm: 900,
    },
    planner: {
      group: "refractors",
      makerPages: [
        {
          url: "https://www.celestron.com/products/astromaster-70az-telescope",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "celestron-astromaster-90az",
    type: "telescope",
    name: "Celestron AstroMaster 90AZ",
    order: 24,
    specifications: {
      apertureMm: 90,
      focalLengthMm: 1000,
    },
    planner: {
      group: "refractors",
      makerPages: [
        {
          url: "https://www.celestron.com/products/astromaster-90az-telescope",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "skywatcher-startravel-80",
    type: "telescope",
    name: "Sky-Watcher StarTravel 80",
    order: 25,
    specifications: {
      apertureMm: 80,
      focalLengthMm: 400,
    },
    planner: {
      group: "refractors",
      makerPages: [
        {
          url: "http://skywatcher.com/product/bk-804az3/",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "skywatcher-startravel-102",
    type: "telescope",
    name: "Sky-Watcher StarTravel 102",
    order: 26,
    specifications: {
      apertureMm: 102,
      focalLengthMm: 500,
    },
    planner: {
      group: "refractors",
      makerPages: [
        {
          url: "https://www.skywatcher.com/product/bk-1025az3/",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "askar-fra300-pro",
    type: "telescope",
    name: "Askar FRA300 Pro",
    order: 27,
    specifications: {
      apertureMm: 60,
      focalLengthMm: 300,
    },
    planner: {
      group: "refractors",
      makerPages: [
        {
          url: "https://www.askarlens.com/index.php/wap/fra3pro/280.html",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "william-optics-zenithstar-61-ii",
    type: "telescope",
    name: "William Optics Zenithstar 61 II",
    order: 28,
    specifications: {
      apertureMm: 61,
      focalLengthMm: 360,
    },
    planner: {
      group: "refractors",
      makerPages: [
        {
          url: "https://williamoptics.com/products/zenithstar-61ii",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "svbony-sv503-70ed",
    type: "telescope",
    name: "Svbony SV503 70 ED",
    order: 29,
    specifications: {
      apertureMm: 70,
      focalLengthMm: 474,
    },
    planner: {
      group: "refractors",
      makerPages: [
        {
          url: "https://www.svbony.com/products/sv503-70mm-flatfield-refractor-telescope",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "svbony-sv550-80",
    type: "telescope",
    name: "Svbony SV550 80 (triplet apochromatique)",
    order: 30,
    specifications: {
      apertureMm: 80,
      focalLengthMm: 480,
    },
    planner: {
      group: "refractors",
      makerPages: [
        {
          url: "https://www.svbony.com/products/sv550-80mm-triplet-apo-ota",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "skywatcher-skymax-90",
    type: "telescope",
    name: "Sky-Watcher Skymax 90 (Maksutov)",
    order: 31,
    specifications: {
      apertureMm: 90,
      focalLengthMm: 1250,
    },
    planner: {
      group: "reflectors",
      makerPages: [
        {
          url: "http://skywatcher.com/product/mc90dneq2/",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "skywatcher-skymax-102",
    type: "telescope",
    name: "Sky-Watcher Skymax 102 (Maksutov)",
    order: 32,
    specifications: {
      apertureMm: 102,
      focalLengthMm: 1300,
    },
    planner: {
      group: "reflectors",
      makerPages: [
        {
          url: "https://www.skywatcher.com/product/mc102dneq2/",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "skywatcher-skymax-127",
    type: "telescope",
    name: "Sky-Watcher Skymax 127 (Maksutov)",
    order: 33,
    specifications: {
      apertureMm: 127,
      focalLengthMm: 1500,
    },
    planner: {
      group: "reflectors",
      makerPages: [
        {
          url: "https://skywatcher.com/product/bk-mak127-otaw/",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "celestron-nexstar-4se",
    type: "telescope",
    name: "Celestron NexStar 4SE (Maksutov)",
    order: 34,
    specifications: {
      apertureMm: 102,
      focalLengthMm: 1325,
    },
    planner: {
      group: "reflectors",
      makerPages: [
        {
          url: "https://www.celestron.com/products/nexstar-4se-computerized-telescope",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "celestron-nexstar-5se",
    type: "telescope",
    name: "Celestron NexStar 5SE",
    order: 35,
    specifications: {
      apertureMm: 125,
      focalLengthMm: 1250,
    },
    planner: {
      group: "reflectors",
      makerPages: [
        {
          url: "https://www.celestron.com/products/nexstar-5se-computerized-telescope",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "celestron-nexstar-6se",
    type: "telescope",
    name: "Celestron NexStar 6SE",
    order: 36,
    specifications: {
      apertureMm: 150,
      focalLengthMm: 1500,
    },
    planner: {
      group: "reflectors",
      makerPages: [
        {
          url: "https://www.celestron.com/products/nexstar-6se-computerized-telescope",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "celestron-astromaster-114eq",
    type: "telescope",
    name: "Celestron AstroMaster 114EQ",
    order: 37,
    specifications: {
      apertureMm: 114,
      focalLengthMm: 1000,
    },
    planner: {
      group: "reflectors",
      makerPages: [
        {
          url: "https://www.celestron.com/products/astromaster-114eq-telescope",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "celestron-astromaster-130eq",
    type: "telescope",
    name: "Celestron AstroMaster 130EQ",
    order: 38,
    specifications: {
      apertureMm: 130,
      focalLengthMm: 650,
    },
    planner: {
      group: "reflectors",
      makerPages: [
        {
          url: "https://www.celestron.com/products/astromaster-130eq-telescope",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "celestron-starsense-explorer-dx-130az",
    type: "telescope",
    name: "Celestron StarSense Explorer DX 130AZ",
    order: 39,
    specifications: {
      apertureMm: 130,
      focalLengthMm: 650,
    },
    planner: {
      group: "reflectors",
      makerPages: [
        {
          url: "https://www.celestron.com/products/starsense-explorer-dx-130az",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "skywatcher-heritage-130",
    type: "telescope",
    name: "Sky-Watcher Heritage 130",
    order: 40,
    specifications: {
      apertureMm: 130,
      focalLengthMm: 650,
    },
    planner: {
      group: "reflectors",
      makerPages: [
        {
          url: "http://skywatcher.com/product/heritage-p130/",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "skywatcher-heritage-150",
    type: "telescope",
    name: "Sky-Watcher Heritage 150",
    order: 41,
    specifications: {
      apertureMm: 150,
      focalLengthMm: 750,
    },
    planner: {
      group: "reflectors",
      makerPages: [
        {
          url: "https://www.skywatcherusa.com/products/heritage-150-tabletop-dobsonian",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "skywatcher-dobson-150-1200",
    type: "telescope",
    name: "Sky-Watcher Dobson 150/1200 (Classic 150P)",
    order: 42,
    specifications: {
      apertureMm: 150,
      focalLengthMm: 1200,
    },
    planner: {
      group: "reflectors",
      makerPages: [
        {
          url: "http://www.skywatcher.com/product/dob6s/",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "zwo-asi533mc-pro",
    type: "camera",
    name: "ZWO ASI533MC Pro",
    order: 6,
    specifications: {
      sensorWidthMm: 11.31,
      sensorHeightMm: 11.31,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony IMX533",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/asi533-pro-series/",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "zwo-asi662mc",
    type: "camera",
    name: "ZWO ASI662MC",
    order: 7,
    specifications: {
      sensorWidthMm: 5.6,
      sensorHeightMm: 3.1,
      pixelSizeUm: 2.9,
    },
    planner: {
      sensor: "Sony IMX662",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/asi662mc/",
          readOn: "2026-10-05",
        },
      ],
    },
  },
  {
    id: "zwo-asi678mc",
    type: "camera",
    name: "ZWO ASI678MC",
    order: 8,
    specifications: {
      sensorWidthMm: 7.68,
      sensorHeightMm: 4.32,
      pixelSizeUm: 2,
    },
    planner: {
      sensor: "Sony IMX678",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/zwo-asi678mc/",
          readOn: "2026-10-09",
        },
        {
          url: "https://i.zwoastro.com/zwo-website/manuals/ASI678_Manual_EN_V1.0.pdf",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "zwo-asi224mc",
    type: "camera",
    name: "ZWO ASI224MC",
    order: 9,
    specifications: {
      sensorWidthMm: 4.8,
      sensorHeightMm: 3.6,
      pixelSizeUm: 3.75,
    },
    planner: {
      sensor: "Sony IMX224",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/asi224mc/",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "player-one-neptune-c-ii",
    type: "camera",
    name: "Player One Neptune-C II",
    order: 10,
    specifications: {
      sensorWidthMm: 7.9,
      sensorHeightMm: 4.5,
      pixelSizeUm: 2.9,
    },
    planner: {
      sensor: "Sony IMX464",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://player-one-astronomy.com/product/neptune-c-ii-usb3-0-color-camera-imx464/",
          readOn: "2026-10-09",
        },
      ],
    },
  },
  {
    id: "plossl-32",
    type: "eyepiece",
    name: "Plössl 32 mm",
    order: 3,
    specifications: {
      focalLengthMm: 32,
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
    id: "plossl-20",
    type: "eyepiece",
    name: "Plössl 20 mm",
    order: 4,
    specifications: {
      focalLengthMm: 20,
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
    id: "plossl-12-5",
    type: "eyepiece",
    name: "Plössl 12,5 mm",
    order: 5,
    specifications: {
      focalLengthMm: 12.5,
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
]);

const literal = (value) =>
  value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;

/**
 * The statements of migration 71: one idempotent insert per row (SQLite and
 * PostgreSQL alike), so that an identifier already taken is never
 * overwritten.
 */
export function telescopeCatalogueSeedSql() {
  return TELESCOPE_CATALOGUE_SEED.map(
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
