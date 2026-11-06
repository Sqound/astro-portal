// The link
// of a plan item to a multi-night plan (`planItem.projectId`) is checked by
// the service whenever a plan write makes it appear or change, with the rules
// of `POST /v1/projects/{id}/nights` (api/project-nights.js): the right
// `planner.mosaic`, the multi-night plan of the space, the target; taking the
// link away detaches. A write that leaves every `projectId` as it was is
// never checked. In the read-only window of an ended subscription only a link
// write passes, and only for a space whose right is a one-time purchase's.
// Every scenario runs on SQLite and on PostgreSQL.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPlanResourceService } from "../dist/api/plan-resources.js";
import {
  createPlanResourceRepository,
  createPlannerStateRepository,
} from "../dist/persistence/planner-state-repository.js";
import {
  addPlannerPlan,
  emptyHorizon,
  migratePlannerState,
  patchPlannerPlan,
} from "../dist/planner/state.js";
import { onBothBackends, seedSpace } from "./helpers/both-backends.mjs";

const at = "2026-09-01T00:00:00.000Z";
const FREE = {
  "planner.multiple": false,
  "planner.mosaic": false,
  "pointing.solve": false,
  "sync.plan_limit": 1,
  "gallery.private": false,
  "capture.variant_limit": 0,
  "analysis.logs": false,
  "analysis.progression": false,
  "storage.max_file_bytes": 0,
  "storage.quota_bytes": 0,
  "portal.invitations": false,
  "capture.count_limit": 3,
  "capture.public": false,
  "history.retention_days": 7,
};

/** An entitlement provider: the profile, and the read-only window if asked. */
function provider({ mosaic = false, window = null } = {}) {
  return {
    capabilitiesFor: async () => ({
      ...FREE,
      "planner.multiple": mosaic,
      "planner.mosaic": mosaic,
    }),
    ...(window
      ? {
          writeAccessFor: async () => ({
            readOnly: true,
            reason: "subscription_expired",
            ...(window === "one-time"
              ? { oneTimeCapabilities: ["planner.mosaic"] }
              : {}),
          }),
        }
      : {}),
  };
}

const serviceOf = (driver, options) =>
  createPlanResourceService({
    driver,
    dialect: driver.dialect,
    entitlementProvider: provider(options),
  });

const free = (driver) => serviceOf(driver, {});
const advanced = (driver) => serviceOf(driver, { mosaic: true });

async function insertProject(driver, tenantId, targetId) {
  const id = randomUUID();
  await driver.run(
    "INSERT INTO projects (id, tenant_id, revision, status, payload_json, created_at, updated_at) VALUES (?, ?, 1, 'active', ?, ?, ?)",
    [
      id,
      tenantId,
      JSON.stringify({
        target: { targetId, name: targetId },
        goalMinutes: 720,
        place: { name: "Col des Mélèzes", latitude: 45, longitude: 2 },
        equipment: {},
        constraints: {},
      }),
      at,
      at,
    ],
  );
  return id;
}

/** Two spaces; the first holds the Heart's multi-night plans P and Q, and M 31's R. */
async function seed(driver) {
  const tenantId = randomUUID();
  const userId = randomUUID();
  const otherTenantId = randomUUID();
  await seedSpace(driver, tenantId, userId, at);
  await seedSpace(driver, otherTenantId, null, at);
  return {
    tenantId,
    userId,
    p: await insertProject(driver, tenantId, "ic1805"),
    q: await insertProject(driver, tenantId, "ic1805"),
    r: await insertProject(driver, tenantId, "m31"),
    foreign: await insertProject(driver, otherTenantId, "ic1805"),
  };
}

const planPayload = (planId, items, name = "Nuit du Cœur") => ({
  id: `browser-${planId}`,
  date: "2026-08-09",
  name,
  location: { name: "Col", latitude: "45", longitude: "2" },
  items,
});
const heart = (extra = {}) => ({
  id: "ic1805",
  targetId: "ic1805",
  startMinute: 0,
  endMinute: 200,
  ...extra,
});
const m45 = { id: "m45", targetId: "m45", startMinute: 200, endMinute: 270 };

