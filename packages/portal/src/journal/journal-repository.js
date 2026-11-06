import { createDatabaseDriver } from "../persistence/database.js";
import { applyMigrations } from "../persistence/migration-runner.js";
import { retryOnSqliteNestedTransaction } from "../persistence/db-transaction-retry.js";
import { debriefRecordForPlanRow } from "../persistence/debrief-repository.js";
import { stepResourceForRow } from "../persistence/night-repository.js";
import {
  eventResourceForRow,
  sessionRowById,
} from "../persistence/observation-session-repository.js";
import {
  createPlanResourceRepository,
  parseJson,
} from "../persistence/planner-state-repository.js";
import { projectTargetKeys } from "../persistence/plan-project-links.js";
import {
  debriefOutcomeOfPlanRow,
  derivedFieldsOf,
  planItemsOfRow,
  planRowsById,
} from "../persistence/session-derived.js";
import { guidingLossesFromReport } from "../guiding-losses.js";
import { sessionQualityOf } from "../sessions/night-summary.js";
import {
  compareLines,
  decodeCursor,
  figuresOf,
  groupsOf,
  projectIdsOfLine,
  pageOf,
  selectLines,
  toDebriefCountOf,
} from "./journal-list.js";
import {
  journalStatisticsInstrument,
  journalStatisticsOverview,
  journalStatisticsTarget,
} from "./journal-statistics.js";
import { effectiveEventResources, parseLayer } from "./session-rework-layer.js";
import { buildSessionTargets, planItemKey } from "./session-targets.js";
import {
  SESSION_GRACE_DAYS,
  daysRemainingOf,
  purgeAtOf,
} from "../sessions/session-grace.js";
import { captureSessionLiveSql } from "../persistence/capture-session-visibility.js";
import { listLivePlaces } from "../persistence/place-repository.js";
import { shownPlaceName } from "../places/shown-place-name.js";
import {
  resolvePlaceTimeZone,
  sessionPlaceWithZone,
} from "../planner/place-time-zone.js";

// "Session" here is always an OBSERVATION session; see the naming note at the
// top of persistence/observation-session-repository.js.

/**
 * What the Journal reads: the list of all the sessions of a space
 * (`GET /v1/journal`) and the targets of one session (`detail.targets`).
 * **Reads only**, never held by a right.
 *
 * Cost of a call, in queries, whatever the size of the page: the plans of the
 * sessions (1) and the plans carried out without the application (1), the
 * projects (1), the equipment (1), the events (1), the steps (1), the
 * analyses (1), then for the page only the target labels (1), the captures
 * (2), the groups' newest plan image (1) and their target keys (0–1 per
 * group), plus the catch-up of the night boundaries the debrief queue already
 * does (a write of the plans that miss them, then nothing). The figures of
 * the **whole selection** are worked out (the header counts every session the
 * filters select), so the events and the analyses of the space are read once
 * per call; a cache of the figures per session is the remedy if a space ever
 * makes that heavy.
 */

const text = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const isoOfEpoch = (value) => {
  const at = Number(value);
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
};

/** `{ sql, params }` selecting a column among the sessions `rows` (or the whole space past 200). */
function scopeOf(tenantId, rows, column) {
  if (rows.length > 200)
    return {
      sql: `${column} IN (SELECT id FROM observation_sessions WHERE tenant_id = ?)`,
      params: [tenantId],
    };
  return {
    sql: `${column} IN (${rows.map(() => "?").join(", ")})`,
    params: rows.map((row) => row.id),
  };
}

const chunks = (list, size = 500) => {
  const parts = [];
  for (let at = 0; at < list.length; at += size)
    parts.push(list.slice(at, at + size));
  return parts;
};

/**
 * The place a night is written under: its own, else its plan's -- the name of
 * the live place the copy stands for, never a position written as a name
 * (`shownPlaceName`).
 */
function placeNameOf(row, plan, knownPlaces = []) {
  const own = parseJson(row?.place_json, null);
  const payload = parseJson(plan?.payload_json, null);
  return shownPlaceName(
    [own, payload?.location ?? parseJson(plan?.location_json, null)],
    knownPlaces,
  );
}

