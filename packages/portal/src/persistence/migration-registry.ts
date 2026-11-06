import {
  migrations as coreMigrations,
  statementsFor,
  type Migration,
  type MigrationStatements,
} from "./migrations.js";

/**
 * The migrations a composition adds to the core's chain.
 *
 * The core (`migrations.ts`) is one chain of numbered versions. A composition
 * that keeps tables of its own registers the versions that create them, under
 * the numbers they were first applied with, so that a database that already
 * ran them is still a database this code knows (the runner compares version
 * numbers only, and refuses a database that records an unknown one).
 *
 * A registration is a list of entries of one of two forms:
 *
 * - a **whole migration**: a `Migration` whose version the core does not use;
 * - a **complement**: `{ complements, statements }`, the statements of which
 *   run after those of the core's version `complements`, in the same
 *   transaction and under the same number and name. It lets the core keep the
 *   part of a migration it needs while the composition keeps the rest.
 *
 * Any other duplicate (a version twice in one registration or across
 * sources, a version registered whole that the core has, two complements of
 * one version, a complement of a version the core does not have or of a
 * version registered whole) is refused at registration, and nothing is kept.
 *
 * The registry lives on `globalThis` under a registered symbol, as the
 * service extensions do: Next.js loads a module once per compilation layer,
 * and `server.mjs` loads its own copy, so a module-level map would be empty
 * in the other copies.
 */
export type MigrationComplement = {
  /** The core version whose transaction these statements join. */
  complements: number;
  statements: MigrationStatements;
  /** Like `Migration`, for a complement that rebuilds a referenced table. */
  sqliteRebuildsReferencedTable?: boolean;
};

export type RegisteredMigration = Migration | MigrationComplement;

type Registry = Map<string, readonly RegisteredMigration[]>;

const registryKey = Symbol.for("astro-portal.migration-registry");

function registry(): Registry {
  const holder = globalThis as Record<symbol, unknown>;
  if (!(holder[registryKey] instanceof Map)) holder[registryKey] = new Map();
  return holder[registryKey] as Registry;
}

function isComplement(
  entry: RegisteredMigration,
): entry is MigrationComplement {
  return "complements" in entry;
}

function checkVersion(version: unknown, label: string): number {
  if (!Number.isInteger(version) || (version as number) < 1)
    throw new Error(
      `Migration registry: ${label} must be a positive integer, got ${String(version)}.`,
    );
  return version as number;
}

function checkStatements(
  statements: MigrationStatements | undefined,
  label: string,
): MigrationStatements {
  if (
    !statements ||
    !(
      statements.common?.trim() ||
      statements.sqlite?.trim() ||
      statements.postgres?.trim()
    )
  )
    throw new Error(`Migration registry: ${label} has no statement.`);
  return statements;
}

function joinedStatements(
  core: Migration,
  complement: MigrationComplement,
): MigrationStatements {
  // `statementsFor` picks the dialect's statements, else the common ones: the
  // composed migration spells out both dialects so that the core's part is
  // followed by the complement's whichever of them each one wrote.
  const joined: MigrationStatements = {};
  for (const dialect of ["sqlite", "postgres"] as const)
    joined[dialect] = [
      ...statementsFor(core, dialect),
      ...statementsFor(
        {
          name: core.name,
          version: core.version,
          statements: complement.statements,
        },
        dialect,
      ),
    ].join(";\n");
  return joined;
}

/**
 * The core's chain with `sources` composed into it, sorted by version.
 * Throws on any admission failure.
 */
function compose(sources: Registry): readonly Migration[] {
  const core = new Map(coreMigrations.map((entry) => [entry.version, entry]));
  const whole = new Map<number, { source: string; entry: Migration }>();
  const complements = new Map<
    number,
    { source: string; entry: MigrationComplement }
  >();
  for (const [source, entries] of sources) {
    for (const entry of entries) {
      if (isComplement(entry)) {
        const version = entry.complements;
        const taken = complements.get(version);
        if (taken)
          throw new Error(
            `Migration registry: version ${version} is complemented by "${source}" and by "${taken.source}".`,
          );
        complements.set(version, { source, entry });
      } else {
        const version = entry.version;
        if (core.has(version))
          throw new Error(
            `Migration registry: "${source}" registers version ${version}, which the core already has (register a complement instead).`,
          );
        const taken = whole.get(version);
        if (taken)
          throw new Error(
            `Migration registry: version ${version} is registered by "${source}" and by "${taken.source}".`,
          );
        whole.set(version, { source, entry });
      }
    }
  }
  for (const [version, { source }] of complements) {
    if (!core.has(version))
      throw new Error(
        `Migration registry: "${source}" complements version ${version}, which is not a version of the core.`,
      );
  }
  if (!whole.size && !complements.size) return coreMigrations;
  const composed: Migration[] = coreMigrations.map((entry) => {
    const complement = complements.get(entry.version)?.entry;
    if (!complement) return entry;
    const rebuild =
      entry.sqliteRebuildsReferencedTable === true ||
      complement.sqliteRebuildsReferencedTable === true;
    return {
      name: entry.name,
      version: entry.version,
      statements: joinedStatements(entry, complement),
      ...(rebuild ? { sqliteRebuildsReferencedTable: true } : {}),
    };
  });
  for (const { entry } of whole.values()) composed.push(entry);
  return composed.sort((left, right) => left.version - right.version);
}

/**
 * Registers the migrations of `source` (a stable name, such as the package
 * of the composition). Registering a source again replaces its entries, so a
 * module loaded twice is harmless. Throws, and keeps the previous
 * registration, when the result would not be an admissible chain.
 */
export function registerMigrations(
  source: string,
  list: readonly RegisteredMigration[],
): void {
  if (typeof source !== "string" || !source.trim())
    throw new Error("Migration registry: the source needs a name.");
  const seen = new Set<string>();
  for (const entry of list) {
    if (isComplement(entry)) {
      const version = checkVersion(entry.complements, "`complements`");
      checkStatements(entry.statements, `the complement of ${version}`);
      const key = `complement:${version}`;
      if (seen.has(key))
        throw new Error(
          `Migration registry: "${source}" complements version ${version} twice.`,
        );
      seen.add(key);
    } else {
      const version = checkVersion(entry.version, "a version");
      if (!entry.name?.trim())
        throw new Error(`Migration registry: version ${version} has no name.`);
      checkStatements(entry.statements, `version ${version}`);
      const key = `whole:${version}`;
      if (seen.has(key))
        throw new Error(
          `Migration registry: "${source}" registers version ${version} twice.`,
        );
      seen.add(key);
    }
  }
  const next: Registry = new Map(registry());
  next.set(source, [...list]);
  compose(next); // validates
  registry().set(source, [...list]);
}

/** Forgets what `source` registered (tests, and a composition torn down). */
export function unregisterMigrations(source: string): void {
  registry().delete(source);
}

/** The names of the sources that registered migrations. */
export function registeredMigrationSources(): string[] {
  return [...registry().keys()].sort();
}

/**
 * The chain the runner applies by default: the core's migrations, the
 * registered ones and the complements composed in, sorted by version. With
 * nothing registered it is the core's own list.
 */
export function composedMigrations(): readonly Migration[] {
  const sources = registry();
  return sources.size ? compose(sources) : coreMigrations;
}