async function refusal(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("expected a refusal");
}

const link = (resource, id = "ic1805") =>
  resource.payload.items.find((item) => item.id === id)?.projectId ?? null;

async function storedRevision(driver, planId) {
  return Number(
    (await driver.query("SELECT revision FROM plans WHERE id = ?", [planId]))
      .rows[0].revision,
  );
}

/** The night run from the plan, with an integration of the Heart already sent. */
async function seedNight(driver, { tenantId, planId, ownLink = null, to }) {
  const nightId = randomUUID();
  await driver.run(
    "INSERT INTO observation_sessions (id, tenant_id, plan_id, started_at, status, created_at, project_id) VALUES (?, ?, ?, ?, 'finished', ?, ?)",
    [nightId, tenantId, planId, "2026-08-09T20:30:00.000Z", at, ownLink],
  );
  await driver.run(
    `INSERT INTO project_integrations (id, tenant_id, project_id, night_id, target_id, family_key, filter, exposure_seconds, frame_count, total_seconds, evening_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'ic1805', 'rgb', 'RGB', 90, 20, 1800, '2026-08-09', ?, ?)`,
    [randomUUID(), tenantId, to, nightId, at, at],
  );
  return nightId;
}

const integrationOwner = async (driver, nightId) =>
  (
    await driver.query(
      "SELECT project_id FROM project_integrations WHERE night_id = ?",
      [nightId],
    )
  ).rows[0].project_id;
const nightOwnLink = async (driver, nightId) =>
  (
    await driver.query(
      "SELECT project_id FROM observation_sessions WHERE id = ?",
      [nightId],
    )
  ).rows[0].project_id;

onBothBackends(
  "a plan write that sets a projectId is refused without « Planification avancée », and writes nothing",
  async (driver) => {
    const { tenantId, userId, p } = await seed(driver);
    const planId = randomUUID();
    const base = { tenantId, userId, planId };

    // Creation (revision 0) with a link: refused, the plan is not created.
    const created = await refusal(
      free(driver).then((service) =>
        service.write({
          ...base,
          ifMatch: 0,
          payload: planPayload(planId, [heart({ projectId: p })]),
        }),
      ),
    );
    assert.equal(created.status, 403);
    assert.equal(created.code, "multi_night_not_active");
    assert.equal(created.body.capability, "planner.mosaic");
    assert.equal(
      (await driver.query("SELECT id FROM plans WHERE id = ?", [planId])).rows
        .length,
      0,
    );

    // The plan without a link is created, then a revision links it: refused.
    const service = await free(driver);
    await service.write({
      ...base,
      ifMatch: 0,
      payload: planPayload(planId, [heart(), m45]),
    });
    const refused = await refusal(
      service.write({
        ...base,
        ifMatch: 1,
        payload: planPayload(planId, [heart({ projectId: p }), m45]),
      }),
    );
    assert.equal(refused.status, 403);
    assert.equal(refused.code, "multi_night_not_active");
    assert.equal(refused.body.capability, "planner.mosaic");
    assert.equal(refused.body.error.code, "multi_night_not_active");
    assert.equal(await storedRevision(driver, planId), 1);
    assert.equal(link(await service.get({ tenantId, planId })), null);
  },
);

