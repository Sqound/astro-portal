import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { createUploadResourceService } from "../dist/api/upload-resources.js";
import {
  captureProcessingIdle,
  createCaptureProcessor,
  pauseCaptureProcessing,
  processCapture,
  queueCaptureProcessing,
} from "../dist/captures/capture-processing.js";
import { captureState } from "../dist/captures/capture-state.js";
import { SKY_CHECK_VERDICT } from "../dist/captures/sky-check-verdict.js";
import { createCaptureRepository } from "../dist/persistence/capture-repository.js";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import {
  capturePathFor,
  thumbnailPathFor,
} from "../dist/uploads/capture-storage.js";
import { skyCheckSettingsFromEnv } from "../dist/sky-check/index.js";
import { onBothBackends, seedSpace } from "./helpers/both-backends.mjs";
import { starField } from "./helpers/synthetic-images.mjs";

// What happens to every capture after its upload: the queue, once per
// capture and after the answer; the pickup of the captures left without a
// result; the result stored once; the setting « off ».

const at = "2026-10-06T21:00:00.000Z";
let root;
test.before(async () => {
  root = await mkdtemp(join(tmpdir(), "capture-processing-"));
  process.env.ASTRO_PORTAL_CAPTURES_DIR = join(root, "captures");
});
test.after(async () => {
  delete process.env.ASTRO_PORTAL_CAPTURES_DIR;
  await rm(root, { recursive: true, force: true });
});

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const exists = (path) =>
  stat(path).then(
    () => true,
    () => false,
  );

/** A capture of `tenantId` with its bytes stored, as an upload leaves it. */
async function sent(store, tenantId, bytes, name = "M31_LRGB_final.png") {
  const digest = sha(bytes);
  const path = capturePathFor(tenantId, digest);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  const { capture } = await store.insertCaptureWithTargets({
    id: randomUUID(),
    tenantId,
    originalName: name,
    sha256: digest,
    byteSize: bytes.length,
    createdAt: at,
  });
  return capture;
}

const columns = async (driver, id) =>
  (
    await driver.query(
      "SELECT visibility, auto_check, auto_check_reason, auto_check_at, protection_notice_at, protection_lifted_at FROM captures WHERE id = ?",
      [id],
    )
  ).rows[0];

