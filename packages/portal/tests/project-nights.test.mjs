// The nights of a
// multi-night plan. A night already run — with its plan, or run without
// one — and a plan of one night are attached to a multi-night plan of their
// target afterwards, detached, moved to another; the link stays on the plan
// item of the target when there is one (`planItem.projectId`), on the night
// otherwise; the integrations of the night follow it; refused without the
// multi-night plans of Astro Sync and for another target. On SQLite and on
// PostgreSQL.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createProjectIntegrationService } from "../dist/api/project-integrations.js";
import { createProjectIntegrationRepository } from "../dist/persistence/project-integration-repository.js";
import { createProjectNightService } from "../dist/api/project-nights.js";
import { onBothBackends, seedSpace } from "./helpers/both-backends.mjs";

const at = "2026-08-13T09:00:00.000Z";
const heartItem = {
  id: "ic1805",
  targetId: "ic1805",
  target: { id: "ic1805", name: "IC 1805" },
  startMinute: 30,
  endMinute: 330,
};

async function insertProject(driver, tenantId, targetId, name) {
  const id = randomUUID();
  await driver.run(
    "INSERT INTO projects (id, tenant_id, revision, status, payload_json, created_at, updated_at) VALUES (?, ?, 1, 'active', ?, ?, ?)",
    [
      id,
      tenantId,
      JSON.stringify({
        target: { targetId, name },
        goalMinutes: 720,
        place: { name: "Col des Mélèzes", latitude: 45, longitude: 2 },
        equipment: {},
        constraints: {
          minAltitude: 30,
          moonSeparationMinimum: 30,
          moonSeparationMinimumByFilter: {},
        },
      }),
      at,
      at,
    ],
  );
  return id;
}

/**
 * The Heart (IC 1805), as it can run without a multi-night plan: the
 * 9 August night with its plan, the 10 August night run without a plan
 * (its target written on the night), the 12 August plan not run yet; and,
 * of another target, the 14 August night (M 31, met in its steps) and a
 * plan of M 31. Two multi-night plans of the Heart (P, Q), one of M 31.
 */
async function seedHeart(driver) {
  const tenantId = randomUUID();
  const userId = randomUUID();
  await seedSpace(driver, tenantId, userId, at);
  const plan = async (date, items) => {
    const id = randomUUID();
    await driver.run(
      "INSERT INTO plans (id, tenant_id, created_by_user_id, client_id, plan_date, name, created_at, updated_at, payload_json, revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
      [
        id,
        tenantId,
        userId,
        `plan-${date}`,
        date,
        `Nuit du ${date}`,
        at,
        at,
        JSON.stringify({ id: `plan-${date}`, date, name: date, items }),
      ],
    );
    return id;
  };
  const night = async (planId, startedAt, targetIds = null) => {
    const id = randomUUID();
    await driver.run(
      "INSERT INTO observation_sessions (id, tenant_id, plan_id, started_at, status, created_at, target_ids_json) VALUES (?, ?, ?, ?, 'finished', ?, ?)",
      [
        id,
        tenantId,
        planId,
        startedAt,
        at,
        targetIds ? JSON.stringify(targetIds) : null,
      ],
    );
    return id;
  };
  const plans = {
    aug9: await plan("2026-08-09", [heartItem]),
    aug12: await plan("2026-08-12", [heartItem]),
    m31: await plan("2026-08-20", [
      { id: "m31", targetId: "m31", target: { id: "m31" } },
    ]),
  };
  const nights = {
    aug9: await night(plans.aug9, "2026-08-09T20:30:00.000Z"),
    aug10: await night(null, "2026-08-11T00:40:00.000Z", ["ic1805"]),
    aug14: await night(null, "2026-08-14T21:00:00.000Z"),
  };
  await driver.run(
    "INSERT INTO acquisition_steps (id, tenant_id, session_id, target_id, frame_count, exposure_seconds, origin, position, created_at, updated_at) VALUES (?, ?, ?, 'm31', 40, 120, 'analysis', 1, ?, ?)",
    [randomUUID(), tenantId, nights.aug14, at, at],
  );
  return {
    tenantId,
    userId,
    plans,
    nights,
    p: await insertProject(driver, tenantId, "ic1805", "IC 1805"),
    q: await insertProject(driver, tenantId, "ic1805", "IC 1805"),
    andromeda: await insertProject(driver, tenantId, "m31", "M 31"),
  };
}

