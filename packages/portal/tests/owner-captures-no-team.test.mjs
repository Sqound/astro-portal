import assert from "node:assert/strict";
import test from "node:test";
import { onBothBackends } from "./helpers/both-backends.mjs";
import { refusal, withServices } from "./helpers/journal-space.mjs";
import { WEB, image } from "./helpers/metadata-space.mjs";

// A server with no team looking at the captures (a private server: its owner
// is the only person who sees them). Every capture is the sky: the owner
// publishes it themselves, with nothing asked, no verification requested, no
// warning counted and no block. Every name and date is invented.

const own = (space, captureId) => ({
  tenantId: space.tenantId,
  userId: space.userId,
  captureId,
});

async function newCapture(send, driver, automatic, reason = null) {
  const created = (await send(image(`c-${automatic}-${reason}`), {}, WEB)).body
    .capture;
  await driver.run(
    "UPDATE captures SET auto_check = ?, auto_check_reason = ?, auto_check_at = ?, stage = 'finalized' WHERE id = ?",
    [automatic, reason, "2026-10-14T09:00:00.000Z", created.id],
  );
  return created.id;
}

onBothBackends(
  "without a team every capture is the sky: public at once, nothing asked, no review to request",
  async (driver) => {
    await withServices(
      driver,
      { ownerOptions: { moderated: false } },
      async ({ owner, space, send }) => {
        for (const [automatic, reason] of [
          ["undetermined", "person_detected"],
          ["undetermined", "not_recognised"],
          ["other", null],
          ["sky", null],
        ]) {
          const id = await newCapture(send, driver, automatic, reason);
          const read = await owner.get(own(space, id));
          assert.equal(read.state.state, "private_sky", automatic);
          assert.equal(read.state.publishAllowed, true);
          assert.equal(read.state.publishRefusal, null);
          // Public with the one gesture: no confirmation, no flag.
          const published = await owner.update({
            ...own(space, id),
            changes: { visibility: "public" },
          });
          assert.equal(published.visibility, "public");
          assert.equal(published.state.state, "public_pending");
          assert.equal(published.state.teamLine, null);
          // Back to private: always.
          assert.equal(
            (
              await owner.update({
                ...own(space, id),
                changes: { visibility: "private" },
              })
            ).visibility,
            "private",
          );
          // There is no team to ask for a verification.
          const review = await refusal(
            owner.update({
              ...own(space, id),
              changes: { requestReview: true },
            }),
          );
          assert.equal(review.code, "review_not_applicable");
        }
        // The list tells the screen that no team looks at the captures.
        const listed = await owner.list({
          tenantId: space.tenantId,
          userId: space.userId,
        });
        assert.equal(listed.publishing.moderated, false);
        assert.equal(listed.publishing.warningsCount, 0);
        // Nothing was counted against the person.
        const row = (
          await driver.query(
            "SELECT warnings_count, publishing_blocked_until FROM users WHERE id = ?",
            [space.userId],
          )
        ).rows[0];
        assert.equal(Number(row.warnings_count ?? 0), 0);
        assert.equal(row.publishing_blocked_until ?? null, null);
      },
    );
  },
);

onBothBackends(
  "with a team (the default) the same capture is refused until the team approves it, as before",
  async (driver) => {
    await withServices(driver, {}, async ({ owner, space, send }) => {
      const person = await newCapture(
        send,
        driver,
        "undetermined",
        "person_detected",
      );
      const read = await owner.get(own(space, person));
      assert.equal(read.state.publishAllowed, false);
      assert.equal(read.state.publishRefusal, "needs_review");
      const listed = await owner.list({
        tenantId: space.tenantId,
        userId: space.userId,
      });
      assert.equal(listed.publishing.moderated, undefined);
      const refused = await refusal(
        owner.update({
          ...own(space, person),
          changes: { visibility: "public" },
        }),
      );
      assert.equal(refused.code, "needs_review");
      const asked = await owner.update({
        ...own(space, person),
        changes: { requestReview: true },
      });
      assert.equal(asked.state.state, "review_requested");
    });
  },
);
