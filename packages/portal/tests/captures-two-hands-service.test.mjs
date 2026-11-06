// The service of a capture written by two hands — the revision and the
// conflict judged by field (the table of the contract), what the owner's phone
// writes, the two synchronisations (a device, the image of a plan), the
// quality of the stacked image (written under `analysis.logs`, read by anyone)
// and of the session, the additions of the lists, the lines that arrive
// without a touch, the signal and the audit. On SQLite and PostgreSQL; every
// name, place and date is invented.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { staticProfile } from "../dist/capabilities/provider.js";
import { createJournalService } from "../dist/api/journal.js";
import { subscribe } from "../dist/api/change-bus.js";
import { createProjectIntegrationRepository } from "../dist/persistence/project-integration-repository.js";
import { onBothBackends } from "./helpers/both-backends.mjs";
import {
  refusal,
  seedDebriefedNight,
  withServices,
} from "./helpers/journal-space.mjs";
import {
  PHONE,
  SYNC,
  WEB,
  contractErrors,
  digest,
  image,
  profile,
} from "./helpers/metadata-space.mjs";

async function* once(buffer) {
  yield buffer;
}

const at = "2026-10-14T09:00:00.000Z";

/** The owner's gestures on one capture, as the routes make them. */
function hands(owner, space, captureId) {
  const common = { tenantId: space.tenantId, userId: space.userId, captureId };
  return {
    get: () => owner.get(common),
    edit: (metadata, options = {}) =>
      owner.updateMetadata({ ...common, metadata, ...options }),
    tags: (tags, options = {}) =>
      owner.update({ ...common, changes: { tags }, ...options }),
    stage: (stage, options = {}) =>
      owner.update({ ...common, changes: { stage }, ...options }),
    sync: (options = {}) => owner.syncAcquisition({ ...common, ...options }),
  };
}

/** The refusal `capture_conflict` of a write: its field, its line, the capture. */
const conflict = (field, line) => (error) => {
  assert.equal(error.code, "capture_conflict");
  assert.equal(error.status, 409);
  assert.equal(error.conflictField, field);
  assert.equal(error.conflictLine, line);
  assert.ok(error.capture?.id, "the current capture comes with it");
  return true;
};

const newCapture = async (send, extra = {}, caller = PHONE) =>
  (
    await send(
      image(`c-${randomUUID()}`),
      { targetId: "m31", ...extra },
      caller,
    )
  ).body.capture;

onBothBackends(
  "the revision starts at 1, moves once per change and is judged by field — the phone and the web write the same title (the contract's table, the scalar rows, both credentials)",
  async (driver) => {
    await withServices(driver, {}, async ({ owner, space, send }) => {
      const created = await newCapture(send);
      assert.equal(created.revision, 1);
      const h = hands(owner, space, created.id);
      for (const [first, second] of [
        ["web", "device"],
        ["device", "web"],
      ]) {
        const read = async () => (await h.get()).revision;
        // The phone renames at r; the web tagged at r + 1: both kept.
        let r = await read();
        await h.tags([`par ${first}`], { by: first });
        const kept = await h.edit(
          { title: `Titre de ${second}` },
          { by: second, ifMatch: r },
        );
        assert.equal(kept.revision, r + 2);
        assert.deepEqual(kept.tags, [`par ${first}`]);
        // Both rename at r; the first one is through: the second is refused,
        // and carries the capture as it stands.
        r = await read();
        await h.edit({ title: `Titre de ${first}` }, { by: first, ifMatch: r });
        const stale = await refusal(
          h.edit({ title: `Titre de ${second}` }, { by: second, ifMatch: r }),
        );
        assert.ok(conflict("title", undefined)(stale));
        assert.equal(stale.capture.revision, r + 1);
        assert.equal(stale.capture.metadata.title.value, `Titre de ${first}`);
        assert.equal(await read(), r + 1, "nothing was written");
        // Retried at the revision it now reads: applied.
        const retried = await h.edit(
          { title: `Titre de ${second}` },
          { by: second, ifMatch: r + 1 },
        );
        assert.equal(retried.revision, r + 2);
        // Renaming to the title already there changes nothing, whatever the
        // revision it read: no conflict, the revision does not move.
        const same = await h.edit(
          { title: `Titre de ${second}` },
          { by: first, ifMatch: r },
        );
        assert.equal(same.revision, r + 2);
        // A write without If-Match is applied and moves the revision.
        const bare = await h.edit({ notes: `Rosée ${first}` }, { by: first });
        assert.equal(bare.revision, r + 3);
      }
    });
  },
);

