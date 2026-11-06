import { clientInstanceHeaders } from "portal/planner/change-subscription.js";
import { callService, failureKind } from "../space/space-client.js";

/**
 * What the tab « Captures » of « Mon espace » asks of the service
 * (api/v1.md, « The owner's captures »), on the pattern of the space page's
 * calls (`space/space-client.js`): every function takes the `fetch` to use
 * and answers `{ kind, … }` — `ok`, `not-found`, `refused` (with the
 * service's `code`), or one of the kinds every call shares (`offline`,
 * `unreachable`, `signed-out`, `space-deleted`, `failed`).
 */

const base = "/api/v1/manage/captures";
const one = (id) => `${base}/${encodeURIComponent(id)}`;

/**
 * The address of a capture's bytes, for its owner; `{ thumbnail: true }`, its
 * thumbnail (written after the upload); `{ preview: true }` the shared copy
 * (JPEG, 4096 px at most, without location) the opened capture is drawn with (a
 * grid keeps the thumbnail); `{ download: true }` the original as an attachment
 * (management only), `{ imageId }` one image of the capture.
 */
export function captureMediaPath(
  id,
  { thumbnail = false, preview = false, download = false, imageId = null } = {},
) {
  const query = new URLSearchParams();
  if (thumbnail) query.set("variant", "thumbnail");
  else if (preview) query.set("variant", "preview");
  if (download && !thumbnail && !preview) query.set("download", "1");
  if (imageId) query.set("imageId", imageId);
  const text = query.toString();
  return `${one(id)}/media${text ? `?${text}` : ""}`;
}

/** `GET /api/v1/manage/captures`: one page of the list, newest first. */
export async function loadCaptures(
  fetcher,
  { locale, before = null, limit = 200 } = {},
) {
  const query = new URLSearchParams({ locale, limit: String(limit) });
  if (before) query.set("before", `${before.createdAt},${before.id}`);
  const answer = await callService(fetcher, `${base}?${query}`);
  if (answer.status === 200 && Array.isArray(answer.body?.captures))
    return { kind: "ok", page: answer.body };
  return failureKind(answer);
}

/** `GET /api/v1/manage/captures/{id}`. */
export async function loadCapture(fetcher, { id, locale }) {
  const answer = await callService(
    fetcher,
    `${one(id)}?${new URLSearchParams({ locale })}`,
  );
  if (answer.status === 200 && answer.body?.capture)
    return { kind: "ok", capture: answer.body.capture };
  if (answer.status === 404) return { kind: "not-found" };
  return failureKind(answer);
}

/**
 * What an owner write carries (« A capture written by two hands »): the
 * instance of this tab, so that the change channel does not echo the write
 * back to the tab that made it, and, when the page read the capture's
 * `revision`, `If-Match: "<revision>"` — the service then refuses the write
 * (`409 capture_conflict`) only if the field it writes changed after that
 * revision.
 */
export const writeHeaders = (revision = null) => ({
  ...clientInstanceHeaders(),
  ...(Number.isInteger(revision) && revision >= 1
    ? { "if-match": `"${revision}"` }
    : {}),
});

/**
 * The answer of a write: the capture, `not-found`, `conflict` (`409
 * capture_conflict`: the `field` — and the `line` of an integration — that
 * changed elsewhere, and the `capture` as it is now; nothing was written),
 * `refused` (the service's rule, with its `code`) or a kind every call shares.
 */
function writeOutcome(answer) {
  if (answer.status === 200 && answer.body?.capture)
    return { kind: "ok", capture: answer.body.capture };
  if (answer.status === 404) return { kind: "not-found" };
  if (answer.status === 409 && answer.code === "capture_conflict")
    return {
      kind: "conflict",
      field: answer.body?.error?.field ?? null,
      line: answer.body?.error?.line ?? null,
      capture: answer.body?.capture ?? null,
    };
  if ([403, 409].includes(answer.status) && answer.code !== "csrf_invalid")
    return { kind: "refused", code: answer.code };
  return failureKind(answer);
}

