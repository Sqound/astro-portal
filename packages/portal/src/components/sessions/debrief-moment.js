// The debriefing as the first moment of a session, worked out without React:
// the rows of the targets (Faite / En partie / Non faite, the hours, the
// frames, the reason), the instants they make, and the request the answer
// sends. A row holds « HH:MM » and the day of its slot, in the zone of the
// place (the rule of the place without a zone is the last resort, UTC, which
// is also the default of every function here) — its `zone`.
import {
  debriefTimeZone,
  fromDateTimeLocalInputValue,
  toDateTimeLocalInputValue,
} from "./debrief-decision.js";

const MINUTE = 60_000;
const finite = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * « 20:40 » for an instant (epoch ms or ISO), in `zone` (UTC by default);
 * « » when unreadable.
 */
export function clockValue(instant, zone = "UTC") {
  const at = typeof instant === "string" ? Date.parse(instant) : instant;
  if (!Number.isFinite(at)) return "";
  const date = new Date(at);
  const inZone = debriefTimeZone(zone);
  if (inZone !== "UTC")
    return toDateTimeLocalInputValue(date.toISOString(), inZone).slice(11);
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

/**
 * The instant of `clock` (« HH:MM », in `zone`, UTC by default) on the day of
 * `base` in that zone, or the next one when it would fall before `notBefore`:
 * a night crosses midnight. `null` without a readable clock or a base.
 */
export function instantOfClock(clock, base, notBefore = null, zone = "UTC") {
  const match = /^(\d{2}):(\d{2})$/.exec(String(clock ?? ""));
  const baseAt = typeof base === "string" ? Date.parse(base) : base;
  if (!match || !Number.isFinite(baseAt)) return null;
  const inZone = debriefTimeZone(zone);
  const day = new Date(baseAt);
  let at;
  if (inZone === "UTC") {
    at = Date.UTC(
      day.getUTCFullYear(),
      day.getUTCMonth(),
      day.getUTCDate(),
      Number(match[1]),
      Number(match[2]),
    );
  } else {
    const wallDay = toDateTimeLocalInputValue(day.toISOString(), inZone).slice(
      0,
      10,
    );
    at = Date.parse(
      fromDateTimeLocalInputValue(`${wallDay}T${match[0]}`, inZone),
    );
    if (!Number.isFinite(at)) return null;
  }
  const floor =
    typeof notBefore === "string" ? Date.parse(notBefore) : notBefore;
  if (Number.isFinite(floor) && at < floor) at += 24 * 60 * MINUTE;
  // A start before the night's own start is the evening of the next day.
  if (Number.isFinite(baseAt) && at < baseAt - 12 * 60 * MINUTE)
    at += 24 * 60 * MINUTE;
  return at;
}

/** The slot of a plan item on the clock: `{ start, end }` in epoch ms, or null. */
export function planItemSlot(item, nightStartAt) {
  const night = Date.parse(nightStartAt);
  const start = finite(item?.startMinute);
  const end = finite(item?.endMinute);
  if (!Number.isFinite(night) || start === null || end === null) return null;
  return { start: night + start * MINUTE, end: night + end * MINUTE };
}

/**
 * The rows of the targets at the start of the moment: one per plan item —
 * `done` by default; with the journal of the night in hand, what it says
 * (`partial`, or `skipped` with its reason) and the hours it saw — and no
 * added target yet. `shooting` is `{ [itemId]: { frames, exposure } }`, what
 * the launch froze for each item (`prefilledShooting`). Those are a PROPOSAL
 * (`row.proposed`), never a declaration: the frames and the exposure of a row
 * start empty, and a planned value only becomes the person's by `takePlanned`
 * (« Reprendre le prévu ») or by typing -- the planned line pre-filled into
 * the form was counted as acquired.
 */
export function initialMomentRows({
  items = [],
  summary = null,
  nightStartAt,
  timeZone = "UTC",
  shooting = {},
}) {
  const entries = summary?.perTarget ?? [];
  return items.map((item) => {
    const entry = entries.find(
      (candidate) => candidate.planItemId && candidate.planItemId === item.id,
    );
    const slot = planItemSlot(item, nightStartAt);
    const passages = entry?.passages ?? [];
    const observedStart = passages[0]?.start ?? null;
    const observedEnd = passages[passages.length - 1]?.end ?? null;
    const skipped = entry?.outcome === "abandoned";
    return {
      key: item.id,
      itemId: item.id,
      targetId: item.targetId || item.id,
      kind: "planned",
      result: skipped
        ? "skipped"
        : entry?.outcome === "partial"
          ? "partial"
          : "done",
      removed: false,
      reason: skipped ? (entry.skipReason ?? "") : "",
      start: clockValue(observedStart ?? slot?.start, timeZone),
      end: clockValue(observedEnd ?? slot?.end, timeZone),
      frames: "",
      exposure: "",
      proposed: {
        frames: shooting[item.id]?.frames ?? "",
        exposure: shooting[item.id]?.exposure ?? "",
      },
      base: slot?.start ?? Date.parse(nightStartAt),
      zone: timeZone,
    };
  });
}

/**
 * The plan items the night left without time (« plus le
 * temps ce soir »), from the cards of the night as the debriefing reads it.
 */
export const noTimeItemsOf = (cards = []) =>
  new Set(
    cards
      .filter((card) => card.noTimeTonight && card.planItemId)
      .map((card) => card.planItemId),
  );

/**
 * A target the night left without time is not done and
 * « Manque de temps » is said for it — unless the person already said
 * another reason. Rows that are not concerned are returned as they are.
 */
export const presetNoTimeReasons = (rows, noTimeItems) =>
  rows.map((row) =>
    noTimeItems.has(row.itemId) && row.result === "skipped" && !row.reason
      ? { ...row, reason: "time" }
      : row,
  );

/** A row for a target the plan did not have. */
export function addedMomentRow({
  targetId,
  base,
  start = "",
  end = "",
  timeZone = "UTC",
}) {
  return {
    key: `added:${targetId}`,
    itemId: null,
    targetId,
    kind: "added",
    result: "done",
    removed: false,
    reason: "",
    start,
    end,
    frames: "",
    exposure: "",
    base: Number.isFinite(base) ? base : Number.NaN,
    zone: timeZone,
  };
}

/**
 * The rows with their hours read again in `zone`: the person chose the zone
 * of the place after the rows were drawn. Each hour is the same instant, written
 * in the new zone; a row whose hours cannot be read keeps them.
 */
export function momentRowsInZone(rows, zone) {
  return rows.map((row) => {
    const from = row.zone ?? "UTC";
    if (from === zone) return row;
    const { startedAt, finishedAt } = rowInstants(row);
    return {
      ...row,
      zone,
      start: startedAt ? clockValue(startedAt, zone) : row.start,
      end: finishedAt ? clockValue(finishedAt, zone) : row.end,
    };
  });
}

const framesOf = (value) => {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return undefined;
  const count = Number(text);
  return Number.isSafeInteger(count) ? count : undefined;
};

/** An exposure typed by the person: a number of seconds above 0, a day at most. */
const exposureOf = (value) => {
  const text = String(value ?? "")
    .trim()
    .replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(text)) return undefined;
  const seconds = Number(text);
  return seconds > 0 && seconds <= 86_400 ? seconds : undefined;
};