/**
 * The zone a night's hours are read in: the one rule of the page of a session
 * on the web and on the phone (`sessionPlaceWithZone`, then
 * `resolvePlaceTimeZone`) -- the night's own place, the plan's copy of it, the
 * places the person keeps, then the table by the position. `null` when no zone
 * can be read: the hours are then in UTC, written « UTC ».
 */
export function placeTimeZoneOf(row, plan, knownPlaces) {
  const own = parseJson(row?.place_json, null);
  const payload = parseJson(plan?.payload_json, null);
  const planned = payload?.location ?? parseJson(plan?.location_json, null);
  const place = sessionPlaceWithZone(own, planned, knownPlaces);
  return place ? (resolvePlaceTimeZone(place).timeZone ?? null) : null;
}

/** The places the space keeps, as far as a zone is concerned; none when they cannot be read. */
export async function knownPlacesOf(executor, tenantId) {
  try {
    return (await listLivePlaces(executor, tenantId)).map((place) => ({
      id: place.id,
      name: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
      ...(place.timeZone ? { timeZone: place.timeZone } : {}),
      ...(place.timeZoneSource ? { timeZoneSource: place.timeZoneSource } : {}),
    }));
  } catch {
    return [];
  }
}

/** The night's telescope and camera ids: the night's own, else its plan's. */
function equipmentIdsOf(row, plan) {
  const own = parseJson(row?.equipment_json, null);
  const payload = parseJson(plan?.payload_json, null);
  const planned =
    payload?.equipment ?? parseJson(plan?.equipment_json, null) ?? null;
  const pick = (source, key) => text(source?.[key]);
  return [
    pick(own, "telescopeId") ?? pick(planned, "telescopeId"),
    pick(own, "cameraId") ?? pick(planned, "cameraId"),
  ];
}

function instrumentLabelOf(row, plan, equipmentNames) {
  const label = equipmentIdsOf(row, plan)
    .map((id) => (id ? (equipmentNames.get(id) ?? null) : null))
    .filter(Boolean)
    .join(" · ");
  return label || null;
}