onBothBackends(
  "the stage, the tags and the visibility are fields of their own; an image added, a name that is not the stage, an If-Match the capture never had",
  async (driver) => {
    await withServices(driver, {}, async ({ owner, space, send }) => {
      const created = await newCapture(send);
      const h = hands(owner, space, created.id);
      let r = (await h.get()).revision;
      // « Finaliser cette capture » at r; the image is replaced at r + 1: applied.
      await send(
        image("second", 120),
        { captureId: created.id, targetId: "m31" },
        SYNC,
      );
      const moved = (await h.get()).revision;
      assert.equal(moved, r + 1, "an image added moves the revision once");
      const finalized = await h.stage("finalized", {
        by: "device",
        ifMatch: r,
      });
      assert.equal(finalized.stage, "finalized");
      assert.equal(finalized.revision, moved + 1);
      // The web finalises it again: a no-op never conflicts nor moves.
      assert.equal(
        (await h.stage("finalized", { by: "web", ifMatch: r })).revision,
        moved + 1,
      );
      // The stage and the tags conflict with themselves only.
      r = moved + 1;
      await h.tags(["M31", "Dual-band"], { by: "web" });
      const refusedTags = await refusal(
        h.tags(["autre"], { by: "device", ifMatch: r }),
      );
      assert.ok(conflict("tags", undefined)(refusedTags));
      await h.stage("draft", { by: "web" });
      const refusedStage = await refusal(
        h.stage("finalized", { by: "device", ifMatch: r }),
      );
      assert.ok(conflict("stage", undefined)(refusedStage));
      // The order of the tags is not a change; a repetition and a blank are dropped.
      const current = (await h.get()).revision;
      assert.equal(
        (await h.tags(["Dual-band", "M31", " M31 ", ""], { by: "device" }))
          .revision,
        current,
      );
      // An If-Match the capture never had is refused, even for a no-op.
      const invalid = await refusal(h.stage("draft", { ifMatch: current + 5 }));
      assert.equal(invalid.code, "invalid_if_match");
      assert.equal(invalid.status, 400);
    });
  },
);

onBothBackends(
  "the lines of « Intégrations » are judged line by line — set and delete conflict on their line only, add never, a synchronisation and the reset on any",
  async (driver) => {
    await withServices(
      driver,
      {},
      async ({ owner, space, send, driver: db }) => {
        const created = await newCapture(send, { sessionId: space.sessionId });
        const h = hands(owner, space, created.id);
        const lines = (await h.get()).metadata.acquisition.lines;
        assert.equal(
          lines.length,
          2,
          "the night's two measured steps, filled without a touch",
        );
        const [one, two] = lines;
        const set = (line, frameCount, options) =>
          h.edit(
            {
              acquisition: {
                line,
                set: { filter: "Dual-band", frameCount, exposureSeconds: 180 },
              },
            },
            options,
          );
        const read = async () => (await h.get()).revision;
        // The phone corrects L1 at r; the web corrected L2 at r + 1: applied.
        let r = await read();
        await set(two.id, 21, { by: "web" });
        assert.equal(
          (await set(one.id, 40, { by: "device", ifMatch: r })).revision,
          r + 2,
        );
        // Both correct L1 at r: the second is refused on that line.
        r = await read();
        await set(one.id, 41, { by: "web" });
        const stale = await refusal(
          set(one.id, 42, { by: "device", ifMatch: r }),
        );
        assert.ok(conflict("acquisition", one.id)(stale));
        // A line added at the old revision is applied, whatever happened since.
        const added = await h.edit(
          {
            acquisition: {
              add: { filter: "Ha", frameCount: 5, exposureSeconds: 60 },
            },
          },
          { by: "device", ifMatch: r },
        );
        assert.equal(added.metadata.acquisition.lines.length, 3);
        // Deleting a line the web deleted: the line is not found (404), not a conflict.
        r = await read();
        await h.edit(
          { acquisition: { line: two.id, delete: true } },
          { by: "web" },
        );
        const gone = await refusal(
          h.edit(
            { acquisition: { line: two.id, delete: true } },
            { by: "device", ifMatch: r },
          ),
        );
        assert.equal(gone.code, "acquisition_line_not_found");
        assert.equal(gone.status, 404);
        // The night gains a measured step: a synchronisation would add it. The
        // web corrects a line meanwhile: the synchronisation at the revision
        // read before is refused on the lines as a whole (no line named).
        await db.run(
          `INSERT INTO acquisition_steps (id, tenant_id, session_id, target_id, filter, frame_count, exposure_seconds, gain, origin, position, created_at, updated_at)
         VALUES (?, ?, ?, 'm31', 'Ha', 12, 300, 100, 'analysis', 3, ?, ?)`,
          [randomUUID(), space.tenantId, space.sessionId, at, at],
        );
        r = await read();
        await set(one.id, 43, { by: "web" });
        const refusedSync = await refusal(h.sync({ by: "device", ifMatch: r }));
        assert.ok(conflict("acquisition", undefined)(refusedSync));
        // A change of another field does not refuse it: the third step arrives.
        r = await read();
        await h.edit({ title: "M31 en deux nuits" }, { by: "web" });
        const synced = await h.sync({ by: "device", ifMatch: r });
        assert.equal(
          synced.acquisition.lines.filter(
            (line) => line.filter === "Ha" && line.origin === "astro-sync",
          ).length,
          1,
        );
        // Twice: nothing is doubled, nothing moves.
        const again = await h.sync({ by: "web" });
        assert.equal(again.capture.revision, synced.capture.revision);
        // The reset to the night's steps conflicts with any line changed since.
        r = await read();
        await set(one.id, 44, { by: "web" });
        const refusedReset = await refusal(
          h.edit({ acquisition: null }, { by: "device", ifMatch: r }),
        );
        assert.ok(conflict("acquisition", undefined)(refusedReset));
      },
    );
  },
);