onBothBackends(
  "with « Planification avancée » alone a plan write attaches, moves and detaches; the night and its integrations follow",
  async (driver) => {
    const { tenantId, userId, p, q } = await seed(driver);
    const planId = randomUUID();
    const base = { tenantId, userId, planId };
    const service = await advanced(driver);
    await service.write({
      ...base,
      ifMatch: 0,
      payload: planPayload(planId, [heart(), m45]),
    });
    // The night of the plan carries its own link to Q (a leftover) and its
    // integrations count for Q.
    const nightId = await seedNight(driver, {
      tenantId,
      planId,
      ownLink: q,
      to: q,
    });

    const attached = await service.write({
      ...base,
      ifMatch: 1,
      payload: planPayload(planId, [heart({ projectId: p }), m45]),
    });
    assert.equal(link(attached.resource), p);
    assert.equal(attached.resource.revision, 2);
    assert.equal(
      await nightOwnLink(driver, nightId),
      null,
      "one multi-night plan at most: the item's link replaces the night's own",
    );
    assert.equal(await integrationOwner(driver, nightId), p);

    // Rattacher ailleurs déplace.
    const moved = await service.write({
      ...base,
      ifMatch: 2,
      payload: planPayload(planId, [heart({ projectId: q }), m45]),
    });
    assert.equal(link(moved.resource), q);
    assert.equal(await integrationOwner(driver, nightId), q);

    // Taking the link away detaches; the integrations leave the plan.
    const detached = await service.write({
      ...base,
      ifMatch: 3,
      payload: planPayload(planId, [heart(), m45]),
    });
    assert.equal(link(detached.resource), null);
    assert.equal(await integrationOwner(driver, nightId), null);

    // Detaching again is idempotent: nothing to detach, nothing refused —
    // for a space without the right too.
    const again = await (
      await free(driver)
    ).write({
      ...base,
      ifMatch: 4,
      payload: planPayload(planId, [heart(), m45], "Renommée"),
    });
    assert.equal(link(again.resource), null);
  },
);

onBothBackends(
  "the same refusals as the nights route: another target, an unknown plan, another space's plan",
  async (driver) => {
    const { tenantId, userId, p, r, foreign } = await seed(driver);
    const planId = randomUUID();
    const base = { tenantId, userId, planId };
    const service = await advanced(driver);
    await service.write({
      ...base,
      ifMatch: 0,
      payload: planPayload(planId, [heart(), m45]),
    });
    const attempt = (items) =>
      service.write({
        ...base,
        ifMatch: 1,
        payload: planPayload(planId, items),
      });

    const mismatch = await refusal(attempt([heart({ projectId: r }), m45]));
    assert.equal(mismatch.status, 409);
    assert.equal(mismatch.code, "target_mismatch");
    assert.equal(mismatch.body.planItemId, "ic1805");
    for (const projectId of [randomUUID(), foreign, "not-a-uuid"]) {
      const unknown = await refusal(attempt([heart({ projectId }), m45]));
      assert.equal(unknown.status, 404, projectId);
      assert.equal(unknown.code, "project_not_found", projectId);
    }
    // The item that carries the link is the one that must be of the target.
    const wrongItem = await refusal(
      attempt([heart(), { ...m45, projectId: p }]),
    );
    assert.equal(wrongItem.code, "target_mismatch");
    assert.equal(await storedRevision(driver, planId), 1);
    const ok = await attempt([heart({ projectId: p }), m45]);
    assert.equal(link(ok.resource), p);
  },
);

onBothBackends(
  "a write that leaves every projectId as it was is never checked, whatever the right",
  async (driver) => {
    const { tenantId, userId, p } = await seed(driver);
    const planId = randomUUID();
    const base = { tenantId, userId, planId };
    // A plan that holds a link the service never checked (older data): the
    // trusted writer of the store passes none.
    const store = await createPlanResourceRepository({
      driver,
      dialect: driver.dialect,
    });
    const gone = randomUUID();
    await store.writePlanResource({
      tenantId,
      userId,
      planId,
      expectedRevision: 0,
      payload: planPayload(planId, [heart({ projectId: gone }), m45]),
    });
    const service = await free(driver);

    // Free, no project of that id in the space: renaming the plan, moving
    // the slot, keeping the link as it was — all accepted.
    const edited = await service.write({
      ...base,
      ifMatch: 1,
      payload: planPayload(
        planId,
        [heart({ projectId: gone, endMinute: 180 }), m45],
        "Renommée",
      ),
    });
    assert.equal(link(edited.resource), gone);
    assert.equal(edited.resource.revision, 2);
  },
);

