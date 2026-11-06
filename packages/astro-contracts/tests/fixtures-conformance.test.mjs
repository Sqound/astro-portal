import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { loadFixtureSpecification } from "../tools/fixture-specification.mjs";

// Floating-point results may differ in their last binary digits between
// platforms and Node.js versions (observed on the sky-quality fixtures), so
// numbers are
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

// The authoritative conformance check for every fixture this package ships,
// astro-core-sourced and portal-sourced alike.
// packages/astro-core/tests/fixtures-conformance.test.mjs
// separately replays only its own entries against its own dist output.
const fixturesDirectory = new URL("../fixtures/", import.meta.url);
const repositoryRoot = new URL("../../../", import.meta.url);
const specification = await loadFixtureSpecification(
  fileURLToPath(new URL("spec/", fixturesDirectory)),
);

for (const entry of specification) {
  test(`${entry.module} conforms to recorded fixtures`, async () => {
    const fixture = JSON.parse(
      await readFile(
        new URL(`${entry.module}.json`, fixturesDirectory),
        "utf8",
      ),
    );
    const packageName = entry.package || "astro-core";
    const relativeModule = entry.file || entry.module;
    const modulePath = fileURLToPath(
      new URL(
        `packages/${packageName}/dist/${relativeModule}.js`,
        repositoryRoot,
      ),
    );
    const module = await import(pathToFileURL(modulePath).href);
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

test("every fixture specification names an existing package", async () => {
  for (const entry of specification)
    assert.ok(
      ["astro-core", "portal", "astro-contracts", "planner"].includes(
        entry.package || "astro-core",
      ),
      `${entry.module} names an unknown package "${entry.package}"`,
    );
});
