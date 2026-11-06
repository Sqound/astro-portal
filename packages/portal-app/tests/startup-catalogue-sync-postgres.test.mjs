import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";

// Prod, 30/10/2026: after a change of the catalogue's source revision (+180
// rows and the IAU keys of 17,388 targets), the first read of the catalogue on
// PostgreSQL ran more than two minutes, one round trip after the other. The
// service now resynchronizes before it says it is ready
// (`warmTargetCatalogue`, called by server/start.js), writes only what
// differs, hands the event loop back between slices, and tells each step's
// duration. This test runs the real thing on a catalogue of 17,388 targets
// (≈ 25 s for the first fill and ≈ 15 s for the resynchronization on a local
// PostgreSQL; slow, but run). Skipped without ASTRO_PORTAL_TEST_DATABASE_URL
// (a throwaway astro_test_<name> database).

const databaseUrl = process.env.ASTRO_PORTAL_TEST_DATABASE_URL;
const ROWS = 17_388;
const SLOW = { timeout: 600_000 };

if (!databaseUrl) {
  test(
    "the catalogue's resynchronization at start, 17,388 targets on PostgreSQL",
    {
      skip: "ASTRO_PORTAL_TEST_DATABASE_URL is not set",
    },
    () => {},
  );
} else {
  if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(databaseUrl))
    throw new Error(
      "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
    );
  const root = mkdtempSync(join(tmpdir(), "astro-startup-sync-"));
  for (const key of Object.keys(process.env))
    if (
      key.startsWith("ASTRO_PORTAL_") &&
      key !== "ASTRO_PORTAL_TEST_DATABASE_URL"
    )
      delete process.env[key];
  Object.assign(process.env, {
    ASTRO_PORTAL_DATABASE_URL: databaseUrl,
    ASTRO_PORTAL_RUNTIME_DIR: join(root, "runtime"),
    ASTRO_PORTAL_STATIC_DATA_DIR: join(root, "static-data"),
  });
  mkdirSync(join(root, "static-data", "target-library"), { recursive: true });
  const seed = join(root, "static-data", "target-library", "catalogue.json");

  const catalogues = ["NGC", "IC", "HR", "HIP"];
  const types = [
    "Galaxie",
    "Amas ouvert",
    "Nébuleuse",
    "Étoile",
    "Amas globulaire",
  ];
  const writeSeed = (rows, modified = null) => {
    const entries = [];
    for (let index = 0; index < rows; index += 1)
      entries.push({
        id: `synthetic-${String(index).padStart(6, "0")}`,
        designation: `${catalogues[index % 4]} ${1000 + index}`,
        aliases: [`Syn ${index}`, `Alias ${index * 3}`],
        commonNames: index % 7 === 0 ? [`Common ${index}`] : [],
        typeKey: types[index % types.length],
        constellationKey: ["Andromède", "Orion", "Lyre", "Cygne"][index % 4],
        coordinate: {
          ra: (index * 0.0137) % 24,
          dec: ((index * 0.0531) % 170) - 85,
        },
        apparentSizeArcmin: [1 + (index % 40), 1 + (index % 20)],
        magnitude: 4 + (index % 100) / 10,
        catalogues: [catalogues[index % 4]],
        catalogue: catalogues[index % 4],
        visibleFromNorthernHemisphere: true,
        visibleFromSouthernHemisphere: index % 3 !== 0,
      });
    writeFileSync(
      seed,
      JSON.stringify({
        schemaVersion: 1,
        exportedAt: "2026-10-30T00:00:00.000Z",
        source: "Synthetic test catalogue",
        entries,
      }),
    );
    if (modified) utimesSync(seed, modified, modified);
  };

  // The longest time the event loop went without running a timer, which is
  // what a probe's answer waits for.
  let longestBlock = 0;
  let lastTick = performance.now();
  const sampler = setInterval(() => {
    const now = performance.now();
    longestBlock = Math.max(longestBlock, now - lastTick - 10);
    lastTick = now;
  }, 10);
  const watched = async (work) => {
    longestBlock = 0;
    lastTick = performance.now();
    const started = performance.now();
    const result = await work();
    return {
      result,
      ms: performance.now() - started,
      longestBlock,
    };
  };

  let library;
  let catalogue;
  let PostgresDriver;
  const resetPostgres = async () => {
    const reset = PostgresDriver.open(databaseUrl);
    try {
      await reset.run("DROP SCHEMA public CASCADE");
      await reset.run("CREATE SCHEMA public");
    } finally {
      await reset.close();
    }
  };
  before(async () => {
    ({ PostgresDriver } =
      await import("portal/persistence/postgres-driver.js"));
    await resetPostgres();
    // The service migrates before it warms up (portal/persistence).
    const { databaseDriver } = await import("portal/persistence/database.js");
    const { applyMigrations } =
      await import("portal/persistence/migration-runner.js");
    await applyMigrations(databaseDriver(), "postgres");
    library = await import("../dist/lib/target-library.server.js");
    catalogue = await import("../dist/lib/catalog.server.js");
  });
  after(async () => {
    clearInterval(sampler);
    const { stopPostgresBridge } = await import("portal/api/change-bus.js");
    await stopPostgresBridge?.();
    await resetPostgres();
    rmSync(root, { recursive: true, force: true });
  });

  const collect = () => {
    const lines = [];
    return {
      lines,
      log: (event, message, context) => lines.push({ event, message, context }),
    };
  };

  test(
    "a new database: the catalogue is written, loaded and checked, each step timed, the event loop never held",
    SLOW,
    async () => {
      writeSeed(ROWS - 180);
      const said = collect();
      const {
        result,
        ms,
        longestBlock: block,
      } = await watched(() => library.warmTargetCatalogue({ log: said.log }));
      assert.equal(result.resynchronized, true);
      // The media check is begun, not waited for: it ends in the background
      // (`mediaChecked`), which is what keeps 80 s of folders read from a
      // network share out of the time before ready.
      assert.deepEqual(
        result.steps.map((step) => step.name),
        ["resync", "load"],
      );
      assert.deepEqual(said.lines.map((line) => line.event).slice(0, 5), [
        "catalogue.sync.start",
        "catalogue.sync.done",
        "catalogue.load.start",
        "catalogue.load.done",
        "catalogue.media.start",
      ]);
      const media = await result.mediaChecked;
      assert.equal(media.name, "media");
      assert.equal(said.lines.at(-1).event, "catalogue.media.done");
      assert.match(
        said.lines.at(-1).message,
        /^The media check took \d+ ms\.$/,
      );
      assert.match(said.lines[0].message, /New database/);
      assert.match(
        said.lines[1].message,
        /^The catalogue was resynchronized with its source in \d+ ms\.$/,
      );
      assert.equal(said.lines[1].context.step, "resync");
      assert.equal(
        said.lines[1].context.durationMs,
        result.steps[0].durationMs,
      );
      const counted = await library.targetLibrarySearch({
        locale: "en",
        limit: 1,
      });
      assert.ok(counted.total >= ROWS - 180, `${counted.total} targets`);
      console.log(
        `# new database: ${Math.round(ms)} ms (${result.steps.map((step) => `${step.name} ${step.durationMs} ms`).join(", ")}), longest event-loop block ${Math.round(block)} ms`,
      );
      assert.ok(
        block < 1_000,
        `the event loop was held ${Math.round(block)} ms`,
      );
    },
  );

  test(
    "a changed source revision (+180 targets): resynchronized, then every route read is fast",
    SLOW,
    async () => {
      writeSeed(ROWS, new Date(Date.now() + 3_600_000));
      const said = collect();
      const {
        result,
        ms,
        longestBlock: block,
      } = await watched(() => library.warmTargetCatalogue({ log: said.log }));
      assert.equal(result.resynchronized, true);
      assert.match(
        said.lines[0].message,
        /Checking the catalogue against its source/,
      );
      assert.match(
        said.lines[1].message,
        /^The catalogue was resynchronized with its source in \d+ ms\.$/,
      );
      console.log(
        `# resynchronization of ${ROWS} targets: ${Math.round(ms)} ms (${result.steps.map((step) => `${step.name} ${step.durationMs} ms`).join(", ")}), longest event-loop block ${Math.round(block)} ms`,
      );
      assert.ok(
        block < 1_000,
        `the event loop was held ${Math.round(block)} ms`,
      );
      const counted = await library.targetLibrarySearch({
        locale: "en",
        limit: 1,
      });
      assert.ok(counted.total >= ROWS, `${counted.total} targets`);

      // What the routes read once ready: warm, so fast.
      const reads = {
        "planner-targets": () =>
          library.plannerTargetCandidates({
            locale: "en",
            latitude: "",
            minimumAltitude: "30",
            selection: "best",
          }),
        "catalog (all, summary)": () => catalogue.catalog({}),
        "target-library (featured)": () =>
          library.targetLibrarySearch({
            locale: "en",
            featured: true,
            limit: 96,
          }),
      };
      for (const [name, read] of Object.entries(reads)) {
        const { ms: readMs } = await watched(read);
        console.log(`# ${name}: ${Math.round(readMs)} ms`);
        assert.ok(readMs < 2_000, `${name} took ${Math.round(readMs)} ms`);
      }
    },
  );

  test(
    "the same revision again: nothing to resynchronize, and it says so",
    SLOW,
    async () => {
      const said = collect();
      const { result, ms } = await watched(() =>
        library.warmTargetCatalogue({ log: said.log }),
      );
      assert.equal(result.resynchronized, false);
      assert.match(
        said.lines[1].message,
        /^The catalogue already matches its source \(\d+ ms\)\.$/,
      );
      assert.ok(ms < 10_000, `${Math.round(ms)} ms`);
    },
  );
}
