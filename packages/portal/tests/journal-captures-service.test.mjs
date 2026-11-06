// The service of the captures and their session — a capture joins the
// session of its night, there is one capture per session and target (a
// second image replaces the first or is kept as a variant, by the
// capability `capture.variant_limit` read, never an offer's name), an
// acquisition line says where it comes from and « Synchroniser avec la
// session » fills it. On SQLite and PostgreSQL; every name and date is
// invented.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { CAPABILITY_UNLIMITED } from "astro-contracts/capabilities";
import { capturePathFor } from "../dist/uploads/capture-storage.js";
import { onBothBackends } from "./helpers/both-backends.mjs";
import {
  exists,
  refusal,
  seedDebriefedNight,
  seedSession,
  withServices,
} from "./helpers/journal-space.mjs";
import {
  PHONE,
  SYNC,
  WEB,
  digest,
  image,
  profile,
} from "./helpers/metadata-space.mjs";

async function* once(buffer) {
  yield buffer;
}

onBothBackends(
  "a capture without a session joins the session of its night that carries its target, the place breaking a tie; detached, listed by session",
  async (driver) => {
    await withServices(driver, {}, async ({ owner, uploads, space, send }) => {
      // A decoy of the same evening at another place, started earlier: it
      // would win by its start alone.
      const decoy = await seedSession(driver, space, {
        date: "2026-10-05",
        place: "Ailleurs",
        startedAt: "2026-10-05T18:00:00.000Z",
        target: "m31",
      });
      const cases = [
        // [label, metadata, the session the capture joins]
        ["night + target carried", { planId: space.planId }, space.sessionId],
        [
          "a target the night did not carry",
          { planId: space.planId, targetId: "ic1396" },
          null,
        ],
        ["no night to date it by", {}, null],
        [
          "a session named by the upload is kept",
          { sessionId: space.otherSessionId },
          space.otherSessionId,
        ],
      ];
      let index = 0;
      for (const [label, extra, expected] of cases) {
        index += 1;
        const { body } = await send(image(`joins-${index}`), {
          targetId: "m31",
          ...extra,
        });
        assert.equal(body.capture.sessionId, expected, label);
        if (expected === space.sessionId)
          assert.equal(body.capture.planId, space.planId);
      }
      assert.notEqual(decoy.sessionId, space.sessionId);
      const joined = (
        await uploads.listCaptures({
          tenantId: space.tenantId,
          userId: space.userId,
          sessionId: space.sessionId,
        })
      ).captures;
      assert.equal(
        joined.length,
        1,
        "?sessionId= lists the session's captures",
      );
      // Detached: the capture leaves its session and the plan it read from it.
      const detached = await owner.updateMetadata({
        tenantId: space.tenantId,
        userId: space.userId,
        captureId: joined[0].id,
        metadata: { sessionId: null },
      });
      assert.equal(detached.sessionId, null);
      assert.equal(detached.planId, null);
      assert.equal(
        (
          await uploads.listCaptures({
            tenantId: space.tenantId,
            userId: space.userId,
            sessionId: space.sessionId,
          })
        ).captures.length,
        0,
      );
    });
  },
);

onBothBackends(
  "Astro Sync's replacement of a public capture's image keeps it public, with the date it turned public, and says nothing of a return to private",
  async (driver) => {
    await withServices(
      driver,
      { capabilities: profile({ "capture.variant_limit": 0 }) },
      async ({ uploads, space, send }) => {
        const target = { sessionId: space.sessionId, targetId: "m31" };
        const first = await send(image("keep-a", 200), target, PHONE);
        await uploads.setCaptureVisibility({
          tenantId: space.tenantId,
          userId: space.userId,
          captureId: first.body.capture.id,
          visibility: "public",
        });
        const listing = () =>
          uploads.listCaptures({
            tenantId: space.tenantId,
            userId: space.userId,
            sessionId: space.sessionId,
          });
        const before = (await listing()).captures[0];
        const kept = await send(image("keep-b", 200), target, SYNC);
        assert.equal(kept.body.replaced, true);
        assert.equal(kept.body.capture.visibility, "public");
        assert.equal(kept.body.capture.madePublicAt, before.madePublicAt);
        assert.equal(kept.body.capture.replacedMadePrivate, undefined);
        assert.equal(kept.body.capture.replacedSource, "phone");
        const after = (await listing()).captures[0];
        assert.equal(after.visibility, "public");
        assert.equal(after.madePublicAt, before.madePublicAt);
        assert.equal(after.replacedMadePrivate, undefined);
        // A stacked image sent by Astro Sync is the same.
        const stacked = await send(
          image("keep-c", 200),
          { ...target, source: "stacking" },
          SYNC,
        );
        assert.equal(stacked.body.capture.visibility, "public");
        assert.equal(stacked.body.capture.madePublicAt, before.madePublicAt);
      },
    );
  },
);

