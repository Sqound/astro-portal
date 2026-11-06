/**
 * Technical ceilings per space for the tables that had none: with open
 * sign-up, one space must not be able to fill the service. They are far
 * above any real use — a night a day for decades, hundreds of field notes a
 * night — and are not a product limit: capabilities (`sync.plan_limit`,
 * `storage.*`) stay the only quotas. Each is
 * settable by an environment variable; an unset or invalid value keeps the
 * default.
 */
export const SPACE_LIMITS = Object.freeze({
  sessionsPerSpace: {
    setting: "ASTRO_PORTAL_MAX_SESSIONS_PER_SPACE",
    fallback: 10_000,
  },
  eventsPerSession: {
    setting: "ASTRO_PORTAL_MAX_EVENTS_PER_SESSION",
    fallback: 10_000,
  },
  supplementsPerSession: {
    setting: "ASTRO_PORTAL_MAX_SUPPLEMENTS_PER_SESSION",
    fallback: 200,
  },
  devicesPerSpace: {
    setting: "ASTRO_PORTAL_MAX_DEVICES_PER_SPACE",
    fallback: 50,
  },
});

/** The ceiling in force, read at each use so an operator's setting applies. */
export function spaceLimit(name, env = process.env) {
  const limit = SPACE_LIMITS[name];
  if (!limit) throw new Error(`Unknown space limit ${name}.`);
  const value = Number(env[limit.setting]);
  return Number.isInteger(value) && value > 0 ? value : limit.fallback;
}

/** `COUNT(*)` of a query, as a number, on both drivers. */
export async function countOf(executor, sql, params) {
  return Number((await executor.query(sql, params)).rows[0]?.count || 0);
}

/**
 * The technical ceiling on a space's active devices, checked in the
 * transaction that would add one: every application counts (PlanAstro,
 * Astro Sync, a paired phone), revoking a device makes room again. An
 * installation the space already knows is never refused by it — its caller
 * simply does not ask.
 */
export async function assertDeviceRoom(executor, tenantId) {
  const deviceLimit = spaceLimit("devicesPerSpace");
  if (
    (await countOf(
      executor,
      "SELECT COUNT(*) AS count FROM device_tokens WHERE tenant_id = ? AND revoked_at IS NULL",
      [tenantId],
    )) >= deviceLimit
  )
    throw Object.assign(
      new Error(
        `This space already has ${deviceLimit} devices: remove one before adding another.`,
      ),
      { code: "device_limit_reached", status: 409 },
    );
}
