/**
 * The fifth catalogue of the « Matériel par défaut » (migration 133
 * `equipment-catalogue-5`): the telescopes (Astro-Tech, Omegon, GSO, Lacerta,
 * Sky-Watcher), the astronomy cameras (Atik, QHYCCD) and the cameras for
 * photography at the focus (Pentax, OM System), the Tele Vue eyepieces
 * (Plössl, DeLite, Nagler, Ethos SX), the mounts (Sky-Watcher Wave, ZWO AM3)
 * and the filters (Antlia, IDAS, Baader, Chroma, Optolong, Svbony,
 * Astronomik) that the earlier catalogues lacked, as `equipment` rows of
 * scope `default` held by the platform organisation, each with the profile's
 * own identifier and its `preference_order` continuing the last value of its
 * kind. The rows are a frozen copy of
 * `packages/planner/src/common-equipment-profiles.json` as it was when the
 * migration was written: a migration is history, a later change of that file
 * does not rewrite it. `ON CONFLICT DO NOTHING`: a row the administration
 * already holds under the same identifier, edited, hidden or archived, is never
 * rewritten. Every value carries the pages it was read on; a value that is not
 * the maker's says so in its `calculation`. The common binoculars are not
 * rows: the planner adds them to every list by identifier.
 */

import { PLATFORM_ORGANIZATION_ID } from "./default-equipment-seed.js";

const SEEDED_AT = "2026-11-05T00:00:00.000Z";

