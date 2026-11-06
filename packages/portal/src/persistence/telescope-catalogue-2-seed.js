/**
 * The second telescope catalogue of the « Matériel par défaut » (migration
 * 96 `telescope-catalogue-2`): the four smart telescopes the first catalogue
 * lacked (Vaonis Vespera, Vespera Pro, Atlas and Stellina), as `equipment`
 * rows of scope `default` held by the platform organisation, each with the
 * profile's own identifier and its `preference_order` continuing the last
 * value of the first catalogue. The rows are a frozen copy of
 * `packages/planner/src/common-equipment-profiles.json` as it was when the
 * migration was written: a migration is history, a later change of that file
 * does not rewrite it. `ON CONFLICT DO NOTHING`: a row the administration
 * already holds under the same identifier, edited, hidden or archived, is
 * never rewritten. The telescope carries its `maker` and the `driver` that
 * can send it a plan, the way the profiles file writes them.
 */

import { PLATFORM_ORGANIZATION_ID } from "./default-equipment-seed.js";

const SEEDED_AT = "2026-10-22T00:00:00.000Z";

/** `{ id, type, name, order, specifications, planner }`, as migration 55's. */
export const TELESCOPE_CATALOGUE_2_SEED = Object.freeze([
  {
    id: "vaonis-atlas",
    type: "telescope",
    name: "Atlas",
    order: 43,
    specifications: {
      apertureMm: 80,
      focalLengthMm: 360,
    },
    planner: {
      group: "connected",
      maker: "Vaonis",
      driver: "none",
      integratedCamera: {
        id: "atlas-imx585",
        name: "IMX585",
        sensor: "Sony IMX585",
        sensorKind: "colour",
        sensorWidthMm: 11.2,
        sensorHeightMm: 6.3,
        pixelSizeUm: 2.9,
        makerPages: [
          {
            url: "https://vaonis.com/pages/product/atlas",
            readOn: "2026-10-22",
          },
        ],
      },
      mount: {
        id: "integrated-altaz",
        name: "Azimutale intégrée",
      },
      makerPages: [
        {
          url: "https://vaonis.com/pages/product/atlas",
          readOn: "2026-10-22",
        },
      ],
    },
  },
  {
    id: "vaonis-stellina",
    type: "telescope",
    name: "Stellina",
    order: 44,
    specifications: {
      apertureMm: 80,
      focalLengthMm: 400,
    },
    planner: {
      group: "connected",
      maker: "Vaonis",
      driver: "none",
      integratedCamera: {
        id: "stellina-sensor",
        name: "6.4 Mpx",
        sensor: "Sony CMOS, 6.4 Mpx (model not published)",
        sensorWidthMm: 7.43,
        sensorHeightMm: 4.99,
        pixelSizeUm: 2.4,
        calculated: ["sensorWidthMm", "sensorHeightMm"],
        calculation:
          "Image 3096 × 2080 px × 2.4 µm. The page names the brand (Sony), not the sensor model.",
        makerPages: [
          {
            url: "https://vaonis.com/pages/stellina-observation-station",
            readOn: "2026-10-22",
          },
        ],
      },
      mount: {
        id: "integrated-altaz",
        name: "Azimutale intégrée",
      },
      makerPages: [
        {
          url: "https://vaonis.com/pages/stellina-observation-station",
          readOn: "2026-10-22",
        },
      ],
      calculation:
        "Estimation : the page covers alt-azimuthal mounts and Go-To tracking in general without naming the Stellina's mount, alt-azimuth is kept.",
      calculated: ["mountId"],
    },
  },
  {
    id: "vespera",
    type: "telescope",
    name: "Vespera",
    order: 45,
    specifications: {
      apertureMm: 50,
      focalLengthMm: 200,
    },
    planner: {
      group: "connected",
      maker: "Vaonis",
      driver: "vespera",
      integratedCamera: {
        id: "vespera-imx462",
        name: "IMX462",
        sensor: "Sony IMX462",
        sensorWidthMm: 5.57,
        sensorHeightMm: 3.13,
        pixelSizeUm: 2.9,
        calculated: ["sensorWidthMm", "sensorHeightMm"],
        calculation:
          "Image 1920 × 1080 px × 2.9 µm. The pixel size is not on the Vaonis page: ZWO's ASI462 manual (same sensor).",
        makerPages: [
          {
            url: "https://vaonis.com/blogs/travel-journal/vespera-vaonis-newborn-star",
            readOn: "2026-10-22",
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
          url: "https://vaonis.com/blogs/travel-journal/vespera-vaonis-newborn-star",
          readOn: "2026-10-22",
        },
      ],
    },
  },
  {
    id: "vespera-pro",
    type: "telescope",
    name: "Vespera Pro",
    order: 46,
    specifications: {
      apertureMm: 50,
      focalLengthMm: 250,
    },
    planner: {
      group: "connected",
      maker: "Vaonis",
      driver: "vespera",
      integratedCamera: {
        id: "vespera-pro-imx676",
        name: "IMX676",
        sensor: "Sony IMX676",
        sensorKind: "colour",
        sensorWidthMm: 7.07,
        sensorHeightMm: 7.07,
        pixelSizeUm: 2,
        calculated: ["sensorWidthMm", "sensorHeightMm"],
        calculation: "Image 3536 × 3536 px × 2 µm.",
        makerPages: [
          {
            url: "https://vaonis.com/products/vespera-pro",
            readOn: "2026-10-22",
          },
        ],
      },
      mount: {
        id: "integrated-altaz",
        name: "Azimutale intégrée",
      },
      makerPages: [
        {
          url: "https://vaonis.com/products/vespera-pro",
          readOn: "2026-10-22",
        },
      ],
    },
  },
]);

const literal = (value) =>
  value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;

/**
 * The statements of migration 96: one idempotent insert per row (SQLite and
 * PostgreSQL alike), so that an identifier already taken is never
 * overwritten.
 */
export function telescopeCatalogue2SeedSql() {
  return TELESCOPE_CATALOGUE_2_SEED.map(
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