async function refusal(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("expected a refusal");
}

const planRow = async (driver, id) =>
  (
    await driver.query(
      "SELECT revision, payload_json FROM plans WHERE id = ?",
      [id],
    )
  ).rows[0];

const keyOf = (line) => line.sessionId ?? line.planId;

onBothBackends(
  "nights: the candidates of the target, attached all or none, the link on the plan item or on the night, the integrations following",
  async (driver) => {
    const heart = await seedHeart(driver);
    const { tenantId, userId, nights, plans, p, q } = heart;
    const active = new Set();
    const service = await createProjectNightService({
      driver,
      multiNightActive: async (id) => active.has(id),
    });
    const integrations = await createProjectIntegrationService({
      driver,
      multiNightActive: async () => true,
    });
    // Astro Sync sent the 10 August night to Q earlier (the line is written
    // under Q without the night being attached to it: the PUT now refuses
    // that, so the line is placed by hand).
    await (
      await createProjectIntegrationRepository({ driver })
    ).upsert(tenantId, q, [
      {
        nightId: nights.aug10,
        targetId: "ic1805",
        filter: "RGB",
        exposureSeconds: 90,
        frameCount: 89,
        eveningDate: "2026-08-10",
      },
    ]);

    // Before: no night; the candidates are the Heart's, never M 31's.
    const before = await service.list({ tenantId, projectId: p });
    assert.deepEqual(before.nights, []);
    assert.deepEqual(before.candidates.map(keyOf), [
      nights.aug9,
      nights.aug10,
      plans.aug12,
    ]);
    const aug9 = before.candidates[0];
    assert.equal(aug9.planId, plans.aug9);
    assert.equal(aug9.eveningDate, "2026-08-09");
    assert.equal(aug9.link, null);
    assert.equal(aug9.projectId, null);
    assert.equal(before.candidates[1].planId, null);
    assert.equal(before.candidates[1].eveningDate, "2026-08-10");
    assert.equal(before.candidates[2].sessionId, null);
    assert.equal(before.candidates[2].sessionStatus, null);

    // Without « Planification avancée » (planner.mosaic): refused, nothing written.
    const body = {
      sessionIds: [nights.aug9, nights.aug10],
      planIds: [plans.aug12],
    };
    const locked = await refusal(
      service.attach({ tenantId, userId, projectId: p, body }),
    );
    assert.equal(locked.status, 403);
    assert.equal(locked.body.error.code, "multi_night_not_active");
    assert.equal(locked.body.capability, "planner.mosaic");
    active.add(userId);

    // Another target among them: nothing attached at all.
    const mismatch = await refusal(
      service.attach({
        tenantId,
        userId,
        projectId: p,
        body: { ...body, sessionIds: [nights.aug9, nights.aug14] },
      }),
    );
    assert.equal(mismatch.status, 409);
    assert.equal(mismatch.body.error.code, "target_mismatch");
    assert.equal(mismatch.body.sessionId, nights.aug14);
    assert.equal(Number((await planRow(driver, plans.aug9)).revision), 1);
    const otherPlan = await refusal(
      service.attach({
        tenantId,
        userId,
        projectId: p,
        body: { planIds: [plans.m31] },
      }),
    );
    assert.equal(otherPlan.body.error.code, "target_mismatch");
    assert.equal(otherPlan.body.planId, plans.m31);
    const unknown = await refusal(
      service.attach({
        tenantId,
        userId,
        projectId: p,
        body: { sessionIds: [randomUUID()] },
      }),
    );
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.error.code, "session_not_found");
    const empty = await refusal(
      service.attach({ tenantId, userId, projectId: p, body: {} }),
    );
    assert.equal(empty.body.error.code, "invalid_request");
    const missing = await refusal(
      service.attach({ tenantId, userId, projectId: randomUUID(), body }),
    );
    assert.equal(missing.body.error.code, "project_not_found");

    // Attached: the 9th and the 12th by their plan item, the 10th by itself.
    const attached = await service.attach({
      tenantId,
      userId,
      projectId: p,
      body,
    });
    assert.deepEqual(
      attached.nights.map((line) => [keyOf(line), line.link, line.eveningDate]),
      [
        [nights.aug9, "plan", "2026-08-09"],
        [nights.aug10, "night", "2026-08-10"],
        [plans.aug12, "plan", "2026-08-12"],
      ],
    );
    assert.deepEqual(attached.candidates, []);
    const row = await planRow(driver, plans.aug9);
    assert.equal(Number(row.revision), 2, "a new revision of the plan");
    assert.equal(JSON.parse(row.payload_json).items[0].projectId, p);
    const history = await driver.query(
      "SELECT revision FROM plan_versions WHERE plan_id = ? AND state = 'history'",
      [plans.aug9],
    );
    assert.deepEqual(
      history.rows.map((entry) => Number(entry.revision)),
      [1],
      "the replaced payload is kept",
    );
    const items = await driver.query(
      "SELECT details_json FROM plan_items WHERE plan_id = ?",
      [plans.aug9],
    );
    assert.equal(JSON.parse(items.rows[0].details_json).projectId, p);
    // The integration of the 10th followed it from Q to P.
    assert.equal(attached.nights[1].integrationCount, 1);
    assert.equal(attached.nights[1].integrationSeconds, 8010);
    assert.equal(
      (await integrations.list({ tenantId, projectId: p })).integrations.length,
      1,
    );
    assert.equal(
      (await integrations.list({ tenantId, projectId: q })).integrations.length,
      0,
    );
    // Attaching again changes nothing: no new revision.
    await service.attach({ tenantId, userId, projectId: p, body });
    assert.equal(Number((await planRow(driver, plans.aug9)).revision), 2);

    // What a night, or a plan, belongs to.
    assert.deepEqual(
      [...(await service.projectIdsOf({ tenantId, sessionId: nights.aug10 }))],
      [p],
    );
    assert.deepEqual(
      [...(await service.projectIdsOf({ tenantId, planId: plans.aug12 }))],
      [p],
    );
    assert.deepEqual(
      (await service.projectNights({ tenantId, projectId: p })).nights.length,
      3,
    );
    // From Q, they are candidates that belong to P.
    const fromQ = await service.list({ tenantId, projectId: q });
    assert.deepEqual(fromQ.nights, []);
    assert.deepEqual(
      fromQ.candidates.map((line) => line.projectId),
      [p, p, p],
    );

    // Detached: the night of the 10th, its integration leaves P.
    const detached = await service.detach({
      tenantId,
      userId,
      projectId: p,
      nightId: nights.aug10,
    });
    assert.deepEqual(detached.nights.map(keyOf), [nights.aug9, plans.aug12]);
    assert.equal(detached.candidates[0].sessionId, nights.aug10);
    assert.equal(
      (await integrations.list({ tenantId, projectId: p })).integrations.length,
      0,
    );
    // Idempotent; a plan of one night is detached by its own id.
    await service.detach({
      tenantId,
      userId,
      projectId: p,
      nightId: nights.aug10,
    });
    const planGone = await service.detach({
      tenantId,
      userId,
      projectId: p,
      nightId: plans.aug12,
    });
    assert.deepEqual(planGone.nights.map(keyOf), [nights.aug9]);
    assert.equal(
      JSON.parse((await planRow(driver, plans.aug12)).payload_json).items[0]
        .projectId,
      undefined,
    );
    const nowhere = await refusal(
      service.detach({
        tenantId,
        userId,
        projectId: p,
        nightId: randomUUID(),
      }),
    );
    assert.equal(nowhere.status, 404);
    assert.equal(nowhere.body.error.code, "night_not_found");

    // Attached again to P, the 10th brings its integration back; moved to Q,
    // the 9th leaves P.
    const back = await service.attach({
      tenantId,
      userId,
      projectId: p,
      body: { sessionIds: [nights.aug10] },
    });
    assert.equal(
      back.nights.find((l) => l.sessionId === nights.aug10).integrationCount,
      1,
    );
    const moved = await service.attach({
      tenantId,
      userId,
      projectId: q,
      body: { planIds: [plans.aug9] },
    });
    assert.deepEqual(moved.nights.map(keyOf), [nights.aug9]);
    assert.deepEqual(
      (await service.list({ tenantId, projectId: p })).nights.map(keyOf),
      [nights.aug10],
    );

    // Detaching needs the right too.
    active.delete(userId);
    const lockedOut = await refusal(
      service.detach({ tenantId, userId, projectId: q, nightId: nights.aug9 }),
    );
    assert.equal(lockedOut.body.error.code, "multi_night_not_active");
  },
);

