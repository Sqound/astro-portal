// The deletion of a capture's files is a task written with the rows
// (`capture_file_deletions`, migration 110): a store that does not answer
// leaves the deletion of the capture done for the person, the files recorded
// for the hourly maintenance, which tries them again a longer time after each
// failure; a digest that an image holds again is never deleted; an image
// deleted while it was processed takes its derived files with it. On SQLite
// and PostgreSQL; every name and date is invented.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import test from "node:test";
import { createSessionTrashService } from "../dist/api/session-trash.js";
import { processCapture } from "../dist/captures/capture-processing.js";
import {
  FILE_DELETION_FIRST_DELAY_MS,
  FILE_DELETION_LONGEST_DELAY_MS,
  createFileDeletionRunner,
  fileDeletionDelayMs,
  recordFileDeletions,
} from "../dist/persistence/capture-file-deletions.js";
import { createCaptureRepository } from "../dist/persistence/capture-repository.js";
import { diskCaptureStore } from "../dist/uploads/capture-store.js";
import {
  capturePathFor,
  sharedCopyPathFor,
  thumbnailPathFor,
} from "../dist/uploads/capture-storage.js";
import { onBothBackends } from "./helpers/both-backends.mjs";
import { exists, withServices } from "./helpers/journal-space.mjs";
import {
  PHONE,
  SYNC,
  WEB,
  digest,
  image,
  profile,
} from "./helpers/metadata-space.mjs";

const MINUTE = 60_000;

/** The disk store, which refuses to delete while `down` is set. */
function flakyStore() {
  const disk = diskCaptureStore();
  const state = { down: false, removed: [] };
  const store = {
    ...disk,
    async remove(reference) {
      if (state.down) throw new Error("the capture store is unreachable");
      state.removed.push(reference);
      return await disk.remove(reference);
    },
  };
  return { state, store };
}

/** A clock the test moves. */
function clockAt() {
  const clock = { time: Date.now() };
  clock.now = () => new Date(clock.time).toISOString();
  clock.advance = (ms) => {
    clock.time += ms;
  };
  return clock;
}

const count = async (driver, sql, parameters = []) =>
  Number((await driver.query(sql, parameters)).rows[0].count);

/** Both services on the flaky store, the owner's clock the test's. */
const withFlaky = (driver, options, exercise) => {
  const flaky = flakyStore();
  const clock = clockAt();
  return withServices(
    driver,
    {
      ...options,
      uploadOptions: { captureStore: flaky.store },
      ownerOptions: { captureStore: flaky.store, now: clock.now },
    },
    (services) => exercise({ ...services, flaky, clock }),
  );
};

onBothBackends(
  "a capture deleted while the store is down is gone for the person; its files are deleted by the pass that follows the store's return, a longer wait after each failure",
  async (driver) => {
    await withFlaky(
      driver,
      {},
      async ({ owner, space, send, flaky, clock }) => {
        const bytes = image("stack", 200);
        const sent = await send(bytes, { targetId: "m31" }, WEB);
        const captureId = sent.body.capture.id;
        const original = capturePathFor(space.tenantId, digest(bytes));
        // A thumbnail and a shared copy are derived files of the same digest.
        for (const path of [
          thumbnailPathFor(space.tenantId, digest(bytes)),
          sharedCopyPathFor(space.tenantId, digest(bytes)),
        ]) {
          await mkdir(dirname(path), { recursive: true });
          await writeFile(path, "derived");
        }
        assert.ok(await exists(original));

        flaky.state.down = true;
        // The route answers 204 on this: the deletion resolves.
        assert.deepEqual(
          await owner.remove({ tenantId: space.tenantId, captureId }),
          { deleted: true, id: captureId },
        );
        // The rows are gone: the capture is gone for the person.
        for (const table of ["captures", "capture_variants"])
          assert.equal(
            await count(
              driver,
              `SELECT COUNT(*) AS count FROM ${table} WHERE tenant_id = ?`,
              [space.tenantId],
            ),
            0,
            table,
          );
        // The files are still there, and one task names them.
        assert.ok(await exists(original));
        let [task, ...others] = await owner.pendingFileDeletions();
        assert.equal(others.length, 0);
        assert.deepEqual(
          [task.tenantId, task.sha256, task.scope, task.attempts],
          [space.tenantId, digest(bytes), "all", 1],
        );
        assert.match(task.lastError, /unreachable/);
        assert.equal(
          Date.parse(task.nextAttemptAt) - clock.time,
          FILE_DELETION_FIRST_DELAY_MS,
        );

        // Not due yet: the pass leaves it alone.
        let pass = await owner.replayFileDeletions();
        assert.deepEqual([pass.done, pass.failed, pass.remaining], [0, 0, 1]);
        assert.equal((await owner.pendingFileDeletions())[0].attempts, 1);

        // Due, the store still down: another failure, twice the wait.
        clock.advance(FILE_DELETION_FIRST_DELAY_MS);
        pass = await owner.replayFileDeletions();
        assert.deepEqual([pass.done, pass.failed, pass.remaining], [0, 1, 1]);
        [task] = await owner.pendingFileDeletions();
        assert.equal(task.attempts, 2);
        assert.equal(
          Date.parse(task.nextAttemptAt) - clock.time,
          2 * FILE_DELETION_FIRST_DELAY_MS,
        );

        // The store answers again: the next pass deletes every file.
        flaky.state.down = false;
        clock.advance(2 * FILE_DELETION_FIRST_DELAY_MS);
        pass = await owner.replayFileDeletions();
        assert.deepEqual([pass.done, pass.failed, pass.remaining], [1, 0, 0]);
        assert.equal(await exists(original), false);
        assert.equal(
          await exists(thumbnailPathFor(space.tenantId, digest(bytes))),
          false,
        );
        assert.equal(
          await exists(sharedCopyPathFor(space.tenantId, digest(bytes))),
          false,
        );
        assert.deepEqual(await owner.pendingFileDeletions(), []);
      },
    );
  },
);

