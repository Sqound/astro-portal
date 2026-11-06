// The web client of the multi-night plans (`/api/v1/projects`) and of what
// their progress is read from: the plans of the space (`GET /api/v1/plans`,
// for the server id of each plan of the planner) and the summaries of their
// debriefed nights (`GET /api/v1/sessions/{id}`'s `debriefSummary`). One
// store for the page, so the library, the schedule's card, the plan's menu
// and its band read the same list.

import { useSyncExternalStore } from "react";
import { requestJson } from "portal/components/sessions/portal-fetch.js";
import { CHANGE_SIGNAL_EVENT } from "portal/planner/change-subscription.js";

async function parse(response, fallback) {
  const payload = await response.json().catch(() => null);
  if (response.ok) return payload;
  const error = new Error(payload?.error?.message || fallback);
  error.code = payload?.error?.code || null;
  error.status = response.status;
  error.project = payload?.project || null;
  error.capability = payload?.capability || null;
  throw error;
}

/** `GET /api/v1/projects` — every multi-night plan, archived ones included. */
export async function listProjects() {
  return (
    (await parse(await requestJson("/api/v1/projects"), "project_list_failed"))
      ?.projects || []
  );
}

/**
 * `GET /api/v1/projects/{id}` — one multi-night plan read alone, with the
 * integrations Astro Sync sent for it, their totals by filter and the image
 * of the plan.
 */
export async function loadProjectDetail(id) {
  return parse(
    await requestJson(`/api/v1/projects/${encodeURIComponent(id)}`),
    "project_read_failed",
  );
}

/** `PUT /api/v1/projects/{id}` — creates (`revision` 0) or updates. */
export async function putProject({ id, body, revision = 0 }) {
  return parse(
    await requestJson(`/api/v1/projects/${encodeURIComponent(id)}`, {
      method: "PUT",
      body,
      ifMatch: `"${revision}"`,
    }),
    "project_write_failed",
  );
}

/** `DELETE /api/v1/projects/{id}` — archives (never deletes). */
export async function archiveProject({ id, revision }) {
  return (
    await parse(
      await requestJson(`/api/v1/projects/${encodeURIComponent(id)}`, {
        method: "DELETE",
        ifMatch: `"${revision}"`,
      }),
      "project_archive_failed",
    )
  )?.project;
}

// ------------------------------------------------- the nights of a plan
// `GET`/`POST
// /api/v1/projects/{id}/nights`, `DELETE …/nights/{nightId}`, `POST
// /api/v1/projects` from existing nights, `GET /api/v1/projects/candidates`
// and `GET /api/v1/projects?sessionId=|planId=`. Reading never needs a
// capability; the writes answer `403 multi_night_not_active` without
// "Planification avancée" (`planner.mosaic`; the
// error carries `code` and `capability`). Only the integrations of a plan
// and its image stay under "Synchronisation avancée+"
// (`analysis.progression`, MultiNightIntegrations.js).

/** The right of the gestures on a plan: attach, detach, create from nights. */
export const PLANNING_CAPABILITY = "planner.mosaic";

/**
 * Whether "Planification avancée" holds the gestures back: where it is sold,
 * while the capabilities lack it. Where nothing restricts the multi-night plans
 * (`hosted: false`), they are never locked.
 */
export function planningLocked(capabilities, { hosted = true } = {}) {
  return hosted && capabilities?.[PLANNING_CAPABILITY] !== true;
}

/**
 * Whether a failed write is the refusal that opens the "Planification
 * avancée" card: `403 multi_night_not_active` naming `planner.mosaic`.
 */
export function isPlanningRefusal(failure) {
  return (
    failure?.code === "multi_night_not_active" &&
    failure.capability === PLANNING_CAPABILITY
  );
}

/** `GET /api/v1/projects/{id}/nights` → `{ projectId, nights, candidates }`. */
export async function listProjectNights(projectId) {
  return parse(
    await requestJson(
      `/api/v1/projects/${encodeURIComponent(projectId)}/nights`,
    ),
    "project_nights_read_failed",
  );
}

/** `POST /api/v1/projects/{id}/nights` with `{ sessionIds?, planIds? }`. */
export async function attachProjectNights(projectId, body) {
  return parse(
    await requestJson(
      `/api/v1/projects/${encodeURIComponent(projectId)}/nights`,
      { method: "POST", body },
    ),
    "project_nights_attach_failed",
  );
}

