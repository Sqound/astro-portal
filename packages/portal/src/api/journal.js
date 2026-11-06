import { createJournalRepository } from "../journal/journal-repository.js";
import {
  DEFAULT_PAGE_SIZE,
  JOURNAL_SEASONS,
  JOURNAL_STATES,
  MAX_PAGE_SIZE,
  decodeCursor,
} from "../journal/journal-list.js";

// "Session" here is always an OBSERVATION session; see the naming note at the
// top of persistence/observation-session-repository.js.

/** The stable application error for thin HTTP adapters (`body` is the v1 envelope). */
export class JournalError extends Error {
  constructor(code, message, { status = 400, ...details } = {}) {
    super(message);
    this.name = "JournalError";
    this.code = code;
    this.status = status;
    this.body = { error: { code, message }, ...details };
  }
}

const invalid = (message) => new JournalError("invalid_request", message);

const QUERY_PARAMETERS = [
  "year",
  "instrument",
  "season",
  "outcome",
  "multiNightOnly",
  "cursor",
  "limit",
];

/**
 * The query of `GET /v1/journal` (`journal.schema.json`, `query`), from a
 * `URLSearchParams` or a plain object: every parameter optional, a value
 * outside its values answers `400 invalid_request` and nothing else.
 */
export function validatedJournalQuery(input) {
  const params =
    input instanceof URLSearchParams
      ? input
      : new URLSearchParams(
          Object.entries(input ?? {})
            .filter(([, value]) => value !== undefined && value !== null)
            .map(([key, value]) => [key, String(value)]),
        );
  for (const key of params.keys())
    if (!QUERY_PARAMETERS.includes(key))
      throw invalid(`The parameter "${key}" is not one of the Journal's.`);
  const get = (key) => {
    const values = params.getAll(key);
    if (values.length > 1) throw invalid(`${key} is given more than once.`);
    return values[0];
  };
  const query = {};
  const year = get("year");
  if (year !== undefined) {
    if (!/^\d{4}$/.test(year) || Number(year) < 1900)
      throw invalid("year must be a calendar year between 1900 and 9999.");
    query.year = Number(year);
  }
  const instrument = get("instrument");
  if (instrument !== undefined) {
    if (!instrument) throw invalid("instrument must not be empty.");
    query.instrument = instrument;
  }
  const season = get("season");
  if (season !== undefined) {
    if (!JOURNAL_SEASONS.includes(season))
      throw invalid("season must be winter, spring, summer or autumn.");
    query.season = season;
  }
  const outcome = get("outcome");
  if (outcome !== undefined) {
    // One state, or several separated by commas (the outcomes a screen
    // ticks; additive, a single state reads as before).
    const states = outcome.split(",");
    if (!states.every((state) => JOURNAL_STATES.includes(state)))
      throw invalid(
        "outcome must be to_debrief, executed, partial, abandoned or no_plan, or several of them separated by commas.",
      );
    if (states.length === 1) query.outcome = states[0];
    else query.outcomes = [...new Set(states)];
  }
  const multiNightOnly = get("multiNightOnly");
  if (multiNightOnly !== undefined) {
    if (multiNightOnly !== "true" && multiNightOnly !== "false")
      throw invalid("multiNightOnly must be true or false.");
    if (multiNightOnly === "true") query.multiNightOnly = true;
  }
  const cursor = get("cursor");
  if (cursor !== undefined) {
    if (!cursor || !decodeCursor(cursor))
      throw invalid("cursor is not a cursor of this list.");
    query.cursor = cursor;
  }
  const limit = get("limit");
  query.limit = DEFAULT_PAGE_SIZE;
  if (limit !== undefined) {
    if (
      !/^\d+$/.test(limit) ||
      Number(limit) < 1 ||
      Number(limit) > MAX_PAGE_SIZE
    )
      throw invalid(`limit must be a whole number from 1 to ${MAX_PAGE_SIZE}.`);
    query.limit = Number(limit);
  }
  return query;
}

/**
 * Framework-free Journal service. A read, **never held by a right**: it takes
 * no entitlement provider and no capability, on any profile and in the
 * read-only window alike.
 *
 * - read({ tenantId, query, catalogueNights? }) -> `list`
 *   (`journal.schema.json`); `catalogueNights` is what a private server hands
 *   over (its operator catalogue's nights).
 * - statistics({ tenantId, query, held?, focus? }) -> `{ held, overview, targets,
 *   instruments }`, the statistics of the gallery (`journal-statistics.js`)
 * - targets({ tenantId, sessionId }) -> the session's `targets` | `null`
 * - catalogueSession({ tenantId, sessionId, catalogueNights }) -> the Journal
 *   line of a catalogue night of a private server (a read-only session) | `null`
 */
export async function createJournalService({
  repository = null,
  databasePath,
  databaseUrl,
  driver,
  dialect,
  now = () => new Date().toISOString(),
} = {}) {
  const store =
    repository ||
    (await createJournalRepository({
      databasePath,
      databaseUrl,
      driver,
      dialect,
    }));

  return {
    async close() {
      await store.close?.();
    },

    async read({ tenantId, query, catalogueNights = [] }) {
      const space = String(tenantId || "").trim();
      if (!space) throw invalid("Tenant id is required.");
      return await store.list({
        tenantId: space,
        query: validatedJournalQuery(query),
        catalogueNights,
        timestamp: now(),
      });
    },

    /**
     * The statistics of the gallery, for the filters of `query`; `held`
     * withholds the statistics by target and by instrument (the caller
     * read `gallery.private`).
     */
    async statistics({
      tenantId,
      query,
      catalogueNights = [],
      held = false,
      focus = {},
    }) {
      const space = String(tenantId || "").trim();
      if (!space) throw invalid("Tenant id is required.");
      return await store.statistics({
        tenantId: space,
        query: validatedJournalQuery(query),
        catalogueNights,
        held: Boolean(held),
        focus: {
          targetId: focus?.targetId || null,
          instrument: focus?.instrument || null,
        },
        timestamp: now(),
      });
    },

    async catalogueSession({ tenantId, sessionId, catalogueNights = [] }) {
      return await store.catalogueLine({
        tenantId: String(tenantId || "").trim(),
        sessionId,
        catalogueNights,
        timestamp: now(),
      });
    },

    async targets({ tenantId, sessionId }) {
      return (
        (await store.sessionTargets({ tenantId, sessionId }))?.targets ?? null
      );
    },
  };
}