onBothBackends(
  "nights: a night run with a plan that lacks the target carries the link itself; another space reads nothing",
  async (driver) => {
    const heart = await seedHeart(driver);
    const { tenantId, userId, plans, andromeda } = heart;
    // The 9 August night also met M 31 in the field: its plan has no item
    // of it, so the night carries the link.
    await driver.run(
      "UPDATE observation_sessions SET target_ids_json = ? WHERE id = ?",
      [JSON.stringify(["ic1805", "m31"]), heart.nights.aug9],
    );
    const service = await createProjectNightService({
      driver,
      multiNightActive: async () => true,
    });
    const answer = await service.attach({
      tenantId,
      userId,
      projectId: andromeda,
      body: { sessionIds: [heart.nights.aug9, heart.nights.aug14] },
    });
    assert.deepEqual(
      answer.nights.map((line) => [line.sessionId, line.link]),
      [
        [heart.nights.aug9, "night"],
        [heart.nights.aug14, "night"],
      ],
    );
    assert.equal(answer.nights[0].planId, plans.aug9);
    assert.equal(
      Number((await planRow(driver, plans.aug9)).revision),
      1,
      "the plan is not written",
    );
    // The plan of M 31 never run is a candidate.
    assert.deepEqual(
      answer.candidates.map((line) => line.planId),
      [plans.m31],
    );
    const stranger = randomUUID();
    await seedSpace(driver, stranger, randomUUID(), at);
    const foreign = await refusal(
      service.list({ tenantId: stranger, projectId: andromeda }),
    );
    assert.equal(foreign.body.error.code, "project_not_found");
  },
);