onBothBackends(
  "with the store up the files go at once and no task remains; a capture with variants and a progression image takes all its files",
  async (driver) => {
    await withFlaky(driver, {}, async ({ owner, space, send }) => {
      const main = image("main", 200);
      const stack = image("stack", 300);
      const first = await send(main, { targetId: "m31" }, PHONE);
      const captureId = first.body.capture.id;
      await send(stack, { captureId }, SYNC);
      assert.ok(await exists(capturePathFor(space.tenantId, digest(stack))));
      await owner.remove({ tenantId: space.tenantId, captureId });
      for (const bytes of [main, stack])
        assert.equal(
          await exists(capturePathFor(space.tenantId, digest(bytes))),
          false,
        );
      assert.deepEqual(await owner.pendingFileDeletions(), []);
    });
  },
);

onBothBackends(
  "an image deleted while the store is down is gone from its capture; its files are recorded, then deleted",
  async (driver) => {
    await withFlaky(
      driver,
      {},
      async ({ owner, space, send, flaky, clock }) => {
        const main = image("main", 200);
        const extra = image("extra", 300);
        const first = await send(main, { targetId: "m31" }, PHONE);
        const captureId = first.body.capture.id;
        const second = await send(extra, { captureId }, SYNC);
        flaky.state.down = true;
        const after = await owner.deleteVariant({
          tenantId: space.tenantId,
          captureId,
          imageId: second.body.variant.id,
        });
        assert.equal(after.variants.length, 1);
        assert.ok(await exists(capturePathFor(space.tenantId, digest(extra))));
        const pending = await owner.pendingFileDeletions();
        assert.deepEqual(
          pending.map((task) => [task.sha256, task.attempts]),
          [[digest(extra), 1]],
        );
        // The image that stays is not touched.
        assert.ok(await exists(capturePathFor(space.tenantId, digest(main))));
        flaky.state.down = false;
        clock.advance(FILE_DELETION_FIRST_DELAY_MS);
        assert.equal((await owner.replayFileDeletions()).done, 1);
        assert.equal(
          await exists(capturePathFor(space.tenantId, digest(extra))),
          false,
        );
        assert.ok(await exists(capturePathFor(space.tenantId, digest(main))));
      },
    );
  },
);

onBothBackends(
  "the image a new one replaces is gone from the capture whatever the store does; its bytes are deleted on a later pass",
  async (driver) => {
    await withFlaky(
      driver,
      { capabilities: profile({ "capture.variant_limit": 0 }) },
      async ({ owner, space, send, flaky, clock }) => {
        const target = { sessionId: space.sessionId, targetId: "m31" };
        const before = image("before", 200);
        const afterBytes = image("after", 220);
        await send(before, target, PHONE);
        flaky.state.down = true;
        const replacement = await send(afterBytes, target, SYNC);
        assert.equal(replacement.status, 201);
        assert.equal(replacement.body.replaced, true);
        assert.ok(await exists(capturePathFor(space.tenantId, digest(before))));
        assert.deepEqual(
          (await owner.pendingFileDeletions()).map((task) => task.sha256),
          [digest(before)],
        );
        flaky.state.down = false;
        clock.advance(24 * 60 * MINUTE);
        assert.equal((await owner.replayFileDeletions()).done, 1);
        assert.equal(
          await exists(capturePathFor(space.tenantId, digest(before))),
          false,
        );
        assert.ok(
          await exists(capturePathFor(space.tenantId, digest(afterBytes))),
        );
      },
    );
  },
);

