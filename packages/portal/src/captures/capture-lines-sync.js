import { createSessionDebriefService } from "../api/session-debrief.js";
import { declaredFiguresOfTarget } from "../debrief-declared.js";
import { createJournalRepository } from "../journal/journal-repository.js";
import { layerIsEmpty, parseLayer } from "../journal/session-rework-layer.js";
import { declaredFiguresOfEffectiveTarget } from "../persistence/project-integration-repository.js";
import { planCaptureFieldsOf } from "../persistence/plan-capture-fields.js";
import { createCaptureRepository } from "../persistence/capture-repository.js";
import { changedLineIds, withCaptureLock } from "./capture-revision.js";
import { metadataColumns, storedMetadata } from "./capture-metadata.js";
import { nightStepsFor } from "./capture-night-steps.js";

/**
 * « Synchroniser avec la session »: the lines of « Intégrations » of a capture filled from where they
 * come from — and the same function, called without a touch, when a capture
 * joins a session and when that session's debriefing or rework is written
 * (everything must arrive pre-filled by the plan).
 *
 * - **An ordinary capture** (a session): the measured steps of Astro Sync's
 *   analysis for its targets (lines of origin `astro-sync`, the step's own
 *   id), else one declared line per target from the debriefing (origin
 *   `session`, id `declared:<targetId>`).
 * - **The image of a multi-night plan** (`project_id`): the lines of the
 *   multi-night plan's integrations of the nights the image combines
 *   (`plan.combinedNightIds`), measured before declared, **one line per
 *   session, target and family**, each with its `sessionId` and
 *   `eveningDate`.
 *
 * The lines of origin `owner` and `import` and every line corrected by hand
 * are kept; the others are replaced; a line is never doubled (the ids are
 * stable). When the source has nothing to say the lines stay as they are.
 */

const debriefServices = new WeakMap();
async function debriefServiceOf(driver, dialect) {
  let service = debriefServices.get(driver);
  if (!service) {
    service = createSessionDebriefService({ driver, dialect });
    debriefServices.set(driver, service);
  }
  return await service;
}

const round3 = (value) => Math.round(value * 1000) / 1000;

/** The lines the plan's integrations give for the nights an image combines. */
async function planImageLines(db, tenantId, capture) {
  const { combinedNightIds } = planCaptureFieldsOf(capture.plan_json);
  if (!combinedNightIds.length) return { fresh: [], source: "night" };
  const rows = (
    await db.query(
      `SELECT * FROM project_integrations
       WHERE tenant_id = ? AND project_id = ?
         AND night_id IN (${combinedNightIds.map(() => "?").join(", ")})
       ORDER BY evening_date, filter, exposure_seconds, created_at, id`,
      [tenantId, capture.project_id, ...combinedNightIds],
    )
  ).rows;
  // Measured before declared, for each night and target.
  const measuredKeys = new Set(
    rows
      .filter((row) => row.source !== "declared")
      .map((row) => `${row.night_id}|${row.target_id}`),
  );
  const fresh = [];
  let measured = false;
  for (const row of rows) {
    const key = `${row.night_id}|${row.target_id}`;
    const isDeclared = row.source === "declared";
    if (isDeclared && measuredKeys.has(key)) continue;
    measured ||= !isDeclared;
    const frameCount = Number(row.frame_count) || 0;
    const exposureSeconds = Number(row.exposure_seconds) || 0;
    fresh.push({
      // Stable across the declared line and the measured ones of a night
      // and a target: the family of a measured line is part of its id.
      id: `plan:${row.night_id}:${row.target_id}:${isDeclared ? "declared" : row.family_key}`,
      filter: row.filter ?? null,
      frameCount,
      exposureSeconds,
      gain: row.gain == null ? null : Number(row.gain),
      origin: isDeclared ? "session" : "astro-sync",
      editedAt: null,
      sessionId: row.night_id,
      eveningDate: row.evening_date || null,
      ...(isDeclared
        ? { declaredSeconds: round3(Number(row.total_seconds)) }
        : {}),
      ...(!isDeclared && row.computer_label
        ? { computerLabel: row.computer_label }
        : {}),
    });
  }
  return { fresh, source: measured ? "astro-sync" : "night" };
}