onBothBackends(
  "candidates of a target with no multi-night plan yet: the nights and plans of the target, their owner, their integrations",
  async (driver) => {
    const heart = await seedHeart(driver);
    const { tenantId, userId, nights, plans, p } = heart;
    const service = await createProjectNightService({
      driver,
      multiNightActive: async () => true,
    });
    const integrations = await createProjectIntegrationService({
      driver,
      multiNightActive: async () => true,
    });
    await (
      await createProjectIntegrationRepository({ driver })
    ).upsert(tenantId, p, [
      {
        nightId: nights.aug10,
        targetId: "ic1805",
        filter: "RGB",
        exposureSeconds: 90,
        frameCount: 89,
        eveningDate: "2026-08-10",
      },
    ]);
    // The Heart has plans; the target is named, no multi-night plan is needed.
    const answer = await service.candidates({ tenantId, targetId: "ic1805" });
    assert.deepEqual(answer.candidates.map(keyOf), [
      nights.aug9,
      nights.aug10,
      plans.aug12,
    ]);
    const aug10 = answer.candidates[1];
    assert.equal(aug10.link, null);
    assert.equal(aug10.integrationCount, 1);
    assert.equal(aug10.integrationSeconds, 89 * 90);
    assert.equal(answer.candidates[0].integrationCount, 0);
    // A night already in a multi-night plan is listed with its owner.
    await service.attach({
      tenantId,
      userId,
      projectId: p,
      body: { sessionIds: [nights.aug9] },
    });
    const after = await service.candidates({ tenantId, targetId: "ic1805" });
    assert.equal(after.candidates[0].projectId, p);
    assert.equal(after.candidates[1].projectId, null);
    // Another target: its own plan only; no target: refused; another space: none.
    assert.deepEqual(
      (await service.candidates({ tenantId, targetId: "m31" })).candidates.map(
        keyOf,
      ),
      [nights.aug14, plans.m31],
    );
    const none = await refusal(service.candidates({ tenantId }));
    assert.equal(none.body.error.code, "invalid_request");
    const stranger = randomUUID();
    await seedSpace(driver, stranger, randomUUID(), at);
    assert.deepEqual(
      (await service.candidates({ tenantId: stranger, targetId: "ic1805" }))
        .candidates,
      [],
    );
  },
);