onBothBackends(
  "every write path moves the revision once and marks it for the signal and the audit — a proposal that changed a value, a session, the targets, an image's removal; never a value in the audit",
  async (driver) => {
    await withServices(
      driver,
      {},
      async ({ owner, space, send, driver: db }) => {
        const created = await newCapture(send);
        const h = hands(owner, space, created.id);
        const heard = [];
        const unsubscribe = subscribe(space.tenantId, (signal) =>
          heard.push(signal),
        );
        try {
          const read = async () => (await h.get()).revision;
          const common = {
            tenantId: space.tenantId,
            userId: space.userId,
            captureId: created.id,
          };
          let r = await read();
          // A producer's proposal moves the revision when it changed a value, not twice.
          const propose = () =>
            owner.proposeMetadata({
              ...common,
              proposed: {
                source: "astro-sync",
                title: "M31 empilée",
                calibration: "40 darks",
              },
            });
          await propose();
          assert.equal(await read(), r + 1);
          await propose();
          assert.equal(
            await read(),
            r + 1,
            "the same proposal twice moves nothing",
          );
          r += 1;
          // The owner's title wins over the proposal: it is skipped, and moves nothing.
          await h.edit({ title: "Ma M31" }, { by: "web" });
          r += 1;
          const skipped = await propose();
          assert.deepEqual(skipped.skipped, [
            { field: "title", reason: "edited" },
          ]);
          assert.equal(await read(), r);
          // The capture's session, its targets.
          await h.edit({ sessionId: space.otherSessionId }, { by: "web" });
          await h.edit({ targetIds: ["m31", "ic1396"] }, { by: "device" });
          assert.equal(await read(), r + 2);
          r += 2;
          // Another image, its removal.
          const added = await send(
            image("autre", 90),
            { captureId: created.id, targetId: "m31" },
            PHONE,
          );
          assert.equal(await read(), r + 1);
          await owner.deleteVariant({
            ...common,
            imageId: added.body.variant.id,
          });
          assert.equal(await read(), r + 2);
          // Each write told the other hand to read again (`captures`).
          assert.ok(heard.length >= 6);
          assert.ok(
            heard.every((signal) => signal.domains.includes("captures")),
          );
          // The audit names the credential and the fields, never a value.
          const audit = (
            await db.query(
              "SELECT details_json FROM audit_events WHERE tenant_id = ? AND event_type = 'capture.field_changed' ORDER BY created_at, id",
              [space.tenantId],
            )
          ).rows.map((row) => JSON.parse(row.details_json));
          assert.ok(audit.length >= 6);
          assert.ok(
            audit.some(
              (entry) =>
                entry.by === "device" && entry.fields.includes("targetIds"),
            ),
          );
          assert.ok(
            audit.some(
              (entry) => entry.by === "web" && entry.fields.includes("title"),
            ),
          );
          assert.ok(audit.some((entry) => entry.by === "producer"));
          const text = JSON.stringify(audit);
          for (const value of ["Ma M31", "M31 empilée", "40 darks"])
            assert.ok(!text.includes(value), `${value} is not in the audit`);
        } finally {
          unsubscribe();
        }
      },
    );
  },
);

