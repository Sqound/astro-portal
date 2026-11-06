import { createHash } from "node:crypto";

/**
 * The production implementation of api/v1.md's "From a plan to an
 * observation session: the initial-event mapping" and "Late field data:
 * session supplements". It is deliberately a byte-for-byte port of the
 * reference implementation in
 * packages/astro-contracts/tests/sessions.test.mjs (the mapping section, from
 * `eventIdFor`/`mapPlanToSession`/`acceptSupplement` down): that file is the
 * approved contract's own worked example and recomputes the exact identifiers
 * this module must reproduce. A test asserts this module against the same
 * fixed plan/request/instants sessions.test.mjs uses, so any future drift
 * between the two fails loudly on both sides.
 *
 * Pure functions only: no I/O, no database. debrief-repository.js supplies
 * already-resolved inputs (the plan row's stored nightStartAt/nightEndAt,
 * the chosen base payload/revision, the observation session's own id) and
 * writes the returned events inside its own transaction.
 */

// Crockford base32, excluding I, L, O, U — the ULID alphabet
// event-envelope.schema.json's own eventId pattern uses.
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// U+001F, the unit separator api/v1.md's "Deterministic event identifiers"
// joins sessionId and eventKey with before hashing.
const UNIT_SEPARATOR = String.fromCharCode(0x1f);

function base32(value, length) {
  let rest = BigInt(value);
  let out = "";
  for (let index = 0; index < length; index += 1) {
    out = CROCKFORD[Number(rest % 32n)] + out;
    rest /= 32n;
  }
  return out;
}

/**
 * A generated event's eventId: 10 base32 characters of `anchor + ordinal`
 * (the "order instant", never `recordedAt`), then 16 base32 characters of
 * the first 80 bits of SHA-256(sessionId U+001F eventKey). Every input is a
 * stored value or a pure function of one — nothing from the request or the
 * wall clock — so two decisions racing on the same plan produce
 * byte-identical identifiers for every event they both emit.
 */
export function generatedEventId(sessionId, anchor, ordinal, eventKey) {
  const digest = createHash("sha256")
    .update(`${sessionId}${UNIT_SEPARATOR}${eventKey}`, "utf8")
    .digest();
  let tail = 0n;
  for (let index = 0; index < 10; index += 1)
    tail = (tail << 8n) | BigInt(digest[index]);
  return base32(Date.parse(anchor) + ordinal, 10) + base32(tail, 16);
}

/** `I.startMinute` when finite and non-negative; otherwise `I` has no slot. */
export function slotStart(item) {
  return Number.isFinite(item?.startMinute) && item.startMinute >= 0
    ? item.startMinute
    : null;
}

/** `I.endMinute`, else `slotStart(I) + I.durationMinutes`, else `slotStart(I)`. */
export function slotEnd(item) {
  const start = slotStart(item);
  if (start === null) return null;
  if (Number.isFinite(item?.endMinute) && item.endMinute >= start)
    return item.endMinute;
  if (Number.isFinite(item?.durationMinutes) && item.durationMinutes > 0)
    return start + item.durationMinutes;
  return start;
}

/**
 * Items in slot order (slotStart, then slotEnd, then payload index); every
 * item with no slot comes after every item with one, in payload index order.
 * A pure function of the payload, and the order events are emitted in.
 */
export function chronologicalItems(items) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const a = slotStart(left.item);
      const b = slotStart(right.item);
      if (a === null && b === null) return left.index - right.index;
      if (a === null) return 1;
      if (b === null) return -1;
      return (
        a - b ||
        slotEnd(left.item) - slotEnd(right.item) ||
        left.index - right.index
      );
    });
}

/**
 * The plan-to-session mapping. `plan` carries `{ payload, revision,
 * nightStartAt }` (nightEndAt is read by the caller, not this function, to
 * resolve the session's own finishedAt fallback — see debrief-repository.js).
 * `sessionId` is the observation session's id (new or reused) the generated
 * eventIds are hashed against. `request` is the debriefing decision body
 * (`{ outcome, session?, sessionAdjustments?, note? }`). `now` is the server
 * instant the decision is recorded at (used only for `recordedAt`/`timing`
 * of the two kinds of `observed` note events — never for an eventId).
 *
 * Returns `{ session: { startedAt, finishedAt }, events }`, the resolved
 * session window and every event the mapping's table produces, in emission
 * order.
 */
