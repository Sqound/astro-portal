import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadFixtureSpecification } from "../../astro-contracts/tools/fixture-specification.mjs";

// Floating-point results may differ in their last binary digits between
// platforms and Node.js versions (observed on 2026-09-25: Linux/Node 22 in CI
// against macOS/Node 24 locally, on the sky-quality fixtures), so numbers are
// compared with a relative tolerance while everything else stays strict.
const RELATIVE_TOLERANCE = 1e-9;
function assertDeepClose(actual, expected, path = "$") {
  if (typeof expected === "number" && typeof actual === "number") {
    if (Object.is(actual, expected)) return;
    const scale = Math.max(1, Math.abs(actual), Math.abs(expected));
    assert.ok(
      Number.isFinite(actual) &&
        Number.isFinite(expected) &&
        Math.abs(actual - expected) <= RELATIVE_TOLERANCE * scale,
      `${path}: ${actual} differs from the recorded ${expected}`,
    );
    return;
  }
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${path}: expected an array`);
    assert.equal(actual.length, expected.length, `${path}: array length`);
    expected.forEach((item, index) =>
      assertDeepClose(actual[index], item, `${path}[${index}]`),
    );
    return;
  }
  if (expected && typeof expected === "object") {
    assert.ok(
      actual && typeof actual === "object" && !Array.isArray(actual),
      `${path}: expected an object`,
    );
    assert.deepEqual(
      Object.keys(actual).sort(),
      Object.keys(expected).sort(),
      `${path}: object keys`,
    );
    for (const key of Object.keys(expected))
      assertDeepClose(actual[key], expected[key], `${path}.${key}`);
    return;
  }
  assert.deepEqual(actual, expected, path);
}

const fixturesDirectory = new URL(
  "../../astro-contracts/fixtures/",
  import.meta.url,
);
const specification = await loadFixtureSpecification(
  fileURLToPath(new URL("spec/", fixturesDirectory)),
);

// Fixtures may also be generated from the "portal" package; this suite only
// replays this package's own dist output, so it defers those entries to
// packages/astro-contracts/tests/fixtures-conformance.test.mjs, which
// dispatches every entry to its recorded source package.
const ownEntries = specification.filter(
  (entry) => (entry.package || "astro-core") === "astro-core",
);

for (const entry of ownEntries) {
  test(`${entry.module} conforms to recorded fixtures`, async () => {
    const fixture = JSON.parse(
      await readFile(
        new URL(`${entry.module}.json`, fixturesDirectory),
        "utf8",
      ),
    );
    // `file` names the source module when it differs from the fixture id
    // (several fixtures of one module, as for night-window), exactly as the
    // generator resolves it.
    const module = await import(`../dist/${entry.file || entry.module}.js`);
    const implementation = module[entry.export];

    assert.equal(typeof implementation, "function");
    assertDeepClose(
      fixture.cases.map(({ id, args }) => ({
        id,
        args,
        result: implementation(...args),
      })),
      fixture.cases,
    );
  });
}

// A recorded fixture is a case list a spec entry generates. `sky-quality-tile`
// is a data asset instead — a few-degree cut of the prepared VIIRS raster
// that sampling tests read — so it has no spec entry and no generating export.
//
// `planner-candidate-score` is a case list, but its reference is the portal's
// own target-library ranking rather than an astro-core export, so it has no
// spec entry either.
//
// `journal-sessions` is written by hand (fixtures/README.md): the
// Journal's list for each filter and page, read by `journal-reference.mjs`
// (`packages/astro-contracts/tests/journal.test.mjs`), with no astro-core
// export behind it.
//
// `journal-exchange-<name>` are the Journal's recorded exchanges: what the
// service answered to the request `journal-exchange-spec/<name>.json` names.
// They have a specification of their own, not an entry of `spec/` (nothing
// here replays them).
const dataFixtures = new Set([
  "sky-quality-tile",
  // `integrations-put-bodies` is written by hand: the bodies of
  // PUT /v1/projects/{projectId}/integrations (with and without `replace`),
  // read by `packages/astro-contracts/tests/integrations.test.mjs`.
  "integrations-put-bodies",
  "planner-candidate-score",
  "journal-sessions",
]);
const isJournalExchange = (module) => module.startsWith("journal-exchange-");
// `captures-exchange-<name>` are the recorded exchanges of a capture written
// by two hands, the same mechanism and the same family:
// `captures-exchange-spec/<name>.json`.
const isCapturesExchange = (module) => module.startsWith("captures-exchange-");

test("every recorded fixture has a specification", async () => {
  const files = await readdir(fixturesDirectory);
  const fixtureModules = files
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/, ""))
    .filter((module) => !dataFixtures.has(module))
    .filter((module) => !isJournalExchange(module))
    .filter((module) => !isCapturesExchange(module))
    .sort();
  assert.deepEqual(
    fixtureModules,
    specification.map((entry) => entry.module).sort(),
  );
});

test("every recorded Journal exchange has its specification, and the other way round", async () => {
  const recorded = (await readdir(fixturesDirectory))
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/, ""))
    .filter(isJournalExchange)
    .map((module) => module.replace(/^journal-exchange-/, ""))
    .sort();
  const specified = (
    await readdir(new URL("journal-exchange-spec/", fixturesDirectory))
  )
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/, ""))
    .sort();
  assert.ok(recorded.length > 0);
  assert.deepEqual(recorded, specified);
});

test("every recorded exchange of a capture written by two hands has its specification, and the other way round", async () => {
  const recorded = (await readdir(fixturesDirectory))
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/, ""))
    .filter(isCapturesExchange)
    .map((module) => module.replace(/^captures-exchange-/, ""))
    .sort();
  const specified = (
    await readdir(new URL("captures-exchange-spec/", fixturesDirectory))
  )
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/, ""))
    .sort();
  assert.ok(recorded.length > 0);
  assert.deepEqual(recorded, specified);
});