/** The instants a row's hours make, `{ startedAt, finishedAt }` in ISO (each only when readable). */
export function rowInstants(row) {
  const zone = row.zone ?? "UTC";
  const start = instantOfClock(row.start, row.base, null, zone);
  const end = instantOfClock(row.end, row.base, start, zone);
  return {
    ...(start !== null ? { startedAt: new Date(start).toISOString() } : {}),
    ...(end !== null && (start === null || end > start)
      ? { finishedAt: new Date(end).toISOString() }
      : {}),
  };
}

/**
 * The planned figures a row still proposes, `{ frames, exposure }`
 * (strings, `""` = nothing proposed), or `null` when the person has already
 * said the same (or there is nothing to propose, or the night is at the
 * eyepiece: `visual`).
 */
export function pendingProposal(row, { visual = false } = {}) {
  if (visual || row.kind !== "planned" || row.removed) return null;
  if (row.result === "skipped") return null;
  const proposed = row.proposed ?? {};
  const frames = String(proposed.frames ?? "");
  const exposure = String(proposed.exposure ?? "");
  const framesOpen = frames !== "" && String(row.frames ?? "") !== frames;
  const exposureOpen =
    exposure !== "" && String(row.exposure ?? "") !== exposure;
  return framesOpen || exposureOpen ? { frames, exposure } : null;
}

/** The row once the person took the planned figures as their own. */
export function takePlanned(row) {
  const proposed = row.proposed ?? {};
  return {
    ...row,
    ...(String(proposed.frames ?? "") !== ""
      ? { frames: String(proposed.frames) }
      : {}),
    ...(String(proposed.exposure ?? "") !== ""
      ? { exposure: String(proposed.exposure) }
      : {}),
  };
}

/**
 * The rows as the request reads them: `targetRows` (the plan items, as
 * `targetAdjustmentsFromChecklist` takes them) and `addedRows` (`addedTargets`).
 */
export function momentRowsToDecision(rows) {
  const targetRows = [];
  const addedRows = [];
  for (const row of rows) {
    const frameCount = framesOf(row.frames);
    const exposureSeconds = exposureOf(row.exposure);
    if (row.kind === "added") {
      addedRows.push({
        targetId: row.targetId,
        ...rowInstants(row),
        ...(frameCount !== undefined ? { frameCount } : {}),
      });
      continue;
    }
    const observed = row.result !== "skipped" && !row.removed;
    targetRows.push({
      targetId: row.itemId,
      checked: observed,
      partial: row.result === "partial",
      reason: observed ? "" : row.reason,
      removed: row.removed,
      ...(observed ? rowInstants(row) : {}),
      ...(observed && frameCount !== undefined ? { frameCount } : {}),
      ...(observed && exposureSeconds !== undefined ? { exposureSeconds } : {}),
    });
  }
  return { targetRows, addedRows };
}
