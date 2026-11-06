import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertInvalid,
  assertValid,
  registerExternalSchema,
} from "./schema-assert.mjs";

// The integrations of a
// multi-night plan (one line per night, target and family, never a file),
// the project read alone that carries them, and the image of the plan, an
// upload of role `plan`.

const schemasDirectory = new URL("../schemas/", import.meta.url);
const schema = async (relativePath) =>
  JSON.parse(await readFile(new URL(relativePath, schemasDirectory), "utf8"));

const integration = await schema("api/integration.schema.json");
registerExternalSchema("integration.schema.json", integration);
registerExternalSchema(
  "../planner/horizon-mask.schema.json",
  await schema("planner/horizon-mask.schema.json"),
);
const project = await schema("api/project.schema.json");
const capture = await schema("api/capture.schema.json");
const uploadMetadata = { $defs: capture.$defs, $ref: "#/$defs/uploadMetadata" };
const captureResource = { $defs: capture.$defs, $ref: "#/$defs/capture" };

const PROJECT = "5d0c6b1e-2f4a-4c8e-9b7d-3a1f0e6c2b90";
const NIGHT = "0b8a3c2e-1d4f-4a6b-9c8d-7e6f5a4b3c21";

// The night of 9 August of the Heart (IC 1805): 98 × 180 s, dual-band.
const line = (overrides = {}) => ({
  nightId: NIGHT,
  targetId: "ic1805",
  filter: "Bibande (Hα + OIII)",
  exposureSeconds: 180,
  gain: 100,
  binning: 1,
  temperatureC: -10,
  frameCount: 98,
  eveningDate: "2026-08-09",
  sensor: "IMX571",
  computerLabel: "iMac du bureau",
  installationId: "astro-sync-install-1",
  ...overrides,
});

const stored = (overrides = {}) => ({
  id: "3f2e1d0c-9b8a-4765-8432-10fedcba9876",
  projectId: PROJECT,
  ...line(),
  totalSeconds: 17640,
  createdAt: "2026-08-10T08:00:00.000Z",
  updatedAt: "2026-08-10T08:00:00.000Z",
  ...overrides,
});

test("integration.schema.json declares a 2020-12 $schema and a stable $id", () => {
  assert.equal(
    integration.$schema,
    "https://json-schema.org/draft/2020-12/schema",
  );
  assert.equal(
    integration.$id,
    "https://astroportal.invalid/schemas/api/integration.schema.json",
  );
});

test("the write body: one to 200 lines, the family, never a computed total nor a file", () => {
  assertValid(integration, { integrations: [line()] });
  assertValid(integration, {
    integrations: [
      line({ filter: null, gain: null, binning: null, temperatureC: null }),
    ],
  });
  assertValid(integration, {
    integrations: [line({ sensor: null, computerLabel: null })],
  });
  assertInvalid(integration, { integrations: [] });
  assertInvalid(integration, {
    integrations: [{ ...line(), totalSeconds: 17640 }],
  });
  assertInvalid(integration, { integrations: [{ ...line(), path: "a.fit" }] });
  assertInvalid(integration, {
    integrations: [line({ eveningDate: "9 août" })],
  });
  assertInvalid(integration, { integrations: [line({ frameCount: 0 })] });
  assertInvalid(integration, {
    integrations: [line({ filter: "x".repeat(41) })],
  });
  const { nightId: _night, ...withoutNight } = line();
  assertInvalid(integration, { integrations: [withoutNight] });
});

test("the write body, complete form: `replace` names the sets sent complete, and a set can be emptied", async () => {
  const bodies = JSON.parse(
    await readFile(
      new URL("../fixtures/integrations-put-bodies.json", import.meta.url),
      "utf8",
    ),
  );
  // The earlier form (no `replace`) stays valid, unchanged.
  assertValid(integration, bodies.earlier);
  assertValid(integration, bodies.complete);
  assertValid(integration, bodies.emptySet);
  for (const body of Object.values(bodies.invalid))
    assertInvalid(integration, body);
});

test("the list: integrations with their computed total, and the totals by filter", () => {
  assertValid(integration, {
    projectId: PROJECT,
    integrations: [stored()],
    totalsByFilter: [
      {
        filter: "Bibande (Hα + OIII)",
        frameCount: 98,
        totalSeconds: 17640,
        nightCount: 1,
      },
    ],
    totalSeconds: 17640,
    nightCount: 1,
  });
  assertValid(integration, {
    projectId: PROJECT,
    integrations: [],
    totalsByFilter: [],
    totalSeconds: 0,
    nightCount: 0,
  });
  assertInvalid(integration, {
    projectId: PROJECT,
    integrations: [{ ...stored(), master: "a.fit" }],
    totalsByFilter: [],
    totalSeconds: 0,
    nightCount: 0,
  });
});

