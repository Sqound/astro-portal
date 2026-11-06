// The page of a capture in the galleries shows its progression — the
// milestones Astro Sync stacked — with the capture, without a switch, through
// the catalogue's timed player; and, under the switch of the quality, what
// Astro Sync read of its nights: the medians of the frames and the guiding.
// The view of each gallery carries them in the contract, the media routes
// serve the milestones (never another space's, never an unknown one), and a
// new capture shows its quality in public.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import { schemaErrors } from "../../astro-contracts/tests/schema-assert.mjs";
import { createPublicGalleryService } from "../dist/captures/public-gallery.js";
import {
  galleryNight,
  galleryQualityCharts,
} from "../dist/captures/gallery-nights.js";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { createPrivateGalleryService } from "../dist/private-gallery/private-gallery.js";
import { capturePathFor } from "../dist/uploads/capture-storage.js";

await registerJsx();
const { PublicCapturePage, progressionSteps, publicNightSections } =
  await import("portal/components/detail/PublicCapturePage.js");
const { privateCapturePageProps } =
  await import("portal/components/gallery/PrivateGallery.js");
const { messages } = await import("portal/i18n.js");

const gallerySchema = JSON.parse(
  await readFile(
    new URL(
      "../../astro-contracts/schemas/api/gallery.schema.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const galleryErrors = (pointer, value) =>
  schemaErrors({ ...gallerySchema, $ref: `#/$defs/${pointer}` }, value);

const at = "2026-10-14T09:00:00.000Z";
const text = (markup) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/[  ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * A night's report: three measured frames ten minutes apart, an hour of
 * guiding in two slices with their raw samples, and `flips` meridian flips.
 * `raw: false`: the slices without their samples.
 */
const report = ({ fwhm, flips = 0, raw = true }) => ({
  pixelScaleArcsec: 2,
  quality: [1, 2, 3].map((index) => ({
    timestampUtc: `2026-10-13T21:${String((index - 1) * 10).padStart(2, "0")}:00Z`,
    stepKey: "s",
    fwhmPixels: fwhm + index * 0.1,
    eccentricity: 0.4,
    skyBackgroundAdu: 1200 + index,
  })),
  guidingSeries: [
    ["21:00", "21:30"],
    ["21:30", "22:00"],
  ].map(([from, to]) => ({
    start: `2026-10-13T${from}:00Z`,
    end: `2026-10-13T${to}:00Z`,
    rmsRa: 0.4,
    rmsDec: 0.3,
    rmsTotal: 0.5,
    samples: 600,
  })),
  guiding: raw
    ? ["21:05", "21:15", "21:35", "21:45"].map((at, index) => ({
        timestampUtc: `2026-10-13T${at}:00Z`,
        source: "phd2",
        frame: index,
        elapsedSeconds: index * 600,
        raOffsetArcsec: index < 2 ? 0.2 : -0.2,
        decOffsetArcsec: 0.1,
        raDurationMs: null,
        decDurationMs: null,
        starMass: null,
        snr: null,
        errorCode: null,
      }))
    : [],
  timeline: {
    events: Array.from({ length: flips }, () => ({
      type: "meridian-flip",
      timestampUtc: "2026-10-13T21:40:00Z",
      source: "nina",
      data: {},
    })),
  },
});

async function withGalleries(exercise) {
  const directory = await mkdtemp(join(tmpdir(), "astro-progression-nights-"));
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  await applyMigrations(driver, "sqlite");
  const files = {
    sharedCopy: async ({ tenantId, sha256 }) => ({
      path: capturePathFor(tenantId, sha256),
    }),
  };
  const gallery = await createPublicGalleryService({
    driver,
    ...files,
    imageSize: async () => null,
  });
  const privateGallery = await createPrivateGalleryService({
    driver,
    ...files,
    // Every file is there: the gate's answer is what is tested.
    captureStore: { stat: async () => ({ size: 1 }) },
  });
  try {
    await exercise({ driver, gallery, privateGallery });
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
}

/**
 * A public capture with three milestones (written out of order) and, when
 * `nights` is given, its sessions and their analyses. `plan`: the image of a
 * multi-night plan combining those nights.
 */
async function seed(driver, { nights = [], plan = false } = {}) {
  const tenantId = randomUUID();
  const userId = randomUUID();
  const captureId = randomUUID();
  await driver.run(
    "INSERT INTO organizations (id, name, created_at, public_name) VALUES (?, ?, ?, ?)",
    [tenantId, "Col des Étoiles", at, "Camille"],
  );
  await driver.run(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
    [userId, `${userId}@example.test`, "test-only", at],
  );
  await driver.run(
    "INSERT INTO memberships (id, tenant_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)",
    [randomUUID(), tenantId, userId, at],
  );
  const sessionIds = [];
  for (const [index, night] of nights.entries()) {
    const sessionId = randomUUID();
    sessionIds.push(sessionId);
    // Written newest first: the view orders the nights by their start.
    await driver.run(
      "INSERT INTO observation_sessions (id, tenant_id, started_at, created_at) VALUES (?, ?, ?, ?)",
      [
        sessionId,
        tenantId,
        `2026-10-${String(20 - index).padStart(2, "0")}T20:00:00Z`,
        at,
      ],
    );
    await driver.run(
      "INSERT INTO session_analyses (id, tenant_id, session_id, report_version, report_json, created_at) VALUES (?, ?, ?, 2, ?, ?)",
      [randomUUID(), tenantId, sessionId, JSON.stringify(night), at],
    );
  }
  const digest = (suffix) =>
    createHash("sha256").update(`${captureId}${suffix}`).digest("hex");
  await driver.run(
    "INSERT INTO captures (id, tenant_id, session_id, original_name, sha256, byte_size, status, stage, visibility, created_at, project_id, plan_json) VALUES (?, ?, ?, ?, ?, ?, 'uploaded', 'finalized', 'public', ?, ?, ?)",
    [
      captureId,
      tenantId,
      plan ? null : (sessionIds[0] ?? null),
      "IC1805_final.jpg",
      digest(""),
      100,
      at,
      plan ? randomUUID() : null,
      plan ? JSON.stringify({ combinedNightIds: sessionIds }) : null,
    ],
  );
  await driver.run(
    "INSERT INTO capture_variants (id, capture_id, tenant_id, sha256, byte_size, original_name, width, height, source, is_main, is_public, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'astro-sync', 1, 1, ?)",
    [
      captureId,
      captureId,
      tenantId,
      digest(""),
      100,
      "IC1805_final.jpg",
      2922,
      2917,
      at,
    ],
  );
  for (const frames of [187, 98, 307])
    await driver.run(
      "INSERT INTO capture_variants (id, capture_id, tenant_id, sha256, byte_size, original_name, width, height, source, is_main, is_public, role, frame_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'astro-sync', 0, 0, 'progression', ?, ?)",
      [
        `${captureId}-p${frames}`,
        captureId,
        tenantId,
        digest(`-p${frames}`),
        100,
        `progression_${frames}.jpg`,
        2922,
        2917,
        frames,
        at,
      ],
    );
  return { tenantId, userId, captureId, sessionIds };
}

const switchPublic = (driver, captureId, on) =>
  driver.run("UPDATE captures SET quality_public = ? WHERE id = ?", [
    on ? 1 : 0,
    captureId,
  ]);

test("the public gallery's JSON carries the milestones with the capture, from the fewest frames to the most, each served by the media route, in the contract", async () => {
  await withGalleries(async ({ driver, gallery }) => {
    const space = await seed(driver);
    const view = await gallery.get({
      captureId: space.captureId,
      locale: "fr",
    });
    assert.equal(view.progression.plan, false);
    assert.deepEqual(
      view.progression.steps.map((step) => [step.id, step.frameCount]),
      [
        [`${space.captureId}-p98`, 98],
        [`${space.captureId}-p187`, 187],
        [`${space.captureId}-p307`, 307],
      ],
    );
    assert.equal(
      view.progression.steps[0].media.image,
      `/api/v1/gallery/${space.captureId}/media?imageId=${encodeURIComponent(`${space.captureId}-p98`)}`,
    );
    assert.deepEqual(view.progression.steps[0].image, {
      width: 2922,
      height: 2917,
    });
    // Never among the variants.
    assert.deepEqual(view.variants, []);
    assert.deepEqual(galleryErrors("capture", view), []);
    // The media route serves a milestone; an unknown image stays a 404.
    const media = await gallery.media({
      captureId: space.captureId,
      imageId: `${space.captureId}-p187`,
    });
    assert.equal(
      media.sha256,
      createHash("sha256").update(`${space.captureId}-p187`).digest("hex"),
    );
    assert.equal(
      await gallery.media({ captureId: space.captureId, imageId: "nope" }),
      null,
    );
    // A private capture shows nothing, its milestones included.
    await driver.run(
      "UPDATE captures SET visibility = 'private' WHERE id = ?",
      [space.captureId],
    );
    assert.equal(await gallery.get({ captureId: space.captureId }), null);
    assert.equal(
      await gallery.media({
        captureId: space.captureId,
        imageId: `${space.captureId}-p98`,
      }),
      null,
    );
  });
});

test("a capture without a milestone has no progression in its view", async () => {
  await withGalleries(async ({ driver, gallery }) => {
    const space = await seed(driver);
    await driver.run(
      "DELETE FROM capture_variants WHERE capture_id = ? AND role = 'progression'",
      [space.captureId],
    );
    const view = await gallery.get({
      captureId: space.captureId,
      locale: "fr",
    });
    assert.equal("progression" in view, false);
  });
});

test("the nights go with the quality's switch: the medians and the guiding of each night, in the order of the nights, never a date or an identifier", async () => {
  await withGalleries(async ({ driver, gallery }) => {
    const space = await seed(driver, {
      nights: [report({ fwhm: 1.2, flips: 1 })],
    });
    const get = async () =>
      await gallery.get({ captureId: space.captureId, locale: "fr" });
    // The switch off (a capture created before the rule): no night.
    await switchPublic(driver, space.captureId, false);
    assert.equal("nights" in (await get()), false);
    await switchPublic(driver, space.captureId, true);
    const on = await get();
    assert.deepEqual(on.nights, [
      {
        skyBackgroundAdu: 1202,
        fwhmArcsec: 2.8,
        eccentricity: 0.4,
        measuredFrames: 3,
        guiding: {
          rmsTotalArcsec: 0.5,
          rmsRaArcsec: 0.4,
          rmsDecArcsec: 0.3,
          meridianFlips: 1,
        },
      },
    ]);
    // Above them, the catalogue's charts of what moves through the night.
    assert.deepEqual(
      on.qualityCharts.series.map((point) => [
        point.fromMinute,
        point.backgroundRelativePercent,
        point.fwhmPixels,
      ]),
      [
        [0, 100, 1.3],
        [10, 100.1, 1.4],
        [20, 100.2, 1.5],
      ],
    );
    const night = on.qualityCharts.sessionTelemetry[0];
    assert.equal(night.night, 1);
    assert.deepEqual(
      night.guideSeries.map((point) => [
        point.fromMinute,
        point.raArcsec,
        point.decArcsec,
        point.rmsTotalArcsec,
      ]),
      [
        [0, 0.2, 0.1, 0.5],
        [30, -0.2, 0.1, 0.5],
      ],
    );
    assert.deepEqual(night.events, [{ type: "meridian-flip", minute: 40 }]);
    assert.equal(night.summary.meridianFlipCount, 1);
    assert.deepEqual(galleryErrors("capture", on), []);
    // Never a date, a clock time or a session's identifier.
    assert.doesNotMatch(
      JSON.stringify({ nights: on.nights, charts: on.qualityCharts }),
      new RegExp(`${space.sessionIds[0]}|2026-10|T21:`),
    );
    await switchPublic(driver, space.captureId, false);
    assert.equal("qualityCharts" in (await get()), false);
    await switchPublic(driver, space.captureId, true);
    // The image of a multi-night plan: its nights, ordered by their start
    // (written newest first).
    const plan = await seed(driver, {
      plan: true,
      nights: [report({ fwhm: 3 }), report({ fwhm: 2 })],
    });
    await switchPublic(driver, plan.captureId, true);
    const planView = await gallery.get({ captureId: plan.captureId });
    assert.equal(planView.progression.plan, true);
    assert.deepEqual(
      planView.nights.map((night) => night.fwhmArcsec),
      [4.4, 6.4],
    );
    // A report that says nothing is no night.
    assert.equal(galleryNight({}), null);
  });
});

test("the private gallery's view carries the milestones, served through its gate, and the nights under « Afficher la qualité en privé »", async () => {
  await withGalleries(async ({ driver, privateGallery }) => {
    const space = await seed(driver, { nights: [report({ fwhm: 1.2 })] });
    const owner = { tenantId: space.tenantId, userId: space.userId };
    const set = await privateGallery.update({
      ...owner,
      changes: { mode: "link", confirmVerifiers: true },
      origin: "https://p.test",
    });
    const token = new URL(set.address).pathname.split("/").pop();
    const view = (
      await privateGallery.capture({ token, captureId: space.captureId })
    ).view;
    assert.deepEqual(
      view.capture.progression.steps.map((step) => step.frameCount),
      [98, 187, 307],
    );
    assert.equal(view.capture.nights.length, 1);
    const props = privateCapturePageProps({ locale: "fr", token, view });
    assert.equal(
      props.capture.progression.steps[0].media.image,
      `/api/v1/portals/${token}/media/${space.captureId}?imageId=${encodeURIComponent(`${space.captureId}-p98`)}`,
    );
    const media = await privateGallery.media({
      token,
      captureId: space.captureId,
      imageId: `${space.captureId}-p307`,
    });
    assert.equal(
      media?.sha256,
      createHash("sha256").update(`${space.captureId}-p307`).digest("hex"),
      "the gate serves a milestone",
    );
    assert.equal(
      await privateGallery.media({
        token,
        captureId: space.captureId,
        imageId: "nope",
      }),
      null,
    );
    // The private switch off: no night.
    await driver.run("UPDATE captures SET quality_private = 0 WHERE id = ?", [
      space.captureId,
    ]);
    const off = (
      await privateGallery.capture({ token, captureId: space.captureId })
    ).view.capture;
    assert.equal("nights" in off, false);
    assert.equal(
      off.progression.steps.length,
      3,
      "milestones without a switch",
    );
  });
});

// ——— the page ———

const progression = (plan = false) => ({
  plan,
  steps: [1, 98, 187].map((frames) => ({
    id: `p${frames}`,
    frameCount: frames,
    image: { width: 2922, height: 2917 },
    media: {
      image: `/api/v1/gallery/c/media?imageId=p${frames}`,
      thumbnail: `/api/v1/gallery/c/media?variant=thumbnail&imageId=p${frames}`,
    },
  })),
});

const capture = (extra = {}) => ({
  id: "c",
  targets: [{ id: "ic1805", designation: "IC 1805", aliases: [] }],
  tag: null,
  tags: [],
  telescope: null,
  exposure: null,
  nightMonth: "2026-10",
  signature: "Camille",
  media: { image: "/api/v1/gallery/c/media", thumbnail: null },
  equipment: [],
  skyQuality: null,
  image: { width: 2922, height: 2917 },
  mainImage: { id: "main", title: null, description: null, arrivalRank: 1 },
  variants: [],
  ...extra,
});

test("the page: « Progression de la nuit » after « Acquisition » with the catalogue's interval, ▶ and one button per milestone; « Après la nuit N » for a multi-night plan", () => {
  const markup = renderToStaticMarkup(
    createElement(PublicCapturePage, {
      capture: capture({ progression: progression() }),
      locale: "fr",
    }),
  );
  assert.match(
    markup,
    /<section data-section="progression"><div class="section-heading"><h3>Progression de la nuit<\/h3>/,
  );
  assert.match(
    markup,
    /<option value="2600" selected="">Normal · 2,6 s<\/option>/,
  );
  assert.match(markup, /aria-label="Lire la progression">▶<\/button>/);
  assert.deepEqual(
    [
      ...markup.matchAll(
        /<button type="button" class=""[^>]*><strong>([^<]+)<\/strong>/g,
      ),
    ].map((match) => match[1]),
    ["1 pose", "98 poses", "187 poses"],
  );
  // Nothing of the progression in the viewer until a milestone is chosen.
  assert.doesNotMatch(markup, /progression-pagination|progression-exit/);
  const plan = progressionSteps(progression(true), "fr");
  assert.deepEqual(
    plan.map((step) => [step.primary, step.secondary, step.label]),
    [
      ["Après la nuit 1", "1 pose", "Après la nuit 1 — 1 pose"],
      ["Après la nuit 2", "98 poses", "Après la nuit 2 — 98 poses"],
      ["Après la nuit 3", "187 poses", "Après la nuit 3 — 187 poses"],
    ],
  );
  const planMarkup = renderToStaticMarkup(
    createElement(PublicCapturePage, {
      capture: capture({ progression: progression(true) }),
      locale: "fr",
    }),
  );
  assert.match(planMarkup, /<h3>Progression de l’empilement<\/h3>/);
  // Without milestones: no section.
  assert.doesNotMatch(
    renderToStaticMarkup(
      createElement(PublicCapturePage, { capture: capture(), locale: "fr" }),
    ),
    /data-section="progression"/,
  );
});

test("the page: « La nuit » and « Guidage » after « Qualité », « Les nuits » with « Nuit 1 », « Nuit 2 » for several", () => {
  const night = {
    skyBackgroundAdu: 1202,
    fwhmArcsec: 2.6,
    eccentricity: 0.4,
    measuredFrames: 3,
    guiding: {
      rmsTotalArcsec: 0.5,
      rmsRaArcsec: 0.4,
      rmsDecArcsec: 0.3,
      meridianFlips: 1,
    },
  };
  const one = text(
    renderToStaticMarkup(
      createElement(PublicCapturePage, {
        capture: capture({ nights: [night] }),
        locale: "fr",
      }),
    ),
  );
  for (const words of [
    "La nuit Fond du ciel 1 202 ADU FWHM des étoiles 2,60″ Excentricité 0,40 Poses mesurées 3",
    "Guidage RMS total du guidage 0,50″ RMS AD du guidage 0,40″ RMS Dec du guidage 0,30″ Retournements au méridien 1",
  ])
    assert.ok(one.includes(words), words);
  assert.ok(!one.includes("Nuit 1"));
  const two = publicNightSections(
    [night, { ...night, fwhmArcsec: null, guiding: null }],
    "fr",
  );
  assert.deepEqual(
    two.map((section) => [
      section.title,
      section.nights.map((entry) => entry.label),
    ]),
    [
      ["Les nuits", ["Nuit 1", "Nuit 2"]],
      ["Guidage", ["Nuit 1"]],
    ],
  );
  assert.deepEqual(publicNightSections(undefined, "fr"), []);
});

test("the words of the progression and of the nights are in the ten languages", () => {
  for (const [locale, catalogue] of Object.entries(messages)) {
    for (const key of [
      "progressionNight",
      "progressionStacking",
      "progressionFrame",
      "progressionFrames",
      "progressionAfterNight",
      "progressionPosition",
      "publicNightTitle",
      "publicNightsTitle",
      "publicNightLabel",
      "guidingTitle",
      "meridianFlips",
      "qualityMeasuredFrames",
      "qualityElapsedWindow",
      "sessionTelemetryDuration",
    ])
      assert.ok(catalogue[key], `${locale} ${key}`);
    assert.match(catalogue.progressionFrames, /\{count\}/);
    assert.match(catalogue.progressionAfterNight, /\{night\}/);
    assert.match(catalogue.publicNightLabel, /\{night\}/);
    if (locale !== "en")
      assert.notEqual(catalogue.progressionNight, messages.en.progressionNight);
  }
});

test("the charts hide what a night did not keep: no raw guiding sample, no trace; no measured frame, no quality curve; nothing at all, no charts", () => {
  const withoutSamples = galleryQualityCharts([
    report({ fwhm: 1, raw: false }),
  ]);
  assert.equal(withoutSamples.series.length, 3);
  assert.deepEqual(withoutSamples.sessionTelemetry[0].guideSeries, []);
  // Its single values still say the guiding (rows under the charts).
  assert.equal(withoutSamples.sessionTelemetry[0].summary.rmsTotalArcsec, 0.5);
  const guidingOnly = galleryQualityCharts([
    { ...report({ fwhm: 1 }), quality: [] },
  ]);
  assert.deepEqual(guidingOnly.series, []);
  assert.equal(guidingOnly.sessionTelemetry[0].guideSeries.length, 2);
  assert.equal(galleryQualityCharts([{}]), null);
  assert.equal(galleryQualityCharts([]), null);
  // Two nights follow one another on one axis, each named by its rank.
  const two = galleryQualityCharts([report({ fwhm: 1 }), report({ fwhm: 2 })]);
  assert.deepEqual(
    two.series.map((point) => [point.night, point.fromMinute]),
    [
      [1, 0],
      [1, 10],
      [1, 20],
      [2, 61],
      [2, 71],
      [2, 81],
    ],
  );
  assert.deepEqual(
    two.sessionTelemetry.map((entry) => entry.id),
    ["night-1", "night-2"],
  );
});

test("the page: in « La nuit » the catalogue's curves above the values, in « Guidage » its trace above the values; a part without data is not drawn", () => {
  const charts = galleryQualityCharts([report({ fwhm: 1.2, flips: 1 })]);
  const night = {
    skyBackgroundAdu: 1202,
    fwhmArcsec: 2.8,
    eccentricity: 0.4,
    measuredFrames: 3,
    guiding: {
      rmsTotalArcsec: 0.5,
      rmsRaArcsec: 0.4,
      rmsDecArcsec: 0.3,
      meridianFlips: 1,
    },
  };
  const markup = renderToStaticMarkup(
    createElement(PublicCapturePage, {
      capture: capture({ nights: [night], qualityCharts: charts }),
      locale: "fr",
    }),
  );
  const nights = markup.slice(
    markup.indexOf('data-section="nights"'),
    markup.indexOf('data-section="guiding"'),
  );
  assert.ok(
    nights.indexOf("quality-sparkline") > 0 &&
      nights.indexOf("quality-sparkline") <
        nights.indexOf("public-capture-night"),
    "the curves above the values",
  );
  assert.match(nights, /3 poses mesurées/);
  assert.match(nights, /évolution relative/);
  const guiding = markup.slice(markup.indexOf('data-section="guiding"'));
  assert.ok(
    guiding.indexOf("guiding-trace") > 0 &&
      guiding.indexOf("guiding-trace") <
        guiding.indexOf("public-capture-night"),
    "the trace above the values",
  );
  assert.match(text(guiding), /Nuit 1 · 1 h de nuit mesurée/);
  assert.match(text(guiding), /RMS total du guidage 0,50″/);
  assert.doesNotMatch(markup, /UTC|JST/);
  // No raw sample: no trace, the values stay.
  const plain = renderToStaticMarkup(
    createElement(PublicCapturePage, {
      capture: capture({
        nights: [night],
        qualityCharts: galleryQualityCharts([
          report({ fwhm: 1.2, raw: false }),
        ]),
      }),
      locale: "fr",
    }),
  );
  assert.doesNotMatch(plain, /class="guiding-trace"/);
  assert.match(text(plain), /RMS total du guidage 0,50″/);
  // No charts and no values: no section.
  assert.doesNotMatch(
    renderToStaticMarkup(
      createElement(PublicCapturePage, { capture: capture(), locale: "fr" }),
    ),
    /data-section="(nights|guiding)"/,
  );
});
