import { clientInstanceHeaders } from "portal/planner/change-subscription.js";
import { callService, failureKind } from "../space/space-client.js";

/**
 * What the tabs « Plans » and « Sessions » of « Mon espace » ask of the
 * service (api/v1.md, « The trash of the plans », « Deleting a session »), on
 * the pattern of the other tabs: every function takes the `fetch` to use and
 * answers `{ kind, … }` — `ok`, `refused` (with the service's `code` and its
 * `body`), or one of the kinds every call shares (`offline`, `unreachable`,
 * `signed-out`, `space-deleted`, `failed`).
 */

const enc = encodeURIComponent;

function outcome(answer, ok = [200, 201, 204]) {
  if (ok.includes(answer.status)) return { kind: "ok", body: answer.body };
  if (
    [403, 404, 409, 428].includes(answer.status) &&
    answer.code !== "csrf_invalid"
  )
    return { kind: "refused", code: answer.code, body: answer.body };
  return failureKind(answer);
}

const write = (
  fetcher,
  path,
  { csrf, method = "POST", body = {}, headers = {} },
) =>
  callService(fetcher, path, {
    method,
    csrf,
    body,
    headers: { ...clientInstanceHeaders(), ...headers },
  });

/**
 * The plans of one night and the multi-night plans, each multi-night plan
 * read with its nights (`GET /v1/projects/{id}`).
 */
export async function loadPlansAndProjects(fetcher) {
  const [plans, projects] = await Promise.all([
    callService(fetcher, "/api/v1/plans"),
    callService(fetcher, "/api/v1/projects"),
  ]);
  if (plans.status !== 200) return failureKind(plans);
  let list = [];
  if (projects.status === 200 && Array.isArray(projects.body?.projects))
    list = await Promise.all(
      projects.body.projects.map(async (project) => {
        const one = await callService(
          fetcher,
          `/api/v1/projects/${enc(project.id)}`,
        );
        return one.status === 200 ? one.body : project;
      }),
    );
  return { kind: "ok", plans: plans.body?.plans ?? [], projects: list };
}

/** `GET /v1/plans/deleted`. */
export async function loadDeletedPlans(fetcher) {
  const answer = await callService(fetcher, "/api/v1/plans/deleted");
  if (answer.status === 200)
    return {
      kind: "ok",
      plans: answer.body?.plans ?? [],
      projects: answer.body?.projects ?? [],
      graceDays: answer.body?.graceDays ?? 30,
    };
  return failureKind(answer);
}

/** `DELETE /v1/plans/{id}` (to the trash); `force` for a night in progress. */
export async function deletePlan(
  fetcher,
  { id, revision, force = false, csrf },
) {
  const answer = await callService(
    fetcher,
    `/api/v1/plans/${enc(id)}${force ? "?force=true" : ""}`,
    {
      method: "DELETE",
      csrf,
      headers: { ...clientInstanceHeaders(), "if-match": `"${revision}"` },
    },
  );
  return outcome(answer);
}

/**
 * « Archiver le plan »: a plan the service froze through `POST
 * /v1/plans/{id}/archive`; a plan still active is written with `closedAs:
 * "archived"` (the state it was closed as kept in `archivedFrom`), as the
 * planner does.
 */
export async function archivePlan(fetcher, { resource, csrf }) {
  if (resource.status !== "active")
    return outcome(
      await write(fetcher, `/api/v1/plans/${enc(resource.id)}/archive`, {
        csrf,
      }),
    );
  const { revision: _revision, ...payload } = resource.payload ?? {};
  const closed = ["executed", "partial", "abandoned"].includes(payload.closedAs)
    ? payload.closedAs
    : null;
  return outcome(
    await write(fetcher, `/api/v1/plans/${enc(resource.id)}`, {
      csrf,
      method: "PUT",
      headers: { "if-match": `"${resource.revision}"` },
      body: {
        payload: {
          ...payload,
          closedAs: "archived",
          ...(closed ? { archivedFrom: closed } : {}),
        },
      },
    }),
  );
}

/** « Rétablir le plan ». */
export async function unarchivePlan(fetcher, { resource, csrf }) {
  if (resource.status === "archived")
    return outcome(
      await write(fetcher, `/api/v1/plans/${enc(resource.id)}/unarchive`, {
        csrf,
      }),
    );
  const {
    revision: _revision,
    archivedFrom,
    ...payload
  } = resource.payload ?? {};
  const rest = { ...payload };
  if (archivedFrom) rest.closedAs = archivedFrom;
  else delete rest.closedAs;
  return outcome(
    await write(fetcher, `/api/v1/plans/${enc(resource.id)}`, {
      csrf,
      method: "PUT",
      headers: { "if-match": `"${resource.revision}"` },
      body: { payload: rest },
    }),
  );
}