/** The lines the session gives for an ordinary capture. */
async function sessionLines(db, dialect, tenantId, capture, targetIds) {
  const steps = await nightStepsFor(db, capture.session_id, targetIds);
  const measured = steps.filter((step) => step.origin === "analysis");
  if (measured.length)
    return {
      source: "astro-sync",
      fresh: measured.map((step) => ({
        // The step's own id: a line corrected by hand keeps it, so the next
        // synchronisation does not bring the step back beside it.
        id: step.id,
        filter: step.filter ?? null,
        frameCount: step.frameCount,
        exposureSeconds: step.exposureSeconds,
        gain: step.gain ?? null,
        origin: "astro-sync",
        editedAt: null,
      })),
    };
  const debriefs = await debriefServiceOf(db, dialect);
  const read = await debriefs.read({
    tenantId,
    sessionId: capture.session_id,
  });
  // A reworked session declares what the rework made of it (the times and
  // frames it set), as the declared lines of a multi-night plan do: the
  // Journal's own reading of the session, not the debriefing alone.
  let effective = null;
  if (read?.debriefSummary || read?.debrief) {
    const session = (
      await db.query(
        "SELECT * FROM observation_sessions WHERE id = ? AND tenant_id = ?",
        [capture.session_id, tenantId],
      )
    ).rows[0];
    if (session && !layerIsEmpty(parseLayer(session.rework_json)))
      effective = (
        await (
          await createJournalRepository({ driver: db, dialect })
        ).targetsOfRow({ tenantId, row: session, executor: db })
      ).targets.filter(
        (entry) =>
          entry.state !== "removed" &&
          Number.isFinite(entry.acquiredSeconds) &&
          entry.acquiredSeconds > 0,
      );
  }
  const fresh = [];
  for (const targetId of targetIds) {
    const figures = effective
      ? declaredFiguresOfEffectiveTarget(
          effective.filter((entry) => entry.targetId === targetId),
        )
      : declaredFiguresOfTarget(
          { debrief: read?.debrief ?? null, summary: read?.debriefSummary },
          targetId,
        );
    if (figures)
      fresh.push({
        id: `declared:${targetId}`,
        filter: figures.filter,
        frameCount: figures.frameCount,
        exposureSeconds: figures.exposureSeconds,
        gain: null,
        origin: "session",
        editedAt: null,
        declaredSeconds: figures.seconds,
      });
  }
  return { source: "night", fresh };
}

/** A line a session declares from its debriefing (id `declared:<target>`). */
const isDeclaredLine = (line) => line.origin === "session";
/** A line Astro Sync proposed or measured (`astro-sync`, its stacking). */
const isMeasuredByAstroSync = (line) => line.origin === "astro-sync";
const hasLineOf = (state, test) =>
  Array.isArray(state.acquisition) && state.acquisition.some(test);

/**
 * Whether Astro Sync has sent an image of the session (a variant whose source
 * is `astro-sync` or `stacking`): its declared figures are the frames'
 * duration, not a measure, and never describe such a night.
 */
async function sessionSentByAstroSync(db, tenantId, sessionId) {
  if (!sessionId) return false;
  const found = (
    await db.query(
      `SELECT 1 AS found FROM capture_variants v
         JOIN captures c ON c.id = v.capture_id
       WHERE c.tenant_id = ? AND c.session_id = ?
         AND v.source IN ('astro-sync', 'stacking')
       LIMIT 1`,
      [tenantId, sessionId],
    )
  ).rows;
  return found.length > 0;
}

/** The stored state without its declared lines nobody corrected. */
function withoutDeclaredLines(before, at) {
  const stale = (
    Array.isArray(before.acquisition) ? before.acquisition : []
  ).filter((line) => isDeclaredLine(line) && !line.editedAt);
  if (!stale.length) return { state: before, changed: false, lines: [] };
  const state = JSON.parse(JSON.stringify(before));
  const remaining = state.acquisition.filter(
    (line) => !(isDeclaredLine(line) && !line.editedAt),
  );
  state.origins = { ...(state.origins || {}) };
  if (remaining.length) {
    state.acquisition = remaining;
    state.origins.acquisition = { ...(state.origins.acquisition || {}), at };
  } else {
    state.acquisition = null;
    delete state.origins.acquisition;
  }
  const lines = changedLineIds(before.acquisition, remaining);
  return { state, changed: lines.length > 0, lines };
}

/**
 * What a synchronisation would write for a capture row: `{ state, fresh,
 * changed, lines }` — the stored state after (unchanged when the source has
 * nothing to say), whether the lines changed, and the ids of the lines that
 * did. `null` when the capture has neither a session nor a plan to read.
 */
