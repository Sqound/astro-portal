// Reads a fixture specification kept as one file per fixture module.
//
// A specification directory (`fixtures/spec/`) holds one `<module>.json` file
// per fixture module, each the single entry `{ module, export, cases, … }` of
// that module. Adding a module adds one file and edits none, so two changes
// that each add a module never touch the same file. The generators and the
// replay tests read the directory through this reader.
//
// The entries come back in the order of their file names, which is stable.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * @param {string} directory Absolute path of the specification directory.
 * @returns {Promise<Array<Record<string, any>>>} The entries, ordered by file name.
 */
export async function loadFixtureSpecification(directory) {
  const names = (await readdir(directory))
    .filter((name) => name.endsWith(".json"))
    .sort();
  if (names.length === 0)
    throw new Error(`No fixture specification file in ${directory}.`);
  const entries = [];
  for (const name of names) {
    const entry = JSON.parse(await readFile(join(directory, name), "utf8"));
    if (!entry || Array.isArray(entry) || typeof entry !== "object")
      throw new Error(`${name} must contain one JSON object (one module).`);
    if (entry.module !== name.replace(/\.json$/, ""))
      throw new Error(
        `${name} must specify the module "${name.replace(/\.json$/, "")}", not "${entry.module}".`,
      );
    entries.push(entry);
  }
  return entries;
}