onBothBackends(
  "the erasure of a session takes its captures whatever the store does: it is no longer reported as failed, and the files are recorded",
  async (driver) => {
    await withFlaky(
      driver,
      {},
      async ({ owner, space, send, flaky, clock }) => {
        const bytes = image("night", 200);
        const sent = await send(
          bytes,
          { sessionId: space.sessionId, targetId: "m31" },
          PHONE,
        );
        assert.equal(sent.body.capture.sessionId, space.sessionId);
        const trash = await createSessionTrashService({
          driver,
          dialect: driver.dialect,
          now: clock.now,
          removeCapture: ({ tenantId, captureId }) =>
            owner.remove({ tenantId, captureId, sessionErased: true }),
        });
        await trash.remove({
          tenantId: space.tenantId,
          sessionId: space.sessionId,
        });
        flaky.state.down = true;
        const purge = await trash.purgeExpired({
          at: new Date(clock.time + 40 * 24 * 60 * MINUTE).toISOString(),
        });
        assert.equal(purge.failed, 0);
        assert.equal(purge.sessions >= 1, true);
        assert.equal(purge.captures, 1);
        assert.equal(
          await count(
            driver,
            "SELECT COUNT(*) AS count FROM captures WHERE tenant_id = ?",
            [space.tenantId],
          ),
          0,
        );
        assert.deepEqual(
          (await owner.pendingFileDeletions()).map((task) => task.sha256),
          [digest(bytes)],
        );
        flaky.state.down = false;
        clock.advance(FILE_DELETION_FIRST_DELAY_MS);
        assert.equal((await owner.replayFileDeletions()).done, 1);
        assert.equal(
          await exists(capturePathFor(space.tenantId, digest(bytes))),
          false,
        );
      },
    );
  },
);

onBothBackends(
  "bytes sent again after the deletion are never deleted by the task that was waiting: the digest is held again",
  async (driver) => {
    await withFlaky(
      driver,
      {},
      async ({ owner, space, send, flaky, clock }) => {
        const bytes = image("again", 200);
        const first = await send(bytes, { targetId: "m31" }, WEB);
        flaky.state.down = true;
        await owner.remove({
          tenantId: space.tenantId,
          captureId: first.body.capture.id,
        });
        assert.equal((await owner.pendingFileDeletions()).length, 1);
        // The same bytes, sent again (the file is still on the store).
        const second = await send(bytes, { targetId: "m31" }, WEB);
        assert.equal(second.status, 201);
        flaky.state.down = false;
        clock.advance(FILE_DELETION_FIRST_DELAY_MS);
        const pass = await owner.replayFileDeletions();
        assert.deepEqual(
          [pass.done, pass.cancelled, pass.remaining],
          [0, 1, 0],
        );
        assert.ok(await exists(capturePathFor(space.tenantId, digest(bytes))));
        assert.deepEqual(flaky.state.removed, []);
      },
    );
  },
);

onBothBackends(
  "an upload of the same bytes in progress defers the task, and the deferral is no failure",
  async (driver) => {
    await withFlaky(driver, {}, async ({ owner, space, flaky, clock }) => {
      const sha256 = digest(image("pending", 150));
      await recordFileDeletions(driver, {
        tenantId: space.tenantId,
        digests: [sha256],
        at: new Date(clock.time),
      });
      await driver.run(
        `INSERT INTO upload_sessions (id, tenant_id, sha256, byte_size, original_name, chunk_size, state, part_path, created_at, updated_at, expires_at)
         VALUES (?, ?, ?, 150, 'a.jpg', 1024, 'in_progress', 'part', ?, ?, ?)`,
        [
          "5d3b0f1e-5c53-4d3e-8a6b-2f0a7c8d9e10",
          space.tenantId,
          sha256,
          new Date(clock.time).toISOString(),
          new Date(clock.time).toISOString(),
          new Date(clock.time + 86_400_000).toISOString(),
        ],
      );
      const pass = await owner.replayFileDeletions();
      assert.deepEqual(
        [pass.deferred, pass.failed, pass.done, pass.remaining],
        [1, 0, 0, 1],
      );
      const [task] = await owner.pendingFileDeletions();
      assert.equal(task.attempts, 0);
      assert.ok(Date.parse(task.nextAttemptAt) > clock.time);
      assert.deepEqual(flaky.state.removed, []);
    });
  },
);

