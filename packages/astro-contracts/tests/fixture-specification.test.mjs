import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadFixtureSpecification } from "../tools/fixture-specification.mjs";

async function withDirectory(files, action) {
  const directory = await mkdtemp(join(tmpdir(), "fixture-specification-"));
  try {
    for (const [name, content] of Object.entries(files))
      await writeFile(join(directory, name), JSON.stringify(content));
    return await action(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("the specification entries come back in the order of their file names", () =>
  withDirectory(
    {
      "b-module.json": { module: "b-module", export: "b", cases: [] },
      "a-module.json": { module: "a-module", export: "a", cases: [] },
      "README.md": "ignored",
    },
    async (directory) => {
      const entries = await loadFixtureSpecification(directory);
      assert.deepEqual(
        entries.map((entry) => entry.module),
        ["a-module", "b-module"],
      );
    },
  ));

test("a specification file must hold one object whose module is its file name", async () => {
  await withDirectory(
    { "one.json": { module: "other", export: "f", cases: [] } },
    (directory) =>
      assert.rejects(
        loadFixtureSpecification(directory),
        /must specify the module "one"/,
      ),
  );
  await withDirectory({ "one.json": [{ module: "one" }] }, (directory) =>
    assert.rejects(loadFixtureSpecification(directory), /one JSON object/),
  );
});

test("an empty specification directory is refused", () =>
  withDirectory({}, (directory) =>
    assert.rejects(
      loadFixtureSpecification(directory),
      /No fixture specification file/,
    ),
  ));

test("the committed specification is one file per module, none of them the old combined file", async () => {
  const fixtures = fileURLToPath(new URL("../fixtures/", import.meta.url));
  const entries = await loadFixtureSpecification(join(fixtures, "spec"));
  assert.ok(entries.length > 0);
  assert.equal((await readdir(fixtures)).includes("fixtures-spec.json"), false);
  const specNames = (await readdir(join(fixtures, "spec"))).sort();
  assert.deepEqual(
    specNames,
    entries.map((entry) => `${entry.module}.json`),
  );
  assert.ok(
    (await readFile(join(fixtures, "README.md"), "utf8")).includes("spec/"),
  );
});
