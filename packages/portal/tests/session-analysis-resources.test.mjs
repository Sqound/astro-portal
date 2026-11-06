import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSessionAnalysisService } from "../dist/api/session-analysis-resources.js";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { PostgresDriver } from "../dist/persistence/postgres-driver.js";
import { createNightService } from "../dist/api/night-resources.js";
import { importedReport, nightReport } from "./fixtures/night/report-v2.mjs";
import { nightReportV3 } from "./fixtures/night/report-v3.mjs";

const initialTime = "2026-09-27T20:00:00.000Z";

// The two capability profiles the test wording names: "sending ->
// visible on the page for an advanced profile; 403 for a standard
// profile": `analysis.logs: false` for the standard one,
// `analysis.logs: true` for the advanced one.
const standardCapabilities = {
  "planner.multiple": true,
  "planner.mosaic": true,
  "pointing.solve": true,
  "sync.plan_limit": 1000,
  "gallery.private": true,
  "capture.variant_limit": 4,
  "analysis.logs": false,
  "analysis.progression": false,
  "storage.max_file_bytes": 104_857_600,
  "storage.quota_bytes": 53_687_091_200,
  "portal.invitations": false,
  "capture.count_limit": 9007199254740991,
  "capture.public": true,
  "history.retention_days": 90,
};
const advancedCapabilities = {
  ...standardCapabilities,
  "capture.variant_limit": 12,
  "analysis.logs": true,
  "analysis.progression": true,
  "portal.invitations": false,
  "capture.count_limit": 9007199254740991,
  "capture.public": true,
  "history.retention_days": 730,
};

const validReport = (changes) => nightReport(changes);

async function seedIdentity(driver, tenantId, userId) {
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    [tenantId, `Observatory ${tenantId}`, initialTime],
  );
  await driver.run(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
    [userId, `${userId}@example.test`, "scrypt$test", initialTime],
  );
  await driver.run(
    "INSERT INTO memberships (id, tenant_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)",
    [randomUUID(), tenantId, userId, "owner", initialTime],
  );
}

async function insertSessionFor(driver, tenantId, sessionId) {
  await driver.run(
    "INSERT INTO observation_sessions (id, tenant_id, started_at, status, created_at) VALUES (?, ?, ?, ?, ?)",
    [sessionId, tenantId, initialTime, "open", initialTime],
  );
}

async function insertTarget(
  driver,
  id,
  designation,
  spaceId = null,
  sourcePresent = spaceId ? 0 : 1,
) {
  await driver.run(
    `INSERT INTO target_catalogue_entries (
       id, designation, aliases_json, common_names_json, catalogues_json,
       catalogue, source_json, source_revision, created_at, updated_at,
       space_id, library_source, source_present
     ) VALUES (?, ?, '[]', '[]', '[]', 'NGC', '{}', 'r1', ?, ?, ?, ?, ?)`,
    [
      id,
      designation,
      initialTime,
      initialTime,
      spaceId,
      spaceId ? "personal" : "catalogue",
      sourcePresent,
    ],
  );
}

async function expectError(action, { code, status }) {
  await assert.rejects(action, (error) => {
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return true;
  });
}

async function newNight(driver) {
  const tenantId = randomUUID();
  const userId = randomUUID();
  const sessionId = randomUUID();
  await seedIdentity(driver, tenantId, userId);
  await insertSessionFor(driver, tenantId, sessionId);
  return { tenantId, userId, sessionId };
}

/**
 * Creating needs
 * `analysis.logs`; reading never does; one analysis per night, the next
 * sending replacing it; the evidence rule at the wire; a v1 report refused.
 */
