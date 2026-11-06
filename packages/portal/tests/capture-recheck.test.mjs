import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  RECHECK_SETTING,
  createCaptureProcessor,
  pauseCaptureProcessing,
  recheckRefusal,
} from "../dist/captures/capture-processing.js";
import { createCaptureRepository } from "../dist/persistence/capture-repository.js";
import { onBothBackends, seedSpace } from "./helpers/both-backends.mjs";

// After a change of the rule, the automatic check runs again on every
// image — on a test deployment, or where the operator allows it; never on
// a production address by default.

const at = "2026-10-26T21:00:00.000Z";

test("the check runs again only on a test deployment, or where the operator allows it", () => {
  assert.equal(
    recheckRefusal({
      ASTRO_PORTAL_ENVIRONMENT: "staging",
      ASTRO_PORTAL_PUBLIC_URL: "https://staging.example.com",
    }),
    null,
  );
  assert.equal(recheckRefusal({ ASTRO_PORTAL_ENVIRONMENT: "test" }), null);
  // Production, or nothing said: refused.
  assert.match(recheckRefusal({}), /test deployment/);
  assert.match(
    recheckRefusal({ ASTRO_PORTAL_ENVIRONMENT: "production" }),
    /test deployment/,
  );
  // A test environment on a production address: refused.
  assert.match(
    recheckRefusal({
      ASTRO_PORTAL_ENVIRONMENT: "staging",
      ASTRO_PORTAL_PUBLIC_URL: "https://astro-portal-prod.example",
    }),
    /production address/,
  );
  // The hosts the operator lists as production ones are production addresses.
  assert.match(
    recheckRefusal({
      ASTRO_PORTAL_ENVIRONMENT: "staging",
      ASTRO_PORTAL_PRODUCTION_HOSTS: "notes.example.org",
      ASTRO_PORTAL_PUBLIC_URL: "https://notes.example.org",
    }),
    /production address/,
  );
  assert.equal(
    recheckRefusal({
      ASTRO_PORTAL_ENVIRONMENT: "staging",
      ASTRO_PORTAL_PRODUCTION_HOSTS: "notes.example.org",
      ASTRO_PORTAL_PUBLIC_URL: "https://staging.example.org",
    }),
    null,
  );
  // A private server after an update of the rule: its operator says so.
  assert.equal(recheckRefusal({ [RECHECK_SETTING]: "1" }), null);
});

onBothBackends(
  "running the check again forgets every stored result, of the captures and of their images, and queues them",
  async (driver) => {
    const store = await createCaptureRepository({ driver, migrate: false });
    const tenantId = randomUUID();
    await seedSpace(driver, tenantId, null, at);
    const ids = [];
    for (const [index, result] of ["sky", "undetermined", "other"].entries()) {
      const { capture } = await store.insertCaptureWithTargets({
        id: randomUUID(),
        tenantId,
        originalName: `capture-${index}.png`,
        sha256: String(index).repeat(64),
        byteSize: 10,
        createdAt: at,
      });
      await store.recordAutomaticCheck(tenantId, capture.id, {
        result,
        reason: result === "sky" ? "stars_detected" : "too_few_stars",
        at,
      });
      ids.push(capture.id);
    }
    pauseCaptureProcessing(true);
    try {
      const processor = createCaptureProcessor({
        store,
        processOne: async () => {},
      });
      const answered = await processor.recheck({ tenantId });
      assert.equal(answered.captures, 3);
      assert.ok(answered.images >= 3, JSON.stringify(answered));
      assert.equal(answered.queued, 3);
      const rows = (
        await driver.query(
          "SELECT auto_check, auto_check_reason, auto_check_at FROM captures WHERE tenant_id = ?",
          [tenantId],
        )
      ).rows;
      assert.equal(rows.length, 3);
      for (const row of rows)
        assert.deepEqual(
          [row.auto_check, row.auto_check_reason, row.auto_check_at],
          [null, null, null],
        );
      const images = (
        await driver.query(
          "SELECT COUNT(*) AS n FROM capture_variants WHERE tenant_id = ? AND auto_check IS NOT NULL",
          [tenantId],
        )
      ).rows[0];
      assert.equal(Number(images.n), 0);
      // Nothing to forget a second time.
      assert.deepEqual(
        { ...(await processor.recheck({ tenantId })), queued: 0 },
        { captures: 0, images: 0, queued: 0 },
      );
    } finally {
      pauseCaptureProcessing(false);
    }
  },
);
