import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createProjectService } from "../dist/handlers.js";
import { projectBody, projectTest, refused } from "./support.mjs";

// The projects service (« plans multi-nuits »), on SQLite and PostgreSQL:
// the revision rule, the archive that never deletes, the space boundary,
// the capability, the audit and the change signal.

const create = (service, space, projectId, body = projectBody(), extra = {}) =>
  service.write({
    tenantId: space.tenantId,
    userId: space.userId,
    projectId,
    ifMatch: '"0"',
    body,
    ...extra,
  });

projectTest(
  "a creation answers the resource at revision 1, active, as stored",
  async ({ service, a, driver }) => {
    const projectId = randomUUID();
    const { resource, created } = await create(service, a, projectId);
    assert.equal(created, true);
    assert.equal(resource.id, projectId);
    assert.equal(resource.revision, 1);
    assert.equal(resource.status, "active");
    assert.equal(resource.goalMinutes, 720);
    assert.deepEqual(resource.target, projectBody().target);
    assert.deepEqual(resource.place, projectBody().place);
    assert.deepEqual(resource.equipment, projectBody().equipment);
    assert.deepEqual(resource.constraints, projectBody().constraints);
    assert.equal(resource.createdAt, resource.updatedAt);
    assert.deepEqual(
      await service.get({ tenantId: a.tenantId, projectId }),
      resource,
    );
    const { rows } = await driver.query(
      "SELECT tenant_id, revision, status, deleted_at FROM projects WHERE id = ?",
      [projectId],
    );
    assert.deepEqual(
      { ...rows[0], revision: Number(rows[0].revision) },
      {
        tenant_id: a.tenantId,
        revision: 1,
        status: "active",
        deleted_at: null,
      },
    );
  },
);

projectTest(
  "an update at the current revision moves it by one and keeps the status",
  async ({ service, a }) => {
    const projectId = randomUUID();
    const first = await create(service, a, projectId);
    const second = await service.write({
      tenantId: a.tenantId,
      userId: a.userId,
      projectId,
      ifMatch: '"1"',
      body: projectBody({ goalMinutes: 600 }),
    });
    assert.equal(second.created, false);
    assert.equal(second.resource.revision, 2);
    assert.equal(second.resource.goalMinutes, 600);
    assert.equal(second.resource.status, "active");
    assert.equal(second.resource.createdAt, first.resource.createdAt);
    assert.ok(second.resource.updatedAt > first.resource.updatedAt);
    const finished = await service.write({
      tenantId: a.tenantId,
      userId: a.userId,
      projectId,
      ifMatch: '"2"',
      body: projectBody({ goalMinutes: 600, status: "finished" }),
    });
    assert.equal(finished.resource.status, "finished");
    assert.equal(finished.resource.revision, 3);
  },
);

projectTest(
  "a stale write is refused 409 with the server's project, and changes nothing",
  async ({ service, a }) => {
    const projectId = randomUUID();
    await create(service, a, projectId);
    const current = await service.write({
      tenantId: a.tenantId,
      userId: a.userId,
      projectId,
      ifMatch: '"1"',
      body: projectBody({ goalMinutes: 480 }),
    });
    const error = await refused(
      service.write({
        tenantId: a.tenantId,
        userId: a.userId,
        projectId,
        ifMatch: '"1"',
        body: projectBody({ goalMinutes: 900 }),
      }),
      "project_conflict",
      409,
    );
    assert.deepEqual(error.body.project, current.resource);
    assert.equal(error.body.error.code, "project_conflict");
    assert.equal(
      (await service.get({ tenantId: a.tenantId, projectId })).goalMinutes,
      480,
    );
    // A creation over an existing id is refused too, without its content.
    const taken = await refused(
      create(service, a, projectId),
      "invalid_creation_revision",
      409,
    );
    assert.equal(taken.body.project, undefined);
  },
);

projectTest(
  "the If-Match rule: required, quoted, positive for an update; a missing project is 404",
  async ({ service, a }) => {
    const projectId = randomUUID();
    const write = (ifMatch, id = projectId) =>
      service.write({
        tenantId: a.tenantId,
        userId: a.userId,
        projectId: id,
        ifMatch,
        body: projectBody(),
      });
    await refused(write(null), "precondition_required", 428);
    await refused(write("1"), "invalid_if_match", 400);
    await refused(write('"1"'), "project_not_found", 404);
    await refused(write('"0"', "not-a-uuid"), "invalid_request", 400);
    await refused(
      service.archive({
        tenantId: a.tenantId,
        userId: a.userId,
        projectId,
        ifMatch: '"0"',
      }),
      "invalid_if_match",
      400,
    );
  },
);

