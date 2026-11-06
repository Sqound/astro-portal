import { callService, failureKind } from "../space/space-client.js";

/**
 * What the tab « Matériel » of « Mon espace » asks of the service
 * (api/v1.md, « The owner's equipment »), on the pattern of the other calls
 * of the space page: every function takes the `fetch` to use and answers
 * `{ kind, … }` — `ok`, `not-found`, `refused` (with the service's `code`),
 * or one of the kinds every call shares (`offline`, `unreachable`,
 * `signed-out`, `space-deleted`, `failed`).
 */

const base = "/api/v1/manage/equipment";
const one = (id) => `${base}/${encodeURIComponent(id)}`;

const readOf = (answer) =>
  answer.status === 200 &&
  Array.isArray(answer.body?.equipment) &&
  Array.isArray(answer.body?.defaults)
    ? { kind: "ok", read: answer.body }
    : null;

const itemOf = (answer) =>
  [200, 201].includes(answer.status) && answer.body?.equipment
    ? { kind: "ok", equipment: answer.body.equipment }
    : null;

const refusal = (answer) => {
  if (answer.status === 404) return { kind: "not-found" };
  if (answer.status === 400 && answer.code)
    return { kind: "refused", code: answer.code };
  return failureKind(answer);
};

/** `GET /api/v1/manage/equipment`: the items, the defaults, the option. */
export async function loadEquipment(fetcher) {
  const answer = await callService(fetcher, base);
  return readOf(answer) || failureKind(answer);
}

/** `POST /api/v1/manage/equipment`: « Nouveau matériel », « Ajouter ». */
export async function createEquipment(fetcher, { equipment, csrf }) {
  const answer = await callService(fetcher, base, {
    method: "POST",
    body: { equipment },
    csrf,
  });
  return itemOf(answer) || refusal(answer);
}

/** `PATCH /api/v1/manage/equipment/{id}` `{ equipment }` or `{ action: "restore" }`. */
export async function changeItem(fetcher, { id, body, csrf }) {
  const answer = await callService(fetcher, one(id), {
    method: "PATCH",
    body,
    csrf,
  });
  return itemOf(answer) || refusal(answer);
}

/** `DELETE /api/v1/manage/equipment/{id}`: « Archiver ». */
export async function archiveItem(fetcher, { id, csrf }) {
  const answer = await callService(fetcher, one(id), {
    method: "DELETE",
    csrf,
  });
  return itemOf(answer) || refusal(answer);
}

/**
 * `PATCH /api/v1/manage/equipment` `{ hideDefaultEquipment }` or `{ action:
 * "reorder", type, ids }`: the whole read again.
 */
export async function changeEquipment(fetcher, { body, csrf }) {
  const answer = await callService(fetcher, base, {
    method: "PATCH",
    body,
    csrf,
  });
  return readOf(answer) || refusal(answer);
}

/**
 * `PUT /api/v1/manage/default-configuration` `{ configuration }` (« Ma
 * configuration par défaut »): `{ kind: "ok", configuration }`, the
 * configuration the space kept.
 */
export async function saveConfiguration(fetcher, { configuration, csrf }) {
  const answer = await callService(
    fetcher,
    "/api/v1/manage/default-configuration",
    { method: "PUT", body: { configuration }, csrf },
  );
  return answer.status === 200 && answer.body && "configuration" in answer.body
    ? { kind: "ok", configuration: answer.body.configuration }
    : refusal(answer);
}
