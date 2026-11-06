import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteDriver } from "portal/persistence/sqlite-driver.js";
import {
  createTargetCatalogueRepository,
  targetCatalogueRepository,
} from "./target-library-database.server.js";
import { TEXTS_SCHEMA } from "portal/persistence/reimported-data.js";

// The database the catalogue is read from: the service's own
// (`ASTRO_PORTAL_DATABASE_PATH` or `ASTRO_PORTAL_DATABASE_URL`), else a
// SQLite database of this process alone, in a temporary folder removed when
// the process exits — a tool that reads the catalogue without a database
// (the offline-pack builder) or a development run. The catalogue is never
// held in memory either way, and both paths are the same code. The private
// database answers what the catalogue answered from the files before (its
// raw mode): the source's records as they are, without the normalization and
// the default curation an instance's own database applies (a package
// exported from an instance carries both already).

let privateStore = null;

export async function targetCatalogueStore() {
  const configured = await targetCatalogueRepository();
  if (configured) return configured;
  privateStore ??= (async () => {
    const directory = mkdtempSync(join(tmpdir(), "astro-portal-catalogue-"));
    process.once("exit", () => {
      rmSync(directory, { recursive: true, force: true });
    });
    const driver = SqliteDriver.open(join(directory, "catalogue.sqlite"));
    // A scratch database: nothing to keep across a crash, so no journal and
    // no wait for the disk (the schema's ninety migrations took 2.6 s with
    // them on a laptop).
    // The catalogue texts' attached file is as disposable.
    for (const schema of ["main", TEXTS_SCHEMA]) {
      await driver.run(`PRAGMA ${schema}.journal_mode = OFF`);
      await driver.run(`PRAGMA ${schema}.synchronous = OFF`);
    }
    return await createTargetCatalogueRepository({
      driver,
      dialect: "sqlite",
      // As without a database before: the targets, their images, flags and
      // order as the source files give them (`raw`), nothing curated.
      curate: false,
      raw: true,
    });
  })();
  return privateStore;
}