test("the wait doubles after each failure, from five minutes to six hours", () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7, 20].map(
      (attempts) => fileDeletionDelayMs(attempts) / MINUTE,
    ),
    [5, 10, 20, 40, 80, 160, 320, 360],
  );
  assert.equal(fileDeletionDelayMs(99), FILE_DELETION_LONGEST_DELAY_MS);
});

onBothBackends(
  "a task is written once per space, digest and scope, and only for a digest",
  async (driver) => {
    await withFlaky(driver, {}, async ({ space }) => {
      const sha256 = digest("one");
      const named = await recordFileDeletions(driver, {
        tenantId: space.tenantId,
        digests: [sha256, sha256, "no-image:placeholder", null, "ABC"],
      });
      assert.equal(named, 1);
      await recordFileDeletions(driver, {
        tenantId: space.tenantId,
        digests: [sha256],
      });
      await recordFileDeletions(driver, {
        tenantId: space.tenantId,
        digests: [sha256],
        scope: "derived",
      });
      assert.equal(
        await count(
          driver,
          "SELECT COUNT(*) AS count FROM capture_file_deletions",
        ),
        2,
      );
      await assert.rejects(
        recordFileDeletions(driver, {
          tenantId: space.tenantId,
          digests: [sha256],
          scope: "everything",
        }),
        /not a scope/,
      );
    });
  },
);

onBothBackends(
  "the processing of an image deleted meanwhile removes the derived files it wrote, or records them when the store is down",
  async (driver) => {
    await withFlaky(driver, {}, async ({ space, send, flaky, clock }) => {
      const store = await createCaptureRepository({
        driver,
        dialect: driver.dialect,
        migrate: false,
      });
      const main = image("main", 200);
      const extra = image("extra", 300);
      const first = await send(main, { targetId: "m31" }, PHONE);
      const captureId = first.body.capture.id;
      const second = await send(extra, { captureId }, SYNC);
      const variant = (
        await store.listVariants(space.tenantId, captureId)
      ).find((found) => !found.main);
      assert.equal(variant.id, second.body.variant.id);
      const derived = thumbnailPathFor(space.tenantId, digest(extra));
      // The thumbnail is written while the owner deletes the image.
      const thumbnail = async () => {
        await store.deleteVariant(space.tenantId, captureId, variant.id);
        await mkdir(dirname(derived), { recursive: true });
        await writeFile(derived, "thumbnail");
        return { written: true };
      };
      await processCapture({
        store,
        tenantId: space.tenantId,
        capture: { id: captureId },
        variant,
        thumbnail,
        dimensions: async () => null,
        check: async () => ({ result: "sky", reason: null }),
        captureStore: flaky.store,
        log: () => {},
      });
      // The task of the deletion itself named the original and the derived
      // files; the guard removed what the processing wrote since.
      assert.equal(await exists(derived), false);

      // Store down: the guard records the derived files, the pass deletes them.
      const third = await send(image("third", 250), { captureId }, SYNC);
      const other = (await store.listVariants(space.tenantId, captureId)).find(
        (found) => found.id === third.body.variant.id,
      );
      const otherDerived = thumbnailPathFor(space.tenantId, other.sha256);
      flaky.state.down = true;
      await processCapture({
        store,
        tenantId: space.tenantId,
        capture: { id: captureId },
        variant: other,
        thumbnail: async () => {
          await store.deleteVariant(space.tenantId, captureId, other.id);
          await mkdir(dirname(otherDerived), { recursive: true });
          await writeFile(otherDerived, "thumbnail");
          return { written: true };
        },
        dimensions: async () => null,
        check: async () => ({ result: "sky", reason: null }),
        captureStore: flaky.store,
        log: () => {},
      });
      assert.ok(await exists(otherDerived));
      const runner = createFileDeletionRunner({
        db: driver,
        files: () => flaky.store,
        clock: () => new Date(clock.time + 24 * 60 * MINUTE),
      });
      assert.equal((await runner.pending()).length >= 1, true);
      flaky.state.down = false;
      const pass = await runner.replay();
      assert.equal(pass.failed, 0);
      assert.equal(pass.remaining, 0);
      assert.equal(await exists(otherDerived), false);
    });
  },
);