onBothBackends(
  "a public capture whose image is replaced goes back to private and says so, until the owner writes the visibility; a private one says nothing",
  async (driver) => {
    await withServices(
      driver,
      { capabilities: profile({ "capture.variant_limit": 0 }) },
      async ({ uploads, space, send }) => {
        const target = { sessionId: space.sessionId, targetId: "m31" };
        // A private capture replaced: it was private, nothing is announced.
        const first = await send(image("made-a", 200), target, PHONE);
        const quiet = await send(image("made-b", 200), target, WEB);
        assert.equal(quiet.body.replaced, true);
        assert.equal(quiet.body.capture.visibility, "private");
        assert.equal(quiet.body.capture.replacedMadePrivate, undefined);
        // The same capture, made public, then replaced by the web's image
        // (Astro Sync's own replacement keeps the state, below).
        assert.equal(
          await uploads.setCaptureVisibility({
            tenantId: space.tenantId,
            userId: space.userId,
            captureId: first.body.capture.id,
            visibility: "public",
          }),
          true,
        );
        // It carries the date it turned public, and the replacement, which
        // makes it private, clears it.
        const dated = await uploads.listCaptures({
          tenantId: space.tenantId,
          userId: space.userId,
          sessionId: space.sessionId,
        });
        assert.match(dated.captures[0].madePublicAt, /^\d{4}-\d{2}-\d{2}T/);
        const told = await send(image("made-c", 200), target, WEB);
        assert.equal(told.body.replaced, true);
        assert.equal(told.body.capture.visibility, "private");
        assert.equal(told.body.capture.madePublicAt, undefined);
        assert.equal(told.body.capture.replacedMadePrivate, true);
        // The capture keeps saying it afterwards, on the list too.
        const listed = await uploads.listCaptures({
          tenantId: space.tenantId,
          userId: space.userId,
          sessionId: space.sessionId,
        });
        assert.equal(listed.captures[0].replacedMadePrivate, true);
        // Another replacement while it is still private does not unsay it.
        const again = await send(image("made-d", 200), target, WEB);
        assert.equal(again.body.capture.replacedMadePrivate, true);
        // The owner publishes it again: the news is gone, then chooses
        // private: still nothing to announce.
        for (const visibility of ["public", "private"]) {
          await uploads.setCaptureVisibility({
            tenantId: space.tenantId,
            userId: space.userId,
            captureId: first.body.capture.id,
            visibility,
          });
          const after = await uploads.listCaptures({
            tenantId: space.tenantId,
            userId: space.userId,
            sessionId: space.sessionId,
          });
          assert.equal(after.captures[0].replacedMadePrivate, undefined);
        }
      },
    );
  },
);