const boundary = "astro-processing-boundary";
const capabilities = {
  "storage.max_file_bytes": 50 * 1024 * 1024,
  "storage.quota_bytes": 5 * 1024 * 1024 * 1024,
};
function multipart(metadata, fileBytes) {
  return Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="capture.png"\r\nContent-Type: image/png\r\n\r\n`,
      "utf8",
    ),
    fileBytes,
    Buffer.from(`\r\n--${boundary}--\r\n`, "latin1"),
  ]);
}

test("an upload queues the capture it created once, after its answer; a deduplicated replay queues nothing", async () => {
  const directory = await mkdtemp(join(root, "upload-"));
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  try {
    await applyMigrations(driver, "sqlite");
    const tenantId = randomUUID();
    await seedSpace(driver, tenantId, null, at);
    const created = [];
    const service = await createUploadResourceService({
      driver,
      capabilities,
      now: () => at,
      onCaptureCreated: (space, capture) => created.push([space, capture.id]),
    });
    const bytes = await starField({ width: 64, height: 48 }).png().toBuffer();
    const metadata = {
      originalName: "NGC7000_HOO.png",
      sha256: sha(bytes),
      byteSize: bytes.length,
    };
    const send = () =>
      service.receiveUpload({
        tenantId,
        contentType: `multipart/form-data; boundary=${boundary}`,
        bodyChunks: (async function* () {
          yield multipart(metadata, bytes);
        })(),
      });
    const first = await send();
    assert.equal(first.status, 201);
    assert.deepEqual(created, [[tenantId, first.body.capture.id]]);
    const replay = await send();
    assert.equal(replay.status, 200);
    assert.equal(replay.body.deduplicated, true);
    // The resumable create of bytes already stored: a replay too.
    const resumable = await service.createUpload({
      tenantId,
      ...metadata,
      contentType: "image/png",
    });
    assert.equal(resumable.status, 200);
    assert.equal(created.length, 1, "a replay queues nothing");

    // With the processor: the answer comes back before the work starts.
    const store = await createCaptureRepository({ driver });
    const started = [];
    const processor = createCaptureProcessor({
      store,
      processOne: async ({ capture }) => started.push(capture.id),
    });
    const withQueue = await createUploadResourceService({
      driver,
      capabilities,
      now: () => at,
      onCaptureCreated: processor.enqueue,
    });
    const other = await starField({ width: 64, height: 48, seed: 9 })
      .png()
      .toBuffer();
    const answer = await withQueue.receiveUpload({
      tenantId,
      contentType: `multipart/form-data; boundary=${boundary}`,
      bodyChunks: (async function* () {
        yield multipart(
          {
            originalName: "M45.png",
            sha256: sha(other),
            byteSize: other.length,
          },
          other,
        );
      })(),
    });
    assert.equal(answer.status, 201);
    assert.deepEqual(started, [], "nothing ran before the answer");
    await captureProcessingIdle();
    assert.deepEqual(started, [answer.body.capture.id]);
    await store.close();
  } finally {
    await driver.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("the same capture queued twice runs once, and one capture runs at a time", async () => {
  let running = 0;
  let most = 0;
  const ran = [];
  const job = (id) => async () => {
    running += 1;
    most = Math.max(most, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    ran.push(id);
    running -= 1;
  };
  assert.equal(
    queueCaptureProcessing({ tenantId: "a", captureId: "1" }, job("1")),
    true,
  );
  assert.equal(
    queueCaptureProcessing({ tenantId: "a", captureId: "1" }, job("1 again")),
    false,
  );
  queueCaptureProcessing({ tenantId: "a", captureId: "2" }, job("2"));
  queueCaptureProcessing({ tenantId: "b", captureId: "1" }, job("b1"));
  await captureProcessingIdle();
  assert.deepEqual(ran, ["1", "2", "b1"]);
  assert.equal(most, 1);

  // Held, nothing runs; let go, it does.
  pauseCaptureProcessing(true);
  queueCaptureProcessing({ tenantId: "a", captureId: "3" }, job("3"));
  await captureProcessingIdle();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(ran, ["1", "2", "b1"]);
  pauseCaptureProcessing(false);
  await new Promise((resolve) => setImmediate(resolve));
  await captureProcessingIdle();
  assert.deepEqual(ran, ["1", "2", "b1", "3"]);
});

onBothBackends(
  "the thumbnail and the check are written once; a capture left without a result is taken again; a private capture stays as it was",
  async (driver) => {
    const tenantId = randomUUID();
    await seedSpace(driver, tenantId, null, at);
    const store = await createCaptureRepository({ driver });
    const lines = [];
    const processor = createCaptureProcessor({
      store,
      log: (level, event, message, context) =>
        lines.push({ level, event, context }),
    });
    const bytes = await starField({ width: 160, height: 120 }).png().toBuffer();
    const capture = await sent(store, tenantId, bytes);
    processor.enqueue(tenantId, capture);
    await captureProcessingIdle();
    const after = await columns(driver, capture.id);
    assert.ok(["sky", "undetermined", "other"].includes(after.auto_check));
    assert.ok(after.auto_check_reason);
    assert.ok(after.auto_check_at);
    assert.equal(after.visibility, "private");
    assert.equal(after.protection_notice_at, null);
    assert.equal(after.protection_lifted_at, null);
    assert.equal(
      await exists(thumbnailPathFor(tenantId, capture.sha256)),
      true,
    );
    const checked = lines.find((line) => line.event === "captures.checked");
    assert.equal(checked.context.ruleVersion, "sky-check-3");
    assert.ok(checked.context.signals, "the signals go to the log");

    // Nothing left: the pickup queues nothing, and a second result is never
    // written over the first.
    assert.equal(await processor.pickUpPending({ tenantId }), 0);
    assert.equal(
      await store.recordAutomaticCheck(
        tenantId,
        capture.id,
        { result: "sky", reason: "wcs_header", at },
        { onlyIfPending: true },
      ),
      false,
    );
    assert.deepEqual(await columns(driver, capture.id), after);

    // A capture stored while nothing processed it (a process stopped, a
    // crash): taken again by the pickup, its space only.
    const left = await sent(
      store,
      tenantId,
      await starField({ width: 90, height: 60, seed: 4 }).png().toBuffer(),
      "IMG_2041.png",
    );
    const elsewhere = randomUUID();
    await seedSpace(driver, elsewhere, null, at);
    const otherSpace = await sent(
      store,
      elsewhere,
      Buffer.from("%PDF-1.7 not an image\n"),
      "notes.pdf",
    );
    assert.equal(await processor.pickUpPending({ tenantId }), 1);
    await captureProcessingIdle();
    assert.ok((await columns(driver, left.id)).auto_check);
    assert.equal((await columns(driver, otherSpace.id)).auto_check, null);
    // Every space at startup and every hour.
    assert.equal(await processor.pickUpPending(), 1);
    await captureProcessingIdle();
    const document = await columns(driver, otherSpace.id);
    assert.equal(document.auto_check, "undetermined");
    assert.equal(document.visibility, "private");
    await store.close();
  },
);

onBothBackends(
  "with ASTRO_PORTAL_SKY_CHECK=off every capture is undetermined; an unreadable file is undetermined and the queue goes on",
  async (driver) => {
    const tenantId = randomUUID();
    await seedSpace(driver, tenantId, null, at);
    const store = await createCaptureRepository({ driver });
    const off = skyCheckSettingsFromEnv({ ASTRO_PORTAL_SKY_CHECK: "off" });
    assert.equal(off.mode, "off");
    const capture = await sent(
      store,
      tenantId,
      await starField({ width: 400, height: 300 }).png().toBuffer(),
    );
    const answer = await processCapture({
      store,
      tenantId,
      capture,
      settings: off,
    });
    assert.equal(answer.result, "undetermined");
    assert.equal(answer.written, true);
    const row = await columns(driver, capture.id);
    assert.equal(row.auto_check, "undetermined");
    assert.equal(row.auto_check_reason, "check_off");
    // The thumbnail is written whatever the setting.
    assert.equal(answer.thumbnail, true);

    // A check that throws counts as unreadable, and the next capture runs.
    const broken = await sent(
      store,
      tenantId,
      Buffer.from("\xff\xd8\xff broken"),
      "broken.jpg",
    );
    const next = await sent(
      store,
      tenantId,
      Buffer.from("plain text"),
      "notes.txt",
    );
    const processor = createCaptureProcessor({
      store,
      processOne: (job) =>
        processCapture({
          ...job,
          check:
            job.capture.id === broken.id
              ? async () => {
                  throw new Error("decoder crashed");
                }
              : undefined,
        }),
    });
    processor.enqueue(tenantId, broken);
    processor.enqueue(tenantId, next);
    await captureProcessingIdle();
    assert.deepEqual(
      [
        (await columns(driver, broken.id)).auto_check_reason,
        (await columns(driver, next.id)).auto_check,
      ],
      ["unreadable", "undetermined"],
    );
    await store.close();
  },
);

onBothBackends(
  "under the verdict REDUCED a private capture answered « other » gets no notice, no message, no lifting, and is never deleted; its owner reads « undetermined », the row keeps « other »",
  async (driver) => {
    assert.equal(SKY_CHECK_VERDICT, "REDUCED");
    const tenantId = randomUUID();
    const userId = randomUUID();
    await seedSpace(driver, tenantId, userId, at);
    const store = await createCaptureRepository({ driver });
    const bytes = await starField({ width: 120, height: 90, seed: 6 })
      .png()
      .toBuffer();
    const capture = await sent(store, tenantId, bytes, "vacances-plage.png");
    const mailBefore = (
      await driver.query("SELECT COUNT(*) AS count FROM portal_mail_budget")
    ).rows[0];
    const answer = await processCapture({
      store,
      tenantId,
      capture,
      check: async () => ({
        result: "other",
        reason: "non_sky_content",
        checkedAt: at,
        ruleVersion: "sky-check-1",
        signals: {},
        milliseconds: 1,
      }),
    });
    assert.equal(answer.result, "other");
    const row = await columns(driver, capture.id);
    assert.equal(row.auto_check, "other", "counted for the administrator");
    assert.equal(row.auto_check_reason, "non_sky_content");
    assert.equal(row.visibility, "private");
    assert.equal(row.protection_notice_at, null, "no notice");
    assert.equal(row.protection_lifted_at, null, "no lifting");
    assert.deepEqual(
      (await driver.query("SELECT COUNT(*) AS count FROM portal_mail_budget"))
        .rows[0],
      mailBefore,
      "no message",
    );
    assert.equal(await exists(capturePathFor(tenantId, capture.sha256)), true);

    // Its owner reads « undetermined »: « Publique » asks for a
    // verification, and nothing lifts it 14 days later.
    const owned = await store.getCaptureById(tenantId, capture.id);
    assert.equal(owned.checks.automatic, "undetermined");
    const later = "2026-11-30T00:00:00.000Z";
    const state = captureState({
      visibility: owned.visibility,
      checks: owned.checks,
      now: later,
    });
    assert.equal(state.state, "undetermined");
    assert.equal(state.publishRefusal, "needs_review");
    assert.equal(state.protectionLiftsAt, null);
    const listed = (await store.listCaptures({ tenantId })).captures[0];
    assert.equal(listed.checks.automatic, "undetermined");

    // A notice given (as a verdict GO would): the capture did not pass.
    await store.recordProtectionNotice(tenantId, capture.id, at);
    const noticed = await store.getCaptureById(tenantId, capture.id);
    assert.equal(noticed.checks.automatic, "other");
    assert.equal(
      captureState({
        visibility: noticed.visibility,
        checks: noticed.checks,
        now: at,
      }).state,
      "protection_notice",
    );
    await store.close();
  },
);

test("a server with no team runs no check: the processor hands the processing a check that records the sky, and a team's gets the real one", async () => {
  const { skyWithoutCheck } =
    await import("../dist/captures/capture-processing.js");
  const verdict = await skyWithoutCheck();
  assert.equal(verdict.result, "sky");
  assert.equal(verdict.reason, null);
  const seen = [];
  const make = (checked) =>
    createCaptureProcessor({
      store: {},
      checked,
      processOne: async (options) => {
        seen.push(options.check ?? null);
      },
    });
  const capture = { id: "c1", sha256: "a".repeat(64) };
  for (const checked of [false, () => false, true, () => true]) {
    const processor = make(checked);
    processor.enqueue("tenant", { ...capture, id: randomUUID() });
    await captureProcessingIdle();
  }
  assert.deepEqual(seen, [skyWithoutCheck, skyWithoutCheck, null, null]);
});
