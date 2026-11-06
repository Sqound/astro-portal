/**
 * The third catalogue of the « Matériel par défaut » (migration 107
 * `telescope-catalogue-3`): the refractors, Newtonians, Dobsonians,
 * Schmidt-Cassegrain and Maksutov telescopes, the eyepieces, the cameras
 * (astronomy cameras, DSLR and mirrorless) and the Barlows and focal
 * reducers that the first catalogues lacked, as `equipment` rows of scope
 * `default` held by the platform organisation, each with the profile's own
 * identifier and its `preference_order` continuing the last value of its
 * kind. The rows are a frozen copy of
 * `packages/planner/src/common-equipment-profiles.json` as it was when the
 * migration was written: a migration is history, a later change of that file
 * does not rewrite it. `ON CONFLICT DO NOTHING`: a row the administration
 * already holds under the same identifier, edited, hidden or archived, is
 * never rewritten. Every value carries the pages it was read on; a value
 * that is not the maker's says so in its `calculation` (« Estimation : »).
 * The Barlows and reducers are `lens` rows, as migration 55's.
 */

import { PLATFORM_ORGANIZATION_ID } from "./default-equipment-seed.js";

const SEEDED_AT = "2026-10-30T00:00:00.000Z";

/** `{ id, type, name, order, specifications, planner }`, as migration 55's. */
export const TELESCOPE_CATALOGUE_3_SEED = Object.freeze([
  {
    id: "altair-starwave-115-f7",
    type: "telescope",
    name: "Altair Starwave 115 F7 ED Triplet",
    order: 47,
    specifications: { apertureMm: 115, focalLengthMm: 805 },
    planner: {
      group: "refractors",
      maker: "Altair Astro",
      makerPages: [
        {
          url: "https://www.altairastro.com/altair-starwave-115-f7-ed-triplet-refractor-9198-p.asp",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "altair-starwave-130-f7",
    type: "telescope",
    name: "Altair Starwave 130 F7 ED Triplet",
    order: 48,
    specifications: { apertureMm: 130, focalLengthMm: 910 },
    planner: {
      group: "refractors",
      maker: "Altair Astro",
      makerPages: [
        {
          url: "https://www.altairastro.com/altair-starwave-130-f7-ed-triplet-refractor-11911-p.asp",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "altair-starwave-ascent-70ed",
    type: "telescope",
    name: "Altair Starwave Ascent 70ED",
    order: 49,
    specifications: { apertureMm: 70, focalLengthMm: 420 },
    planner: {
      group: "refractors",
      maker: "Altair Astro",
      makerPages: [
        {
          url: "https://www.altairastro.com/starwave-ascent-70ed-telescope---visual-and-astrophotography-bundle-464-p.asp",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "altair-starwave-ascent-80ed",
    type: "telescope",
    name: "Altair Starwave Ascent 80ED Triplet",
    order: 50,
    specifications: { apertureMm: 80, focalLengthMm: 480 },
    planner: {
      group: "refractors",
      maker: "Altair Astro",
      makerPages: [
        {
          url: "https://www.altairastro.com/starwave-ascent-80mm-ed-triplet-apo-f48-astrograph-465-p.asp",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "askar-50p",
    type: "telescope",
    name: "Askar 50P",
    order: 51,
    specifications: { apertureMm: 50, focalLengthMm: 190 },
    planner: {
      group: "refractors",
      maker: "Askar",
      makerPages: [
        {
          url: "https://www.sharpstar-optics.com/Products_1/50P.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "askar-60f",
    type: "telescope",
    name: "Askar 60F",
    order: 52,
    specifications: { apertureMm: 60, focalLengthMm: 408 },
    planner: {
      group: "refractors",
      maker: "Askar",
      makerPages: [
        {
          url: "https://www.sharpstar-optics.com/Products_1/60F.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "askar-65phq",
    type: "telescope",
    name: "Askar 65PHQ",
    order: 53,
    specifications: { apertureMm: 65, focalLengthMm: 416 },
    planner: {
      group: "refractors",
      maker: "Askar",
      makerPages: [
        {
          url: "https://www.sharpstar-optics.com/Products_1/39.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "askar-71f",
    type: "telescope",
    name: "Askar 71F",
    order: 54,
    specifications: { apertureMm: 71, focalLengthMm: 490 },
    planner: {
      group: "refractors",
      maker: "Askar",
      makerPages: [
        {
          url: "https://www.sharpstar-optics.com/Products_1/101.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "askar-80ed",
    type: "telescope",
    name: "Askar 80ED",
    order: 55,
    specifications: { apertureMm: 80, focalLengthMm: 560 },
    planner: {
      group: "refractors",
      maker: "Askar",
      makerPages: [
        {
          url: "https://www.sharpstar-optics.com/Products_1/80ED.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "askar-80phq",
    type: "telescope",
    name: "Askar 80PHQ",
    order: 56,
    specifications: { apertureMm: 80, focalLengthMm: 600 },
    planner: {
      group: "refractors",
      maker: "Askar",
      makerPages: [
        {
          url: "https://www.sharpstar-optics.com/Products_1/1.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "askar-91f",
    type: "telescope",
    name: "Askar 91F",
    order: 57,
    specifications: { apertureMm: 91, focalLengthMm: 609 },
    planner: {
      group: "refractors",
      maker: "Askar",
      makerPages: [
        {
          url: "https://www.sharpstar-optics.com/Products_1/91F.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "askar-103apo",
    type: "telescope",
    name: "Askar 103APO",
    order: 58,
    specifications: { apertureMm: 103, focalLengthMm: 700.4 },
    planner: {
      group: "refractors",
      maker: "Askar",
      makerPages: [
        {
          url: "https://www.sharpstar-optics.com/Products_1/79.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "askar-107phq",
    type: "telescope",
    name: "Askar 107PHQ",
    order: 59,
    specifications: { apertureMm: 107, focalLengthMm: 749 },
    planner: {
      group: "refractors",
      maker: "Askar",
      makerPages: [
        {
          url: "https://www.sharpstar-optics.com/Products_1/28.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "askar-111f",
    type: "telescope",
    name: "Askar 111F",
    order: 60,
    specifications: { apertureMm: 111, focalLengthMm: 766 },
    planner: {
      group: "refractors",
      maker: "Askar",
      makerPages: [
        {
          url: "https://www.sharpstar-optics.com/Products_1/111F.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "askar-120apo",
    type: "telescope",
    name: "Askar 120APO",
    order: 61,
    specifications: { apertureMm: 120, focalLengthMm: 840 },
    planner: {
      group: "refractors",
      maker: "Askar",
      makerPages: [
        {
          url: "https://www.sharpstar-optics.com/Products_1/84.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "askar-130phq",
    type: "telescope",
    name: "Askar 130PHQ",
    order: 62,
    specifications: { apertureMm: 130, focalLengthMm: 1000 },
    planner: {
      group: "refractors",
      maker: "Askar",
      makerPages: [
        {
          url: "https://www.sharpstar-optics.com/Products_1/78.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "askar-131f",
    type: "telescope",
    name: "Askar 131F",
    order: 63,
    specifications: { apertureMm: 131, focalLengthMm: 983 },
    planner: {
      group: "refractors",
      maker: "Askar",
      makerPages: [
        {
          url: "https://www.sharpstar-optics.com/Products_1/131F.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "askar-140apo",
    type: "telescope",
    name: "Askar 140APO",
    order: 64,
    specifications: { apertureMm: 140, focalLengthMm: 980 },
    planner: {
      group: "refractors",
      maker: "Askar",
      makerPages: [
        {
          url: "https://www.sharpstar-optics.com/Products_1/90.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "askar-151phq",
    type: "telescope",
    name: "Askar 151PHQ",
    order: 65,
    specifications: { apertureMm: 151, focalLengthMm: 1057 },
    planner: {
      group: "refractors",
      maker: "Askar",
      makerPages: [
        {
          url: "https://www.sharpstar-optics.com/Products_1/70.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "askar-160apo",
    type: "telescope",
    name: "Askar 160APO",
    order: 66,
    specifications: { apertureMm: 160, focalLengthMm: 1120 },
    planner: {
      group: "refractors",
      maker: "Askar",
      makerPages: [
        {
          url: "https://www.sharpstar-optics.com/Products_1/160APO.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "askar-185apo",
    type: "telescope",
    name: "Askar 185APO",
    order: 67,
    specifications: { apertureMm: 185, focalLengthMm: 1295 },
    planner: {
      group: "refractors",
      maker: "Askar",
      makerPages: [
        {
          url: "https://www.sharpstar-optics.com/Products_1/93.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "askar-203apo",
    type: "telescope",
    name: "Askar 203APO",
    order: 68,
    specifications: { apertureMm: 203, focalLengthMm: 1421 },
    planner: {
      group: "refractors",
      maker: "Askar",
      makerPages: [
        {
          url: "https://www.sharpstar-optics.com/Products_1/203APO.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "askar-fma135",
    type: "telescope",
    name: "Askar FMA135",
    order: 69,
    specifications: { apertureMm: 30, focalLengthMm: 135 },
    planner: {
      group: "refractors",
      maker: "Askar",
      makerPages: [
        {
          url: "https://www.sharpstar-optics.com/Products_1/32.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "askar-fma180pro",
    type: "telescope",
    name: "Askar FMA180 Pro",
    order: 70,
    specifications: { apertureMm: 40, focalLengthMm: 180 },
    planner: {
      group: "refractors",
      maker: "Askar",
      makerPages: [
        {
          url: "https://www.sharpstar-optics.com/Products_1/69.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "askar-fra500",
    type: "telescope",
    name: "Askar FRA500",
    order: 71,
    specifications: { apertureMm: 90, focalLengthMm: 500 },
    planner: {
      group: "refractors",
      maker: "Askar",
      makerPages: [
        {
          url: "https://www.sharpstar-optics.com/Products_1/35.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "askar-fra600",
    type: "telescope",
    name: "Askar FRA600",
    order: 72,
    specifications: { apertureMm: 108, focalLengthMm: 600 },
    planner: {
      group: "refractors",
      maker: "Askar",
      makerPages: [
        {
          url: "https://www.sharpstar-optics.com/Products_1/36.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "askar-sqa55",
    type: "telescope",
    name: "Askar SQA55",
    order: 73,
    specifications: { apertureMm: 55, focalLengthMm: 264 },
    planner: {
      group: "refractors",
      maker: "Askar",
      makerPages: [
        {
          url: "https://www.sharpstar-optics.com/Products_1/SQA55.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "askar-sqa60pro",
    type: "telescope",
    name: "Askar SQA60 Pro",
    order: 74,
    specifications: { apertureMm: 60, focalLengthMm: 276 },
    planner: {
      group: "refractors",
      maker: "Askar",
      makerPages: [
        {
          url: "https://www.sharpstar-optics.com/Products_1/SQA60PRO.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "askar-sqa70",
    type: "telescope",
    name: "Askar SQA70",
    order: 75,
    specifications: { apertureMm: 70, focalLengthMm: 336 },
    planner: {
      group: "refractors",
      maker: "Askar",
      makerPages: [
        {
          url: "https://www.sharpstar-optics.com/Products_1/SQA70.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "askar-sqa85",
    type: "telescope",
    name: "Askar SQA85",
    order: 76,
    specifications: { apertureMm: 85, focalLengthMm: 408 },
    planner: {
      group: "refractors",
      maker: "Askar",
      makerPages: [
        {
          url: "https://www.sharpstar-optics.com/Products_1/SQA85.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "askar-sqa106",
    type: "telescope",
    name: "Askar SQA106",
    order: 77,
    specifications: { apertureMm: 106, focalLengthMm: 509 },
    planner: {
      group: "refractors",
      maker: "Askar",
      makerPages: [
        {
          url: "https://www.sharpstar-optics.com/Products_1/SQA106.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "askar-sqa130",
    type: "telescope",
    name: "Askar SQA130",
    order: 78,
    specifications: { apertureMm: 130, focalLengthMm: 624 },
    planner: {
      group: "refractors",
      maker: "Askar",
      makerPages: [
        {
          url: "https://www.sharpstar-optics.com/Products_1/SQA130.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "bresser-messier-ar-102-1000",
    type: "telescope",
    name: "Bresser Messier AR-102/1000",
    order: 79,
    specifications: { apertureMm: 102, focalLengthMm: 1000 },
    planner: {
      group: "refractors",
      maker: "Bresser",
      makerPages: [
        {
          url: "https://www.bresser.com/p/bresser-messier-ar-102-1000-hexafoc-optical-tube-assembly-4802100",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "bresser-messier-ar-102s-600",
    type: "telescope",
    name: "Bresser Messier AR-102s/600",
    order: 80,
    specifications: { apertureMm: 102, focalLengthMm: 600 },
    planner: {
      group: "refractors",
      maker: "Bresser",
      makerPages: [
        {
          url: "https://www.bresser.com/p/bresser-messier-ar-102s-600-hexafoc-ota-4802600",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "bresser-messier-ar-102xs-460",
    type: "telescope",
    name: "Bresser Messier AR-102xs/460",
    order: 81,
    specifications: { apertureMm: 102, focalLengthMm: 460 },
    planner: {
      group: "refractors",
      maker: "Bresser",
      makerPages: [
        {
          url: "https://www.bresser.com/p/bresser-messier-ar-102xs-460-hexafoc-optical-tube-4802460",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "bresser-messier-ar-127l-1200",
    type: "telescope",
    name: "Bresser Messier AR-127L/1200",
    order: 82,
    specifications: { apertureMm: 127, focalLengthMm: 1200 },
    planner: {
      group: "refractors",
      maker: "Bresser",
      makerPages: [
        {
          url: "https://www.bresser.com/p/bresser-messier-ar-127l-1200-hexafoc-optical-tube-4827120",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "bresser-messier-ar-127s-635",
    type: "telescope",
    name: "Bresser Messier AR-127S/635",
    order: 83,
    specifications: { apertureMm: 127, focalLengthMm: 635 },
    planner: {
      group: "refractors",
      maker: "Bresser",
      makerPages: [
        {
          url: "https://www.bresser.com/p/bresser-messier-ar-127s-635-ota-optical-tube-hexafoc-4827635",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "bresser-messier-ar-152l-1200",
    type: "telescope",
    name: "Bresser Messier AR-152L/1200",
    order: 84,
    specifications: { apertureMm: 152, focalLengthMm: 1200 },
    planner: {
      group: "refractors",
      maker: "Bresser",
      makerPages: [
        {
          url: "https://www.bresser.com/p/bresser-messier-ar-152l-1200-hexafoc-optical-tube-4852120",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "bresser-messier-ar-152s-760",
    type: "telescope",
    name: "Bresser Messier AR-152S/760",
    order: 85,
    specifications: { apertureMm: 152, focalLengthMm: 760 },
    planner: {
      group: "refractors",
      maker: "Bresser",
      makerPages: [
        {
          url: "https://www.bresser.com/p/bresser-messier-ar-152s-760-hexafoc-optical-tube-4852760",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-astromaster-102az",
    type: "telescope",
    name: "Celestron AstroMaster 102AZ",
    order: 86,
    specifications: { apertureMm: 102, focalLengthMm: 660 },
    planner: {
      group: "refractors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/astromaster-102az-telescope",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-astromaster-lt-70az",
    type: "telescope",
    name: "Celestron AstroMaster LT 70AZ",
    order: 87,
    specifications: { apertureMm: 70, focalLengthMm: 700 },
    planner: {
      group: "refractors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/astromaster-lt-70az-telescope",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-inspire-100az",
    type: "telescope",
    name: "Celestron Inspire 100AZ",
    order: 88,
    specifications: { apertureMm: 100, focalLengthMm: 660 },
    planner: {
      group: "refractors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/inspire-100az-refractor-telescope",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-omni-xlt-102",
    type: "telescope",
    name: "Celestron Omni XLT 102",
    order: 89,
    specifications: { apertureMm: 102, focalLengthMm: 1000 },
    planner: {
      group: "refractors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/omni-xlt-102-telescope",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-omni-xlt-102-ed",
    type: "telescope",
    name: "Celestron Omni XLT 102 ED",
    order: 90,
    specifications: { apertureMm: 102, focalLengthMm: 900 },
    planner: {
      group: "refractors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/omni-xlt-102-ed-telescope",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-omni-xlt-120",
    type: "telescope",
    name: "Celestron Omni XLT 120",
    order: 91,
    specifications: { apertureMm: 120, focalLengthMm: 1000 },
    planner: {
      group: "refractors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/omni-xlt-120-telescope",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-omni-xlt-150",
    type: "telescope",
    name: "Celestron Omni XLT 150",
    order: 92,
    specifications: { apertureMm: 150, focalLengthMm: 750 },
    planner: {
      group: "refractors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/omni-xlt-150-refractor-telescope",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-powerseeker-80eq",
    type: "telescope",
    name: "Celestron PowerSeeker 80EQ",
    order: 93,
    specifications: { apertureMm: 80, focalLengthMm: 900 },
    planner: {
      group: "refractors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/powerseeker-80eq-telescope",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-starsense-explorer-dx-102az",
    type: "telescope",
    name: "Celestron StarSense Explorer DX 102AZ",
    order: 94,
    specifications: { apertureMm: 102, focalLengthMm: 660 },
    planner: {
      group: "refractors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/starsense-explorer-dx-102az",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-starsense-explorer-lt-80az",
    type: "telescope",
    name: "Celestron StarSense Explorer LT 80AZ",
    order: 95,
    specifications: { apertureMm: 80, focalLengthMm: 900 },
    planner: {
      group: "refractors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/starsense-explorer-lt-80az",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-travel-scope-80",
    type: "telescope",
    name: "Celestron Travel Scope 80",
    order: 96,
    specifications: { apertureMm: 80, focalLengthMm: 400 },
    planner: {
      group: "refractors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/travel-scope-80-portable-telescope-with-smartphone-adapter",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "explore-scientific-ed80-fcd100",
    type: "telescope",
    name: "Explore Scientific ED80 FCD100",
    order: 97,
    specifications: { apertureMm: 80, focalLengthMm: 480 },
    planner: {
      group: "refractors",
      maker: "Explore Scientific",
      makerPages: [
        {
          url: "https://cdn.shopify.com/s/files/1/0390/6029/files/ExploreScientific_Catalog_2023_803c0658-dbb4-42a9-9cbe-42a39d079faf.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "explore-scientific-ed102-fcd100",
    type: "telescope",
    name: "Explore Scientific ED102 FCD100",
    order: 98,
    specifications: { apertureMm: 102, focalLengthMm: 714 },
    planner: {
      group: "refractors",
      maker: "Explore Scientific",
      makerPages: [
        {
          url: "https://cdn.shopify.com/s/files/1/0390/6029/files/ExploreScientific_Catalog_2023_803c0658-dbb4-42a9-9cbe-42a39d079faf.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "explore-scientific-ed127-fcd100",
    type: "telescope",
    name: "Explore Scientific ED127 FCD100",
    order: 99,
    specifications: { apertureMm: 127, focalLengthMm: 952 },
    planner: {
      group: "refractors",
      maker: "Explore Scientific",
      makerPages: [
        {
          url: "https://cdn.shopify.com/s/files/1/0390/6029/files/ExploreScientific_Catalog_2023_803c0658-dbb4-42a9-9cbe-42a39d079faf.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "explore-scientific-ed152-apochromatic",
    type: "telescope",
    name: "Explore Scientific ED152 Apochromatic",
    order: 100,
    specifications: { apertureMm: 152, focalLengthMm: 1216 },
    planner: {
      group: "refractors",
      maker: "Explore Scientific",
      makerPages: [
        {
          url: "https://cdn.shopify.com/s/files/1/0390/6029/files/ExploreScientific_Catalog_2023_803c0658-dbb4-42a9-9cbe-42a39d079faf.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "meade-infinity-70",
    type: "telescope",
    name: "Meade Infinity 70",
    order: 101,
    specifications: { apertureMm: 70, focalLengthMm: 700 },
    planner: {
      group: "refractors",
      maker: "Meade",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : aperture and focal length read on the Levenhuk (Meade EU distributor) product page (maker's own page not reachable).",
      makerPages: [
        {
          url: "https://eu.levenhuk.com/catalogue/telescopes/meade-infinity-70mm-az-refractor-telescope/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "meade-infinity-90",
    type: "telescope",
    name: "Meade Infinity 90",
    order: 102,
    specifications: { apertureMm: 90, focalLengthMm: 600 },
    planner: {
      group: "refractors",
      maker: "Meade",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : aperture and focal length read on the Levenhuk (Meade EU distributor) product page (maker's own page not reachable).",
      makerPages: [
        {
          url: "https://es.levenhuk.com/catalogue/telescopios/meade-infinity-90mm-az-refractor-telescope",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "meade-infinity-102",
    type: "telescope",
    name: "Meade Infinity 102",
    order: 103,
    specifications: { apertureMm: 102, focalLengthMm: 600 },
    planner: {
      group: "refractors",
      maker: "Meade",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : aperture and focal length read on the Levenhuk (Meade EU distributor) product page (maker's own page not reachable).",
      makerPages: [
        {
          url: "https://eu.levenhuk.com/catalogue/telescopes/meade-infinity-102mm-az-refractor-telescope",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "sharpstar-61edph-iii",
    type: "telescope",
    name: "SharpStar 61EDPH III",
    order: 104,
    specifications: { apertureMm: 61, focalLengthMm: 360 },
    planner: {
      group: "refractors",
      maker: "SharpStar",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : Aperture 61 mm and focal length 360 mm (f/5.9) read on the High Point Scientific and Teleskop-Express pages, no maker page was reachable.",
      makerPages: [
        {
          url: "https://www.highpointscientific.com/sharpstar-61edph-iii-61-mm-astrograph-refractor-ota",
          readOn: "2026-10-30",
        },
        {
          url: "https://www.teleskop-express.de/en/askar-sharpstar-173/all-apos-and-eds-from-all-manufacturers-large-overview-223/sharpstar-61edph-iii-61-mm-f-5-9-triplet-apochromat-16453",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "sharpstar-76edph",
    type: "telescope",
    name: "SharpStar 76EDPH",
    order: 105,
    specifications: { apertureMm: 76, focalLengthMm: 418 },
    planner: {
      group: "refractors",
      maker: "SharpStar",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : Aperture 76 mm and focal length 418 mm (f/5.5) read on the Widescreen Centre retailer page, no maker page was reachable.",
      makerPages: [
        {
          url: "https://widescreen-centre.co.uk/sharpstar-76edph-ed-triplet-apochromatic-refractor-telescope.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "sharpstar-94edph",
    type: "telescope",
    name: "SharpStar 94EDPH",
    order: 106,
    specifications: { apertureMm: 94, focalLengthMm: 517 },
    planner: {
      group: "refractors",
      maker: "SharpStar",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : Aperture 94 mm and focal length 517 mm (f/5.5) read on the High Point Scientific retailer page, no maker page was reachable.",
      makerPages: [
        {
          url: "https://www.highpointscientific.com/sharpstar-94-mm-triplet-ed-apo-refractor-94edph-ota",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "sharpstar-z4",
    type: "telescope",
    name: "SharpStar Z4",
    order: 107,
    specifications: { apertureMm: 100, focalLengthMm: 550 },
    planner: {
      group: "refractors",
      maker: "SharpStar",
      makerPages: [
        {
          url: "https://www.sharpstar-optics.com/Products_1/26.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "sky-rover-115-apo",
    type: "telescope",
    name: "Sky Rover 115 APO",
    order: 108,
    specifications: { apertureMm: 115, focalLengthMm: 805 },
    planner: {
      group: "refractors",
      maker: "Sky Rover",
      calculated: ["focalLengthMm"],
      calculation:
        "Focal length 115 mm x f/7 = 805 mm (the maker's page gives the 115 mm aperture and the f/7 ratio, retailers list 805 mm).",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/115-apo-f-7-telescope",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-bk-909az3",
    type: "telescope",
    name: "Sky-Watcher BK 909AZ3",
    order: 109,
    specifications: { apertureMm: 90, focalLengthMm: 900 },
    planner: {
      group: "refractors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "https://www.skywatcher.com/product/bk-909az3/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-bk-1021-ota",
    type: "telescope",
    name: "Sky-Watcher BK 1021 OTA",
    order: 110,
    specifications: { apertureMm: 102, focalLengthMm: 1000 },
    planner: {
      group: "refractors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "https://www.skywatcher.com/product/bk-1021-ota/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-bk-1206az3",
    type: "telescope",
    name: "Sky-Watcher BK 1206AZ3",
    order: 111,
    specifications: { apertureMm: 120, focalLengthMm: 600 },
    planner: {
      group: "refractors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "https://www.skywatcher.com/product/bk-1206az3/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-esprit-70edx",
    type: "telescope",
    name: "Sky-Watcher Esprit 70EDX",
    order: 112,
    specifications: { apertureMm: 70, focalLengthMm: 490 },
    planner: {
      group: "refractors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "https://www.skywatcher.com/product/esprit-70edx/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-esprit-80edx",
    type: "telescope",
    name: "Sky-Watcher Esprit 80EDX",
    order: 113,
    specifications: { apertureMm: 80, focalLengthMm: 400 },
    planner: {
      group: "refractors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "https://www.skywatcher.com/product/esprit-80edx/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-esprit-100edx",
    type: "telescope",
    name: "Sky-Watcher Esprit 100EDX",
    order: 114,
    specifications: { apertureMm: 100, focalLengthMm: 550 },
    planner: {
      group: "refractors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "https://www.skywatcher.com/product/esprit-100edx/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-esprit-120edx",
    type: "telescope",
    name: "Sky-Watcher Esprit 120EDX",
    order: 115,
    specifications: { apertureMm: 120, focalLengthMm: 840 },
    planner: {
      group: "refractors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "https://www.skywatcher.com/product/esprit-120edx/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-esprit-150edx",
    type: "telescope",
    name: "Sky-Watcher Esprit 150EDX",
    order: 116,
    specifications: { apertureMm: 150, focalLengthMm: 1050 },
    planner: {
      group: "refractors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "https://www.skywatcher.com/product/esprit-150edx/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-evostar-80edx",
    type: "telescope",
    name: "Sky-Watcher Evostar 80EDX",
    order: 117,
    specifications: { apertureMm: 80, focalLengthMm: 600 },
    planner: {
      group: "refractors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "https://www.skywatcher.com/product/evostar-80edx/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-evostar-100edx",
    type: "telescope",
    name: "Sky-Watcher Evostar 100EDX",
    order: 118,
    specifications: { apertureMm: 100, focalLengthMm: 700 },
    planner: {
      group: "refractors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "https://www.skywatcher.com/product/evostar-100edx/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-evostar-120edx",
    type: "telescope",
    name: "Sky-Watcher Evostar 120EDX",
    order: 119,
    specifications: { apertureMm: 120, focalLengthMm: 900 },
    planner: {
      group: "refractors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "https://www.skywatcher.com/product/evostar-120edx/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-evostar-150edx",
    type: "telescope",
    name: "Sky-Watcher Evostar 150EDX",
    order: 120,
    specifications: { apertureMm: 150, focalLengthMm: 1200 },
    planner: {
      group: "refractors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "https://www.skywatcher.com/product/evostar-150edx/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "stellarvue-svx090t",
    type: "telescope",
    name: "Stellarvue SVX090T",
    order: 121,
    specifications: { apertureMm: 90, focalLengthMm: 540 },
    planner: {
      group: "refractors",
      maker: "Stellarvue",
      makerPages: [
        {
          url: "https://www.stellarvue.com/product/svx090t",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "stellarvue-svx102t",
    type: "telescope",
    name: "Stellarvue SVX102T",
    order: 122,
    specifications: { apertureMm: 101.5, focalLengthMm: 714 },
    planner: {
      group: "refractors",
      maker: "Stellarvue",
      makerPages: [
        {
          url: "https://www.stellarvue.com/product/svx102t",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "stellarvue-svx127d",
    type: "telescope",
    name: "Stellarvue SVX127D",
    order: 123,
    specifications: { apertureMm: 127, focalLengthMm: 1016 },
    planner: {
      group: "refractors",
      maker: "Stellarvue",
      makerPages: [
        {
          url: "https://www.stellarvue.com/product/stellarvue-doublet-apo-svx127d",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "stellarvue-svx130t",
    type: "telescope",
    name: "Stellarvue SVX130T",
    order: 124,
    specifications: { apertureMm: 130, focalLengthMm: 910 },
    planner: {
      group: "refractors",
      maker: "Stellarvue",
      makerPages: [
        {
          url: "https://www.stellarvue.com/product/svx130t",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "stellarvue-svx140t",
    type: "telescope",
    name: "Stellarvue SVX140T",
    order: 125,
    specifications: { apertureMm: 140, focalLengthMm: 938 },
    planner: {
      group: "refractors",
      maker: "Stellarvue",
      makerPages: [
        {
          url: "https://www.stellarvue.com/product/svx140t",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "stellarvue-svx152t",
    type: "telescope",
    name: "Stellarvue SVX152T",
    order: 126,
    specifications: { apertureMm: 152, focalLengthMm: 1200 },
    planner: {
      group: "refractors",
      maker: "Stellarvue",
      makerPages: [
        {
          url: "https://www.stellarvue.com/product/svx152t",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "stellarvue-svx180t-2",
    type: "telescope",
    name: "Stellarvue SVX180T-2",
    order: 127,
    specifications: { apertureMm: 180, focalLengthMm: 1260 },
    planner: {
      group: "refractors",
      maker: "Stellarvue",
      makerPages: [
        {
          url: "https://www.stellarvue.com/product/svx180t-2",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "svbony-sv48p",
    type: "telescope",
    name: "Svbony SV48P",
    order: 128,
    specifications: { apertureMm: 90, focalLengthMm: 500 },
    planner: {
      group: "refractors",
      maker: "Svbony",
      calculated: ["focalLengthMm"],
      calculation:
        "Estimation : Focal length 500 mm as stated by the Telescopes Canada retailer page (the maker's page gives 90 mm and f/5.5 but no focal length).",
      makerPages: [
        {
          url: "https://www.svbony.com/products/sv48p-90mm-refractor-telescope",
          readOn: "2026-10-30",
        },
        {
          url: "https://telescopescanada.ca/products/svbony-sv48p-90mm-f5-5-refractor-telescope-f9341a",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "svbony-sv503-80ed",
    type: "telescope",
    name: "Svbony SV503 80 ED",
    order: 129,
    specifications: { apertureMm: 80, focalLengthMm: 560 },
    planner: {
      group: "refractors",
      maker: "Svbony",
      makerPages: [
        {
          url: "https://www.svbony.com/blog/review-of-the-svbony-SV503ED-refracting-telescope-",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "svbony-sv503-102ed",
    type: "telescope",
    name: "Svbony SV503 102 ED",
    order: 130,
    specifications: { apertureMm: 102, focalLengthMm: 714 },
    planner: {
      group: "refractors",
      maker: "Svbony",
      makerPages: [
        {
          url: "https://m.svbony.com/sv503-102f7-ed-doublet-refractor",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "svbony-sv550-122",
    type: "telescope",
    name: "Svbony SV550 122 (triplet apochromatique)",
    order: 131,
    specifications: { apertureMm: 122, focalLengthMm: 854 },
    planner: {
      group: "refractors",
      maker: "Svbony",
      makerPages: [
        {
          url: "https://www.svbony.com/products/sv550-apo-refractor-122mm",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "takahashi-fc-76ds",
    type: "telescope",
    name: "Takahashi FC-76DS",
    order: 132,
    specifications: { apertureMm: 76, focalLengthMm: 570 },
    planner: {
      group: "refractors",
      maker: "Takahashi",
      makerPages: [
        {
          url: "https://takahashi-europe.com/catalog/refractors/doublets/fc-76/fc-76ds",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "takahashi-fc-100df",
    type: "telescope",
    name: "Takahashi FC-100DF",
    order: 133,
    specifications: { apertureMm: 100, focalLengthMm: 740 },
    planner: {
      group: "refractors",
      maker: "Takahashi",
      makerPages: [
        {
          url: "https://takahashi-europe.com/catalog/refractors/doublets/fc-100/fc-100df",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "takahashi-fc-100dz",
    type: "telescope",
    name: "Takahashi FC-100DZ",
    order: 134,
    specifications: { apertureMm: 100, focalLengthMm: 800 },
    planner: {
      group: "refractors",
      maker: "Takahashi",
      makerPages: [
        {
          url: "https://takahashi-europe.com/catalog/refractors/doublets/fc-100dz/fc-100dz",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "takahashi-foa-60",
    type: "telescope",
    name: "Takahashi FOA-60",
    order: 135,
    specifications: { apertureMm: 60, focalLengthMm: 530 },
    planner: {
      group: "refractors",
      maker: "Takahashi",
      makerPages: [
        {
          url: "https://takahashi-europe.com/catalog/refractors/doublets/foa-60/foa-60",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "takahashi-fs-60cb",
    type: "telescope",
    name: "Takahashi FS-60CB",
    order: 136,
    specifications: { apertureMm: 60, focalLengthMm: 355 },
    planner: {
      group: "refractors",
      maker: "Takahashi",
      makerPages: [
        {
          url: "https://takahashi-europe.com/catalog/refractors/doublets/fs-60/fs-60cb",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "takahashi-fsq-85edx",
    type: "telescope",
    name: "Takahashi FSQ-85EDX",
    order: 137,
    specifications: { apertureMm: 85, focalLengthMm: 450 },
    planner: {
      group: "refractors",
      maker: "Takahashi",
      makerPages: [
        {
          url: "https://takahashi-europe.com/catalog/refractors/wide-field-astrograph-refractors/fsq-85edx/fsq-85edx",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "takahashi-fsq-106edx4",
    type: "telescope",
    name: "Takahashi FSQ-106EDX4",
    order: 138,
    specifications: { apertureMm: 106, focalLengthMm: 530 },
    planner: {
      group: "refractors",
      maker: "Takahashi",
      makerPages: [
        {
          url: "https://takahashi-europe.com/catalog/refractors/wide-field-astrograph-refractors/fsq-106edx4/fsq-106edx4?lang=en",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "takahashi-toa-130nfb",
    type: "telescope",
    name: "Takahashi TOA-130NFB",
    order: 139,
    specifications: { apertureMm: 130, focalLengthMm: 1000 },
    planner: {
      group: "refractors",
      maker: "Takahashi",
      makerPages: [
        {
          url: "https://takahashi-europe.com/catalog/refractors/triplets/toa-130/toa-130nfb",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "takahashi-toa-150b",
    type: "telescope",
    name: "Takahashi TOA-150B",
    order: 140,
    specifications: { apertureMm: 150, focalLengthMm: 1100 },
    planner: {
      group: "refractors",
      maker: "Takahashi",
      makerPages: [
        {
          url: "https://takahashi-europe.com/catalog/refractors/triplets/toa-150/toa-150b",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "takahashi-tsa-120",
    type: "telescope",
    name: "Takahashi TSA-120",
    order: 141,
    specifications: { apertureMm: 120, focalLengthMm: 900 },
    planner: {
      group: "refractors",
      maker: "Takahashi",
      makerPages: [
        {
          url: "https://takahashi-europe.com/catalog/refractors/triplets/tsa-120/tsa-120",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "ts-optics-apo-106",
    type: "telescope",
    name: "TS-Optics APO 106/700 FCD100",
    order: 142,
    specifications: { apertureMm: 106, focalLengthMm: 700 },
    planner: {
      group: "refractors",
      maker: "TS-Optics",
      makerPages: [
        {
          url: "https://www.teleskop-express.de/en/ts-teleskope-143/special-offers-telescopes-213/ts-optics-apo-refractor-106-700-mm-fcd100-triplet-lens-from-japan-13758",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "ts-optics-cf-apo-90",
    type: "telescope",
    name: "TS-Optics CF-APO 90/540 f/6",
    order: 143,
    specifications: { apertureMm: 90, focalLengthMm: 540 },
    planner: {
      group: "refractors",
      maker: "TS-Optics",
      makerPages: [
        {
          url: "https://www.teleskop-express.de/shop/product_info.php/language/en/info/p12928_TS-Optics-CF-APO-90-mm-f-6-FPL55-Triplet-APO-Refractor-with-Certificate.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "ts-optics-cf-apo-130",
    type: "telescope",
    name: "TS-Optics CF-APO 130/910 f/7",
    order: 144,
    specifications: { apertureMm: 130, focalLengthMm: 910 },
    planner: {
      group: "refractors",
      maker: "TS-Optics",
      makerPages: [
        {
          url: "https://www.teleskop-express.de/en/telescopes-4/apochromatic-refractor-55/all-apos-und-eds-223/ts-optics-cf-apo-130-mm-f-7-fpl55-triplet-apo-refractor-with-certificate-12851",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "ts-optics-ed-110-f7",
    type: "telescope",
    name: "TS-Optics ED 110/770 f/7",
    order: 145,
    specifications: { apertureMm: 110, focalLengthMm: 770 },
    planner: {
      group: "refractors",
      maker: "TS-Optics",
      makerPages: [
        {
          url: "https://www.teleskop-express.de/en/telescopes-4/apochromatic-refractor-55/ed-refractor-222/ts-optics-110-mm-f-7-ed-refractor-telescope-with-2-5-rap-focuser-4652",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "ts-optics-photoline-60-f6",
    type: "telescope",
    name: "TS-Optics Photoline 60/360 f/6 FPL53",
    order: 146,
    specifications: { apertureMm: 60, focalLengthMm: 360 },
    planner: {
      group: "refractors",
      maker: "TS-Optics",
      makerPages: [
        {
          url: "https://www.teleskop-express.de/en/ts-teleskope-143/all-apos-and-eds-from-all-manufacturers-large-overview-223/ts-optics-photoline-60-mm-f-6-fpl53-apo-2-r-p-focuser-red-line-10095",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "ts-optics-photoline-80-f6-triplet",
    type: "telescope",
    name: "TS-Optics Photoline 80/480 f/6 Triplet",
    order: 147,
    specifications: { apertureMm: 80, focalLengthMm: 480 },
    planner: {
      group: "refractors",
      maker: "TS-Optics",
      makerPages: [
        {
          url: "https://www.teleskop-express.de/en/telescopes-4/apochromatic-refractor-55/all-apos-und-eds-223/ts-optics-photoline-80-mm-f-6-triplet-fpl53-superapo-with-2-feather-touch-focuser-6294",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "ts-optics-photoline-80-f625-carbon",
    type: "telescope",
    name: "TS-Optics Photoline 80/500 f/6,25 Carbon",
    order: 148,
    specifications: { apertureMm: 80, focalLengthMm: 500 },
    planner: {
      group: "refractors",
      maker: "TS-Optics",
      makerPages: [
        {
          url: "https://www.teleskop-express.de/en/telescopes-4/apochromatic-refractor-55/all-apos-und-eds-223/ts-optics-photoline-80-mm-f-6-25-fpl53-apo-carbon-tube-rap-focuser-9520",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "ts-optics-photoline-115-f7",
    type: "telescope",
    name: "TS-Optics Photoline 115/800 f/7",
    order: 149,
    specifications: { apertureMm: 115, focalLengthMm: 800 },
    planner: {
      group: "refractors",
      maker: "TS-Optics",
      makerPages: [
        {
          url: "https://www.teleskop-express.de/shop/product_info.php/language/en/info/p3041_TS-Optics-PHOTOLINE-115-mm-f-7-Triplet-Apo---2-5--RAP-Okularauszug.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "ts-optics-photoline-140-f65",
    type: "telescope",
    name: "TS-Optics Photoline 140/910 f/6,5",
    order: 150,
    specifications: { apertureMm: 140, focalLengthMm: 910 },
    planner: {
      group: "refractors",
      maker: "TS-Optics",
      makerPages: [
        {
          url: "https://www.teleskop-express.de/en/telescopes-4/apochromatic-refractor-55/all-apos-und-eds-223/ts-optics-photoline-140-mm-f-6-5-super-triplet-apo-with-2-ed-elements-12330",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "ts-optics-sd-apo-72-f6",
    type: "telescope",
    name: "TS-Optics SD APO 72/432 f/6",
    order: 151,
    specifications: { apertureMm: 72, focalLengthMm: 432 },
    planner: {
      group: "refractors",
      maker: "TS-Optics",
      makerPages: [
        {
          url: "https://www.teleskop-express.de/shop/product_info.php/language/en/info/p8866_TS-Optics-Doublet-SD-Apo-72-mm-f-6---FPL53---Lanthanum-Glass-Objective.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "vixen-a80mf",
    type: "telescope",
    name: "Vixen A80Mf",
    order: 152,
    specifications: { apertureMm: 80, focalLengthMm: 910 },
    planner: {
      group: "refractors",
      maker: "Vixen",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : aperture and focal length read on the Bresser (Vixen distributor) product page (maker's own page not reachable).",
      makerPages: [
        {
          url: "https://bresseruk.com/p/vixen-a80mf-optical-tube-X000271",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "vixen-ax103s",
    type: "telescope",
    name: "Vixen AX103S",
    order: 153,
    specifications: { apertureMm: 103, focalLengthMm: 825 },
    planner: {
      group: "refractors",
      maker: "Vixen",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : aperture and focal length read on the Bresser (Vixen distributor) product page (maker's own page not reachable).",
      makerPages: [
        {
          url: "https://www.bresser.com/p/vixen-ax103s-apochromatic-refractor-optical-tube-X000059",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "vixen-ed80sf",
    type: "telescope",
    name: "Vixen ED80Sf",
    order: 154,
    specifications: { apertureMm: 80, focalLengthMm: 600 },
    planner: {
      group: "refractors",
      maker: "Vixen",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : aperture and focal length read on the Bresser (Vixen distributor) product page (maker's own page not reachable).",
      makerPages: [
        {
          url: "https://www.bresser.com/p/vixen-ed80sf-refractor-telescope-X000272",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "vixen-fl55ss",
    type: "telescope",
    name: "Vixen FL55SS",
    order: 155,
    specifications: { apertureMm: 55, focalLengthMm: 300 },
    planner: {
      group: "refractors",
      maker: "Vixen",
      makerPages: [
        {
          url: "https://www.bresser.com/media/0e/3a/f3/1646724129/X000071_FL55SS_UGE_EN.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "vixen-sd81sii",
    type: "telescope",
    name: "Vixen SD81SII",
    order: 156,
    specifications: { apertureMm: 81, focalLengthMm: 625 },
    planner: {
      group: "refractors",
      maker: "Vixen",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : aperture and focal length read on the Bresser (Vixen distributor) product page (maker's own page not reachable).",
      makerPages: [
        {
          url: "https://www.bresser.com/p/vixen-sd81sii-telescope-ota-X026083",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "vixen-sd103s",
    type: "telescope",
    name: "Vixen SD103S",
    order: 157,
    specifications: { apertureMm: 103, focalLengthMm: 795 },
    planner: {
      group: "refractors",
      maker: "Vixen",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : aperture and focal length read on the Bresser (Vixen distributor) product page (maker's own page not reachable).",
      makerPages: [
        {
          url: "https://bresser.com/p/vixen-sd103s-apochromatic-refractor-X000062",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "vixen-sd103sii",
    type: "telescope",
    name: "Vixen SD103SII",
    order: 158,
    specifications: { apertureMm: 103, focalLengthMm: 795 },
    planner: {
      group: "refractors",
      maker: "Vixen",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : aperture and focal length read on the Bresser (Vixen distributor) product page (maker's own page not reachable).",
      makerPages: [
        {
          url: "https://www.bresser.com/p/vixen-sd103sii-telescope-ota-X026086",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "vixen-sd115s",
    type: "telescope",
    name: "Vixen SD115S",
    order: 159,
    specifications: { apertureMm: 115, focalLengthMm: 890 },
    planner: {
      group: "refractors",
      maker: "Vixen",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : aperture and focal length read on the Bresser (Vixen distributor) product page (maker's own page not reachable).",
      makerPages: [
        {
          url: "https://bresser.com/p/vixen-sd115s-apochromatic-refractor-X000063",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "william-optics-cat-61-wifd",
    type: "telescope",
    name: "William Optics Cat 61 WIFD",
    order: 160,
    specifications: { apertureMm: 61, focalLengthMm: 300 },
    planner: {
      group: "refractors",
      maker: "William Optics",
      makerPages: [
        {
          url: "https://support.williamoptics.com/products/cat-61-wifd",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "william-optics-cat-71-wifd",
    type: "telescope",
    name: "William Optics Cat 71 WIFD",
    order: 161,
    specifications: { apertureMm: 71, focalLengthMm: 350 },
    planner: {
      group: "refractors",
      maker: "William Optics",
      makerPages: [
        {
          url: "https://support.williamoptics.com/products/cat-71-wifd",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "william-optics-cat-91-wifd",
    type: "telescope",
    name: "William Optics Cat 91 WIFD",
    order: 162,
    specifications: { apertureMm: 91, focalLengthMm: 448 },
    planner: {
      group: "refractors",
      maker: "William Optics",
      makerPages: [
        {
          url: "https://support.williamoptics.com/products/cat-91-wifd",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "william-optics-fluorostar-91",
    type: "telescope",
    name: "William Optics Fluorostar 91 (FLT 91)",
    order: 163,
    specifications: { apertureMm: 91, focalLengthMm: 540 },
    planner: {
      group: "refractors",
      maker: "William Optics",
      makerPages: [
        {
          url: "https://williamoptics.com/products/fluorostar-91",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "william-optics-fluorostar-110",
    type: "telescope",
    name: "William Optics Fluorostar 110 (FLT 110)",
    order: 164,
    specifications: { apertureMm: 110, focalLengthMm: 715 },
    planner: {
      group: "refractors",
      maker: "William Optics",
      makerPages: [
        {
          url: "https://support.williamoptics.com/products/fluorostar-110",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "william-optics-fluorostar-120",
    type: "telescope",
    name: "William Optics Fluorostar 120",
    order: 165,
    specifications: { apertureMm: 120, focalLengthMm: 780 },
    planner: {
      group: "refractors",
      maker: "William Optics",
      makerPages: [
        {
          url: "https://support.williamoptics.com/products/fluorostar-120",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "william-optics-fluorostar-132",
    type: "telescope",
    name: "William Optics Fluorostar 132 (FLT 132)",
    order: 166,
    specifications: { apertureMm: 132, focalLengthMm: 910 },
    planner: {
      group: "refractors",
      maker: "William Optics",
      makerPages: [
        {
          url: "https://support.williamoptics.com/products/fluorostar-132",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "william-optics-fluorostar-156",
    type: "telescope",
    name: "William Optics Fluorostar 156",
    order: 167,
    specifications: { apertureMm: 156, focalLengthMm: 1217 },
    planner: {
      group: "refractors",
      maker: "William Optics",
      makerPages: [
        {
          url: "https://support.williamoptics.com/products/fluorostar-156",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "william-optics-gran-turismo-71-ii",
    type: "telescope",
    name: "William Optics Gran Turismo 71 II",
    order: 168,
    specifications: { apertureMm: 71, focalLengthMm: 419 },
    planner: {
      group: "refractors",
      maker: "William Optics",
      makerPages: [
        {
          url: "https://williamoptics.com/products/gran-turismo-71-ii",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "william-optics-gran-turismo-81-iv",
    type: "telescope",
    name: "William Optics Gran Turismo 81 IV",
    order: 169,
    specifications: { apertureMm: 81, focalLengthMm: 478 },
    planner: {
      group: "refractors",
      maker: "William Optics",
      makerPages: [
        {
          url: "https://support.williamoptics.com/products/gran-turismo-81-iv",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "william-optics-gran-turismo-81-wifd",
    type: "telescope",
    name: "William Optics Gran Turismo 81 WIFD",
    order: 170,
    specifications: { apertureMm: 81, focalLengthMm: 478 },
    planner: {
      group: "refractors",
      maker: "William Optics",
      makerPages: [
        {
          url: "https://williamoptics.com/products/gran-turismo-81-wifd",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "william-optics-gran-turismo-102",
    type: "telescope",
    name: "William Optics Gran Turismo 102",
    order: 171,
    specifications: { apertureMm: 102, focalLengthMm: 703 },
    planner: {
      group: "refractors",
      maker: "William Optics",
      makerPages: [
        {
          url: "https://support.williamoptics.com/products/gran-turismo-102",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "william-optics-gran-turismo-153",
    type: "telescope",
    name: "William Optics Gran Turismo 153",
    order: 172,
    specifications: { apertureMm: 153, focalLengthMm: 1188 },
    planner: {
      group: "refractors",
      maker: "William Optics",
      makerPages: [
        {
          url: "https://support.williamoptics.com/products/gran-turismo-153",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "william-optics-pleiades-68",
    type: "telescope",
    name: "William Optics Pleiades 68",
    order: 173,
    specifications: { apertureMm: 68, focalLengthMm: 260 },
    planner: {
      group: "refractors",
      maker: "William Optics",
      makerPages: [
        {
          url: "https://support.williamoptics.com/products/pleiades-68",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "william-optics-pleiades-111",
    type: "telescope",
    name: "William Optics Pleiades 111",
    order: 174,
    specifications: { apertureMm: 111, focalLengthMm: 528 },
    planner: {
      group: "refractors",
      maker: "William Optics",
      makerPages: [
        {
          url: "https://support.williamoptics.com/products/pleiades-111",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "william-optics-pleiades-181",
    type: "telescope",
    name: "William Optics Pleiades 181",
    order: 175,
    specifications: { apertureMm: 181, focalLengthMm: 998 },
    planner: {
      group: "refractors",
      maker: "William Optics",
      makerPages: [
        {
          url: "https://support.williamoptics.com/products/pleiades-181",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "william-optics-ultra-cat-76",
    type: "telescope",
    name: "William Optics Ultra-Cat 76",
    order: 176,
    specifications: { apertureMm: 76, focalLengthMm: 365 },
    planner: {
      group: "refractors",
      maker: "William Optics",
      makerPages: [
        {
          url: "https://support.williamoptics.com/products/ultra-cat-76",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "william-optics-ultra-cat-108",
    type: "telescope",
    name: "William Optics Ultra-Cat 108",
    order: 177,
    specifications: { apertureMm: 108, focalLengthMm: 518 },
    planner: {
      group: "refractors",
      maker: "William Optics",
      makerPages: [
        {
          url: "https://support.williamoptics.com/products/ultra-cat-108",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "william-optics-ultra-cat-131",
    type: "telescope",
    name: "William Optics Ultra-Cat 131",
    order: 178,
    specifications: { apertureMm: 131, focalLengthMm: 648 },
    planner: {
      group: "refractors",
      maker: "William Optics",
      makerPages: [
        {
          url: "https://support.williamoptics.com/products/ultra-cat-131",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "william-optics-zenithstar-73-iii",
    type: "telescope",
    name: "William Optics Zenithstar 73 III",
    order: 179,
    specifications: { apertureMm: 73, focalLengthMm: 430 },
    planner: {
      group: "refractors",
      maker: "William Optics",
      makerPages: [
        {
          url: "https://williamoptics.com/products/zenithstar-73-iii",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "william-optics-zenithstar-81",
    type: "telescope",
    name: "William Optics Zenithstar 81",
    order: 180,
    specifications: { apertureMm: 81, focalLengthMm: 559 },
    planner: {
      group: "refractors",
      maker: "William Optics",
      makerPages: [
        {
          url: "https://support.williamoptics.com/products/zenithstar-81",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "william-optics-zenithstar-103",
    type: "telescope",
    name: "William Optics Zenithstar 103",
    order: 181,
    specifications: { apertureMm: 103, focalLengthMm: 711 },
    planner: {
      group: "refractors",
      maker: "William Optics",
      makerPages: [
        {
          url: "https://support.williamoptics.com/products/zenithstar-103",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "apertura-ad10-dobsonian",
    type: "telescope",
    name: 'Apertura AD10 Dobsonian 10"',
    order: 182,
    specifications: { apertureMm: 254, focalLengthMm: 1250 },
    planner: {
      group: "reflectors",
      maker: "Apertura",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : aperture and focal length read on the High Point Scientific retailer page for the Apertura AD10 (no maker page fetched).",
      makerPages: [
        {
          url: "https://www.highpointscientific.com/apertura-ad10-10inch-dobsonian-telescope-ad10",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "apertura-ad12-dobsonian",
    type: "telescope",
    name: 'Apertura AD12 Dobsonian 12"',
    order: 183,
    specifications: { apertureMm: 305, focalLengthMm: 1520 },
    planner: {
      group: "reflectors",
      maker: "Apertura",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : aperture and focal length read on the High Point Scientific retailer page for the Apertura AD12 (no maker page fetched).",
      makerPages: [
        {
          url: "https://www.highpointscientific.com/apertura-ad12-12inch-dobsonian-telescope-ad12",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "bresser-messier-6-dobson",
    type: "telescope",
    name: 'Bresser Messier 6" Dobson',
    order: 184,
    specifications: { apertureMm: 150, focalLengthMm: 750 },
    planner: {
      group: "reflectors",
      maker: "Bresser",
      makerPages: [
        {
          url: "https://www.bresser.com/p/bresser-messier-6-dobson-4716415",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "bresser-messier-8-dobson",
    type: "telescope",
    name: 'Bresser Messier 8" Dobson',
    order: 185,
    specifications: { apertureMm: 203, focalLengthMm: 1218 },
    planner: {
      group: "reflectors",
      maker: "Bresser",
      makerPages: [
        {
          url: "https://www.bresser.com/en/Astronomy/Telescopes/BRESSER-Messier-8-Dobsonian.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "bresser-messier-10-dobson",
    type: "telescope",
    name: 'Bresser Messier 10" Dobson',
    order: 186,
    specifications: { apertureMm: 254, focalLengthMm: 1270 },
    planner: {
      group: "reflectors",
      maker: "Bresser",
      makerPages: [
        {
          url: "https://www.bresser.com/p/bresser-messier-10-telescope-dobson-4716425",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "bresser-messier-12-dobson",
    type: "telescope",
    name: 'Bresser Messier 12" Dobson',
    order: 187,
    specifications: { apertureMm: 305, focalLengthMm: 1525 },
    planner: {
      group: "reflectors",
      maker: "Bresser",
      makerPages: [
        {
          url: "https://www.bresser.com/p/bresser-messier-12-dobson-telescope-4716430",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "bresser-messier-203-1200-hexafoc",
    type: "telescope",
    name: "Bresser Messier 203/1200 Hexafoc",
    order: 188,
    specifications: { apertureMm: 203, focalLengthMm: 1200 },
    planner: {
      group: "reflectors",
      maker: "Bresser",
      makerPages: [
        {
          url: "https://www.bresser.com/p/bresser-messier-203-1200-hexafoc-optical-tube-4803120",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "bresser-messier-mc-100-1400",
    type: "telescope",
    name: "Bresser Messier MC-100/1400 (Maksutov)",
    order: 189,
    specifications: { apertureMm: 100, focalLengthMm: 1400 },
    planner: {
      group: "reflectors",
      maker: "Bresser",
      makerPages: [
        {
          url: "https://www.bresser.com/p/bresser-messier-mc-100-1400-ota-optical-tube-4810140",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "bresser-messier-mc-127-1900",
    type: "telescope",
    name: "Bresser Messier MC-127/1900 (Maksutov)",
    order: 190,
    specifications: { apertureMm: 127, focalLengthMm: 1900 },
    planner: {
      group: "reflectors",
      maker: "Bresser",
      makerPages: [
        {
          url: "https://www.bresser.de/p/bresser-messier-mc-127-1900-ota-optischer-tubus-4827190",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "bresser-messier-mc-152",
    type: "telescope",
    name: "Bresser Messier MC-152 Hexafoc (Maksutov)",
    order: 191,
    specifications: { apertureMm: 152, focalLengthMm: 2250 },
    planner: {
      group: "reflectors",
      maker: "Bresser",
      makerPages: [
        {
          url: "https://www.bresser.de/p/bresser-messier-mc-152-hexafoc-optischer-tubus-4852190",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "bresser-messier-nt203-1000",
    type: "telescope",
    name: "Bresser Messier NT-203/1000 Hexafoc",
    order: 192,
    specifications: { apertureMm: 203, focalLengthMm: 1000 },
    planner: {
      group: "reflectors",
      maker: "Bresser",
      makerPages: [
        {
          url: "https://www.bresser.de/p/bresser-messier-nt-203-1000-hexafoc-ota-optischer-tubus-4803100",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "bresser-messier-nt203s-800",
    type: "telescope",
    name: "Bresser Messier NT203s/800",
    order: 193,
    specifications: { apertureMm: 203, focalLengthMm: 800 },
    planner: {
      group: "reflectors",
      maker: "Bresser",
      makerPages: [
        {
          url: "https://www.bresser.com/p/bresser-messier-nt203s-800-optical-tube-4803800",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-c5",
    type: "telescope",
    name: "Celestron C5",
    order: 194,
    specifications: { apertureMm: 127, focalLengthMm: 1250 },
    planner: {
      group: "reflectors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/c5-spotting-scope",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-c6",
    type: "telescope",
    name: "Celestron C6",
    order: 195,
    specifications: { apertureMm: 150, focalLengthMm: 1500 },
    planner: {
      group: "reflectors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/c6-optical-tube-assembly-cg-5-dovetail",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-c9-25",
    type: "telescope",
    name: "Celestron C9.25",
    order: 196,
    specifications: { apertureMm: 235, focalLengthMm: 2350 },
    planner: {
      group: "reflectors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/c9-25-optical-tube-assembly-cge-dovetail",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-c11",
    type: "telescope",
    name: "Celestron C11",
    order: 197,
    specifications: { apertureMm: 279.4, focalLengthMm: 2800 },
    planner: {
      group: "reflectors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/c11-optical-tube-assembly-cge-dovetail",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-c14",
    type: "telescope",
    name: "Celestron C14",
    order: 198,
    specifications: { apertureMm: 355.5, focalLengthMm: 3910 },
    planner: {
      group: "reflectors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/c14-optical-tube-assembly-cge-dovetail",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-edgehd-8",
    type: "telescope",
    name: "Celestron EdgeHD 8",
    order: 199,
    specifications: { apertureMm: 203.2, focalLengthMm: 2032 },
    planner: {
      group: "reflectors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/edgehd-8-optical-tube-assembly-cge-dovetail",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-edgehd-9-25",
    type: "telescope",
    name: "Celestron EdgeHD 9.25",
    order: 200,
    specifications: { apertureMm: 234.95, focalLengthMm: 2350 },
    planner: {
      group: "reflectors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/edgehd-925-optical-tube-assembly-cge-dovetail",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-edgehd-11",
    type: "telescope",
    name: "Celestron EdgeHD 11",
    order: 201,
    specifications: { apertureMm: 279.4, focalLengthMm: 2800 },
    planner: {
      group: "reflectors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/edgehd-11-optical-tube-assembly-cge-dovetail",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-edgehd-14",
    type: "telescope",
    name: "Celestron EdgeHD 14",
    order: 202,
    specifications: { apertureMm: 356, focalLengthMm: 3910 },
    planner: {
      group: "reflectors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/edgehd-14-optical-tube-assembly-cge-dovetail",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-nexstar-8se",
    type: "telescope",
    name: "Celestron NexStar 8SE",
    order: 203,
    specifications: { apertureMm: 203.2, focalLengthMm: 2032 },
    planner: {
      group: "reflectors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/nexstar-8se-computerized-telescope",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-nexstar-90slt",
    type: "telescope",
    name: "Celestron NexStar 90SLT (Maksutov)",
    order: 204,
    specifications: { apertureMm: 90, focalLengthMm: 1250 },
    planner: {
      group: "reflectors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/nexstar-90slt-computerized-telescope",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-nexstar-127slt",
    type: "telescope",
    name: "Celestron NexStar 127SLT (Maksutov)",
    order: 205,
    specifications: { apertureMm: 127, focalLengthMm: 1500 },
    planner: {
      group: "reflectors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/nexstar-127slt-computerized-telescope",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-nexstar-evolution-5",
    type: "telescope",
    name: "Celestron NexStar Evolution 5",
    order: 206,
    specifications: { apertureMm: 125, focalLengthMm: 1250 },
    planner: {
      group: "reflectors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/nexstar-evolution-5-telescope",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-nexstar-evolution-6",
    type: "telescope",
    name: "Celestron NexStar Evolution 6",
    order: 207,
    specifications: { apertureMm: 150, focalLengthMm: 1500 },
    planner: {
      group: "reflectors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/nexstar-evolution-6-telescope",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-nexstar-evolution-8",
    type: "telescope",
    name: "Celestron NexStar Evolution 8",
    order: 208,
    specifications: { apertureMm: 203.2, focalLengthMm: 2032 },
    planner: {
      group: "reflectors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/nexstar-evolution-8-telescope",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-nexstar-evolution-9-25",
    type: "telescope",
    name: "Celestron NexStar Evolution 9.25",
    order: 209,
    specifications: { apertureMm: 235, focalLengthMm: 2350 },
    planner: {
      group: "reflectors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/nexstar-evolution-925-telescope",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-rasa-8",
    type: "telescope",
    name: "Celestron RASA 8",
    order: 210,
    specifications: { apertureMm: 203, focalLengthMm: 400 },
    planner: {
      group: "reflectors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/8-rowe-ackermann-schmidt-astrograph-rasa-8-optical-tube-assembly-cge-dovetail",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-rasa-11",
    type: "telescope",
    name: "Celestron RASA 11",
    order: 211,
    specifications: { apertureMm: 279, focalLengthMm: 620 },
    planner: {
      group: "reflectors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/11-in-rowe-ackermann-schmidt-astrograph-rasa-11-optical-tube-assembly-cge-dovetail",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-rasa-36-v2",
    type: "telescope",
    name: 'Celestron RASA 36 V2 (14")',
    order: 212,
    specifications: { apertureMm: 355.6, focalLengthMm: 790 },
    planner: {
      group: "reflectors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/36-cm-rowe-ackermann-schmidt-astrograph-rasa-36-v2-optical-tube-assembly-cge-dovetail",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-starsense-explorer-8-dobsonian",
    type: "telescope",
    name: 'Celestron StarSense Explorer 8" Dobsonian',
    order: 213,
    specifications: { apertureMm: 203, focalLengthMm: 1200 },
    planner: {
      group: "reflectors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/starsense-explorer-8-smartphone-app-enabled-dobsonian-telescope",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-starsense-explorer-10-dobsonian",
    type: "telescope",
    name: 'Celestron StarSense Explorer 10" Dobsonian',
    order: 214,
    specifications: { apertureMm: 254, focalLengthMm: 1200 },
    planner: {
      group: "reflectors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/starsense-explorer-10-smartphone-app-enabled-dobsonian-telescope",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-starsense-explorer-114-dobsonian",
    type: "telescope",
    name: "Celestron StarSense Explorer 114mm Dobsonian",
    order: 215,
    specifications: { apertureMm: 114, focalLengthMm: 450 },
    planner: {
      group: "reflectors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/starsense-explorer-114mm-smartphone-app-enabled-tabletop-dobsonian-telescope",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-starsense-explorer-130-dobsonian",
    type: "telescope",
    name: "Celestron StarSense Explorer 130mm Dobsonian",
    order: 216,
    specifications: { apertureMm: 130, focalLengthMm: 650 },
    planner: {
      group: "reflectors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/starsense-explorer-130mm-smartphone-app-enabled-tabletop-dobsonian-telescope",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-starsense-explorer-150-dobsonian",
    type: "telescope",
    name: "Celestron StarSense Explorer 150mm Dobsonian",
    order: 217,
    specifications: { apertureMm: 150, focalLengthMm: 750 },
    planner: {
      group: "reflectors",
      maker: "Celestron",
      makerPages: [
        {
          url: "https://www.celestron.com/products/starsense-explorer-150mm-smartphone-app-enabled-tabletop-dobsonian-telescope",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "explore-scientific-dob1045c",
    type: "telescope",
    name: 'Explore Scientific 10" Hybrid Truss Tube Dobsonian',
    order: 218,
    specifications: { apertureMm: 254, focalLengthMm: 1270 },
    planner: {
      group: "reflectors",
      maker: "Explore Scientific",
      makerPages: [
        {
          url: "https://www.explorescientific.com/products/explore-scientific-10-inch-hybrid-truss-tube-dobsonian-telescope-dob1045c",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "meade-etx-90pe",
    type: "telescope",
    name: "Meade ETX-90PE (Maksutov)",
    order: 219,
    specifications: { apertureMm: 90, focalLengthMm: 1250 },
    planner: {
      group: "reflectors",
      maker: "Meade",
      makerPages: [
        {
          url: "https://www.manualslib.com/manual/100924/Meade-Etx-90pe.html?page=47",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "meade-etx-125pe",
    type: "telescope",
    name: "Meade ETX-125PE (Maksutov)",
    order: 220,
    specifications: { apertureMm: 127, focalLengthMm: 1900 },
    planner: {
      group: "reflectors",
      maker: "Meade",
      makerPages: [
        {
          url: "https://www.manualslib.com/manual/100924/Meade-Etx-90pe.html?page=48",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "meade-lx200-acf-8",
    type: "telescope",
    name: 'Meade LX200-ACF 8"',
    order: 221,
    specifications: { apertureMm: 203.2, focalLengthMm: 2000 },
    planner: {
      group: "reflectors",
      maker: "Meade",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        'Estimation : OPT specification table of the Meade LX200-ACF 8" f/10 gives 203.2 mm aperture and 2000 mm focal length (f/9.8).',
      makerPages: [
        {
          url: "https://optcorp.com/products/meade-lx200-acf-8-f-10-telescope-without-tripod",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "meade-lx200-acf-10",
    type: "telescope",
    name: 'Meade LX200-ACF 10"',
    order: 222,
    specifications: { apertureMm: 254, focalLengthMm: 2500 },
    planner: {
      group: "reflectors",
      maker: "Meade",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        'Estimation : OPT specification table of the Meade LX200-ACF 10" gives 254 mm aperture and 2500 mm focal length (f/9.8).',
      makerPages: [
        {
          url: "https://optcorp.com/products/meade-lx200-acf-10-telescope-without-tripod",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "meade-lx200-acf-12",
    type: "telescope",
    name: 'Meade LX200-ACF 12"',
    order: 223,
    specifications: { apertureMm: 305, focalLengthMm: 3048 },
    planner: {
      group: "reflectors",
      maker: "Meade",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        'Estimation : OPT specification table of the Meade LX200-ACF 12" gives 305 mm aperture and 3048 mm focal length (f/10).',
      makerPages: [
        {
          url: "https://optcorp.com/products/meade-12inch-lx200-acf-telescope",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "meade-lx200-acf-14",
    type: "telescope",
    name: 'Meade LX200-ACF 14"',
    order: 224,
    specifications: { apertureMm: 356, focalLengthMm: 3556 },
    planner: {
      group: "reflectors",
      maker: "Meade",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        'Estimation : OPT specification table of the Meade LX200 14" f/10 ACF OTA gives 356 mm aperture and 3556 mm focal length (f/10).',
      makerPages: [
        {
          url: "https://optcorp.com/products/meade-14-f-10-acf-uhtc-ota-me",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "orion-apex-90",
    type: "telescope",
    name: "Orion Apex 90 (Maksutov)",
    order: 225,
    specifications: { apertureMm: 90, focalLengthMm: 1250 },
    planner: {
      group: "reflectors",
      maker: "Orion",
      makerPages: [
        {
          url: "https://www.manualsdir.com/manuals/205684/orion-9823.html?page=7",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "orion-apex-102",
    type: "telescope",
    name: "Orion Apex 102 (Maksutov)",
    order: 226,
    specifications: { apertureMm: 102, focalLengthMm: 1300 },
    planner: {
      group: "reflectors",
      maker: "Orion",
      makerPages: [
        {
          url: "https://www.manualsdir.com/manuals/205684/orion-9823.html?page=7",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "orion-apex-127",
    type: "telescope",
    name: "Orion Apex 127 (Maksutov)",
    order: 227,
    specifications: { apertureMm: 127, focalLengthMm: 1540 },
    planner: {
      group: "reflectors",
      maker: "Orion",
      makerPages: [
        {
          url: "https://www.manualsdir.com/manuals/205684/orion-9823.html?page=7",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "orion-starmax-90",
    type: "telescope",
    name: "Orion StarMax 90 (Maksutov)",
    order: 228,
    specifications: { apertureMm: 90, focalLengthMm: 1250 },
    planner: {
      group: "reflectors",
      maker: "Orion",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : OPT specification table of the Orion StarMax 90mm TableTop gives 90 mm aperture and 1250 mm focal length (f/13.9).",
      makerPages: [
        {
          url: "https://optcorp.com/products/orion-starmax-90mm-tabletop-maksutov-cassegrain-telescope",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "orion-starmax-127",
    type: "telescope",
    name: "Orion StarMax 127 (Maksutov)",
    order: 229,
    specifications: { apertureMm: 127, focalLengthMm: 1540 },
    planner: {
      group: "reflectors",
      maker: "Orion",
      makerPages: [
        {
          url: "https://company7.com/orion/catadioptric/starmax127.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-virtuoso-gti-dob-130",
    type: "telescope",
    name: "Sky-Watcher Dob130 Virtuoso GTi",
    order: 230,
    specifications: { apertureMm: 130, focalLengthMm: 650 },
    planner: {
      group: "reflectors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "http://skywatcher.com/product/dob130-virtuoso-gti/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-virtuoso-gti-dob-150",
    type: "telescope",
    name: "Sky-Watcher Dob150 Virtuoso GTi",
    order: 231,
    specifications: { apertureMm: 150, focalLengthMm: 750 },
    planner: {
      group: "reflectors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "http://skywatcher.com/product/dob150-vituoso-gti/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-dobson-250-1200-collapsible",
    type: "telescope",
    name: 'Sky-Watcher Dobson 250/1200 (Collapsible 10")',
    order: 232,
    specifications: { apertureMm: 254, focalLengthMm: 1200 },
    planner: {
      group: "reflectors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "http://skywatcher.com/product/bk-dob-10-collapsible/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-dobson-300-1500-collapsible",
    type: "telescope",
    name: 'Sky-Watcher Dobson 300/1500 (Collapsible 12")',
    order: 233,
    specifications: { apertureMm: 305, focalLengthMm: 1500 },
    planner: {
      group: "reflectors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "http://skywatcher.com/product/bk-dob-12-collapsible/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-dobson-350-1650-collapsible",
    type: "telescope",
    name: 'Sky-Watcher Dobson 350/1650 (Collapsible 14")',
    order: 234,
    specifications: { apertureMm: 355, focalLengthMm: 1650 },
    planner: {
      group: "reflectors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "http://skywatcher.com/product/bk-dob-14-collapsible/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-dobson-400-1800-collapsible",
    type: "telescope",
    name: 'Sky-Watcher Dobson 400/1800 (Collapsible 16")',
    order: 235,
    specifications: { apertureMm: 406, focalLengthMm: 1800 },
    planner: {
      group: "reflectors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "http://skywatcher.com/product/bk-dob-16-collapsible/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-explorer-130pds",
    type: "telescope",
    name: "Sky-Watcher Explorer 130PDS",
    order: 236,
    specifications: { apertureMm: 130, focalLengthMm: 650 },
    planner: {
      group: "reflectors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "http://skywatcher.com/product/bkp-130-ds/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-explorer-200pds",
    type: "telescope",
    name: "Sky-Watcher Explorer 200PDS",
    order: 237,
    specifications: { apertureMm: 200, focalLengthMm: 1000 },
    planner: {
      group: "reflectors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "http://skywatcher.com/product/bkp-p200-ds/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-explorer-250pds",
    type: "telescope",
    name: "Sky-Watcher Explorer 250PDS",
    order: 238,
    specifications: { apertureMm: 250, focalLengthMm: 1200 },
    planner: {
      group: "reflectors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "http://skywatcher.com/product/bkp-250-ds/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-explorer-300pds",
    type: "telescope",
    name: "Sky-Watcher Explorer 300PDS",
    order: 239,
    specifications: { apertureMm: 300, focalLengthMm: 1500 },
    planner: {
      group: "reflectors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "http://skywatcher.com/product/bkp-300-ds/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-heritage-76",
    type: "telescope",
    name: "Sky-Watcher Heritage 76",
    order: 240,
    specifications: { apertureMm: 76, focalLengthMm: 300 },
    planner: {
      group: "reflectors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "http://skywatcher.com/product/heritage-76-mid-night-blue/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-virtuoso-gti-mc127",
    type: "telescope",
    name: "Sky-Watcher MC127 Virtuoso GTi (Maksutov)",
    order: 241,
    specifications: { apertureMm: 127, focalLengthMm: 1500 },
    planner: {
      group: "reflectors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "http://skywatcher.com/product/mc127-virtuoso-gti/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-newton-114-500",
    type: "telescope",
    name: "Sky-Watcher Newton 114/500 (BK P1145)",
    order: 242,
    specifications: { apertureMm: 114, focalLengthMm: 500 },
    planner: {
      group: "reflectors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "http://skywatcher.com/product/bk-p1145eq1/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-newton-250-1200",
    type: "telescope",
    name: "Sky-Watcher Newton 250/1200 (BK P250/1200)",
    order: 243,
    specifications: { apertureMm: 254, focalLengthMm: 1200 },
    planner: {
      group: "reflectors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "http://skywatcher.com/product/bk-p2501200-otaw/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-quattro-150p",
    type: "telescope",
    name: "Sky-Watcher Quattro 150P",
    order: 244,
    specifications: { apertureMm: 150, focalLengthMm: 600 },
    planner: {
      group: "reflectors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "http://skywatcher.com/product/quattro-150p/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-quattro-200",
    type: "telescope",
    name: "Sky-Watcher Quattro 200",
    order: 245,
    specifications: { apertureMm: 205, focalLengthMm: 800 },
    planner: {
      group: "reflectors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "http://skywatcher.com/product/quattro-200-st/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-quattro-250",
    type: "telescope",
    name: "Sky-Watcher Quattro 250",
    order: 246,
    specifications: { apertureMm: 254, focalLengthMm: 1000 },
    planner: {
      group: "reflectors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "http://skywatcher.com/product/quattro-250-st/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-skymax-150",
    type: "telescope",
    name: "Sky-Watcher Skymax 150 (Maksutov)",
    order: 247,
    specifications: { apertureMm: 150, focalLengthMm: 1800 },
    planner: {
      group: "reflectors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "http://skywatcher.com/product/bk-mak150-otaw/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-skymax-180",
    type: "telescope",
    name: "Sky-Watcher Skymax 180 (Maksutov)",
    order: 248,
    specifications: { apertureMm: 180, focalLengthMm: 2700 },
    planner: {
      group: "reflectors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "http://skywatcher.com/product/bk-mak180-otaw/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-stargate-16",
    type: "telescope",
    name: 'Sky-Watcher StarGate 16"',
    order: 249,
    specifications: { apertureMm: 406, focalLengthMm: 1650 },
    planner: {
      group: "reflectors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "http://skywatcher.com/product/stargate-16-synscan/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-stargate-18",
    type: "telescope",
    name: 'Sky-Watcher StarGate 18"',
    order: 250,
    specifications: { apertureMm: 458, focalLengthMm: 1900 },
    planner: {
      group: "reflectors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "http://skywatcher.com/product/stargate-18-truss-tube/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-stargate-20",
    type: "telescope",
    name: 'Sky-Watcher StarGate 20"',
    order: 251,
    specifications: { apertureMm: 508, focalLengthMm: 2000 },
    planner: {
      group: "reflectors",
      maker: "Sky-Watcher",
      makerPages: [
        {
          url: "http://skywatcher.com/product/stargate-20-synscan/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "takahashi-epsilon-130d",
    type: "telescope",
    name: "Takahashi Epsilon-130D",
    order: 252,
    specifications: { apertureMm: 130, focalLengthMm: 430 },
    planner: {
      group: "reflectors",
      maker: "Takahashi",
      makerPages: [
        {
          url: "https://takahashijapan.jp/products/telescope/%ce%b5/%ce%b5-130d-2-2-2/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "takahashi-epsilon-160ed",
    type: "telescope",
    name: "Takahashi Epsilon-160ED",
    order: 253,
    specifications: { apertureMm: 160, focalLengthMm: 530 },
    planner: {
      group: "reflectors",
      maker: "Takahashi",
      makerPages: [
        {
          url: "https://takahashijapan.jp/wp-content/uploads/2024/05/%CE%B5-160ED%E5%8F%96%E8%AA%AC_%E5%88%9D%E7%89%88_%E4%BF%AE%E6%AD%A3200730a.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "takahashi-epsilon-180ed",
    type: "telescope",
    name: "Takahashi Epsilon-180ED",
    order: 254,
    specifications: { apertureMm: 180, focalLengthMm: 500 },
    planner: {
      group: "reflectors",
      maker: "Takahashi",
      makerPages: [
        {
          url: "https://takahashijapan.jp/products/telescope/%CE%B5/%CE%B5-180ed-2-2/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "takahashi-mewlon-180c",
    type: "telescope",
    name: "Takahashi Mewlon-180C",
    order: 255,
    specifications: { apertureMm: 180, focalLengthMm: 2160 },
    planner: {
      group: "reflectors",
      maker: "Takahashi",
      makerPages: [
        {
          url: "https://takahashijapan.jp/products/telescope/mewlon/mewlon180c/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "takahashi-mewlon-250crs",
    type: "telescope",
    name: "Takahashi Mewlon-250CRS",
    order: 256,
    specifications: { apertureMm: 250, focalLengthMm: 2500 },
    planner: {
      group: "reflectors",
      maker: "Takahashi",
      makerPages: [
        {
          url: "https://takahashijapan.jp/products/telescope/mewlon-crs/%CE%BC-250crs/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "takahashi-mewlon-300crs",
    type: "telescope",
    name: "Takahashi Mewlon-300CRS",
    order: 257,
    specifications: { apertureMm: 300, focalLengthMm: 2960 },
    planner: {
      group: "reflectors",
      maker: "Takahashi",
      makerPages: [
        {
          url: "https://takahashijapan.jp/products/telescope/mewlon-crs/%ce%bc-300crs/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "ts-optics-gso-rc6",
    type: "telescope",
    name: 'TS-Optics GSO 6" Ritchey-Chretien Pro RC',
    order: 258,
    specifications: { apertureMm: 154, focalLengthMm: 1370 },
    planner: {
      group: "reflectors",
      maker: "TS-Optics",
      makerPages: [
        {
          url: "https://www.teleskop-express.de/en/ts-teleskope-143/rc-ritchey-chretien-telescopes-75/ts-optics-gso-6-ritchey-chretien-pro-rc-telescope-154-1370-mm-ota-2445",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "ts-optics-gso-rc8",
    type: "telescope",
    name: 'TS-Optics GSO 8" Ritchey-Chretien Pro RC (GSO RC8)',
    order: 259,
    specifications: { apertureMm: 203, focalLengthMm: 1624 },
    planner: {
      group: "reflectors",
      maker: "TS-Optics",
      makerPages: [
        {
          url: "https://www.teleskop-express.de/en/telescopes-4/rc-ritchey-chretien-telescopes-75/ts-optics-gso-8-ritchey-chretien-pro-rc-telescope-203-1624-mm-ota-5222",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "ts-optics-gso-rc12",
    type: "telescope",
    name: 'TS-Optics GSO 12" Ritchey-Chretien Pro RC',
    order: 260,
    specifications: { apertureMm: 304, focalLengthMm: 2432 },
    planner: {
      group: "reflectors",
      maker: "TS-Optics",
      makerPages: [
        {
          url: "https://www.teleskop-express.de/en/telescopes-4/rc-ritchey-chretien-telescopes-75/ts-optics-gso-12-f-8-ritchey-chretien-pro-rc-telescope-304-2432-mm-ota-4713",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "ts-optics-photon-6-f4",
    type: "telescope",
    name: 'TS-Optics Photon 6" f/4 (GSO)',
    order: 261,
    specifications: { apertureMm: 154, focalLengthMm: 600 },
    planner: {
      group: "reflectors",
      maker: "TS-Optics",
      makerPages: [
        {
          url: "https://www.teleskop-express.de/en/ts-teleskope-143/photon-newtonians-from-gso-up-to-12-aperture-311/ts-optics-gso-photon-6-f4-advanced-newtonian-telescope-with-metal-tube-10227",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "ts-optics-photon-6-f5",
    type: "telescope",
    name: 'TS-Optics Photon 6" f/5 (GSO)',
    order: 262,
    specifications: { apertureMm: 150, focalLengthMm: 750 },
    planner: {
      group: "reflectors",
      maker: "TS-Optics",
      makerPages: [
        {
          url: "https://www.teleskop-express.de/en/ts-teleskope-143/photon-newtonians-from-gso-up-to-12-aperture-311/ts-optics-gso-photon-6-f5-advanced-newtonian-telescope-with-metal-tube-micro-transmission-12285",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "ts-optics-photon-8-f4",
    type: "telescope",
    name: 'TS-Optics Photon 8" f/4 (GSO)',
    order: 263,
    specifications: { apertureMm: 203, focalLengthMm: 800 },
    planner: {
      group: "reflectors",
      maker: "TS-Optics",
      makerPages: [
        {
          url: "https://www.teleskop-express.de/en/ts-teleskope-143/photon-newtonians-from-gso-up-to-12-aperture-311/ts-optics-gso-photon-8-f4-advanced-newtonian-telescope-with-metal-tube-10259",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "ts-optics-photon-8-f5",
    type: "telescope",
    name: 'TS-Optics Photon 8" f/5 (GSO)',
    order: 264,
    specifications: { apertureMm: 200, focalLengthMm: 1000 },
    planner: {
      group: "reflectors",
      maker: "TS-Optics",
      makerPages: [
        {
          url: "https://www.teleskop-express.de/en/ts-teleskope-143/photon-newtonians-from-gso-up-to-12-aperture-311/ts-optics-gso-photon-8-f5-advanced-newtonian-telescope-ota-49",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "ts-optics-photon-10-f4",
    type: "telescope",
    name: 'TS-Optics Photon 10" f/4 (GSO)',
    order: 265,
    specifications: { apertureMm: 254, focalLengthMm: 1016 },
    planner: {
      group: "reflectors",
      maker: "TS-Optics",
      makerPages: [
        {
          url: "https://www.teleskop-express.de/en/ts-teleskope-143/photon-newtonians-from-gso-up-to-12-aperture-311/ts-optics-gso-photon-254-mm-f4-newtonian-telescope-with-steel-tube-12306",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "ts-optics-photon-10-f5",
    type: "telescope",
    name: 'TS-Optics Photon 10" f/5 (GSO)',
    order: 266,
    specifications: { apertureMm: 254, focalLengthMm: 1270 },
    planner: {
      group: "reflectors",
      maker: "TS-Optics",
      makerPages: [
        {
          url: "https://www.teleskop-express.de/en/telescopes-4/newtonian-telescopes-315/newtonians-ts-photon-311/ts-optics-gso-photon-254-mm-f-5-newtonian-telescope-with-steel-tube-12314",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "ts-optics-photon-12-f4",
    type: "telescope",
    name: 'TS-Optics Photon 12" f/4 (GSO)',
    order: 267,
    specifications: { apertureMm: 305, focalLengthMm: 1220 },
    planner: {
      group: "reflectors",
      maker: "TS-Optics",
      makerPages: [
        {
          url: "https://www.teleskop-express.de/en/telescopes-4/newtonian-telescopes-315/newtonians-ts-photon-311/ts-optics-gso-photon-12-f4-advanced-newtonian-telescope-with-metal-tube-11189",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "ts-optics-photon-12-f5",
    type: "telescope",
    name: 'TS-Optics Photon 12" f/5 (GSO)',
    order: 268,
    specifications: { apertureMm: 305, focalLengthMm: 1500 },
    planner: {
      group: "reflectors",
      maker: "TS-Optics",
      makerPages: [
        {
          url: "https://www.teleskop-express.de/en/telescopes-4/newtonian-telescopes-315/newtonians-ts-photon-311/ts-optics-gso-photon-12-f5-advanced-newtonian-telescope-with-metal-tube-10276",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "vixen-r200ss",
    type: "telescope",
    name: "Vixen R200SS",
    order: 269,
    specifications: { apertureMm: 200, focalLengthMm: 800 },
    planner: {
      group: "reflectors",
      maker: "Vixen",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : aperture and focal length read on the Teleskop-Express retailer page (Vixen's own pages returned an access error).",
      makerPages: [
        {
          url: "https://www.teleskop-express.de/shop/product_info.php/language/en/info/p1176_Vixen-R200SS-Newtonian-Telescope-OTA.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "vixen-vc200l",
    type: "telescope",
    name: "Vixen VC200L",
    order: 270,
    specifications: { apertureMm: 200, focalLengthMm: 1800 },
    planner: {
      group: "reflectors",
      maker: "Vixen",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : aperture and focal length read on the Teleskop-Express retailer page (Vixen's own pages returned an access error).",
      makerPages: [
        {
          url: "https://www.teleskop-express.de/shop/product_info.php/language/en/info/p1182_Vixen--2632-VC200L-Optical-Tube.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "vixen-vmc200l",
    type: "telescope",
    name: "Vixen VMC200L (Maksutov)",
    order: 271,
    specifications: { apertureMm: 200, focalLengthMm: 1950 },
    planner: {
      group: "reflectors",
      maker: "Vixen",
      calculated: ["apertureMm", "focalLengthMm"],
      calculation:
        "Estimation : aperture and focal length read on the Teleskop-Express retailer page (Vixen's own pages returned an access error).",
      makerPages: [
        {
          url: "https://www.teleskop-express.de/shop/product_info.php/language/en/info/p1181_Vixen-VMC200L---8--f-9-75-field-Maksutov-OTA.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "altair-hypercam-26c",
    type: "camera",
    name: "Altair Hypercam 26C",
    order: 11,
    specifications: {
      sensorWidthMm: 23.4,
      sensorHeightMm: 15.7,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony IMX571",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://altairastro.com/altair-hypercam-26c-aps-c-colour-tec-astronomy-camera-16bit-6451-p.asp",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "altair-hypercam-26m",
    type: "camera",
    name: "Altair Hypercam 26M",
    order: 12,
    specifications: {
      sensorWidthMm: 23.4,
      sensorHeightMm: 15.7,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony IMX571",
      sensorKind: "mono",
      makerPages: [
        {
          url: "https://altairastro.com/altair-hypercam-26m-aps-c-mono-camera-16bit-7974-p.asp",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "altair-hypercam-533c",
    type: "camera",
    name: "Altair Hypercam 533C",
    order: 13,
    specifications: {
      sensorWidthMm: 11.31,
      sensorHeightMm: 11.28,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony IMX533",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://altairastro.com/altair-hypercam-533c-colour-camera-9239-p.asp",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "altair-hypercam-aa61cfx",
    type: "camera",
    name: "Altair Hypercam AA61CFX",
    order: 14,
    specifications: {
      sensorWidthMm: 35.976,
      sensorHeightMm: 23.989,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony IMX455",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://altairastro.com/hypercam-aa61cfx-full-frame-cooled-colour-camera-16bit-10144-p.asp",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "canon-eos-5d-mark-iv",
    type: "camera",
    name: "Canon EOS 5D Mark IV",
    order: 15,
    specifications: {
      sensorWidthMm: 36,
      sensorHeightMm: 24,
      pixelSizeUm: 5.36,
    },
    planner: {
      sensor: "Canon CMOS full frame",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://global.canon/en/c-museum/product/dslr849.html",
          readOn: "2026-10-30",
        },
        {
          url: "https://downloads.canon.com/nw/camera/products/eos/5d-mark-iv/specifications/canon-eos-5d-mark-iv-with-canon-log-specifications-chart.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "canon-eos-6d",
    type: "camera",
    name: "Canon EOS 6D",
    order: 16,
    specifications: {
      sensorWidthMm: 35.8,
      sensorHeightMm: 23.9,
      pixelSizeUm: 6.54,
    },
    planner: {
      sensor: "Canon CMOS full frame",
      sensorKind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 35.8 mm / 5472 px = 6.54 um (Canon's Camera Museum page gives the sensor as 35.8 x 23.9 mm and the large image as 5472 x 3648 px).",
      makerPages: [
        {
          url: "https://global.canon/en/c-museum/product/dslr813.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "canon-eos-6d-mark-ii",
    type: "camera",
    name: "Canon EOS 6D Mark II",
    order: 17,
    specifications: {
      sensorWidthMm: 35.9,
      sensorHeightMm: 24,
      pixelSizeUm: 5.67,
    },
    planner: {
      sensor: "Canon CMOS full frame",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://downloads.canon.com/nw/camera/products/eos/6d-mark-ii/specifications/canon-eos-6d-mark-ii-specifications-chart.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "canon-eos-80d",
    type: "camera",
    name: "Canon EOS 80D",
    order: 18,
    specifications: {
      sensorWidthMm: 22.5,
      sensorHeightMm: 15,
      pixelSizeUm: 3.72,
    },
    planner: {
      sensor: "Canon CMOS APS-C",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://downloads.canon.com/nw/camera/products/eos/80d/specifications/canon-eos-80d-specification-chart.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "canon-eos-90d",
    type: "camera",
    name: "Canon EOS 90D",
    order: 19,
    specifications: {
      sensorWidthMm: 22.3,
      sensorHeightMm: 14.8,
      pixelSizeUm: 3.2,
    },
    planner: {
      sensor: "Canon CMOS APS-C",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://downloads.canon.com/nw/camera/products/eos/90d/specs/eos-90d-specifications.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "canon-eos-250d",
    type: "camera",
    name: "Canon EOS 250D (Rebel SL3)",
    order: 20,
    specifications: {
      sensorWidthMm: 22.3,
      sensorHeightMm: 14.9,
      pixelSizeUm: 3.72,
    },
    planner: {
      sensor: "Canon CMOS APS-C",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://downloads.canon.com/nw/camera/products/eos/rebel-sl3/downloads/canon-eos-rebel-sl3-specifications-chart.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "canon-eos-850d",
    type: "camera",
    name: "Canon EOS 850D (Rebel T8i)",
    order: 21,
    specifications: {
      sensorWidthMm: 22.3,
      sensorHeightMm: 14.9,
      pixelSizeUm: 3.72,
    },
    planner: {
      sensor: "Canon CMOS APS-C",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://downloads.canon.com/nw/camera/products/eos/rebel-t8i/specs/eos-t8i-specifications.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "canon-eos-1300d",
    type: "camera",
    name: "Canon EOS 1300D (Rebel T6)",
    order: 22,
    specifications: {
      sensorWidthMm: 22.3,
      sensorHeightMm: 14.9,
      pixelSizeUm: 4.3,
    },
    planner: {
      sensor: "Canon CMOS APS-C",
      sensorKind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 22.3 mm / 5184 px = 4.3 um (Canon's Camera Museum page gives the sensor as 22.3 x 14.9 mm and the large image as 5184 px wide).",
      makerPages: [
        {
          url: "https://global.canon/en/c-museum/product/dslr848.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "canon-eos-r5",
    type: "camera",
    name: "Canon EOS R5",
    order: 23,
    specifications: { sensorWidthMm: 36, sensorHeightMm: 24, pixelSizeUm: 4.4 },
    planner: {
      sensor: "Canon CMOS full frame",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://downloads.canon.com/nw/camera/products/eos/product-1/pdfs/EOSR5_specifications_FINAL_3.25.2021.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "canon-eos-r6",
    type: "camera",
    name: "Canon EOS R6",
    order: 24,
    specifications: {
      sensorWidthMm: 36,
      sensorHeightMm: 24,
      pixelSizeUm: 6.56,
    },
    planner: {
      sensor: "Canon CMOS full frame",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://downloads.canon.com/nw/camera/products/eos/product-2/pdfs/EOS_R6_specifications.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "canon-eos-r6-mark-ii",
    type: "camera",
    name: "Canon EOS R6 Mark II",
    order: 25,
    specifications: { sensorWidthMm: 36, sensorHeightMm: 24, pixelSizeUm: 6 },
    planner: {
      sensor: "Canon CMOS full frame",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://downloads.canon.com/nw/camera/products/eos/r6-markii/R6-MarkII-SpecSheet.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "canon-eos-r7",
    type: "camera",
    name: "Canon EOS R7",
    order: 26,
    specifications: {
      sensorWidthMm: 22.3,
      sensorHeightMm: 14.8,
      pixelSizeUm: 3.2,
    },
    planner: {
      sensor: "Canon CMOS APS-C",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://downloads.canon.com/notthistime/cameras/better/EOSR7_specifications-5-22.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "canon-eos-r8",
    type: "camera",
    name: "Canon EOS R8",
    order: 27,
    specifications: { sensorWidthMm: 36, sensorHeightMm: 24, pixelSizeUm: 6 },
    planner: {
      sensor: "Canon CMOS full frame",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://downloads.canon.com/ow/camera/EOS-R8-Spec-Sheet.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "canon-eos-r10",
    type: "camera",
    name: "Canon EOS R10",
    order: 28,
    specifications: {
      sensorWidthMm: 22.3,
      sensorHeightMm: 14.9,
      pixelSizeUm: 3.72,
    },
    planner: {
      sensor: "Canon CMOS APS-C",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://downloads.canon.com/notthistime/cameras/good/EOSR10_specifications_5-22.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "fujifilm-x-h2",
    type: "camera",
    name: "Fujifilm X-H2",
    order: 29,
    specifications: {
      sensorWidthMm: 23.5,
      sensorHeightMm: 15.6,
      pixelSizeUm: 3.04,
    },
    planner: {
      sensor: "Fujifilm X-Trans CMOS 5 HR",
      sensorKind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 23.5 mm / 7728 px = 3.04 um (Fujifilm's page gives the sensor as 23.5 x 15.6 mm and the large 3:2 image as 7728 px wide).",
      makerPages: [
        {
          url: "http://www.fujifilm-x.com/en-us/products/cameras/x-h2/specifications/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "fujifilm-x-s20",
    type: "camera",
    name: "Fujifilm X-S20",
    order: 30,
    specifications: {
      sensorWidthMm: 23.5,
      sensorHeightMm: 15.6,
      pixelSizeUm: 3.77,
    },
    planner: {
      sensor: "Fujifilm X-Trans CMOS 4",
      sensorKind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 23.5 mm / 6240 px = 3.77 um (Fujifilm's page gives the sensor as 23.5 x 15.6 mm and the large 3:2 image as 6240 px wide).",
      makerPages: [
        {
          url: "http://www.fujifilm-x.com/en-us/products/cameras/x-s20/specifications/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "fujifilm-x-t3",
    type: "camera",
    name: "Fujifilm X-T3",
    order: 31,
    specifications: {
      sensorWidthMm: 23.5,
      sensorHeightMm: 15.6,
      pixelSizeUm: 3.77,
    },
    planner: {
      sensor: "Fujifilm X-Trans CMOS 4",
      sensorKind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 23.5 mm / 6240 px = 3.77 um (Fujifilm's page gives the sensor as 23.5 x 15.6 mm and the large 3:2 image as 6240 px wide).",
      makerPages: [
        {
          url: "http://www.fujifilm-x.com/en-us/products/cameras/x-t3/specifications/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "fujifilm-x-t4",
    type: "camera",
    name: "Fujifilm X-T4",
    order: 32,
    specifications: {
      sensorWidthMm: 23.5,
      sensorHeightMm: 15.6,
      pixelSizeUm: 3.77,
    },
    planner: {
      sensor: "Fujifilm X-Trans CMOS 4",
      sensorKind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 23.5 mm / 6240 px = 3.77 um (Fujifilm's page gives the sensor as 23.5 x 15.6 mm and the large 3:2 image as 6240 px wide).",
      makerPages: [
        {
          url: "http://www.fujifilm-x.com/en-us/products/cameras/x-t4/specifications/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "fujifilm-x-t5",
    type: "camera",
    name: "Fujifilm X-T5",
    order: 33,
    specifications: {
      sensorWidthMm: 23.5,
      sensorHeightMm: 15.7,
      pixelSizeUm: 3.04,
    },
    planner: {
      sensor: "Fujifilm X-Trans CMOS 5 HR",
      sensorKind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 23.5 mm / 7728 px = 3.04 um (Fujifilm's page gives the sensor as 23.5 x 15.7 mm and the large 3:2 image as 7728 px wide).",
      makerPages: [
        {
          url: "http://www.fujifilm-x.com/en-us/products/cameras/x-t5/specifications/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "fujifilm-x-t30",
    type: "camera",
    name: "Fujifilm X-T30",
    order: 34,
    specifications: {
      sensorWidthMm: 23.5,
      sensorHeightMm: 15.6,
      pixelSizeUm: 3.77,
    },
    planner: {
      sensor: "Fujifilm X-Trans CMOS 4",
      sensorKind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 23.5 mm / 6240 px = 3.77 um (Fujifilm's page gives the sensor as 23.5 x 15.6 mm and the large 3:2 image as 6240 px wide).",
      makerPages: [
        {
          url: "http://www.fujifilm-x.com/en-us/products/cameras/x-t30/specifications/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "fujifilm-x-t30-ii",
    type: "camera",
    name: "Fujifilm X-T30 II",
    order: 35,
    specifications: {
      sensorWidthMm: 23.5,
      sensorHeightMm: 15.6,
      pixelSizeUm: 3.77,
    },
    planner: {
      sensor: "Fujifilm X-Trans CMOS 4",
      sensorKind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 23.5 mm / 6240 px = 3.77 um (Fujifilm's page gives the sensor as 23.5 x 15.6 mm and the large 3:2 image as 6240 px wide).",
      makerPages: [
        {
          url: "http://www.fujifilm-x.com/en-us/products/cameras/x-t30-ii/specifications/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "nikon-d750",
    type: "camera",
    name: "Nikon D750",
    order: 36,
    specifications: {
      sensorWidthMm: 35.9,
      sensorHeightMm: 24,
      pixelSizeUm: 5.97,
    },
    planner: {
      sensor: "Nikon CMOS FX",
      sensorKind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 35.9 mm / 6016 px = 5.97 um (Nikon's page gives the sensor as 35.9 x 24.0 mm and the FX-format large image area as 6016 px wide).",
      makerPages: [
        {
          url: "https://www.nikonusa.com/p/d750/1543/overview",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "nikon-d810a",
    type: "camera",
    name: "Nikon D810A",
    order: 37,
    specifications: {
      sensorWidthMm: 35.9,
      sensorHeightMm: 24,
      pixelSizeUm: 4.88,
    },
    planner: {
      sensor: "Nikon CMOS FX",
      sensorKind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 35.9 mm / 7360 px = 4.88 um (Nikon's page gives the sensor as 35.9 x 24.0 mm and the FX-format large image area as 7360 px wide).",
      makerPages: [
        {
          url: "https://www.nikonusa.com/p/d810a-refurbished/1553B/overview",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "nikon-d850",
    type: "camera",
    name: "Nikon D850",
    order: 38,
    specifications: {
      sensorWidthMm: 35.9,
      sensorHeightMm: 23.9,
      pixelSizeUm: 4.35,
    },
    planner: {
      sensor: "Nikon CMOS FX",
      sensorKind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 35.9 mm / 8256 px = 4.35 um (Nikon's page gives the sensor as 35.9 x 23.9 mm and the FX-format large image area as 8256 px wide).",
      makerPages: [
        {
          url: "https://www.nikonusa.com/p/d850/1585/overview",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "nikon-d5600",
    type: "camera",
    name: "Nikon D5600",
    order: 39,
    specifications: {
      sensorWidthMm: 23.5,
      sensorHeightMm: 15.6,
      pixelSizeUm: 3.92,
    },
    planner: {
      sensor: "Nikon CMOS DX",
      sensorKind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 23.5 mm / 6000 px = 3.92 um (Nikon's page gives the sensor as 23.5 x 15.6 mm and the DX-format large image area as 6000 px wide).",
      makerPages: [
        {
          url: "https://www.nikonusa.com/p/d5600/1576/overview",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "nikon-d7500",
    type: "camera",
    name: "Nikon D7500",
    order: 40,
    specifications: {
      sensorWidthMm: 23.5,
      sensorHeightMm: 15.6,
      pixelSizeUm: 4.22,
    },
    planner: {
      sensor: "Nikon CMOS DX",
      sensorKind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 23.5 mm / 5568 px = 4.22 um (Nikon's page gives the sensor as 23.5 x 15.6 mm and the DX-format large image area as 5568 px wide).",
      makerPages: [
        {
          url: "https://www.nikonusa.com/p/d7500/13560/overview",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "nikon-z6",
    type: "camera",
    name: "Nikon Z6",
    order: 41,
    specifications: {
      sensorWidthMm: 35.9,
      sensorHeightMm: 23.9,
      pixelSizeUm: 5.94,
    },
    planner: {
      sensor: "Nikon CMOS FX",
      sensorKind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 35.9 mm / 6048 px = 5.94 um (Nikon's page gives the sensor as 35.9 x 23.9 mm and the FX-format large image area as 6048 px wide).",
      makerPages: [
        {
          url: "https://www.nikonusa.com/p/z-6/1595/overview",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "nikon-z6-ii",
    type: "camera",
    name: "Nikon Z6 II",
    order: 42,
    specifications: {
      sensorWidthMm: 35.9,
      sensorHeightMm: 23.9,
      pixelSizeUm: 5.94,
    },
    planner: {
      sensor: "Nikon CMOS FX",
      sensorKind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 35.9 mm / 6048 px = 5.94 um (Nikon's page gives the sensor as 35.9 x 23.9 mm and the FX-format large image area as 6048 px wide).",
      makerPages: [
        {
          url: "https://www.nikonusa.com/p/z-6ii/1659/overview",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "nikon-z7",
    type: "camera",
    name: "Nikon Z7",
    order: 43,
    specifications: {
      sensorWidthMm: 35.9,
      sensorHeightMm: 23.9,
      pixelSizeUm: 4.35,
    },
    planner: {
      sensor: "Nikon CMOS FX",
      sensorKind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 35.9 mm / 8256 px = 4.35 um (Nikon's page gives the sensor as 35.9 x 23.9 mm and the FX-format large image area as 8256 px wide).",
      makerPages: [
        {
          url: "https://www.nikonusa.com/p/z-7/1591/overview",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "nikon-z7-ii",
    type: "camera",
    name: "Nikon Z7 II",
    order: 44,
    specifications: {
      sensorWidthMm: 35.9,
      sensorHeightMm: 23.9,
      pixelSizeUm: 4.35,
    },
    planner: {
      sensor: "Nikon CMOS FX",
      sensorKind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 35.9 mm / 8256 px = 4.35 um (Nikon's page gives the sensor as 35.9 x 23.9 mm and the FX-format large image area as 8256 px wide).",
      makerPages: [
        {
          url: "https://www.nikonusa.com/p/z-7ii/1653/overview",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "nikon-z50",
    type: "camera",
    name: "Nikon Z 50",
    order: 45,
    specifications: {
      sensorWidthMm: 23.5,
      sensorHeightMm: 15.7,
      pixelSizeUm: 4.22,
    },
    planner: {
      sensor: "Nikon CMOS DX",
      sensorKind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 23.5 mm / 5568 px = 4.22 um (Nikon's page gives the sensor as 23.5 x 15.7 mm and the DX-format large image area as 5568 px wide).",
      makerPages: [
        {
          url: "https://www.nikonusa.com/p/z-50-refurbished/1634B/overview",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "player-one-ares-c-pro",
    type: "camera",
    name: "Player One Ares-C Pro",
    order: 46,
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
          url: "https://player-one-astronomy.com/product/ares-c-pro-usb3-0-color-camera-imx533/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "player-one-artemis-c-pro",
    type: "camera",
    name: "Player One Artemis-C Pro",
    order: 47,
    specifications: {
      sensorWidthMm: 19.2,
      sensorHeightMm: 13,
      pixelSizeUm: 4.63,
    },
    planner: {
      sensor: "Sony IMX294",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://player-one-astronomy.com/product/artemis-c-pro-imx294-usb3-0-color-cooled-camera/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "player-one-artemis-m-pro",
    type: "camera",
    name: "Player One Artemis-M Pro",
    order: 48,
    specifications: {
      sensorWidthMm: 19.2,
      sensorHeightMm: 13,
      pixelSizeUm: 2.315,
    },
    planner: {
      sensor: "Sony IMX492",
      sensorKind: "mono",
      makerPages: [
        {
          url: "https://player-one-astronomy.com/product/artemis-m-pro-imx492-usb3-0-mono-cooled-camera/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "player-one-mars-c",
    type: "camera",
    name: "Player One Mars-C",
    order: 49,
    specifications: {
      sensorWidthMm: 5.6,
      sensorHeightMm: 3.2,
      pixelSizeUm: 2.9,
    },
    planner: {
      sensor: "Sony IMX462",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://player-one-astronomy.com/product/mars-color-camera/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "player-one-neptune-664c",
    type: "camera",
    name: "Player One Neptune 664C",
    order: 50,
    specifications: {
      sensorWidthMm: 7.8,
      sensorHeightMm: 4.5,
      pixelSizeUm: 2.9,
    },
    planner: {
      sensor: "Sony IMX664",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://player-one-astronomy.com/product/neptune-664c-usb3-0-color-camera/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "player-one-neptune-c",
    type: "camera",
    name: "Player One Neptune-C",
    order: 51,
    specifications: { sensorWidthMm: 7.4, sensorHeightMm: 5, pixelSizeUm: 2.4 },
    planner: {
      sensor: "Sony IMX178",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://player-one-astronomy.com/product/neptune-cusb3-0-color-camera-imx178/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "player-one-neptune-m",
    type: "camera",
    name: "Player One Neptune-M",
    order: 52,
    specifications: { sensorWidthMm: 7.4, sensorHeightMm: 5, pixelSizeUm: 2.4 },
    planner: {
      sensor: "Sony IMX178",
      sensorKind: "mono",
      makerPages: [
        {
          url: "https://player-one-astronomy.com/product/neptune-m-usb3-0-mono-camera-imx178/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "player-one-poseidon-m-pro",
    type: "camera",
    name: "Player One Poseidon-M Pro",
    order: 53,
    specifications: {
      sensorWidthMm: 23.5,
      sensorHeightMm: 15.7,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony IMX571",
      sensorKind: "mono",
      makerPages: [
        {
          url: "https://player-one-astronomy.com/product/poseidon-m-pro-imx571-usb3-0-mono-cooled-camera/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "player-one-uranus-c",
    type: "camera",
    name: "Player One Uranus-C",
    order: 54,
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
          url: "https://player-one-astronomy.com/product/uranus-c-usb3-0-color-camera-imx585/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "player-one-uranus-m",
    type: "camera",
    name: "Player One Uranus-M",
    order: 55,
    specifications: {
      sensorWidthMm: 11.2,
      sensorHeightMm: 6.3,
      pixelSizeUm: 2.9,
    },
    planner: {
      sensor: "Sony IMX585",
      sensorKind: "mono",
      makerPages: [
        {
          url: "https://player-one-astronomy.com/product/uranus-m-usb3-0-mono-camera-imx585/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "player-one-zeus-455c-pro",
    type: "camera",
    name: "Player One Zeus 455C Pro",
    order: 56,
    specifications: {
      sensorWidthMm: 36,
      sensorHeightMm: 24,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony IMX455",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://player-one-astronomy.com/product/zeus-455c-pro-imx455-usb3-0-color-cooled-camera/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "qhyccd-qhy5iii462c",
    type: "camera",
    name: "QHYCCD QHY5III462C",
    order: 57,
    specifications: {
      sensorWidthMm: 5.57,
      sensorHeightMm: 3.13,
      pixelSizeUm: 2.9,
    },
    planner: {
      sensor: "Sony IMX462",
      sensorKind: "colour",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Effective area 1920 x 1080 px x 2.9 um (maker's page gives « Typical 1/2.8 inch » without millimetres).",
      makerPages: [
        {
          url: "https://www.qhyccd.com/planetary-camera-qhy5iii462c/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "qhyccd-qhy5iii585c",
    type: "camera",
    name: "QHYCCD QHY5III585C",
    order: 58,
    specifications: {
      sensorWidthMm: 11.18,
      sensorHeightMm: 6.32,
      pixelSizeUm: 2.9,
    },
    planner: {
      sensor: "Sony IMX585",
      sensorKind: "colour",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Effective area 3856 x 2180 px x 2.9 um (maker's page gives « 1/1.2inch » without millimetres).",
      makerPages: [
        { url: "https://www.qhyccd.com/qhy5iii585/", readOn: "2026-10-30" },
      ],
    },
  },
  {
    id: "qhyccd-qhy5iii678c",
    type: "camera",
    name: "QHYCCD QHY5III678C",
    order: 59,
    specifications: {
      sensorWidthMm: 7.71,
      sensorHeightMm: 4.36,
      pixelSizeUm: 2,
    },
    planner: {
      sensor: "Sony IMX678",
      sensorKind: "colour",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Effective area 3856 x 2180 px x 2.0 um (maker's page gives « 1/1.8inch » without millimetres).",
      makerPages: [
        { url: "https://www.qhyccd.com/qhy5iii678/", readOn: "2026-10-30" },
      ],
    },
  },
  {
    id: "qhyccd-qhy5iii715c",
    type: "camera",
    name: "QHYCCD QHY5III715C",
    order: 60,
    specifications: {
      sensorWidthMm: 5.6,
      sensorHeightMm: 3.2,
      pixelSizeUm: 1.45,
    },
    planner: {
      sensor: "Sony IMX715",
      sensorKind: "colour",
      makerPages: [
        { url: "https://www.qhyccd.com/qhy5iii715c/", readOn: "2026-10-30" },
      ],
    },
  },
  {
    id: "qhyccd-qhy183c",
    type: "camera",
    name: "QHYCCD QHY183C",
    order: 61,
    specifications: {
      sensorWidthMm: 13.3,
      sensorHeightMm: 8.87,
      pixelSizeUm: 2.4,
    },
    planner: {
      sensor: "Sony IMX183",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://www.qhyccd.com/astronomical-camera-qhy183/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "qhyccd-qhy183m",
    type: "camera",
    name: "QHYCCD QHY183M",
    order: 62,
    specifications: {
      sensorWidthMm: 13.3,
      sensorHeightMm: 8.87,
      pixelSizeUm: 2.4,
    },
    planner: {
      sensor: "Sony IMX183",
      sensorKind: "mono",
      makerPages: [
        {
          url: "https://www.qhyccd.com/astronomical-camera-qhy183/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "qhyccd-qhy268m",
    type: "camera",
    name: "QHYCCD QHY268M",
    order: 63,
    specifications: {
      sensorWidthMm: 23.51,
      sensorHeightMm: 15.7,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony IMX571",
      sensorKind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Effective image 6252 × 4176 px × 3.76 µm (the maker gives « APS-C » without millimetres).",
      makerPages: [
        {
          url: "https://www.qhyccd.com/astronomical-camera-qhy268/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "qhyccd-qhy294m-pro",
    type: "camera",
    name: "QHYCCD QHY294M Pro",
    order: 64,
    specifications: {
      sensorWidthMm: 19.28,
      sensorHeightMm: 12.95,
      pixelSizeUm: 4.63,
    },
    planner: {
      sensor: "Sony IMX492",
      sensorKind: "mono",
      makerPages: [
        {
          url: "https://www.qhyccd.com/astronomical-camera-qhy294/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "qhyccd-qhy411ph",
    type: "camera",
    name: "QHYCCD QHY411PH",
    order: 65,
    specifications: {
      sensorWidthMm: 54,
      sensorHeightMm: 40,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony IMX411",
      sensorKind: "mono",
      makerPages: [
        {
          url: "https://www.qhyccd.com/qhy461ph-qhy411ph/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "qhyccd-qhy461ph",
    type: "camera",
    name: "QHYCCD QHY461PH",
    order: 66,
    specifications: {
      sensorWidthMm: 44,
      sensorHeightMm: 33,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony IMX461",
      sensorKind: "mono",
      makerPages: [
        {
          url: "https://www.qhyccd.com/qhy461ph-qhy411ph/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "qhyccd-qhy600c",
    type: "camera",
    name: "QHYCCD QHY600C",
    order: 67,
    specifications: {
      sensorWidthMm: 36,
      sensorHeightMm: 24,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony IMX455",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://www.qhyccd.com/astronomical-camera-qhy600/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "qhyccd-qhy600m",
    type: "camera",
    name: "QHYCCD QHY600M",
    order: 68,
    specifications: {
      sensorWidthMm: 36,
      sensorHeightMm: 24,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony IMX455",
      sensorKind: "mono",
      makerPages: [
        {
          url: "https://www.qhyccd.com/astronomical-camera-qhy600/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "sony-a7-iii",
    type: "camera",
    name: "Sony Alpha 7 III (ILCE-7M3)",
    order: 69,
    specifications: {
      sensorWidthMm: 35.6,
      sensorHeightMm: 23.8,
      pixelSizeUm: 5.93,
    },
    planner: {
      sensor: "Sony CMOS full frame",
      sensorKind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 35.6 mm / 6000 px = 5.93 um (Sony's help guide gives the image format as 35.6 x 23.8 mm and the large 3:2 image as 6000 px wide).",
      makerPages: [
        {
          url: "https://helpguide.sony.net/ilc/1720/v1/en/print.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "sony-a7-iv",
    type: "camera",
    name: "Sony Alpha 7 IV (ILCE-7M4)",
    order: 70,
    specifications: {
      sensorWidthMm: 35.9,
      sensorHeightMm: 23.9,
      pixelSizeUm: 5.12,
    },
    planner: {
      sensor: "Sony CMOS full frame",
      sensorKind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 35.9 mm / 7008 px = 5.12 um (Sony's help guide gives the image format as 35.9 x 23.9 mm and the large 3:2 image as 7008 px wide).",
      makerPages: [
        {
          url: "https://helpguide.sony.net/ilc/2110/v1/en/print.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "sony-a7r-iii",
    type: "camera",
    name: "Sony Alpha 7R III (ILCE-7RM3)",
    order: 71,
    specifications: {
      sensorWidthMm: 35.9,
      sensorHeightMm: 24,
      pixelSizeUm: 4.51,
    },
    planner: {
      sensor: "Sony CMOS full frame",
      sensorKind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 35.9 mm / 7952 px = 4.51 um (Sony's help guide gives the image format as 35.9 x 24.0 mm and the large 3:2 image as 7952 px wide).",
      makerPages: [
        {
          url: "https://helpguide.sony.net/ilc/1710/v1/en/print.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "sony-a7r-iv",
    type: "camera",
    name: "Sony Alpha 7R IV (ILCE-7RM4)",
    order: 72,
    specifications: {
      sensorWidthMm: 35.7,
      sensorHeightMm: 23.8,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony CMOS full frame",
      sensorKind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 35.7 mm / 9504 px = 3.76 um (Sony's help guide gives the image format as 35.7 x 23.8 mm and the large 3:2 image as 9504 px wide).",
      makerPages: [
        {
          url: "https://helpguide.sony.net/ilc/1930/v1/en/print.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "sony-a7r-v",
    type: "camera",
    name: "Sony Alpha 7R V (ILCE-7RM5)",
    order: 73,
    specifications: {
      sensorWidthMm: 35.7,
      sensorHeightMm: 23.8,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony CMOS full frame",
      sensorKind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 35.7 mm / 9504 px = 3.76 um (Sony's help guide gives the image format as 35.7 x 23.8 mm and the large 3:2 image as 9504 px wide).",
      makerPages: [
        {
          url: "https://helpguide.sony.net/ilc/2230/v1/en/print.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "sony-a7s-iii",
    type: "camera",
    name: "Sony Alpha 7S III (ILCE-7SM3)",
    order: 74,
    specifications: {
      sensorWidthMm: 35.6,
      sensorHeightMm: 23.8,
      pixelSizeUm: 8.4,
    },
    planner: {
      sensor: "Sony CMOS full frame",
      sensorKind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 35.6 mm / 4240 px = 8.4 um (Sony's help guide gives the image format as 35.6 x 23.8 mm and the large 3:2 image as 4240 px wide).",
      makerPages: [
        {
          url: "https://helpguide.sony.net/ilc/2010/v1/en/print.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "sony-a6100",
    type: "camera",
    name: "Sony Alpha 6100 (ILCE-6100)",
    order: 75,
    specifications: {
      sensorWidthMm: 23.5,
      sensorHeightMm: 15.6,
      pixelSizeUm: 3.92,
    },
    planner: {
      sensor: "Sony CMOS APS-C",
      sensorKind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 23.5 mm / 6000 px = 3.92 um (Sony's help guide gives the image format as 23.5 x 15.6 mm and the large 3:2 image as 6000 px wide).",
      makerPages: [
        {
          url: "https://helpguide.sony.net/ilc/1950/v1/en/print.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "sony-a6400",
    type: "camera",
    name: "Sony Alpha 6400 (ILCE-6400)",
    order: 76,
    specifications: {
      sensorWidthMm: 23.5,
      sensorHeightMm: 15.6,
      pixelSizeUm: 3.92,
    },
    planner: {
      sensor: "Sony CMOS APS-C",
      sensorKind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 23.5 mm / 6000 px = 3.92 um (Sony's help guide gives the image format as 23.5 x 15.6 mm and the large 3:2 image as 6000 px wide).",
      makerPages: [
        {
          url: "https://helpguide.sony.net/ilc/1810/v1/en/print.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "sony-a6600",
    type: "camera",
    name: "Sony Alpha 6600 (ILCE-6600)",
    order: 77,
    specifications: {
      sensorWidthMm: 23.5,
      sensorHeightMm: 15.6,
      pixelSizeUm: 3.92,
    },
    planner: {
      sensor: "Sony CMOS APS-C",
      sensorKind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 23.5 mm / 6000 px = 3.92 um (Sony's help guide gives the image format as 23.5 x 15.6 mm and the large 3:2 image as 6000 px wide).",
      makerPages: [
        {
          url: "https://helpguide.sony.net/ilc/1940/v1/en/print.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "sony-a6700",
    type: "camera",
    name: "Sony Alpha 6700 (ILCE-6700)",
    order: 78,
    specifications: {
      sensorWidthMm: 23.3,
      sensorHeightMm: 15.5,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony CMOS APS-C",
      sensorKind: "colour",
      calculated: ["pixelSizeUm"],
      calculation:
        "Pixel size 23.3 mm / 6192 px = 3.76 um (Sony's help guide gives the image format as 23.3 x 15.5 mm and the large 3:2 image as 6192 px wide).",
      makerPages: [
        {
          url: "https://helpguide.sony.net/ilc/2320/v1/en/print.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "svbony-sv605cc",
    type: "camera",
    name: "Svbony SV605CC",
    order: 79,
    specifications: {
      sensorWidthMm: 11.31,
      sensorHeightMm: 11.31,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony IMX533",
      sensorKind: "colour",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 3008 x 3008 px x 3.76 um (maker's page gives resolution and pixel size, no millimetres).",
      makerPages: [
        {
          url: "https://www.svbony.com/products/sv605cc-camera",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "touptek-atr294m",
    type: "camera",
    name: "ToupTek ATR294M",
    order: 80,
    specifications: {
      sensorWidthMm: 19.1,
      sensorHeightMm: 13,
      pixelSizeUm: 4.63,
    },
    planner: {
      sensor: "Sony IMX294",
      sensorKind: "mono",
      makerPages: [
        {
          url: "https://www.touptekastro.com/products/atr294m",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "touptek-atr2600c",
    type: "camera",
    name: "ToupTek ATR2600C",
    order: 81,
    specifications: {
      sensorWidthMm: 23.4,
      sensorHeightMm: 15.67,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony IMX571",
      sensorKind: "colour",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 6224 x 4168 px x 3.76 um (maker's page gives resolution and pixel size, no millimetres).",
      makerPages: [
        {
          url: "https://www.touptekastro.com/products/atr2600c",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "touptek-atr2600m",
    type: "camera",
    name: "ToupTek ATR2600M",
    order: 82,
    specifications: {
      sensorWidthMm: 23.5,
      sensorHeightMm: 15.7,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony IMX571",
      sensorKind: "mono",
      makerPages: [
        {
          url: "https://www.touptekastro.com/products/atr2600m",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "zwo-asi120mc-s",
    type: "camera",
    name: "ZWO ASI120MC-S",
    order: 83,
    specifications: {
      sensorWidthMm: 4.8,
      sensorHeightMm: 3.6,
      pixelSizeUm: 3.75,
    },
    planner: {
      sensor: "AR0130CS",
      sensorKind: "colour",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 1280 x 960 px x 3.75 um (maker's manual gives resolution and pixel size, no millimetres).",
      makerPages: [
        {
          url: "https://i.zwoastro.com/zwo-website/manuals/ASI120_Manual_EN_V1.4.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "zwo-asi120mm-mini",
    type: "camera",
    name: "ZWO ASI120MM Mini",
    order: 84,
    specifications: {
      sensorWidthMm: 4.8,
      sensorHeightMm: 3.6,
      pixelSizeUm: 3.75,
    },
    planner: {
      sensor: "AR0130CS",
      sensorKind: "mono",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/mini-cameras/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "zwo-asi174mm",
    type: "camera",
    name: "ZWO ASI174MM",
    order: 85,
    specifications: {
      sensorWidthMm: 11.3,
      sensorHeightMm: 7.1,
      pixelSizeUm: 5.86,
    },
    planner: {
      sensor: "Sony IMX174",
      sensorKind: "mono",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/asi174mm-mono/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "zwo-asi178mc",
    type: "camera",
    name: "ZWO ASI178MC",
    order: 86,
    specifications: {
      sensorWidthMm: 7.43,
      sensorHeightMm: 4.99,
      pixelSizeUm: 2.4,
    },
    planner: {
      sensor: "Sony IMX178",
      sensorKind: "colour",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 3096 x 2080 px x 2.4 um (maker's manual gives resolution and pixel size, no millimetres).",
      makerPages: [
        {
          url: "https://i.zwoastro.com/zwo-website/manuals/ASI178_Manual_EN_V1.3.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "zwo-asi178mm",
    type: "camera",
    name: "ZWO ASI178MM",
    order: 87,
    specifications: {
      sensorWidthMm: 7.43,
      sensorHeightMm: 4.99,
      pixelSizeUm: 2.4,
    },
    planner: {
      sensor: "Sony IMX178",
      sensorKind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 3096 x 2080 px x 2.4 um (maker's manual gives resolution and pixel size, no millimetres).",
      makerPages: [
        {
          url: "https://i.zwoastro.com/zwo-website/manuals/ASI178_Manual_EN_V1.3.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "zwo-asi183mc-pro",
    type: "camera",
    name: "ZWO ASI183MC Pro",
    order: 88,
    specifications: {
      sensorWidthMm: 13.2,
      sensorHeightMm: 8.8,
      pixelSizeUm: 2.4,
    },
    planner: {
      sensor: "Sony IMX183",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/asi183/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "zwo-asi290mc",
    type: "camera",
    name: "ZWO ASI290MC",
    order: 89,
    specifications: {
      sensorWidthMm: 5.61,
      sensorHeightMm: 3.18,
      pixelSizeUm: 2.9,
    },
    planner: {
      sensor: "Sony IMX291",
      sensorKind: "colour",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 1936 x 1096 px x 2.9 um (maker's manual gives resolution and pixel size, no millimetres).",
      makerPages: [
        {
          url: "https://i.zwoastro.com/zwo-website/manuals/ASI290_Manual_EN_V1.3.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "zwo-asi290mm",
    type: "camera",
    name: "ZWO ASI290MM",
    order: 90,
    specifications: {
      sensorWidthMm: 5.61,
      sensorHeightMm: 3.18,
      pixelSizeUm: 2.9,
    },
    planner: {
      sensor: "Sony IMX290",
      sensorKind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 1936 x 1096 px x 2.9 um (maker's manual gives resolution and pixel size, no millimetres).",
      makerPages: [
        {
          url: "https://i.zwoastro.com/zwo-website/manuals/ASI290_Manual_EN_V1.3.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "zwo-asi294mm-pro",
    type: "camera",
    name: "ZWO ASI294MM Pro",
    order: 91,
    specifications: {
      sensorWidthMm: 19.1,
      sensorHeightMm: 13,
      pixelSizeUm: 2.3,
    },
    planner: {
      sensor: "Sony IMX492",
      sensorKind: "mono",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/asi294/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "zwo-asi462mc",
    type: "camera",
    name: "ZWO ASI462MC",
    order: 92,
    specifications: {
      sensorWidthMm: 5.6,
      sensorHeightMm: 3.2,
      pixelSizeUm: 2.9,
    },
    planner: {
      sensor: "Sony IMX462",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://i.zwoastro.com/zwo-website/manuals/ASI462_Manual_EN_V1.1.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "zwo-asi533mm-pro",
    type: "camera",
    name: "ZWO ASI533MM Pro",
    order: 93,
    specifications: {
      sensorWidthMm: 11.31,
      sensorHeightMm: 11.31,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony IMX533",
      sensorKind: "mono",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/asi533-pro-series/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "zwo-asi585mc",
    type: "camera",
    name: "ZWO ASI585MC",
    order: 94,
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
          url: "https://i.zwoastro.com/zwo-website/manuals/ASI585_Manual_EN_V1.0.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "zwo-asi585mm-pro",
    type: "camera",
    name: "ZWO ASI585MM Pro",
    order: 95,
    specifications: {
      sensorWidthMm: 11.2,
      sensorHeightMm: 6.3,
      pixelSizeUm: 2.9,
    },
    planner: {
      sensor: "Sony IMX585",
      sensorKind: "mono",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/asi585mc-mm-pro/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "zwo-asi715mc",
    type: "camera",
    name: "ZWO ASI715MC",
    order: 96,
    specifications: {
      sensorWidthMm: 5.6,
      sensorHeightMm: 3.2,
      pixelSizeUm: 1.45,
    },
    planner: {
      sensor: "Sony IMX715",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/asi715mc/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "zwo-asi1600mm-pro",
    type: "camera",
    name: "ZWO ASI1600MM Pro",
    order: 97,
    specifications: {
      sensorWidthMm: 17.69,
      sensorHeightMm: 13.38,
      pixelSizeUm: 3.8,
    },
    planner: {
      sensor: "Panasonic MN34230ALJ",
      sensorKind: "mono",
      calculated: ["sensorWidthMm", "sensorHeightMm"],
      calculation:
        "Image 4656 x 3520 px x 3.8 um (maker's manual gives resolution and pixel size, no millimetres).",
      makerPages: [
        {
          url: "https://i.zwoastro.com/zwo-website/manuals/ASI1600_Manual_EN_V1.5.pdf",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "zwo-asi2400mc-pro",
    type: "camera",
    name: "ZWO ASI2400MC Pro",
    order: 98,
    specifications: {
      sensorWidthMm: 36,
      sensorHeightMm: 24,
      pixelSizeUm: 5.94,
    },
    planner: {
      sensor: "Sony IMX410",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/asi2400mc-pro/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "zwo-asi2600mm-pro",
    type: "camera",
    name: "ZWO ASI2600MM Pro",
    order: 99,
    specifications: {
      sensorWidthMm: 23.5,
      sensorHeightMm: 15.7,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony IMX571",
      sensorKind: "mono",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/new-asi2600mm-mc-pro/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "zwo-asi6200mc-pro",
    type: "camera",
    name: "ZWO ASI6200MC Pro",
    order: 100,
    specifications: {
      sensorWidthMm: 36,
      sensorHeightMm: 24,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony IMX455",
      sensorKind: "colour",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/asi6200/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "zwo-asi6200mm-pro",
    type: "camera",
    name: "ZWO ASI6200MM Pro",
    order: 101,
    specifications: {
      sensorWidthMm: 36,
      sensorHeightMm: 24,
      pixelSizeUm: 3.76,
    },
    planner: {
      sensor: "Sony IMX455",
      sensorKind: "mono",
      makerPages: [
        {
          url: "https://www.zwoastro.com/product/asi6200/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "plossl-4",
    type: "eyepiece",
    name: "Plössl 4 mm",
    order: 6,
    specifications: { focalLengthMm: 4, apparentFieldDegrees: 50 },
    planner: {
      makerPages: [
        {
          url: "https://www.celestron.com/products/omni-4-mm-eyepiece-125in",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "plossl-6",
    type: "eyepiece",
    name: "Plössl 6 mm",
    order: 7,
    specifications: { focalLengthMm: 6, apparentFieldDegrees: 50 },
    planner: {
      makerPages: [
        {
          url: "https://www.celestron.com/products/omni-6-mm-eyepiece-125in",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "plossl-9",
    type: "eyepiece",
    name: "Plössl 9 mm",
    order: 8,
    specifications: { focalLengthMm: 9, apparentFieldDegrees: 50 },
    planner: {
      makerPages: [
        {
          url: "https://www.celestron.com/products/omni-9-mm-eyepiece-125in",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "plossl-15",
    type: "eyepiece",
    name: "Plössl 15 mm",
    order: 9,
    specifications: { focalLengthMm: 15, apparentFieldDegrees: 50 },
    planner: {
      makerPages: [
        {
          url: "https://www.celestron.com/products/omni-15-mm-eyepiece-125in",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "plossl-17",
    type: "eyepiece",
    name: "Plössl 17 mm",
    order: 10,
    specifications: { focalLengthMm: 17, apparentFieldDegrees: 52 },
    planner: {
      makerPages: [
        {
          url: "http://skywatcher.com/product/super-pl-10mm/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "plossl-40",
    type: "eyepiece",
    name: "Plössl 40 mm",
    order: 11,
    specifications: { focalLengthMm: 40, apparentFieldDegrees: 52 },
    planner: {
      makerPages: [
        {
          url: "http://skywatcher.com/product/super-pl-10mm/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "baader-hyperion-zoom-mk4",
    type: "eyepiece",
    name: "Baader Hyperion Zoom Mark IV 8–24 mm",
    order: 12,
    specifications: {
      focalLengthMm: 24,
      minFocalLengthMm: 8,
      maxFocalLengthMm: 24,
      apparentFieldDegrees: 48,
      minApparentFieldDegrees: 48,
      maxApparentFieldDegrees: 68,
    },
    planner: {
      makerPages: [
        {
          url: "https://www.baader-planetarium.com/en/baader-hyperion-universal-zoom-mark-iv-8-24mm-eyepiece-1-25inch-2inch.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "svbony-sv215-zoom-3-8",
    type: "eyepiece",
    name: "Svbony SV215 Zoom 3–8 mm",
    order: 13,
    specifications: {
      focalLengthMm: 8,
      minFocalLengthMm: 3,
      maxFocalLengthMm: 8,
      apparentFieldDegrees: 56,
      minApparentFieldDegrees: 56,
      maxApparentFieldDegrees: 56,
    },
    planner: {
      makerPages: [
        {
          url: "https://www.svbony.com/blog/how-much-do-you-know-about-sv215-zooms-eyepiece",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-click-stop-zoom-8-24",
    type: "eyepiece",
    name: "Tele Vue Click Stop Zoom 8–24 mm",
    order: 14,
    specifications: {
      focalLengthMm: 24,
      minFocalLengthMm: 8,
      maxFocalLengthMm: 24,
      apparentFieldDegrees: 40,
      minApparentFieldDegrees: 40,
      maxApparentFieldDegrees: 55,
    },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-nagler-zoom-3-6",
    type: "eyepiece",
    name: "Tele Vue Nagler Zoom 3–6 mm",
    order: 15,
    specifications: {
      focalLengthMm: 6,
      minFocalLengthMm: 3,
      maxFocalLengthMm: 6,
      apparentFieldDegrees: 50,
      minApparentFieldDegrees: 50,
      maxApparentFieldDegrees: 50,
    },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "apm-hdc-xwa-13",
    type: "eyepiece",
    name: "APM HDC-XWA 13 mm",
    order: 16,
    specifications: { focalLengthMm: 13, apparentFieldDegrees: 100 },
    planner: {
      makerPages: [
        {
          url: "https://www.apm-telescopes.net/en/apm-hdc-xwa-13-mm-100-eyepiece",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "apm-hdc-xwa-20",
    type: "eyepiece",
    name: "APM HDC-XWA 20 mm",
    order: 17,
    specifications: { focalLengthMm: 20, apparentFieldDegrees: 100 },
    planner: {
      makerPages: [
        {
          url: "https://www.apm-telescopes.net/en/apm-hdc-xwa-20mm-100-x-treme-weitwinkel-okular",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "apm-uff-10",
    type: "eyepiece",
    name: "APM UFF 10 mm",
    order: 18,
    specifications: { focalLengthMm: 10, apparentFieldDegrees: 60 },
    planner: {
      makerPages: [
        {
          url: "https://www.apm-telescopes.net/en/apm-ultra-flat-field-10mm-eyepiece-60-fov",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "apm-uff-15",
    type: "eyepiece",
    name: "APM UFF 15 mm",
    order: 19,
    specifications: { focalLengthMm: 15, apparentFieldDegrees: 65 },
    planner: {
      makerPages: [
        {
          url: "https://www.apm-telescopes.net/en/apm-ultra-flat-field-15mm-eyepiece-65-fov",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "apm-uff-18",
    type: "eyepiece",
    name: "APM UFF 18 mm",
    order: 20,
    specifications: { focalLengthMm: 18, apparentFieldDegrees: 65 },
    planner: {
      makerPages: [
        {
          url: "https://www.apm-telescopes.net/en/apm-ultra-flat-field-18mm-eyepiece-65-fov",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "apm-uff-24",
    type: "eyepiece",
    name: "APM UFF 24 mm",
    order: 21,
    specifications: { focalLengthMm: 24, apparentFieldDegrees: 65 },
    planner: {
      makerPages: [
        {
          url: "https://www.apm-telescopes.net/en/apm-ultra-flat-field-24mm-eyepiece-65-fov",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "apm-uff-30",
    type: "eyepiece",
    name: "APM UFF 30 mm",
    order: 22,
    specifications: { focalLengthMm: 30, apparentFieldDegrees: 70 },
    planner: {
      makerPages: [
        {
          url: "https://www.apm-telescopes.net/en/apm-ultra-flat-field-30mm-eyepiece-70-fov",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "apm-xwa-3-5",
    type: "eyepiece",
    name: "APM XWA 3,5 mm",
    order: 23,
    specifications: { focalLengthMm: 3.5, apparentFieldDegrees: 110 },
    planner: {
      makerPages: [
        {
          url: "https://www.apm-telescopes.net/en/apm-xwa-35-mm-110-eyepiece",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "apm-xwa-5",
    type: "eyepiece",
    name: "APM XWA 5 mm",
    order: 24,
    specifications: { focalLengthMm: 5, apparentFieldDegrees: 110 },
    planner: {
      makerPages: [
        {
          url: "https://www.apm-telescopes.net/en/apm-xwa-5-mm-110-x-treme-wideangle-eyepiece",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "apm-xwa-7",
    type: "eyepiece",
    name: "APM XWA 7 mm",
    order: 25,
    specifications: { focalLengthMm: 7, apparentFieldDegrees: 100 },
    planner: {
      makerPages: [
        {
          url: "https://www.apm-telescopes.net/en/apm-xwa-7-mm-100-x-treme-wideangle-eyepiece",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "apm-xwa-9",
    type: "eyepiece",
    name: "APM XWA 9 mm",
    order: 26,
    specifications: { focalLengthMm: 9, apparentFieldDegrees: 100 },
    planner: {
      makerPages: [
        {
          url: "https://www.apm-telescopes.net/en/apm-xwa-9-mm-100-eyepiece",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "baader-classic-ortho-6",
    type: "eyepiece",
    name: "Baader Classic Ortho 6 mm",
    order: 27,
    specifications: { focalLengthMm: 6, apparentFieldDegrees: 52 },
    planner: {
      makerPages: [
        {
          url: "https://www.baader-planetarium.com/en/classic-ortho-6mm-1-25inch-eyepiece-ht-mc.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "baader-classic-ortho-10",
    type: "eyepiece",
    name: "Baader Classic Ortho 10 mm",
    order: 28,
    specifications: { focalLengthMm: 10, apparentFieldDegrees: 52 },
    planner: {
      makerPages: [
        {
          url: "https://www.baader-planetarium.com/en/classic-ortho-10mm-1-25inch-eyepiece-ht-mc.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "baader-classic-ortho-18",
    type: "eyepiece",
    name: "Baader Classic Ortho 18 mm",
    order: 29,
    specifications: { focalLengthMm: 18, apparentFieldDegrees: 52 },
    planner: {
      makerPages: [
        {
          url: "https://www.baader-planetarium.com/en/classic-ortho-18mm-1-25inch-eyepiece-ht-mc.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "baader-hyperion-5",
    type: "eyepiece",
    name: "Baader Hyperion 5 mm",
    order: 30,
    specifications: { focalLengthMm: 5, apparentFieldDegrees: 68 },
    planner: {
      makerPages: [
        {
          url: "https://www.baader-planetarium.com/en/accessories/optical-accessories/eyepieces/hyperion.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "baader-hyperion-8",
    type: "eyepiece",
    name: "Baader Hyperion 8 mm",
    order: 31,
    specifications: { focalLengthMm: 8, apparentFieldDegrees: 68 },
    planner: {
      makerPages: [
        {
          url: "https://www.baader-planetarium.com/en/accessories/optical-accessories/eyepieces/hyperion.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "baader-hyperion-10",
    type: "eyepiece",
    name: "Baader Hyperion 10 mm",
    order: 32,
    specifications: { focalLengthMm: 10, apparentFieldDegrees: 68 },
    planner: {
      makerPages: [
        {
          url: "https://www.baader-planetarium.com/en/accessories/optical-accessories/eyepieces/hyperion.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "baader-hyperion-13",
    type: "eyepiece",
    name: "Baader Hyperion 13 mm",
    order: 33,
    specifications: { focalLengthMm: 13, apparentFieldDegrees: 68 },
    planner: {
      makerPages: [
        {
          url: "https://www.baader-planetarium.com/en/accessories/optical-accessories/eyepieces/hyperion.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "baader-hyperion-17",
    type: "eyepiece",
    name: "Baader Hyperion 17 mm",
    order: 34,
    specifications: { focalLengthMm: 17, apparentFieldDegrees: 68 },
    planner: {
      makerPages: [
        {
          url: "https://www.baader-planetarium.com/en/accessories/optical-accessories/eyepieces/hyperion.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "baader-hyperion-21",
    type: "eyepiece",
    name: "Baader Hyperion 21 mm",
    order: 35,
    specifications: { focalLengthMm: 21, apparentFieldDegrees: 68 },
    planner: {
      makerPages: [
        {
          url: "https://www.baader-planetarium.com/en/baader-21mm-hyperion-68degrees-modular-eyepiece.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "baader-hyperion-24",
    type: "eyepiece",
    name: "Baader Hyperion 24 mm",
    order: 36,
    specifications: { focalLengthMm: 24, apparentFieldDegrees: 68 },
    planner: {
      makerPages: [
        {
          url: "https://www.baader-planetarium.com/en/accessories/optical-accessories/eyepieces/hyperion.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "baader-hyperion-aspheric-31",
    type: "eyepiece",
    name: "Baader Hyperion Aspheric 31 mm",
    order: 37,
    specifications: { focalLengthMm: 31, apparentFieldDegrees: 72 },
    planner: {
      makerPages: [
        {
          url: "https://www.baader-planetarium.com/en/baader-31mm-hyperion-aspheric-2inch-eyepiece.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "baader-morpheus-4-5",
    type: "eyepiece",
    name: "Baader Morpheus 4,5 mm",
    order: 38,
    specifications: { focalLengthMm: 4.5, apparentFieldDegrees: 76 },
    planner: {
      makerPages: [
        {
          url: "https://www.baader-planetarium.com/en/accessories/optical-accessories/eyepieces/morpheus.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "baader-morpheus-6-5",
    type: "eyepiece",
    name: "Baader Morpheus 6,5 mm",
    order: 39,
    specifications: { focalLengthMm: 6.5, apparentFieldDegrees: 76 },
    planner: {
      makerPages: [
        {
          url: "https://www.baader-planetarium.com/en/accessories/optical-accessories/eyepieces/morpheus.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "baader-morpheus-9",
    type: "eyepiece",
    name: "Baader Morpheus 9 mm",
    order: 40,
    specifications: { focalLengthMm: 9, apparentFieldDegrees: 76 },
    planner: {
      makerPages: [
        {
          url: "https://www.baader-planetarium.com/en/accessories/optical-accessories/eyepieces/morpheus.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "baader-morpheus-12-5",
    type: "eyepiece",
    name: "Baader Morpheus 12,5 mm",
    order: 41,
    specifications: { focalLengthMm: 12.5, apparentFieldDegrees: 76 },
    planner: {
      makerPages: [
        {
          url: "https://www.baader-planetarium.com/en/accessories/optical-accessories/eyepieces/morpheus.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "baader-morpheus-14",
    type: "eyepiece",
    name: "Baader Morpheus 14 mm",
    order: 42,
    specifications: { focalLengthMm: 14, apparentFieldDegrees: 76 },
    planner: {
      makerPages: [
        {
          url: "https://www.baader-planetarium.com/en/accessories/optical-accessories/eyepieces/morpheus.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "baader-morpheus-17-5",
    type: "eyepiece",
    name: "Baader Morpheus 17,5 mm",
    order: 43,
    specifications: { focalLengthMm: 17.5, apparentFieldDegrees: 76 },
    planner: {
      makerPages: [
        {
          url: "https://www.baader-planetarium.com/en/accessories/optical-accessories/eyepieces/morpheus.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-luminos-7",
    type: "eyepiece",
    name: "Celestron Luminos 7 mm",
    order: 44,
    specifications: { focalLengthMm: 7, apparentFieldDegrees: 82 },
    planner: {
      makerPages: [
        {
          url: "https://www.celestron.com/products/luminos-7mm-eyepiece-125in",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-luminos-10",
    type: "eyepiece",
    name: "Celestron Luminos 10 mm",
    order: 45,
    specifications: { focalLengthMm: 10, apparentFieldDegrees: 82 },
    planner: {
      makerPages: [
        {
          url: "https://www.celestron.com/products/luminos-10mm-eyepiece-125in",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-luminos-15",
    type: "eyepiece",
    name: "Celestron Luminos 15 mm",
    order: 46,
    specifications: { focalLengthMm: 15, apparentFieldDegrees: 82 },
    planner: {
      makerPages: [
        {
          url: "https://www.celestron.com/products/luminos-15mm-eyepiece-125in",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-luminos-19",
    type: "eyepiece",
    name: "Celestron Luminos 19 mm",
    order: 47,
    specifications: { focalLengthMm: 19, apparentFieldDegrees: 82 },
    planner: {
      makerPages: [
        {
          url: "https://www.celestron.com/products/luminos-19mm-eyepiece-2in",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-luminos-23",
    type: "eyepiece",
    name: "Celestron Luminos 23 mm",
    order: 48,
    specifications: { focalLengthMm: 23, apparentFieldDegrees: 82 },
    planner: {
      makerPages: [
        {
          url: "https://www.celestron.com/products/luminos-23mm-eyepiece-2in",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-luminos-31",
    type: "eyepiece",
    name: "Celestron Luminos 31 mm",
    order: 49,
    specifications: { focalLengthMm: 31, apparentFieldDegrees: 82 },
    planner: {
      makerPages: [
        {
          url: "https://www.celestron.com/products/luminos-31mm-eyepiece-2in",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-x-cel-lx-2-3",
    type: "eyepiece",
    name: "Celestron X-Cel LX 2,3 mm",
    order: 50,
    specifications: { focalLengthMm: 2.3, apparentFieldDegrees: 60 },
    planner: {
      makerPages: [
        {
          url: "https://www.celestron.com/products/x-cel-lx-2-3mm-eyepiece-125in",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-x-cel-lx-5",
    type: "eyepiece",
    name: "Celestron X-Cel LX 5 mm",
    order: 51,
    specifications: { focalLengthMm: 5, apparentFieldDegrees: 60 },
    planner: {
      makerPages: [
        {
          url: "https://www.celestron.com/products/x-cel-lx-5mm-eyepiece-125in",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-x-cel-lx-7",
    type: "eyepiece",
    name: "Celestron X-Cel LX 7 mm",
    order: 52,
    specifications: { focalLengthMm: 7, apparentFieldDegrees: 60 },
    planner: {
      makerPages: [
        {
          url: "https://www.celestron.com/products/x-cel-lx-7mm-eyepiece-125in",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-x-cel-lx-9",
    type: "eyepiece",
    name: "Celestron X-Cel LX 9 mm",
    order: 53,
    specifications: { focalLengthMm: 9, apparentFieldDegrees: 60 },
    planner: {
      makerPages: [
        {
          url: "https://www.celestron.com/products/x-cel-lx-9mm-eyepiece-125in",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-x-cel-lx-12",
    type: "eyepiece",
    name: "Celestron X-Cel LX 12 mm",
    order: 54,
    specifications: { focalLengthMm: 12, apparentFieldDegrees: 60 },
    planner: {
      makerPages: [
        {
          url: "https://www.celestron.com/products/x-cel-lx-12mm-eyepiece-125in",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-x-cel-lx-18",
    type: "eyepiece",
    name: "Celestron X-Cel LX 18 mm",
    order: 55,
    specifications: { focalLengthMm: 18, apparentFieldDegrees: 60 },
    planner: {
      makerPages: [
        {
          url: "https://www.celestron.com/products/x-cel-lx-18mm-eyepiece-125in",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-x-cel-lx-25",
    type: "eyepiece",
    name: "Celestron X-Cel LX 25 mm",
    order: 56,
    specifications: { focalLengthMm: 25, apparentFieldDegrees: 60 },
    planner: {
      makerPages: [
        {
          url: "https://www.celestron.com/products/x-cel-lx-25mm-eyepiece-125in",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "explore-scientific-100-5-5",
    type: "eyepiece",
    name: "Explore Scientific 100° Series 5,5 mm",
    order: 57,
    specifications: { focalLengthMm: 5.5, apparentFieldDegrees: 100 },
    planner: {
      calculated: ["apparentFieldDegrees"],
      calculation:
        "Estimation : First Light Optics 100 deg Series page states 100 deg for the series, 5,5 mm listed (maker's own page was rate-limited).",
      makerPages: [
        {
          url: "https://firstlightoptics.com/explore-scientific-eyepieces/explore-scientific-100-degree-series-2-inch-eyepieces.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "explore-scientific-100-9",
    type: "eyepiece",
    name: "Explore Scientific 100° Series 9 mm",
    order: 58,
    specifications: { focalLengthMm: 9, apparentFieldDegrees: 100 },
    planner: {
      calculated: ["apparentFieldDegrees"],
      calculation:
        "Estimation : First Light Optics 100 deg Series page states 100 deg for the series, 9 mm listed (maker's own page was rate-limited).",
      makerPages: [
        {
          url: "https://firstlightoptics.com/explore-scientific-eyepieces/explore-scientific-100-degree-series-2-inch-eyepieces.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "explore-scientific-100-14",
    type: "eyepiece",
    name: "Explore Scientific 100° Series 14 mm",
    order: 59,
    specifications: { focalLengthMm: 14, apparentFieldDegrees: 100 },
    planner: {
      calculated: ["apparentFieldDegrees"],
      calculation:
        "Estimation : First Light Optics 100 deg Series page states 100 deg for the series, 14 mm listed (maker's own page was rate-limited).",
      makerPages: [
        {
          url: "https://firstlightoptics.com/explore-scientific-eyepieces/explore-scientific-100-degree-series-2-inch-eyepieces.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "explore-scientific-100-20",
    type: "eyepiece",
    name: "Explore Scientific 100° Series 20 mm",
    order: 60,
    specifications: { focalLengthMm: 20, apparentFieldDegrees: 100 },
    planner: {
      calculated: ["apparentFieldDegrees"],
      calculation:
        "Estimation : First Light Optics 100 deg Series page states 100 deg for the series, 20 mm listed (maker's own page was rate-limited).",
      makerPages: [
        {
          url: "https://firstlightoptics.com/explore-scientific-eyepieces/explore-scientific-100-degree-series-2-inch-eyepieces.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "explore-scientific-100-25",
    type: "eyepiece",
    name: "Explore Scientific 100° Series 25 mm",
    order: 61,
    specifications: { focalLengthMm: 25, apparentFieldDegrees: 100 },
    planner: {
      calculated: ["apparentFieldDegrees"],
      calculation:
        "Estimation : First Light Optics 100 deg Series page states 100 deg for the series, 25 mm listed (maker's own page was rate-limited).",
      makerPages: [
        {
          url: "https://firstlightoptics.com/explore-scientific-eyepieces/explore-scientific-100-degree-series-2-inch-eyepieces.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "explore-scientific-100-30",
    type: "eyepiece",
    name: "Explore Scientific 100° Series 30 mm",
    order: 62,
    specifications: { focalLengthMm: 30, apparentFieldDegrees: 100 },
    planner: {
      calculated: ["apparentFieldDegrees"],
      calculation:
        "Estimation : First Light Optics 100 deg Series page states 100 deg for the series, 30 mm listed (maker's own page was rate-limited).",
      makerPages: [
        {
          url: "https://firstlightoptics.com/explore-scientific-eyepieces/explore-scientific-100-degree-series-2-inch-eyepieces.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "explore-scientific-68-20",
    type: "eyepiece",
    name: "Explore Scientific 68° Series 20 mm",
    order: 63,
    specifications: { focalLengthMm: 20, apparentFieldDegrees: 68 },
    planner: {
      makerPages: [
        {
          url: "https://explorescientific.com/products/68-20mm",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "explore-scientific-68-24",
    type: "eyepiece",
    name: "Explore Scientific 68° Series 24 mm",
    order: 64,
    specifications: { focalLengthMm: 24, apparentFieldDegrees: 68 },
    planner: {
      calculated: ["apparentFieldDegrees"],
      calculation:
        "Estimation : OPT product page for the 24 mm 68 deg Series states AFOV 68 degrees (maker's own page was rate-limited).",
      makerPages: [
        {
          url: "https://optcorp.com/products/es-epwp6824-01-24mm-68-series-waterproof-eyepiece-1-25inch",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "explore-scientific-68-34",
    type: "eyepiece",
    name: "Explore Scientific 68° Series 34 mm",
    order: 65,
    specifications: { focalLengthMm: 34, apparentFieldDegrees: 68 },
    planner: {
      calculated: ["apparentFieldDegrees"],
      calculation:
        "Estimation : OPT product page for the 34 mm 68 deg Series states AFOV 68 degrees (maker's own page was rate-limited).",
      makerPages: [
        {
          url: "https://optcorp.com/products/es-epwp6834-01-34mm-68-series-waterproof-eyepiece-2inch",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "explore-scientific-68-40",
    type: "eyepiece",
    name: "Explore Scientific 68° Series 40 mm",
    order: 66,
    specifications: { focalLengthMm: 40, apparentFieldDegrees: 68 },
    planner: {
      calculated: ["apparentFieldDegrees"],
      calculation:
        "Estimation : First Light Optics 68 deg Series page states 68 deg for the series, 40 mm listed (maker's own page was rate-limited).",
      makerPages: [
        {
          url: "https://firstlightoptics.com/explore-scientific-eyepieces/explore-scientific-68-degree-series-eyepieces.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "explore-scientific-82-4-7",
    type: "eyepiece",
    name: "Explore Scientific 82° Series 4,7 mm",
    order: 67,
    specifications: { focalLengthMm: 4.7, apparentFieldDegrees: 82 },
    planner: {
      calculated: ["apparentFieldDegrees"],
      calculation:
        "Estimation : First Light Optics 82 deg Series page states 82 deg for the series, 4,7 mm listed (maker's own page was rate-limited).",
      makerPages: [
        {
          url: "https://firstlightoptics.com/explore-scientific-eyepieces/explore-scientific-82-degree-series-eyepieces.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "explore-scientific-82-6-7",
    type: "eyepiece",
    name: "Explore Scientific 82° Series 6,7 mm",
    order: 68,
    specifications: { focalLengthMm: 6.7, apparentFieldDegrees: 82 },
    planner: {
      calculated: ["apparentFieldDegrees"],
      calculation:
        "Estimation : First Light Optics 82 deg Series page states 82 deg for the series, 6,7 mm listed (maker's own page was rate-limited).",
      makerPages: [
        {
          url: "https://firstlightoptics.com/explore-scientific-eyepieces/explore-scientific-82-degree-series-eyepieces.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "explore-scientific-82-8-8",
    type: "eyepiece",
    name: "Explore Scientific 82° Series 8,8 mm",
    order: 69,
    specifications: { focalLengthMm: 8.8, apparentFieldDegrees: 82 },
    planner: {
      calculated: ["apparentFieldDegrees"],
      calculation:
        "Estimation : First Light Optics 82 deg Series page states 82 deg for the series, 8,8 mm listed (maker's own page was rate-limited).",
      makerPages: [
        {
          url: "https://firstlightoptics.com/explore-scientific-eyepieces/explore-scientific-82-degree-series-eyepieces.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "explore-scientific-82-11",
    type: "eyepiece",
    name: "Explore Scientific 82° Series 11 mm",
    order: 70,
    specifications: { focalLengthMm: 11, apparentFieldDegrees: 82 },
    planner: {
      calculated: ["apparentFieldDegrees"],
      calculation:
        "Estimation : First Light Optics 82 deg Series page states 82 deg for the series, 11 mm listed (maker's own page was rate-limited).",
      makerPages: [
        {
          url: "https://firstlightoptics.com/explore-scientific-eyepieces/explore-scientific-82-degree-series-eyepieces.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "explore-scientific-82-14",
    type: "eyepiece",
    name: "Explore Scientific 82° Series 14 mm",
    order: 71,
    specifications: { focalLengthMm: 14, apparentFieldDegrees: 82 },
    planner: {
      calculated: ["apparentFieldDegrees"],
      calculation:
        "Estimation : First Light Optics 82 deg Series page states 82 deg for the series, 14 mm listed (maker's own page was rate-limited).",
      makerPages: [
        {
          url: "https://firstlightoptics.com/explore-scientific-eyepieces/explore-scientific-82-degree-series-eyepieces.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "explore-scientific-82-18",
    type: "eyepiece",
    name: "Explore Scientific 82° Series 18 mm",
    order: 72,
    specifications: { focalLengthMm: 18, apparentFieldDegrees: 82 },
    planner: {
      calculated: ["apparentFieldDegrees"],
      calculation:
        "Estimation : First Light Optics 82 deg Series page states 82 deg for the series, 18 mm listed (maker's own page was rate-limited).",
      makerPages: [
        {
          url: "https://firstlightoptics.com/explore-scientific-eyepieces/explore-scientific-82-degree-series-eyepieces.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "explore-scientific-82-24",
    type: "eyepiece",
    name: "Explore Scientific 82° Series 24 mm",
    order: 73,
    specifications: { focalLengthMm: 24, apparentFieldDegrees: 82 },
    planner: {
      calculated: ["apparentFieldDegrees"],
      calculation:
        "Estimation : First Light Optics 82 deg Series page states 82 deg for the series, 24 mm listed (maker's own page was rate-limited).",
      makerPages: [
        {
          url: "https://firstlightoptics.com/explore-scientific-eyepieces/explore-scientific-82-degree-series-eyepieces.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "explore-scientific-82-30",
    type: "eyepiece",
    name: "Explore Scientific 82° Series 30 mm",
    order: 74,
    specifications: { focalLengthMm: 30, apparentFieldDegrees: 82 },
    planner: {
      calculated: ["apparentFieldDegrees"],
      calculation:
        "Estimation : First Light Optics 82 deg Series page states 82 deg for the series, 30 mm listed (maker's own page was rate-limited).",
      makerPages: [
        {
          url: "https://firstlightoptics.com/explore-scientific-eyepieces/explore-scientific-82-degree-series-eyepieces.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "pentax-xw-3-5",
    type: "eyepiece",
    name: "Pentax XW 3,5 mm",
    order: 75,
    specifications: { focalLengthMm: 3.5, apparentFieldDegrees: 70 },
    planner: {
      makerPages: [
        {
          url: "https://www.ricoh-imaging.co.jp/english/products/binoculars/scope/xw/index.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "pentax-xw-5",
    type: "eyepiece",
    name: "Pentax XW 5 mm",
    order: 76,
    specifications: { focalLengthMm: 5, apparentFieldDegrees: 70 },
    planner: {
      makerPages: [
        {
          url: "https://www.ricoh-imaging.co.jp/english/products/binoculars/scope/xw/index.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "pentax-xw-7",
    type: "eyepiece",
    name: "Pentax XW 7 mm",
    order: 77,
    specifications: { focalLengthMm: 7, apparentFieldDegrees: 70 },
    planner: {
      makerPages: [
        {
          url: "https://www.ricoh-imaging.co.jp/english/products/binoculars/scope/xw/index.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "pentax-xw-10",
    type: "eyepiece",
    name: "Pentax XW 10 mm",
    order: 78,
    specifications: { focalLengthMm: 10, apparentFieldDegrees: 70 },
    planner: {
      makerPages: [
        {
          url: "https://www.ricoh-imaging.co.jp/english/products/binoculars/scope/xw/index.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "pentax-xw-14",
    type: "eyepiece",
    name: "Pentax XW 14 mm",
    order: 79,
    specifications: { focalLengthMm: 14, apparentFieldDegrees: 70 },
    planner: {
      makerPages: [
        {
          url: "https://www.ricoh-imaging.co.jp/english/products/binoculars/scope/xw/index.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "pentax-xw-20",
    type: "eyepiece",
    name: "Pentax XW 20 mm",
    order: 80,
    specifications: { focalLengthMm: 20, apparentFieldDegrees: 70 },
    planner: {
      makerPages: [
        {
          url: "https://www.ricoh-imaging.co.jp/english/products/binoculars/scope/xw/index.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "pentax-xw-30",
    type: "eyepiece",
    name: "Pentax XW 30 mm",
    order: 81,
    specifications: { focalLengthMm: 30, apparentFieldDegrees: 70 },
    planner: {
      makerPages: [
        {
          url: "https://www.ricoh-imaging.co.jp/english/products/binoculars/scope/xw/index.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "pentax-xw-40",
    type: "eyepiece",
    name: "Pentax XW 40 mm",
    order: 82,
    specifications: { focalLengthMm: 40, apparentFieldDegrees: 70 },
    planner: {
      makerPages: [
        {
          url: "https://www.ricoh-imaging.co.jp/english/products/binoculars/scope/xw/index.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "sky-rover-pf-5-5",
    type: "eyepiece",
    name: "Sky Rover PF 5,5 mm",
    order: 83,
    specifications: { focalLengthMm: 5.5, apparentFieldDegrees: 65 },
    planner: {
      calculated: ["apparentFieldDegrees"],
      calculation:
        "Estimation : 65 deg, the apparent field retailers give for the PF series (revendeur: Astronomics lists the PF 25 mm and 15,5 mm at 65 deg), the maker's PF page gives the focal length, the eye relief and the field stop, not the apparent field.",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/sky-rover-55-10-5-15-5-19-25mm-eyepieces",
          readOn: "2026-10-30",
        },
        {
          url: "https://astronomics.com/products/sky-rover-25mm-65-premium-flat-field-eyepiece",
          readOn: "2026-10-30",
        },
        {
          url: "https://astronomics.com/products/sky-rover-15-5mm-65-premium-flat-field-eyepiece",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "sky-rover-pf-10-5",
    type: "eyepiece",
    name: "Sky Rover PF 10,5 mm",
    order: 84,
    specifications: { focalLengthMm: 10.5, apparentFieldDegrees: 65 },
    planner: {
      calculated: ["apparentFieldDegrees"],
      calculation:
        "Estimation : 65 deg, the apparent field retailers give for the PF series (revendeur: Astronomics lists the PF 25 mm and 15,5 mm at 65 deg, its 10,5 mm page says 60 deg), the maker's PF page gives the focal length, the eye relief and the field stop, not the apparent field.",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/sky-rover-55-10-5-15-5-19-25mm-eyepieces",
          readOn: "2026-10-30",
        },
        {
          url: "https://astronomics.com/products/sky-rover-25mm-65-premium-flat-field-eyepiece",
          readOn: "2026-10-30",
        },
        {
          url: "https://astronomics.com/products/sky-rover-15-5mm-65-premium-flat-field-eyepiece",
          readOn: "2026-10-30",
        },
        {
          url: "https://astronomics.com/products/sky-rover-10-5mm-60-premium-flat-field-eyepiece",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "sky-rover-pf-25",
    type: "eyepiece",
    name: "Sky Rover PF 25 mm",
    order: 85,
    specifications: { focalLengthMm: 25, apparentFieldDegrees: 65 },
    planner: {
      calculated: ["apparentFieldDegrees"],
      calculation:
        "Estimation : 65 deg from a retailer (revendeur: Astronomics, PF 25 mm at 65 deg), the maker's PF page gives the focal length, the eye relief and the field stop, not the apparent field.",
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/sky-rover-55-10-5-15-5-19-25mm-eyepieces",
          readOn: "2026-10-30",
        },
        {
          url: "https://astronomics.com/products/sky-rover-25mm-65-premium-flat-field-eyepiece",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "sky-rover-uwa-7",
    type: "eyepiece",
    name: "Sky Rover UWA 7 mm",
    order: 86,
    specifications: { focalLengthMm: 7, apparentFieldDegrees: 82 },
    planner: {
      makerPages: [
        {
          url: "https://skyroveroptics.com/products/uwa7mm-eyepiece",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-wide-angle-6",
    type: "eyepiece",
    name: "Sky-Watcher Wide Angle 6 mm",
    order: 87,
    specifications: { focalLengthMm: 6, apparentFieldDegrees: 66 },
    planner: {
      makerPages: [
        {
          url: "https://www.skywatcher.com/product/w-6mm/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-wide-angle-9",
    type: "eyepiece",
    name: "Sky-Watcher Wide Angle 9 mm",
    order: 88,
    specifications: { focalLengthMm: 9, apparentFieldDegrees: 66 },
    planner: {
      makerPages: [
        {
          url: "https://www.skywatcher.com/product/w-6mm/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-wide-angle-15",
    type: "eyepiece",
    name: "Sky-Watcher Wide Angle 15 mm",
    order: 89,
    specifications: { focalLengthMm: 15, apparentFieldDegrees: 66 },
    planner: {
      makerPages: [
        {
          url: "https://www.skywatcher.com/product/w-6mm/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-wide-angle-20",
    type: "eyepiece",
    name: "Sky-Watcher Wide Angle 20 mm",
    order: 90,
    specifications: { focalLengthMm: 20, apparentFieldDegrees: 66 },
    planner: {
      makerPages: [
        {
          url: "https://www.skywatcher.com/product/w-6mm/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "svbony-sv154-swa-15",
    type: "eyepiece",
    name: "Svbony SV154 SWA 15 mm",
    order: 91,
    specifications: { focalLengthMm: 15, apparentFieldDegrees: 70 },
    planner: {
      makerPages: [
        {
          url: "https://www.svbony.com/sv154-swa-15mm-eyepiece/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "svbony-sv190-uf-10",
    type: "eyepiece",
    name: "Svbony SV190 Ultra Flat Field 10 mm",
    order: 92,
    specifications: { focalLengthMm: 10, apparentFieldDegrees: 60 },
    planner: {
      makerPages: [
        {
          url: "https://www.svbony.com/products/sv190-ultra-flat-field-eyepiece-uf10",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-delos-3-5",
    type: "eyepiece",
    name: "Tele Vue Delos 3,5 mm",
    order: 93,
    specifications: { focalLengthMm: 3.5, apparentFieldDegrees: 72 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-delos-4-5",
    type: "eyepiece",
    name: "Tele Vue Delos 4,5 mm",
    order: 94,
    specifications: { focalLengthMm: 4.5, apparentFieldDegrees: 72 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-delos-6",
    type: "eyepiece",
    name: "Tele Vue Delos 6 mm",
    order: 95,
    specifications: { focalLengthMm: 6, apparentFieldDegrees: 72 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-delos-8",
    type: "eyepiece",
    name: "Tele Vue Delos 8 mm",
    order: 96,
    specifications: { focalLengthMm: 8, apparentFieldDegrees: 72 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-delos-10",
    type: "eyepiece",
    name: "Tele Vue Delos 10 mm",
    order: 97,
    specifications: { focalLengthMm: 10, apparentFieldDegrees: 72 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-delos-12",
    type: "eyepiece",
    name: "Tele Vue Delos 12 mm",
    order: 98,
    specifications: { focalLengthMm: 12, apparentFieldDegrees: 72 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-delos-14",
    type: "eyepiece",
    name: "Tele Vue Delos 14 mm",
    order: 99,
    specifications: { focalLengthMm: 14, apparentFieldDegrees: 72 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-delos-17-3",
    type: "eyepiece",
    name: "Tele Vue Delos 17,3 mm",
    order: 100,
    specifications: { focalLengthMm: 17.3, apparentFieldDegrees: 72 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-delos-24",
    type: "eyepiece",
    name: "Tele Vue Delos 24 mm",
    order: 101,
    specifications: { focalLengthMm: 24, apparentFieldDegrees: 72 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-ethos-6",
    type: "eyepiece",
    name: "Tele Vue Ethos 6 mm",
    order: 102,
    specifications: { focalLengthMm: 6, apparentFieldDegrees: 100 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-ethos-8",
    type: "eyepiece",
    name: "Tele Vue Ethos 8 mm",
    order: 103,
    specifications: { focalLengthMm: 8, apparentFieldDegrees: 100 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-ethos-10",
    type: "eyepiece",
    name: "Tele Vue Ethos 10 mm",
    order: 104,
    specifications: { focalLengthMm: 10, apparentFieldDegrees: 100 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-ethos-13",
    type: "eyepiece",
    name: "Tele Vue Ethos 13 mm",
    order: 105,
    specifications: { focalLengthMm: 13, apparentFieldDegrees: 100 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-ethos-17",
    type: "eyepiece",
    name: "Tele Vue Ethos 17 mm",
    order: 106,
    specifications: { focalLengthMm: 17, apparentFieldDegrees: 100 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-ethos-21",
    type: "eyepiece",
    name: "Tele Vue Ethos 21 mm",
    order: 107,
    specifications: { focalLengthMm: 21, apparentFieldDegrees: 100 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-nagler-type-5-16",
    type: "eyepiece",
    name: "Tele Vue Nagler Type 5 16 mm",
    order: 108,
    specifications: { focalLengthMm: 16, apparentFieldDegrees: 82 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-nagler-type-5-20",
    type: "eyepiece",
    name: "Tele Vue Nagler Type 5 20 mm",
    order: 109,
    specifications: { focalLengthMm: 20, apparentFieldDegrees: 82 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-nagler-type-5-26",
    type: "eyepiece",
    name: "Tele Vue Nagler Type 5 26 mm",
    order: 110,
    specifications: { focalLengthMm: 26, apparentFieldDegrees: 82 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-nagler-type-5-31",
    type: "eyepiece",
    name: "Tele Vue Nagler Type 5 31 mm",
    order: 111,
    specifications: { focalLengthMm: 31, apparentFieldDegrees: 82 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-nagler-type-6-3-5",
    type: "eyepiece",
    name: "Tele Vue Nagler Type 6 3,5 mm",
    order: 112,
    specifications: { focalLengthMm: 3.5, apparentFieldDegrees: 82 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-nagler-type-6-5",
    type: "eyepiece",
    name: "Tele Vue Nagler Type 6 5 mm",
    order: 113,
    specifications: { focalLengthMm: 5, apparentFieldDegrees: 82 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-nagler-type-6-7",
    type: "eyepiece",
    name: "Tele Vue Nagler Type 6 7 mm",
    order: 114,
    specifications: { focalLengthMm: 7, apparentFieldDegrees: 82 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-nagler-type-6-9",
    type: "eyepiece",
    name: "Tele Vue Nagler Type 6 9 mm",
    order: 115,
    specifications: { focalLengthMm: 9, apparentFieldDegrees: 82 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-nagler-type-6-11",
    type: "eyepiece",
    name: "Tele Vue Nagler Type 6 11 mm",
    order: 116,
    specifications: { focalLengthMm: 11, apparentFieldDegrees: 82 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-panoptic-15",
    type: "eyepiece",
    name: "Tele Vue Panoptic 15 mm",
    order: 117,
    specifications: { focalLengthMm: 15, apparentFieldDegrees: 68 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-panoptic-19",
    type: "eyepiece",
    name: "Tele Vue Panoptic 19 mm",
    order: 118,
    specifications: { focalLengthMm: 19, apparentFieldDegrees: 68 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-panoptic-22",
    type: "eyepiece",
    name: "Tele Vue Panoptic 22 mm",
    order: 119,
    specifications: { focalLengthMm: 22, apparentFieldDegrees: 68 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-panoptic-24",
    type: "eyepiece",
    name: "Tele Vue Panoptic 24 mm",
    order: 120,
    specifications: { focalLengthMm: 24, apparentFieldDegrees: 68 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-panoptic-27",
    type: "eyepiece",
    name: "Tele Vue Panoptic 27 mm",
    order: 121,
    specifications: { focalLengthMm: 27, apparentFieldDegrees: 68 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-panoptic-35",
    type: "eyepiece",
    name: "Tele Vue Panoptic 35 mm",
    order: 122,
    specifications: { focalLengthMm: 35, apparentFieldDegrees: 68 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "tele-vue-panoptic-41",
    type: "eyepiece",
    name: "Tele Vue Panoptic 41 mm",
    order: 123,
    specifications: { focalLengthMm: 41, apparentFieldDegrees: 68 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=214",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "vixen-lvw-3-5",
    type: "eyepiece",
    name: "Vixen LVW 3,5 mm",
    order: 124,
    specifications: { focalLengthMm: 3.5, apparentFieldDegrees: 65 },
    planner: {
      makerPages: [
        {
          url: "https://www.vixen.co.jp/product/3856_07/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "vixen-lvw-5",
    type: "eyepiece",
    name: "Vixen LVW 5 mm",
    order: 125,
    specifications: { focalLengthMm: 5, apparentFieldDegrees: 65 },
    planner: {
      makerPages: [
        {
          url: "https://www.vixen.co.jp/product/3857_0/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "vixen-lvw-42",
    type: "eyepiece",
    name: "Vixen LVW 42 mm",
    order: 126,
    specifications: { focalLengthMm: 42, apparentFieldDegrees: 65 },
    planner: {
      makerPages: [
        {
          url: "https://www.vixen.co.jp/product/3727_06/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "vixen-slv-4",
    type: "eyepiece",
    name: "Vixen SLV 4 mm",
    order: 127,
    specifications: { focalLengthMm: 4, apparentFieldDegrees: 50 },
    planner: {
      makerPages: [
        {
          url: "https://www.vixen.co.jp/product/37203_4/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "vixen-slv-6",
    type: "eyepiece",
    name: "Vixen SLV 6 mm",
    order: 128,
    specifications: { focalLengthMm: 6, apparentFieldDegrees: 50 },
    planner: {
      makerPages: [
        {
          url: "https://www.vixen.co.jp/product/37205_8/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "vixen-slv-9",
    type: "eyepiece",
    name: "Vixen SLV 9 mm",
    order: 129,
    specifications: { focalLengthMm: 9, apparentFieldDegrees: 50 },
    planner: {
      makerPages: [
        {
          url: "https://www.vixen.co.jp/product/37206_5/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "vixen-slv-15",
    type: "eyepiece",
    name: "Vixen SLV 15 mm",
    order: 130,
    specifications: { focalLengthMm: 15, apparentFieldDegrees: 50 },
    planner: {
      makerPages: [
        {
          url: "https://www.vixen.co.jp/product/37211_9/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "vixen-slv-25",
    type: "eyepiece",
    name: "Vixen SLV 25 mm",
    order: 131,
    specifications: { focalLengthMm: 25, apparentFieldDegrees: 50 },
    planner: {
      makerPages: [
        {
          url: "https://www.vixen.co.jp/product/37213_3/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "vixen-ssw-5",
    type: "eyepiece",
    name: "Vixen SSW 5 mm",
    order: 132,
    specifications: { focalLengthMm: 5, apparentFieldDegrees: 83 },
    planner: {
      makerPages: [
        {
          url: "https://www.vixen.co.jp/product/37122_8/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "william-optics-swan-33",
    type: "eyepiece",
    name: "William Optics SWAN 33 mm",
    order: 133,
    specifications: { focalLengthMm: 33, apparentFieldDegrees: 72 },
    planner: {
      makerPages: [
        {
          url: "https://williamoptics.com/products/used-swan-33mm-2-eyepiece",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "william-optics-swan-40",
    type: "eyepiece",
    name: "William Optics SWAN 40 mm",
    order: 134,
    specifications: { focalLengthMm: 40, apparentFieldDegrees: 72 },
    planner: {
      makerPages: [
        {
          url: "https://williamoptics.com/products/swan-40mm-2-eyepiece",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "televue-powermate-2x",
    type: "lens",
    name: "Tele Vue Powermate 2×",
    order: 2,
    specifications: { multiplier: 2 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=10",
          readOn: "2026-10-30",
        },
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=53&Tab=_app",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "televue-powermate-2-5x",
    type: "lens",
    name: "Tele Vue Powermate 2,5×",
    order: 3,
    specifications: { multiplier: 2.5 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=10",
          readOn: "2026-10-30",
        },
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=53&Tab=_app",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "televue-powermate-4x",
    type: "lens",
    name: "Tele Vue Powermate 4×",
    order: 4,
    specifications: { multiplier: 4 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=10",
          readOn: "2026-10-30",
        },
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=53&Tab=_app",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "televue-powermate-5x",
    type: "lens",
    name: "Tele Vue Powermate 5×",
    order: 5,
    specifications: { multiplier: 5 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=10",
          readOn: "2026-10-30",
        },
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=53&Tab=_app",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "televue-barlow-2x-125",
    type: "lens",
    name: 'Tele Vue Barlow 2× (1,25")',
    order: 6,
    specifications: { multiplier: 2 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=10",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "televue-barlow-3x-125",
    type: "lens",
    name: 'Tele Vue Barlow 3× (1,25")',
    order: 7,
    specifications: { multiplier: 3 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=10",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "televue-big-barlow-2x",
    type: "lens",
    name: 'Tele Vue Big Barlow 2× (2")',
    order: 8,
    specifications: { multiplier: 2 },
    planner: {
      makerPages: [
        {
          url: "https://www.televue.com/engine/TV3b_page.asp?id=10",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-xcel-lx-2x",
    type: "lens",
    name: "Celestron X-Cel LX Barlow 2×",
    order: 9,
    specifications: { multiplier: 2 },
    planner: {
      makerPages: [
        {
          url: "https://www.celestron.com/products/x-cel-lx-125in-2x-barlow-lens",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-xcel-lx-3x",
    type: "lens",
    name: "Celestron X-Cel LX Barlow 3×",
    order: 10,
    specifications: { multiplier: 3 },
    planner: {
      makerPages: [
        {
          url: "https://www.celestron.com/products/x-cel-lx-125in-3x-barlow-lens",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-omni-2x",
    type: "lens",
    name: "Celestron Omni Barlow 2×",
    order: 11,
    specifications: { multiplier: 2 },
    planner: {
      makerPages: [
        {
          url: "https://www.celestron.com/products/omni-2x-barlow-lens-125in",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-reducer-corrector-063",
    type: "lens",
    name: "Celestron Reducer-Corrector (0,63×)",
    order: 12,
    specifications: { multiplier: 0.63 },
    planner: {
      makerPages: [
        {
          url: "https://www.celestron.com/products/reducer-corrector",
          readOn: "2026-10-30",
        },
        {
          url: "https://www.celestron.com/blogs/knowledgebase/understanding-focal-reducers",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-reducer-edgehd-800-07",
    type: "lens",
    name: "Celestron Reducer Lens 0,7× (EdgeHD 800)",
    order: 13,
    specifications: { multiplier: 0.7 },
    planner: {
      makerPages: [
        {
          url: "https://www.celestron.com/products/reducer-lens-7x-edgehd-800",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "celestron-reducer-edgehd-1100-07",
    type: "lens",
    name: "Celestron Reducer Lens 0,7× (EdgeHD 1100)",
    order: 14,
    specifications: { multiplier: 0.7 },
    planner: {
      makerPages: [
        {
          url: "https://www.celestron.com/products/reducer-lens-7x-edgehd-1100",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "baader-q-barlow-2-25x",
    type: "lens",
    name: "Baader Q-Barlow 2,25×",
    order: 15,
    specifications: { multiplier: 2.25 },
    planner: {
      makerPages: [
        {
          url: "https://www.baader-planetarium.com/en/baader-q-barlow-1-3x-2-25x.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "baader-hyperion-zoom-barlow-2-25x",
    type: "lens",
    name: "Baader Hyperion Zoom Barlow 2,25×",
    order: 16,
    specifications: { multiplier: 2.25 },
    planner: {
      makerPages: [
        {
          url: "https://www.baader-planetarium.com/en/accessories/optical-accessories/barlow-lenses-coma-and-glaspathcorrectors/hyperion-zoom-2.25x-barlow-lens.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "explore-scientific-focal-extender-125-2x",
    type: "lens",
    name: 'Explore Scientific Focal Extender 2× (1,25")',
    order: 17,
    specifications: { multiplier: 2 },
    planner: {
      makerPages: [
        {
          url: "https://explorescientific.com/collections/focal-extenders",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "explore-scientific-focal-extender-125-3x",
    type: "lens",
    name: 'Explore Scientific Focal Extender 3× (1,25")',
    order: 18,
    specifications: { multiplier: 3 },
    planner: {
      makerPages: [
        {
          url: "https://explorescientific.com/collections/focal-extenders",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "svbony-sv137-barlow-2x",
    type: "lens",
    name: "Svbony SV137 Barlow 2×",
    order: 19,
    specifications: { multiplier: 2 },
    planner: {
      makerPages: [
        {
          url: "https://www.svbony.com/products/sv137-barlow",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "svbony-sv216-barlow-3x",
    type: "lens",
    name: "Svbony SV216 Barlow 3×",
    order: 20,
    specifications: { multiplier: 3 },
    planner: {
      makerPages: [
        {
          url: "https://www.svbony.com/products/sv216-3x-barlow-lens",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "svbony-barlow-5x",
    type: "lens",
    name: "Svbony Barlow 5×",
    order: 21,
    specifications: { multiplier: 5 },
    planner: {
      makerPages: [
        {
          url: "https://www.svbony.com/products/5x-barlow-lens",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "svbony-sv209-reducer-08x",
    type: "lens",
    name: "Svbony SV209 Reducer/Flattener 0,8×",
    order: 22,
    specifications: { multiplier: 0.8 },
    planner: {
      makerPages: [
        {
          url: "https://www.svbony.com/products/sv209-focal-reducer-for-sv550-122-apo",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "svbony-focal-reducer-05x",
    type: "lens",
    name: 'Svbony Focal Reducer 0,5× (1,25")',
    order: 23,
    specifications: { multiplier: 0.5 },
    planner: {
      makerPages: [
        {
          url: "https://www.svbony.com/products/focal-reducer-05x",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-d-barlow-2x",
    type: "lens",
    name: "Sky-Watcher Barlow 2× (D-Type)",
    order: 24,
    specifications: { multiplier: 2 },
    planner: {
      makerPages: [
        {
          url: "http://skywatcher.com/product/2x-d-barlow-lens/",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-reducer-085x-evostar-80",
    type: "lens",
    name: "Sky-Watcher Reducer/Corrector 0,85× (Evostar 80)",
    order: 25,
    specifications: { multiplier: 0.85 },
    planner: {
      makerPages: [
        {
          url: "https://www.skywatcherusa.com/collections/reducers-and-correctors",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-reducer-077x-esprit-120",
    type: "lens",
    name: "Sky-Watcher Reducer/Flattener 0,77× (Esprit 120)",
    order: 26,
    specifications: { multiplier: 0.77 },
    planner: {
      makerPages: [
        {
          url: "https://www.skywatcherusa.com/products/0-77x-reducer-flattener-for-esprit-120",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "skywatcher-reducer-077x-evostar-150dx",
    type: "lens",
    name: "Sky-Watcher Reducer/Flattener 0,77× (EvoStar 150DX)",
    order: 27,
    specifications: { multiplier: 0.77 },
    planner: {
      makerPages: [
        {
          url: "https://www.skywatcherusa.com/collections/reducers-and-correctors",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "william-optics-flat-6aiii-08x",
    type: "lens",
    name: "William Optics Flat 6AIII 0,8× Reducer",
    order: 28,
    specifications: { multiplier: 0.8 },
    planner: {
      makerPages: [
        {
          url: "https://williamoptics.com/products/flat6aiii",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "william-optics-flat-7a-08x",
    type: "lens",
    name: "William Optics Flat 7A 0,8× Reducer",
    order: 29,
    specifications: { multiplier: 0.8 },
    planner: {
      makerPages: [
        {
          url: "https://williamoptics.com/collections/flatteners",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "william-optics-ultra-flat-132-079x",
    type: "lens",
    name: "William Optics Ultra Flat 132 0,79× Reducer",
    order: 30,
    specifications: { multiplier: 0.79 },
    planner: {
      makerPages: [
        {
          url: "https://williamoptics.com/collections/flatteners",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "starizona-hyperion-focal-reducer-072x",
    type: "lens",
    name: "Starizona Hyperion Focal Reducer 0,72×",
    order: 31,
    specifications: { multiplier: 0.72 },
    planner: {
      makerPages: [
        {
          url: "https://starizona.com/products/hyperion-focal-reducer",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "ts-optics-tsb251",
    type: "lens",
    name: "TS-Optics TSB251 APO Barlow 2,5×",
    order: 32,
    specifications: { multiplier: 2.5 },
    planner: {
      makerPages: [
        {
          url: "https://www.teleskop-express.de/en/telescope-accessories-5/barlows-reducer-lenses-8",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "ts-optics-tsb31",
    type: "lens",
    name: "TS-Optics TSB31 ED Barlow 3×",
    order: 33,
    specifications: { multiplier: 3 },
    planner: {
      makerPages: [
        {
          url: "https://www.teleskop-express.de/en/telescope-accessories-5/barlows-reducer-lenses-8",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "ts-optics-tsb22",
    type: "lens",
    name: 'TS-Optics TSB22 ED Barlow 2× (2")',
    order: 34,
    specifications: { multiplier: 2 },
    planner: {
      makerPages: [
        {
          url: "https://www.teleskop-express.de/en/telescope-accessories-5/barlows-reducer-lenses-8",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "ts-optics-tsred051",
    type: "lens",
    name: 'TS-Optics TSRED051 Focal Reducer 0,5× (1,25")',
    order: 35,
    specifications: { multiplier: 0.5 },
    planner: {
      makerPages: [
        {
          url: "https://www.teleskop-express.de/en/telescope-accessories-5/barlows-reducer-lenses-8",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "ts-optics-reducer-corrector-06x",
    type: "lens",
    name: "TS-Optics Reducer and Corrector 0,6×",
    order: 36,
    specifications: { multiplier: 0.6 },
    planner: {
      makerPages: [
        {
          url: "https://www.teleskop-express.de/shop/index.php/language/en/cat/c138_Reducer-Konverter-Korrektoren.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "ts-optics-reducer-corrector-08x",
    type: "lens",
    name: "TS-Optics Reducer and Corrector 0,8×",
    order: 37,
    specifications: { multiplier: 0.8 },
    planner: {
      makerPages: [
        {
          url: "https://www.teleskop-express.de/shop/index.php/language/en/cat/c138_Reducer-Konverter-Korrektoren.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "askar-reducer-08x-103apo",
    type: "lens",
    name: "Askar 0,8× Reducer (103APO)",
    order: 38,
    specifications: { multiplier: 0.8 },
    planner: {
      calculated: ["multiplier"],
      calculation:
        "Estimation : factor 0.8x read on the Telescopes Canada listing (Askar's own site was unreachable).",
      makerPages: [
        {
          url: "https://telescopescanada.ca/products/askar-0-8x-full-frame-reducer-for-103apo",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "askar-reducer-08x-120apo",
    type: "lens",
    name: "Askar 0,8× Reducer (120APO)",
    order: 39,
    specifications: { multiplier: 0.8 },
    planner: {
      calculated: ["multiplier"],
      calculation:
        "Estimation : factor 0.8x read on the Telescopes Canada listing (Askar's own site was unreachable).",
      makerPages: [
        {
          url: "https://telescopescanada.ca/products/askar-0-8x-full-frame-reducer-for-120apo",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "orion-shorty-barlow-2x",
    type: "lens",
    name: 'Orion Shorty Barlow 2× (1,25")',
    order: 40,
    specifications: { multiplier: 2 },
    planner: {
      calculated: ["multiplier"],
      calculation:
        "Estimation : factor 2x read on the High Point Scientific listing (Orion's own page returned no content).",
      makerPages: [
        {
          url: "https://www.highpointscientific.com/orion-2x-shorty-barlow-lens-1-25",
          readOn: "2026-10-30",
        },
      ],
    },
  },
  {
    id: "askar-fra400c-reducer-07x",
    type: "lens",
    name: "Askar FRA400C Full-Frame Reducer 0,7×",
    order: 41,
    specifications: { multiplier: 0.7 },
    planner: {
      calculated: ["multiplier"],
      calculation:
        "Estimation : factor 0.7x read in the product name on the Teleskop-Express category page (Askar's own site was unreachable).",
      makerPages: [
        {
          url: "https://www.teleskop-express.de/shop/index.php/language/en/cat/c138_Reducer-Konverter-Korrektoren.html",
          readOn: "2026-10-30",
        },
      ],
    },
  },
]);

const literal = (value) =>
  value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;

/**
 * The statements of migration 107: one idempotent insert per row (SQLite and
 * PostgreSQL alike), so that an identifier already taken is never
 * overwritten. The migration runner cuts the text at every « ; »: no value of
 * a row holds one.
 */
export function telescopeCatalogue3SeedSql() {
  return TELESCOPE_CATALOGUE_3_SEED.map(
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