test("the refusals: multi_night_not_active names analysis.progression, integration_outside_night gives the night's date", () => {
  assertValid(integration, {
    error: {
      code: "multi_night_not_active",
      message: "The multi-night plans of Astro Sync are not active.",
    },
    capability: "analysis.progression",
  });
  assertValid(integration, {
    error: {
      code: "integration_outside_night",
      message: "This integration is not of that night.",
    },
    nightId: NIGHT,
    eveningDate: "2026-08-10",
  });
  assertInvalid(integration, {
    error: { code: "multi_night_not_active", message: "x" },
    capability: "planner.mosaic",
  });
});

test("the project read alone carries its integrations, totals and image of the plan; the list stays as it was", () => {
  const base = {
    id: PROJECT,
    revision: 1,
    status: "active",
    target: { targetId: "ic1805", name: "IC 1805" },
    goalMinutes: 720,
    place: { name: "Col des Mélèzes", latitude: 45, longitude: 2 },
    equipment: {},
    constraints: {
      minAltitude: 30,
      moonSeparationMinimum: 30,
      moonSeparationMinimumByFilter: {},
    },
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
  assertValid(project, base);
  assertValid(project, {
    ...base,
    integrations: [stored()],
    totalsByFilter: [
      {
        filter: "Bibande (Hα + OIII)",
        frameCount: 98,
        totalSeconds: 17640,
        nightCount: 1,
      },
    ],
    planCapture: {
      id: "6a5b4c3d-2e1f-4a0b-9c8d-7e6f5a4b3c2d",
      createdAt: "2026-08-13T09:00:00.000Z",
      combinedNightIds: [NIGHT],
      totalsByFilter: [{ filter: "Bibande (Hα + OIII)", totalSeconds: 17640 }],
      render: "dualband",
    },
    planCaptureCount: 1,
  });
  assertValid(project, {
    ...base,
    integrations: [],
    totalsByFilter: [],
    planCapture: null,
    planCaptureCount: 0,
  });
  assertInvalid(project, {
    ...base,
    planCapture: {
      id: "6a5b4c3d-2e1f-4a0b-9c8d-7e6f5a4b3c2d",
      createdAt: "2026-08-13T09:00:00.000Z",
      combinedNightIds: [],
      totalsByFilter: [],
      render: "pretty",
    },
  });
});

test("an upload of role plan: projectId and the plan's fields; progression stays as it was", () => {
  const bytes = {
    originalName: "ic1805-plan.jpg",
    sha256: "a".repeat(64),
    byteSize: 1024,
  };
  assertValid(uploadMetadata, {
    ...bytes,
    role: "plan",
    projectId: PROJECT,
    combinedNightIds: [NIGHT],
    totalsByFilter: [
      { filter: "Bibande (Hα + OIII)", frameCount: 98, totalSeconds: 17640 },
      { filter: "RGB", totalSeconds: 8010 },
    ],
    planRender: "dualband",
  });
  // R348b: « Rendu soigné » and « Palette HOO » have their own words.
  for (const planRender of ["natural", "polished", "hoo", "none"]) {
    assertValid(uploadMetadata, {
      ...bytes,
      role: "plan",
      projectId: PROJECT,
      planRender,
    });
  }
  assertValid(uploadMetadata, {
    ...bytes,
    role: "progression",
    captureId: PROJECT,
    progressionFrames: 12,
  });
  assertInvalid(uploadMetadata, { ...bytes, role: "night" });
  assertInvalid(uploadMetadata, {
    ...bytes,
    role: "plan",
    projectId: PROJECT,
    planRender: "pretty",
  });
  assertInvalid(uploadMetadata, {
    ...bytes,
    role: "plan",
    projectId: PROJECT,
    totalsByFilter: [{ filter: "RGB" }],
  });
});

test("a capture of role plan carries projectId and plan; any other capture is unchanged", () => {
  const resource = {
    id: "6a5b4c3d-2e1f-4a0b-9c8d-7e6f5a4b3c2d",
    sessionId: null,
    planId: null,
    targetIds: [],
    originalName: "ic1805-plan.jpg",
    sha256: "a".repeat(64),
    byteSize: 1024,
    status: "uploaded",
    stage: "draft",
    visibility: "private",
    checks: {
      automatic: null,
      automaticAt: null,
      team: null,
      teamAt: null,
      teamReason: null,
      reviewRequestedAt: null,
      protectionNoticeAt: null,
      protectionLiftedAt: null,
      removedFromGalleryAt: null,
    },
    createdAt: "2026-08-13T09:00:00.000Z",
  };
  assertValid(captureResource, resource);
  assertValid(captureResource, {
    ...resource,
    projectId: PROJECT,
    plan: {
      combinedNightIds: [NIGHT],
      totalsByFilter: [{ filter: "RGB", totalSeconds: 8010 }],
      render: null,
    },
  });
});
