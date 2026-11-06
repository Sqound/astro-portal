// The image of a multi-night plan combines nights; the month its page writes
// is the nights', not the upload's. One month when the nights fall in one,
// a period (« Août – septembre 2026 ») when they span several; months only,
// never a day.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import {
  at,
  contractErrors,
  withMetadataSpace,
} from "./helpers/metadata-space.mjs";
import { combinedEveningDates } from "../dist/persistence/combined-nights.js";
import {
  formatNightMonths,
  nightMonthsOf,
} from "../dist/captures/public-capture-view.js";

await registerJsx();
const { publicCaptureRows } =
  await import("portal/components/detail/PublicCapturePage.js");

/** A night of the space on `date` (the plan's date), `started` its start. */
async function night(driver, space, date, started) {
  const planId = randomUUID();
  await driver.run(
    `INSERT INTO plans (id, tenant_id, created_by_user_id, client_id, name, plan_date, location_json, equipment_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Nuit', ?, '{}', '{}', ?, ?)`,
    [planId, space.tenantId, space.userId, `client-${planId}`, date, at, at],
  );
  const id = randomUUID();
  await driver.run(
    "INSERT INTO observation_sessions (id, tenant_id, plan_id, started_at, finished_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'finished', ?, ?)",
    [id, space.tenantId, planId, started, started, at, at],
  );
  return id;
}

/** A public capture of no night, with the nights it combines. */
async function planCapture(driver, space, nightIds) {
  const id = randomUUID();
  await driver.run(
    `INSERT INTO captures (id, tenant_id, session_id, plan_id, target_id, original_name, sha256, byte_size, status, stage, visibility, created_at, project_id, plan_json)
     VALUES (?, ?, NULL, NULL, 'm31', 'plan.tif', ?, 100, 'uploaded', 'finalized', 'public', ?, ?, ?)`,
    [
      id,
      space.tenantId,
      id.replaceAll("-", "").repeat(2),
      // Uploaded in October, long after the nights.
      "2026-10-26T09:00:00.000Z",
      randomUUID(),
      JSON.stringify({ combinedNightIds: nightIds, totalsByFilter: [] }),
    ],
  );
  await driver.run(
    "INSERT INTO capture_targets (capture_id, target_id, position) VALUES (?, 'm31', 0)",
    [id],
  );
  return id;
}

test("the months of a plan image come from its nights: one month, or a period, in the gallery and its page", async () => {
  await withMetadataSpace(async ({ driver, space, other, gallery, owner }) => {
    const first = await night(
      driver,
      space,
      "2026-08-31",
      "2026-08-31T21:00:00.000Z",
    );
    const second = await night(
      driver,
      space,
      "2026-09-02",
      "2026-09-02T21:00:00.000Z",
    );
    const third = await night(
      driver,
      space,
      "2026-09-05",
      "2026-09-05T21:00:00.000Z",
    );
    // A night of another space is never read.
    const foreign = await night(
      driver,
      other,
      "2025-01-01",
      "2025-01-01T21:00:00.000Z",
    );

    const spanning = await planCapture(driver, space, [second, first, foreign]);
    const oneMonth = await planCapture(driver, space, [second, third]);
    const row = async (id) =>
      (await driver.query("SELECT * FROM captures WHERE id = ?", [id])).rows[0];
    assert.deepEqual(
      await combinedEveningDates(driver, space.tenantId, await row(spanning)),
      ["2026-08-31", "2026-09-02"],
    );
    // A capture of one night, or of no night, combines none.
    assert.deepEqual(
      await combinedEveningDates(driver, space.tenantId, {
        ...(await row(spanning)),
        session_id: first,
      }),
      [],
    );
    assert.deepEqual(
      await combinedEveningDates(driver, space.tenantId, { plan_json: null }),
      [],
    );

    // The gallery says the nights' months, not October.
    const period = await gallery.get({ captureId: spanning, locale: "fr" });
    assert.equal(period.nightMonth, "2026-08");
    assert.equal(period.nightMonthEnd, "2026-09");
    const single = await gallery.get({ captureId: oneMonth, locale: "fr" });
    assert.equal(single.nightMonth, "2026-09");
    assert.equal("nightMonthEnd" in single, false);
    for (const capture of [period, single])
      assert.deepEqual(
        await contractErrors("gallery.schema.json", "capture", capture),
        [],
      );
    const listed = (await gallery.list({ locale: "fr", all: true })).captures;
    assert.deepEqual(
      listed
        .map((card) => [card.nightMonth, card.nightMonthEnd ?? null])
        .sort(),
      [
        ["2026-08", "2026-09"],
        ["2026-09", null],
      ],
    );
    // Months only: no day of any night leaves.
    assert.doesNotMatch(JSON.stringify(period), /2026-0[89]-\d\d/);

    // The page: « Mois des nuits » for a period, « Mois de la nuit » for one.
    const rowOf = (capture, label) =>
      publicCaptureRows(capture, "fr")
        .flatMap((section) => section.rows)
        .find(([name]) => name === label);
    assert.ok(rowOf(period, "Mois des nuits"));
    assert.ok(rowOf(single, "Mois de la nuit"));
  });
});

test("a period of months is written in each language, a single month as before", () => {
  assert.deepEqual(nightMonthsOf(["2026-08-31", "2026-09-02"]), {
    nightMonth: "2026-08",
    nightMonthEnd: "2026-09",
  });
  assert.deepEqual(nightMonthsOf(["2026-09-02", "2026-09-05"]), {
    nightMonth: "2026-09",
  });
  assert.equal(nightMonthsOf([]), null);
  assert.deepEqual(nightMonthsOf(["2026-12-30", "2027-01-02"]), {
    nightMonth: "2026-12",
    nightMonthEnd: "2027-01",
  });
  assert.equal(
    formatNightMonths("2026-08", "2026-09", "fr"),
    "Août\u2009–\u2009septembre 2026",
  );
  assert.equal(
    formatNightMonths("2026-08", "2026-09", "en"),
    "August\u2009–\u2009September 2026",
  );
  assert.equal(
    formatNightMonths("2026-12", "2027-01", "fr"),
    "Décembre 2026\u2009–\u2009janvier 2027",
  );
  assert.equal(
    formatNightMonths("2026-08", "2026-09", "ja"),
    "2026年8月\u2009–\u20092026年9月",
  );
  assert.equal(
    formatNightMonths("2026-08", "2026-09", "zh-Hans"),
    "2026年8月\u2009–\u20092026年9月",
  );
  for (const locale of ["de", "es", "it", "pt-BR", "zh-Hant", "ru"])
    assert.ok(
      formatNightMonths("2026-08", "2026-09", locale).length > 8,
      locale,
    );
  // One month, or the same twice: the single month; a month that is not one: nothing.
  assert.equal(formatNightMonths("2026-09", null, "fr"), "Septembre 2026");
  assert.equal(formatNightMonths("2026-09", "2026-09", "fr"), "Septembre 2026");
  assert.equal(formatNightMonths(null, "2026-09", "fr"), null);
});