projectTest(
  "archiving never deletes: the project stays readable, listed and revised once",
  async ({ service, a, driver }) => {
    const projectId = randomUUID();
    await create(service, a, projectId);
    const archived = await service.archive({
      tenantId: a.tenantId,
      userId: a.userId,
      projectId,
      ifMatch: '"1"',
    });
    assert.equal(archived.archived, true);
    assert.equal(archived.project.status, "archived");
    assert.equal(archived.project.revision, 2);
    // Archiving again answers the same, without a new revision.
    const again = await service.archive({
      tenantId: a.tenantId,
      userId: a.userId,
      projectId,
      ifMatch: '"2"',
    });
    assert.deepEqual(again, archived);
    assert.equal(
      (await service.get({ tenantId: a.tenantId, projectId })).status,
      "archived",
    );
    const { rows } = await driver.query(
      "SELECT COUNT(*) AS n FROM projects WHERE id = ?",
      [projectId],
    );
    assert.equal(Number(rows[0].n), 1);
    // A stale archive is a conflict, like a stale write.
    await refused(
      service.archive({
        tenantId: a.tenantId,
        userId: a.userId,
        projectId,
        ifMatch: '"1"',
      }),
      "project_conflict",
      409,
    );
  },
);

projectTest(
  "an archived project stays archived on a write, and comes back with a status",
  async ({ service, a }) => {
    const projectId = randomUUID();
    await create(service, a, projectId);
    await service.archive({
      tenantId: a.tenantId,
      userId: a.userId,
      projectId,
      ifMatch: '"1"',
    });
    const edited = await service.write({
      tenantId: a.tenantId,
      userId: a.userId,
      projectId,
      ifMatch: '"2"',
      body: projectBody({ goalMinutes: 540 }),
    });
    assert.equal(edited.resource.status, "archived");
    const back = await service.write({
      tenantId: a.tenantId,
      userId: a.userId,
      projectId,
      ifMatch: '"3"',
      body: projectBody({ goalMinutes: 540, status: "active" }),
    });
    assert.equal(back.resource.status, "active");
    await refused(
      service.write({
        tenantId: a.tenantId,
        userId: a.userId,
        projectId,
        ifMatch: '"4"',
        body: projectBody({ status: "archived" }),
      }),
      "invalid_request",
      400,
    );
  },
);

projectTest(
  "the list holds every project of the space, archived ones included, most recent first",
  async ({ service, a }) => {
    const first = randomUUID();
    const second = randomUUID();
    await create(service, a, first);
    await create(
      service,
      a,
      second,
      projectBody({
        target: {
          targetId: "m33",
          name: "M33",
          commonName: "Galaxie du Triangle",
        },
        goalMinutes: 360,
      }),
    );
    await service.archive({
      tenantId: a.tenantId,
      userId: a.userId,
      projectId: first,
      ifMatch: '"1"',
    });
    const { projects } = await service.list({ tenantId: a.tenantId });
    assert.deepEqual(
      projects.map(({ id, status }) => [id, status]),
      [
        [first, "archived"],
        [second, "active"],
      ],
    );
  },
);

projectTest(
  "a space never reads, writes, archives nor even learns of another's project",
  async ({ service, a, b }) => {
    const projectId = randomUUID();
    await create(service, a, projectId);
    assert.deepEqual(await service.list({ tenantId: b.tenantId }), {
      projects: [],
    });
    await refused(
      service.get({ tenantId: b.tenantId, projectId }),
      "project_not_found",
      404,
    );
    await refused(
      service.write({
        tenantId: b.tenantId,
        userId: b.userId,
        projectId,
        ifMatch: '"1"',
        body: projectBody({ goalMinutes: 60 }),
      }),
      "project_not_found",
      404,
    );
    await refused(
      service.archive({
        tenantId: b.tenantId,
        userId: b.userId,
        projectId,
        ifMatch: '"1"',
      }),
      "project_not_found",
      404,
    );
    // Its id is taken for everyone, and the answer says nothing of whose.
    const taken = await refused(
      create(service, b, projectId),
      "invalid_creation_revision",
      409,
    );
    assert.deepEqual(Object.keys(taken.body), ["error"]);
    assert.equal(
      (await service.get({ tenantId: a.tenantId, projectId })).goalMinutes,
      720,
    );
  },
);