/**
 * `PATCH /api/v1/manage/captures/{id}` with one change (`{ visibility }`,
 * `{ requestReview: true }`, `{ acceptVerification: true }`, `{ tags }`,
 * `{ stage }`, `{ metadata: { <one field> } }`): **one field per request**,
 * against the `revision` the page read.
 */
export async function changeCapture(
  fetcher,
  { id, change, locale, csrf, revision = null },
) {
  return writeOutcome(
    await callService(
      fetcher,
      `${one(id)}?${new URLSearchParams({ locale })}`,
      {
        method: "PATCH",
        body: change,
        csrf,
        headers: writeHeaders(revision),
      },
    ),
  );
}

/**
 * `POST /api/v1/manage/captures/{id}/acquisition/sync`: « Synchroniser avec
 * la session » — or, on the image of a multi-night plan, « Synchroniser
 * avec les sessions du plan ». Answers the capture with its lines filled
 * from its session(s); `refused` carries `capture_without_session` or
 * `entitlement_read_only`; `conflict` a line that changed elsewhere since
 * the `revision` read.
 */
export async function syncCaptureAcquisition(
  fetcher,
  { id, locale, csrf, revision = null },
) {
  return writeOutcome(
    await callService(
      fetcher,
      `${one(id)}/acquisition/sync?${new URLSearchParams({ locale })}`,
      { method: "POST", csrf, headers: writeHeaders(revision) },
    ),
  );
}

/** `DELETE /api/v1/manage/captures/{id}`: « Supprimer la capture ». */
export async function deleteCapture(fetcher, { id, csrf }) {
  const answer = await callService(fetcher, one(id), {
    method: "DELETE",
    csrf,
  });
  if (answer.status === 204) return { kind: "ok" };
  if (answer.status === 404) return { kind: "not-found" };
  return failureKind(answer);
}