onBothBackends(
  "one capture per session and target — variant_limit 0 replaces and frees the bytes; above 0 a variant, the main one from Astro Sync; at the limit 409; unlimited, a variant",
  async (driver) => {
    const target = { sessionId: undefined, targetId: "m31" };
    // The quota holds one image of 200 bytes and a little: a replacement
    // that did not free the old bytes would not fit.
    await withServices(
      driver,
      {
        capabilities: profile({
          "capture.variant_limit": 0,
          "storage.quota_bytes": 350,
        }),
      },
      async ({ uploads, space, send }) => {
        target.sessionId = space.sessionId;
        const first = await send(image("zero-a", 200), target, PHONE);
        assert.equal(first.status, 201);
        assert.equal(first.body.replaced, false);
        const second = await send(image("zero-b", 200), target, WEB);
        assert.equal(second.status, 201);
        assert.equal(second.body.replaced, true);
        assert.equal(second.body.capture.id, first.body.capture.id);
        assert.equal(second.body.capture.sha256, digest(image("zero-b", 200)));
        assert.ok(second.body.capture.replacedAt);
        assert.equal(second.body.capture.replacedSource, "phone");
        assert.equal(
          second.body.storage.usedBytes,
          200,
          "the old bytes are released",
        );
        assert.equal(
          await exists(
            capturePathFor(space.tenantId, digest(image("zero-a", 200))),
          ),
          false,
          "the replaced file is gone",
        );
        const listed = await uploads.listCaptures({
          tenantId: space.tenantId,
          userId: space.userId,
          sessionId: space.sessionId,
        });
        assert.equal(listed.captures.length, 1, "still one capture");
        assert.equal(listed.captures[0].replacedSource, "phone");
        // Another target of the session is another capture.
        const other = await send(image("zero-c", 100), {
          sessionId: space.sessionId,
          targetId: "ic1396",
        });
        assert.notEqual(other.body.capture.id, first.body.capture.id);
        // The image of a multi-night plan is outside the rule.
        assert.equal(other.body.replaced, false);
      },
    );
    for (const [limit, expected] of [
      [2, "bounded"],
      [CAPABILITY_UNLIMITED, "unlimited"],
    ])
      await withServices(
        driver,
        { capabilities: profile({ "capture.variant_limit": limit }) },
        async ({ owner, space, send }) => {
          const metadata = { sessionId: space.sessionId, targetId: "m31" };
          const first = await send(image(`${expected}-a`), metadata, PHONE);
          const variant = await send(image(`${expected}-b`), metadata, WEB);
          assert.equal(variant.body.replaced, false);
          assert.equal(variant.body.capture.id, first.body.capture.id);
          assert.equal(
            variant.body.variant.main,
            false,
            "from the web: a variant",
          );
          // Astro Sync's image becomes the main one; the former is a variant.
          const synced = await send(image(`${expected}-c`), metadata, SYNC);
          assert.equal(synced.body.variant.main, true);
          assert.equal(
            synced.body.capture.sha256,
            digest(image(`${expected}-c`)),
          );
          const detail = await owner.get({
            tenantId: space.tenantId,
            userId: space.userId,
            captureId: first.body.capture.id,
          });
          assert.equal(detail.variants.length, 3);
          assert.equal(detail.variants.filter((entry) => entry.main).length, 1);
          assert.equal(detail.replacedAt, null);
          if (limit === 2) {
            const over = await refusal(
              send(image(`${expected}-d`), metadata, SYNC),
            );
            assert.equal(over.code, "capture_variant_limit_reached");
            assert.equal(over.status, 409);
          } else {
            const more = await send(image(`${expected}-d`), metadata, SYNC);
            assert.equal(more.body.replaced, false);
          }
          // A public capture keeps its main image: the new one is a variant.
          await driver.run(
            "UPDATE captures SET visibility = 'public' WHERE id = ?",
            [first.body.capture.id],
          );
          if (limit !== 2) {
            const kept = await send(image(`${expected}-e`), metadata, SYNC);
            assert.equal(kept.body.variant.main, false);
          }
        },
      );
  },
);

onBothBackends(
  "the resumable protocol applies the same rule at its end",
  async (driver) => {
    await withServices(
      driver,
      { capabilities: profile({ "capture.variant_limit": 0 }) },
      async ({ uploads, space, send }) => {
        const metadata = { sessionId: space.sessionId, targetId: "m31" };
        const first = await send(image("resumable-a", 150), metadata, PHONE);
        const bytes = image("resumable-b", 150);
        const created = await uploads.createUpload({
          tenantId: space.tenantId,
          userId: space.userId,
          caller: SYNC,
          originalName: "M31_stack.jpg",
          sha256: digest(bytes),
          byteSize: bytes.length,
          ...metadata,
        });
        assert.equal(created.status, 201);
        await uploads.putUploadChunk({
          tenantId: space.tenantId,
          userId: space.userId,
          uploadId: created.body.uploadId,
          declaredOffset: 0,
          declaredContentLength: bytes.length,
          bodyChunks: once(bytes),
        });
        const done = await uploads.finalizeUpload({
          tenantId: space.tenantId,
          userId: space.userId,
          uploadId: created.body.uploadId,
          caller: SYNC,
        });
        assert.equal(done.body.replaced, true);
        assert.equal(done.body.capture.id, first.body.capture.id);
        assert.equal(done.body.capture.sha256, digest(bytes));
        assert.equal(done.body.capture.replacedSource, "phone");
      },
    );
  },
);