async function exerciseSessionAnalysisResources(driver) {
  const { tenantId, userId, sessionId } = await newNight(driver);
  const standard = await createSessionAnalysisService({
    driver,
    capabilities: standardCapabilities,
  });
  const advanced = await createSessionAnalysisService({
    driver,
    capabilities: advancedCapabilities,
  });

  await expectError(
    () =>
      standard.create({ tenantId, userId, sessionId, report: validReport() }),
    { code: "analysis_not_entitled", status: 403 },
  );
  await expectError(() => standard.get({ tenantId, sessionId }), {
    code: "analysis_not_found",
    status: 404,
  });

  const first = await advanced.create({
    tenantId,
    userId,
    sessionId,
    report: validReport(),
  });
  assert.ok(first.analysis.analysisVersion === undefined);
  assert.equal(first.analysis.reportVersion, 2);
  assert.equal(first.analysis.sessionId, sessionId);
  assert.equal(first.replaced, false);
  assert.deepEqual(first.steps, { proposed: 3, keptEdited: 0 });

  // Read by a profile without analysis.logs: reading is never gated.
  const read = await standard.get({ tenantId, sessionId });
  assert.equal(read.id, first.analysis.id);
  assert.equal(read.report.acquisitionSteps.length, 3);

  // The next sending replaces it: one analysis per night, no versions.
  const second = await advanced.create({
    tenantId,
    userId,
    sessionId,
    report: validReport({ generatedAtUtc: "2026-10-08T10:00:00.000Z" }),
  });
  assert.equal(second.replaced, true);
  assert.notEqual(second.analysis.id, first.analysis.id);
  const current = await standard.get({ tenantId, sessionId });
  assert.equal(current.id, second.analysis.id);
  assert.equal(current.report.generatedAtUtc, "2026-10-08T10:00:00.000Z");
  assert.equal(
    Number(
      (
        await driver.query(
          "SELECT COUNT(*) AS count FROM session_analyses WHERE session_id = ?",
          [sessionId],
        )
      ).rows[0].count,
    ),
    1,
  );

  // Entitlement is checked before the night's existence.
  await expectError(
    () =>
      standard.create({
        tenantId,
        userId,
        sessionId: randomUUID(),
        report: validReport(),
      }),
    { code: "analysis_not_entitled", status: 403 },
  );
  await expectError(
    () =>
      advanced.create({
        tenantId,
        userId,
        sessionId: randomUUID(),
        report: validReport(),
      }),
    { code: "session_not_found", status: 404 },
  );
  // Another space's night is « not found », never told apart.
  const other = await newNight(driver);
  await expectError(
    () => advanced.get({ tenantId: other.tenantId, sessionId }),
    { code: "session_not_found", status: 404 },
  );

  // The evidence rule at the wire; the report v1 is no longer accepted;
  // two steps under one key are refused.
  await expectError(
    () =>
      advanced.create({
        tenantId,
        userId,
        sessionId,
        report: { ...validReport(), qualityScore: 87 },
      }),
    { code: "invalid_request", status: 400 },
  );
  await expectError(
    () =>
      advanced.create({
        tenantId,
        userId,
        sessionId,
        report: { ...validReport(), reportVersion: 1 },
      }),
    { code: "invalid_request", status: 400 },
  );
  const doubled = validReport();
  doubled.acquisitionSteps[1].key = doubled.acquisitionSteps[0].key;
  await expectError(
    () => advanced.create({ tenantId, userId, sessionId, report: doubled }),
    { code: "invalid_request", status: 400 },
  );
  assert.equal((await standard.get({ tenantId, sessionId })).id, current.id);

  await standard.close();
  await advanced.close();
}

/**
 * A new analysis replaces the
 * steps the previous one proposed that nobody touched; a step corrected by
 * hand stays, marked, and its key is not doubled; a manual step stays.
 * An empty report is refused (422), the night's analysis kept; DELETE
 * removes the analysis and leaves the steps.
 */