export function mapPlanToSession({ sessionId, plan, request, now }) {
  const { payload, revision, nightStartAt, nightEndAt } = plan;
  const nightAnchor = `${payload.date}T00:00:00.000Z`;
  const anchor = nightStartAt ?? nightAnchor;
  const startedAt = request.session?.startedAt ?? nightStartAt ?? nightAnchor;
  const finishedAt = request.session?.finishedAt ?? nightEndAt ?? startedAt;
  const atMinute = (minutes) =>
    new Date(Date.parse(nightStartAt) + minutes * 60000).toISOString();
  const adjustments = request.sessionAdjustments?.targets ?? [];
  const events = [];

  chronologicalItems(payload.items).forEach(({ item }, position) => {
    const adjustment = adjustments.find((entry) => entry.targetId === item.id);
    const state =
      request.outcome === "executed"
        ? "done"
        : (adjustment?.state ?? "skipped");
    const placed = nightStartAt != null && slotStart(item) !== null;
    const timing = placed ? "planned" : "reconstructed";
    const targetId = item.targetId ?? item.id;
    const body = { targetId, planItemId: item.id };

    if (state === "skipped") {
      events.push({
        eventId: generatedEventId(
          sessionId,
          anchor,
          4 * position + 3,
          `plan/${revision}/target/${item.id}/skipped`,
        ),
        type: "target_skipped",
        recordedAt: placed ? atMinute(slotStart(item)) : startedAt,
        timing,
        payload: {
          ...body,
          ...(adjustment?.reason ? { reason: adjustment.reason } : {}),
          ...(adjustment?.note ? { notes: adjustment.note } : {}),
        },
      });
      return;
    }

    events.push({
      eventId: generatedEventId(
        sessionId,
        anchor,
        4 * position,
        `plan/${revision}/target/${item.id}/started`,
      ),
      type: "target_started",
      recordedAt: placed ? atMinute(slotStart(item)) : startedAt,
      timing,
      payload: body,
    });
    events.push({
      eventId: generatedEventId(
        sessionId,
        anchor,
        4 * position + 1,
        `plan/${revision}/target/${item.id}/finished`,
      ),
      type: "target_finished",
      recordedAt: placed ? atMinute(slotEnd(item)) : finishedAt,
      timing,
      payload: body,
    });
    // `partial` is observed like `done`, and its note lands in the
    // journal exactly as a `modified` one does.
    if ((state === "modified" || state === "partial") && adjustment?.note)
      events.push({
        eventId: generatedEventId(
          sessionId,
          anchor,
          4 * position + 2,
          `plan/${revision}/target/${item.id}/note`,
        ),
        type: "note",
        recordedAt: now,
        timing: "observed",
        payload: { text: adjustment.note, targetId },
      });
  });

  if (request.note)
    events.push({
      eventId: generatedEventId(
        sessionId,
        anchor,
        4 * payload.items.length,
        `plan/${revision}/note`,
      ),
      type: "note",
      recordedAt: now,
      timing: "observed",
      payload: { text: request.note },
    });

  return { session: { startedAt, finishedAt }, events };
}

/**
 * The supplement-acceptance mapping ("Late field data: session
 * supplements"). `sessionId` is the observation session the supplement
 * belongs to — the same id the hash of every generated eventId is keyed on,
 * matching the plan-mapping's own `generatedEventId(sessionId, ...)`. `plan`
 * carries `{ nightStartAt }` (the session's linked plan, at the revision the
 * session itself was generated from — not necessarily the plan's current
 * revision). `alreadyStartedPlanItemIds` is the set of `planItemId`s a
 * `target_started` event of this session already names (a `target_skipped`
 * does NOT count: it is not a `target_started`, so accepting still appends
 * the pair and the skip line stays untouched). `supplement` carries `{ id,
 * createdAt, payload }`.
 */
export function mapSupplementAcceptance({
  sessionId,
  plan,
  alreadyStartedPlanItemIds,
  supplement,
}) {
  const { nightStartAt } = plan;
  const atMinute = (minutes) =>
    new Date(Date.parse(nightStartAt) + minutes * 60000).toISOString();
  const events = [];
  chronologicalItems(supplement.payload?.items ?? []).forEach(
    ({ item }, position) => {
      if (alreadyStartedPlanItemIds.has(item.id)) return;
      const placed = nightStartAt != null && slotStart(item) !== null;
      const body = {
        targetId: item.targetId ?? item.id,
        planItemId: item.id,
      };
      for (const [offset, suffix, type, minute] of [
        [0, "started", "target_started", slotStart(item)],
        [1, "finished", "target_finished", slotEnd(item)],
      ])
        events.push({
          eventId: generatedEventId(
            sessionId,
            supplement.createdAt,
            4 * position + offset,
            `supplement/${supplement.id}/target/${item.id}/${suffix}`,
          ),
          type,
          recordedAt: placed ? atMinute(minute) : supplement.createdAt,
          timing: placed ? "planned" : "reconstructed",
          payload: body,
        });
    },
  );
  return events;
}