projectTest(
  "without planner.mosaic a write is refused naming the capability; reading and archiving stay open",
  async ({ service, a, rights }) => {
    const projectId = randomUUID();
    await create(service, a, projectId);
    rights.withhold(a.userId);
    const error = await refused(
      create(service, a, randomUUID()),
      "capability_required",
      403,
    );
    assert.equal(error.body.capability, "planner.mosaic");
    await refused(
      service.write({
        tenantId: a.tenantId,
        userId: a.userId,
        projectId,
        ifMatch: '"1"',
        body: projectBody({ goalMinutes: 60 }),
      }),
      "capability_required",
      403,
    );
    assert.equal(
      (await service.list({ tenantId: a.tenantId })).projects.length,
      1,
    );
    assert.equal(
      (await service.get({ tenantId: a.tenantId, projectId })).goalMinutes,
      720,
    );
    const archived = await service.archive({
      tenantId: a.tenantId,
      userId: a.userId,
      projectId,
      ifMatch: '"1"',
    });
    assert.equal(archived.project.status, "archived");
  },
);

projectTest(
  "an ended subscription keeps the projects readable and refuses a write",
  async ({ service, a, rights }) => {
    const projectId = randomUUID();
    await create(service, a, projectId);
    rights.endSubscription(a.userId);
    await refused(
      service.write({
        tenantId: a.tenantId,
        userId: a.userId,
        projectId,
        ifMatch: '"1"',
        body: projectBody({ goalMinutes: 60 }),
      }),
      "entitlement_read_only",
      403,
    );
    assert.equal(
      (await service.get({ tenantId: a.tenantId, projectId })).revision,
      1,
    );
  },
);

projectTest(
  "an ended subscription keeps the writes of a one-time « Planification avancée »; archiving was never closed",
  async ({ service, a, rights }) => {
    const projectId = randomUUID();
    await create(service, a, projectId);
    rights.endSubscription(a.userId);
    rights.holdOneTime(a.userId);
    // The window is open, and the right comes from the purchase: the
    // multi-night plan is created, updated and archived as before.
    const created = await create(service, a, randomUUID());
    assert.equal(created.created, true);
    const updated = await service.write({
      tenantId: a.tenantId,
      userId: a.userId,
      projectId,
      ifMatch: '"1"',
      body: projectBody({ goalMinutes: 60 }),
    });
    assert.equal(updated.resource.revision, 2);
    assert.equal(updated.resource.goalMinutes, 60);
    const archived = await service.archive({
      tenantId: a.tenantId,
      userId: a.userId,
      projectId,
      ifMatch: '"2"',
    });
    assert.equal(archived.archived, true);
  },
);

projectTest(
  "an ended subscription whose right is not a purchase's still refuses a write and an archive",
  async ({ service, a, rights }) => {
    const projectId = randomUUID();
    await create(service, a, projectId);
    rights.endSubscription(a.userId);
    await refused(
      service.write({
        tenantId: a.tenantId,
        userId: a.userId,
        projectId,
        ifMatch: '"1"',
        body: projectBody({ goalMinutes: 61 }),
      }),
      "entitlement_read_only",
      403,
    );
    // Archiving is a change like another: refused in the window, with
    // the same code, and the plan stays active.
    await refused(
      service.archive({
        tenantId: a.tenantId,
        userId: a.userId,
        projectId,
        ifMatch: '"1"',
      }),
      "entitlement_read_only",
      403,
    );
    const kept = await service.get({ tenantId: a.tenantId, projectId });
    assert.equal(kept.status, "active");
    assert.equal(kept.revision, 1);
  },
);