async function exerciseReplacement(driver) {
  const { tenantId, userId, sessionId } = await newNight(driver);
  await insertTarget(driver, `ngc7000-${tenantId}`, "NGC 7000");
  await insertTarget(driver, `m31-${tenantId}`, "M31");
  await insertTarget(driver, `m31-personal-${tenantId}`, "M31", tenantId);
  const analyses = await createSessionAnalysisService({
    driver,
    capabilities: advancedCapabilities,
  });
  const nights = await createNightService({ driver });

  await analyses.create({ tenantId, userId, sessionId, report: validReport() });
  let { steps } = await nights.read({ tenantId, sessionId });
  assert.deepEqual(
    steps.map((step) => [step.stepKey, step.origin, step.edited]),
    [
      ["ngc7000-ha-180", "analysis", false],
      ["ngc7000-oiii-180", "analysis", false],
      ["m31-120", "analysis", false],
    ],
  );
  // « NGC 7000 », « NGC7000 » and « M 31 » name targets of the space; the
  // space's own M31 wins over the catalogue's.
  assert.deepEqual(
    steps.map((step) => step.targetId),
    [`ngc7000-${tenantId}`, `ngc7000-${tenantId}`, `m31-personal-${tenantId}`],
  );
  assert.equal(steps[0].integrationSeconds, 540);

  // « 40 poses » corrected to « 2 » by hand; a manual step added.
  const corrected = await nights.patchStep({
    tenantId,
    sessionId,
    stepId: steps[0].id,
    changes: { frameCount: 2 },
  });
  assert.equal(corrected.edited, true);
  const manual = await nights.createStep({
    tenantId,
    sessionId,
    step: { filter: "L", frameCount: 10, exposureSeconds: 60 },
  });

  // Astro Sync sends the night again, the OIII step now with 4 frames.
  const again = validReport();
  again.acquisitionSteps[1].frameCount = 4;
  const result = await analyses.create({
    tenantId,
    userId,
    sessionId,
    report: again,
  });
  assert.deepEqual(result.steps, { proposed: 2, keptEdited: 1 });
  ({ steps } = await nights.read({ tenantId, sessionId }));
  const byKey = Object.fromEntries(
    steps.map((step) => [step.stepKey ?? step.origin, step]),
  );
  assert.equal(steps.length, 4);
  assert.equal(byKey["ngc7000-ha-180"].id, corrected.id);
  assert.equal(byKey["ngc7000-ha-180"].frameCount, 2);
  assert.equal(byKey["ngc7000-ha-180"].edited, true);
  assert.equal(byKey["ngc7000-oiii-180"].frameCount, 4);
  assert.equal(byKey["ngc7000-oiii-180"].edited, false);
  assert.equal(byKey.manual.id, manual.id);

  // An empty sending never wipes the night's measures.
  const before = await analyses.get({ tenantId, sessionId });
  await expectError(
    () =>
      analyses.create({
        tenantId,
        userId,
        sessionId,
        report: validReport({
          acquisitionSteps: [],
          quality: [],
          guiding: [],
          timeline: { startedAt: null, endedAt: null, events: [] },
        }),
      }),
    { code: "analysis_empty", status: 422 },
  );
  assert.equal((await analyses.get({ tenantId, sessionId })).id, before.id);
  assert.equal((await nights.read({ tenantId, sessionId })).steps.length, 4);

  // The import's report: its steps take the origin `import`, and replace
  // the analysis' untouched ones.
  await analyses.create({
    tenantId,
    userId,
    sessionId,
    report: importedReport(),
  });
  ({ steps } = await nights.read({ tenantId, sessionId }));
  assert.deepEqual(steps.map((step) => step.origin).sort(), [
    "analysis",
    "import",
    "import",
    "manual",
  ]);

  // DELETE: the analysis goes, the steps stay; a second DELETE is a 404.
  await analyses.remove({ tenantId, sessionId });
  await expectError(() => analyses.get({ tenantId, sessionId }), {
    code: "analysis_not_found",
    status: 404,
  });
  const after = await nights.read({ tenantId, sessionId });
  assert.equal(after.steps.length, 4);
  assert.equal(after.qualitySummary, null);
  await expectError(() => analyses.remove({ tenantId, sessionId }), {
    code: "analysis_not_found",
    status: 404,
  });
  const other = await newNight(driver);
  await expectError(
    () => analyses.remove({ tenantId: other.tenantId, sessionId }),
    { code: "session_not_found", status: 404 },
  );

  await analyses.close();
  await nights.close();
}

/**
 * Recommendation (3) applied: a new analysis honours the
 * soft-downgrade `entitlement_read_only` lock; reads are never gated.
 */