onBothBackends(
  "the phone writes the tags, the equipment, the sensor, the processing and the targets under the web's rules; the capture's session, the visibility and the rest stay the web's",
  async (driver) => {
    await withServices(driver, {}, async ({ owner, space, send }) => {
      const created = await newCapture(send, { sessionId: space.sessionId });
      const h = hands(owner, space, created.id);
      // Tags: the whole list, 40 characters, 20 tags, never otherwise normalised.
      const tagged = await h.tags(["Nébuleuse d’Orion", " Ha ", "Ha"], {
        by: "device",
      });
      assert.deepEqual(tagged.tags, ["Ha", "Nébuleuse d’Orion"]);
      for (const tags of [
        ["x".repeat(41)],
        Array.from({ length: 21 }, (_, i) => `t${i}`),
        "Ha",
      ]) {
        const bad = await refusal(h.tags(tags, { by: "device" }));
        assert.equal(bad.code, "invalid_request", JSON.stringify(tags));
      }
      // Equipment: the space's own; another id is 404.
      const camera = await h.edit(
        { "equipment.cameraId": space.equipment.camera },
        { by: "device" },
      );
      assert.equal(camera.metadata.equipment.camera.edited, true);
      const unknown = await refusal(
        h.edit({ "equipment.mountId": randomUUID() }, { by: "device" }),
      );
      assert.equal(unknown.code, "equipment_not_found");
      assert.equal(unknown.status, 404);
      // Sensor and processing, with their limits.
      const sensor = await h.edit(
        { sensor: { temperatureC: -10, binning: 1 } },
        { by: "device" },
      );
      assert.deepEqual(sensor.metadata.sensor.value, {
        temperatureC: -10,
        binning: 1,
      });
      const software = await h.edit(
        { "processing.software": "Siril 1.4" },
        { by: "device" },
      );
      assert.equal(software.metadata.processing.software.edited, true);
      const long = await refusal(
        h.edit({ "processing.steps": "é".repeat(501) }, { by: "device" }),
      );
      assert.equal(long.code, "invalid_metadata");
      assert.equal(long.limit, 500);
      // Targets: the space's catalogue; an unknown one is 404.
      const targets = await h.edit(
        { targetIds: ["m31", "ic1396"] },
        { by: "device" },
      );
      assert.deepEqual(targets.targetIds, ["m31", "ic1396"]);
      const missing = await refusal(
        h.edit({ targetIds: ["nulle-part"] }, { by: "device" }),
      );
      assert.equal(missing.code, "target_not_found");
      // What stays the web's: the session, the visibility, the review, the sky switch.
      const session = await refusal(
        h.edit({ sessionId: space.otherSessionId }, { by: "device" }),
      );
      assert.equal(session.code, "web_session_required");
      for (const changes of [
        { visibility: "public" },
        { requestReview: true },
        { acceptVerification: true },
        { skyAnnotations: false },
      ]) {
        const web = await refusal(
          owner.update({
            tenantId: space.tenantId,
            userId: space.userId,
            captureId: created.id,
            changes,
            by: "device",
          }),
        );
        assert.equal(web.status, 403, JSON.stringify(changes));
        assert.equal(
          web.code,
          "visibility" in changes
            ? "visibility_web_only"
            : "web_session_required",
        );
      }
    });
  },
);

onBothBackends(
  "in the read-only window of an ended subscription the tags, the stage and every field are refused to both credentials, and the reading is kept",
  async (driver) => {
    const readOnly = {
      ...staticProfile(profile()),
      writeAccessFor: async () => ({ readOnly: true }),
    };
    await withServices(
      driver,
      { entitlementProvider: readOnly },
      async ({ owner, space }) => {
        const captureId = randomUUID();
        await driver.run(
          "INSERT INTO captures (id, tenant_id, session_id, original_name, sha256, byte_size, status, stage, created_at) VALUES (?, ?, ?, 'M31.jpg', ?, 14, 'uploaded', 'draft', ?)",
          [captureId, space.tenantId, space.sessionId, "d".repeat(64), at],
        );
        const h = hands(owner, space, captureId);
        for (const by of ["web", "device"]) {
          for (const attempt of [
            () => h.tags(["x"], { by }),
            () => h.stage("finalized", { by }),
            () =>
              h.edit({ "equipment.cameraId": space.equipment.camera }, { by }),
            () => h.edit({ targetIds: ["m31"] }, { by }),
            () => h.sync({ by }),
          ]) {
            const refused = await refusal(attempt());
            assert.equal(refused.code, "entitlement_read_only");
            assert.equal(refused.status, 403);
          }
        }
        assert.equal((await h.get()).revision, 1, "nothing was written");
      },
    );
  },
);

onBothBackends(
  "« Synchroniser avec la session » for a device is the web's function; a capture with neither a session nor a plan is 409",
  async (driver) => {
    await withServices(driver, {}, async ({ owner, space, send }) => {
      const bare = await newCapture(send);
      const without = await refusal(
        hands(owner, space, bare.id).sync({ by: "device" }),
      );
      assert.equal(without.code, "capture_without_session");
      assert.equal(without.status, 409);
      const joined = await newCapture(send, {}, PHONE);
      const h = hands(owner, space, joined.id);
      // The capture joins the night by the owner's hand: its lines arrive.
      const placed = await h.edit(
        { sessionId: space.sessionId },
        { by: "web" },
      );
      assert.equal(placed.metadata.acquisition.lines.length, 2);
      // The owner corrects one; the device asks again: the correction is kept.
      const [one] = placed.metadata.acquisition.lines;
      await h.edit(
        {
          acquisition: {
            line: one.id,
            set: { filter: "L-Pro", frameCount: 40, exposureSeconds: 180 },
          },
        },
        { by: "device" },
      );
      const done = await h.sync({ by: "device" });
      const byId = new Map(
        done.acquisition.lines.map((line) => [line.id, line]),
      );
      assert.equal(byId.size, 2, "nothing doubled");
      assert.equal(byId.get(one.id).filter, "L-Pro");
      assert.equal(byId.get(one.id).edited, true);
      assert.equal(
        [...byId.values()].filter(
          (line) => !line.edited && line.provenance === "measured",
        ).length,
        1,
      );
      assert.deepEqual(
        await contractErrors(
          "manage-captures.schema.json",
          "acquisitionSync",
          done,
        ),
        [],
      );
    });
  },
);

