// The "Cibles" field of the page of a night on the web: an autocomplete over
// the catalogue rather than a search that blocks the page, presented with
// target labels (preview, name, constellation…) and a limited number of
// results.
//
// The search is the framing editor's own (`framing-target-search.js`: the
// compact catalogue index, the catalogue's writing of a designation, the
// planner's ranking, the 220 ms pause); what is here is what the field adds,
// free of any framework so it can be tested without rendering anything: eight
// answers at most, the label of a row (preview, designation and name, "type ·
// constellation"), the space's own targets ahead of the catalogue's, the state
// the field is in (nothing typed, waiting, waiting for long, nothing found,
// unavailable) and the walk of the keyboard. The trace of the freeze: the page
// never froze, the request waited for the catalogue's first synchronisation
// with nothing on screen; every state below says what the field is doing
// instead.

import { normalizeSearch } from "portal/i18n.js";
import {
  decodeTargetIndex,
  framingSearchDelayMs,
  framingSearchLabel,
  framingSearchPath,
  framingSearchQueryReady,
  rankFramingSearchResults,
} from "./framing-target-search.js";

/** Rows the list shows, the space's own targets included. */
export const nightTargetsLimit = 8;

/** Of those rows, at most this many are the space's own targets. */
export const nightTargetsPersonalLimit = 3;

/** The pause between two letters (the framing search's). */
export const nightTargetsDelayMs = framingSearchDelayMs;

/** After this long without an answer the field says the catalogue is being prepared. */
export const nightTargetsSlowAfterMs = 3000;

export const nightTargetsQueryReady = framingSearchQueryReady;

/** The request: the compact index, the catalogue's own order, eight answers. */
export function nightTargetsPath({ locale = "en", query = "" } = {}) {
  return framingSearchPath({ locale, query, limit: nightTargetsLimit });
}

const kindOf = (parts) => parts.filter(Boolean).join(" · ");

/**
 * What a row of the list says of a catalogue target, from a decoded row of
 * the index: the designation and the common name, "type · constellation",
 * the preview. No identifier ever reaches the screen.
 */
export function nightTargetEntry(row) {
  return {
    id: row.id,
    designation: row.designation,
    name: row.name || null,
    label: framingSearchLabel(row),
    kind: kindOf([row.typeLabel, row.constellationLabel]),
    typeKey: row.typeKey ?? null,
    photoUrl: row.photoUrl || null,
    aliases: row.aliases || [],
    personal: false,
  };
}

/**
 * The answer of `GET /v1/target-index` as the list reads it: the planner's
 * ranking applied to what was typed ("ngc 70" puts NGC 70 first, not the
 * clusters whose alias begins that way), `total` the size of the whole
 * matching set.
 */
export function nightTargetsAnswer(document, query, locale = "en") {
  const { total, targets } = decodeTargetIndex(document);
  return {
    total,
    entries: rankFramingSearchResults(targets, query, locale).map(
      nightTargetEntry,
    ),
  };
}

/** The personal targets of `GET /v1/targets/personal`, newest first as sent. */
export function decodePersonalTargets(document) {
  return (Array.isArray(document?.targets) ? document.targets : [])
    .filter((target) => target?.id && typeof target.name === "string")
    .map((target) => ({
      id: target.id,
      name: target.name,
      placeName: target.placeName || null,
    }));
}

/**
 * The space's own targets that the query names (all of them, newest first,
 * while nothing is typed), at most [limit], as rows of the list. They carry
 * no preview: the pictogram of the star stands in.
 */
export function personalNightEntries(
  personal,
  query,
  locale = "en",
  limit = nightTargetsPersonalLimit,
) {
  const needle = normalizeSearch(String(query ?? ""), locale).trim();
  return (personal || [])
    .filter(
      (target) =>
        !needle || normalizeSearch(target.name, locale).includes(needle),
    )
    .slice(0, limit)
    .map((target) => ({
      id: target.id,
      designation: target.name,
      name: null,
      label: target.name,
      kind: target.placeName || "",
      typeKey: null,
      photoUrl: null,
      aliases: [],
      personal: true,
    }));
}

/**
 * The rows the list shows: the space's own targets first, then the
 * catalogue's, never a target already on the night, [limit] rows at most.
 */
export function nightTargetsRows({
  personal = [],
  catalogue = [],
  excludeIds = [],
  limit = nightTargetsLimit,
} = {}) {
  const taken = new Set(excludeIds);
  return [...personal, ...catalogue]
    .filter((entry) => !taken.has(entry.id))
    .slice(0, limit);
}

/**
 * What the field is doing, for its status line and its list:
 * `hint` (nothing typed), `loading`, `slow` (waiting longer than
 * [nightTargetsSlowAfterMs]: the catalogue is being prepared), `error`
 * (the search did not answer), `empty` (no target of the catalogue matches
 * and none of the space's), `more` (the catalogue holds more than the list
 * shows), `ready`. A row of the space's own is still listed in `loading`,
 * `error` and `empty`.
 */
export function nightTargetsState({ query, answer, rowCount = 0 }) {
  if (!nightTargetsQueryReady(query)) return "hint";
  const current = answer?.query === String(query).trim();
  if (answer?.status === "error") return "error";
  if (answer?.status === "loading" || !current)
    return answer?.slow ? "slow" : "loading";
  if (rowCount === 0) return "empty";
  return answer.total > (answer.entries?.length ?? 0) ? "more" : "ready";
}

/**
 * The row the keyboard stands on after [key]: ArrowDown walks down the list,
 * ArrowUp walks back up and from the first row returns to the field (-1).
 */
export function nextActiveIndex(current, key, length) {
  if (!length) return -1;
  if (key === "ArrowDown") return Math.min(length - 1, current + 1);
  if (key === "ArrowUp") return Math.max(-1, current - 1);
  return current;
}

// ——— "Créer un cadrage sur la carte…" ———
// The framing editor is the planner's: the night's last row leads there and
// the framing comes back to the night with its target.

/** Where the row leads: the planner's framing editor, open on a new framing, for this night. */
export function nightFramingHref({ locale = "en", sessionId }) {
  return `/${locale}/planner?${new URLSearchParams({
    view: "framings",
    new: "1",
    night: sessionId,
  })}`;
}

/** The night a framing is being made for, read from the planner's address, or null. */
export function nightFramingRequest(search) {
  const parameters = new URLSearchParams(search ?? "");
  const sessionId = parameters.get("night");
  return parameters.get("new") === "1" && sessionId ? { sessionId } : null;
}

/** The key under which the night's page finds what the framing did, once. */
export const nightFramingNoticeKey = (sessionId) =>
  `astro-night-framing:${sessionId}`;

/** The night's own address, where the framing returns. */
export const nightPagePath = ({ locale = "en", sessionId }) =>
  `/${locale}/sessions/${encodeURIComponent(sessionId)}`;

/**
 * What a framing made for a night adds to it: the catalogue target it frames
 * (`payload.catalogueTargetId`, the first object the creation recognised under
 * the frame), once. A framing centred on no known object adds nothing, and the
 * night says so. `targetIds` is the night's list as it stands.
 */
export function nightTargetIdsWithFraming(targetIds, catalogueTargetId) {
  const current = Array.isArray(targetIds) ? targetIds : [];
  if (!catalogueTargetId) return { targetIds: current, added: false };
  if (current.includes(catalogueTargetId))
    return { targetIds: current, added: false };
  return { targetIds: [...current, catalogueTargetId], added: true };
}
