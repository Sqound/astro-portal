import { callService, failureKind } from "../space/space-client.js";

/**
 * What the tab « Galerie privée » of « Mon espace » asks of the service
 * (api/v1.md, « The private gallery »), on the pattern of the tab
 * « Captures » (`captures-client.js`): every function takes the `fetch` to
 * use and answers `{ kind, … }` — `ok` with the settings, `refused` with the
 * service's `code` (and the `field` and `word` of a name refused), or one of
 * the kinds every call shares (`offline`, `unreachable`, `signed-out`,
 * `space-deleted`, `failed`).
 */

const PATH = "/api/v1/manage/portal";

const settingsOf = (answer) =>
  answer.status === 200 && typeof answer.body?.address === "string"
    ? { kind: "ok", settings: answer.body }
    : null;

/** `GET /api/v1/manage/portal`. */
export async function loadPortal(fetcher) {
  const answer = await callService(fetcher, PATH);
  return settingsOf(answer) || failureKind(answer);
}

/**
 * `PATCH /api/v1/manage/portal` with one change: `{ mode }` (and
 * `confirmVerifiers` for `link`), the names, or `{ regenerateToken: true }`.
 */
export async function changePortal(fetcher, { change, csrf }) {
  const answer = await callService(fetcher, PATH, {
    method: "PATCH",
    body: change,
    csrf,
  });
  const done = settingsOf(answer);
  if (done) return done;
  if (
    [400, 403, 409, 422].includes(answer.status) &&
    answer.code &&
    !["csrf_invalid", "web_session_required"].includes(answer.code)
  )
    return {
      kind: "refused",
      code: answer.code,
      field: answer.body?.error?.field ?? null,
      word: answer.body?.error?.word ?? null,
    };
  return failureKind(answer);
}

/** The address as shown: the host and the path, no scheme. */
export function shownAddress(address) {
  return String(address || "").replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
}