/** The SHA-256 of a file the browser holds, in lowercase hexadecimal. */
export async function fileDigest(file, subtle = globalThis.crypto?.subtle) {
  const digest = await subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * « Ajouter une capture »: one file chosen in the browser, its SHA-256
 * computed in the page, sent to `POST /api/v1/uploads` (the non-resumable
 * form: the metadata part first, then the file) with the web session and its
 * CSRF token. A refusal of the service answers `refused` with its `code` and
 * its `storage` (the limit of the profile, for the words of the refusal).
 */
export async function uploadCapture(
  fetcher,
  { file, csrf, digest = fileDigest, sha256: known = null, metadata = {} },
) {
  let sha256 = known;
  if (!sha256)
    try {
      sha256 = await digest(file);
    } catch {
      return { kind: "failed", code: "digest_failed" };
    }
  const form = new FormData();
  form.append(
    "metadata",
    new Blob(
      [
        JSON.stringify({
          ...metadata,
          originalName: file.name,
          sha256,
          byteSize: file.size,
        }),
      ],
      { type: "application/json" },
    ),
  );
  form.append("file", file, file.name);
  let response;
  try {
    response = await fetcher("/api/v1/uploads", {
      method: "POST",
      credentials: "same-origin",
      headers: { "x-astro-csrf": csrf || "" },
      body: form,
    });
  } catch {
    return { kind: "offline" };
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  // `replaced` (one capture per session and target, and a space without the
  // right to variants: the new image took the place of the old one) and
  // `variant` (a space with it: the new image was added to the capture) say
  // what the service did with an image that met another; the page of a
  // session says it in words.
  if (response.status === 200 || response.status === 201)
    return {
      kind: "ok",
      capture: body?.capture ?? null,
      replaced: body?.replaced === true,
      variant: Boolean(body?.variant),
    };
  const answer = {
    status: response.status,
    body,
    code: body?.error?.code || null,
  };
  if ([400, 403, 409, 413, 415].includes(response.status) && answer.code)
    return { kind: "refused", code: answer.code, storage: body?.storage };
  return failureKind(answer);
}

/**
 * One gesture on an image of a capture,
 * `PATCH /api/v1/manage/captures/{id}/variants/{imageId}` with one change
 * (`{ main: true }`, `{ public }`, `{ title }`, `{ description }`), or
 * `DELETE` on the same path (`change` null). Answers the capture.
 */
export async function changeImage(
  fetcher,
  { id, imageId, change = null, locale, csrf },
) {
  const answer = await callService(
    fetcher,
    `${one(id)}/variants/${encodeURIComponent(imageId)}?${new URLSearchParams({ locale })}`,
    change
      ? { method: "PATCH", body: change, csrf, headers: writeHeaders() }
      : { method: "DELETE", csrf, headers: writeHeaders() },
  );
  if (answer.status === 200 && answer.body?.capture)
    return { kind: "ok", capture: answer.body.capture };
  if (answer.status === 404) return { kind: "not-found" };
  if ([400, 403, 409].includes(answer.status) && answer.code !== "csrf_invalid")
    return { kind: "refused", code: answer.code };
  return failureKind(answer);
}

/**
 * « Résoudre sur ce serveur », only where
 * the server announces `sky.solve_on_server` (a private server that has
 * `solve-field`; `404` anywhere else). `POST …/sky-solution/solve` starts the
 * resolution of the main image (`202`), `GET` on the same path reads where it
 * stands. Both answer `{ kind: "ok", state, reason? }`, `state` being `idle`,
 * `running`, `solved` or `failed` (with its `reason`).
 */
export async function startSkySolve(fetcher, { id, csrf }) {
  const answer = await callService(fetcher, `${one(id)}/sky-solution/solve`, {
    method: "POST",
    csrf,
  });
  if ([200, 202].includes(answer.status) && answer.body?.state)
    return { kind: "ok", ...answer.body };
  if (answer.status === 404) return { kind: "not-found" };
  return failureKind(answer);
}

export async function readSkySolve(fetcher, { id }) {
  const answer = await callService(fetcher, `${one(id)}/sky-solution/solve`);
  if (answer.status === 200 && answer.body?.state)
    return { kind: "ok", ...answer.body };
  if (answer.status === 404) return { kind: "not-found" };
  return failureKind(answer);
}

/**
 * `POST /api/v1/uploads/check` before a byte is sent — the file's
 * SHA-256, size and name, and where it goes. Answers `present`,
 * `accepted` or `refused` (with the service's `code` and `storage`).
 */
export async function checkUpload(fetcher, { metadata, csrf }) {
  const answer = await callService(fetcher, "/api/v1/uploads/check", {
    method: "POST",
    body: metadata,
    csrf,
  });
  if (answer.status === 200 && answer.body?.result)
    return { kind: answer.body.result, ...answer.body };
  return failureKind(answer);
}

/** `POST /api/v1/targets/personal`, « Nouvelle cible ». */
export async function createPersonalTarget(fetcher, { target, csrf }) {
  const answer = await callService(fetcher, "/api/v1/targets/personal", {
    method: "POST",
    body: target,
    csrf,
  });
  const created = answer.body?.target ?? answer.body;
  if ((answer.status === 201 || answer.status === 200) && created?.id)
    return { kind: "ok", target: created };
  if (answer.status === 400) return { kind: "refused", code: answer.code };
  return failureKind(answer);
}

/**
 * `POST /api/v1/manage/captures`, « Créer sans image » — a capture's
 * definition alone (its night and its targets, both optional), a private
 * draft; the images come later.
 */
export async function createDefinition(
  fetcher,
  { sessionId = null, targetIds = [], locale, csrf },
) {
  const answer = await callService(
    fetcher,
    `${base}?${new URLSearchParams({ locale })}`,
    { method: "POST", body: { sessionId, targetIds }, csrf },
  );
  if (answer.status === 201 && answer.body?.capture)
    return { kind: "ok", capture: answer.body.capture };
  if ([403, 404, 409].includes(answer.status) && answer.code !== "csrf_invalid")
    return {
      kind: "refused",
      code: answer.code,
      storage: answer.body?.storage,
    };
  return failureKind(answer);
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * A ULID (26 Crockford characters: 48 bits of time, 80 of randomness) — the
 * key a client gives a session it creates (`clientSessionId`) so that a retry
 * returns the same session instead of a second one.
 */
export function newUlid(
  now = Date.now(),
  random = (bytes) => globalThis.crypto.getRandomValues(bytes),
) {
  let time = "";
  let remaining = Math.floor(now);
  for (let index = 0; index < 10; index += 1) {
    time = CROCKFORD[remaining % 32] + time;
    remaining = Math.floor(remaining / 32);
  }
  const bytes = random(new Uint8Array(16));
  let tail = "";
  for (let index = 0; index < 16; index += 1)
    tail += CROCKFORD[bytes[index] % 32];
  return time + tail;
}

/**
 * The night of a capture (« a capture always has its session »), built with the
 * calls the service already has — `POST /api/v1/sessions` (`origin: "capture"`,
 * keyed by `clientSessionId`, so a retry converges on one session),
 * `POST …/finish`, then `PATCH …/night` with the place (never a time zone) and
 * the targets, possibly none. Answers `{ kind: "ok", sessionId }`, or the kind
 * of the call that did not succeed.
 */
export async function createCaptureSession(
  fetcher,
  {
    startedAt,
    finishedAt = startedAt,
    clientSessionId,
    place = null,
    targetIds = [],
    csrf,
  },
) {
  const created = await callService(fetcher, "/api/v1/sessions", {
    method: "POST",
    body: { startedAt, clientSessionId, origin: "capture" },
    csrf,
  });
  const sessionId = created.body?.session?.id;
  if (![200, 201].includes(created.status) || !sessionId)
    return failureKind(created);
  const path = `/api/v1/sessions/${encodeURIComponent(sessionId)}`;
  const finished = await callService(fetcher, `${path}/finish`, {
    method: "POST",
    body: { finishedAt },
    csrf,
  });
  if (finished.status !== 200) return failureKind(finished);
  const night = await callService(fetcher, `${path}/night`, {
    method: "PATCH",
    body: {
      ...(place
        ? {
            place: {
              name: place.name,
              latitude: place.latitude,
              longitude: place.longitude,
            },
          }
        : {}),
      targetIds,
    },
    csrf,
  });
  if (night.status !== 200) return failureKind(night);
  return { kind: "ok", sessionId };
}

const compact = (text) =>
  String(text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * The catalogue target a file name names (« M31-final.jpg » → M 31), or
 * `null`: its whole name, then its first three, two and one words, are asked
 * of the target index, and a row is taken only when its designation, its name
 * or one of its aliases is exactly what was asked (letters and digits, case
 * and accents aside). A wrong guess costs the person a correction; a missing
 * one only a choice, so nothing less than an exact match is proposed.
 */
export async function guessTarget(fetcher, { name, locale }) {
  const words = String(name ?? "")
    .split(/\s+/)
    .filter(Boolean);
  const asked = [
    ...new Set(
      [words.length, 3, 2, 1]
        .filter((count) => count > 0 && count <= words.length)
        .map((count) => words.slice(0, count).join(" ")),
    ),
  ];
  for (const query of asked) {
    if (compact(query).length < 2) continue;
    const answer = await callService(
      fetcher,
      `/api/v1/target-index?${new URLSearchParams({ locale, q: query, sort: "planner", limit: "8" })}`,
    );
    const fields = Array.isArray(answer.body?.fields) ? answer.body.fields : [];
    const rows = Array.isArray(answer.body?.rows) ? answer.body.rows : [];
    if (answer.status !== 200 || !fields.length) continue;
    const column = (row, key) => row?.[fields.indexOf(key)];
    const wanted = compact(query);
    for (const row of rows) {
      const names = [
        column(row, "designation"),
        column(row, "name"),
        ...(Array.isArray(column(row, "aliases"))
          ? column(row, "aliases")
          : []),
      ];
      if (names.some((candidate) => compact(candidate) === wanted))
        return {
          id: column(row, "id"),
          designation: column(row, "designation"),
          name: column(row, "name") || null,
        };
    }
  }
  return null;
}