export async function prepareLineSync({ db, dialect, tenantId, capture, at }) {
  if (!capture.session_id && !capture.project_id) return null;
  const targetIds = (
    await db.query(
      "SELECT target_id FROM capture_targets WHERE capture_id = ? ORDER BY position",
      [capture.id],
    )
  ).rows.map((row) => row.target_id);
  const { fresh, source } = capture.project_id
    ? await planImageLines(db, tenantId, capture)
    : await sessionLines(db, dialect, tenantId, capture, targetIds);
  const before = storedMetadata(capture);
  // What Astro Sync measured wins. The line a session declares (« 466 frames
  // over 6 h 36 »: the night's duration over the frames) is a fallback for a
  // capture nothing measured — never written over the lines Astro Sync
  // proposed, and never for a session Astro Sync has sent.
  if (
    !capture.project_id &&
    fresh.length > 0 &&
    fresh.every(isDeclaredLine) &&
    (hasLineOf(before, isMeasuredByAstroSync) ||
      (await sessionSentByAstroSync(db, tenantId, capture.session_id)))
  )
    return withoutDeclaredLines(before, at);
  if (!fresh.length) return { state: before, changed: false, lines: [] };
  const state = JSON.parse(JSON.stringify(before));
  const current = Array.isArray(state.acquisition) ? state.acquisition : [];
  const kept = current.filter(
    (line) =>
      line.origin === "owner" || line.origin === "import" || line.editedAt,
  );
  const held = new Set(kept.map((line) => line.id));
  state.origins = { ...(state.origins || {}) };
  state.acquisition = [...kept, ...fresh.filter((line) => !held.has(line.id))];
  state.origins.acquisition = {
    ...(state.origins.acquisition || {}),
    source,
    at,
    edited: kept.some((line) => line.editedAt),
  };
  const lines = changedLineIds(before.acquisition, state.acquisition);
  return { state, changed: lines.length > 0, lines };
}

/**
 * Synchronises one capture of the space, one step with the owner's writes
 * (the lock of the capture): reads its row, prepares the lines, lets
 * `beforeWrite(row, prepared)` refuse (the conflict of an owner's write),
 * writes them if they changed and moves the revision once. Answers `{ row,
 * prepared, revision }` (`prepared` is `null` for a capture with nothing to
 * read; `revision` the new one, `null` when nothing was written), or `null`
 * when the capture is not the space's.
 */
export async function syncCaptureLines({
  store,
  db,
  dialect,
  tenantId,
  captureId,
  userId = null,
  by = "system",
  now = () => new Date().toISOString(),
  beforeWrite = null,
  originClientInstanceId = null,
}) {
  return await withCaptureLock(captureId, async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const row = await store.captureRow(tenantId, captureId);
      if (!row) return null;
      const at = now();
      const prepared = await prepareLineSync({
        db,
        dialect,
        tenantId,
        capture: row,
        at,
      });
      if (beforeWrite) await beforeWrite(row, prepared);
      if (!prepared?.changed) return { row, prepared, revision: null };
      // The revision moves first, as a compare-and-swap: if another process
      // wrote since the row was read, nothing is applied and the lines are
      // worked out again.
      const revision = await store.touchCapture(tenantId, row.id, {
        fields: prepared.lines.map((line) => ({ field: "acquisition", line })),
        expected: Number(row.revision ?? 1) || 1,
        by,
        userId,
        at,
        originClientInstanceId,
      });
      if (revision === null) continue;
      await store.writeMetadata(
        tenantId,
        row.id,
        metadataColumns(prepared.state),
      );
      return { row, prepared, revision };
    }
    throw new Error("The capture is being written; try again.");
  });
}

/**
 * The lines of every capture of a session, filled as « Synchroniser avec la
 * session » would — called after a debriefing or a rework is written, and
 * when a capture joins the session. `driver` is the database driver, not a
 * transaction (call it once the write is committed). Never throws: a
 * capture that cannot be read is left as it is. Answers the number of
 * captures changed.
 */
export async function writeCaptureLinesForSession(
  driver,
  tenantId,
  sessionId,
  { dialect = driver?.dialect, now } = {},
) {
  let store = null;
  let changed = 0;
  try {
    store = await createCaptureRepository({
      driver,
      dialect,
      migrate: false,
    });
    const captures = (
      await driver.query(
        `SELECT id FROM captures
         WHERE tenant_id = ? AND session_id = ? AND project_id IS NULL
         ORDER BY created_at, id`,
        [tenantId, String(sessionId ?? "")],
      )
    ).rows;
    for (const { id } of captures) {
      try {
        const done = await syncCaptureLines({
          store,
          db: driver,
          dialect,
          tenantId,
          captureId: id,
          now,
        });
        if (done?.revision !== null && done?.revision !== undefined)
          changed += 1;
      } catch {
        // The capture stays as it is; « Synchroniser » asks again.
      }
    }
  } catch {
    // The lines are a convenience: the write that called this stands.
  }
  return changed;
}

/** The lines of one capture, filled without a touch (it joined a session). */
export async function writeCaptureLinesForCapture(
  driver,
  tenantId,
  captureId,
  { dialect = driver?.dialect, now } = {},
) {
  try {
    const store = await createCaptureRepository({
      driver,
      dialect,
      migrate: false,
    });
    const done = await syncCaptureLines({
      store,
      db: driver,
      dialect,
      tenantId,
      captureId,
      now,
    });
    return done?.revision ?? null;
  } catch {
    return null;
  }
}