export async function createJournalRepository({
  databasePath,
  databaseUrl,
  driver,
  dialect = driver?.dialect ?? (databaseUrl ? "postgres" : "sqlite"),
} = {}) {
  const ownsDriver = !driver;
  const db = driver || createDatabaseDriver({ databasePath, databaseUrl });
  await applyMigrations(db, dialect);
  const planResourceRepository = await createPlanResourceRepository({
    driver: db,
    dialect,
  });

  /** The events, steps and analysis summaries of the sessions `rows`, by session id. */
  async function loadSessionData(executor, tenantId, rows) {
    const data = new Map(
      rows.map((row) => [
        row.id,
        {
          layer: parseLayer(row.rework_json),
          rawEvents: [],
          steps: [],
          measured: false,
          quality: null,
          guidingLosses: null,
        },
      ]),
    );
    if (!rows.length) return data;
    const events = scopeOf(tenantId, rows, "session_id");
    for (const row of (
      await executor.query(
        `SELECT * FROM session_events WHERE ${events.sql}
         ORDER BY received_at, event_id`,
        events.params,
      )
    ).rows)
      data.get(row.session_id)?.rawEvents.push(eventResourceForRow(row));
    const steps = scopeOf(tenantId, rows, "session_id");
    for (const row of (
      await executor.query(
        `SELECT * FROM acquisition_steps WHERE tenant_id = ? AND ${steps.sql}
         ORDER BY position, created_at, id`,
        [tenantId, ...steps.params],
      )
    ).rows)
      data.get(row.session_id)?.steps.push(row);
    const analyses = scopeOf(tenantId, rows, "session_id");
    for (const row of (
      await executor.query(
        `SELECT session_id, report_json FROM session_analyses
         WHERE tenant_id = ? AND ${analyses.sql}`,
        [tenantId, ...analyses.params],
      )
    ).rows) {
      const entry = data.get(row.session_id);
      if (!entry) continue;
      const report = parseJson(row.report_json, {});
      entry.measured = true;
      entry.guidingLosses = guidingLossesFromReport(report);
      // One source for the Journal's quality and the page of a capture's
      // (`sessionQualityOf`).
      const quality = sessionQualityOf(
        report,
        entry.steps.map(stepResourceForRow),
      );
      entry.quality = quality
        ? {
            skyBackground: quality.skyBackground,
            fwhm: quality.fwhm,
            eccentricity: quality.eccentricity,
          }
        : null;
    }
    for (const [id, entry] of data)
      entry.events = effectiveEventResources(entry.rawEvents, entry.layer, id);
    return data;
  }

  /** The captures of the sessions `rows` that name a target, by session id. */
  async function loadCaptures(executor, tenantId, rows) {
    const bySession = new Map(rows.map((row) => [row.id, []]));
    if (!rows.length) return bySession;
    const scope = scopeOf(tenantId, rows, "c.session_id");
    const captures = (
      await executor.query(
        `SELECT c.id, c.session_id, c.target_id, c.sha256, c.created_at
         FROM captures c
         WHERE c.tenant_id = ? AND c.project_id IS NULL AND ${scope.sql}
         ORDER BY c.created_at, c.id`,
        [tenantId, ...scope.params],
      )
    ).rows;
    if (!captures.length) return bySession;
    const targetsOf = new Map(captures.map((row) => [row.id, new Set()]));
    for (const part of chunks(captures.map((row) => row.id)))
      for (const row of (
        await executor.query(
          `SELECT capture_id, target_id FROM capture_targets
           WHERE capture_id IN (${part.map(() => "?").join(", ")})`,
          part,
        )
      ).rows)
        targetsOf.get(row.capture_id)?.add(row.target_id);
    for (const row of captures) {
      if (row.target_id) targetsOf.get(row.id).add(row.target_id);
      bySession.get(row.session_id)?.push({
        id: row.id,
        hasImage: typeof row.sha256 === "string" && row.sha256.length > 0,
        keys: targetsOf.get(row.id),
      });
    }
    return bySession;
  }

  /** The catalogue designations of target keys (the catalogue, then the space's own). */
  async function loadLabels(executor, tenantId, keys) {
    const labels = new Map();
    for (const part of chunks([...keys])) {
      for (const row of (
        await executor.query(
          `SELECT id, designation FROM target_catalogue_entries
           WHERE id IN (${part.map(() => "?").join(", ")})
             AND (space_id IS NULL OR space_id = ?)`,
          [...part, tenantId],
        )
      ).rows)
        labels.set(row.id, row.designation);
    }
    return labels;
  }

  async function loadEquipmentNames(executor, tenantId) {
    return new Map(
      (
        await executor.query(
          "SELECT id, name FROM equipment WHERE tenant_id = ?",
          [tenantId],
        )
      ).rows.map((row) => [row.id, row.name]),
    );
  }

  async function loadProjects(executor, tenantId) {
    const projects = new Map();
    for (const row of (
      await executor.query(
        "SELECT id, status, payload_json FROM projects WHERE tenant_id = ? AND deleted_at IS NULL",
        [tenantId],
      )
    ).rows) {
      const payload = parseJson(row.payload_json, {}) ?? {};
      const target = payload.target ?? {};
      projects.set(row.id, {
        id: row.id,
        status: row.status,
        target,
        name: text(target.name) ?? "",
        targetLabel: text(target.commonName) ?? text(target.name) ?? "",
        goalSeconds: Math.round(Number(payload.goalMinutes || 0) * 60),
      });
    }
    return projects;
  }

  /**
   * Whether a plan row is the internal plan of a guided evening
   * (`plans.guided_evening`): its session is shown as « Soirée guidée », never
   * as a night to debrief, and it holds no planned figure.
   */
  const guidedPlanRow = (plan) => Number(plan?.guided_evening) === 1;

  /** The Journal line of a session (or of a plan carried out without one). */
  function lineOf({ skeleton, built, data = null, projects }) {
    const { row, plan } = skeleton;
    const project = skeleton.projectId
      ? projects.get(skeleton.projectId)
      : null;
    return {
      sessionId: row?.id ?? null,
      planId: plan?.id ?? null,
      planName: plan
        ? (text(plan.name) ?? text(parseJson(plan.payload_json, {})?.name))
        : null,
      // The name the person gave to the session itself; never the plan's
      // name, which `planName` already says.
      title: skeleton.title ?? null,
      projectId: skeleton.projectId,
      // Sent only for a night linked to several plans (a night of two
      // targets serving two plans); absent, the night's plan is `projectId`.
      ...(skeleton.projectIds?.length > 1
        ? { projectIds: skeleton.projectIds }
        : {}),
      projectName: project ? project.name || null : null,
      eveningDate: skeleton.eveningDate,
      startedAt: skeleton.startedAt,
      finishedAt: skeleton.finishedAt,
      placeName: skeleton.placeName,
      placeTimeZone: skeleton.placeTimeZone ?? null,
      instrumentLabel: skeleton.instrumentLabel,
      state: skeleton.state,
      origin: skeleton.origin,
      plannedSeconds: built.plannedSeconds,
      acquiredSeconds: built.acquiredSeconds,
      frameCount: built.frameCount,
      lostReason: built.lostReason,
      measured: Boolean(data?.measured),
      quality: data?.quality ?? null,
      captureCount: skeleton.captureCount ?? 0,
      targets: built.targets,
      readOnly: false,
      // Additive: sent only for the session of a guided evening, whose
      // internal plan is no plan of the night (`state` is `no_plan`).
      ...(guidedPlanRow(plan) ? { guidedEvening: true } : {}),
    };
  }

  /** The figures and targets of one session row, from what was loaded. */
  function buildFor(skeleton, data, { labels, captures }) {
    const { row } = skeleton;
    // The internal plan of a guided evening promised nothing: the session is
    // read as one without a plan.
    const plan = guidedPlanRow(skeleton.plan) ? null : skeleton.plan;
    return buildSessionTargets({
      session: row,
      plan,
      debrief: debriefRecordForPlanRow(plan),
      events: data.events,
      steps: data.steps,
      layer: data.layer,
      guidingLosses: data.guidingLosses,
      labels,
      captures,
    });
  }

  /** The targets of a plan carried out without the application: the plan's items, planned. */
  function planOnlyTargets(plan, labels) {
    const items = planItemsOfRow(plan).filter(
      (item) => typeof item.id === "string" && item.id,
    );
    const targets = [];
    let planned = null;
    for (const item of items) {
      const key = planItemKey(item);
      const duration = Number(item.durationMinutes);
      const slot =
        Number.isFinite(item.endMinute) && Number.isFinite(item.startMinute)
          ? item.endMinute - item.startMinute
          : 0;
      const minutes = slot > 0 ? slot : duration > 0 ? duration : 0;
      if (minutes > 0) planned = (planned ?? 0) + minutes * 60;
      targets.push({
        targetId: key,
        label:
          text(item.target?.name) ?? text(item.name) ?? labels.get(key) ?? key,
        planItemId: item.id,
        state: "planned",
        outcome: null,
        reason: null,
        plannedSeconds: minutes > 0 ? minutes * 60 : null,
        acquiredSeconds: null,
        frameCount: null,
        filter: text(item.filter),
        startedAt: null,
        finishedAt: null,
        exposureSeconds: null,
        exposureFamilies: null,
        captureId: null,
        thumbnailUrl: null,
      });
    }
    return {
      targets,
      plannedSeconds: planned,
      acquiredSeconds: null,
      frameCount: null,
      lostReason: null,
    };
  }

  /** The lines of the operator catalogue's nights that match no session (private server). */
  function catalogueLines(catalogueNights, sessionLines) {
    const held = new Set();
    for (const line of sessionLines)
      for (const target of line.targets)
        held.add(`${line.eveningDate}\u0000${target.targetId}`);
    const lines = [];
    for (const night of catalogueNights) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(night?.date ?? ""))) continue;
      for (const target of night.targets ?? []) {
        const targetId = text(target?.id);
        if (!targetId || held.has(`${night.date}\u0000${targetId}`)) continue;
        const seconds = Number(target.totalSeconds);
        lines.push({
          sessionId: `catalogue:${night.date}:${targetId}`,
          planId: null,
          planName: null,
          title: null,
          projectId: null,
          projectName: null,
          eveningDate: night.date,
          startedAt: isoOfEpoch(target.captureStartedAt),
          finishedAt: isoOfEpoch(target.captureEndedAt),
          placeName: null,
          placeTimeZone: null,
          instrumentLabel: null,
          state: "no_plan",
          origin: "import",
          plannedSeconds: null,
          acquiredSeconds:
            Number.isFinite(seconds) && seconds > 0 ? seconds : null,
          frameCount: null,
          lostReason: null,
          measured: false,
          quality: null,
          captureCount: 0,
          targets: [
            {
              targetId,
              label: text(target.title) ?? targetId,
              planItemId: null,
              state: "added",
              outcome: null,
              reason: null,
              plannedSeconds: null,
              acquiredSeconds:
                Number.isFinite(seconds) && seconds > 0 ? seconds : null,
              frameCount: null,
              filter: null,
              // The night's own times, when the catalogue knows them; the
              // catalogue's picture of the target (a read-only night has no
              // capture of the space).
              startedAt: isoOfEpoch(target.captureStartedAt),
              finishedAt: isoOfEpoch(target.captureEndedAt),
              exposureSeconds: null,
              exposureFamilies: null,
              captureId: null,
              thumbnailUrl: null,
              ...(text(target.imageUrl)
                ? { imageUrl: text(target.imageUrl) }
                : {}),
            },
          ],
          readOnly: true,
        });
      }
    }
    return lines;
  }

  /**
   * Every line of the Journal before any filter: the finished sessions, the
   * plans carried out without the application and, on a private server, the
   * operator's catalogue nights that match no session.
   */
  async function gather({
    tenantId,
    catalogueNights,
    timestamp,
    deleted = false,
  }) {
    // The night boundaries a plan misses are resolved first, as the debrief
    // queue does, so that « the night is past » can be told.
    await planResourceRepository.catchUpNightBounds({
      tenantId,
      timestamp,
    });
    // A deleted session is out of the Journal; `deleted` reads those
    // and only those, for the trash.
    const sessionRows = (
      await db.query(
        `SELECT * FROM observation_sessions
         WHERE tenant_id = ? AND status = 'finished'
           AND deleted_at IS ${deleted ? "NOT NULL" : "NULL"}`,
        [tenantId],
      )
    ).rows;
    const plans = await planRowsById(
      db,
      tenantId,
      sessionRows.map((row) => row.plan_id),
    );
    const sessionPlanIds = new Set(
      (
        await db.query(
          "SELECT plan_id FROM observation_sessions WHERE tenant_id = ? AND plan_id IS NOT NULL",
          [tenantId],
        )
      ).rows.map((row) => row.plan_id),
    );
    const pastPlans = deleted
      ? []
      : (
          await db.query(
            `SELECT * FROM plans
         WHERE tenant_id = ? AND deleted_at IS NULL
           AND (status = 'pending'
             OR (status = 'abandoned' AND frozen_at IS NOT NULL))
           AND guided_evening = 0
           AND night_end_at IS NOT NULL AND night_end_at < ?`,
            [tenantId, timestamp],
          )
        ).rows.filter((plan) => !sessionPlanIds.has(plan.id));
    const projects = await loadProjects(db, tenantId);
    const equipmentNames = await loadEquipmentNames(db, tenantId);
    const knownPlaces = await knownPlacesOf(db, tenantId);

    const skeletons = [];
    for (const row of sessionRows) {
      const plan = row.plan_id ? (plans.get(row.plan_id) ?? null) : null;
      const derived = derivedFieldsOf(row, plan);
      skeletons.push({
        row,
        plan,
        projectId: derived.projectId,
        projectIds: derived.projectIds,
        eveningDate: derived.eveningDate,
        startedAt: row.started_at ?? null,
        finishedAt: row.finished_at ?? null,
        placeName: placeNameOf(row, plan, knownPlaces),
        placeTimeZone: placeTimeZoneOf(row, plan, knownPlaces),
        title: text(row.title),
        instrumentLabel: instrumentLabelOf(row, plan, equipmentNames),
        // The session of a guided evening has no debriefing to wait for.
        state:
          plan && !guidedPlanRow(plan)
            ? (debriefOutcomeOfPlanRow(plan) ?? "to_debrief")
            : "no_plan",
        origin: row.origin || "execution",
      });
    }
    for (const plan of pastPlans) {
      const derived = derivedFieldsOf(
        { started_at: plan.night_start_at, place_json: null },
        plan,
      );
      skeletons.push({
        row: null,
        plan,
        projectId: derived.projectId,
        projectIds: derived.projectIds,
        eveningDate: derived.eveningDate,
        startedAt: plan.night_start_at ?? null,
        finishedAt: plan.night_end_at ?? null,
        placeName: placeNameOf(null, plan, knownPlaces),
        placeTimeZone: placeTimeZoneOf(null, plan, knownPlaces),
        title: null,
        instrumentLabel: instrumentLabelOf(null, plan, equipmentNames),
        // A plan given up (`closedAs: abandoned`) is decided « Abandonné » by
        // the write that closed it: it keeps its line, with its state.
        state: debriefOutcomeOfPlanRow(plan) ?? "to_debrief",
        origin: null,
      });
    }
    // Lines without a date cannot be placed in the Journal.
    const placeable = skeletons.filter((skeleton) => skeleton.eveningDate);

    // The figures of every session: the header counts the whole selection.
    const sessionSkeletons = placeable.filter((skeleton) => skeleton.row);
    const data = await loadSessionData(
      db,
      tenantId,
      sessionSkeletons.map((skeleton) => skeleton.row),
    );
    const lines = [];
    const noLabels = { labels: new Map(), captures: [] };
    for (const skeleton of placeable) {
      if (skeleton.row) {
        const entry = data.get(skeleton.row.id);
        lines.push(
          lineOf({
            skeleton,
            built: buildFor(skeleton, entry, noLabels),
            data: entry,
            projects,
          }),
        );
      } else
        lines.push(
          lineOf({
            skeleton,
            built: planOnlyTargets(skeleton.plan, new Map()),
            projects,
          }),
        );
    }
    const synthetic = catalogueLines(catalogueNights, lines);
    const everything = [...lines, ...synthetic];

    return { everything, lines, placeable, data, projects };
  }

  /**
   * The lines of a page with what only the page needs: the names of its
   * targets and its captures (`captureCount`, the thumbnails).
   */
  async function detailLines(page, { tenantId, placeable, data, projects }) {
    const skeletonOf = new Map(
      placeable.map((skeleton) => [
        skeleton.row?.id ?? skeleton.plan.id,
        skeleton,
      ]),
    );
    const pageSkeletons = page
      .map((line) => skeletonOf.get(line.sessionId ?? line.planId))
      .filter(Boolean);
    const labelKeys = new Set();
    for (const line of page)
      for (const target of line.targets) labelKeys.add(target.targetId);
    const labels = await loadLabels(db, tenantId, labelKeys);
    const captures = await loadCaptures(
      db,
      tenantId,
      pageSkeletons.filter((skeleton) => skeleton.row).map((s) => s.row),
    );
    const detailed = new Map();
    for (const skeleton of pageSkeletons) {
      if (!skeleton.row) {
        const planned = planOnlyTargets(skeleton.plan, labels);
        detailed.set(
          skeleton.plan.id,
          lineOf({ skeleton, built: planned, projects }),
        );
        continue;
      }
      const entry = data.get(skeleton.row.id);
      const sessionCaptures = captures.get(skeleton.row.id) ?? [];
      const built = buildFor(skeleton, entry, {
        labels,
        captures: sessionCaptures,
      });
      detailed.set(
        skeleton.row.id,
        lineOf({
          skeleton: { ...skeleton, captureCount: sessionCaptures.length },
          built,
          data: entry,
          projects,
        }),
      );
    }
    return page.map(
      (line) => detailed.get(line.sessionId ?? line.planId) ?? line,
    );
  }

  /** The targets and figures of one session row (labels and captures included). */
  async function targetsOfRow({ tenantId, row, executor = db }) {
    const plan = row.plan_id
      ? ((await planRowsById(executor, tenantId, [row.plan_id])).get(
          row.plan_id,
        ) ?? null)
      : null;
    const data = (await loadSessionData(executor, tenantId, [row])).get(row.id);
    // First without labels to learn the keys, then with them.
    const skeleton = { row, plan };
    const first = buildFor(skeleton, data, { labels: new Map(), captures: [] });
    const labels = await loadLabels(
      executor,
      tenantId,
      new Set(first.targets.map((target) => target.targetId)),
    );
    const captures = (await loadCaptures(executor, tenantId, [row])).get(
      row.id,
    );
    return buildFor(skeleton, data, { labels, captures: captures ?? [] });
  }

  return {
    async close() {
      if (ownsDriver) await db.close();
    },

    /**
     * `GET /v1/journal`: `{ sessions, groups, years, instruments, stats,
     * nextCursor }` for a validated `query` (`year`, `instrument`, `season`,
     * `outcome`, `multiNightOnly`, `cursor`, `limit`, all optional).
     * `catalogueNights` is what a private server hands over: the nights of
     * its operator's catalogue (`buildObservationNights`), listed as
     * read-only sessions when no session matches them.
     */
    async list({
      tenantId,
      query = {},
      catalogueNights = [],
      timestamp = new Date().toISOString(),
    }) {
      return await retryOnSqliteNestedTransaction(async () => {
        const { everything, lines, placeable, data, projects } = await gather({
          tenantId,
          catalogueNights,
          timestamp,
        });

        const selected = selectLines(everything, query);
        const { page, nextCursor } = pageOf(selected, {
          after: query.cursor ? decodeCursor(query.cursor) : null,
          limit: query.limit,
        });

        // The page only: the names of its targets and its captures.
        const pageLines = await detailLines(page, {
          tenantId,
          placeable,
          data,
          projects,
        });

        // The groups: every multi-night plan having a line here.
        const groupProjects = new Map();
        const finishedIds = [
          ...new Set(
            pageLines
              .flatMap(projectIdsOfLine)
              .filter((id) => projects.get(id)),
          ),
        ];
        if (finishedIds.length) {
          const newest = new Map();
          for (const row of (
            await db.query(
              `SELECT id, project_id FROM captures
               WHERE tenant_id = ? AND ${captureSessionLiveSql()}
                 AND project_id IN (${finishedIds.map(() => "?").join(", ")})
               ORDER BY created_at DESC, id DESC`,
              [tenantId, ...finishedIds],
            )
          ).rows)
            if (!newest.has(row.project_id)) newest.set(row.project_id, row.id);
          for (const projectId of finishedIds) {
            const project = projects.get(projectId);
            let framingTargetId = null;
            if (text(project.target?.framingId))
              framingTargetId =
                (
                  await db.query(
                    "SELECT catalogue_target_id FROM framings WHERE id = ? AND tenant_id = ?",
                    [text(project.target.framingId), tenantId],
                  )
                ).rows[0]?.catalogue_target_id ?? null;
            const keys = projectTargetKeys(project.target, framingTargetId);
            // The progress of the plan: what its sessions acquired of its
            // target, worked out from the same debriefings as the lines. A
            // night still to debrief holds only the raw sum of its events: it
            // adds nothing until it is confirmed.
            let acquiredSeconds = 0;
            for (const line of everything)
              if (
                projectIdsOfLine(line).includes(projectId) &&
                line.sessionId !== null &&
                line.state !== "to_debrief"
              )
                for (const target of line.targets)
                  if (keys.has(target.targetId) && target.state !== "removed")
                    acquiredSeconds += target.acquiredSeconds ?? 0;
            groupProjects.set(projectId, {
              ...project,
              targetId: text(project.target?.targetId) || framingTargetId,
              acquiredSeconds,
              targetKeys: keys,
              planCaptureId: newest.get(projectId) ?? null,
            });
          }
        }
        const groups = groupsOf(pageLines, selected, groupProjects, everything);
        const { years, instruments, stats } = figuresOf(everything, selected);
        return {
          sessions: pageLines,
          groups,
          years,
          instruments,
          stats,
          // The one count of the sessions « À débriefer », whatever
          // the filters: the badge of the Journal on both interfaces.
          toDebriefCount: toDebriefCountOf(everything),
          nextCursor,
        };
      });
    },

    /**
     * The statistics of the gallery: the overview of the lines the `query`
     * keeps (the year, the months, the nights by outcome, the best night,
     * every target and every instrument) and, for each target and each
     * instrument of it, its figures over **all** the nights of the space
     * (`targets`, `instruments`, by target id and by « tube · caméra » label).
     * `held` keeps only what is free — the overview without its targets and
     * its instruments, no detail —: the statistics by target and by instrument
     * need the capability `gallery.private`, and the service withholds them
     * rather than trusting the page.
     */
    async statistics({
      tenantId,
      query = {},
      catalogueNights = [],
      held = false,
      focus = {},
      timestamp = new Date().toISOString(),
    }) {
      return await retryOnSqliteNestedTransaction(async () => {
        const { everything, placeable, data, projects } = await gather({
          tenantId,
          catalogueNights,
          timestamp,
        });
        const lines = await detailLines(everything, {
          tenantId,
          placeable,
          data,
          projects,
        });
        const { cursor, limit, ...filters } = query;
        const selected = selectLines(lines, filters);
        const overview = journalStatisticsOverview(selected, {
          year: filters.year ?? null,
        });
        if (held)
          return {
            held: true,
            overview: { ...overview, targets: [], instruments: [] },
            targets: {},
            instruments: {},
          };
        // The target or the instrument a dialog asks for (`focus`) is read
        // even when the filters leave it out of the overview.
        const targets = {};
        const targetIds = overview.targets.map((row) => row.targetId);
        if (focus.targetId && !targetIds.includes(focus.targetId))
          targetIds.push(focus.targetId);
        for (const id of targetIds)
          targets[id] = journalStatisticsTarget(lines, id);
        const instruments = {};
        const labels = overview.instruments.map((row) => row.label);
        if (focus.instrument && !labels.includes(focus.instrument))
          labels.push(focus.instrument);
        for (const label of labels)
          instruments[label] = journalStatisticsInstrument(lines, label);
        return { held: false, overview, targets, instruments };
      });
    },

    /**
     * `GET /v1/journal/deleted`: the deleted sessions
     * of the space, the most recently deleted first, each `{ session,
     * deletedAt, purgeAt, daysRemaining }`: `session` is the line of the
     * Journal it was (its targets, its place, `captureCount`: what the
     * erasure would take away). Answers `{ entries, graceDays }`.
     */
    async deletedList({ tenantId, timestamp = new Date().toISOString() }) {
      return await retryOnSqliteNestedTransaction(async () => {
        const { lines, placeable, data, projects } = await gather({
          tenantId,
          catalogueNights: [],
          timestamp,
          deleted: true,
        });
        const detailed = await detailLines(lines, {
          tenantId,
          placeable,
          data,
          projects,
        });
        const deletedAtOf = new Map(
          placeable
            .filter((skeleton) => skeleton.row)
            .map((skeleton) => [skeleton.row.id, skeleton.row.deleted_at]),
        );
        return {
          entries: detailed
            .map((line) => {
              const deletedAt = deletedAtOf.get(line.sessionId);
              return {
                session: line,
                deletedAt,
                purgeAt: purgeAtOf(deletedAt),
                daysRemaining: daysRemainingOf(deletedAt, timestamp),
              };
            })
            .sort(
              (left, right) =>
                (left.deletedAt < right.deletedAt
                  ? 1
                  : left.deletedAt > right.deletedAt
                    ? -1
                    : 0) ||
                (left.session.sessionId < right.session.sessionId ? 1 : -1),
            ),
          graceDays: SESSION_GRACE_DAYS,
        };
      });
    },

    /**
     * The targets of one session (`session.schema.json`, `detail.targets`),
     * or `null` when the session is not the space's. Also the figures the
     * rework checks its list against.
     */
    async sessionTargets({ tenantId, sessionId, executor = db }) {
      const row = await sessionRowById(executor, { tenantId, sessionId });
      if (!row) return null;
      return await targetsOfRow({ tenantId, row, executor });
    },

    /**
     * The Journal line of one catalogue night (`catalogue:<date>:<target>`)
     * of a private server, or `null` when the operator's catalogue has no such
     * night left unmatched by a session of the space (the same rule as the
     * list's): the read-only session `GET /v1/sessions/{id}` answers.
     */
    async catalogueLine({
      tenantId,
      sessionId,
      catalogueNights = [],
      timestamp = new Date().toISOString(),
    }) {
      const [, date, ...rest] = String(sessionId).split(":");
      const targetId = rest.join(":");
      const listed = catalogueNights.some(
        (night) =>
          night?.date === date &&
          (night.targets ?? []).some((target) => target?.id === targetId),
      );
      if (!listed) return null;
      return await retryOnSqliteNestedTransaction(async () => {
        const { everything } = await gather({
          tenantId,
          catalogueNights,
          timestamp,
        });
        return (
          everything.find(
            (line) => line.readOnly === true && line.sessionId === sessionId,
          ) ?? null
        );
      });
    },

    targetsOfRow,
  };
}

export { compareLines };