/** `DELETE /api/v1/projects/{id}/nights/{nightId}`: idempotent. */
export async function detachProjectNight(projectId, nightId) {
  return parse(
    await requestJson(
      `/api/v1/projects/${encodeURIComponent(projectId)}/nights/${encodeURIComponent(nightId)}`,
      { method: "DELETE" },
    ),
    "project_night_detach_failed",
  );
}

/**
 * `GET /api/v1/projects/candidates`: the nights and plans of one night of a
 * target (`{ targetId }` or `{ framingId }`) that has no multi-night plan
 * yet → the lines (`night` of `project.schema.json`).
 */
export async function listTargetCandidates({ targetId, framingId }) {
  const query = new URLSearchParams();
  if (framingId) query.set("framingId", framingId);
  else if (targetId) query.set("targetId", targetId);
  return (
    (
      await parse(
        await requestJson(`/api/v1/projects/candidates?${query}`),
        "project_candidates_read_failed",
      )
    )?.candidates || []
  );
}

/**
 * `POST /api/v1/projects`: a multi-night plan created "à partir de plans
 * déjà existants" (`fromSessionIds`, `fromPlanIds`), all checked before it
 * exists. Resolves to the resource, with its `nights`; the store lists it.
 */
export async function createProjectFromNights(body) {
  const project = await parse(
    await requestJson("/api/v1/projects", { method: "POST", body }),
    "project_create_failed",
  );
  replace(project);
  nightsChanged();
  return project;
}

/** The multi-night plans a night (`sessionId`) or a plan (`planId`) belongs to. */
export async function listProjectsOf({ sessionId = null, planId = null }) {
  const query = new URLSearchParams();
  if (sessionId) query.set("sessionId", sessionId);
  if (planId) query.set("planId", planId);
  return (
    (
      await parse(
        await requestJson(`/api/v1/projects?${query}`),
        "project_list_failed",
      )
    )?.projects || []
  );
}

/**
 * The summaries of the debriefed nights of the planner's plans, by planner
 * plan id: the space's plans give each plan's server id, its session gives
 * the summary of its night. Nights not run, or run without a session, have
 * none.
 */
export async function loadNightSummaries(plannerPlanIds) {
  const wanted = new Set(plannerPlanIds);
  if (!wanted.size) return {};
  const plans =
    (await parse(await requestJson("/api/v1/plans"), "plan_list_failed"))
      ?.plans || [];
  const plannerIdOf = new Map(
    plans
      .filter((plan) => wanted.has(plan?.payload?.id))
      .map((plan) => [plan.id, plan.payload.id]),
  );
  if (!plannerIdOf.size) return {};
  const sessions = [];
  let since = null;
  for (let page = 0; page < 20; page += 1) {
    const query = new URLSearchParams({ limit: "200" });
    if (since) query.set("since", since);
    const data = await parse(
      await requestJson(`/api/v1/sessions?${query}`),
      "session_list_failed",
    );
    sessions.push(...(data?.sessions || []));
    if (!data?.nextSince || !(data?.sessions || []).length) break;
    if (data.nextSince === since) break;
    since = data.nextSince;
  }
  const summaries = {};
  for (const session of sessions) {
    const plannerId = plannerIdOf.get(session?.planId);
    if (!plannerId || summaries[plannerId]) continue;
    try {
      const detail = await parse(
        await requestJson(`/api/v1/sessions/${encodeURIComponent(session.id)}`),
        "session_read_failed",
      );
      const summary = detail?.debriefSummary ?? detail?.session?.debriefSummary;
      if (summary) summaries[plannerId] = summary;
    } catch {
      // A night whose session cannot be read counts as not debriefed.
    }
  }
  return summaries;
}

// ------------------------------------------------------------------ store

let state = {
  status: "idle", // idle | loading | ready | error
  projects: [],
  summaries: {},
  summariesKey: "",
  notice: null,
  nightsVersion: 0,
};
const listeners = new Set();
const emit = (patch) => {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
};
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => state;
const serverSnapshot = () => state;

/** The store as a component reads it. */
export const useMultiNightStore = () =>
  useSyncExternalStore(subscribe, snapshot, serverSnapshot);

/** Loads the list once (again with `force`). */
export async function loadProjects({ force = false } = {}) {
  if (!force && (state.status === "loading" || state.status === "ready"))
    return;
  emit({ status: "loading" });
  try {
    emit({ status: "ready", projects: await listProjects() });
  } catch {
    emit({ status: "error" });
  }
}

/** Loads the summaries of these planner plans, once per set of plans. */
export async function loadSummaries(plannerPlanIds) {
  const key = [...plannerPlanIds].sort().join(",");
  if (!key || key === state.summariesKey) return;
  emit({ summariesKey: key });
  try {
    emit({ summaries: await loadNightSummaries(plannerPlanIds) });
  } catch {
    // Without them, the nights read as not debriefed yet.
  }
}