onBothBackends(
  "the provenance of an acquisition line is derived — declared, measured, manual — and refused in a request",
  async (driver) => {
    await withServices(driver, {}, async ({ owner, space, send }) => {
      const { body } = await send(image("provenance"), {
        sessionId: space.sessionId,
        targetId: "m31",
      });
      const read = async () =>
        (
          await owner.get({
            tenantId: space.tenantId,
            userId: space.userId,
            captureId: body.capture.id,
          })
        ).metadata.acquisition.lines;
      // The night's steps are Astro Sync's analysis: measured — and they arrive
      // in the capture's own lines without a touch, as « Synchroniser avec la
      // session » would write them.
      assert.deepEqual(
        (await read()).map((line) => [line.origin, line.provenance]),
        [
          ["astro-sync", "measured"],
          ["astro-sync", "measured"],
        ],
      );
      // Back to the night's steps, a step of a hand-made night is manual.
      await owner.updateMetadata({
        tenantId: space.tenantId,
        userId: space.userId,
        captureId: body.capture.id,
        metadata: { acquisition: null },
      });
      await driver.run(
        "UPDATE acquisition_steps SET origin = 'manual' WHERE session_id = ?",
        [space.sessionId],
      );
      assert.deepEqual(
        (await read()).map((line) => line.provenance),
        ["manual", "manual"],
      );
      const write = (metadata) =>
        owner.updateMetadata({
          tenantId: space.tenantId,
          userId: space.userId,
          captureId: body.capture.id,
          metadata,
        });
      await write({
        acquisition: {
          add: { filter: "Ha", frameCount: 10, exposureSeconds: 60 },
        },
      });
      const proposed = (source, filter) =>
        owner.proposeMetadata({
          tenantId: space.tenantId,
          userId: space.userId,
          captureId: body.capture.id,
          proposed: {
            source,
            acquisition: [{ filter, frameCount: 5, exposureSeconds: 30 }],
          },
        });
      await proposed("astro-sync", "OIII");
      await proposed("import", "SII");
      const byFilter = Object.fromEntries(
        (await read()).map((line) => [
          line.filter,
          [line.origin, line.provenance],
        ]),
      );
      assert.deepEqual(byFilter.Ha, ["owner", "manual"]);
      assert.deepEqual(byFilter.OIII, ["astro-sync", "measured"]);
      assert.deepEqual(byFilter.SII, ["import", "manual"]);
      // The provenance is read only.
      const sent = await refusal(
        write({
          acquisition: {
            add: {
              filter: "L",
              frameCount: 1,
              exposureSeconds: 1,
              provenance: "measured",
            },
          },
        }),
      );
      assert.equal(sent.code, "invalid_request");
      assert.equal(sent.status, 400);
    });
  },
);