onBothBackends(
  "a stale copy that sets a link is plan_conflict, not a link refusal",
  async (driver) => {
    const { tenantId, userId, p } = await seed(driver);
    const planId = randomUUID();
    const base = { tenantId, userId, planId };
    const service = await free(driver);
    await service.write({
      ...base,
      ifMatch: 0,
      payload: planPayload(planId, [heart(), m45]),
    });
    await service.write({
      ...base,
      ifMatch: 1,
      payload: planPayload(planId, [heart(), m45], "Deuxième"),
    });
    const stale = await refusal(
      service.write({
        ...base,
        ifMatch: 1,
        payload: planPayload(planId, [heart({ projectId: p }), m45]),
      }),
    );
    assert.equal(stale.status, 409);
    assert.equal(stale.code, "plan_conflict");
    assert.equal(stale.body.error.code, "plan_conflict");
    assert.equal(stale.serverRevision, 2);
  },
);

onBothBackends(
  "restoring a version that carries a link is checked like a write",
  async (driver) => {
    const { tenantId, userId, p } = await seed(driver);
    const planId = randomUUID();
    const base = { tenantId, userId, planId };
    const full = await advanced(driver);
    await full.write({
      ...base,
      ifMatch: 0,
      payload: planPayload(planId, [heart(), m45]),
    });
    await full.write({
      ...base,
      ifMatch: 1,
      payload: planPayload(planId, [heart(), m45], "Deuxième"),
    });
    // A phone that never saw revision 2 links the plan: set aside.
    const stale = await full
      .write({
        ...base,
        ifMatch: 1,
        payload: planPayload(planId, [heart({ projectId: p }), m45]),
      })
      .catch((error) => error);
    const versionId = stale.body.versionId;
    assert.ok(versionId, "the stale copy is set aside");

    const refused = await refusal(
      (await free(driver)).restore({ tenantId, userId, planId, versionId }),
    );
    assert.equal(refused.code, "multi_night_not_active");
    assert.equal(await storedRevision(driver, planId), 2);
    const restored = await full.restore({
      tenantId,
      userId,
      planId,
      versionId,
    });
    assert.equal(link(restored), p);
  },
);

onBothBackends(
  "read-only window: a one-time « Planification avancée » keeps the link writes only; every other write stays refused",
  async (driver) => {
    const { tenantId, userId, p } = await seed(driver);
    const planId = randomUUID();
    const base = { tenantId, userId, planId };
    await (
      await advanced(driver)
    ).write({
      ...base,
      ifMatch: 0,
      payload: planPayload(planId, [heart(), m45]),
    });
    const oneTime = await serviceOf(driver, {
      mosaic: true,
      window: "one-time",
    });
    const lapsed = await serviceOf(driver, {
      mosaic: true,
      window: "subscription",
    });
    const ordinary = await serviceOf(driver, {
      mosaic: false,
      window: "one-time",
    });

    // Attach: only the link changes.
    const attached = await oneTime.write({
      ...base,
      ifMatch: 1,
      payload: planPayload(planId, [heart({ projectId: p }), m45]),
    });
    assert.equal(link(attached.resource), p);

    // An ordinary edit, a link plus an edit, a creation: refused.
    for (const [ifMatch, id, items, name] of [
      [2, planId, [heart({ projectId: p }), m45], "Renommée"],
      [
        2,
        planId,
        [heart({ projectId: p, endMinute: 100 }), m45],
        "Nuit du Cœur",
      ],
      [2, planId, [heart(), m45], "Renommée"],
      [0, randomUUID(), [heart({ projectId: p })], "Nouvelle"],
    ]) {
      const error = await refusal(
        oneTime.write({
          tenantId,
          userId,
          planId: id,
          ifMatch,
          payload: planPayload(id, items, name),
        }),
      );
      assert.equal(error.status, 403);
      assert.equal(error.code, "entitlement_read_only");
    }
    // Detach: only the link changes.
    const detached = await oneTime.write({
      ...base,
      ifMatch: 2,
      payload: planPayload(planId, [heart(), m45]),
    });
    assert.equal(link(detached.resource), null);

    // The right is not a one-time purchase's: the window refuses the link.
    for (const service of [lapsed, ordinary]) {
      const error = await refusal(
        service.write({
          ...base,
          ifMatch: 3,
          payload: planPayload(planId, [heart({ projectId: p }), m45]),
        }),
      );
      assert.equal(error.code, "entitlement_read_only");
    }
    // An ordinary plan edit with no link at all stays refused in the window.
    const edit = await refusal(
      oneTime.write({
        ...base,
        ifMatch: 3,
        payload: planPayload(planId, [heart(), m45], "Renommée"),
      }),
    );
    assert.equal(edit.code, "entitlement_read_only");
  },
);