async function exerciseReadOnlyLock(driver) {
  const { tenantId, userId, sessionId } = await newNight(driver);
  const readOnlyProvider = {
    capabilitiesFor: async () => advancedCapabilities,
    writeAccessFor: async () => ({
      readOnly: true,
      reason: "subscription_expired",
    }),
  };
  const readOnly = await createSessionAnalysisService({
    driver,
    entitlementProvider: readOnlyProvider,
  });
  const advanced = await createSessionAnalysisService({
    driver,
    capabilities: advancedCapabilities,
  });
  await expectError(
    () =>
      readOnly.create({ tenantId, userId, sessionId, report: validReport() }),
    { code: "entitlement_read_only", status: 403 },
  );
  const uploaded = await advanced.create({
    tenantId,
    userId,
    sessionId,
    report: validReport(),
  });
  assert.equal(
    (await readOnly.get({ tenantId, sessionId })).id,
    uploaded.analysis.id,
  );
  await expectError(
    () =>
      readOnly.create({
        tenantId,
        userId,
        sessionId: randomUUID(),
        report: validReport(),
      }),
    { code: "entitlement_read_only", status: 403 },
  );
  await readOnly.close();
  await advanced.close();
}

async function onSqlite(name, exercise) {
  const directory = await mkdtemp(join(tmpdir(), `astro-${name}-`));
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  try {
    await applyMigrations(driver, "sqlite");
    await exercise(driver);
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
}

async function onPostgres(exercise) {
  const databaseUrl = process.env.ASTRO_PORTAL_TEST_DATABASE_URL;
  if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(databaseUrl))
    throw new Error(
      "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
    );
  const resetSchema = async () => {
    const driver = PostgresDriver.open(databaseUrl);
    try {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
    } finally {
      await driver.close();
    }
  };
  let driver;
  try {
    await resetSchema();
    driver = createDatabaseDriver({ databaseUrl });
    await applyMigrations(driver, "postgres");
    await exercise(driver);
  } finally {
    if (driver) await driver.close();
    await resetSchema();
  }
}

/**
 * A catalogue row that a
 * previous library left behind (`source_present = 0`, the curated fallback
 * `curated-…`) shares the designation of the row the service holds now
 * (`openngc-…`); a step's target hint resolves to the current one, so that
 * the capture of that target finds the night's steps.
 */
async function exerciseRetiredCatalogueRow(driver) {
  const { tenantId, userId, sessionId } = await newNight(driver);
  // The retired row comes first in every order the database may choose.
  await insertTarget(driver, `a-curated-${tenantId}`, "IC 1805", null, 0);
  await insertTarget(driver, `openngc-${tenantId}`, "IC 1805");
  const analyses = await createSessionAnalysisService({
    driver,
    capabilities: advancedCapabilities,
  });
  const nights = await createNightService({ driver });
  const report = validReport({
    acquisitionSteps: [
      {
        key: "ic1805-180",
        targetHint: "IC 1805",
        filter: "Ha",
        frameCount: 3,
        exposureSeconds: 180,
        gain: 100,
      },
    ],
    quality: [],
  });
  await analyses.create({ tenantId, userId, sessionId, report });
  const { steps } = await nights.read({ tenantId, sessionId });
  assert.deepEqual(
    steps.map((step) => step.targetId),
    [`openngc-${tenantId}`],
  );
}

const postgres = { skip: !process.env.ASTRO_PORTAL_TEST_DATABASE_URL };

test("a step's target hint resolves to the catalogue the service holds, never to a retired row on scratch SQLite", () =>
  onSqlite("session-analysis-retired", exerciseRetiredCatalogueRow));

test(
  "a step's target hint resolves to the catalogue the service holds, never to a retired row on PostgreSQL",
  postgres,
  () => onPostgres(exerciseRetiredCatalogueRow),
);

test("session analyses: analysis.logs creates, reading is open, one analysis per night on scratch SQLite", () =>
  onSqlite("session-analysis", exerciseSessionAnalysisResources));

test(
  "session analyses: analysis.logs creates, reading is open, one analysis per night on PostgreSQL",
  postgres,
  () => onPostgres(exerciseSessionAnalysisResources),
);

test("a new analysis replaces untouched steps, keeps corrected and manual ones, refuses an empty report, DELETE keeps the steps on scratch SQLite", () =>
  onSqlite("session-analysis-replace", exerciseReplacement));