onBothBackends(
  "« Synchroniser avec la session » fills the lines from the analysis, keeps the owner's, the imported and the corrected ones, and does it twice without doubling",
  async (driver) => {
    await withServices(driver, {}, async ({ owner, space, send }) => {
      const { body } = await send(image("d4a"), {
        sessionId: space.sessionId,
        targetId: "m31",
      });
      const params = {
        tenantId: space.tenantId,
        userId: space.userId,
        captureId: body.capture.id,
      };
      await owner.updateMetadata({
        ...params,
        metadata: {
          acquisition: {
            add: { filter: "L-Pro", frameCount: 12, exposureSeconds: 20 },
          },
        },
      });
      const first = await owner.syncAcquisition(params);
      const lines = first.acquisition.lines;
      assert.deepEqual(
        lines.map((line) => [line.origin, line.provenance]).sort(),
        [
          ["astro-sync", "measured"],
          ["astro-sync", "measured"],
          ["owner", "manual"],
        ],
      );
      assert.equal(first.acquisition.totalFrames, 38 + 20 + 12);
      assert.equal(first.capture.id, body.capture.id);
      // A line corrected by hand is kept by the next synchronisation.
      const measured = lines.find((line) => line.origin === "astro-sync");
      await owner.updateMetadata({
        ...params,
        metadata: {
          acquisition: {
            line: measured.id,
            set: {
              filter: measured.filter,
              frameCount: 99,
              exposureSeconds: 10,
            },
          },
        },
      });
      const again = await owner.syncAcquisition(params);
      assert.equal(again.acquisition.lines.length, 3 + 0, "not doubled");
      assert.ok(
        again.acquisition.lines.some(
          (line) => line.frameCount === 99 && line.edited,
        ),
      );
    });
  },
);

onBothBackends(
  "without an analysis the session declares one line per target, from the debriefing: seconds, no frames known",
  async (driver) => {
    await withServices(driver, {}, async ({ owner, space, send }) => {
      const night = await seedDebriefedNight(driver, space);
      const { body } = await send(image("d4b"), {
        sessionId: night.sessionId,
        targetId: "m31",
      });
      const params = {
        tenantId: space.tenantId,
        userId: space.userId,
        captureId: body.capture.id,
      };
      const synced = await owner.syncAcquisition(params);
      assert.equal(synced.acquisition.lines.length, 1);
      const [line] = synced.acquisition.lines;
      assert.equal(line.origin, "session");
      assert.equal(line.provenance, "declared");
      assert.equal(line.frameCount, 0);
      assert.equal(line.exposureSeconds, 0);
      assert.equal(line.integrationSeconds, 5400, "the declared 1 h 30");
      assert.equal(synced.acquisition.totalSeconds, 5400);
      // The debriefing gave the frames: the line reads frames × exposure.
      await driver.run(
        "UPDATE plans SET debrief_targets_json = ? WHERE id = ?",
        [
          JSON.stringify([
            {
              targetId: "item-m31",
              state: "done",
              acquiredMinutes: 90,
              frameCount: 30,
            },
          ]),
          night.planId,
        ],
      );
      const framed = await owner.syncAcquisition(params);
      assert.equal(framed.acquisition.lines.length, 1);
      assert.equal(framed.acquisition.lines[0].frameCount, 30);
      assert.equal(framed.acquisition.lines[0].exposureSeconds, 180);
      assert.equal(framed.acquisition.lines[0].integrationSeconds, 5400);
    });
  },
);

onBothBackends(
  "refused without a session (409), for another space's or an unknown capture (404), and in the read-only window (403)",
  async (driver) => {
    await withServices(driver, {}, async ({ owner, space, send }) => {
      const { body } = await send(image("d4c"), { targetId: "m31" });
      const params = (captureId) => ({
        tenantId: space.tenantId,
        userId: space.userId,
        captureId,
      });
      const bare = await refusal(
        owner.syncAcquisition(params(body.capture.id)),
      );
      assert.deepEqual(
        [bare.code, bare.status],
        ["capture_without_session", 409],
      );
      const unknown = await refusal(
        owner.syncAcquisition(params(randomUUID())),
      );
      assert.deepEqual(
        [unknown.code, unknown.status],
        ["capture_not_found", 404],
      );
    });
    await withServices(
      driver,
      {
        entitlementProvider: {
          capabilitiesFor: async () => profile(),
          writeAccessFor: async () => ({ readOnly: true }),
        },
      },
      async ({ owner, space }) => {
        const locked = await refusal(
          owner.syncAcquisition({
            tenantId: space.tenantId,
            userId: space.userId,
            captureId: randomUUID(),
          }),
        );
        assert.deepEqual(
          [locked.code, locked.status],
          ["entitlement_read_only", 403],
        );
      },
    );
  },
);
