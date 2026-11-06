// The date of finalization (« Finalisée le <date> ») is written once, at the passage
// « Brouillon » → « Finalisée », by the one function that changes the stage
// — a web upload finalized, the stage written by the web session or by a
// device —, and never cleared nor moved.
import assert from "node:assert/strict";
import test from "node:test";
import {
  PHONE,
  WEB,
  image,
  withMetadataSpace,
} from "./helpers/metadata-space.mjs";

const finalizedAtOf = async (driver, id) =>
  (await driver.query("SELECT finalized_at FROM captures WHERE id = ?", [id]))
    .rows[0].finalized_at;

test("a web upload finalized carries its date; a device's draft none until finalized", async () => {
  await withMetadataSpace(async ({ driver, owner, space, send }) => {
    const web = await send(image("web-finalized"), {}, WEB);
    assert.equal(web.body.capture.stage, "finalized");
    assert.ok(await finalizedAtOf(driver, web.body.capture.id));
    const read = await owner.get({
      tenantId: space.tenantId,
      captureId: web.body.capture.id,
    });
    assert.equal(read.finalizedAt, await finalizedAtOf(driver, read.id));

    const draft = await send(image("web-draft"), { stage: "draft" }, WEB);
    assert.equal(await finalizedAtOf(driver, draft.body.capture.id), null);
    const phone = await send(image("phone"), {}, PHONE);
    assert.equal(phone.body.capture.stage, "draft");
    assert.equal(
      (
        await owner.get({
          tenantId: space.tenantId,
          captureId: phone.body.capture.id,
        })
      ).finalizedAt,
      null,
    );
  });
});

test("the stage written by the web session or by a device sets the date once; back to a draft keeps it; finalized again does not move it", async () => {
  let clock = "2026-10-06T21:02:00.000Z";
  await withMetadataSpace(
    async ({ driver, owner, space, send }) => {
      const { tenantId, userId } = space;
      // The device route and the web session both reach `owner.update`.
      const phone = await send(image("phone-stage"), {}, PHONE);
      const captureId = phone.body.capture.id;
      const first = await owner.update({
        tenantId,
        userId,
        captureId,
        changes: { stage: "finalized" },
      });
      assert.equal(first.finalizedAt, "2026-10-06T21:02:00.000Z");
      clock = "2026-10-07T08:00:00.000Z";
      const back = await owner.update({
        tenantId,
        userId,
        captureId,
        changes: { stage: "draft" },
      });
      assert.equal(back.stage, "draft");
      assert.equal(
        back.finalizedAt,
        "2026-10-06T21:02:00.000Z",
        "never cleared",
      );
      const again = await owner.update({
        tenantId,
        userId,
        captureId,
        changes: { stage: "finalized" },
      });
      assert.equal(
        again.finalizedAt,
        "2026-10-06T21:02:00.000Z",
        "never moved",
      );
      assert.equal(
        await finalizedAtOf(driver, captureId),
        "2026-10-06T21:02:00.000Z",
      );
    },
    { now: () => clock },
  );
});

test("a capture finalized before the date was kept reads null (« Finalisée. »), no date invented", async () => {
  await withMetadataSpace(async ({ driver, owner, space, send }) => {
    const sent = await send(image("old"), {}, WEB);
    await driver.run("UPDATE captures SET finalized_at = NULL WHERE id = ?", [
      sent.body.capture.id,
    ]);
    const read = await owner.get({
      tenantId: space.tenantId,
      captureId: sent.body.capture.id,
    });
    assert.equal(read.stage, "finalized");
    assert.equal(read.finalizedAt, null);
    // Writing the stage it already has changes nothing.
    const same = await owner.update({
      tenantId: space.tenantId,
      userId: space.userId,
      captureId: read.id,
      changes: { stage: "finalized" },
    });
    assert.equal(same.finalizedAt, null);
  });
});