/** The multi-night plan of M31 with two nights, a declared one and a measured one. */
async function seedPlanImage(driver, space, send) {
  const projectId = randomUUID();
  await driver.run(
    "INSERT INTO projects (id, tenant_id, revision, status, payload_json, created_at, updated_at) VALUES (?, ?, 1, 'active', ?, ?, ?)",
    [
      projectId,
      space.tenantId,
      JSON.stringify({
        target: { targetId: "m31", name: "M31" },
        goalMinutes: 600,
        place: { name: "Col des Étoiles", latitude: 45, longitude: -30 },
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
  const declared = await seedDebriefedNight(driver, space, {
    date: "2026-10-09",
  });
  await driver.run(
    "UPDATE observation_sessions SET project_id = ? WHERE id = ?",
    [projectId, declared.sessionId],
  );
  const repository = await createProjectIntegrationRepository({ driver });
  const measuredNight = space.sessionId;
  await driver.run(
    "UPDATE observation_sessions SET project_id = ? WHERE id = ?",
    [projectId, measuredNight],
  );
  await repository.upsert(
    space.tenantId,
    projectId,
    [
      {
        nightId: measuredNight,
        targetId: "m31",
        filter: "Dual-band",
        exposureSeconds: 180,
        gain: 100,
        frameCount: 38,
        eveningDate: "2026-10-05",
        computerLabel: "Ordinateur du bureau",
      },
      {
        nightId: measuredNight,
        targetId: "m31",
        filter: "L",
        exposureSeconds: 120,
        gain: 100,
        frameCount: 20,
        eveningDate: "2026-10-05",
      },
    ],
    { keys: new Set(["m31"]) },
  );
  await repository.writeDeclaredIntegrationsForSession(
    space.tenantId,
    declared.sessionId,
  );
  const { body } = await send(
    image("plan", 140),
    {
      targetIds: [],
      role: "plan",
      projectId,
      combinedNightIds: [measuredNight, declared.sessionId],
      totalsByFilter: [
        { filter: "Dual-band", frameCount: 38, totalSeconds: 6840 },
      ],
      planRender: "dualband",
    },
    SYNC,
  );
  return {
    projectId,
    capture: body.capture,
    nights: { measured: measuredNight, declared: declared.sessionId },
  };
}

onBothBackends(
  "the image of a plan fills its lines from the sessions it combines — measured before declared, one per session, target and family — through both routes' function, and keeps the owner's",
  async (driver) => {
    await withServices(
      driver,
      { uploadOptions: { multiNightActive: async () => true } },
      async ({ owner, space, send }) => {
        const plan = await seedPlanImage(driver, space, send);
        // It arrived with its lines, without a touch.
        const h = hands(owner, space, plan.capture.id);
        const first = await h.get();
        assert.equal(first.projectId, plan.projectId);
        assert.deepEqual(
          first.plan.combinedNightIds.sort(),
          [plan.nights.measured, plan.nights.declared].sort(),
        );
        const summary = (lines) =>
          lines
            .map((line) => [
              line.sessionId,
              line.eveningDate,
              line.filter,
              line.provenance,
              line.frameCount,
            ])
            .sort();
        const expected = [
          [plan.nights.declared, "2026-10-09", null, "declared", 0],
          [plan.nights.measured, "2026-10-05", "Dual-band", "measured", 38],
          [plan.nights.measured, "2026-10-05", "L", "measured", 20],
        ].sort();
        assert.deepEqual(summary(first.metadata.acquisition.lines), expected);
        assert.equal(
          first.metadata.acquisition.lines.find(
            (line) => line.filter === "Dual-band",
          ).computerLabel,
          "Ordinateur du bureau",
        );
        // The owner adds a line and corrects one; asking again keeps both and doubles nothing.
        await h.edit(
          {
            acquisition: {
              add: { filter: "Ha", frameCount: 5, exposureSeconds: 60 },
            },
          },
          { by: "device" },
        );
        const dual = first.metadata.acquisition.lines.find(
          (line) => line.filter === "Dual-band",
        );
        await h.edit(
          {
            acquisition: {
              line: dual.id,
              set: {
                filter: "Dual-band",
                frameCount: 40,
                exposureSeconds: 180,
              },
            },
          },
          { by: "device" },
        );
        const done = await h.sync({ by: "device" });
        assert.equal(done.acquisition.lines.length, 4);
        assert.equal(
          done.acquisition.lines.find((line) => line.id === dual.id).frameCount,
          40,
        );
        assert.equal(
          (await h.sync({ by: "web" })).capture.revision,
          done.capture.revision,
          "twice: nothing moves",
        );
        assert.deepEqual(
          await contractErrors(
            "manage-captures.schema.json",
            "acquisitionSync",
            done,
          ),
          [],
        );
      },
    );
  },
);

const QUALITY = {
  fwhmPixels: 2.6,
  fwhmArcsec: 2.1,
  eccentricity: 0.38,
  starCount: 1840,
  measuredOn: "linear",
  measuredAt: "2026-10-14T08:00:00.000Z",
  tool: { name: "Astro Sync", version: "1.4.0" },
};

onBothBackends(
  "the stacked image's quality is written by Astro Sync under analysis.logs, dropped (and said) without it, kept on a private server, read by anyone, and refused to the phone and the web",
  async (driver) => {
    for (const [label, capabilities, stored] of [
      [
        "a subscription with the stats",
        profile({ "analysis.logs": true }),
        true,
      ],
      ["a free space", profile({ "analysis.logs": false }), false],
      ["a private server", undefined, true],
    ])
      await withServices(
        driver,
        capabilities ? { capabilities } : {},
        async ({ owner, uploads, space, send }) => {
          const metadata = {
            targetId: "m31",
            sessionId: space.sessionId,
            metadataSource: "astro-sync",
            imageQuality: QUALITY,
          };
          const sent = await send(image(`q-${label}`), metadata, SYNC);
          assert.equal(sent.status, 201, label);
          assert.deepEqual(
            sent.body.skipped ?? [],
            stored ? [] : [{ field: "imageQuality", reason: "capability" }],
            label,
          );
          const read = await owner.get({
            tenantId: space.tenantId,
            userId: space.userId,
            captureId: sent.body.capture.id,
          });
          assert.deepEqual(read.quality, stored ? QUALITY : null, label);
          assert.deepEqual(
            read.variants[0].quality,
            stored ? QUALITY : null,
            label,
          );
          assert.deepEqual(
            await contractErrors(
              "manage-captures.schema.json",
              "capture",
              read,
            ),
            [],
            label,
          );
          // The producers' image route: replaces the measure of the same image.
          const next = { ...QUALITY, fwhmPixels: 2.2, fwhmArcsec: 1.8 };
          const proposed = await owner.proposeVariantText({
            tenantId: space.tenantId,
            userId: space.userId,
            captureId: sent.body.capture.id,
            imageId: read.variants[0].id,
            source: "astro-sync",
            imageQuality: next,
          });
          assert.deepEqual(
            proposed.skipped,
            stored ? [] : [{ field: "imageQuality", reason: "capability" }],
            label,
          );
          assert.deepEqual(
            proposed.capture.quality,
            stored ? next : null,
            label,
          );
          // The phone and the web session never send it.
          for (const caller of [PHONE, WEB]) {
            const refused = await refusal(
              send(
                image(`q-${label}-${caller.kind}`),
                { ...metadata, targetId: "ic1396" },
                caller,
              ),
            );
            assert.equal(refused.code, "invalid_metadata", label);
            assert.equal(refused.body.error.field, "imageQuality", label);
          }
          // An image processed elsewhere has none; a measure out of bounds is refused.
          const bad = await refusal(
            send(
              image(`q-bad-${label}`),
              {
                ...metadata,
                targetId: "ic1396",
                imageQuality: { ...QUALITY, measuredOn: "stretched" },
              },
              SYNC,
            ),
          );
          assert.equal(bad.body.error.field, "imageQuality.measuredOn");
          // The resumable protocol keeps the proposal from its create step to its end.
          const bytes = image(`q-resumable-${label}`, 120);
          const created = await uploads.createUpload({
            tenantId: space.tenantId,
            userId: space.userId,
            caller: SYNC,
            originalName: "M31_stack.jpg",
            sha256: digest(bytes),
            byteSize: bytes.length,
            targetId: "ic1396",
            metadataSource: "astro-sync",
            imageQuality: QUALITY,
          });
          assert.equal(created.status, 201, label);
          await uploads.putUploadChunk({
            tenantId: space.tenantId,
            userId: space.userId,
            uploadId: created.body.uploadId,
            declaredOffset: 0,
            declaredContentLength: bytes.length,
            bodyChunks: once(bytes),
          });
          const finished = await uploads.finalizeUpload({
            tenantId: space.tenantId,
            userId: space.userId,
            uploadId: created.body.uploadId,
            caller: SYNC,
          });
          const resumable = await owner.get({
            tenantId: space.tenantId,
            userId: space.userId,
            captureId: finished.body.capture.id,
          });
          assert.deepEqual(resumable.quality, stored ? QUALITY : null, label);
        },
      );
  },
);

onBothBackends(
  "an image replaced takes its quality with it — the new image has its own, or none",
  async (driver) => {
    await withServices(
      driver,
      {
        capabilities: profile({
          "capture.variant_limit": 0,
          "analysis.logs": true,
        }),
      },
      async ({ owner, space, send }) => {
        const target = { sessionId: space.sessionId, targetId: "m31" };
        const first = await send(
          image("avant", 150),
          { ...target, metadataSource: "astro-sync", imageQuality: QUALITY },
          SYNC,
        );
        const second = await send(image("apres", 150), target, WEB);
        assert.equal(second.body.replaced, true);
        const read = await owner.get({
          tenantId: space.tenantId,
          userId: space.userId,
          captureId: first.body.capture.id,
        });
        assert.equal(read.quality, null);
        assert.equal(read.variants.length, 1);
        assert.equal(read.variants[0].quality, null);
      },
    );
  },
);

onBothBackends(
  "the session's quality on the capture's page is the Journal's own figures, with the session and the frames; none without a session or an analysis; the list reads none",
  async (driver) => {
    await withServices(driver, {}, async ({ owner, space, send }) => {
      const created = await newCapture(send, { sessionId: space.sessionId });
      const read = () =>
        owner.get({
          tenantId: space.tenantId,
          userId: space.userId,
          captureId: created.id,
        });
      assert.equal(
        (await read()).detail.sessionQuality,
        null,
        "no analysis yet",
      );
      await driver.run(
        `INSERT INTO session_analyses (id, tenant_id, session_id, report_version, report_json, created_at)
         VALUES (?, ?, ?, 2, ?, ?)`,
        [
          randomUUID(),
          space.tenantId,
          space.sessionId,
          JSON.stringify({
            pixelScaleArcsec: 0.8,
            quality: [
              {
                stepKey: "a",
                fwhmPixels: 2.5,
                eccentricity: 0.3,
                skyBackgroundAdu: 1200,
              },
              {
                stepKey: "a",
                fwhmPixels: 2.7,
                eccentricity: 0.4,
                skyBackgroundAdu: 1300,
              },
              {
                stepKey: "a",
                fwhmPixels: 2.9,
                eccentricity: 0.5,
                skyBackgroundAdu: 1400,
              },
            ],
          }),
          at,
        ],
      );
      const quality = (await read()).detail.sessionQuality;
      assert.deepEqual(quality, {
        sessionId: space.sessionId,
        eveningDate: "2026-10-05",
        frameCount: 3,
        skyBackground: 1300,
        fwhm: 2.16,
        eccentricity: 0.4,
      });
      // The Journal says the same figures for the same night.
      const journal = await createJournalService({
        driver,
        dialect: driver.dialect,
      });
      const line = (
        await journal.read({ tenantId: space.tenantId, query: {} })
      ).sessions.find((entry) => entry.sessionId === space.sessionId);
      assert.deepEqual(line.quality, {
        skyBackground: quality.skyBackground,
        fwhm: quality.fwhm,
        eccentricity: quality.eccentricity,
      });
      // Bounded: the owner's list reads no quality and adds no query per capture.
      const detached = await newCapture(send);
      await owner.updateMetadata({
        tenantId: space.tenantId,
        userId: space.userId,
        captureId: detached.id,
        metadata: { sessionId: null },
      });
      assert.equal(
        (
          await owner.get({
            tenantId: space.tenantId,
            userId: space.userId,
            captureId: detached.id,
          })
        ).detail.sessionQuality,
        null,
      );
      // Counted: the owner's list reads no analysis, whatever the page.
      const counted = [];
      const original = driver.query.bind(driver);
      driver.query = async (sql, params) => {
        counted.push(String(sql));
        return await original(sql, params);
      };
      const listed = await owner.list({
        tenantId: space.tenantId,
        userId: space.userId,
      });
      driver.query = original;
      assert.equal(
        counted.filter(
          (sql) =>
            sql ===
            "SELECT report_json FROM session_analyses WHERE tenant_id = ? AND session_id = ?",
        ).length,
        0,
        "the list does not read the session's quality of each capture",
      );
      assert.ok(
        listed.captures.every(
          (capture) => capture.detail.sessionQuality === undefined,
        ),
      );
      assert.deepEqual(
        await contractErrors(
          "manage-captures.schema.json",
          "capture",
          await read(),
        ),
        [],
      );
    });
  },
);

onBothBackends(
  "the device's list carries the title, the summary of the lines and the revision; the nights of an intermediate capture say what the plan gathered",
  async (driver) => {
    await withServices(
      driver,
      { uploadOptions: { multiNightActive: async () => true } },
      async ({ owner, uploads, space, send }) => {
        const created = await newCapture(send, { sessionId: space.sessionId });
        const h = hands(owner, space, created.id);
        await h.edit({ title: "M31 au col" }, { by: "device" });
        const page = await uploads.listCaptures({
          tenantId: space.tenantId,
          userId: space.userId,
        });
        const item = page.captures.find((capture) => capture.id === created.id);
        assert.equal(item.title, "M31 au col");
        assert.equal(item.revision, (await h.get()).revision);
        assert.deepEqual(item.acquisitionSummary, {
          lineCount: 2,
          frameCount: 58,
          exposureSeconds: null,
          integrationSeconds: 9240,
        });
        const owned = await owner.list({
          tenantId: space.tenantId,
          userId: space.userId,
        });
        assert.equal(
          owned.captures.find((capture) => capture.id === created.id).revision,
          item.revision,
        );
        // A capture that has no line of its own reads its night's steps for its card.
        await h.edit({ acquisition: null }, { by: "web" });
        const read = (
          await uploads.listCaptures({
            tenantId: space.tenantId,
            userId: space.userId,
          })
        ).captures.find((capture) => capture.id === created.id);
        assert.equal(read.acquisitionSummary.lineCount, 2);
        const bare = await newCapture(send);
        const none = (
          await uploads.listCaptures({
            tenantId: space.tenantId,
            userId: space.userId,
          })
        ).captures.find((capture) => capture.id === bare.id);
        assert.equal(none.acquisitionSummary, null);
        assert.equal(none.title, null);
        // The intermediate nights say what the plan gathered: measured, else declared, none for a night to come.
        const plan = await seedPlanImage(driver, space, send);
        const camera = await newCapture(send, {
          sessionId: plan.nights.declared,
        });
        const intermediate = (
          await owner.get({
            tenantId: space.tenantId,
            userId: space.userId,
            captureId: camera.id,
          })
        ).detail.intermediate;
        const gathered = Object.fromEntries(
          [...intermediate.sessionsDone, ...intermediate.sessionsPlanned].map(
            (night) => [night.sessionId, night.acquiredSeconds],
          ),
        );
        assert.equal(gathered[plan.nights.measured], 9240);
        assert.equal(gathered[plan.nights.declared], 5400);
        assert.deepEqual(
          await contractErrors(
            "manage-captures.schema.json",
            "intermediate",
            intermediate,
          ),
          [],
        );
      },
    );
  },
);

onBothBackends(
  "a capture that joins a session — at its upload, by the owner's hand, as a definition — arrives with the session's lines, replaced by the measured ones, never over the owner's, never doubled",
  async (driver) => {
    await withServices(driver, {}, async ({ owner, space, send }) => {
      const night = await seedDebriefedNight(driver, space, {
        date: "2026-10-09",
      });
      // Upload on a debriefed night with no analysis: the declared line.
      const declared = await newCapture(send, { sessionId: night.sessionId });
      const h = hands(owner, space, declared.id);
      const first = await h.get();
      assert.deepEqual(
        first.metadata.acquisition.lines.map((line) => [
          line.origin,
          line.provenance,
          line.integrationSeconds,
        ]),
        [["session", "declared", 5400]],
      );
      assert.equal(first.revision, 2, "filled once, in one step");
      // The owner adds a line; the analysis then arrives: the declared line is
      // replaced by the measured one, the owner's line stays.
      await h.edit(
        {
          acquisition: {
            add: { filter: "Ha", frameCount: 5, exposureSeconds: 60 },
          },
        },
        { by: "web" },
      );
      await driver.run(
        `INSERT INTO acquisition_steps (id, tenant_id, session_id, target_id, filter, frame_count, exposure_seconds, gain, origin, position, created_at, updated_at)
         VALUES (?, ?, ?, 'm31', 'Dual-band', 30, 180, 100, 'analysis', 1, ?, ?)`,
        [randomUUID(), space.tenantId, night.sessionId, at, at],
      );
      const { writeCaptureLinesForSession } =
        await import("../dist/captures/capture-lines-sync.js");
      assert.equal(
        await writeCaptureLinesForSession(
          driver,
          space.tenantId,
          night.sessionId,
        ),
        1,
      );
      const after = await h.get();
      assert.deepEqual(
        after.metadata.acquisition.lines
          .map((line) => [line.origin, line.provenance])
          .sort(),
        [
          ["astro-sync", "measured"],
          ["owner", "manual"],
        ],
      );
      // Again: nothing doubles, nothing moves.
      assert.equal(
        await writeCaptureLinesForSession(
          driver,
          space.tenantId,
          night.sessionId,
        ),
        0,
      );
      assert.equal((await h.get()).revision, after.revision);
      // A line the owner corrected is kept, not replaced.
      const measured = after.metadata.acquisition.lines.find(
        (line) => line.origin === "astro-sync",
      );
      await h.edit(
        {
          acquisition: {
            line: measured.id,
            set: { filter: "Dual-band", frameCount: 31, exposureSeconds: 180 },
          },
        },
        { by: "device" },
      );
      await driver.run(
        "UPDATE acquisition_steps SET frame_count = 33 WHERE session_id = ?",
        [night.sessionId],
      );
      await writeCaptureLinesForSession(
        driver,
        space.tenantId,
        night.sessionId,
      );
      assert.equal(
        (await h.get()).metadata.acquisition.lines.find(
          (line) => line.id === measured.id,
        ).frameCount,
        31,
      );
      // Joined later, by the owner's hand: the lines of the other night arrive.
      const loose = await newCapture(send);
      const joined = await hands(owner, space, loose.id).edit(
        { sessionId: space.sessionId },
        { by: "web" },
      );
      assert.equal(joined.metadata.acquisition.lines.length, 2);
      assert.ok(
        joined.metadata.acquisition.lines.every(
          (line) => line.provenance === "measured",
        ),
      );
      // A definition made on a night arrives filled.
      const definition = await owner.create({
        tenantId: space.tenantId,
        userId: space.userId,
        sessionId: space.otherSessionId,
        targetIds: ["m31"],
      });
      assert.equal(definition.sessionId, space.otherSessionId);
      assert.equal(
        definition.metadata.acquisition.own,
        false,
        "a night with nothing to say stays as it is",
      );
    });
  },
);

void createJournalService;