// ——— The web planner's full save (`PUT /api/plans`) ———

const webPlace = {
  id: "col",
  version: 1,
  name: "Col des Mélèzes",
  latitude: "45",
  longitude: "-30",
  timeZone: "UTC",
  horizonMask: emptyHorizon(),
  horizonStatus: "verified",
};

function webState(items) {
  let state = addPlannerPlan(
    migratePlannerState(
      {
        date: "2026-09-01",
        location: webPlace,
        plans: [],
        knownLocations: [webPlace],
        horizonProfiles: [],
        equipment: { mode: "imaging", telescopeId: "lunette-72" },
        minAltitude: 30,
        moonSeparationMinimum: 25,
        moonSeparationMinimumByFilter: {},
        activePlanId: null,
      },
      {},
    ),
    { id: "web-plan", name: "Nuit au col" },
  );
  return patchPlannerPlan(state, { items });
}

onBothBackends(
  "the web planner's full save is checked like the v1 write",
  async (driver) => {
    const { tenantId, userId, p, r } = await seed(driver);
    const repository = await createPlannerStateRepository({
      driver,
      dialect: driver.dialect,
    });
    const save = (items, rights) =>
      repository.savePlannerState({
        tenantId,
        userId,
        state: webState(items),
        ...rights,
      });
    const withLink = (projectId, extra = {}) => [
      heart({ projectId, ...extra }),
      m45,
    ];
    const denied = { projectLinks: { allowed: false, readOnly: false } };
    const granted = { projectLinks: { allowed: true, readOnly: false } };

    await save([heart(), m45], denied);
    const refused = await refusal(save(withLink(p), denied));
    assert.equal(refused.status, 403);
    assert.equal(refused.code, "multi_night_not_active");
    assert.equal(refused.capability, "planner.mosaic");
    const mismatch = await refusal(save(withLink(r), granted));
    assert.equal(mismatch.code, "target_mismatch");
    assert.equal(
      (await refusal(save(withLink(randomUUID()), granted))).code,
      "project_not_found",
    );
    const state = async () =>
      (await repository.plannerState(tenantId)).plans[0].items.find(
        (item) => item.id === "ic1805",
      ).projectId ?? null;
    assert.equal(await state(), null, "nothing written by the refusals");

    await save(withLink(p), granted);
    assert.equal(await state(), p);
    // The same document saved again by a space without the right: no change
    // of link, no check.
    await save(withLink(p, { endMinute: 180 }), denied);
    assert.equal(await state(), p);
    // Taking it away needs the right.
    assert.equal(
      (await refusal(save([heart(), m45], denied))).code,
      "multi_night_not_active",
    );
    await save([heart(), m45], granted);
    assert.equal(await state(), null);

    // The read-only window: a one-time purchase's right writes a link and
    // nothing else; the rest of the plan stays refused.
    const window = {
      readOnly: true,
      projectLinks: { allowed: true, readOnly: true },
    };
    await save(withLink(p), window);
    assert.equal(await state(), p);
    assert.equal(
      (await refusal(save(withLink(p, { endMinute: 90 }), window))).code,
      "entitlement_read_only",
    );
    const lapsed = {
      readOnly: true,
      projectLinks: { allowed: false, readOnly: true },
    };
    assert.equal(
      (await refusal(save([heart(), m45], lapsed))).code,
      "entitlement_read_only",
    );
    await save([heart(), m45], window);
    assert.equal(await state(), null);
  },
);