test(
  "a new analysis replaces untouched steps, keeps corrected and manual ones, refuses an empty report, DELETE keeps the steps on PostgreSQL",
  postgres,
  () => onPostgres(exerciseReplacement),
);

test("session analyses honour the entitlement_read_only lock on scratch SQLite", () =>
  onSqlite("session-analysis-ro", exerciseReadOnlyLock));

/**
 * The report v3 (w61): accepted beside the v2 already stored; its trace
 * checked (in order, at most one point per interval, `out ≤ n`); refused
 * above 2 MB; the night's read serves its trace, its frames and the RMS it
 * gives, and a stored v2 keeps being served (its trace rebuilt).
 */
async function exerciseReportV3(driver) {
  const { tenantId, userId, sessionId } = await newNight(driver);
  const advanced = await createSessionAnalysisService({
    driver,
    capabilities: advancedCapabilities,
  });
  const nights = await createNightService({ driver });

  // A v2 already stored is served, its trace rebuilt from its samples.
  await advanced.create({ tenantId, userId, sessionId, report: validReport() });
  const fromV2 = await nights.read({ tenantId, sessionId });
  assert.ok(fromV2.guidingTrace.points.length > 0);
  assert.equal(fromV2.guidingTrace.points[0].raPulseMs, null);
  assert.equal(fromV2.posesSummary.rejectedKnown, false);

  const created = await advanced.create({
    tenantId,
    userId,
    sessionId,
    report: nightReportV3(),
  });
  assert.equal(created.analysis.reportVersion, 3);
  assert.equal(created.replaced, true);
  const read = await nights.read({ tenantId, sessionId });
  assert.equal(read.guidingSummary.rmsTotalArcsec, 1);
  assert.equal(read.guidingSummary.guideScaleArcsecPerPx, 6.88);
  assert.equal(read.guidingTrace.points.length, 4);
  assert.equal(read.guidingTrace.points[0].raPulseMs, 120);
  assert.equal(read.posesSummary.rejected, 2);
  assert.deepEqual(read.zone, { timeZone: null, utcOffsetMinutes: null });

  // Two points in one window: refused, the analysis in place is kept.
  const crowded = nightReportV3();
  crowded.guidingTrace.points[1].t = 5;
  await expectError(
    () => advanced.create({ tenantId, userId, sessionId, report: crowded }),
    { code: "invalid_request", status: 400 },
  );
  // More out of the statistics than samples: refused.
  const odd = nightReportV3();
  odd.guidingTrace.points[0].out = 9;
  await expectError(
    () => advanced.create({ tenantId, userId, sessionId, report: odd }),
    { code: "invalid_request", status: 400 },
  );
  // An interval under 10 s: refused by the contract.
  const dense = nightReportV3();
  dense.guidingTrace.intervalSeconds = 1;
  await expectError(
    () => advanced.create({ tenantId, userId, sessionId, report: dense }),
    { code: "invalid_request", status: 400 },
  );
  // Over 2 MB (a trace of 20 000 points is 2.2 MB): too large.
  const huge = nightReportV3();
  huge.guidingTrace.points = Array.from({ length: 20_000 }, (_, i) => ({
    t: i * 10,
    n: 3,
    out: 0,
    ra: 0.123,
    dec: -0.456,
    raPeak: 0.789,
    decPeak: -0.987,
    raPulseMs: 1234,
    decPulseMs: -567,
  }));
  await expectError(
    () => advanced.create({ tenantId, userId, sessionId, report: huge }),
    { code: "analysis_too_large", status: 413 },
  );
  // More than 20 000 points: refused by the contract.
  huge.guidingTrace.points.push({ ...huge.guidingTrace.points[0], t: 200_000 });
  await expectError(
    () => advanced.create({ tenantId, userId, sessionId, report: huge }),
    { code: "invalid_request", status: 400 },
  );
  const kept = await advanced.get({ tenantId, sessionId });
  assert.equal(kept.id, created.analysis.id, "the analysis in place is kept");
}

test("the report v3 is accepted beside the v2, its trace checked, its size bounded, its summaries served on scratch SQLite", () =>
  onSqlite("session-analysis-v3", exerciseReportV3));