function replace(project) {
  const others = state.projects.filter((entry) => entry.id !== project.id);
  emit({ projects: [project, ...others] });
}

/** Creates a multi-night plan; resolves to the resource. */
export async function createProject(body) {
  const id = globalThis.crypto.randomUUID();
  const project = await putProject({ id, body, revision: 0 });
  replace(project);
  return project;
}

/**
 * Updates one; a `409` keeps the service's version and says so ("Modifié
 * sur un autre appareil").
 */
export async function updateProject(project, body) {
  try {
    const saved = await putProject({
      id: project.id,
      body,
      revision: project.revision,
    });
    replace(saved);
    return saved;
  } catch (error) {
    if (error.status === 409 && error.project) {
      replace(error.project);
      emit({ notice: "changedElsewhere" });
      return null;
    }
    throw error;
  }
}

/** Archives one. */
export async function archive(project) {
  try {
    const saved = await archiveProject({
      id: project.id,
      revision: project.revision,
    });
    if (saved) replace(saved);
    return saved;
  } catch (error) {
    if (error.status === 409 && error.project) {
      replace(error.project);
      emit({ notice: "changedElsewhere" });
      return null;
    }
    throw error;
  }
}

export const dismissNotice = () => emit({ notice: null });

/**
 * Says that the nights of the plans changed (attached, detached): the pages
 * that list them read them again, and the planner's plans are re-read from
 * the service (it rewrote the plan items it attached).
 */
export function nightsChanged() {
  emit({ nightsVersion: state.nightsVersion + 1 });
  // The service withholds its change signal from the tab that wrote (the
  // client-instance header), and it rewrote plan items this tab holds:
  // the planner reads its plans again (`PlannerPage`, `CHANGE_SIGNAL_EVENT`).
  if (typeof window !== "undefined")
    window.dispatchEvent(new window.Event(CHANGE_SIGNAL_EVENT));
}

/** For the tests: the store as it starts. */
export function resetMultiNightStore(patch = {}) {
  state = {
    status: "idle",
    projects: [],
    summaries: {},
    summariesKey: "",
    notice: null,
    nightsVersion: 0,
    ...patch,
  };
  for (const listener of listeners) listener();
}

// ------------------------------------------------------------------ route

// Where the multi-night side of the library is: the list, or one plan's
// detail, its calendar or its progress (`screen`), with the night a notice
// speaks of (`night`, after a debriefing). Kept in the address
// (`?view=plans&kind=multi&multiNight=<id>&screen=progress&night=<plan>`),
// which the debriefing's link opens.
const LIST = Object.freeze({ screen: "list", projectId: null, night: null });
let route = null;
const routeListeners = new Set();

function routeFromAddress() {
  if (typeof window === "undefined") return LIST;
  const parameters = new URLSearchParams(window.location.search);
  const projectId = parameters.get("multiNight");
  const screen = parameters.get("screen");
  if (parameters.get("kind") === "multi" && screen === "calendar")
    return { screen, projectId, night: null };
  if (!projectId) return LIST;
  return {
    screen: ["detail", "calendar", "progress"].includes(screen)
      ? screen
      : "detail",
    projectId,
    night: parameters.get("night"),
  };
}

const routeSnapshot = () => {
  if (route === null) route = routeFromAddress();
  return route;
};

/** The screen of the multi-night side, as a component reads it. */
export const useMultiNightRoute = () =>
  useSyncExternalStore(
    (listener) => {
      routeListeners.add(listener);
      return () => routeListeners.delete(listener);
    },
    routeSnapshot,
    () => LIST,
  );

/** Goes to `next` (`{ screen, projectId?, night? }`), and says so in the address. */
export function openMultiNightRoute(next) {
  route = { ...LIST, ...next };
  if (typeof window !== "undefined") {
    const url = new URL(window.location.href);
    url.searchParams.set("view", "plans");
    url.searchParams.set("kind", "multi");
    for (const key of ["multiNight", "screen", "night"])
      url.searchParams.delete(key);
    if (route.projectId) url.searchParams.set("multiNight", route.projectId);
    if (route.screen !== "list") url.searchParams.set("screen", route.screen);
    if (route.night) url.searchParams.set("night", route.night);
    window.history.replaceState({}, "", url);
    window.scrollTo?.({ top: 0 });
  }
  for (const listener of routeListeners) listener();
}

/** Read-only cache snapshot for optional planner inputs. */
export const multiNightSnapshot = () => state;