export const restorePlan = async (fetcher, { id, csrf }) =>
  outcome(await write(fetcher, `/api/v1/plans/${enc(id)}/restore`, { csrf }));

export const erasePlan = async (fetcher, { id, csrf }) =>
  outcome(await write(fetcher, `/api/v1/plans/${enc(id)}/erase`, { csrf }));

/** « Supprimer ce plan multi-nuits ». */
export const trashProject = async (fetcher, { id, force = false, csrf }) =>
  outcome(
    await write(fetcher, `/api/v1/projects/${enc(id)}/trash`, {
      csrf,
      body: force ? { force: true } : {},
    }),
  );

/** « Archiver ce plan multi-nuits » (`DELETE /v1/projects/{id}` archives). */
export const archiveProject = async (fetcher, { id, revision, csrf }) =>
  outcome(
    await write(fetcher, `/api/v1/projects/${enc(id)}`, {
      csrf,
      method: "DELETE",
      body: undefined,
      headers: { "if-match": `"${revision}"` },
    }),
  );

export const restoreProject = async (fetcher, { id, csrf }) =>
  outcome(
    await write(fetcher, `/api/v1/projects/${enc(id)}/restore`, { csrf }),
  );

export const eraseProject = async (fetcher, { id, csrf }) =>
  outcome(await write(fetcher, `/api/v1/projects/${enc(id)}/erase`, { csrf }));

/**
 * Every session of the Journal (`GET /v1/journal`, page after page, every
 * outcome), at most `pages` pages of 100.
 */
export async function loadSessions(fetcher, { pages = 20 } = {}) {
  const lines = [];
  let cursor = null;
  for (let page = 0; page < pages; page += 1) {
    const query = new URLSearchParams({
      limit: "100",
      outcome: "to_debrief,executed,partial,abandoned,no_plan",
    });
    if (cursor) query.set("cursor", cursor);
    const answer = await callService(fetcher, `/api/v1/journal?${query}`);
    if (answer.status !== 200) return failureKind(answer);
    lines.push(...(answer.body?.sessions ?? []));
    cursor = answer.body?.nextCursor ?? null;
    if (!cursor) break;
  }
  return { kind: "ok", lines };
}

/** `GET /v1/journal/deleted`. */
export async function loadDeletedSessions(fetcher) {
  const answer = await callService(fetcher, "/api/v1/journal/deleted");
  if (answer.status === 200)
    return {
      kind: "ok",
      entries: answer.body?.entries ?? [],
      graceDays: answer.body?.graceDays ?? 30,
    };
  return failureKind(answer);
}

/**
 * The owner's captures, page after page (at most `pages` pages of 200), for
 * the names and the sizes the dialogs give; an empty list when they cannot be
 * read (the dialog then counts them).
 */
export async function loadCaptureSummaries(
  fetcher,
  { locale, pages = 5 } = {},
) {
  const captures = [];
  let before = null;
  for (let page = 0; page < pages; page += 1) {
    const query = new URLSearchParams({ locale, limit: "200" });
    if (before) query.set("before", `${before.createdAt},${before.id}`);
    const answer = await callService(
      fetcher,
      `/api/v1/manage/captures?${query}`,
    );
    if (answer.status !== 200) break;
    captures.push(...(answer.body?.captures ?? []));
    if (!answer.body?.hasMore || !answer.body?.nextBefore) break;
    before = answer.body.nextBefore;
  }
  return captures;
}

export const deleteSession = async (fetcher, { id, csrf }) =>
  outcome(
    await callService(fetcher, `/api/v1/sessions/${enc(id)}`, {
      method: "DELETE",
      csrf,
      headers: clientInstanceHeaders(),
    }),
  );

export const restoreSession = async (fetcher, { id, csrf }) =>
  outcome(
    await write(fetcher, `/api/v1/sessions/${enc(id)}/restore`, { csrf }),
  );

export const eraseSession = async (fetcher, { id, csrf }) =>
  outcome(await write(fetcher, `/api/v1/sessions/${enc(id)}/erase`, { csrf }));
