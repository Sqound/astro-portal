// The acquisition line Astro Sync measured wins over the line a session
// declares. A night created by Astro Sync declares « 466 frames over 6 h 36 »
// (the time between the first and the last frame, divided by the frames:
// 51.013 s each); that line is a fallback for a capture nothing measured,
// never for a session Astro Sync has sent. The detail and the list
// (`acquisitionSummary`) read the same figures. Every name, place
// and date is invented.
import assert from "node:assert/strict";
import { onBothBackends } from "./helpers/both-backends.mjs";
import { seedDebriefedNight, withServices } from "./helpers/journal-space.mjs";
import { PHONE, SYNC, image } from "./helpers/metadata-space.mjs";

const IRCUT_30 = {
  filter: "IRCUT",
  frameCount: 430,
  exposureSeconds: 30,
  gain: 200,
};
const IRCUT_10 = {
  filter: "IRCUT",
  frameCount: 36,
  exposureSeconds: 10,
  gain: 200,
};
const MEASURED_SECONDS = 430 * 30 + 36 * 10; // 3 h 41

/** The night as `create-sessions` writes it: 466 frames over 6 h 36. */
async function seedCreatedNight(driver, space) {
  const night = await seedDebriefedNight(driver, space);
  await driver.run("UPDATE plans SET debrief_targets_json = ? WHERE id = ?", [
    JSON.stringify([
      {
        targetId: "item-m31",
        state: "done",
        acquiredMinutes: 396,
        frameCount: 466,
      },
    ]),
    night.planId,
  ]);
  return night;
}

const params = (space, captureId) => ({
  tenantId: space.tenantId,
  userId: space.userId,
  captureId,
});

onBothBackends(
  "the lines Astro Sync measured stay when the session declares 466 frames over 6 h 36; the web and the phone read the same figures",
  async (driver) => {
    await withServices(driver, {}, async ({ owner, uploads, space, send }) => {
      const night = await seedCreatedNight(driver, space);
      const { body } = await send(
        image("measured-wins"),
        {
          sessionId: night.sessionId,
          targetIds: ["m31"],
          source: "astro-sync",
          acquisition: [IRCUT_30, IRCUT_10],
        },
        SYNC,
      );
      const id = body.capture.id;
      const read = await owner.get(params(space, id));
      const lines = read.metadata.acquisition.lines;
      assert.deepEqual(
        lines.map((line) => [
          line.origin,
          line.frameCount,
          line.exposureSeconds,
        ]),
        [
          ["astro-sync", 430, 30],
          ["astro-sync", 36, 10],
        ],
        "no declared line beside, none instead",
      );
      assert.equal(read.metadata.acquisition.totalSeconds, MEASURED_SECONDS);
      // The phone's card: the list's summary is the web's total.
      const list = await uploads.listCaptures({
        tenantId: space.tenantId,
        userId: space.userId,
      });
      const card = list.captures.find((capture) => capture.id === id);
      assert.equal(
        card.acquisitionSummary.integrationSeconds,
        MEASURED_SECONDS,
      );
      assert.equal(
        card.acquisitionSummary.integrationSeconds,
        read.metadata.acquisition.totalSeconds,
      );
      // Asking again (« Synchroniser avec la session »), or a debriefing
      // written later, never brings the declared line back.
      const synced = await owner.syncAcquisition(params(space, id));
      assert.deepEqual(
        synced.acquisition.lines.map((line) => line.origin),
        ["astro-sync", "astro-sync"],
      );
      assert.equal(synced.acquisition.totalSeconds, MEASURED_SECONDS);
    });
  },
);

onBothBackends(
  "a session Astro Sync has sent never gets a declared line, not even for an image it measured nothing on",
  async (driver) => {
    await withServices(driver, {}, async ({ owner, space, send }) => {
      const night = await seedCreatedNight(driver, space);
      // Astro Sync sends its image without any acquisition proposal (no
      // header was readable): the declared 51.013 s is not a measure.
      const sent = await send(
        image("measured-wins-bare"),
        {
          sessionId: night.sessionId,
          targetIds: ["m31"],
          source: "astro-sync",
        },
        SYNC,
      );
      const bare = await owner.syncAcquisition(
        params(space, sent.body.capture.id),
      );
      assert.deepEqual(bare.acquisition.lines, []);
      // A capture of the same night from the phone does not get it either.
      const phone = await send(
        image("measured-wins-phone"),
        { sessionId: night.sessionId, targetIds: ["m31"] },
        PHONE,
      );
      const synced = await owner.syncAcquisition(
        params(space, phone.body.capture.id),
      );
      assert.deepEqual(synced.acquisition.lines, []);
    });
  },
);

onBothBackends(
  "the declared line is still the fallback of a session nobody measured",
  async (driver) => {
    await withServices(driver, {}, async ({ owner, space, send }) => {
      const night = await seedCreatedNight(driver, space);
      const { body } = await send(
        image("measured-wins-fallback"),
        { sessionId: night.sessionId, targetIds: ["m31"] },
        PHONE,
      );
      const synced = await owner.syncAcquisition(
        params(space, body.capture.id),
      );
      assert.deepEqual(
        synced.acquisition.lines.map((line) => [line.origin, line.frameCount]),
        [["session", 466]],
      );
    });
  },
);

onBothBackends(
  "Astro Sync's proposals on a capture that already carries the session's declared line replace it instead of standing beside it",
  async (driver) => {
    await withServices(driver, {}, async ({ owner, space, send }) => {
      const night = await seedCreatedNight(driver, space);
      const { body } = await send(
        image("measured-wins-late"),
        { sessionId: night.sessionId, targetIds: ["m31"] },
        PHONE,
      );
      const id = body.capture.id;
      const filled = await owner.syncAcquisition(params(space, id));
      assert.deepEqual(
        filled.acquisition.lines.map((line) => line.origin),
        ["session"],
      );
      await owner.proposeMetadata({
        ...params(space, id),
        proposed: { source: "astro-sync", acquisition: [IRCUT_30, IRCUT_10] },
      });
      const read = await owner.get(params(space, id));
      assert.deepEqual(
        read.metadata.acquisition.lines.map((line) => line.origin),
        ["astro-sync", "astro-sync"],
      );
      assert.equal(read.metadata.acquisition.totalSeconds, MEASURED_SECONDS);
    });
  },
);