/** `{ id, type, name, order, specifications, planner }`, as migration 131's. */
export const EQUIPMENT_CATALOGUE_5_SEED = Object.freeze([
  {
    id: "astro-tech-at72edii",
    type: "telescope",
    name: "Astro-Tech AT72EDII",
    order: 301,
    specifications: { apertureMm: 72, focalLengthMm: 432 },
    planner: {
      group: "refractors",
      maker: "Astro-Tech",
      kind: "refractor",
      makerPages: [
        {
          url: "https://astronomics.com/cdn/shop/files/AT72ED_II_manual.pdf",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "astro-tech-at80ed",
    type: "telescope",
    name: "Astro-Tech AT80ED",
    order: 302,
    specifications: { apertureMm: 80, focalLengthMm: 560 },
    planner: {
      group: "refractors",
      maker: "Astro-Tech",
      kind: "refractor",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : 80 mm aperture and 560 mm focal length read in a search extract of the Astronomics retailer page.",
      makerPages: [
        {
          url: "https://astronomics.com/collections/refractors",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "astro-tech-at102ed",
    type: "telescope",
    name: "Astro-Tech AT102ED",
    order: 303,
    specifications: { apertureMm: 102, focalLengthMm: 714 },
    planner: {
      group: "refractors",
      maker: "Astro-Tech",
      kind: "refractor",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : aperture and focal length read in a search extract of the Astronomics retailer page.",
      makerPages: [
        {
          url: "https://astronomics.com/astro-tech-at102ed-4-f-7-ed-refractor-ota.html",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "astro-tech-at102edl",
    type: "telescope",
    name: "Astro-Tech AT102EDL",
    order: 304,
    specifications: { apertureMm: 102, focalLengthMm: 711 },
    planner: {
      group: "refractors",
      maker: "Astro-Tech",
      kind: "refractor",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : aperture and focal length read in a search extract of the Astronomics retailer page.",
      makerPages: [
        {
          url: "https://astronomics.com/products/astro-tech-at102edl-refractor-ota-fcd-100-and-lanthanum-f-7-doublet",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "astro-tech-at115edt",
    type: "telescope",
    name: "Astro-Tech AT115EDT",
    order: 305,
    specifications: { apertureMm: 115, focalLengthMm: 805 },
    planner: {
      group: "refractors",
      maker: "Astro-Tech",
      kind: "refractor",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : 115 mm aperture and 805 mm focal length (f/7) read in search extracts of the retailer pages.",
      makerPages: [
        {
          url: "https://astronomics.com/collections/refractors",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "astro-tech-at130edt",
    type: "telescope",
    name: "Astro-Tech AT130EDT",
    order: 306,
    specifications: { apertureMm: 130, focalLengthMm: 910 },
    planner: {
      group: "refractors",
      maker: "Astro-Tech",
      kind: "refractor",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : 130 mm aperture and 910 mm focal length (f/7) read in search extracts of the Astronomics retailer pages.",
      makerPages: [
        {
          url: "https://astronomics.com/collections/refractors",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "lacerta-ed-apo-80-500",
    type: "telescope",
    name: "Lacerta 80/500 ED APO",
    order: 307,
    specifications: { apertureMm: 80, focalLengthMm: 500 },
    planner: {
      group: "refractors",
      maker: "Lacerta",
      kind: "refractor",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : aperture and focal length are the two figures of the product name 80/500 in a product list on a Lacerta retailer page.",
      makerPages: [
        {
          url: "https://en.lacerta-optics.com/FN25010c_250-1000-LACERTA-Carbon-Fotonewton-mit-8-fach",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "omegon-pro-apo-72-432",
    type: "telescope",
    name: "Omegon Pro APO 72/432 ED",
    order: 308,
    specifications: { apertureMm: 72, focalLengthMm: 432 },
    planner: {
      group: "refractors",
      maker: "Omegon",
      kind: "refractor",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : aperture and focal length read on the Astroshop retailer page (Omegon's own page was not reachable).",
      makerPages: [
        {
          url: "https://www.astroshop.eu/telescopes/omegon-apochromatic-refractor-pro-apo-ap-photography-scope-72-432-ed-ota/p,33081",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "omegon-pro-apo-85-560",
    type: "telescope",
    name: "Omegon Pro APO 85/560 ED Triplet",
    order: 309,
    specifications: { apertureMm: 85, focalLengthMm: 560 },
    planner: {
      group: "refractors",
      maker: "Omegon",
      kind: "refractor",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : aperture and focal length are the two figures of the product name 85/560 on the retailer's series page.",
      makerPages: [
        {
          url: "https://www.astroshop.eu/telescopes/10/m,Omegon/a,Teleskope.Allgemein.Serie=Pro+APO",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "omegon-pro-apo-106-700",
    type: "telescope",
    name: "Omegon Pro APO 106/700 Triplet ED FCD-100",
    order: 310,
    specifications: { apertureMm: 106, focalLengthMm: 700 },
    planner: {
      group: "refractors",
      maker: "Omegon",
      kind: "refractor",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : aperture and focal length are the two figures of the product name 106/700 on the retailer's series page.",
      makerPages: [
        {
          url: "https://www.astroshop.eu/telescopes/10/m,Omegon/a,Teleskope.Allgemein.Serie=Pro+APO",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "skywatcher-evolux-62-400",
    type: "telescope",
    name: "Sky-Watcher Evolux 62/400 ED-APO",
    order: 311,
    specifications: { apertureMm: 62, focalLengthMm: 400 },
    planner: {
      group: "refractors",
      maker: "Sky-Watcher",
      kind: "refractor",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : aperture and focal length are the two figures of the product name 62/400 in a product list on a retailer page.",
      makerPages: [
        {
          url: "https://en.lacerta-optics.com/FN25010c_250-1000-LACERTA-Carbon-Fotonewton-mit-8-fach",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "skywatcher-evolux-82-530",
    type: "telescope",
    name: "Sky-Watcher Evolux 82/530 ED-APO",
    order: 312,
    specifications: { apertureMm: 82, focalLengthMm: 530 },
    planner: {
      group: "refractors",
      maker: "Sky-Watcher",
      kind: "refractor",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : aperture and focal length are the two figures of the product name 82/530 in a product list on a retailer page.",
      makerPages: [
        {
          url: "https://en.lacerta-optics.com/FN25010c_250-1000-LACERTA-Carbon-Fotonewton-mit-8-fach",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "gso-newtonian-200-800",
    type: "telescope",
    name: "GSO Newtonian 200/800 f/4",
    order: 313,
    specifications: { apertureMm: 200, focalLengthMm: 800 },
    planner: {
      group: "reflectors",
      maker: "GSO",
      kind: "newtonian",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : 200 mm aperture and 800 mm focal length (f/4) read in a search extract of the GSO specification sheet hosted by a retailer.",
      makerPages: [
        {
          url: "https://cdn.shopify.com/s/files/1/1023/8189/files/GSO_Newtonian_Telescope.pdf",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "lacerta-photo-newton-250-1000",
    type: "telescope",
    name: "Lacerta Carbon Photo-Newton 250/1000",
    order: 314,
    specifications: { apertureMm: 250, focalLengthMm: 1000 },
    planner: {
      group: "reflectors",
      maker: "Lacerta",
      kind: "newtonian",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : aperture and focal length are the two figures of the product name 250/1000 on Lacerta's page (an older version, f/4 per its description).",
      makerPages: [
        {
          url: "https://en.lacerta-optics.com/FN25010c_250-1000-LACERTA-Carbon-Fotonewton-mit-8-fach",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "lacerta-photo-newton-200-800",
    type: "telescope",
    name: "Lacerta Photo-Newton 200/800",
    order: 315,
    specifications: { apertureMm: 200, focalLengthMm: 800 },
    planner: {
      group: "reflectors",
      maker: "Lacerta",
      kind: "newtonian",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : aperture and focal length read in a search extract of the AstroBin equipment entry (pre-2021 model).",
      makerPages: [
        {
          url: "https://ssr.app.astrobin.com/equipment/explorer/telescope/3876",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "omegon-pro-rc-154-1370",
    type: "telescope",
    name: "Omegon Pro RC 154/1370 Ritchey-Chretien",
    order: 316,
    specifications: { apertureMm: 154, focalLengthMm: 1370 },
    planner: {
      group: "reflectors",
      maker: "Omegon",
      kind: "ritchey-chretien",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : aperture and focal length are the two figures of the product name 154/1370 on the retailer's series page.",
      makerPages: [
        {
          url: "https://www.astroshop.eu/astronomy/telescopes/10/m,Omegon/s,green/a,Teleskope.Allgemein.Serie=Pro+RC",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "omegon-pro-rc-203-1624",
    type: "telescope",
    name: "Omegon Pro RC 203/1624 Ritchey-Chretien",
    order: 317,
    specifications: { apertureMm: 203, focalLengthMm: 1624 },
    planner: {
      group: "reflectors",
      maker: "Omegon",
      kind: "ritchey-chretien",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : aperture and focal length are the two figures of the product name 203/1624 on the retailer's listing.",
      makerPages: [
        {
          url: "https://www.astroshop.eu/astronomy/telescopes/10/a,Teleskope.Optik.Bauart=Ritchey-Chretien",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "atik-414ex-m",
    type: "camera",
    name: "Atik 414EX Mono",
    order: 146,
    specifications: {
      sensorWidthMm: 8.98,
      sensorHeightMm: 6.71,
      pixelSizeUm: 6.45,
    },
    planner: {
      sensor: "Sony ICX825",
      sensorKind: "mono",
      maker: "Atik",
      kind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Estimation : Sensor size 1392 × 1040 px × 6.45 µm. Atik's own product pages are no longer on its site, the figures are the retailer and spec-sheet listings read in a search extract.",
      makerPages: [
        {
          url: "https://rothervalleyoptics.co.uk/atik-414ex-mono-ccd-camera.html",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "atik-414ex-c",
    type: "camera",
    name: "Atik 414EX Colour",
    order: 147,
    specifications: {
      sensorWidthMm: 8.98,
      sensorHeightMm: 6.71,
      pixelSizeUm: 6.45,
    },
    planner: {
      sensor: "Sony ICX825",
      sensorKind: "colour",
      maker: "Atik",
      kind: "colour",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Estimation : Sensor size 1392 × 1040 px × 6.45 µm. Atik's own product pages are no longer on its site, the figures are the retailer and spec-sheet listings read in a search extract.",
      makerPages: [
        {
          url: "https://rothervalleyoptics.co.uk/atik-414ex-mono-ccd-camera.html",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "atik-460ex-m",
    type: "camera",
    name: "Atik 460EX Mono",
    order: 148,
    specifications: {
      sensorWidthMm: 12.48,
      sensorHeightMm: 9.98,
      pixelSizeUm: 4.54,
    },
    planner: {
      sensor: "Sony ICX694",
      sensorKind: "mono",
      maker: "Atik",
      kind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Estimation : Sensor size 2749 × 2199 px × 4.54 µm. Atik's own product pages are no longer on its site, the figures are the retailer and spec-sheet listings read in a search extract.",
      makerPages: [
        {
          url: "https://optcorp.com/products/atik-460ex-cooled-monochrome-ccd-camera",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "atik-460ex-c",
    type: "camera",
    name: "Atik 460EX Colour",
    order: 149,
    specifications: {
      sensorWidthMm: 12.48,
      sensorHeightMm: 9.98,
      pixelSizeUm: 4.54,
    },
    planner: {
      sensor: "Sony ICX694",
      sensorKind: "colour",
      maker: "Atik",
      kind: "colour",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Estimation : Sensor size 2749 × 2199 px × 4.54 µm. Atik's own product pages are no longer on its site, the figures are the retailer and spec-sheet listings read in a search extract.",
      makerPages: [
        {
          url: "https://optcorp.com/products/atik-460ex-cooled-monochrome-ccd-camera",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "atik-16200-m",
    type: "camera",
    name: "Atik 16200 Mono",
    order: 150,
    specifications: { sensorWidthMm: 27, sensorHeightMm: 21.6, pixelSizeUm: 6 },
    planner: {
      sensor: "Kodak KAF-16200",
      sensorKind: "mono",
      maker: "Atik",
      kind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Estimation : Sensor size 4500 × 3600 px × 6 µm. Atik's own product pages are no longer on its site, the figures are the retailer and spec-sheet listings read in a search extract.",
      makerPages: [
        {
          url: "https://bintel.com.au/products/atik-16200-monochrome-ccd-camera",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "atik-16200-c",
    type: "camera",
    name: "Atik 16200 Colour",
    order: 151,
    specifications: { sensorWidthMm: 27, sensorHeightMm: 21.6, pixelSizeUm: 6 },
    planner: {
      sensor: "Kodak KAF-16200",
      sensorKind: "colour",
      maker: "Atik",
      kind: "colour",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Estimation : Sensor size 4500 × 3600 px × 6 µm. Atik's own product pages are no longer on its site, the figures are the retailer and spec-sheet listings read in a search extract.",
      makerPages: [
        {
          url: "https://bintel.com.au/products/atik-16200-monochrome-ccd-camera",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "atik-horizon-ii-m",
    type: "camera",
    name: "Atik Horizon II Mono",
    order: 152,
    specifications: {
      sensorWidthMm: 17.6,
      sensorHeightMm: 13.3,
      pixelSizeUm: 3.8,
    },
    planner: {
      sensor: "Panasonic MN34230",
      sensorKind: "mono",
      maker: "Atik",
      kind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Estimation : Chip 17.6 × 13.3 mm as printed by the retailer, 4644 × 3506 px × 3.8 µm. Atik's own product pages are no longer on its site, the figures are the retailer and spec-sheet listings read in a search extract.",
      makerPages: [
        {
          url: "https://www.astroshop.eu/astronomical-cameras/atik-camera-horizon-ii-mono/p,64416",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "atik-horizon-ii-c",
    type: "camera",
    name: "Atik Horizon II Colour",
    order: 153,
    specifications: {
      sensorWidthMm: 17.6,
      sensorHeightMm: 13.3,
      pixelSizeUm: 3.8,
    },
    planner: {
      sensor: "Panasonic MN34230",
      sensorKind: "colour",
      maker: "Atik",
      kind: "colour",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Estimation : Chip 17.6 × 13.3 mm as printed by the retailer, 4644 × 3506 px × 3.8 µm. Atik's own product pages are no longer on its site, the figures are the retailer and spec-sheet listings read in a search extract.",
      makerPages: [
        {
          url: "https://www.astroshop.eu/astronomical-cameras/atik-camera-horizon-ii-mono/p,64416",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "pentax-k-3-iii",
    type: "camera",
    name: "Pentax K-3 Mark III",
    order: 154,
    specifications: {
      sensorWidthMm: 23.3,
      sensorHeightMm: 15.5,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "APS-C CMOS",
      sensorKind: "colour",
      maker: "Pentax",
      kind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 23.3 mm / 6192 px = 3.76 um (Ricoh Imaging's page gives the sensor size and the largest recorded image 6192 px wide).",
      makerPages: [
        {
          url: "https://www.ricoh-imaging.co.jp/english/products/k-3-3/spec/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "pentax-k-3-ii",
    type: "camera",
    name: "Pentax K-3 II",
    order: 155,
    specifications: {
      sensorWidthMm: 23.5,
      sensorHeightMm: 15.6,
      pixelSizeUm: 3.91,
    },
    planner: {
      sensor: "APS-C CMOS",
      sensorKind: "colour",
      maker: "Pentax",
      kind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 23.5 mm / 6016 px = 3.91 um (Ricoh Imaging's page gives the sensor size and the largest recorded image 6016 px wide).",
      makerPages: [
        {
          url: "https://www.ricoh-imaging.co.jp/english/products/k-3-2/spec/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "pentax-kp",
    type: "camera",
    name: "Pentax KP",
    order: 156,
    specifications: {
      sensorWidthMm: 23.5,
      sensorHeightMm: 15.6,
      pixelSizeUm: 3.91,
    },
    planner: {
      sensor: "APS-C CMOS",
      sensorKind: "colour",
      maker: "Pentax",
      kind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 23.5 mm / 6016 px = 3.91 um (Ricoh Imaging's page gives the sensor size and the largest recorded image 6016 px wide).",
      makerPages: [
        {
          url: "https://www.ricoh-imaging.co.jp/english/products/kp/spec/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "pentax-k-70",
    type: "camera",
    name: "Pentax K-70",
    order: 157,
    specifications: {
      sensorWidthMm: 23.5,
      sensorHeightMm: 15.6,
      pixelSizeUm: 3.92,
    },
    planner: {
      sensor: "APS-C CMOS",
      sensorKind: "colour",
      maker: "Pentax",
      kind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 23.5 mm / 6000 px = 3.92 um (Ricoh Imaging's page gives the sensor size and the largest recorded image 6000 px wide).",
      makerPages: [
        {
          url: "https://www.ricoh-imaging.co.jp/english/products/k-70/spec/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "pentax-k-s2",
    type: "camera",
    name: "Pentax K-S2",
    order: 158,
    specifications: {
      sensorWidthMm: 23.5,
      sensorHeightMm: 15.6,
      pixelSizeUm: 4.29,
    },
    planner: {
      sensor: "APS-C CMOS",
      sensorKind: "colour",
      maker: "Pentax",
      kind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 23.5 mm / 5472 px = 4.29 um (Ricoh Imaging's page gives the sensor size and the largest recorded image 5472 px wide).",
      makerPages: [
        {
          url: "https://www.ricoh-imaging.co.jp/english/products/k-s2/spec/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "pentax-k-1",
    type: "camera",
    name: "Pentax K-1",
    order: 159,
    specifications: {
      sensorWidthMm: 35.9,
      sensorHeightMm: 24,
      pixelSizeUm: 4.88,
    },
    planner: {
      sensor: "Full-frame CMOS",
      sensorKind: "colour",
      maker: "Pentax",
      kind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 35.9 mm / 7360 px = 4.88 um (Ricoh Imaging's page gives the sensor size and the largest recorded image 7360 px wide).",
      makerPages: [
        {
          url: "https://www.ricoh-imaging.co.jp/english/products/k-1/spec/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "pentax-k-1-ii",
    type: "camera",
    name: "Pentax K-1 Mark II",
    order: 160,
    specifications: {
      sensorWidthMm: 35.9,
      sensorHeightMm: 24,
      pixelSizeUm: 4.88,
    },
    planner: {
      sensor: "Full-frame CMOS",
      sensorKind: "colour",
      maker: "Pentax",
      kind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 35.9 mm / 7360 px = 4.88 um (Ricoh Imaging's page gives the sensor size and the largest recorded image 7360 px wide).",
      makerPages: [
        {
          url: "https://www.ricoh-imaging.co.jp/english/products/k-1-2/spec/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "om-system-om-1",
    type: "camera",
    name: "OM System OM-1",
    order: 161,
    specifications: {
      sensorWidthMm: 17.3,
      sensorHeightMm: 13,
      pixelSizeUm: 3.34,
    },
    planner: {
      sensor: "Four Thirds Live MOS",
      sensorKind: "colour",
      maker: "OM System",
      kind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 17.3 mm / 5184 px = 3.34 um (the maker's page gives the sensor as 17.3 x 13.0 mm and the largest still image 5184 px wide).",
      makerPages: [
        {
          url: "https://explore.omsystem.com/gb/en/om-1",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "om-system-om-1-ii",
    type: "camera",
    name: "OM System OM-1 Mark II",
    order: 162,
    specifications: {
      sensorWidthMm: 17.3,
      sensorHeightMm: 13,
      pixelSizeUm: 3.34,
    },
    planner: {
      sensor: "Four Thirds Live MOS",
      sensorKind: "colour",
      maker: "OM System",
      kind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 17.3 mm / 5184 px = 3.34 um (the maker's page gives the sensor as 17.3 x 13.0 mm and the largest still image 5184 px wide).",
      makerPages: [
        {
          url: "https://explore.omsystem.com/gb/en/om-1-mark-ii",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "om-system-om-5",
    type: "camera",
    name: "OM System OM-5",
    order: 163,
    specifications: {
      sensorWidthMm: 17.3,
      sensorHeightMm: 13,
      pixelSizeUm: 3.34,
    },
    planner: {
      sensor: "Four Thirds Live MOS",
      sensorKind: "colour",
      maker: "OM System",
      kind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 17.3 mm / 5184 px = 3.34 um (the maker's page gives the sensor as 17.3 x 13.0 mm and the largest still image 5184 px wide).",
      makerPages: [
        {
          url: "https://explore.omsystem.com/hu/en/om-5",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "om-system-om-5-ii",
    type: "camera",
    name: "OM System OM-5 Mark II",
    order: 164,
    specifications: {
      sensorWidthMm: 17.3,
      sensorHeightMm: 13,
      pixelSizeUm: 3.34,
    },
    planner: {
      sensor: "Four Thirds Live MOS",
      sensorKind: "colour",
      maker: "OM System",
      kind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 17.3 mm / 5184 px = 3.34 um (the maker's page gives the sensor as 17.3 x 13.0 mm and the largest still image 5184 px wide).",
      makerPages: [
        {
          url: "https://explore.omsystem.com/gb/en/om-5-mark-ii",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "olympus-om-d-e-m10-iv",
    type: "camera",
    name: "OM System OM-D E-M10 Mark IV",
    order: 165,
    specifications: {
      sensorWidthMm: 17.3,
      sensorHeightMm: 13,
      pixelSizeUm: 3.33,
    },
    planner: {
      sensor: "Four Thirds Live MOS",
      sensorKind: "colour",
      maker: "OM System",
      kind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size sqrt(17.3 mm x 13.0 mm / 20.3 million effective pixels) = 3.33 um (the maker's page gives the sensor area and about 20.3 megapixels, no image width is printed).",
      makerPages: [
        {
          url: "https://explore.omsystem.com/dk/en/om-d-e-m10-mark-iv",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "qhyccd-qhy533m",
    type: "camera",
    name: "QHYCCD QHY533M",
    order: 166,
    specifications: {
      sensorWidthMm: 11.3,
      sensorHeightMm: 11.3,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony IMX533",
      sensorKind: "mono",
      maker: "QHYCCD",
      kind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Sensor size 3008 px x 3.76 um = 11.3 mm square (the maker's page gives 9 megapixels effective, 3.76 um pixels and a total pixel area of 3008 x 3028 including optical black, the size in mm is not printed).",
      makerPages: [
        {
          url: "https://www.qhyccd.com/astronomical-camera-qhy533/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "qhyccd-qhy533c",
    type: "camera",
    name: "QHYCCD QHY533C",
    order: 167,
    specifications: {
      sensorWidthMm: 11.3,
      sensorHeightMm: 11.3,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony IMX533",
      sensorKind: "colour",
      maker: "QHYCCD",
      kind: "colour",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Sensor size 3008 px x 3.76 um = 11.3 mm square (the maker's page gives 9 megapixels effective, 3.76 um pixels and a total pixel area of 3008 x 3028 including optical black, the size in mm is not printed).",
      makerPages: [
        {
          url: "https://www.qhyccd.com/astronomical-camera-qhy533/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "qhyccd-qhy174gps",
    type: "camera",
    name: "QHYCCD QHY174GPS",
    order: 168,
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
      makerPages: [
        {
          url: "https://www.qhyccd.com/qhy174gps-imx174-scientific-cooled-camera/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "qhyccd-minicam8m",
    type: "camera",
    name: "QHYCCD miniCAM8M",
    order: 169,
    specifications: {
      sensorWidthMm: 11.14,
      sensorHeightMm: 6.26,
      pixelSizeUm: 2.9,
    },
    planner: {
      sensor: "Sony IMX585",
      sensorKind: "mono",
      maker: "QHYCCD",
      kind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Sensor size 3840 x 2160 px x 2.9 um (the maker's page gives about 8 megapixels effective, 2.9 um pixels and a total pixel area of 3856 x 2180, the size in mm is not printed).",
      makerPages: [
        {
          url: "https://www.qhyccd.com/minicam8-imx585/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "qhyccd-minicam8c",
    type: "camera",
    name: "QHYCCD miniCAM8C",
    order: 170,
    specifications: {
      sensorWidthMm: 11.14,
      sensorHeightMm: 6.26,
      pixelSizeUm: 2.9,
    },
    planner: {
      sensor: "Sony IMX585",
      sensorKind: "colour",
      maker: "QHYCCD",
      kind: "colour",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Sensor size 3840 x 2160 px x 2.9 um (the maker's page gives about 8 megapixels effective, 2.9 um pixels and a total pixel area of 3856 x 2180, the size in mm is not printed).",
      makerPages: [
        {
          url: "https://www.qhyccd.com/minicam8-imx585/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "tele-vue-plossl-8",
    type: "eyepiece",
    name: "Tele Vue Plössl 8 mm",
    order: 165,
    specifications: { focalLengthMm: 8, apparentFieldDegrees: 50 },
    planner: {
      maker: "Tele Vue",
      kind: "plossl",
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-plossl-11",
    type: "eyepiece",
    name: "Tele Vue Plössl 11 mm",
    order: 166,
    specifications: { focalLengthMm: 11, apparentFieldDegrees: 50 },
    planner: {
      maker: "Tele Vue",
      kind: "plossl",
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-plossl-15",
    type: "eyepiece",
    name: "Tele Vue Plössl 15 mm",
    order: 167,
    specifications: { focalLengthMm: 15, apparentFieldDegrees: 50 },
    planner: {
      maker: "Tele Vue",
      kind: "plossl",
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-plossl-20",
    type: "eyepiece",
    name: "Tele Vue Plössl 20 mm",
    order: 168,
    specifications: { focalLengthMm: 20, apparentFieldDegrees: 50 },
    planner: {
      maker: "Tele Vue",
      kind: "plossl",
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-plossl-25",
    type: "eyepiece",
    name: "Tele Vue Plössl 25 mm",
    order: 169,
    specifications: { focalLengthMm: 25, apparentFieldDegrees: 50 },
    planner: {
      maker: "Tele Vue",
      kind: "plossl",
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-plossl-32",
    type: "eyepiece",
    name: "Tele Vue Plössl 32 mm",
    order: 170,
    specifications: { focalLengthMm: 32, apparentFieldDegrees: 50 },
    planner: {
      maker: "Tele Vue",
      kind: "plossl",
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-plossl-40",
    type: "eyepiece",
    name: "Tele Vue Plössl 40 mm",
    order: 171,
    specifications: { focalLengthMm: 40, apparentFieldDegrees: 43 },
    planner: {
      maker: "Tele Vue",
      kind: "plossl",
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-plossl-55",
    type: "eyepiece",
    name: "Tele Vue Plössl 55 mm",
    order: 172,
    specifications: { focalLengthMm: 55, apparentFieldDegrees: 50 },
    planner: {
      maker: "Tele Vue",
      kind: "plossl",
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-delite-3",
    type: "eyepiece",
    name: "Tele Vue DeLite 3 mm",
    order: 173,
    specifications: { focalLengthMm: 3, apparentFieldDegrees: 62 },
    planner: {
      maker: "Tele Vue",
      kind: "wide-field",
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-delite-4",
    type: "eyepiece",
    name: "Tele Vue DeLite 4 mm",
    order: 174,
    specifications: { focalLengthMm: 4, apparentFieldDegrees: 62 },
    planner: {
      maker: "Tele Vue",
      kind: "wide-field",
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-delite-5",
    type: "eyepiece",
    name: "Tele Vue DeLite 5 mm",
    order: 175,
    specifications: { focalLengthMm: 5, apparentFieldDegrees: 62 },
    planner: {
      maker: "Tele Vue",
      kind: "wide-field",
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-delite-7",
    type: "eyepiece",
    name: "Tele Vue DeLite 7 mm",
    order: 176,
    specifications: { focalLengthMm: 7, apparentFieldDegrees: 62 },
    planner: {
      maker: "Tele Vue",
      kind: "wide-field",
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-delite-9",
    type: "eyepiece",
    name: "Tele Vue DeLite 9 mm",
    order: 177,
    specifications: { focalLengthMm: 9, apparentFieldDegrees: 62 },
    planner: {
      maker: "Tele Vue",
      kind: "wide-field",
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-delite-11",
    type: "eyepiece",
    name: "Tele Vue DeLite 11 mm",
    order: 178,
    specifications: { focalLengthMm: 11, apparentFieldDegrees: 62 },
    planner: {
      maker: "Tele Vue",
      kind: "wide-field",
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-delite-13",
    type: "eyepiece",
    name: "Tele Vue DeLite 13 mm",
    order: 179,
    specifications: { focalLengthMm: 13, apparentFieldDegrees: 62 },
    planner: {
      maker: "Tele Vue",
      kind: "wide-field",
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-delite-15",
    type: "eyepiece",
    name: "Tele Vue DeLite 15 mm",
    order: 180,
    specifications: { focalLengthMm: 15, apparentFieldDegrees: 62 },
    planner: {
      maker: "Tele Vue",
      kind: "wide-field",
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-delite-18-2",
    type: "eyepiece",
    name: "Tele Vue DeLite 18,2 mm",
    order: 181,
    specifications: { focalLengthMm: 18.2, apparentFieldDegrees: 62 },
    planner: {
      maker: "Tele Vue",
      kind: "wide-field",
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-nagler-type-7-5-5",
    type: "eyepiece",
    name: "Tele Vue Nagler Type 7 5,5 mm",
    order: 182,
    specifications: { focalLengthMm: 5.5, apparentFieldDegrees: 82 },
    planner: {
      maker: "Tele Vue",
      kind: "ultra-wide-field",
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-nagler-type-7-9",
    type: "eyepiece",
    name: "Tele Vue Nagler Type 7 9 mm",
    order: 183,
    specifications: { focalLengthMm: 9, apparentFieldDegrees: 82 },
    planner: {
      maker: "Tele Vue",
      kind: "ultra-wide-field",
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-nagler-type-7-14",
    type: "eyepiece",
    name: "Tele Vue Nagler Type 7 14 mm",
    order: 184,
    specifications: { focalLengthMm: 14, apparentFieldDegrees: 82 },
    planner: {
      maker: "Tele Vue",
      kind: "ultra-wide-field",
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-nagler-type-7-19",
    type: "eyepiece",
    name: "Tele Vue Nagler Type 7 19 mm",
    order: 185,
    specifications: { focalLengthMm: 19, apparentFieldDegrees: 82 },
    planner: {
      maker: "Tele Vue",
      kind: "ultra-wide-field",
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-nagler-type-6-13",
    type: "eyepiece",
    name: "Tele Vue Nagler Type 6 13 mm",
    order: 186,
    specifications: { focalLengthMm: 13, apparentFieldDegrees: 82 },
    planner: {
      maker: "Tele Vue",
      kind: "ultra-wide-field",
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-nagler-type-4-22",
    type: "eyepiece",
    name: "Tele Vue Nagler Type 4 22 mm",
    order: 187,
    specifications: { focalLengthMm: 22, apparentFieldDegrees: 82 },
    planner: {
      maker: "Tele Vue",
      kind: "ultra-wide-field",
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-ethos-sx-4-7",
    type: "eyepiece",
    name: "Tele Vue Ethos SX 4,7 mm",
    order: 188,
    specifications: { focalLengthMm: 4.7, apparentFieldDegrees: 110 },
    planner: {
      maker: "Tele Vue",
      kind: "ultra-wide-field",
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-ethos-sx-3-7",
    type: "eyepiece",
    name: "Tele Vue Ethos SX 3,7 mm",
    order: 189,
    specifications: { focalLengthMm: 3.7, apparentFieldDegrees: 110 },
    planner: {
      maker: "Tele Vue",
      kind: "ultra-wide-field",
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-wave-150i",
    type: "mount",
    name: "Sky-Watcher Wave 150i",
    order: 40,
    specifications: {},
    planner: {
      maker: "Sky-Watcher",
      kind: "hybrid",
      makerPages: [
        {
          url: "https://www.skywatcher.com/product/wave-150i/",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "zwo-am3",
    type: "mount",
    name: "ZWO AM3",
    order: 41,
    specifications: {},
    planner: {
      maker: "ZWO",
      kind: "hybrid",
      makerPages: [
        { url: "https://www.zwoastro.com/product/am3/", readOn: "2026-11-05" },
      ],
    },
  },
  {
    id: "skywatcher-wave-100i",
    type: "mount",
    name: "Sky-Watcher Wave 100i",
    order: 42,
    specifications: {},
    planner: {
      maker: "Sky-Watcher",
      kind: "hybrid",
      calculated: ["kind"],
      calculation:
        "Estimation : equatorial or alt-azimuth mode read in a search extract of the Agena Astro retailer page for the Wave 100i (the Wave 150i page of the maker states both modes).",
      makerPages: [
        {
          url: "https://agenaastro.com/skywatcher-wave-100i-sky-watcher-mount-strain-wave-drive-s30900.html",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-antlia-alp-t-5nm",
    type: "filter",
    name: "Antlia ALP-T Dual Band 5 nm Ha/OIII",
    order: 27,
    specifications: { forAllEquipment: false },
    planner: {
      family: "dual",
      maker: "Antlia",
      makerPages: [
        {
          url: "https://firstlightoptics.com/narrowband/antlia-alp-t-dual-band-5nm-filter.html",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-idas-nbz-ii",
    type: "filter",
    name: "IDAS NBZ-II Dual Band",
    order: 28,
    specifications: { forAllEquipment: false },
    planner: {
      family: "dual",
      maker: "IDAS",
      makerPages: [
        {
          url: "https://firstlightoptics.com/idas-filters/idas-nbz-ii-dual-band-nebula-boost-filter.html",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-idas-nb1",
    type: "filter",
    name: "IDAS NB1 Nebula Booster",
    order: 29,
    specifications: { forAllEquipment: false },
    planner: {
      family: "uhc",
      maker: "IDAS",
      makerPages: [
        {
          url: "https://www.astroshop.eu/schmalbandfilter-uhc/idas-filter-nebula-booster-nb1-48mm/p,61148",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-baader-uhc-s",
    type: "filter",
    name: "Baader UHC-S",
    order: 30,
    specifications: { forAllEquipment: false },
    planner: {
      family: "uhc",
      maker: "Baader",
      makerPages: [
        {
          url: "https://optcorp.com/products/baader-fuhc-1-uhc-s-nebula-filter-1-25inch",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-baader-oiii-10nm",
    type: "filter",
    name: "Baader O-III 10 nm",
    order: 31,
    specifications: { forAllEquipment: false },
    planner: {
      family: "oiii",
      maker: "Baader",
      makerPages: [
        {
          url: "https://www.apm-telescopes.net/en/baader-o-iii-nebelfilter-125-10-nm-hwb-2",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-baader-oiii-4-5nm",
    type: "filter",
    name: "Baader O-III 4,5 nm Ultra-Narrowband",
    order: 32,
    specifications: { forAllEquipment: false },
    planner: {
      family: "oiii",
      maker: "Baader",
      makerPages: [
        {
          url: "https://agenaastro.com/baader-ultra-narrowband-o-iii-4-5nm-ccd-filter-with-lpfc-2-foiiinu-2-2458434w.html",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-baader-ha-7nm",
    type: "filter",
    name: "Baader H-alpha 7 nm",
    order: 33,
    specifications: { forAllEquipment: false },
    planner: {
      family: "ha",
      maker: "Baader",
      makerPages: [
        {
          url: "https://www.astroshop.eu/h-alpha-filters/baader-narrow-band-h-alpha-filter-7nm-2-flat-optically-polished-/p,10896",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-baader-ha-6-5nm-cmos",
    type: "filter",
    name: "Baader H-alpha 6,5 nm CMOS-optimized",
    order: 34,
    specifications: { forAllEquipment: false },
    planner: {
      family: "ha",
      maker: "Baader",
      makerPages: [
        {
          url: "https://www.highpointscientific.com/baader-h-alpha-2-inch-narrowband-cmos-optimized-6-5nm-filter-fchaln-2",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-baader-ha-3-5nm-cmos",
    type: "filter",
    name: "Baader H-alpha 3,5 nm Ultra-Narrowband",
    order: 35,
    specifications: { forAllEquipment: false },
    planner: {
      family: "ha",
      maker: "Baader",
      makerPages: [
        {
          url: "https://www.highpointscientific.com/baader-h-alpha-2-inch-ultra-narrowband-cmos-optimized-3-5nm-filter-fchalnu-2",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-chroma-ha-3nm",
    type: "filter",
    name: "Chroma H-alpha 3 nm",
    order: 36,
    specifications: { forAllEquipment: false },
    planner: {
      family: "ha",
      maker: "Chroma",
      makerPages: [
        {
          url: "https://www.astroshop.eu/filters/15_15/m,Chroma-Astronomy",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-chroma-oiii-3nm",
    type: "filter",
    name: "Chroma OIII 3 nm",
    order: 37,
    specifications: { forAllEquipment: false },
    planner: {
      family: "oiii",
      maker: "Chroma",
      makerPages: [
        {
          url: "https://www.astroshop.eu/filters/15_15/m,Chroma-Astronomy",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-chroma-sii-3nm",
    type: "filter",
    name: "Chroma SII 3 nm",
    order: 38,
    specifications: { forAllEquipment: false },
    planner: {
      family: "sii",
      maker: "Chroma",
      makerPages: [
        {
          url: "https://www.astroshop.eu/filters/15_15/m,Chroma-Astronomy",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-chroma-ha-5nm",
    type: "filter",
    name: "Chroma H-alpha 5 nm",
    order: 39,
    specifications: { forAllEquipment: false },
    planner: {
      family: "ha",
      maker: "Chroma",
      makerPages: [
        {
          url: "https://www.astroshop.eu/filters/15_15/m,Chroma-Astronomy",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-chroma-oiii-5nm",
    type: "filter",
    name: "Chroma OIII 5 nm",
    order: 40,
    specifications: { forAllEquipment: false },
    planner: {
      family: "oiii",
      maker: "Chroma",
      makerPages: [
        {
          url: "https://www.astroshop.eu/filters/15_15/m,Chroma-Astronomy",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-chroma-sii-5nm",
    type: "filter",
    name: "Chroma SII 5 nm",
    order: 41,
    specifications: { forAllEquipment: false },
    planner: {
      family: "sii",
      maker: "Chroma",
      makerPages: [
        {
          url: "https://www.astroshop.eu/filters/15_15/m,Chroma-Astronomy",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-chroma-lrgb",
    type: "filter",
    name: "Chroma LRGB",
    order: 42,
    specifications: { forAllEquipment: false },
    planner: {
      family: "broadband",
      maker: "Chroma",
      makerPages: [
        {
          url: "https://www.astroshop.eu/filters/15_15/m,Chroma-Astronomy",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-optolong-l-quad-enhance",
    type: "filter",
    name: "Optolong L-Quad Enhance",
    order: 43,
    specifications: { forAllEquipment: false },
    planner: {
      family: "dual",
      maker: "Optolong",
      makerPages: [
        {
          url: "https://www.optolong.com/cms/document/detail/id/286.html",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-svbony-sv220",
    type: "filter",
    name: "Svbony SV220 Dual-Band 7 nm",
    order: 44,
    specifications: { forAllEquipment: false },
    planner: {
      family: "dual",
      maker: "Svbony",
      makerPages: [
        {
          url: "https://svbony.com/sv220-dual-band-7nm-nebula-filter",
          readOn: "2026-11-05",
        },
      ],
    },
  },
  {
    id: "filter-astronomik-cls",
    type: "filter",
    name: "Astronomik CLS",
    order: 45,
    specifications: { forAllEquipment: false },
    planner: {
      family: "broadband",
      maker: "Astronomik",
      makerPages: [
        {
          url: "https://optcorp.com/products/astronomik-cls-light-pollution-filter-2-round-mounted",
          readOn: "2026-11-05",
        },
      ],
    },
  },
]);

const literal = (value) =>
  value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;

/**
 * The statements of migration 133: one idempotent insert per row (SQLite and
 * PostgreSQL alike), so that an identifier already taken is never
 * overwritten. The migration runner cuts the text at every « ; »: no value of
 * a row holds one.
 */
export function equipmentCatalogue5SeedSql() {
  return EQUIPMENT_CATALOGUE_5_SEED.map(
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
