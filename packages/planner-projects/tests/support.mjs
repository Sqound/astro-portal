import { randomUUID } from "node:crypto";
import { OPEN_SOURCE_PROFILE } from "portal/capabilities/profiles.js";
import { subscribe } from "portal/api/change-bus.js";
import { persistenceTest } from "../../../tests/helpers/persistence-backends.mjs";
import { createProjectService } from "../dist/handlers.js";

// What the tests of the projects service share: a fresh, fully migrated
// SQLite and PostgreSQL per scenario, two spaces, an entitlement provider
// whose capabilities and read-only window each test sets, and the change
// signals the service publishes.

export const AT = "2026-09-19T08:12:00.000Z";

export async function seedSpace(driver, label) {
  const tenantId = randomUUID();
  const userId = randomUUID();
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    [tenantId, label, AT],
  );
  await driver.run(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
    [userId, `${userId}@example.test`, "test-only", AT],
  );
  await driver.run(
    "INSERT INTO memberships (id, tenant_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)",
    [randomUUID(), tenantId, userId, AT],
  );
  return { tenantId, userId };
}

/** The entitlements of each person: `planner.mosaic` granted unless said. */
export function rights() {
  const withheld = new Set();
  const readOnly = new Set();
  const oneTime = new Set();
  return {
    withhold: (userId) => withheld.add(userId),
    endSubscription: (userId) => readOnly.add(userId),
    // « Planification avancée » bought once: it outlives the subscription
    // (`WriteAccess.oneTimeCapabilities`, set by the provider).
    holdOneTime: (userId) => oneTime.add(userId),
    provider: {
      capabilitiesFor: async (userId) => ({
        ...OPEN_SOURCE_PROFILE,
        "planner.mosaic": !withheld.has(userId),
      }),
      writeAccessFor: async (userId) => ({
        readOnly: readOnly.has(userId),
        ...(readOnly.has(userId) && oneTime.has(userId)
          ? { oneTimeCapabilities: ["planner.mosaic"] }
          : {}),
      }),
    },
  };
}

export const projectBody = (overrides = {}) => ({
  target: {
    targetId: "ngc7000",
    name: "NGC 7000",
    commonName: "Nébuleuse de l’Amérique du Nord",
  },
  goalMinutes: 720,
  place: {
    name: "Col des Mélèzes",
    latitude: 45,
    longitude: -30,
    timeZone: "UTC",
  },
  equipment: { telescopeId: "lunette-72", cameraId: "couleur" },
  constraints: {
    minAltitude: 30,
    moonSeparationMinimum: 25,
    moonSeparationMinimumByFilter: { "Ha/OIII": 15 },
  },
  ...overrides,
});

/**
 * One scenario on SQLite and PostgreSQL: `{ driver, service, rights, a, b,
 * changes(tenantId) }`, `a` and `b` two spaces.
 */
export function projectTest(name, scenario) {
  persistenceTest(name, async ({ open }) => {
    const backend = await open();
    const unsubscribers = [];
    try {
      const access = rights();
      let clock = Date.parse(AT);
      const service = await createProjectService({
        driver: backend.driver,
        dialect: backend.dialect,
        entitlementProvider: access.provider,
        now: () => new Date((clock += 60_000)).toISOString(),
      });
      const a = await seedSpace(backend.driver, "Space A");
      const b = await seedSpace(backend.driver, "Space B");
      const changes = (tenantId) => {
        const events = [];
        unsubscribers.push(subscribe(tenantId, (event) => events.push(event)));
        return events;
      };
      await scenario({
        driver: backend.driver,
        dialect: backend.dialect,
        service,
        rights: access,
        a,
        b,
        changes,
      });
    } finally {
      for (const unsubscribe of unsubscribers) unsubscribe();
      await backend.close();
    }
  });
}

/** Awaits a refusal and returns its error, checked against code and status. */
export async function refused(promise, code, status) {
  try {
    await promise;
  } catch (error) {
    if (error?.code !== code || error?.status !== status)
      throw new Error(
        `Expected ${status} ${code}, got ${error?.status} ${error?.code}: ${error?.message}`,
      );
    return error;
  }
  throw new Error(`Expected ${status} ${code}, but the call succeeded.`);
}