projectTest(
  "each creation, update and archive is audited for the space and the person",
  async ({ service, a, driver }) => {
    const projectId = randomUUID();
    await create(service, a, projectId, projectBody(), {
      originDeviceId: "device-1",
    });
    await service.write({
      tenantId: a.tenantId,
      userId: a.userId,
      projectId,
      ifMatch: '"1"',
      body: projectBody({ goalMinutes: 600 }),
    });
    await service.archive({
      tenantId: a.tenantId,
      userId: a.userId,
      projectId,
      ifMatch: '"2"',
    });
    // A refused write records nothing.
    await refused(
      service.write({
        tenantId: a.tenantId,
        userId: a.userId,
        projectId,
        ifMatch: '"1"',
        body: projectBody(),
      }),
      "project_conflict",
      409,
    );
    const { rows } = await driver.query(
      "SELECT tenant_id, user_id, event_type, details_json FROM audit_events WHERE event_type LIKE 'project.%' ORDER BY created_at",
      [],
    );
    assert.deepEqual(
      rows.map((row) => [row.tenant_id, row.user_id, row.event_type]),
      [
        [a.tenantId, a.userId, "project.created"],
        [a.tenantId, a.userId, "project.updated"],
        [a.tenantId, a.userId, "project.archived"],
      ],
    );
    assert.deepEqual(JSON.parse(rows[0].details_json), {
      projectId,
      originDeviceId: "device-1",
    });
    assert.equal(JSON.parse(rows[2].details_json).revision, 3);
  },
);

projectTest(
  "each successful write and archive signals projects to the space alone",
  async ({ service, a, b, changes }) => {
    const ofA = changes(a.tenantId);
    const ofB = changes(b.tenantId);
    const projectId = randomUUID();
    await create(service, a, projectId, projectBody(), {
      originClientInstanceId: "phone-1",
    });
    await refused(
      service.write({
        tenantId: a.tenantId,
        userId: a.userId,
        projectId,
        ifMatch: '"5"',
        body: projectBody(),
      }),
      "project_conflict",
      409,
    );
    await service.archive({
      tenantId: a.tenantId,
      userId: a.userId,
      projectId,
      ifMatch: '"1"',
    });
    // Archiving an archived project changes nothing, and says nothing.
    await service.archive({
      tenantId: a.tenantId,
      userId: a.userId,
      projectId,
      ifMatch: '"2"',
    });
    assert.deepEqual(
      ofA.map((event) => [event.domains, event.originClientInstanceId]),
      [
        [["projects"], "phone-1"],
        [["projects"], null],
      ],
    );
    assert.deepEqual(ofB, []);
  },
);

projectTest(
  "a framing target, a horizon mask on the planner's grid and an equipment object round-trip",
  async ({ service, a }) => {
    const projectId = randomUUID();
    const framingId = randomUUID();
    const coarse = {
      enabled: true,
      points: Array.from({ length: 12 }, (_, index) => ({
        azimuth: index * 30,
        altitude: index === 9 ? 55 : 10,
      })),
    };
    const { resource } = await create(
      service,
      a,
      projectId,
      projectBody({
        target: { framingId, name: "Mosaïque du Cygne" },
        place: {
          name: "Camping du Lac Noir",
          latitude: 45.02,
          longitude: -30.04,
          horizonMask: coarse,
        },
        equipment: {
          telescopeId: "lunette-72",
          windTolerance: { preset: "standard", sustainedKmh: 20, gustKmh: 30 },
        },
      }),
    );
    assert.deepEqual(resource.target, { framingId, name: "Mosaïque du Cygne" });
    assert.equal(resource.place.horizonMask.points.length, 36);
    assert.equal(resource.place.horizonMask.points[27].altitude, 55);
    assert.equal(resource.place.horizonMask.points[28].altitude, 40);
    assert.deepEqual(
      (await service.get({ tenantId: a.tenantId, projectId })).equipment,
      {
        telescopeId: "lunette-72",
        windTolerance: { preset: "standard", sustainedKmh: 20, gustKmh: 30 },
      },
    );
  },
);

// A private server
// hands no entitlement provider, and never restricts the multi-night plans —
// whatever the profile says, in or out of any window.
projectTest(
  "without an entitlement provider (a private server) every write and archive is open",
  async ({ driver, dialect, a }) => {
    const open = await createProjectService({ driver, dialect });
    const projectId = randomUUID();
    const created = await create(open, a, projectId);
    assert.equal(created.created, true);
    const updated = await open.write({
      tenantId: a.tenantId,
      userId: a.userId,
      projectId,
      ifMatch: '"1"',
      body: projectBody({ goalMinutes: 60 }),
    });
    assert.equal(updated.resource.goalMinutes, 60);
    const archived = await open.archive({
      tenantId: a.tenantId,
      userId: a.userId,
      projectId,
      ifMatch: '"2"',
    });
    assert.equal(archived.project.status, "archived");
  },
);
